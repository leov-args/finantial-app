import { describe, expect, it } from 'vitest';
import { ANA, PARTNER, T0 } from '../../test/fixtures.ts';
import { asMemberId, asPlanItemId } from '../shared/ids.ts';
import { type Money, money, sum } from '../money/money.ts';
import { type FamilySplit, type Participant, SPLIT_RULES, contributions } from './contributions.ts';
import { type PlanItem, type PlanItemKind, buildPlanItem } from './plan.ts';

const eur = (amountMinor: number): Money => money(amountMinor, 'EUR');
const THIRD = asMemberId('m-third');

let seq = 0;
function item(kind: PlanItemKind, name = 'Línea'): PlanItem {
  seq += 1;
  return buildPlanItem({ id: asPlanItemId(`plan-${seq}`), name, kind, createdAt: T0, updatedAt: T0 });
}
const formula = (amountMinor: number): PlanItem => item({ type: 'FORMULA', amount: eur(amountMinor) });
const assigned = (...shares: [Participant['memberId'], number][]): PlanItem =>
  item({ type: 'ASSIGNED', shares: shares.map(([memberId, amountMinor]) => ({ memberId, amount: eur(amountMinor) })) });

const anaAndPartner: Participant[] = [
  { memberId: ANA, income: eur(260000) },
  { memberId: PARTNER, income: eur(140000) },
];

const totals = (split: FamilySplit) => split.contributions.map((c) => c.total.amountMinor);
const sumOfTotals = (split: FamilySplit) => sum(split.contributions.map((c) => c.total), 'EUR').amountMinor;

