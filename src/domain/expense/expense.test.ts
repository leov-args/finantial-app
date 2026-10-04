import { describe, expect, it } from 'vitest';
import { FOOD, HOUSING, ANA, PARTNER, T0, T1 } from '../../test/fixtures.ts';
import { addMonths, asIsoDate, asYearMonth } from '../shared/dates.ts';
import { asExpenseId, asReceiptId } from '../shared/ids.ts';
import { money } from '../money/money.ts';
import {
  type Expense,
  type ExpenseProps,
  buildExpense,
  expensesOfType,
  expensesPaidBy,
  individualExpensesOf,
  monthlyExpenseTotals,
  ownerOf,
  sharedExpenses,
  recurrenceFromDate,
  totalOf,
  totalsBy,
  updateExpense,
  validateRecurrence,
} from './expense.ts';

describe('totalsBy and recurrenceFromDate', () => {
  it('groups exact totals by key', () => {
    const list = [
      expense({ amount: money(1000, 'EUR') }),
      expense({ amount: money(1, 'EUR'), categoryId: HOUSING }),
      expense({ amount: money(2, 'EUR') }),
    ];
    expect(totalsBy(list, (e) => e.categoryId, 'EUR')).toEqual(
      new Map([
        [FOOD, money(1002, 'EUR')],
        [HOUSING, money(1, 'EUR')],
      ]),
    );
    expect(totalsBy([], (e) => e.paidBy, 'EUR').size).toBe(0);
  });

  it('anchors the recurrence on the date', () => {
    const date = asIsoDate('2026-10-04'); // a Sunday
    expect(recurrenceFromDate('WEEKLY', date)).toEqual({ frequency: 'WEEKLY', dayOfWeek: 7 });
    expect(recurrenceFromDate('MONTHLY', date)).toEqual({ frequency: 'MONTHLY', dayOfMonth: 4 });
    expect(recurrenceFromDate('YEARLY', date)).toEqual({ frequency: 'YEARLY', month: 10, day: 4 });
  });

  it('P4 aggregates exact monthly totals, preserving empty months and the requested range', () => {
    const lastMonth = asYearMonth('2026-10');
    const months = Array.from({ length: 6 }, (_, index) => addMonths(lastMonth, index - 5));
    const list = [
      expense({ amount: money(5000, 'EUR'), date: asIsoDate('2026-05-04') }),
      expense({ amount: money(7500, 'EUR'), date: asIsoDate('2026-06-20') }),
      expense({ amount: money(25000, 'EUR'), date: asIsoDate('2026-10-02') }),
      expense({ amount: money(999, 'EUR'), date: asIsoDate('2026-04-30') }),
    ];

    expect(monthlyExpenseTotals(list, months, 'EUR')).toEqual([
      { month: asYearMonth('2026-05'), total: money(5000, 'EUR') },
      { month: asYearMonth('2026-06'), total: money(7500, 'EUR') },
      { month: asYearMonth('2026-07'), total: money(0, 'EUR') },
      { month: asYearMonth('2026-08'), total: money(0, 'EUR') },
      { month: asYearMonth('2026-09'), total: money(0, 'EUR') },
      { month: asYearMonth('2026-10'), total: money(25000, 'EUR') },
    ]);
  });
});

let seq = 0;
function expense(overrides: Partial<ExpenseProps> = {}): Expense {
  seq += 1;
  return buildExpense({
    id: asExpenseId(`exp-${seq}`),
    description: 'Compra semanal',
    merchant: 'Mercadona',
    amount: money(4235, 'EUR'),
    date: asIsoDate('2026-10-02'),
    categoryId: FOOD,
    expenseType: 'VARIABLE',
    scope: { type: 'SHARED' },
    paidBy: ANA,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  });
}

