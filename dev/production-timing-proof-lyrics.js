import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function lyricsForTrack(allLyrics, track) {
  const heading = `## ${track}`;
  const start = allLyrics.indexOf(heading);
  if (start < 0) return '';
  const contentStart = start + heading.length;
  const next = allLyrics.indexOf('\n## ', contentStart);
  return allLyrics.slice(contentStart, next < 0 ? allLyrics.length : next).trim();
}

export async function loadKnownLyrics({ lyricsFile, track, fixtureLyrics }) {
  if (lyricsFile) {
    try {
      const lyrics = (await readFile(resolve(lyricsFile), 'utf8')).trim();
      if (!lyrics) throw new Error('The supplied lyric file is empty.');
      return lyrics;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`Could not read the supplied lyric file: ${resolve(lyricsFile)}`);
      }
      if (error?.message === 'The supplied lyric file is empty.') throw error;
      throw new Error(`Could not read the supplied lyric file: ${resolve(lyricsFile)}`);
    }
  }

  const lyrics = lyricsForTrack(fixtureLyrics || '', track);
  if (!lyrics) {
    throw new Error(`No artist-supplied lyrics found for “${track}” in the local Transmission fixture.`);
  }
  return lyrics;
}
