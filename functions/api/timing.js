const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_LYRIC_CHARS = 16000;
const MAX_LYRIC_PHRASES = 160;
// Ordered lyric phrases can overlap in a performance, so this permits a
// generous overlap while rejecting a later phrase that jumps far backward.
const MAX_LYRIC_START_REGRESSION_MS = 30000;
const AUDIO_TYPE = 'audio/mpeg';
const EVENT_MAP_SCHEMA = 'lpx-audio-event-map/0.2';
const LYRIC_MAP_SCHEMA = 'lpx-lyric-timing-map/0.2';
const ANALYSIS_TYPE = 'production-timing';
const ANALYSIS_VERSION = '0.2';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-3.8-flash';
const EVENT_KINDS = ['audio_beginning', 'musical_entrance', 'instrumental_entrance', 'vocal_entrance', 'spoken_passage', 'motif_appearance', 'texture_change', 'density_change', 'rhythm_change', 'structural_transition', 'breakdown', 'impact', 'silence', 'climax', 'outro', 'ending', 'other'];
const TIMING_STATES = ['known', 'unknown'];
const CONFIDENCE = ['high', 'medium', 'low'];

// This is deliberately shallow: Gemini structured output is constrained, while
// LPX remains responsible for validation and source/provenance attachment.
export const TIMING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: EVENT_KINDS },
          timing_state: { type: 'string', enum: TIMING_STATES },
          start_ms: { type: ['integer', 'null'] },
          end_ms: { type: ['integer', 'null'] },
          confidence: { type: 'string', enum: CONFIDENCE },
          observable: { type: 'string' },
          interpretation: { type: 'string' }
        },
        required: ['id', 'kind', 'timing_state', 'start_ms', 'end_ms', 'confidence', 'observable', 'interpretation']
      }
    },
    lyric_phrases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          timing_state: { type: 'string', enum: TIMING_STATES },
          start_ms: { type: ['integer', 'null'] },
          end_ms: { type: ['integer', 'null'] },
          confidence: { type: 'string', enum: CONFIDENCE },
          note: { type: 'string' }
        },
        required: ['id', 'text', 'timing_state', 'start_ms', 'end_ms', 'confidence', 'note']
      }
    }
  },
  required: ['events', 'lyric_phrases']
};

export const TIMING_PROMPT = `Perform LPX Production Timing Analysis on the actual supplied MP3 and the authoritative artist-supplied lyric phrases below. Return JSON only, matching the required schema.

This is timing evidence, not a visual-production plan. Listen to the audio. Do not decide what an LPX should display.

For events: first state direct observable audible evidence in observable: what changes, enters, drops away, returns, becomes denser, becomes sparse, or otherwise becomes audible. Only then use interpretation for an optional conservative musical classification; leave interpretation empty when a conventional label is not clearly supported. Do not call something a verse, chorus, breakdown, guitar solo, or riff merely because it is plausible. If a motif first appears in one texture or instrumentation and later returns in a substantially fuller or different arrangement, preserve both meaningful appearances as separate events. Identify as many meaningful, production-useful audible events as the recording establishes. Do not target a fixed count. Use only event kinds supplied by the schema, choosing a broad neutral kind when classification is uncertain.

Every timing point produced from this listening pass is approximate model-observed evidence, never measured or sample-accurate. Numeric milliseconds are storage values, not a claim of clock precision. Set timing_state to "known" only when the audio grounds a location. For unknown timing, set start_ms and end_ms to null. Never derive a time from lyrics, track duration, expected structure, or plausible intervals.

For lyric_phrases: return every supplied phrase exactly once, in the supplied order, with the exact supplied id and text. Locate it only where the actual performance supports the alignment. Do not rewrite, correct, omit, merge, split, or reorder lyrics. For an unlocatable phrase, set timing_state to "unknown" and all timing values to null. A note may state a brief audio-versus-source mismatch, but must not alter the artist-supplied text. Do not interpolate unknown timings.

Artist-supplied lyric phrases:
`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } });
}

function clean(value, limit = 1000) {
  return typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : null;
}

