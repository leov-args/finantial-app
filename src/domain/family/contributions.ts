import { DomainError } from '../shared/errors.ts';
import type { MemberId } from '../shared/ids.ts';
import type { CurrencyCode } from '../money/currency.ts';
import { type BasisPoints, type Money, add, allocate, compare, multiply, shareInBasisPoints, subtract, sum, zero } from '../money/money.ts';
import { type PlanItem, planItemAmount } from './plan.ts';

/**
 * How the FORMULA items are split (chosen by the household in Settings, Q3):
 *  - EQUAL_KEEP    whoever earns more pays first, until everyone keeps the
 *                  same; from there the rest is split so everyone keeps the
 *                  same. With the user's real plan this is F6.
 *  - PROPORTIONAL  everyone pays the same percentage of their income.
 * Neither rule ever yields a negative contribution.
 */
export const SPLIT_RULES = ['EQUAL_KEEP', 'PROPORTIONAL'] as const;
export type SplitRule = (typeof SPLIT_RULES)[number];
export const DEFAULT_SPLIT_RULE: SplitRule = 'EQUAL_KEEP';
/** Household-wide settings (A7). Stored in the database, not per device. */
export interface HouseholdSettings {
  readonly splitRule: SplitRule;
}

export const isSplitRule = (value: string): value is SplitRule => (SPLIT_RULES as readonly string[]).includes(value);

/** A member taking part in the split: active and with a reference income (A2). */
export interface Participant {
  readonly memberId: MemberId;
  readonly income: Money;
}

export interface Contribution {
  readonly memberId: MemberId;
  readonly income: Money;
  /** income − total: what the member really has left after paying the plan, assigned lines included. */
  readonly keeps: Money;
  /** Share of the FORMULA items. Never negative. */
  readonly formula: Money;
  /** formula ÷ income in basis points, for DISPLAY only (A7: the same for everyone under PROPORTIONAL). */
  readonly formulaRate: BasisPoints;
  /** Σ of the member's shares in ASSIGNED items. */
  readonly assigned: Money;
  /** formula + assigned. */
  readonly total: Money;
}

export interface FamilySplit {
  /** Σ of participant reference incomes. */
  readonly incomeTotal: Money;
  /** Σ of every plan item (assigned items count as the sum of their shares). */
  readonly planTotal: Money;
  readonly formulaTotal: Money;
  /** Σ incomes − Σ every plan item. Negative is a deficit (F7). */
  readonly remaining: Money;
  /** In `participants` order. Empty when nobody has a reference income (F7). */
  readonly contributions: readonly Contribution[];
}

/**
 * EQUAL_KEEP by water-filling over incomes sorted high → low: the top `k`
 * earners pay, each keeping `pool / k`, where `k` is the smallest count whose
 * level does not fall below the next earner's income. When everyone pays
 * this is exactly F5: keeps = allocate(remaining, equal weights).
 */
function equalKeep(incomes: readonly Money[], formulaTotal: Money): Money[] {
  let k = 1;
  let pool = subtract(incomes[0] ?? formulaTotal, formulaTotal);
  for (const next of incomes.slice(1)) {
    if (compare(pool, multiply(next, k)) >= 0) break;
    pool = add(pool, next);
    k += 1;
  }
  // Q2: the smallest kept amount goes to the highest income.
  const kept = allocate(pool, Array.from({ length: k }, () => 1)).sort((a, b) => a.amountMinor - b.amountMinor);
  return incomes.map((income, rank) => {
    const keep = kept[rank];
    return keep ? subtract(income, keep) : zero(formulaTotal.currency);
  });
}

function proportional(incomes: readonly Money[], formulaTotal: Money): Money[] {
  const weights = incomes.map((i) => i.amountMinor);
  // Nobody earns anything: an even split is the only proportional answer left.
  return allocate(formulaTotal, weights.some((w) => w > 0) ? weights : weights.map(() => 1));
}

/**
 * Fair split of the shared plan (F5):
 *   formula = the member's part of Σ FORMULA items, per `rule`
 *   total   = formula + Σ assigned shares
 *
 * The contributions always add up to exactly `planTotal`. Incomes are ranked
 * high → low (stable on ties) before splitting, so a leftover cent is paid by
 * whoever earns more (Q2).
 */
export function contributions(
  participants: readonly Participant[],
  items: readonly PlanItem[],
  rule: SplitRule,
  currency: CurrencyCode,
): FamilySplit {
  const formulaTotal = sum(
    items.flatMap((i) => (i.kind.type === 'FORMULA' ? [i.kind.amount] : [])),
    currency,
  );
  const planTotal = sum(items.map(planItemAmount), currency);
  const incomeTotal = sum(participants.map((p) => p.income), currency);
  const remaining = subtract(incomeTotal, planTotal);

  if (participants.length === 0) {
    return Object.freeze({ incomeTotal, planTotal, formulaTotal, remaining, contributions: Object.freeze([]) });
  }

  const assigned = new Map<MemberId, Money>(participants.map((p) => [p.memberId, zero(currency)]));
  for (const item of items) {
    if (item.kind.type !== 'ASSIGNED') continue;
    for (const share of item.kind.shares) {
      const current = assigned.get(share.memberId);
      if (current) assigned.set(share.memberId, add(current, share.amount));
      else if (share.amount.amountMinor !== 0) {
        // Dropping it would break Σ contributions = planTotal.
        throw new DomainError('INVALID_PLAN_ITEM', `"${item.name}" has a share for a member outside the split.`);
      }
    }
  }

  const ranked = participants.map((p, index) => ({ index, income: p.income })).sort((a, b) => compare(b.income, a.income));
  const split = rule === 'EQUAL_KEEP' ? equalKeep : proportional;
  const rankedFormula = split(
    ranked.map((r) => r.income),
    formulaTotal,
  );
  const formulaByIndex: Money[] = [];
  ranked.forEach(({ index }, rank) => {
    formulaByIndex[index] = rankedFormula[rank] ?? zero(currency);
  });

  return Object.freeze({
    incomeTotal,
    planTotal,
    formulaTotal,
    remaining,
    contributions: Object.freeze(
      participants.map((p, index) => {
        const formula = formulaByIndex[index] ?? zero(currency);
        const memberAssigned = assigned.get(p.memberId) ?? zero(currency);
        const total = add(formula, memberAssigned);
        return Object.freeze({
          memberId: p.memberId,
          income: p.income,
          keeps: subtract(p.income, total),
          formula,
          formulaRate: shareInBasisPoints(formula, p.income),
          assigned: memberAssigned,
          total,
        });
      }),
    ),
  });
}
