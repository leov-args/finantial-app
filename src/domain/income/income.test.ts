import { describe, expect, it } from 'vitest';
import { ANA, PARTNER, T0, T1 } from '../../test/fixtures.ts';
import { asIsoDate, asYearMonth } from '../shared/dates.ts';
import { asIncomeId, asMemberId } from '../shared/ids.ts';
import { money } from '../money/money.ts';
import { type Income, type IncomeProps, annualIncome, buildIncome, incomeByMember, monthlyIncome, updateIncome } from './income.ts';

let seq = 0;
function income(overrides: Partial<IncomeProps> = {}): Income {
  seq += 1;
  return buildIncome({
    id: asIncomeId(`inc-${seq}`),
    memberId: ANA,
    amount: money(400000, 'EUR'),
    date: asIsoDate('2026-10-01'),
    schedule: { kind: 'MONTHLY', variability: 'FIXED' },
    source: 'SALARY',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  });
}

describe('Income', () => {
  it('builds monthly fixed, monthly variable and one-off income', () => {
    expect(income().schedule).toEqual({ kind: 'MONTHLY', variability: 'FIXED' });
    expect(income({ schedule: { kind: 'MONTHLY', variability: 'VARIABLE' }, source: 'FREELANCE' }).source).toBe('FREELANCE');
    expect(income({ schedule: { kind: 'ONE_OFF' }, source: 'BONUS' }).schedule.kind).toBe('ONE_OFF');
  });

  it('rejects zero and negative amounts', () => {
    expect(() => income({ amount: money(0, 'EUR') })).toThrow(/greater than zero/);
    expect(() => income({ amount: money(-100, 'EUR') })).toThrow(/greater than zero/);
  });

  it('rejects unknown sources', () => {
    expect(() => income({ source: 'LOTTERY' as 'OTHER' })).toThrow(/source/);
  });

  it('updates immutably and keeps createdAt', () => {
    const original = income({ description: 'Nómina' });
    const updated = updateIncome(original, { amount: money(410000, 'EUR') }, T1);
    expect(updated.amount.amountMinor).toBe(410000);
    expect(updated.createdAt).toBe(T0);
    expect(updated.updatedAt).toBe(T1);
    expect(original.amount.amountMinor).toBe(400000);
  });
});

describe('income calculations', () => {
  const list = [
    income({ memberId: ANA, amount: money(400000, 'EUR'), date: asIsoDate('2026-10-01') }),
    income({ memberId: PARTNER, amount: money(150000, 'EUR'), date: asIsoDate('2026-10-03') }),
    income({ memberId: ANA, amount: money(400000, 'EUR'), date: asIsoDate('2026-09-01') }),
    income({ memberId: ANA, amount: money(50000, 'EUR'), date: asIsoDate('2026-10-31'), schedule: { kind: 'ONE_OFF' }, source: 'BONUS' }),
    income({ memberId: PARTNER, amount: money(150000, 'EUR'), date: asIsoDate('2025-12-31') }),
  ];

  it('computes monthly income from records dated in the month', () => {
    expect(monthlyIncome(list, asYearMonth('2026-10'), 'EUR').amountMinor).toBe(600000);
    expect(monthlyIncome(list, asYearMonth('2026-11'), 'EUR').amountMinor).toBe(0);
  });

  it('computes annual income', () => {
    expect(annualIncome(list, 2026, 'EUR').amountMinor).toBe(1000000);
    expect(annualIncome(list, 2025, 'EUR').amountMinor).toBe(150000);
  });

  it('computes income share per member (display percentage)', () => {
    const shares = incomeByMember(
      [list[0], list[1]].filter((i): i is Income => i !== undefined),
      [ANA, PARTNER],
      asIsoDate('2026-10-01'),
      asIsoDate('2026-10-31'),
      'EUR',
    );
    expect(shares).toEqual([
      { memberId: ANA, amount: money(400000, 'EUR'), shareBasisPoints: 7273 },
      { memberId: PARTNER, amount: money(150000, 'EUR'), shareBasisPoints: 2727 },
    ]);
  });

  it('includes members with zero income and handles all-zero totals', () => {
    const nobody = asMemberId('m-nobody');
    const shares = incomeByMember(list, [nobody], asIsoDate('2026-10-01'), asIsoDate('2026-10-31'), 'EUR');
    expect(shares).toEqual([{ memberId: nobody, amount: money(0, 'EUR'), shareBasisPoints: 0 }]);
  });

  it('rejects mixing currencies in a total', () => {
    const usd = income({ amount: money(100, 'USD'), date: asIsoDate('2026-10-05') });
    expect(() => monthlyIncome([...list, usd], asYearMonth('2026-10'), 'EUR')).toThrow(/Currency conversion/);
  });
});
