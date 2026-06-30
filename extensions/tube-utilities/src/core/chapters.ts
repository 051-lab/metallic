import type { Chapter } from "./types";
import { parseClock } from "./time";

/**
 * Parses chapter markers from a YouTube video description.
 *
 * YouTube renders chapters as consecutive lines that each begin with a
 * clock-formatted timestamp (e.g. `0:00 Intro`, `1:02:03 Deep Dive`). The
 * timestamp may sit anywhere in the line — common forms include a leading
 * timestamp, a parenthesized timestamp, or a timestamp at the end. We scan
 * each non-empty line for the first valid clock token and treat the rest of
 * the line as the chapter title.
 *
 * Only runs of two or more timestamped lines are treated as chapters; a stray
 * timestamp inside a paragraph of prose is ignored.
 */

interface ParsedLine {
  startMs: number;
  title: string;
}

const TIMESTAMP = /(\d{1,2}:\d{2}(?::\d{2})?)/;

function parseLine(rawLine: string): ParsedLine | undefined {
  const line = rawLine.trim();
  if (!line) return undefined;
  const match = line.match(TIMESTAMP);
  if (!match?.[1]) return undefined;
  const startMs = parseClock(match[1]);
  if (startMs === undefined) return undefined;
  const title = line.replace(match[1], "").replace(/^[\s\-–—»>:|]+|[\s\-–—>:|]+$/g, "").trim();
  return { startMs, title: title || `Chapter at ${match[1]}` };
}

export function parseChapters(description: string): Chapter[] {
  const lines = description.split(/\r?\n/);
  const parsed: ParsedLine[] = [];
  let run = 0;
  for (const line of lines) {
    const result = parseLine(line);
    if (result) {
      parsed.push(result);
      run += 1;
    } else if (line.trim()) {
      // A non-empty, non-timestamped line breaks a potential chapter run.
      run = 0;
    }
  }
  if (parsed.length < 2 || run < 2) return [];
  const seen = new Set<number>();
  return parsed
    .filter((entry) => {
      if (seen.has(entry.startMs)) return false;
      seen.add(entry.startMs);
      return true;
    })
    .sort((a, b) => a.startMs - b.startMs)
    .map((entry) => ({ title: entry.title, startMs: entry.startMs }));
}
