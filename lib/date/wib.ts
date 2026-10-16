// WIB (Asia/Jakarta) calendar helpers (SPEC §5). Every date concept in the
// app (today, Tutup Hari, check_date, day_closures.date, monthly reports,
// the ±1 day duplicate warning) is a WIB date, never the server's: Vercel
// runs in UTC, where 00:00-06:59 WIB is still the previous day.
//
// Dates are "YYYY-MM-DD" strings, the same shape PostgREST returns for a
// Postgres date. Instants are Date objects or ISO strings (timestamptz).
//
// WIB is a fixed UTC+7 with no daylight saving, so a constant offset is
// exact and does not depend on the runtime's time zone data. wib.test.ts
// checks it against Intl's Asia/Jakarta, so a future tzdata change shows up
// as a failing test rather than as silently wrong dates.

export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** True for a real calendar date written as "YYYY-MM-DD". */
export function isWibDate(value: string): boolean {
  return parseDate(value) !== null;
}

/** The WIB calendar date of an instant. */
export function wibDate(instant: Date | string): string {
  return isoDate(toMs(instant) + WIB_OFFSET_MS);
}

/** Today in WIB. */
export function todayWib(now: Date = new Date()): string {
  return wibDate(now);
}

/** The date n days after (or before, for negative n) a date. */
export function addDays(date: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError(`days must be an integer, got ${days}`);
  return isoDate(utcMidnight(date) + days * DAY_MS);
}

/**
 * The instants covering one WIB day, as a half-open range [start, end) of
 * UTC ISO strings, for filtering occurred_at:
 *   .gte("occurred_at", start).lt("occurred_at", end)
 */
export function wibDayRange(date: string): { start: string; end: string } {
  const start = utcMidnight(date) - WIB_OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + DAY_MS).toISOString() };
}

/** Like wibDayRange, for a whole WIB month given as "YYYY-MM". */
export function wibMonthRange(month: string): { start: string; end: string } {
  const first = MONTH_RE.test(month) ? parseDate(`${month}-01`) : null;
  if (first === null) throw new RangeError(`expected a month as YYYY-MM, got "${month}"`);
  const firstDay = new Date(first);
  // Date.UTC rolls month 12 over into January of the next year.
  const next = Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 1);
  return {
    start: new Date(first - WIB_OFFSET_MS).toISOString(),
    end: new Date(next - WIB_OFFSET_MS).toISOString(),
  };
}

/**
 * The instant for a WIB wall-clock date and time ("HH:mm" or "HH:mm:ss"),
 * as a UTC ISO string for transactions.occurred_at.
 */
export function toOccurredAt(date: string, time: string): string {
  const match = TIME_RE.exec(time);
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2]);
  const seconds = Number(match?.[3] ?? 0);
  if (!match || hours > 23 || minutes > 59 || seconds > 59) {
    throw new RangeError(`expected a time as HH:mm or HH:mm:ss, got "${time}"`);
  }
  const wallClock = utcMidnight(date) + ((hours * 60 + minutes) * 60 + seconds) * 1000;
  return new Date(wallClock - WIB_OFFSET_MS).toISOString();
}

/**
 * The day Tutup Hari opens on (SPEC §8): today in WIB, except that before
 * 03:00 WIB, while yesterday is still open, it is yesterday. Closing late at
 * night must not jump to a day that has barely started.
 */
export function defaultCloseDate(now: Date, isClosed: (date: string) => boolean): string {
  const today = todayWib(now);
  const wibHour = new Date(now.getTime() + WIB_OFFSET_MS).getUTCHours();
  const yesterday = addDays(today, -1);
  return wibHour < 3 && !isClosed(yesterday) ? yesterday : today;
}

function toMs(instant: Date | string): number {
  const ms = typeof instant === "string" ? Date.parse(instant) : instant.getTime();
  if (Number.isNaN(ms)) throw new RangeError(`invalid instant: ${String(instant)}`);
  return ms;
}

/** "YYYY-MM-DD" of the UTC calendar day containing ms. */
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ms of 00:00 UTC on a date: the date as a plain day count, no zone. */
function utcMidnight(date: string): number {
  const ms = parseDate(date);
  if (ms === null) throw new RangeError(`expected a date as YYYY-MM-DD, got "${date}"`);
  return ms;
}

function parseDate(value: string): number | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // Date.UTC rolls 2026-02-30 over to March; a real date round-trips.
  return isoDate(ms) === value ? ms : null;
}
