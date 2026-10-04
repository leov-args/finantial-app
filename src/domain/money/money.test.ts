import { describe, expect, it } from 'vitest';
import { DomainError } from '../shared/errors.ts';
import {
  abs,
  add,
  allocate,
  compare,
  currencyMarkers,
  equals,
  format,
  money,
  multiply,
  multiplyRatio,
  negate,
  parseMoney,
  percentage,
  shareInBasisPoints,
  subtract,
  sum,
  toMajorString,
  zero,
} from './money.ts';

const eur = (minor: number) => money(minor, 'EUR');
const minors = (list: { amountMinor: number }[]) => list.map((m) => m.amountMinor);

function expectDomainError(fn: () => unknown, code: DomainError['code']): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Expected DomainError ${code}`);
}

describe('money()', () => {
  it('stores integer minor units', () => {
    expect(eur(4235)).toEqual({ amountMinor: 4235, currency: 'EUR' });
  });

  it('rejects fractional minor units', () => {
    expectDomainError(() => eur(42.35), 'INVALID_AMOUNT');
    expectDomainError(() => eur(Number.NaN), 'INVALID_AMOUNT');
    expectDomainError(() => eur(Number.POSITIVE_INFINITY), 'INVALID_AMOUNT');
  });

  it('rejects unknown currencies', () => {
    expectDomainError(() => money(1, 'XXX' as 'EUR'), 'INVALID_CURRENCY');
  });

  it('is immutable', () => {
    const m = eur(100);
    expect(Object.isFrozen(m)).toBe(true);
  });

  it('normalises -0 to 0', () => {
    expect(Object.is(eur(-0).amountMinor, 0)).toBe(true);
  });
});

describe('arithmetic', () => {
  it('avoids floating point error (0.10 + 0.20 = 0.30)', () => {
    expect(add(eur(10), eur(20))).toEqual(eur(30));
  });

  it('adds, subtracts, negates and takes absolute values', () => {
    expect(subtract(eur(1000), eur(1250))).toEqual(eur(-250));
    expect(negate(eur(250))).toEqual(eur(-250));
    expect(abs(eur(-250))).toEqual(eur(250));
  });

  it('sums lists, including the empty list', () => {
    expect(sum([eur(100), eur(250), eur(-50)], 'EUR')).toEqual(eur(300));
    expect(sum([], 'EUR')).toEqual(zero('EUR'));
  });

  it('rejects mixing currencies', () => {
    expectDomainError(() => add(eur(100), money(100, 'USD')), 'CURRENCY_MISMATCH');
    expectDomainError(() => subtract(eur(100), money(100, 'USD')), 'CURRENCY_MISMATCH');
    expectDomainError(() => compare(eur(100), money(100, 'USD')), 'CURRENCY_MISMATCH');
    expectDomainError(() => sum([eur(1), money(1, 'PEN')], 'EUR'), 'CURRENCY_MISMATCH');
  });

  it('multiplies by integers only', () => {
    expect(multiply(eur(1999), 3)).toEqual(eur(5997));
    expectDomainError(() => multiply(eur(100), 1.5), 'INVALID_AMOUNT');
  });

  it('detects overflow instead of losing precision', () => {
    expectDomainError(() => add(eur(Number.MAX_SAFE_INTEGER), eur(1)), 'AMOUNT_OVERFLOW');
  });

  it('compares and checks equality', () => {
    expect(compare(eur(1), eur(2))).toBe(-1);
    expect(compare(eur(2), eur(2))).toBe(0);
    expect(compare(eur(3), eur(2))).toBe(1);
    expect(equals(eur(2), eur(2))).toBe(true);
    expect(equals(eur(2), money(2, 'USD'))).toBe(false);
  });
});

describe('ratios and rounding', () => {
  it('rounds HALF_UP by default, away from zero for negatives', () => {
    expect(multiplyRatio(eur(5), 1, 2)).toEqual(eur(3)); // 2.5 → 3
    expect(multiplyRatio(eur(-5), 1, 2)).toEqual(eur(-3)); // -2.5 → -3
    expect(multiplyRatio(eur(10), 1, 3)).toEqual(eur(3)); // 3.33 → 3
  });

  it('supports HALF_EVEN (banker’s rounding)', () => {
    expect(multiplyRatio(eur(5), 1, 2, 'HALF_EVEN')).toEqual(eur(2)); // 2.5 → 2
    expect(multiplyRatio(eur(7), 1, 2, 'HALF_EVEN')).toEqual(eur(4)); // 3.5 → 4
  });

  it('computes percentages in basis points', () => {
    expect(percentage(eur(10000), 2150)).toEqual(eur(2150)); // 21.50 % of €100
    expect(percentage(eur(220000), 7273)).toEqual(eur(160006)); // display-grade, not exact
  });

  it('reports shares in basis points for display', () => {
    expect(shareInBasisPoints(eur(400000), eur(550000))).toBe(7273);
    expect(shareInBasisPoints(eur(150000), eur(550000))).toBe(2727);
    expect(shareInBasisPoints(eur(1), eur(0))).toBe(0);
  });

  it('rejects a zero denominator', () => {
    expectDomainError(() => multiplyRatio(eur(1), 1, 0), 'INVALID_AMOUNT');
  });
});

describe('allocate()', () => {
  it('splits proportionally to income: €2,200 over €4,000 / €1,500 → €1,600 / €600', () => {
    expect(minors(allocate(eur(220000), [400000, 150000]))).toEqual([160000, 60000]);
  });

  it('always sums exactly to the total', () => {
    const cases: [number, number[]][] = [
      [10, [1, 1, 1]],
      [100, [1, 1, 1]],
      [99999, [7, 13, 29, 51]],
      [123457, [400000, 150000]],
      [1, [1, 1]],
      [0, [3, 5]],
    ];
    for (const [total, weights] of cases) {
      const parts = allocate(eur(total), weights);
      expect(parts.reduce((acc, p) => acc + p.amountMinor, 0)).toBe(total);
      expect(parts).toHaveLength(weights.length);
    }
  });

  it('gives leftover cents to the largest remainders, ties to the lower index', () => {
    expect(minors(allocate(eur(10), [1, 1, 1]))).toEqual([4, 3, 3]);
    expect(minors(allocate(eur(100), [1, 1, 1]))).toEqual([34, 33, 33]);
    // 5×1/3 = 1 r2, 5×2/3 = 3 r1 → the leftover cent goes to index 0 (larger remainder)
    expect(minors(allocate(eur(5), [1, 2]))).toEqual([2, 3]);
  });

  it('handles 50/50 with an odd number of cents deterministically', () => {
    expect(minors(allocate(eur(1001), [1, 1]))).toEqual([501, 500]);
  });

  it('assigns nothing to zero weights', () => {
    expect(minors(allocate(eur(1000), [0, 1]))).toEqual([0, 1000]);
  });

  it('works with negative totals (refunds)', () => {
    const parts = allocate(eur(-10), [1, 1, 1]);
    expect(minors(parts)).toEqual([-4, -3, -3]);
  });

  it('rejects invalid weights', () => {
    expectDomainError(() => allocate(eur(100), []), 'INVALID_WEIGHTS');
    expectDomainError(() => allocate(eur(100), [0, 0]), 'INVALID_WEIGHTS');
    expectDomainError(() => allocate(eur(100), [-1, 2]), 'INVALID_WEIGHTS');
    expectDomainError(() => allocate(eur(100), [0.5, 0.5]), 'INVALID_WEIGHTS');
  });

  it('keeps the currency', () => {
    expect(allocate(money(100, 'USD'), [1, 1]).every((p) => p.currency === 'USD')).toBe(true);
  });
});

describe('parseMoney()', () => {
  const cases: [string, number][] = [
    ['42', 4200],
    ['42,35', 4235],
    ['42.35', 4235],
    ['18,5', 1850],
    ['0,05', 5],
    ['1.234', 123400],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1.234.567,89', 123456789],
    ['42,35 €', 4235],
    ['€ 42', 4200],
    ['42 euros', 4200],
    ['42EUR', 4200],
    ['-5,10', -510],
    ['  890  ', 89000],
  ];
  it.each(cases)('parses %s', (input, expected) => {
    expect(parseMoney(input, 'EUR').amountMinor).toBe(expected);
  });

  it.each(['', 'abc', '12,345,67', '1..2', '42,', ',5', '1.2.3', '12a', '--5'])('rejects %s', (input) => {
    expectDomainError(() => parseMoney(input, 'EUR'), 'INVALID_AMOUNT');
  });

  it('refuses to round silently when there are too many decimals', () => {
    expectDomainError(() => parseMoney('12,345 6', 'EUR'), 'INVALID_AMOUNT');
    expectDomainError(() => parseMoney('0,001', 'EUR'), 'INVALID_AMOUNT');
  });
});

describe('currencyMarkers()', () => {
  const markers: [string, 'EUR' | 'USD' | 'PEN'][] = [
    ['€', 'EUR'],
    ['EUR', 'EUR'],
    ['euro', 'EUR'],
    ['euros', 'EUR'],
    ['$', 'USD'],
    ['USD', 'USD'],
    ['S/', 'PEN'],
    ['PEN', 'PEN'],
  ];

  it.each(markers)('classifies %s', (marker, currency) => {
    expect(currencyMarkers(marker)).toEqual([currency]);
  });

  it.each([
    ['€42', 'EUR'],
    ['€ 42', 'EUR'],
    ['42€', 'EUR'],
    ['42 €', 'EUR'],
    ['EUR42', 'EUR'],
    ['EUR 42', 'EUR'],
    ['42EUR', 'EUR'],
    ['42 EUR', 'EUR'],
    ['euro42', 'EUR'],
    ['euro 42', 'EUR'],
    ['42euro', 'EUR'],
    ['42 euro', 'EUR'],
    ['euros42', 'EUR'],
    ['euros 42', 'EUR'],
    ['42euros', 'EUR'],
    ['42 euros', 'EUR'],
    ['$42', 'USD'],
    ['42 $', 'USD'],
    ['S/42', 'PEN'],
    ['42PEN', 'PEN'],
  ] as const)('finds the %s marker around an amount', (text, currency) => {
    expect(currencyMarkers(text)).toEqual([currency]);
  });

  it('returns distinct codes in order of appearance', () => {
    expect(currencyMarkers('€42 USD 10 euros')).toEqual(['EUR', 'USD']);
  });

  it('returns no codes when there is no currency marker', () => {
    expect(currencyMarkers('42 comida mercadona')).toEqual([]);
  });
});

describe('formatting', () => {
  it('produces exact decimal strings', () => {
    expect(toMajorString(eur(4235))).toBe('42.35');
    expect(toMajorString(eur(5))).toBe('0.05');
    expect(toMajorString(eur(-250))).toBe('-2.50');
    expect(toMajorString(eur(0))).toBe('0.00');
  });

  it('formats for display in Spanish locale', () => {
    // Intl uses a narrow no-break space before €.
    expect(format(eur(4235)).replace(/\s/g, ' ')).toBe('42,35 €');
    expect(format(eur(195001)).replace(/\s/g, ' ')).toBe('1.950,01 €');
  });
});