function safeDiagnostic(value, kind) {
  if (typeof value !== 'string') return '[suppressed]';
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (!normalized || normalized.length > 240) return '[suppressed]';
  if (kind === 'name') return /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(normalized) ? normalized : '[suppressed]';
  return /(?:authorization|bearer|api[ _-]?key|secret|token|headers?|request[ _-]?(?:body|headers?)|data:audio|base64|AIza|\bsk-[A-Za-z0-9_-]+)/i.test(normalized) ? '[suppressed]' : normalized;
}

function safeStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? String(value) : 'none';
}

function logTimingFailure(stage, response, error) {
  console.log(`LPX_TIMING_FAILURE stage=${stage} status=${safeStatus(response?.status)} name=${safeDiagnostic(error?.name, 'name')} message=${safeDiagnostic(error?.message, 'message')}`);
}

function providerError(response) {
  return json({ error: response.status === 401 || response.status === 403 ? 'Production Timing Analysis is not configured correctly yet.' : 'Production Timing Analysis could not be completed just now. Your project remains unchanged; please retry.' }, response.status === 401 || response.status === 403 ? 503 : 502);
}

function geminiHeaders(apiKey) { return { 'x-goog-api-key': apiKey }; }

function audioBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parseDataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:audio\/(?:mpeg|mp3);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return null;
  const bytes = Math.floor(match[1].length * 3 / 4) - (match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0);
  return bytes > 0 && bytes <= MAX_AUDIO_BYTES ? { base64: match[1], bytes } : null;
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
    current = await response.json();
  }
  return current;
}

async function deleteTemporaryFile(name, apiKey, signal) {
  try {
    const response = await fetch(fileUrl(name), { method: 'DELETE', headers: geminiHeaders(apiKey), signal });
    if (!response.ok && !signal.aborted) logTimingFailure('cleanup', response);
  } catch (error) {
    if (!signal.aborted) logTimingFailure('cleanup', null, error);
  }
}

function reportedDurationMs(value) {
  if (!Number.isInteger(value) || value <= 0 || value > 24 * 60 * 60 * 1000) return null;
  return value;
}

export function lyricPhrases(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_LYRIC_CHARS) return null;
  const lines = value.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(line => line && !/^\[[^\]]{1,120}\]$/.test(line));
  if (!lines.length || lines.length > MAX_LYRIC_PHRASES || lines.some(line => line.length > 500)) return null;
  return lines.map((text, index) => ({ id: `phrase-${String(index + 1).padStart(3, '0')}`, text }));
}

function validId(value, prefix) { return typeof value === 'string' && new RegExp(`^${prefix}-[a-z0-9-]{1,56}$`).test(value); }
function validNullableInteger(value) { return value === null || (Number.isInteger(value) && value >= 0); }
function validKnownTiming(value, durationMs) {
  if (value.timing_state === 'unknown') return value.start_ms === null && value.end_ms === null;
  if (value.timing_state !== 'known' || !Number.isInteger(value.start_ms)) return false;
  if (value.end_ms !== null && (!Number.isInteger(value.end_ms) || value.end_ms < value.start_ms)) return false;
  const finalTime = value.end_ms === null ? value.start_ms : value.end_ms;
  return durationMs === null || finalTime <= durationMs + 2000;
}

function validateEvents(events, durationMs) {
  if (!Array.isArray(events) || events.length < 4 || events.length > 80) return null;
  const ids = new Set();
  const sanitized = events.map(event => {
    if (!event || !validId(event.id, 'event') || ids.has(event.id) || !EVENT_KINDS.includes(event.kind) || !TIMING_STATES.includes(event.timing_state) || !validNullableInteger(event.start_ms) || !validNullableInteger(event.end_ms) || !CONFIDENCE.includes(event.confidence) || !clean(event.observable, 600) || typeof event.interpretation !== 'string' || event.interpretation.length > 400 || !validKnownTiming(event, durationMs)) return null;
    ids.add(event.id);
    return { id: event.id, kind: event.kind, timing_state: event.timing_state, start_ms: event.start_ms, end_ms: event.end_ms, confidence: event.confidence, provenance: 'model_observed', precision: event.timing_state === 'known' ? 'approximate' : 'unknown', observable: event.observable.trim(), interpretation: event.interpretation.trim() };
  });
  return sanitized.some(event => !event) || !sanitized.some(event => event.timing_state === 'known') ? null : sanitized;
}

