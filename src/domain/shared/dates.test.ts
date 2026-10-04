import { describe, expect, it } from 'vitest';
import { addMonths, asIsoDate, defaultDateIn, asYearMonth, isIsoDate, monthRange, toLocalIsoDate, yearMonthOf } from './dates.ts';

describe('dates', () => {
  it('accepts only real calendar dates', () => {
    expect(isIsoDate('2026-10-02')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-01')).toBe(false);
    expect(isIsoDate('02/10/2026')).toBe(false);
    expect(() => asIsoDate('2026-04-31')).toThrow();
  });

  it('computes inclusive month ranges', () => {
    expect(monthRange(asYearMonth('2026-02'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(asYearMonth('2024-02'))).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange(asYearMonth('2026-10'))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(defaultDateIn(asYearMonth('2026-10'), asIsoDate('2026-10-04'))).toBe('2026-10-04');
    expect(defaultDateIn(asYearMonth('2026-08'), asIsoDate('2026-10-04'))).toBe('2026-08-01');
    expect(() => asYearMonth('2026-00')).toThrow();
  });

  it('moves between months across year boundaries', () => {
    expect(addMonths(asYearMonth('2026-12'), 1)).toBe('2027-01');
    expect(addMonths(asYearMonth('2026-01'), -1)).toBe('2025-12');
    expect(addMonths(asYearMonth('2026-10'), 0)).toBe('2026-10');
  });

  it('derives the month of a date', () => {
    expect(yearMonthOf(asIsoDate('2026-10-02'))).toBe('2026-10');
  });

  it('uses the local wall-clock date', () => {
    expect(toLocalIsoDate(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02');
  });
});
