import { z } from 'zod';
import {
  type FamilySplit,
  type HouseholdSettings,
  type Participant,
  SPLIT_RULES,
  contributions,
} from '../../domain/family/contributions.ts';
import { type PlanItem, type PlanItemKind, buildPlanItem, planItemAmount, updatePlanItem } from '../../domain/family/plan.ts';
import type { Member } from '../../domain/member/member.ts';
import { type CurrencyCode, DEFAULT_CURRENCY, asCurrencyCode } from '../../domain/money/currency.ts';
import { type Money, money } from '../../domain/money/money.ts';
import { toTimestamp } from '../../domain/shared/dates.ts';
import { asMemberId, asPlanItemId } from '../../domain/shared/ids.ts';
import type { AppContext } from '../shared/context.ts';
import { ApplicationError, type FieldIssue, notFound } from '../shared/errors.ts';
import { idSchema, moneySchema, nameSchema, parseInput } from '../shared/schemas.ts';

const kindSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('FORMULA'), amount: moneySchema }),
  z.object({
    type: z.literal('ASSIGNED'),
    shares: z.array(z.object({ memberId: idSchema, amount: moneySchema })).min(1, 'Añade al menos una parte'),
  }),
]);

const createSchema = z.object({ name: nameSchema, kind: kindSchema });
const updateSchema = z.object({ id: idSchema, changes: z.object({ name: nameSchema, kind: kindSchema }).partial() });
const settingsSchema = z.object({ splitRule: z.enum(SPLIT_RULES) });

export type CreatePlanItemInput = z.input<typeof createSchema>;
export type UpdatePlanItemInput = z.input<typeof updateSchema>;

function toKind(input: z.output<typeof kindSchema>): PlanItemKind {
  return input.type === 'FORMULA'
    ? { type: 'FORMULA', amount: money(input.amount.amountMinor, asCurrencyCode(input.amount.currency)) }
    : {
        type: 'ASSIGNED',
        shares: input.shares.map((s) => ({
          memberId: asMemberId(s.memberId),
          amount: money(s.amount.amountMinor, asCurrencyCode(s.amount.currency)),
        })),
      };
}

/** Active members with a reference income: the people the plan is split between (A2). */
const participantsOf = (members: readonly Member[]): Participant[] =>
  members.flatMap((m) => (m.active && m.referenceIncome ? [{ memberId: m.id, income: m.referenceIncome }] : []));

/** The shared monthly plan (F1–F3) and how it is split (F4, F5, A7). */
export class PlanService {
  constructor(private readonly ctx: AppContext) {}

  list(): Promise<PlanItem[]> {
    return this.ctx.planItems.getAll();
  }

  /** Each line with its amount (an assigned line is the sum of its shares, F2), so the UI never adds money. */
  async listWithAmounts(): Promise<Array<{ item: PlanItem; amount: Money }>> {
    return (await this.list()).map((item) => ({ item, amount: planItemAmount(item) }));
  }

  async create(input: CreatePlanItemInput): Promise<PlanItem> {
    const p = parseInput(createSchema, input);
    return this.ctx.tx.run(async () => {
      const now = toTimestamp(this.ctx.clock.now());
      const item = buildPlanItem({ id: asPlanItemId(this.ctx.newId()), name: p.name, kind: toKind(p.kind), createdAt: now, updatedAt: now });
      await this.checkShares(item);
      await this.ctx.planItems.save(item);
      return item;
    });
  }

  async update(input: UpdatePlanItemInput): Promise<{ previous: PlanItem; current: PlanItem }> {
    const { id, changes } = parseInput(updateSchema, input);
    return this.ctx.tx.run(async () => {
      const previous = await this.ctx.planItems.getById(asPlanItemId(id));
      if (!previous) throw notFound('Plan item', id);
      const current = updatePlanItem(
        previous,
        { ...(changes.name !== undefined && { name: changes.name }), ...(changes.kind && { kind: toKind(changes.kind) }) },
        toTimestamp(this.ctx.clock.now()),
      );
      await this.checkShares(current);
      await this.ctx.planItems.save(current);
      return { previous, current };
    });
  }

  async delete(rawId: string): Promise<PlanItem> {
    const id = asPlanItemId(parseInput(idSchema, rawId));
    return this.ctx.tx.run(async () => {
      const item = await this.ctx.planItems.getById(id);
      if (!item) throw notFound('Plan item', id);
      await this.ctx.planItems.delete(id);
      return item;
    });
  }

  /** Writes back a snapshot from `update`/`delete` (undo). */
  async restore(snapshot: PlanItem): Promise<PlanItem> {
    const item = buildPlanItem(snapshot);
    return this.ctx.tx.run(async () => {
      await this.checkShares(item);
      await this.ctx.planItems.save(item);
      return item;
    });
  }

  /** Contributions for the stored plan, incomes and split rule. The UI never computes these itself. */
  async contributions(currency: CurrencyCode = DEFAULT_CURRENCY): Promise<FamilySplit> {
    const [members, items, settings] = await Promise.all([
      this.ctx.members.getAll(),
      this.ctx.planItems.getAll(),
      this.ctx.settings.getHousehold(),
    ]);
    return contributions(participantsOf(members), items, settings.splitRule, currency);
  }

  getSettings(): Promise<HouseholdSettings> {
    return this.ctx.settings.getHousehold();
  }

  async setSplitRule(input: { splitRule: string }): Promise<HouseholdSettings> {
    const { splitRule } = parseInput(settingsSchema, input);
    const settings: HouseholdSettings = Object.freeze({ splitRule });
    await this.ctx.settings.saveHousehold(settings);
    return settings;
  }

  /**
   * Every share must point at an existing member, and a non-zero share at a
   * participant: otherwise it would not be paid by anyone and the split would
   * no longer add up to the plan total (Q6).
   */
  private async checkShares(item: PlanItem): Promise<void> {
    if (item.kind.type !== 'ASSIGNED') return;
    const issues: FieldIssue[] = [];
    for (const [i, share] of item.kind.shares.entries()) {
      const member = await this.ctx.members.getById(share.memberId);
      if (!member) issues.push({ path: `kind.shares.${i}.memberId`, message: 'Miembro desconocido' });
      else if (share.amount.amountMinor !== 0 && (!member.active || !member.referenceIncome)) {
        issues.push({
          path: `kind.shares.${i}.amount`,
          message: `${member.name} no participa en el reparto (sin ingreso de referencia o desactivado); su parte debe ser 0`,
        });
      }
    }
    if (issues.length > 0) {
      throw new ApplicationError('VALIDATION', 'Los datos introducidos no son válidos.', issues, { reason: 'INVALID_INPUT' });
    }
  }
}
