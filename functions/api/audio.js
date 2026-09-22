const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const AUDIO_TYPE = 'audio/mpeg';
const SCHEMA_VERSION = 'lpx-listening-record/0.1';

const LISTENING_PROMPT = `Listen to this MP3 as source material for a musician's creative conversation. Return JSON only. Report sound, not an imagined visual treatment or artist intent. Timestamps are approximate perceptual locations, never exact synchronization points. Separate audible observation from interpretation. Do not claim mechanisms such as sidechain compression, oscillator type, plugin, hardware, or processing chain unless directly established by sound; describe the audible result instead.\n\nReturn this exact shape: {"timeline":[{"start":"M:SS","end":"M:SS or empty","label":"optional concise label","observation":"audible fact","change":"what changed from preceding material","energy":"concise audible energy/density behavior","confidence":"high|medium|low"}],"musical_development":["compact audible observation"],"texture":["compact audible observation"],"significant_events":[{"time":"M:SS","event":"audible event","change":"why it differs from preceding material","confidence":"high|medium|low"}],"beginning":"how it establishes itself","final_minute":"development in the final minute, or empty if not applicable","final_thirty_seconds":"behavior in final 30 seconds, or empty if not applicable","ending":"fade, cut, resolution, decay, or continuation","observations":["high-confidence audible fact"],"interpretations":["clearly provisional possible reading"],"uncertainties":["what audio alone does not establish"]}. Include meaningful beginning-to-end coverage. Keep every field compact.`;

function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } }); }
function clean(value, limit = 1000) { return typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : null; }
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
  if (!context.env.GEMINI_API_KEY) return json({ error: 'Recording listening is not configured yet. Please try again after the site administrator adds its server-side key.' }, 503);
  let data; try { data = await context.request.json(); } catch { return json({ error: 'The recording could not be read. Please try again.' }, 400); }
  if (!data || !clean(data.name, 200) || typeof data.note !== 'string' || data.note.length > 1000 || !/^[a-f0-9]{64}$/i.test(data.contentHash || '')) return json({ error: 'The recording details are not valid. Please try again.' }, 400);
  const audio = parseDataUrl(data.dataUrl); if (!audio) return json({ error: 'Choose a non-empty MP3 under 12 MB.' }, 400);
  const controller = new AbortController(); let timedOut = false; const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 300000);
  let upstream;
  try {
    upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.env.GEMINI_API_KEY}` }, body: JSON.stringify({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: [{ type: 'text', text: LISTENING_PROMPT + (data.note.trim() ? `\n\nArtist-provided context (authoritative; do not treat it as audio evidence): ${data.note.trim()}` : '') }, { type: 'input_audio', input_audio: { data: audio.base64, format: 'mp3' } }] }] }) });
  } catch { return json({ error: timedOut ? 'Listening took too long. Your conversation is still here; please retry the recording.' : 'The recording service could not be reached just now. Your conversation is still here; please retry the recording.' }, timedOut ? 504 : 502); } finally { clearTimeout(timeout); }
  if (!upstream.ok) return json({ error: upstream.status === 401 || upstream.status === 403 ? 'Recording listening is not configured correctly yet.' : 'The recording could not be heard just now. Your conversation is still here; please retry.' }, upstream.status === 401 || upstream.status === 403 ? 503 : 502);
  let body; try { body = await upstream.json(); } catch { return json({ error: 'The recording returned an unreadable listening result. Please retry.' }, 502); }
  let parsed; try { parsed = JSON.parse(body?.choices?.[0]?.message?.content || ''); } catch { return json({ error: 'The recording returned an incomplete listening result. Please retry.' }, 502); }
  const record = validateRecord(parsed); if (!record) return json({ error: 'The recording returned an incomplete listening result. Please retry.' }, 502);
  return json({ record: { ...record, source: { display_name: data.name.trim(), content_hash: data.contentHash.toLowerCase(), duration: clean(data.duration || '', 40) || '', analysis_provider: 'Gemini', analysis_model: body.model || 'gemini-3.8-flash' }, provenance: { usage: body.usage || null } } });
}
