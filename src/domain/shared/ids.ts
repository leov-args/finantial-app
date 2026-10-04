import { DomainError } from './errors.ts';

declare const brand: unique symbol;

/** Nominal typing: a `MemberId` cannot be passed where an `ExpenseId` is expected. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type MemberId = Brand<string, 'MemberId'>;
export type CategoryId = Brand<string, 'CategoryId'>;
export type IncomeId = Brand<string, 'IncomeId'>;
export type ExpenseId = Brand<string, 'ExpenseId'>;
export type PlanItemId = Brand<string, 'PlanItemId'>;
/** Reserved for Phase 5; declared now so Expense.receiptId is typed. */
export type ReceiptId = Brand<string, 'ReceiptId'>;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function asId<T extends string>(value: string, kind: string): T {
  if (!ID_PATTERN.test(value)) {
    throw new DomainError('INVALID_ID', `Invalid ${kind} id: "${value}"`);
  }
  return value as T;
}

export const asMemberId = (v: string): MemberId => asId<MemberId>(v, 'member');
export const asCategoryId = (v: string): CategoryId => asId<CategoryId>(v, 'category');
export const asIncomeId = (v: string): IncomeId => asId<IncomeId>(v, 'income');
export const asExpenseId = (v: string): ExpenseId => asId<ExpenseId>(v, 'expense');
export const asPlanItemId = (v: string): PlanItemId => asId<PlanItemId>(v, 'plan item');
export const asReceiptId = (v: string): ReceiptId => asId<ReceiptId>(v, 'receipt');
