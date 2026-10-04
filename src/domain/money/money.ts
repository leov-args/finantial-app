import { DomainError } from '../shared/errors.ts';
import { getCurrentLocale } from '../shared/locale.ts';
import { type CurrencyCode, asCurrencyCode, currencyInfo } from './currency.ts';

/**
 * Money is an integer number of minor units (cents) plus a currency.
 *
 *   { amountMinor: 4235, currency: 'EUR' }  ===  €42.35
 *
 * Invariants:
 *  - amountMinor is a safe integer (never a float).
 *  - Values are immutable.
 *  - Arithmetic between different currencies throws CURRENCY_MISMATCH.
 *  - Any operation that needs rounding takes an explicit rounding mode and
 *    is computed with BigInt, so there is no binary floating-point error.
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN';

/** Integer percentage with two decimals: 7273 = 72.73 %. 10000 = 100 %. */
export type BasisPoints = number;
export const FULL_BASIS_POINTS = 10_000;

function assertSafeInteger(value: number | bigint): number {
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new DomainError('AMOUNT_OVERFLOW', 'Amount is outside the safe integer range.');
    }
    return Number(value);
  }
  if (!Number.isSafeInteger(value)) {
    throw new DomainError('INVALID_AMOUNT', `Amount must be an integer number of minor units, got ${value}.`);
  }
  // Normalise -0 to 0 so equality and serialisation are predictable.
  return value === 0 ? 0 : value;
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  return Object.freeze({ amountMinor: assertSafeInteger(amountMinor), currency: asCurrencyCode(currency) });
}

export const zero = (currency: CurrencyCode): Money => money(0, currency);

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainError(
      'CURRENCY_MISMATCH',
      `Cannot combine ${a.currency} and ${b.currency}. Currency conversion is not supported.`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(assertSafeInteger(BigInt(a.amountMinor) + BigInt(b.amountMinor)), a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(assertSafeInteger(BigInt(a.amountMinor) - BigInt(b.amountMinor)), a.currency);
}

export const negate = (m: Money): Money => money(-m.amountMinor, m.currency);
export const abs = (m: Money): Money => money(Math.abs(m.amountMinor), m.currency);

/** Sum of a list. The currency is explicit so an empty list has a well-defined result. */
export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

export function multiply(m: Money, factor: number): Money {
  if (!Number.isSafeInteger(factor)) {
    throw new DomainError('INVALID_AMOUNT', 'Use multiplyRatio for non-integer factors.');
  }
  return money(assertSafeInteger(BigInt(m.amountMinor) * BigInt(factor)), m.currency);
}

function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const twiceRemainder = (n % d) * 2n;
  let rounded = q;
  if (twiceRemainder > d) rounded = q + 1n;
  else if (twiceRemainder === d) rounded = mode === 'HALF_UP' || q % 2n === 1n ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** m × numerator / denominator, rounded once at the end. */
export function multiplyRatio(m: Money, numerator: number, denominator: number, mode: RoundingMode = 'HALF_UP'): Money {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) {
    throw new DomainError('INVALID_AMOUNT', 'Ratio must be made of integers with a non-zero denominator.');
  }
  const result = divideRounded(BigInt(m.amountMinor) * BigInt(numerator), BigInt(denominator), mode);
  return money(assertSafeInteger(result), m.currency);
}

/** Percentage of an amount. 2150 bp of €100.00 → €21.50. */
export function percentage(m: Money, basisPoints: BasisPoints, mode: RoundingMode = 'HALF_UP'): Money {
  return multiplyRatio(m, basisPoints, FULL_BASIS_POINTS, mode);
}

/**
 * Share of `part` within `whole` in basis points, for DISPLAY only
 * (e.g. "72.73 %"). Never feed this back into money calculations; use
 * `allocate` with the raw amounts as weights instead, which is exact.
 */
export function shareInBasisPoints(part: Money, whole: Money): BasisPoints {
  assertSameCurrency(part, whole);
  if (whole.amountMinor === 0) return 0;
  return Number(divideRounded(BigInt(part.amountMinor) * BigInt(FULL_BASIS_POINTS), BigInt(whole.amountMinor), 'HALF_UP'));
}

/**
 * Splits `total` into parts proportional to integer `weights` so that the
 * parts ALWAYS add up to exactly `total` (largest-remainder method).
 *
 * Leftover cents go to the parts with the largest fractional remainder; ties
 * go to the lower index, so the result is deterministic.
 *
 *   allocate(€2,200.00, [4000_00, 1500_00]) → [€1,600.00, €600.00]
 *   allocate(€0.10, [1, 1, 1])               → [€0.04, €0.03, €0.03]
 */
export function allocate(total: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) {
    throw new DomainError('INVALID_WEIGHTS', 'At least one weight is required.');
  }
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) {
      throw new DomainError('INVALID_WEIGHTS', `Weights must be non-negative integers, got ${w}.`);
    }
  }
  const weightSum = weights.reduce((acc, w) => acc + BigInt(w), 0n);
  if (weightSum === 0n) {
    throw new DomainError('INVALID_WEIGHTS', 'Weights must not all be zero.');
  }

  const negative = total.amountMinor < 0;
  const amount = BigInt(Math.abs(total.amountMinor));

  const parts = weights.map((w, index) => {
    const product = amount * BigInt(w);
    return { index, share: product / weightSum, remainder: product % weightSum };
  });

  let leftover = amount - parts.reduce((acc, p) => acc + p.share, 0n);
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const p of byRemainder) {
    if (leftover === 0n) break;
    p.share += 1n;
    leftover -= 1n;
  }

  return parts.map((p) => money(assertSafeInteger(negative ? -p.share : p.share), total.currency));
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amountMinor === b.amountMinor ? 0 : a.amountMinor < b.amountMinor ? -1 : 1;
}

