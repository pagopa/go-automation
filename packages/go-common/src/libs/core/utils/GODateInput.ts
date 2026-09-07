/**
 * GODateInput - Lenient parsing of human-typed date input
 *
 * Typing a full ISO 8601 timestamp by hand is error prone, so every entry point
 * that asks a user for a date accepts a wider vocabulary and normalizes it to a
 * single instant. Parsing lives here, apart from any prompt, so the CLI, the
 * config layer and the tests can share the exact same rules.
 */

import { DateTime } from 'luxon';

import { GODateTokens } from './GODateTokens.js';

/** Which edge of the day a date-only input resolves to. */
export type GODateBoundary = 'start' | 'end';

export interface GODateInputOptions {
  /** IANA time zone used to resolve inputs without an explicit offset (default `UTC`) */
  readonly timeZone?: string;

  /** Edge of the day for inputs carrying no time (default `start`) */
  readonly boundary?: GODateBoundary;

  /** Reference instant for relative inputs; injected by tests (default: now) */
  readonly now?: Date;
}

export interface GODateInputResult {
  /** The resolved instant */
  readonly date: Date;

  /** The resolved instant as an ISO 8601 UTC string */
  readonly iso: string;
}

/** `-7d`, `+2w`, `-30m`: a signed amount of minutes, hours, days or weeks. */
const OFFSET_PATTERN = /^([+-])(\d+)\s*(m|h|d|w)$/;

/** A calendar day with no time of day, in ISO order. */
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar day with no time of day, in day-first order (`24/08/2026`). */
const DAY_FIRST_PATTERN = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

/** Day-first formats carrying a time of day, tried in order. */
const DAY_FIRST_TIME_FORMATS: ReadonlyArray<string> = ['d/M/yyyy H:mm', 'd/M/yyyy H:mm:ss', 'd/M/yyyy HH:mm:ss'];

const OFFSET_UNIT_MILLIS: ReadonlyMap<string, number> = new Map([
  ['m', 60_000],
  ['h', 3_600_000],
  ['d', 86_400_000],
  ['w', 604_800_000],
]);

const NOW_KEYWORDS: ReadonlySet<string> = new Set(['now', 'adesso']);
const TODAY_KEYWORDS: ReadonlySet<string> = new Set(['today', 'oggi']);
const YESTERDAY_KEYWORDS: ReadonlySet<string> = new Set(['yesterday', 'ieri']);

/**
 * Parses a human-typed date into a single instant.
 *
 * Accepted, in this order: the `now`/`today`/`yesterday` keywords (also in
 * Italian), signed offsets from now (`-7d`, `-24h`, `-30m`, `+1w`), a calendar
 * day (`2026-08-24` or the day-first `24/08/2026`), a day-first date and time
 * (`24/08/2026 14:30`), and finally everything `GODateTokens.parse` already
 * understands: ISO 8601, SQL, `yyyy-MM-dd HH:mm[:ss]` and epoch seconds or
 * milliseconds.
 *
 * Day-first input is read the European way, so `03/04/2026` is 3 April. This is
 * decided here rather than left to the native `Date` parser, which would read
 * the same text as 4 March.
 *
 * Complexity: O(1) — a bounded list of candidate formats.
 *
 * @param input - The raw text typed by the user
 * @param options - Time zone, day boundary and reference instant
 * @returns The resolved instant and its ISO 8601 representation
 * @throws Error when the input is empty, the time zone is unknown, or no format matches
 *
 * @example
 * ```typescript
 * parseDateInput('24/08/2026', { boundary: 'end' }).iso; // 2026-08-24T23:59:59.999Z
 * parseDateInput('-7d', { now: new Date('2026-08-24T10:00:00Z') }).iso; // 2026-08-17T10:00:00.000Z
 * ```
 */