describe('contributions', () => {
  const formulaOf = (split: FamilySplit) => split.contributions.map((c) => c.formula.amountMinor);

  it('F6: EQUAL_KEEP reproduces the user example to the cent', () => {
    const split = contributions(anaAndPartner, [formula(210001)], 'EQUAL_KEEP', 'EUR');
    expect(split.contributions.map((c) => c.keeps.amountMinor)).toEqual([94999, 95000]);
    expect(formulaOf(split)).toEqual([165001, 45000]);

    const withLaptop = contributions(
      anaAndPartner,
      [formula(210001), assigned([ANA, 30000], [PARTNER, 5000])],
      'EQUAL_KEEP',
      'EUR',
    );
    expect(withLaptop.contributions.map((c) => c.assigned.amountMinor)).toEqual([30000, 5000]);
    expect(totals(withLaptop)).toEqual([195001, 50000]);
    expect(withLaptop.planTotal.amountMinor).toBe(245001);
  });

  it('Q2: whoever earns more keeps the odd cent less, whatever the input order', () => {
    const reversed = contributions([...anaAndPartner].reverse(), [formula(210001)], 'EQUAL_KEEP', 'EUR');
    expect(reversed.contributions.map((c) => [c.memberId, c.keeps.amountMinor])).toEqual([
      [PARTNER, 95000],
      [ANA, 94999],
    ]);
  });

  it('Q3: EQUAL_KEEP with a small plan — the higher income pays until both keep the same, never a transfer', () => {
    expect(formulaOf(contributions(anaAndPartner, [formula(100000)], 'EQUAL_KEEP', 'EUR'))).toEqual([100000, 0]);
    expect(formulaOf(contributions(anaAndPartner, [], 'EQUAL_KEEP', 'EUR'))).toEqual([0, 0]);
    // Exactly the income gap: both keep 1.400.
    expect(formulaOf(contributions(anaAndPartner, [formula(120000)], 'EQUAL_KEEP', 'EUR'))).toEqual([120000, 0]);
    expect(formulaOf(contributions(anaAndPartner, [formula(120002)], 'EQUAL_KEEP', 'EUR'))).toEqual([120001, 1]);
  });

  it('Q3: EQUAL_KEEP with three incomes only charges those above the level', () => {
    const three: Participant[] = [
      { memberId: ANA, income: eur(260000) },
      { memberId: PARTNER, income: eur(200000) },
      { memberId: THIRD, income: eur(50000) },
    ];
    const split = contributions(three, [formula(150000)], 'EQUAL_KEEP', 'EUR');
    expect(formulaOf(split)).toEqual([105000, 45000, 0]);
    expect(split.contributions.map((c) => c.keeps.amountMinor)).toEqual([155000, 155000, 50000]);
  });

  it('Q3: PROPORTIONAL charges everyone the same share of their income', () => {
    expect(formulaOf(contributions(anaAndPartner, [formula(100000)], 'PROPORTIONAL', 'EUR'))).toEqual([65000, 35000]);
    const real = contributions(anaAndPartner, [formula(210001)], 'PROPORTIONAL', 'EUR');
    expect(formulaOf(real)).toEqual([136501, 73500]);
    expect(real.contributions.map((c) => c.formulaRate)).toEqual([5250, 5250]);
  });

  it('PROPORTIONAL with every income at 0 splits evenly', () => {
    const broke: Participant[] = [
      { memberId: ANA, income: eur(0) },
      { memberId: PARTNER, income: eur(0) },
    ];
    expect(formulaOf(contributions(broke, [formula(1001)], 'PROPORTIONAL', 'EUR'))).toEqual([501, 500]);
  });

  it('both rules: contributions add up to the plan total and are never negative', () => {
    const three: Participant[] = [...anaAndPartner, { memberId: THIRD, income: eur(99999) }];
    const cases: [Participant[], PlanItem[]][] = [
      [anaAndPartner, [formula(210001)]],
      [anaAndPartner, [formula(1), formula(2), assigned([ANA, 0], [PARTNER, 6000])]],
      [three, [formula(100000), formula(33333), assigned([THIRD, 1234])]],
      [three, [formula(500000)]],
      [three, [formula(7)]],
      [anaAndPartner, [formula(400003)]],
      [anaAndPartner, []],
    ];
    for (const rule of SPLIT_RULES) {
      for (const [participants, items] of cases) {
        const split = contributions(participants, items, rule, 'EUR');
        expect(sumOfTotals(split)).toBe(split.planTotal.amountMinor);
        expect(formulaOf(split).every((f) => f >= 0)).toBe(true);
      }
    }
  });

  it('assigned lines come out of what their owner keeps, not out of the equal split', () => {
    const leoAndMeda: Participant[] = [
      { memberId: ANA, income: eur(300000) },
      { memberId: PARTNER, income: eur(120000) },
    ];
    const split = contributions(leoAndMeda, [formula(328201), assigned([ANA, 39953], [PARTNER, 4547])], 'EQUAL_KEEP', 'EUR');
    expect(formulaOf(split)).toEqual([254101, 74100]);
    expect(totals(split)).toEqual([294054, 78647]);
    expect(split.contributions.map((c) => c.keeps.amountMinor)).toEqual([5946, 41353]);
    expect(split.remaining.amountMinor).toBe(47299);
  });

  it('F7: a plan above the incomes is a deficit and still adds up', () => {
    const split = contributions(anaAndPartner, [formula(400003)], 'EQUAL_KEEP', 'EUR');
    expect(split.remaining.amountMinor).toBe(-3);
    // −3 split as −2 / −1: the higher income keeps the cent less.
    expect(split.contributions.map((c) => c.keeps.amountMinor)).toEqual([-2, -1]);
    expect(sumOfTotals(split)).toBe(400003);
  });

  it('F7: without participants nobody contributes', () => {
    const split = contributions([], [formula(5000)], 'EQUAL_KEEP', 'EUR');
    expect(split.contributions).toEqual([]);
    expect(split.remaining.amountMinor).toBe(-5000);
  });

  it('rejects a non-zero share for a member outside the split, ignores a zero one', () => {
    expect(() => contributions(anaAndPartner, [assigned([THIRD, 100])], 'EQUAL_KEEP', 'EUR')).toThrow(/outside the split/);
    expect(sumOfTotals(contributions(anaAndPartner, [assigned([ANA, 100], [THIRD, 0])], 'EQUAL_KEEP', 'EUR'))).toBe(100);
  });
});

describe('PlanItem', () => {
  it('Q1: an assigned item is worth the sum of its shares, a share may be 0', () => {
    expect(assigned([ANA, 40000], [PARTNER, 0]).kind).toEqual({
      type: 'ASSIGNED',
      shares: [
        { memberId: ANA, amount: eur(40000) },
        { memberId: PARTNER, amount: eur(0) },
      ],
    });
  });

  it('rejects invalid items', () => {
    expect(() => formula(0)).toThrow(/greater than zero/);
    expect(() => assigned()).toThrow(/at least one share/);
    expect(() => assigned([ANA, 0], [PARTNER, 0])).toThrow(/greater than zero/);
    expect(() => assigned([ANA, -1], [PARTNER, 10])).toThrow(/negative/);
    expect(() => assigned([ANA, 1], [ANA, 2])).toThrow(/one share/);
    expect(() => item({ type: 'FORMULA', amount: eur(1) }, '  ')).toThrow(/must not be empty/);
  });

  it('is immutable', () => {
    const line = assigned([ANA, 1]);
    expect(Object.isFrozen(line)).toBe(true);
    expect(Object.isFrozen(line.kind)).toBe(true);
  });
});
