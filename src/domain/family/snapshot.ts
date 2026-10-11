import type { Timestamp, YearMonth } from '../shared/dates.ts';
import type { MemberId } from '../shared/ids.ts';
import type { Money } from '../money/money.ts';
import type { SplitRule } from './contributions.ts';
import { type PlanItem, buildPlanItem } from './plan.ts';

/** What the split needs to know about a member (A2): the same fields as `Member`, so both fit `participantsOf`. */
export interface SnapshotMember {
  readonly id: MemberId;
  readonly active: boolean;
  readonly referenceIncome: Money | null;
}

/**
 * The inputs of the family split for a finished month, frozen the moment
 * something that feeds it changes (E1-1). Results are never stored: the same
 * `contributions()` recomputes them, so the line breakdown works for free.
 */
export interface MonthSnapshot {
  readonly month: YearMonth;
  readonly splitRule: SplitRule;
  readonly members: readonly SnapshotMember[];
  readonly planItems: readonly PlanItem[];
  readonly createdAt: Timestamp;
}

export function buildMonthSnapshot(props: MonthSnapshot): MonthSnapshot {
  return Object.freeze({
    month: props.month,
    splitRule: props.splitRule,
    members: Object.freeze(props.members.map((m) => Object.freeze({ id: m.id, active: m.active, referenceIncome: m.referenceIncome }))),
    planItems: Object.freeze(props.planItems.map(buildPlanItem)),
    createdAt: props.createdAt,
  });
}