function validatePhrases(phrases, sourcePhrases, durationMs) {
  if (!Array.isArray(phrases) || phrases.length !== sourcePhrases.length) return null;
  const sanitized = phrases.map((phrase, index) => {
    const source = sourcePhrases[index];
    if (!phrase || phrase.id !== source.id || phrase.text !== source.text || !TIMING_STATES.includes(phrase.timing_state) || !validNullableInteger(phrase.start_ms) || !validNullableInteger(phrase.end_ms) || !CONFIDENCE.includes(phrase.confidence) || typeof phrase.note !== 'string' || phrase.note.length > 600 || !validKnownTiming(phrase, durationMs)) return null;
    return { id: source.id, text: source.text, timing_state: phrase.timing_state, start_ms: phrase.start_ms, end_ms: phrase.end_ms, confidence: phrase.confidence, provenance: 'model_observed', precision: phrase.timing_state === 'known' ? 'approximate' : 'unknown', note: phrase.note.trim() };
  });
  if (sanitized.some(phrase => !phrase)) return null;
  let lastKnownStart = null;
  for (const phrase of sanitized) {
    if (phrase.timing_state === 'unknown') continue;
    if (lastKnownStart !== null && phrase.start_ms + MAX_LYRIC_START_REGRESSION_MS < lastKnownStart) return null;
    lastKnownStart = phrase.start_ms;
  }
  return sanitized;
}

