import { DomainError } from '../shared/errors.ts';
import { type IsoDate, type Timestamp, type YearMonth, monthRange, yearRange } from '../shared/dates.ts';
import type { IncomeId, MemberId } from '../shared/ids.ts';
import { TEXT_LIMITS, cleanText } from '../shared/text.ts';
import type { CurrencyCode } from '../money/currency.ts';
import { type BasisPoints, type Money, add, isPositive, shareInBasisPoints, sum, zero } from '../money/money.ts';

export const INCOME_SOURCES = ['SALARY', 'FREELANCE', 'BONUS', 'OTHER'] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];

/**
 * How the income behaves. A discriminated union, so "one-off + fixed" (which
 * means nothing) cannot be represented.
 *
 *  - MONTHLY / FIXED     e.g. salary
 *  - MONTHLY / VARIABLE  e.g. freelance billing that changes every month
 *  - ONE_OFF             e.g. bonus, gift, tax refund
 */
export type IncomeSchedule =
  | { readonly kind: 'MONTHLY'; readonly variability: 'FIXED' | 'VARIABLE' }
  | { readonly kind: 'ONE_OFF' };

/**
 * An income record is money actually received by a member on a date
 * (ADR-006). The schedule is descriptive metadata: it does NOT project the
 * amount into other months. Monthly/annual totals are sums of records dated
 * in the period, which keeps history exact when a salary changes.
 */
export interface Income {
  readonly id: IncomeId;
  readonly memberId: MemberId;
  readonly amount: Money;
  readonly date: IsoDate;
  readonly schedule: IncomeSchedule;
  readonly source: IncomeSource;
  readonly description: string;
  readonly notes: string;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export type IncomeProps = Omit<Income, 'description' | 'notes'> & {
  readonly description?: string;
  readonly notes?: string;
};

export function buildIncome(props: IncomeProps): Income {
  if (!isPositive(props.amount)) {
    throw new DomainError('INVALID_INCOME', 'Income amount must be greater than zero.');
  }
  if (!INCOME_SOURCES.includes(props.source)) {
    throw new DomainError('INVALID_INCOME', `Unknown income source "${String(props.source)}".`);
  }
  return Object.freeze({
    id: props.id,
    memberId: props.memberId,
    amount: props.amount,
    date: props.date,
    schedule: Object.freeze({ ...props.schedule }),
    source: props.source,
    description: cleanText(props.description ?? '', TEXT_LIMITS.description),
    notes: cleanText(props.notes ?? '', TEXT_LIMITS.notes),
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  });
}

export type IncomeChanges = Partial<Omit<IncomeProps, 'id' | 'createdAt' | 'updatedAt'>>;

export function updateIncome(income: Income, changes: IncomeChanges, now: Timestamp): Income {
  return buildIncome({ ...income, ...changes, id: income.id, createdAt: income.createdAt, updatedAt: now });
}

// ── Calculations ────────────────────────────────────────────────────────

const inRange = (date: IsoDate, from: IsoDate, to: IsoDate): boolean => date >= from && date <= to;

/** Total income dated within [from, to]. Mixed currencies are rejected by `sum`. */
export function totalIncome(incomes: readonly Income[], from: IsoDate, to: IsoDate, currency: CurrencyCode): Money {
  return sum(
    incomes.filter((i) => inRange(i.date, from, to)).map((i) => i.amount),
    currency,
  );
}

export function monthlyIncome(incomes: readonly Income[], month: YearMonth, currency: CurrencyCode): Money {
  const { from, to } = monthRange(month);
  return totalIncome(incomes, from, to, currency);
}

export function annualIncome(incomes: readonly Income[], year: number, currency: CurrencyCode): Money {
  const { from, to } = yearRange(year);
  return totalIncome(incomes, from, to, currency);
}

export interface MemberIncomeShare {
  readonly memberId: MemberId;
  readonly amount: Money;
  /** Display-only share (7273 = 72.73 %). Contribution maths uses the amounts, not this. */
  readonly shareBasisPoints: BasisPoints;
}

/**
 * Income per member within [from, to], including members with no income
 * (they appear with zero). Order follows `memberIds`, so output is stable.
 */
export function incomeByMember(
  incomes: readonly Income[],
  memberIds: readonly MemberId[],
  from: IsoDate,
  to: IsoDate,
  currency: CurrencyCode,
): MemberIncomeShare[] {
  const totals = new Map<MemberId, Money>(memberIds.map((id) => [id, zero(currency)]));
  for (const income of incomes) {
    if (!inRange(income.date, from, to)) continue;
    const current = totals.get(income.memberId);
    if (current) totals.set(income.memberId, add(current, income.amount));
  }
  const grandTotal = sum([...totals.values()], currency);
  return memberIds.map((memberId) => {
    const amount = totals.get(memberId) ?? zero(currency);
    return { memberId, amount, shareBasisPoints: shareInBasisPoints(amount, grandTotal) };
  });
}
