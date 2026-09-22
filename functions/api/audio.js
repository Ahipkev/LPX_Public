const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const AUDIO_TYPE = 'audio/mpeg';
const SCHEMA_VERSION = 'lpx-listening-record/0.1';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-3.8-flash';

const LISTENING_PROMPT = `Listen to this MP3 as source material for a musician's creative conversation. Return JSON only. Report sound, not an imagined visual treatment or artist intent. Timestamps are approximate perceptual locations, never exact synchronization points. Separate audible observation from interpretation. Do not claim mechanisms such as sidechain compression, oscillator type, plugin, hardware, or processing chain unless directly established by sound; describe the audible result instead.\n\nReturn this exact shape: {"timeline":[{"start":"M:SS","end":"M:SS or empty","label":"optional concise label","observation":"audible fact","change":"what changed from preceding material","energy":"concise audible energy/density behavior","confidence":"high|medium|low"}],"musical_development":["compact audible observation"],"texture":["compact audible observation"],"significant_events":[{"time":"M:SS","event":"audible event","change":"why it differs from preceding material","confidence":"high|medium|low"}],"beginning":"how it establishes itself","final_minute":"development in the final minute, or empty if not applicable","final_thirty_seconds":"behavior in final 30 seconds, or empty if not applicable","ending":"fade, cut, resolution, decay, or continuation","observations":["high-confidence audible fact"],"interpretations":["clearly provisional possible reading"],"uncertainties":["what audio alone does not establish"]}. Include meaningful beginning-to-end coverage. Keep every field compact.`;