export function validateProductionTiming(value, source) {
  const durationMs = reportedDurationMs(source?.duration_ms);
  const sourcePhrases = Array.isArray(source?.lyric_phrases) ? source.lyric_phrases : null;
  if (!value || typeof value !== 'object' || !sourcePhrases?.length) return null;
  const events = validateEvents(value.events, durationMs);
  const phrases = validatePhrases(value.lyric_phrases, sourcePhrases, durationMs);
  if (!events || !phrases) return null;
  const sharedSource = {
    display_name: source.display_name,
    content_hash: source.content_hash,
    mime_type: AUDIO_TYPE,
    byte_size: source.byte_size,
    duration_ms: durationMs,
    duration_precision: durationMs === null ? 'unknown' : 'browser_reported'
  };
  const created = { analysis_type: ANALYSIS_TYPE, analysis_version: ANALYSIS_VERSION, provider: 'Gemini', model: source.model, created_at: new Date().toISOString() };
  return {
    audio_event_map: { schema: EVENT_MAP_SCHEMA, source: sharedSource, analysis: created, events },
    lyric_timing_map: { schema: LYRIC_MAP_SCHEMA, source: sharedSource, analysis: created, phrases }
  };
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!context.request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({ error: 'Send a JSON request.' }, 415);
  if (!context.env.LPX_GEMINI_PRODUCTION_KEY) return json({ error: 'Production Timing Analysis is not configured yet. Please try again after the site administrator adds its server-side key.' }, 503);
  let data;
  try { data = await context.request.json(); } catch { return json({ error: 'The timing request could not be read. Please try again.' }, 400); }
  const phrases = lyricPhrases(data?.lyrics);
  if (!data || !clean(data.name, 200) || !/^[a-f0-9]{64}$/i.test(data.contentHash || '') || !phrases) return json({ error: 'Production Timing Analysis needs the selected MP3 and its artist-supplied lyric phrases.' }, 400);
  const audio = parseDataUrl(data.dataUrl);
  if (!audio) return json({ error: 'Choose a non-empty MP3 under 25 MB.' }, 400);
  const source = { display_name: data.name.trim(), content_hash: data.contentHash.toLowerCase(), byte_size: audio.bytes, duration_ms: reportedDurationMs(data.durationMs), lyric_phrases: phrases, model: GEMINI_MODEL };
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 300000);
  let temporaryFileName = null;
  let stage = 'upload_init';
  try {
    const bytes = audioBytes(audio.base64);
    const uploadStart = await fetch(`${GEMINI_API_BASE}/upload/v1beta/files`, { method: 'POST', signal: controller.signal, headers: { ...geminiHeaders(context.env.LPX_GEMINI_PRODUCTION_KEY), 'Content-Type': 'application/json', 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(audio.bytes), 'X-Goog-Upload-Header-Content-Type': AUDIO_TYPE }, body: JSON.stringify({ file: { display_name: 'LPX temporary production timing audio' } }) });
    if (!uploadStart.ok) { logTimingFailure(stage, uploadStart); return providerError(uploadStart); }
    const uploadUrl = uploadStart.headers.get('x-goog-upload-url');
    if (!uploadUrl || !uploadUrl.startsWith('https://')) { logTimingFailure(stage); return json({ error: 'Production Timing Analysis could not be completed just now. Your project remains unchanged; please retry.' }, 502); }
    stage = 'upload_bytes';
    const upload = await fetch(uploadUrl, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': AUDIO_TYPE, 'Content-Length': String(audio.bytes), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: bytes });
    if (!upload.ok) { logTimingFailure(stage, upload); return providerError(upload); }
    const uploaded = await upload.json();
    const file = uploaded?.file;
    if (!file?.name || !file?.uri) { logTimingFailure(stage); return json({ error: 'Production Timing Analysis returned an incomplete file result. Please retry.' }, 502); }
    temporaryFileName = file.name;
    stage = 'file_processing';
    const usableFile = await waitForFile(file, context.env.LPX_GEMINI_PRODUCTION_KEY, controller.signal);
    if (usableFile?.response) { logTimingFailure(stage, usableFile.response); return providerError(usableFile.response); }
    if (!usableFile?.uri) { logTimingFailure(stage); return json({ error: 'Production Timing Analysis could not prepare the recording. Please retry.' }, 502); }
    stage = 'generate_content';
    const upstream = await fetch(`${GEMINI_API_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent`, { method: 'POST', signal: controller.signal, headers: { ...geminiHeaders(context.env.LPX_GEMINI_PRODUCTION_KEY), 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${TIMING_PROMPT}${JSON.stringify(phrases)}` }, { file_data: { mime_type: usableFile.mimeType || AUDIO_TYPE, file_uri: usableFile.uri } }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: TIMING_RESPONSE_SCHEMA } }) });
    if (!upstream.ok) { logTimingFailure(stage, upstream); return providerError(upstream); }
    let body;
    try { body = await upstream.json(); } catch (error) { logTimingFailure(stage, null, error); return json({ error: 'Production Timing Analysis returned an unreadable result. Please retry.' }, 502); }
    stage = 'timing_validation';
    const responseText = body?.candidates?.[0]?.content?.parts?.map(part => typeof part?.text === 'string' ? part.text : '').join('\n') || '';
    let parsed;
    try { parsed = JSON.parse(responseText); } catch (error) { logTimingFailure(stage, null, error); return json({ error: 'Production Timing Analysis returned an incomplete timing result. Please retry.' }, 502); }
    source.model = body.modelVersion || GEMINI_MODEL;
    const timing = validateProductionTiming(parsed, source);
    if (!timing) { logTimingFailure(stage); return json({ error: 'Production Timing Analysis returned an incomplete timing result. Please retry.' }, 502); }
    return json({ ...timing, provenance: { usage: body.usageMetadata || null } });
  } catch (error) {
    if (!timedOut) logTimingFailure(stage, null, error);
    return json({ error: timedOut ? 'Production Timing Analysis took too long. Your project remains unchanged; please retry.' : 'Production Timing Analysis could not reach the listening service. Your project remains unchanged; please retry.' }, timedOut ? 504 : 502);
  } finally {
    if (temporaryFileName) await deleteTemporaryFile(temporaryFileName, context.env.LPX_GEMINI_PRODUCTION_KEY, controller.signal);
    clearTimeout(timeout);
  }
}
