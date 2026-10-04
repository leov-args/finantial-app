import { type Expense, type MonthlyExpenseTotal, individualExpensesOf, monthlyExpenseTotals, totalOf, totalsBy } from '../expense/expense.ts';
import type { Income } from '../income/income.ts';
import type { CurrencyCode } from '../money/currency.ts';
import { type BasisPoints, type Money, add, shareInBasisPoints, subtract, sum, zero } from '../money/money.ts';
import { type YearMonth, addMonths, yearMonthOf } from '../shared/dates.ts';
import type { CategoryId, MemberId } from '../shared/ids.ts';

/** Months shown in the personal evolution chart, ending with the selected one (P4). */
export const HISTORY_MONTHS = 6;

/** The months of the evolution chart, oldest first. */
export const historyMonths = (month: YearMonth): YearMonth[] =>
  Array.from({ length: HISTORY_MONTHS }, (_, index) => addMonths(month, index - (HISTORY_MONTHS - 1)));

export interface CategoryTotal {
  readonly categoryId: CategoryId;
  readonly total: Money;
  /** total ÷ spent, for DISPLAY only. */
  readonly share: BasisPoints;
}

export interface PersonalMonth {
  readonly referenceIncome: Money | null;
  /** Σ incomes recorded for the member in the month (Q4, Q5). */
  readonly extraIncome: Money;
  /** The member's household contribution (F4); zero when not part of the split. */
  readonly household: Money;
  /** Σ of the member's individual expenses in the month (P2). */
  readonly spent: Money;
  /** referenceIncome + extraIncome − household − spent; `null` without a reference income (P1). */
  readonly savings: Money | null;
  /** The member's individual expenses of the month, in input order (P6). */
  readonly expenses: readonly Expense[];
  /** Largest first (P3). */
  readonly byCategory: readonly CategoryTotal[];
  /** HISTORY_MONTHS totals ending with `month`, empty months at zero (P4). */
  readonly history: readonly MonthlyExpenseTotal[];
}

/**
 * P1–P4 for one member and month. `incomes` must be the month's incomes and
 * `expenses` cover at least the history window; both may include other members.
 */
export function personalMonth(input: {
  readonly memberId: MemberId;
  readonly month: YearMonth;
  readonly referenceIncome: Money | null;
  readonly contribution: Money | null;
  readonly incomes: readonly Income[];
  readonly expenses: readonly Expense[];
  readonly currency: CurrencyCode;
}): PersonalMonth {
  const { memberId, month, referenceIncome, currency } = input;
  const own = individualExpensesOf(input.expenses, memberId);
  const expenses = own.filter((expense) => yearMonthOf(expense.date) === month);
  const extraIncome = sum(input.incomes.filter((income) => income.memberId === memberId).map((income) => income.amount), currency);
  const household = input.contribution ?? zero(currency);
  const spent = totalOf(expenses, currency);
  const savings = referenceIncome && subtract(subtract(add(referenceIncome, extraIncome), household), spent);
  const byCategory = [...totalsBy(expenses, (expense) => expense.categoryId, currency)]
    .map(([categoryId, total]) => ({ categoryId, total, share: shareInBasisPoints(total, spent) }))
    .sort((a, b) => b.total.amountMinor - a.total.amountMinor);

  return Object.freeze({
    referenceIncome,
    extraIncome,
    household,
    spent,
    savings,
    expenses: Object.freeze(expenses),
    byCategory: Object.freeze(byCategory),
    history: Object.freeze(monthlyExpenseTotals(own, historyMonths(month), currency)),
  });
}