export function parseDateInput(input: string, options: GODateInputOptions = {}): GODateInputResult {
  const timeZone = options.timeZone ?? 'UTC';
  const boundary = options.boundary ?? 'start';
  const now = options.now ?? new Date();

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error('Date value cannot be empty');
  }
  validateTimeZone(timeZone);

  const keyword = trimmed.toLowerCase();
  const resolved =
    resolveKeyword(keyword, now, timeZone, boundary) ??
    resolveOffset(keyword, now) ??
    resolveDay(trimmed, timeZone, boundary) ??
    resolveDayFirstTime(trimmed, timeZone) ??
    GODateTokens.parse(trimmed, timeZone);

  return { date: resolved, iso: resolved.toISOString() };
}

/**
 * Parses a human-typed date, returning `undefined` instead of throwing.
 *
 * Meant for validators, which need to tell valid from invalid without treating
 * a typo as an exceptional condition.
 *
 * @param input - The raw text typed by the user
 * @param options - Time zone, day boundary and reference instant
 * @returns The resolved instant, or `undefined` when the input cannot be parsed
 */
export function tryParseDateInput(input: string, options: GODateInputOptions = {}): GODateInputResult | undefined {
  try {
    return parseDateInput(input, options);
  } catch {
    return undefined;
  }
}

/**
 * Lists the accepted date formats, for help texts and validation errors.
 *
 * Kept next to the parser so the two cannot drift apart.
 *
 * @returns A one-line, comma-separated summary of the accepted formats
 */
export function describeDateInputFormats(): string {
  return '2026-08-24T14:30:00Z, 2026-08-24, 24/08/2026 14:30, epoch (s/ms), -7d, -24h, -30m, now, today, yesterday';
}

/** Resolves the `now` / `today` / `yesterday` keywords, in English and Italian. */
function resolveKeyword(keyword: string, now: Date, timeZone: string, boundary: GODateBoundary): Date | undefined {
  if (NOW_KEYWORDS.has(keyword)) return new Date(now.getTime());

  const day = DateTime.fromJSDate(now).setZone(timeZone);
  if (TODAY_KEYWORDS.has(keyword)) return applyBoundary(day, boundary);
  if (YESTERDAY_KEYWORDS.has(keyword)) return applyBoundary(day.minus({ days: 1 }), boundary);

  return undefined;
}

/** Resolves a signed offset from the reference instant, e.g. `-7d`. */
function resolveOffset(keyword: string, now: Date): Date | undefined {
  const match = OFFSET_PATTERN.exec(keyword);
  if (match === null) return undefined;

  const [, sign, amount, unit] = match;
  if (sign === undefined || amount === undefined || unit === undefined) return undefined;

  const unitMillis = OFFSET_UNIT_MILLIS.get(unit);
  if (unitMillis === undefined) return undefined;

  const offset = Number(amount) * unitMillis;
  return new Date(now.getTime() + (sign === '-' ? -offset : offset));
}

/** Resolves a calendar day with no time of day, honouring the requested boundary. */
function resolveDay(input: string, timeZone: string, boundary: GODateBoundary): Date | undefined {
  const day = ISO_DAY_PATTERN.test(input)
    ? DateTime.fromISO(input, { zone: timeZone })
    : DAY_FIRST_PATTERN.test(input)
      ? DateTime.fromFormat(input, 'd/M/yyyy', { zone: timeZone })
      : undefined;

  if (day?.isValid !== true) return undefined;
  return applyBoundary(day, boundary);
}

/** Resolves a day-first date carrying a time of day, e.g. `24/08/2026 14:30`. */
function resolveDayFirstTime(input: string, timeZone: string): Date | undefined {
  for (const format of DAY_FIRST_TIME_FORMATS) {
    const parsed = DateTime.fromFormat(input, format, { zone: timeZone });
    if (parsed.isValid) return parsed.toJSDate();
  }
  return undefined;
}

/** Collapses a day to its first or last instant, in the requested time zone. */
function applyBoundary(day: DateTime, boundary: GODateBoundary): Date {
  return (boundary === 'end' ? day.endOf('day') : day.startOf('day')).toJSDate();
}

/** Fails fast on an unknown time zone, instead of silently resolving to an invalid date. */
function validateTimeZone(timeZone: string): void {
  if (!DateTime.local().setZone(timeZone).isValid) {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }
}
