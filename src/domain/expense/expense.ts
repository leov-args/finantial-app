import { DomainError } from '../shared/errors.ts';
import { type IsoDate, type Timestamp, type YearMonth, daysInMonth, yearMonthOf } from '../shared/dates.ts';
import type { CategoryId, ExpenseId, MemberId, ReceiptId } from '../shared/ids.ts';
import { TEXT_LIMITS, cleanText, requireName } from '../shared/text.ts';
import type { CurrencyCode } from '../money/currency.ts';
import { type Money, add, isPositive, sum, zero } from '../money/money.ts';

export const EXPENSE_TYPES = ['FIXED', 'VARIABLE'] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

/**
 * Who the expense belongs to (not who paid it — that is `paidBy`).
 * An INDIVIDUAL expense always names its owner; a SHARED one belongs to the
 * household and is what the contribution engine (Phase 2) splits.
 */
export type ExpenseScope =
  | { readonly type: 'SHARED' }
  | { readonly type: 'INDIVIDUAL'; readonly ownerId: MemberId };

/**
 * Recurrence describes a repeating expense (rent, Netflix). It is metadata
 * only: nothing generates future expenses automatically (ADR-007).
 *
 * dayOfMonth 29–31 means "that day, or the last day of shorter months".
 * dayOfWeek follows ISO-8601: 1 = Monday … 7 = Sunday.
 */
export type Recurrence =
  | { readonly frequency: 'WEEKLY'; readonly dayOfWeek: number }
  | { readonly frequency: 'MONTHLY'; readonly dayOfMonth: number }
  | { readonly frequency: 'YEARLY'; readonly month: number; readonly day: number };

export const RECURRENCE_FREQUENCIES = ['WEEKLY', 'MONTHLY', 'YEARLY'] as const;

