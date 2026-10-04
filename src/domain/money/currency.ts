import { DomainError } from '../shared/errors.ts';

/**
 * Currencies the app knows how to store and format. Adding one is a data
 * change here, not a model change. No conversion between currencies exists:
 * mixing them in arithmetic is an error (see money.ts).
 */
export const CURRENCIES = {
  EUR: { code: 'EUR', minorUnits: 2, symbol: '€' },
  USD: { code: 'USD', minorUnits: 2, symbol: '$' },
  PEN: { code: 'PEN', minorUnits: 2, symbol: 'S/' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export interface Currency {
  readonly code: CurrencyCode;
  readonly minorUnits: number;
  readonly symbol: string;
}

export const DEFAULT_CURRENCY: CurrencyCode = 'EUR';

export const CURRENCY_CODES = Object.keys(CURRENCIES) as readonly CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(CURRENCIES, value);
}

export function asCurrencyCode(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) {
    throw new DomainError('INVALID_CURRENCY', `Unsupported currency "${value}".`);
  }
  return value;
}

export function currencyInfo(code: CurrencyCode): Currency {
  return CURRENCIES[code];
}
