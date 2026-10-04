import { describe, expect, it } from 'vitest';
import { FOOD, HOUSING, ANA, PARTNER, T0 } from '../../test/fixtures.ts';
import { type Expense, type ExpenseProps, buildExpense } from '../expense/expense.ts';
import { type Income, buildIncome } from '../income/income.ts';
import { money } from '../money/money.ts';
import { asIsoDate, asYearMonth } from '../shared/dates.ts';
import { type MemberId, asExpenseId, asIncomeId } from '../shared/ids.ts';
import { personalMonth } from './personal-month.ts';

const eur = (amountMinor: number) => money(amountMinor, 'EUR');
let seq = 0;

function mine(amountMinor: number, date: string, overrides: Partial<ExpenseProps> = {}): Expense {
  seq += 1;
  return buildExpense({
    id: asExpenseId(`exp-${seq}`),
    description: 'Gasto',
    amount: eur(amountMinor),
    date: asIsoDate(date),
    categoryId: FOOD,
    expenseType: 'VARIABLE',
    scope: { type: 'INDIVIDUAL', ownerId: ANA },
    paidBy: ANA,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  });
}

function income(memberId: MemberId, amountMinor: number): Income {
  seq += 1;
  return buildIncome({
    id: asIncomeId(`inc-${seq}`),
    memberId,
    amount: eur(amountMinor),
    date: asIsoDate('2026-10-02'),
    schedule: { kind: 'ONE_OFF' },
    source: 'BONUS',
    createdAt: T0,
    updatedAt: T0,
  });
}

const october = asYearMonth('2026-10');

describe('personalMonth', () => {
  it('P1–P4: savings, the month list, categories and six months of history for «yo» only', () => {
    const expenses = [
      mine(10000, '2026-10-02'),
      mine(3000, '2026-10-05', { categoryId: HOUSING }),
      mine(2000, '2026-08-10'),
      mine(999, '2026-04-30'), // before the six-month window
      mine(7000, '2026-10-03', { scope: { type: 'INDIVIDUAL', ownerId: PARTNER } }),
      mine(5000, '2026-10-03', { scope: { type: 'SHARED' } }),
    ];
    const result = personalMonth({
      memberId: ANA,
      month: october,
      referenceIncome: eur(260000),
      contribution: eur(50000),
      incomes: [income(ANA, 20000), income(PARTNER, 9000)],
      expenses,
      currency: 'EUR',
    });

    expect(result.extraIncome).toEqual(eur(20000));
    expect(result.household).toEqual(eur(50000));
    expect(result.spent).toEqual(eur(13000));
    expect(result.savings).toEqual(eur(260000 + 20000 - 50000 - 13000));
    expect(result.expenses.map((e) => e.amount.amountMinor)).toEqual([10000, 3000]);
    expect(result.byCategory).toEqual([
      { categoryId: FOOD, total: eur(10000), share: 7692 },
      { categoryId: HOUSING, total: eur(3000), share: 2308 },
    ]);
    expect(result.history.map((h) => [h.month, h.total.amountMinor])).toEqual([
      ['2026-05', 0],
      ['2026-06', 0],
      ['2026-07', 0],
      ['2026-08', 2000],
      ['2026-09', 0],
      ['2026-10', 13000],
    ]);
  });

  it('P1: without a reference income there is no saving to show, and no contribution means zero', () => {
    const result = personalMonth({
      memberId: ANA,
      month: october,
      referenceIncome: null,
      contribution: null,
      incomes: [],
      expenses: [mine(10000, '2026-10-02')],
      currency: 'EUR',
    });

    expect(result.savings).toBeNull();
    expect(result.household).toEqual(eur(0));
    expect(result.spent).toEqual(eur(10000));
  });
});