describe('Expense', () => {
  it('builds a shared variable expense with defaults', () => {
    const e = expense();
    expect(e.scope).toEqual({ type: 'SHARED' });
    expect(e.recurrence).toBeNull();
    expect(e.receiptId).toBeNull();
    expect(e.notes).toBe('');
    expect(ownerOf(e)).toBeNull();
  });

  it('builds an individual expense that names its owner, independent of who paid', () => {
    const e = expense({ scope: { type: 'INDIVIDUAL', ownerId: PARTNER }, paidBy: ANA });
    expect(ownerOf(e)).toBe(PARTNER);
    expect(e.paidBy).toBe(ANA);
  });

  it('builds a fixed recurring expense (rent)', () => {
    const rent = expense({
      description: 'Alquiler',
      merchant: null,
      amount: money(89000, 'EUR'),
      categoryId: HOUSING,
      expenseType: 'FIXED',
      recurrence: { frequency: 'MONTHLY', dayOfMonth: 1 },
    });
    expect(rent.expenseType).toBe('FIXED');
    expect(rent.recurrence).toEqual({ frequency: 'MONTHLY', dayOfMonth: 1 });
    expect(rent.merchant).toBeNull();
  });

  it('rejects non-positive amounts, empty descriptions and unknown types', () => {
    expect(() => expense({ amount: money(0, 'EUR') })).toThrow(/greater than zero/);
    expect(() => expense({ description: '  ' })).toThrow(/empty/);
    expect(() => expense({ expenseType: 'SOMETIMES' as 'FIXED' })).toThrow(/type/);
  });

  it('cleans text and treats blank merchant as null', () => {
    const e = expense({ merchant: '   ', notes: '  nota\u0007  ' });
    expect(e.merchant).toBeNull();
    expect(e.notes).toBe('nota');
  });

  it('keeps HTML-looking text as inert plain text', () => {
    const e = expense({ notes: '<img src=x onerror=alert(1)>' });
    expect(e.notes).toBe('<img src=x onerror=alert(1)>');
  });

  it('links a receipt', () => {
    expect(expense({ receiptId: asReceiptId('rcp-1') }).receiptId).toBe('rcp-1');
  });

  it('updates immutably, re-validating and keeping createdAt', () => {
    const e = expense();
    const updated = updateExpense(e, { amount: money(5000, 'EUR'), scope: { type: 'INDIVIDUAL', ownerId: ANA } }, T1);
    expect(updated.amount.amountMinor).toBe(5000);
    expect(updated.createdAt).toBe(T0);
    expect(updated.updatedAt).toBe(T1);
    expect(e.amount.amountMinor).toBe(4235);
    expect(() => updateExpense(e, { amount: money(-1, 'EUR') }, T1)).toThrow();
  });
});

describe('recurrence', () => {
  it('validates weekly, monthly and yearly rules', () => {
    expect(validateRecurrence({ frequency: 'WEEKLY', dayOfWeek: 1 })).toEqual({ frequency: 'WEEKLY', dayOfWeek: 1 });
    expect(validateRecurrence({ frequency: 'MONTHLY', dayOfMonth: 31 })).toEqual({ frequency: 'MONTHLY', dayOfMonth: 31 });
    expect(validateRecurrence({ frequency: 'YEARLY', month: 2, day: 29 })).toEqual({ frequency: 'YEARLY', month: 2, day: 29 });
  });

  it.each([
    { frequency: 'WEEKLY', dayOfWeek: 0 },
    { frequency: 'WEEKLY', dayOfWeek: 8 },
    { frequency: 'MONTHLY', dayOfMonth: 0 },
    { frequency: 'MONTHLY', dayOfMonth: 32 },
    { frequency: 'MONTHLY', dayOfMonth: 1.5 },
    { frequency: 'YEARLY', month: 4, day: 31 },
    { frequency: 'YEARLY', month: 13, day: 1 },
  ] as const)('rejects %o', (r) => {
    expect(() => validateRecurrence(r)).toThrow();
  });
});

describe('expense list queries', () => {
  const list = [
    expense({ amount: money(89000, 'EUR'), expenseType: 'FIXED', paidBy: ANA }),
    expense({ amount: money(4235, 'EUR'), paidBy: PARTNER }),
    expense({ amount: money(2000, 'EUR'), scope: { type: 'INDIVIDUAL', ownerId: ANA }, paidBy: ANA }),
    expense({ amount: money(1500, 'EUR'), scope: { type: 'INDIVIDUAL', ownerId: PARTNER }, paidBy: ANA }),
  ];

  it('separates shared and individual expenses', () => {
    expect(totalOf(sharedExpenses(list), 'EUR').amountMinor).toBe(93235);
    expect(totalOf(individualExpensesOf(list, PARTNER), 'EUR').amountMinor).toBe(1500);
  });

  it('separates fixed and variable expenses', () => {
    expect(expensesOfType(list, 'FIXED')).toHaveLength(1);
    expect(expensesOfType(list, 'VARIABLE')).toHaveLength(3);
  });

  it('filters by payer', () => {
    expect(totalOf(expensesPaidBy(list, ANA), 'EUR').amountMinor).toBe(92500);
    expect(totalOf(expensesPaidBy(list, PARTNER), 'EUR').amountMinor).toBe(4235);
  });

  it('rejects totals over mixed currencies', () => {
    expect(() => totalOf([...list, expense({ amount: money(100, 'USD') })], 'EUR')).toThrow(/Currency conversion/);
  });
});
