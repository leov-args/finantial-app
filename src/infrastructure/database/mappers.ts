import { buildExpense, type Expense } from '../../domain/expense/expense.ts';
import { buildIncome, type Income, type IncomeSource } from '../../domain/income/income.ts';
import { type Category } from '../../domain/category/category.ts';
import { type Member, buildMember, isMemberColor } from '../../domain/member/member.ts';
import { type PlanItem, buildPlanItem } from '../../domain/family/plan.ts';
import { type HouseholdSettings, isSplitRule } from '../../domain/family/contributions.ts';
import { asCurrencyCode } from '../../domain/money/currency.ts';
import { type Money, money } from '../../domain/money/money.ts';
import { asIsoDate, asTimestamp } from '../../domain/shared/dates.ts';
import { asCategoryId, asExpenseId, asIncomeId, asMemberId, asPlanItemId, asReceiptId } from '../../domain/shared/ids.ts';
import { requireName, TEXT_LIMITS } from '../../domain/shared/text.ts';
import type { ExpenseType } from '../../domain/expense/expense.ts';
import type {
  CategoryRecord,
  ExpenseRecord,
  IncomeRecord,
  MemberRecord,
  MoneyRecord,
  PlanItemRecord,
  SettingsRecord,
} from './records.ts';

/*
 * Records → domain objects always go through the domain constructors, so a
 * corrupted or hand-edited row fails loudly on read instead of propagating
 * wrong numbers into calculations.
 */

const moneyFromRecord = (r: MoneyRecord): Money => money(r.amountMinor, asCurrencyCode(r.currency));

