import { DomainError } from './errors.ts';
import type { Brand } from './ids.ts';

/**
 * Calendar date without time or timezone: "YYYY-MM-DD".
 * Financial events are day-granular; storing a plain date avoids the classic
 * "expense moved to yesterday because of UTC" bug. Lexicographic order equals
 * chronological order, which IndexedDB range queries rely on.
 */
export type IsoDate = Brand<string, 'IsoDate'>;

/** Instant in time, ISO-8601 UTC ("2026-10-02T21:52:00.000Z"). Used for audit fields. */
export type Timestamp = Brand<string, 'Timestamp'>;

/** A calendar month: "YYYY-MM". */
export type YearMonth = Brand<string, 'YearMonth'>;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  // month: 1..12. Day 0 of next month = last day of this month. UTC avoids DST.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isIsoDate(value: string): value is IsoDate {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return year >= 1900 && year <= 2999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function asIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) {
    throw new DomainError('INVALID_DATE', `Invalid date "${value}". Expected a real calendar date YYYY-MM-DD.`);
  }
  return value;
}

export function asYearMonth(value: string): YearMonth {
  const m = MONTH_RE.exec(value);
  const month = m ? Number(m[2]) : 0;
  if (!m || month < 1 || month > 12) {
    throw new DomainError('INVALID_DATE', `Invalid month "${value}". Expected YYYY-MM.`);
  }
  return value as YearMonth;
}

export function asTimestamp(value: string): Timestamp {
  if (Number.isNaN(Date.parse(value))) {
    throw new DomainError('INVALID_DATE', `Invalid timestamp "${value}".`);
  }
  return value as Timestamp;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Local calendar date of an instant (the user's wall clock, not UTC). */
export function toLocalIsoDate(instant: Date): IsoDate {
  return asIsoDate(`${pad(instant.getFullYear(), 4)}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`);
}

export function toTimestamp(instant: Date): Timestamp {
  return instant.toISOString() as Timestamp;
}

export function yearMonthOf(date: IsoDate): YearMonth {
  return date.slice(0, 7) as YearMonth;
}

/** The month `n` months after (or before, if negative) `month`. */
export function addMonths(month: YearMonth, n: number): YearMonth {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return asYearMonth(`${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`);
}

/** Inclusive first/last day of a month, ready for IndexedDB `between` queries. */
export function monthRange(month: YearMonth): { from: IsoDate; to: IsoDate } {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return {
    from: `${month}-01` as IsoDate,
    to: `${month}-${pad(daysInMonth(year, m))}` as IsoDate,
  };
}

/** Default date for a new record while viewing `month`: today if it falls in that month, else the month's first day. */
export function defaultDateIn(month: YearMonth, today: IsoDate): IsoDate {
  return yearMonthOf(today) === month ? today : monthRange(month).from;
}

/** Inclusive first/last day of a year. */
export function yearRange(year: number): { from: IsoDate; to: IsoDate } {
  return { from: asIsoDate(`${pad(year, 4)}-01-01`), to: asIsoDate(`${pad(year, 4)}-12-31`) };
}

/** Source of "now". Injected so tests and the agent ("ayer", "este mes") are deterministic. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export const fixedClock = (iso: string): Clock => {
  const d = new Date(iso);
  return { now: () => new Date(d.getTime()) };
};
