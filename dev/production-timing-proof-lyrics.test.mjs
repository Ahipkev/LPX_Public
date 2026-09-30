import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadKnownLyrics } from './production-timing-proof-lyrics.js';

test('uses the complete UTF-8 lyric file when supplied', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lpx-timing-'));
  const lyricsPath = join(directory, 'spaceman.txt');
  const lyrics = 'First line\nSecond line\nThird line';
  await writeFile(lyricsPath, lyrics, 'utf8');

  assert.equal(await loadKnownLyrics({
    lyricsFile: lyricsPath,
    track: 'Not In Fixture',
    fixtureLyrics: '## Not In Fixture\nWrong lyrics'
  }), lyrics);
});

test('explicit lyric file bypasses Transmission fixture lookup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lpx-timing-'));
  const lyricsPath = join(directory, 'external.txt');
  await writeFile(lyricsPath, 'External artist lyrics', 'utf8');

  assert.equal(await loadKnownLyrics({
    lyricsFile: lyricsPath,
    track: 'Missing Transmission Track',
    fixtureLyrics: ''
  }), 'External artist lyrics');
});

test('uses the existing fixture track block without a lyric file', async () => {
  const fixtureLyrics = '## Damned Aliens\nLine one\nLine two\n\n## Another Track\nOther line';
  assert.equal(await loadKnownLyrics({
    lyricsFile: '',
    track: 'Damned Aliens',
    fixtureLyrics
  }), 'Line one\nLine two');
});

test('missing lyric file fails before any request can be made', async () => {
  await assert.rejects(
    loadKnownLyrics({
      lyricsFile: join(tmpdir(), 'lpx-timing-definitely-missing.txt'),
      track: 'Spaceman',
      fixtureLyrics: ''
    }),
    /Could not read the supplied lyric file/
  );
});
