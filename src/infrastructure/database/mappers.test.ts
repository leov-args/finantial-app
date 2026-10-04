import { describe, expect, it } from 'vitest';
import { FOOD, ANA, PARTNER, T0 } from '../../test/fixtures.ts';
import { buildExpense } from '../../domain/expense/expense.ts';
import { buildIncome } from '../../domain/income/income.ts';
import { buildPlanItem } from '../../domain/family/plan.ts';
import { createMember, setReferenceIncome } from '../../domain/member/member.ts';
import { money } from '../../domain/money/money.ts';
import { asIsoDate } from '../../domain/shared/dates.ts';
import { asExpenseId, asIncomeId, asPlanItemId } from '../../domain/shared/ids.ts';
import {
  expenseFromRecord,
  expenseToRecord,
  incomeFromRecord,
  incomeToRecord,
  memberFromRecord,
  memberToRecord,
  planItemFromRecord,
  planItemToRecord,
  settingsFromRecord,
} from './mappers.ts';

describe('mappers', () => {
  const expense = buildExpense({
    id: asExpenseId('e1'),
    description: 'Gafas',
    merchant: 'Óptica',
    amount: money(12999, 'EUR'),
    date: asIsoDate('2026-10-02'),
    categoryId: FOOD,
    expenseType: 'VARIABLE',
    scope: { type: 'INDIVIDUAL', ownerId: PARTNER },
    paidBy: ANA,
    recurrence: { frequency: 'YEARLY', month: 10, day: 2 },
    createdAt: T0,
    updatedAt: T0,
  });

  it('round-trips an expense exactly', () => {
    const record = expenseToRecord(expense);
    expect(record).toMatchObject({ amountMinor: 12999, currency: 'EUR', scopeType: 'INDIVIDUAL', ownerId: PARTNER });
    expect(expenseFromRecord(record)).toEqual(expense);
  });

  it('round-trips monthly and one-off income', () => {
    const base = {
      id: asIncomeId('i1'),
      memberId: ANA,
      amount: money(400000, 'EUR'),
      date: asIsoDate('2026-10-01'),
      source: 'SALARY' as const,
      createdAt: T0,
      updatedAt: T0,
    };
    for (const schedule of [{ kind: 'MONTHLY', variability: 'VARIABLE' } as const, { kind: 'ONE_OFF' } as const]) {
      const income = buildIncome({ ...base, schedule });
      expect(incomeFromRecord(incomeToRecord(income))).toEqual(income);
    }
  });

  it('rejects corrupted records instead of reading wrong numbers', () => {
    const good = expenseToRecord(expense);
    expect(() => expenseFromRecord({ ...good, amountMinor: 12.99 })).toThrow();
    expect(() => expenseFromRecord({ ...good, currency: 'XXX' })).toThrow();
    expect(() => expenseFromRecord({ ...good, date: '2026-02-30' })).toThrow();
    expect(() => expenseFromRecord({ ...good, ownerId: null })).toThrow(/owner/);
    const income = incomeToRecord(buildIncome({
      id: asIncomeId('i2'), memberId: ANA, amount: money(1, 'EUR'), date: asIsoDate('2026-10-01'),
      schedule: { kind: 'MONTHLY', variability: 'FIXED' }, source: 'SALARY', createdAt: T0, updatedAt: T0,
    }));
    expect(() => incomeFromRecord({ ...income, variability: null })).toThrow(/variability/);
  });

  it('round-trips members with and without reference income', () => {
    const member = createMember({ id: ANA, name: 'Ana', color: 'indigo', now: T0 });
    expect(memberFromRecord(memberToRecord(member))).toEqual(member);
    const withIncome = setReferenceIncome(member, money(260000, 'EUR'), T0);
    expect(memberToRecord(withIncome).referenceIncome).toEqual({ amountMinor: 260000, currency: 'EUR' });
    expect(memberFromRecord(memberToRecord(withIncome))).toEqual(withIncome);
  });

  it('rejects a corrupted member color or reference income', () => {
    const good = memberToRecord(createMember({ id: ANA, name: 'Ana', color: 'blue', now: T0 }));
    expect(() => memberFromRecord({ ...good, color: 'green' })).toThrow(/color/);
    expect(() => memberFromRecord({ ...good, referenceIncome: { amountMinor: 1.5, currency: 'EUR' } })).toThrow();
    expect(() => memberFromRecord({ ...good, referenceIncome: { amountMinor: -100, currency: 'EUR' } })).toThrow(/negative/);
    expect(() => memberFromRecord({ ...good, referenceIncome: { amountMinor: 100, currency: 'XXX' } })).toThrow();
  });

  it('round-trips formula and assigned plan items', () => {
    const base = { name: 'Línea', createdAt: T0, updatedAt: T0 };
    const formula = buildPlanItem({ ...base, id: asPlanItemId('p1'), kind: { type: 'FORMULA', amount: money(210001, 'EUR') } });
    const assigned = buildPlanItem({
      ...base,
      id: asPlanItemId('p2'),
      kind: {
        type: 'ASSIGNED',
        shares: [
          { memberId: ANA, amount: money(40000, 'EUR') },
          { memberId: PARTNER, amount: money(0, 'EUR') },
        ],
      },
    });
    expect(planItemToRecord(formula)).toMatchObject({ kind: 'FORMULA', amountMinor: 210001, shares: [] });
    expect(planItemToRecord(assigned)).toMatchObject({ kind: 'ASSIGNED', amountMinor: null, currency: 'EUR' });
    expect(planItemFromRecord(planItemToRecord(formula))).toEqual(formula);
    expect(planItemFromRecord(planItemToRecord(assigned))).toEqual(assigned);

    const good = planItemToRecord(formula);
    expect(() => planItemFromRecord({ ...good, amountMinor: null })).toThrow(/without amount/);
    expect(() => planItemFromRecord({ ...good, kind: 'OTHER' as 'FORMULA' })).toThrow(/kind/);
    expect(() => planItemFromRecord({ ...good, amountMinor: -1 })).toThrow();
  });

  it('rejects an unknown split rule', () => {
    expect(settingsFromRecord({ id: 'household', splitRule: 'PROPORTIONAL' })).toEqual({ splitRule: 'PROPORTIONAL' });
    expect(() => settingsFromRecord({ id: 'household', splitRule: 'RANDOM' })).toThrow(/split rule/);
  });
});