function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } }); }
function clean(value, limit = 1000) { return typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : null; }
function safeFetchDiagnostic(value, kind) {
  if (typeof value !== 'string') return '[suppressed]';
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (!normalized || normalized.length > 240) return '[suppressed]';
  if (kind === 'name') return /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(normalized) ? normalized : '[suppressed]';
  return /(?:authorization|bearer|api[ _-]?key|secret|token|headers?|request[ _-]?(?:body|headers?)|data:audio|base64|AIza|\bsk-[A-Za-z0-9_-]+)/i.test(normalized) ? '[suppressed]' : normalized;
}
function safeStatus(value) { return Number.isInteger(value) && value >= 100 && value <= 599 ? String(value) : 'none'; }
function logStageFailure(stage, response, error) {
  console.log(`LPX_AUDIO_STAGE_FAILURE stage=${stage} status=${safeStatus(response?.status)} name=${safeFetchDiagnostic(error?.name, 'name')} message=${safeFetchDiagnostic(error?.message, 'message')}`);
}
async function logUploadInitProviderFailure(response) {
  let providerCode = 'none';
  let providerStatus = '[suppressed]';
  let providerMessage = '[suppressed]';
  try {
    const error = (await response.json())?.error;
    providerCode = safeStatus(error?.code);
    providerStatus = safeFetchDiagnostic(error?.status, 'name');
    providerMessage = safeFetchDiagnostic(error?.message, 'message');
  } catch {}
  console.log(`LPX_AUDIO_STAGE_FAILURE stage=upload_init status=${safeStatus(response?.status)} name=[suppressed] message=[suppressed] provider_code=${providerCode} provider_status=${providerStatus} provider_message=${providerMessage}`);
}
function geminiHeaders(apiKey) { return { 'x-goog-api-key': apiKey }; }
function providerError(response) { return json({ error: response.status === 401 || response.status === 403 ? 'Recording listening is not configured correctly yet.' : 'The recording could not be heard just now. Your conversation is still here; please retry.' }, response.status === 401 || response.status === 403 ? 503 : 502); }
function audioBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function fileUrl(name) { return `${GEMINI_API_BASE}/v1beta/${name.split('/').map(encodeURIComponent).join('/')}`; }
function fileIsUsable(file) { return !file?.state || file.state === 'ACTIVE'; }
function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => { clearTimeout(timeout); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}
async function waitForFile(file, apiKey, signal) {
  let current = file;
  while (!fileIsUsable(current)) {
    if (current?.state === 'FAILED') return null;
    await wait(1000, signal);
    const response = await fetch(fileUrl(current?.name || ''), { headers: geminiHeaders(apiKey), signal });
    if (!response.ok) return { response };
    const body = await response.json();
    current = body;
  }
  return current;
}
async function deleteTemporaryFile(name, apiKey, signal) {
  try {
    const response = await fetch(fileUrl(name), { method: 'DELETE', headers: geminiHeaders(apiKey), signal });
    if (!response.ok && !signal.aborted) logStageFailure('cleanup', response);
  } catch (error) {
    if (!signal.aborted) logStageFailure('cleanup', null, error);
  }
}
function validTime(value) { return typeof value === 'string' && (value === '' || /^\d{1,2}:\d{2}$/.test(value)); }
function textList(value, max, limit = 1000) { return Array.isArray(value) && value.length <= max && value.every(item => clean(item, limit)); }
function parseDataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:audio\/(?:mpeg|mp3);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return null;
  const bytes = Math.floor(match[1].length * 3 / 4) - (match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0);
  return bytes > 0 && bytes <= MAX_AUDIO_BYTES ? { base64: match[1], bytes } : null;
}
function validateRecord(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.timeline) || value.timeline.length < 3 || value.timeline.length > 30 || !textList(value.musical_development, 16) || !textList(value.texture, 16) || !Array.isArray(value.significant_events) || value.significant_events.length < 3 || value.significant_events.length > 12 || !textList(value.observations, 20) || !textList(value.interpretations, 16) || !textList(value.uncertainties, 16)) return null;
  const timeline = value.timeline.map(item => item && validTime(item.start) && validTime(item.end) && clean(item.observation) && clean(item.change) && clean(item.energy, 500) && ['high', 'medium', 'low'].includes(item.confidence) ? { start: item.start, end: item.end || '', label: clean(item.label || '', 200) || '', observation: item.observation.trim(), change: item.change.trim(), energy: item.energy.trim(), confidence: item.confidence } : null);
  const events = value.significant_events.map(item => item && validTime(item.time) && clean(item.event) && clean(item.change) && ['high', 'medium', 'low'].includes(item.confidence) ? { time: item.time, event: item.event.trim(), change: item.change.trim(), confidence: item.confidence } : null);
  if (timeline.some(item => !item) || events.some(item => !item) || !clean(value.beginning) || !clean(value.ending) || (value.final_minute !== '' && !clean(value.final_minute)) || (value.final_thirty_seconds !== '' && !clean(value.final_thirty_seconds))) return null;
  return { schema: SCHEMA_VERSION, timeline, musical_development: value.musical_development.map(x => x.trim()), texture: value.texture.map(x => x.trim()), significant_events: events, beginning: value.beginning.trim(), final_minute: (value.final_minute || '').trim(), final_thirty_seconds: (value.final_thirty_seconds || '').trim(), ending: value.ending.trim(), observations: value.observations.map(x => x.trim()), interpretations: value.interpretations.map(x => x.trim()), uncertainties: value.uncertainties.map(x => x.trim()) };
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!context.request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({ error: 'Send a JSON request.' }, 415);
  if (!context.env.LPX_GEMINI_PRODUCTION_KEY) return json({ error: 'Recording listening is not configured yet. Please try again after the site administrator adds its server-side key.' }, 503);
  let data; try { data = await context.request.json(); } catch { return json({ error: 'The recording could not be read. Please try again.' }, 400); }
  if (!data || !clean(data.name, 200) || typeof data.note !== 'string' || data.note.length > 1000 || !/^[a-f0-9]{64}$/i.test(data.contentHash || '')) return json({ error: 'The recording details are not valid. Please try again.' }, 400);
  const audio = parseDataUrl(data.dataUrl); if (!audio) return json({ error: 'Choose a non-empty MP3 under 12 MB.' }, 400);
  const controller = new AbortController(); let timedOut = false; const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 300000);
  let temporaryFileName = null;
  let stage = 'upload_init';
  try {
    const bytes = audioBytes(audio.base64);
    const uploadStart = await fetch(`${GEMINI_API_BASE}/upload/v1beta/files`, { method: 'POST', signal: controller.signal, headers: { ...geminiHeaders(context.env.LPX_GEMINI_PRODUCTION_KEY), 'Content-Type': 'application/json', 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(audio.bytes), 'X-Goog-Upload-Header-Content-Type': AUDIO_TYPE }, body: JSON.stringify({ file: { display_name: 'LPX temporary audio' } }) });
    if (!uploadStart.ok) { await logUploadInitProviderFailure(uploadStart); return providerError(uploadStart); }
    const uploadUrl = uploadStart.headers.get('x-goog-upload-url');
    if (!uploadUrl || !uploadUrl.startsWith('https://')) { logStageFailure(stage); return json({ error: 'The recording could not be heard just now. Your conversation is still here; please retry.' }, 502); }
    stage = 'upload_bytes';
    const upload = await fetch(uploadUrl, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': AUDIO_TYPE, 'Content-Length': String(audio.bytes), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: bytes });
    if (!upload.ok) { logStageFailure(stage, upload); return providerError(upload); }
    const uploaded = await upload.json();
    const file = uploaded?.file;
    if (!file?.name || !file?.uri) { logStageFailure(stage); return json({ error: 'The recording returned an incomplete listening result. Please retry.' }, 502); }
    temporaryFileName = file.name;
    stage = 'file_processing';
    const usableFile = await waitForFile(file, context.env.LPX_GEMINI_PRODUCTION_KEY, controller.signal);
    if (usableFile?.response) { logStageFailure(stage, usableFile.response); return providerError(usableFile.response); }
    if (!usableFile?.uri) { logStageFailure(stage); return json({ error: 'The recording returned an incomplete listening result. Please retry.' }, 502); }
    stage = 'generate_content';
    const upstream = await fetch(`${GEMINI_API_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent`, { method: 'POST', signal: controller.signal, headers: { ...geminiHeaders(context.env.LPX_GEMINI_PRODUCTION_KEY), 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: LISTENING_PROMPT + (data.note.trim() ? `\n\nArtist-provided context (authoritative; do not treat it as audio evidence): ${data.note.trim()}` : '') }, { file_data: { mime_type: usableFile.mimeType || AUDIO_TYPE, file_uri: usableFile.uri } }] }] }) });
    if (!upstream.ok) { logStageFailure(stage, upstream); return providerError(upstream); }
    let body; try { body = await upstream.json(); } catch (error) { logStageFailure(stage, null, error); return json({ error: 'The recording returned an unreadable listening result. Please retry.' }, 502); }
    const responseText = body?.candidates?.[0]?.content?.parts?.map(part => typeof part?.text === 'string' ? part.text : '').join('\n') || '';
    stage = 'listening_record_validation';
    let parsed; try { parsed = JSON.parse(responseText); } catch (error) { logStageFailure(stage, null, error); return json({ error: 'The recording returned an incomplete listening result. Please retry.' }, 502); }
    const record = validateRecord(parsed); if (!record) { logStageFailure(stage); return json({ error: 'The recording returned an incomplete listening result. Please retry.' }, 502); }
    return json({ record: { ...record, source: { display_name: data.name.trim(), content_hash: data.contentHash.toLowerCase(), duration: clean(data.duration || '', 40) || '', analysis_provider: 'Gemini', analysis_model: body.modelVersion || GEMINI_MODEL }, provenance: { usage: body.usageMetadata || null } } });
  } catch (error) {
    if (!timedOut) logStageFailure(stage, null, error);
    return json({ error: timedOut ? 'Listening took too long. Your conversation is still here; please retry the recording.' : 'The recording service could not be reached just now. Your conversation is still here; please retry the recording.' }, timedOut ? 504 : 502);
  } finally {
    if (temporaryFileName) await deleteTemporaryFile(temporaryFileName, context.env.LPX_GEMINI_PRODUCTION_KEY, controller.signal);
    clearTimeout(timeout);
  }
}
