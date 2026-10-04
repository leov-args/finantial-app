import { DomainError } from '../shared/errors.ts';
import type { Timestamp } from '../shared/dates.ts';
import type { MemberId, PlanItemId } from '../shared/ids.ts';
import { TEXT_LIMITS, requireName } from '../shared/text.ts';
import { type Money, isNegative, isPositive, sum } from '../money/money.ts';

export interface PlanShare {
  readonly memberId: MemberId;
  readonly amount: Money;
}

/**
 * How a line of the shared plan is paid (F2):
 *  - FORMULA   one amount, split so every participant keeps the same.
 *  - ASSIGNED  a fixed amount per member; the line is worth the sum of its
 *              shares (Q1), never a separately typed total. A share may be 0.
 */
export type PlanItemKind =
  | { readonly type: 'FORMULA'; readonly amount: Money }
  | { readonly type: 'ASSIGNED'; readonly shares: readonly PlanShare[] };

/** One line of the monthly plan of shared expenses (F1). */
export interface PlanItem {
  readonly id: PlanItemId;
  readonly name: string;
  readonly kind: PlanItemKind;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

function freezeKind(kind: PlanItemKind): PlanItemKind {
  if (kind.type === 'FORMULA') {
    if (!isPositive(kind.amount)) {
      throw new DomainError('INVALID_PLAN_ITEM', 'Plan item amount must be greater than zero.');
    }
    return Object.freeze({ type: 'FORMULA', amount: kind.amount });
  }
  if (kind.type !== 'ASSIGNED') {
    throw new DomainError('INVALID_PLAN_ITEM', `Unknown plan item type "${String((kind as { type: unknown }).type)}".`);
  }
  if (kind.shares.length === 0) {
    throw new DomainError('INVALID_PLAN_ITEM', 'An assigned plan item needs at least one share.');
  }
  if (new Set(kind.shares.map((s) => s.memberId)).size !== kind.shares.length) {
    throw new DomainError('INVALID_PLAN_ITEM', 'A member can only have one share per plan item.');
  }
  if (kind.shares.some((s) => isNegative(s.amount))) {
    throw new DomainError('INVALID_PLAN_ITEM', 'Shares must not be negative.');
  }
  const [first] = kind.shares;
  if (first && !isPositive(sum(kind.shares.map((s) => s.amount), first.amount.currency))) {
    throw new DomainError('INVALID_PLAN_ITEM', 'Plan item amount must be greater than zero.');
  }
  return Object.freeze({
    type: 'ASSIGNED',
    shares: Object.freeze(kind.shares.map((s) => Object.freeze({ memberId: s.memberId, amount: s.amount }))),
  });
}

export function buildPlanItem(props: PlanItem): PlanItem {
  return Object.freeze({
    id: props.id,
    name: requireName(props.name, TEXT_LIMITS.name, 'Plan item name'),
    kind: freezeKind(props.kind),
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  });
}

export type PlanItemChanges = Partial<Pick<PlanItem, 'name' | 'kind'>>;

export function updatePlanItem(item: PlanItem, changes: PlanItemChanges, now: Timestamp): PlanItem {
  return buildPlanItem({ ...item, ...changes, id: item.id, createdAt: item.createdAt, updatedAt: now });
}

/** Items where `memberId` has a share; only non-zero shares unless `includeZero`. */
export function itemsWithShareOf(items: readonly PlanItem[], memberId: MemberId, { includeZero = false } = {}): PlanItem[] {
  return items.filter(
    (i) => i.kind.type === 'ASSIGNED' && i.kind.shares.some((s) => s.memberId === memberId && (includeZero || s.amount.amountMinor !== 0)),
  );
}

/** What the line costs per month: its amount, or the sum of its shares (Q1). */
export function planItemAmount(item: PlanItem): Money {
  if (item.kind.type === 'FORMULA') return item.kind.amount;
  const [first] = item.kind.shares;
  if (!first) throw new DomainError('INVALID_PLAN_ITEM', 'An assigned plan item needs at least one share.');
  return sum(item.kind.shares.map((s) => s.amount), first.amount.currency);
}