export const equals = (a: Money, b: Money): boolean => a.currency === b.currency && a.amountMinor === b.amountMinor;
export const isZero = (m: Money): boolean => m.amountMinor === 0;
export const isPositive = (m: Money): boolean => m.amountMinor > 0;
export const isNegative = (m: Money): boolean => m.amountMinor < 0;

/** Exact decimal string in major units: 4235 EUR → "42.35". No floats involved. */
export function toMajorString(m: Money): string {
  const { minorUnits } = currencyInfo(m.currency);
  const digits = Math.abs(m.amountMinor).toString().padStart(minorUnits + 1, '0');
  const integer = digits.slice(0, digits.length - minorUnits);
  const fraction = digits.slice(digits.length - minorUnits);
  const sign = m.amountMinor < 0 ? '-' : '';
  return minorUnits === 0 ? `${sign}${integer}` : `${sign}${integer}.${fraction}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Human formatting for display only. `format(money(4235,'EUR'))` → "42,35 €". */
export function format(m: Money, locale = getCurrentLocale()): string {
  const key = `${locale}|${m.currency}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    const { minorUnits } = currencyInfo(m.currency);
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: m.currency,
      minimumFractionDigits: minorUnits,
      maximumFractionDigits: minorUnits,
      useGrouping: true,
    });
    formatters.set(key, formatter);
  }
  // Intl accepts exact decimal strings, so no float conversion happens here either.
  return formatter.format(toMajorString(m) as `${number}`);
}

const CURRENCY_MARKER_DEFINITIONS: readonly {
  readonly marker: string;
  readonly currency: CurrencyCode;
  readonly word: boolean;
}[] = [
  { marker: 'euros', currency: 'EUR', word: true },
  { marker: 'euro', currency: 'EUR', word: true },
  { marker: 'eur', currency: 'EUR', word: true },
  { marker: 'usd', currency: 'USD', word: true },
  { marker: 'pen', currency: 'PEN', word: true },
  { marker: '€', currency: 'EUR', word: false },
  { marker: '$', currency: 'USD', word: false },
  { marker: 'S/', currency: 'PEN', word: false },
];

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CURRENCY_MARKER_PATTERN = CURRENCY_MARKER_DEFINITIONS.map(({ marker, word }) => {
  const escaped = escapeRegExp(marker);
  return word ? `(?<![a-z])${escaped}(?![a-z])` : escaped;
}).join('|');
const currencyMarkerRegex = (): RegExp => new RegExp(CURRENCY_MARKER_PATTERN, 'gi');
const CURRENCY_BY_MARKER = new Map<string, CurrencyCode>(
  CURRENCY_MARKER_DEFINITIONS.map(({ marker, currency }) => [marker.toLowerCase(), currency]),
);

/** Returns the distinct currencies explicitly marked in a money string, in encounter order. */
export function currencyMarkers(text: string): readonly CurrencyCode[] {
  const currencies = new Set<CurrencyCode>();
  for (const match of text.matchAll(currencyMarkerRegex())) {
    const marker = match[0];
    const currency = CURRENCY_BY_MARKER.get(marker.toLowerCase());
    if (currency) currencies.add(currency);
  }
  return [...currencies];
}

/**
 * Parses an amount typed by a person (or read by OCR) into Money, using only
 * string operations. Accepts Spanish and English conventions:
 *
 *   "42" "42,35" "42.35" "1.234,56" "1,234.56" "42,35 €" "€ 42" "-5,10"
 *
 * Rules for a single separator kind: one occurrence followed by exactly three
 * digits is a thousands separator ("1.234" → 1234.00); otherwise it is the
 * decimal separator ("18,5" → 18.50). More decimals than the currency allows
 * is rejected instead of being rounded silently.
 */
export function parseMoney(input: string, currency: CurrencyCode): Money {
  const { minorUnits } = currencyInfo(currency);
  const invalid = (): DomainError => new DomainError('INVALID_AMOUNT', `Cannot read "${input}" as an amount.`);

  let s = input.replace(currencyMarkerRegex(), '').replace(/\s+/g, '');
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) throw invalid();

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalSep: '.' | ',' | null = null;
  let thousandsSep: '.' | ',' | null = null;

  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? '.' : ',';
    thousandsSep = decimalSep === '.' ? ',' : '.';
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const occurrences = s.split(sep).length - 1;
    const digitsAfter = s.length - s.lastIndexOf(sep) - 1;
    if (occurrences === 1 && digitsAfter !== 3) decimalSep = sep;
    else thousandsSep = sep;
  }

  let integerPart = s;
  let fractionPart = '';
  if (decimalSep) {
    const at = s.lastIndexOf(decimalSep);
    integerPart = s.slice(0, at);
    fractionPart = s.slice(at + 1);
    if (fractionPart.includes(',') || fractionPart.includes('.')) throw invalid();
  }
  if (thousandsSep) {
    const groups = integerPart.split(thousandsSep);
    const [first, ...rest] = groups;
    // "0,001" is not a thousands-grouped number; refuse rather than guess.
    if (!first || first.length > 3 || first.startsWith('0') || rest.some((g) => g.length !== 3)) throw invalid();
    integerPart = groups.join('');
  }
  if (!/^\d+$/.test(integerPart) || !/^\d*$/.test(fractionPart)) throw invalid();
  if (fractionPart.length > minorUnits) {
    throw new DomainError('INVALID_AMOUNT', `"${input}" has more than ${minorUnits} decimals.`);
  }

  const minor = BigInt(integerPart) * 10n ** BigInt(minorUnits) + BigInt(fractionPart.padEnd(minorUnits, '0') || '0');
  return money(assertSafeInteger(negative ? -minor : minor), currency);
}