export const memberToRecord = (m: Member): MemberRecord => ({
  id: m.id,
  name: m.name,
  active: m.active,
  referenceIncome: m.referenceIncome && { amountMinor: m.referenceIncome.amountMinor, currency: m.referenceIncome.currency },
  color: m.color,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

export function memberFromRecord(r: MemberRecord): Member {
  if (!isMemberColor(r.color)) throw new Error(`Corrupted member ${r.id}: unknown color "${r.color}".`);
  return buildMember({
    id: asMemberId(r.id),
    name: r.name,
    active: Boolean(r.active),
    referenceIncome: r.referenceIncome && moneyFromRecord(r.referenceIncome),
    color: r.color,
    createdAt: asTimestamp(r.createdAt),
    updatedAt: asTimestamp(r.updatedAt),
  });
}

export const categoryToRecord = (c: Category): CategoryRecord => ({
  id: c.id,
  name: c.name,
  archived: c.archived,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

export const categoryFromRecord = (r: CategoryRecord): Category =>
  Object.freeze({
    id: asCategoryId(r.id),
    name: requireName(r.name, TEXT_LIMITS.name, 'Category name'),
    archived: Boolean(r.archived),
    createdAt: asTimestamp(r.createdAt),
    updatedAt: asTimestamp(r.updatedAt),
  });

export const incomeToRecord = (i: Income): IncomeRecord => ({
  id: i.id,
  memberId: i.memberId,
  amountMinor: i.amount.amountMinor,
  currency: i.amount.currency,
  date: i.date,
  scheduleKind: i.schedule.kind,
  variability: i.schedule.kind === 'MONTHLY' ? i.schedule.variability : null,
  source: i.source,
  description: i.description,
  notes: i.notes,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
});

export function incomeFromRecord(r: IncomeRecord): Income {
  if (r.scheduleKind === 'MONTHLY' && r.variability === null) {
    throw new Error(`Corrupted income ${r.id}: monthly income without variability.`);
  }
  return buildIncome({
    id: asIncomeId(r.id),
    memberId: asMemberId(r.memberId),
    amount: money(r.amountMinor, asCurrencyCode(r.currency)),
    date: asIsoDate(r.date),
    schedule:
      r.scheduleKind === 'MONTHLY' && r.variability !== null
        ? { kind: 'MONTHLY', variability: r.variability }
        : { kind: 'ONE_OFF' },
    source: r.source as IncomeSource,
    description: r.description,
    notes: r.notes,
    createdAt: asTimestamp(r.createdAt),
    updatedAt: asTimestamp(r.updatedAt),
  });
}

export const expenseToRecord = (e: Expense): ExpenseRecord => ({
  id: e.id,
  description: e.description,
  merchant: e.merchant,
  amountMinor: e.amount.amountMinor,
  currency: e.amount.currency,
  date: e.date,
  categoryId: e.categoryId,
  expenseType: e.expenseType,
  scopeType: e.scope.type,
  ownerId: e.scope.type === 'INDIVIDUAL' ? e.scope.ownerId : null,
  paidBy: e.paidBy,
  recurrence: e.recurrence ? { ...e.recurrence } : null,
  notes: e.notes,
  receiptId: e.receiptId,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export function expenseFromRecord(r: ExpenseRecord): Expense {
  if (r.scopeType === 'INDIVIDUAL' && !r.ownerId) {
    throw new Error(`Corrupted expense ${r.id}: individual expense without owner.`);
  }
  return buildExpense({
    id: asExpenseId(r.id),
    description: r.description,
    merchant: r.merchant,
    amount: money(r.amountMinor, asCurrencyCode(r.currency)),
    date: asIsoDate(r.date),
    categoryId: asCategoryId(r.categoryId),
    expenseType: r.expenseType as ExpenseType,
    scope: r.scopeType === 'INDIVIDUAL' && r.ownerId ? { type: 'INDIVIDUAL', ownerId: asMemberId(r.ownerId) } : { type: 'SHARED' },
    paidBy: asMemberId(r.paidBy),
    recurrence: r.recurrence,
    notes: r.notes,
    receiptId: r.receiptId ? asReceiptId(r.receiptId) : null,
    createdAt: asTimestamp(r.createdAt),
    updatedAt: asTimestamp(r.updatedAt),
  });
}

export const planItemToRecord = (p: PlanItem): PlanItemRecord =>
  p.kind.type === 'FORMULA'
    ? {
        id: p.id,
        name: p.name,
        kind: 'FORMULA',
        currency: p.kind.amount.currency,
        amountMinor: p.kind.amount.amountMinor,
        shares: [],
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }
    : {
        id: p.id,
        name: p.name,
        kind: 'ASSIGNED',
        currency: p.kind.shares[0]?.amount.currency ?? '',
        amountMinor: null,
        shares: p.kind.shares.map((s) => ({ memberId: s.memberId, amountMinor: s.amount.amountMinor })),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };

export function planItemFromRecord(r: PlanItemRecord): PlanItem {
  const currency = asCurrencyCode(r.currency);
  let kind: PlanItem['kind'];
  if (r.kind === 'FORMULA') {
    if (r.amountMinor === null) throw new Error(`Corrupted plan item ${r.id}: formula item without amount.`);
    kind = { type: 'FORMULA', amount: money(r.amountMinor, currency) };
  } else if (r.kind === 'ASSIGNED') {
    kind = {
      type: 'ASSIGNED',
      shares: r.shares.map((s) => ({ memberId: asMemberId(s.memberId), amount: money(s.amountMinor, currency) })),
    };
  } else {
    throw new Error(`Corrupted plan item ${r.id}: unknown kind "${String(r.kind)}".`);
  }
  return buildPlanItem({
    id: asPlanItemId(r.id),
    name: r.name,
    kind,
    createdAt: asTimestamp(r.createdAt),
    updatedAt: asTimestamp(r.updatedAt),
  });
}

export const settingsToRecord = (s: HouseholdSettings): SettingsRecord => ({ id: 'household', splitRule: s.splitRule });

export function settingsFromRecord(r: SettingsRecord): HouseholdSettings {
  if (!isSplitRule(r.splitRule)) throw new Error(`Corrupted settings: unknown split rule "${r.splitRule}".`);
  return Object.freeze({ splitRule: r.splitRule });
}