/** A real money transaction. Settlements between members are NOT expenses. */
export interface Expense {
  readonly id: ExpenseId;
  readonly description: string;
  readonly merchant: string | null;
  readonly amount: Money;
  readonly date: IsoDate;
  readonly categoryId: CategoryId;
  readonly expenseType: ExpenseType;
  readonly scope: ExpenseScope;
  readonly paidBy: MemberId;
  readonly recurrence: Recurrence | null;
  readonly notes: string;
  readonly receiptId: ReceiptId | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export type ExpenseProps = Omit<Expense, 'merchant' | 'recurrence' | 'notes' | 'receiptId'> & {
  readonly merchant?: string | null;
  readonly recurrence?: Recurrence | null;
  readonly notes?: string;
  readonly receiptId?: ReceiptId | null;
};

const isIntInRange = (n: number, min: number, max: number): boolean => Number.isInteger(n) && n >= min && n <= max;

export function validateRecurrence(r: Recurrence): Recurrence {
  const fail = (msg: string): never => {
    throw new DomainError('INVALID_RECURRENCE', msg);
  };
  switch (r.frequency) {
    case 'WEEKLY':
      if (!isIntInRange(r.dayOfWeek, 1, 7)) fail('dayOfWeek must be 1 (Monday) … 7 (Sunday).');
      return Object.freeze({ frequency: 'WEEKLY', dayOfWeek: r.dayOfWeek });
    case 'MONTHLY':
      if (!isIntInRange(r.dayOfMonth, 1, 31)) fail('dayOfMonth must be 1 … 31.');
      return Object.freeze({ frequency: 'MONTHLY', dayOfMonth: r.dayOfMonth });
    case 'YEARLY':
      // 2024 is a leap year, so 29 February is a valid yearly date.
      if (!isIntInRange(r.month, 1, 12) || !isIntInRange(r.day, 1, daysInMonth(2024, r.month))) {
        fail('Yearly recurrence needs a valid month and day.');
      }
      return Object.freeze({ frequency: 'YEARLY', month: r.month, day: r.day });
    default:
      return fail(`Unknown recurrence ${JSON.stringify(r satisfies never)}.`);
  }
}

export function buildExpense(props: ExpenseProps): Expense {
  if (!isPositive(props.amount)) {
    throw new DomainError('INVALID_EXPENSE', 'Expense amount must be greater than zero.');
  }
  if (!EXPENSE_TYPES.includes(props.expenseType)) {
    throw new DomainError('INVALID_EXPENSE', `Unknown expense type "${String(props.expenseType)}".`);
  }
  const scope: ExpenseScope =
    props.scope.type === 'SHARED'
      ? Object.freeze({ type: 'SHARED' })
      : Object.freeze({ type: 'INDIVIDUAL', ownerId: props.scope.ownerId });

  const merchant = props.merchant ? cleanText(props.merchant, TEXT_LIMITS.merchant) : '';

  return Object.freeze({
    id: props.id,
    description: requireName(props.description, TEXT_LIMITS.description, 'Expense description'),
    merchant: merchant.length > 0 ? merchant : null,
    amount: props.amount,
    date: props.date,
    categoryId: props.categoryId,
    expenseType: props.expenseType,
    scope,
    paidBy: props.paidBy,
    recurrence: props.recurrence ? validateRecurrence(props.recurrence) : null,
    notes: cleanText(props.notes ?? '', TEXT_LIMITS.notes),
    receiptId: props.receiptId ?? null,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  });
}

export type ExpenseChanges = Partial<Omit<ExpenseProps, 'id' | 'createdAt' | 'updatedAt'>>;

/** Returns a new, re-validated expense. The original is never mutated (enables undo). */
export function updateExpense(expense: Expense, changes: ExpenseChanges, now: Timestamp): Expense {
  return buildExpense({ ...expense, ...changes, id: expense.id, createdAt: expense.createdAt, updatedAt: now });
}

// ── Queries over lists (pure) ───────────────────────────────────────────

export const isShared = (e: Expense): boolean => e.scope.type === 'SHARED';

/** Member the expense is attributed to, or null when it is shared. */
export const ownerOf = (e: Expense): MemberId | null => (e.scope.type === 'INDIVIDUAL' ? e.scope.ownerId : null);

export const sharedExpenses = (list: readonly Expense[]): Expense[] => list.filter(isShared);

export const individualExpensesOf = (list: readonly Expense[], memberId: MemberId): Expense[] =>
  list.filter((e) => ownerOf(e) === memberId);

export const expensesPaidBy = (list: readonly Expense[], memberId: MemberId): Expense[] =>
  list.filter((e) => e.paidBy === memberId);

export const expensesOfType = (list: readonly Expense[], type: ExpenseType): Expense[] =>
  list.filter((e) => e.expenseType === type);

/** Sum of amounts. Throws CURRENCY_MISMATCH if the list mixes currencies. */
export const totalOf = (list: readonly Expense[], currency: CurrencyCode): Money =>
  sum(
    list.map((e) => e.amount),
    currency,
  );

/** Totals grouped by `key` (category, payer…), in first-seen order. */
export function totalsBy<K>(list: readonly Expense[], key: (e: Expense) => K, currency: CurrencyCode): Map<K, Money> {
  const totals = new Map<K, Money>();
  for (const e of list) totals.set(key(e), add(totals.get(key(e)) ?? zero(currency), e.amount));
  return totals;
}

export interface MonthlyExpenseTotal {
  readonly month: YearMonth;
  readonly total: Money;
}

/** Exact totals for the requested months, including zeroes for months without expenses (P4). */
export function monthlyExpenseTotals(
  list: readonly Expense[],
  months: readonly YearMonth[],
  currency: CurrencyCode,
): MonthlyExpenseTotal[] {
  const totals = new Map<YearMonth, Money>(months.map((month) => [month, zero(currency)]));
  for (const expense of list) {
    const month = yearMonthOf(expense.date);
    const current = totals.get(month);
    if (current) totals.set(month, add(current, expense.amount));
  }
  return months.map((month) => ({ month, total: totals.get(month) ?? zero(currency) }));
}

/**
 * Recurrence anchored on the expense date ("monthly" on 2026-10-15 → day 15),
 * so the form only has to ask how often it repeats.
 */
export function recurrenceFromDate(frequency: Recurrence['frequency'], date: IsoDate): Recurrence {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  switch (frequency) {
    case 'WEEKLY':
      return { frequency, dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7 };
    case 'MONTHLY':
      return { frequency, dayOfMonth: day };
    case 'YEARLY':
      return { frequency, month, day };
  }
}
