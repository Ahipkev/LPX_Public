import assert from 'node:assert/strict';
import test from 'node:test';
import { TIMING_RESPONSE_SCHEMA, lyricPhrases, onRequest, validateProductionTiming } from '../functions/api/timing.js';

const lyrics = 'First supplied line\nSecond supplied line\n[Chorus]\nThird supplied line';
const source = {
  display_name: 'proof.mp3',
  content_hash: 'a'.repeat(64),
  byte_size: 1234,
  duration_ms: 240000,
  lyric_phrases: lyricPhrases(lyrics),
  model: 'gemini-3.8-flash'
};

function response() {
  return {
    events: [
      { id: 'event-beginning', kind: 'audio_beginning', timing_state: 'known', start_ms: 0, end_ms: null, tolerance_ms: 1000, confidence: 'high', description: 'Audio begins.' },
      { id: 'event-riff', kind: 'riff_change', timing_state: 'known', start_ms: 30000, end_ms: null, tolerance_ms: 1500, confidence: 'medium', description: 'Main riff changes.' },
      { id: 'event-vocal', kind: 'vocal_entrance', timing_state: 'known', start_ms: 60000, end_ms: 76000, tolerance_ms: 2000, confidence: 'medium', description: 'Lead vocal enters.' },
      { id: 'event-ending', kind: 'ending', timing_state: 'known', start_ms: 220000, end_ms: 240000, tolerance_ms: 1500, confidence: 'high', description: 'The recording ends.' },
      { id: 'event-unknown', kind: 'other', timing_state: 'unknown', start_ms: null, end_ms: null, tolerance_ms: null, confidence: 'low', description: 'A possible detail could not be located reliably.' },
      { id: 'event-impact', kind: 'impact', timing_state: 'known', start_ms: 120000, end_ms: null, tolerance_ms: 1200, confidence: 'high', description: 'A distinct impact occurs.' },
      { id: 'event-outro', kind: 'outro', timing_state: 'known', start_ms: 200000, end_ms: null, tolerance_ms: 1500, confidence: 'medium', description: 'The outro begins.' }
    ],
    lyric_phrases: source.lyric_phrases.map((phrase, index) => ({ id: phrase.id, text: phrase.text, timing_state: index === 1 ? 'unknown' : 'known', start_ms: index === 1 ? null : 50000 + index * 10000, end_ms: index === 1 ? null : 56000 + index * 10000, tolerance_ms: index === 1 ? null : 2000, confidence: 'medium', note: '' }))
  };
}

test('accepts a valid provider-neutral sibling artifact pair without a fixed ten-event requirement', () => {
  const result = validateProductionTiming(response(), source);
  assert.equal(result.audio_event_map.schema, 'lpx-audio-event-map/0.1');
  assert.equal(result.lyric_timing_map.schema, 'lpx-lyric-timing-map/0.1');
  assert.equal(result.audio_event_map.events.length, 7);
  assert.equal(result.lyric_timing_map.phrases[1].timing_state, 'unknown');
  assert.equal(result.lyric_timing_map.phrases[1].start_ms, null);
  assert.equal(result.audio_event_map.events[0].provenance, 'model_observed');
});

test('rejects fabricated numeric timing for an unknown item', () => {
  const invalid = response();
  invalid.events[4].start_ms = 110000;
  assert.equal(validateProductionTiming(invalid, source), null);
});

test('rejects negative, reversed, and out-of-duration timing', () => {
  for (const mutate of [
    value => { value.events[0].start_ms = -1; },
    value => { value.events[2].end_ms = 59000; },
    value => { value.events[3].end_ms = 250000; }
  ]) {
    const invalid = response();
    mutate(invalid);
    assert.equal(validateProductionTiming(invalid, source), null);
  }
});

test('rejects duplicate event ids and changed or reordered artist lyric phrases', () => {
  const duplicate = response();
  duplicate.events[1].id = duplicate.events[0].id;
  assert.equal(validateProductionTiming(duplicate, source), null);
  const rewritten = response();
  rewritten.lyric_phrases[0].text = 'Model rewrite';
  assert.equal(validateProductionTiming(rewritten, source), null);
  const reordered = response();
  [reordered.lyric_phrases[0], reordered.lyric_phrases[1]] = [reordered.lyric_phrases[1], reordered.lyric_phrases[0]];
  assert.equal(validateProductionTiming(reordered, source), null);
});

test('keeps the Gemini structured schema separate from LPX provenance and carries no visual-cue fields', () => {
  assert.equal(TIMING_RESPONSE_SCHEMA.properties.events.items.properties.start_ms.type[0], 'integer');
  assert.equal(TIMING_RESPONSE_SCHEMA.properties.lyric_phrases.items.properties.text.type, 'string');
  assert.equal(JSON.stringify(TIMING_RESPONSE_SCHEMA).includes('visual'), false);
});

test('uses the Files API once, sends bytes rather than base64 for upload, returns sibling maps, and cleans up', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const providerResponse = response();
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return new Response('', { status: 200, headers: { 'x-goog-upload-url': 'https://upload.example.test/session' } });
    if (calls.length === 2) return new Response(JSON.stringify({ file: { name: 'files/temporary', uri: 'https://provider.example.test/file', mimeType: 'audio/mpeg' } }), { status: 200 });
    if (calls.length === 3) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerResponse) }] } }], modelVersion: 'gemini-3.8-flash', usageMetadata: { totalTokenCount: 1 } }), { status: 200 });
    if (calls.length === 4) return new Response('', { status: 200 });
    throw new Error('Unexpected fetch');
  };
  try {
    const request = new Request('https://example.test/api/timing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'proof.mp3', contentHash: source.content_hash, durationMs: source.duration_ms, lyrics, dataUrl: 'data:audio/mpeg;base64,AQID' }) });
    const result = await onRequest({ request, env: { LPX_GEMINI_PRODUCTION_KEY: 'test-only-not-a-real-secret' } });
    const payload = await result.json();
    assert.equal(result.status, 200);
    assert.equal(payload.audio_event_map.source.content_hash, source.content_hash);
    assert.equal(payload.lyric_timing_map.phrases.length, source.lyric_phrases.length);
    assert.equal(calls.length, 4);
    assert.equal(calls[1].options.body instanceof Uint8Array, true);
    assert.equal(String(calls[2].url).includes(':generateContent'), true);
    const generation = JSON.parse(calls[2].options.body);
    assert.equal(generation.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(generation.generationConfig.responseJsonSchema, TIMING_RESPONSE_SCHEMA);
    assert.equal(generation.contents[0].parts.some(part => 'file_data' in part), true);
    assert.equal(calls[3].options.method, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fails closed before provider use when lyrics are absent or the timing binding is missing', async () => {
  const request = new Request('https://example.test/api/timing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
  const missingBinding = await onRequest({ request, env: {} });
  assert.equal(missingBinding.status, 503);
  const missingLyrics = await onRequest({ request: new Request('https://example.test/api/timing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'proof.mp3', contentHash: source.content_hash, dataUrl: 'data:audio/mpeg;base64,AQID' }) }), env: { LPX_GEMINI_PRODUCTION_KEY: 'test-only-not-a-real-secret' } });
  assert.equal(missingLyrics.status, 400);
});
