import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadKnownLyrics } from './production-timing-proof-lyrics.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function usage() {
  console.error('Usage: node dev/run-production-timing-proof.mjs --track "Track title" --audio "C:\\path\\master.mp3" --output "C:\\path\\timing-result.json" [--lyrics-file "C:\\path\\lyrics.txt"] [--duration-ms 123456] [--endpoint https://longplay-experience.pages.dev/api/timing]');
  process.exitCode = 1;
}

const track = argument('--track');
const audioPath = argument('--audio');
const outputPath = argument('--output');
const endpoint = argument('--endpoint') || 'https://longplay-experience.pages.dev/api/timing';
const durationArgument = argument('--duration-ms');
const durationMs = durationArgument ? Number(durationArgument) : null;
const lyricsFile = argument('--lyrics-file');

if (!track || !audioPath || !outputPath || (durationArgument && (!Number.isInteger(durationMs) || durationMs <= 0))) {
  usage();
} else {
  let fixtureLyrics = '';
  if (!lyricsFile) {
    globalThis.window = {};
    await import('./transmission-artifacts.local.js');
    fixtureLyrics = window.__LPX_DEV_TRANSMISSION_ARTIFACTS__?.source?.lyrics || '';
  }
  const lyrics = await loadKnownLyrics({ lyricsFile, track, fixtureLyrics });
  const bytes = await readFile(resolve(audioPath));
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const dataUrl = `data:audio/mpeg;base64,${bytes.toString('base64')}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: audioPath.split(/[\\/]/).pop(), contentHash, durationMs: durationMs || undefined, lyrics, dataUrl })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.audio_event_map || !payload?.lyric_timing_map) {
    throw new Error(payload?.error || `Production Timing Analysis failed with HTTP ${response.status}.`);
  }
  await writeFile(resolve(outputPath), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Production Timing Analysis saved: ${resolve(outputPath)}`);
  console.log(`Audio Event Map events: ${payload.audio_event_map.events.length}`);
  console.log(`Lyric Timing Map phrases: ${payload.lyric_timing_map.phrases.length}`);
}
