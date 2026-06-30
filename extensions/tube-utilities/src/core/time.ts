/**
 * Time-formatting helpers shared by the renderers and chapter parsing.
 * All caption timing in the extension is normalized to milliseconds.
 */

const pad = (value: number, length = 2): string => value.toString().padStart(length, "0");

/** Formats milliseconds as `H:MM:SS` for inline Markdown timestamps and chapter heads. */
export function formatClock(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.round(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Formats milliseconds as `HH:MM:SS,mmm` (SubRip cue timing). */
export function formatSrtTime(totalMs: number): string {
  const milliseconds = Math.max(0, Math.round(totalMs));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(remainder, 3)}`;
}

/** Formats milliseconds as `HH:MM:SS.mmm` (WebVTT cue timing). */
export function formatVttTime(totalMs: number): string {
  return formatSrtTime(totalMs).replace(",", ".");
}

/** Parses a clock string (`H:MM:SS`, `MM:SS`, or `M:SS`) into milliseconds, or `undefined` when invalid. */
export function parseClock(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return undefined;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = match[3] !== undefined ? Number(match[3]) : undefined;
  if (second > 59 || (third !== undefined && third > 59)) return undefined;
  if (third === undefined) return (first * 60 + second) * 1000;
  return (first * 3600 + second * 60 + third) * 1000;
}
