import { z } from 'zod';
import { itemsWithShareOf } from '../../domain/family/plan.ts';
import {
  MEMBER_COLORS,
  type Member,
  createMember,
  firstFreeColor,
  renameMember,
  setMemberActive,
  setMemberColor,
  setReferenceIncome,
} from '../../domain/member/member.ts';
import { asCurrencyCode } from '../../domain/money/currency.ts';
import { money } from '../../domain/money/money.ts';
import { toTimestamp } from '../../domain/shared/dates.ts';
import { type MemberId, asMemberId } from '../../domain/shared/ids.ts';
import type { AppContext } from '../shared/context.ts';
import { ApplicationError, notFound } from '../shared/errors.ts';
import { idSchema, moneySchema, nameSchema, parseInput } from '../shared/schemas.ts';

const createSchema = z.object({ name: nameSchema });
const renameSchema = z.object({ id: idSchema, name: nameSchema });
const activeSchema = z.object({ id: idSchema, active: z.boolean() });
const incomeSchema = z.object({ id: idSchema, referenceIncome: moneySchema.nullable() });
const colorSchema = z.object({ id: idSchema, color: z.enum(MEMBER_COLORS) });

export type CreateMemberInput = z.input<typeof createSchema>;

export class MemberService {
  constructor(private readonly ctx: AppContext) {}

  list(): Promise<Member[]> {
    return this.ctx.members.getAll();
  }

  async listActive(): Promise<Member[]> {
    return (await this.ctx.members.getAll()).filter((m) => m.active);
  }

  async create(input: CreateMemberInput): Promise<Member> {
    const { name } = parseInput(createSchema, input);
    return this.ctx.tx.run(async () => {
      const member = createMember({
        id: asMemberId(this.ctx.newId()),
        name,
        color: firstFreeColor(await this.ctx.members.getAll()),
        now: toTimestamp(this.ctx.clock.now()),
      });
      await this.ctx.members.save(member);
      return member;
    });
  }

  async rename(input: { id: string; name: string }): Promise<Member> {
    const { id, name } = parseInput(renameSchema, input);
    return this.ctx.tx.run(async () => {
      const member = await this.require(asMemberId(id));
      const updated = renameMember(member, name, toTimestamp(this.ctx.clock.now()));
      await this.ctx.members.save(updated);
      return updated;
    });
  }

  /** Deactivation is how members with history are "removed": their records stay valid. */
  async setActive(input: { id: string; active: boolean }): Promise<Member> {
    const { id, active } = parseInput(activeSchema, input);
    return this.ctx.tx.run(async () => {
      const member = await this.require(asMemberId(id));
      if (!active) await this.refuseIfHasShares(member, 'MEMBER_SHARES_BLOCK_DEACTIVATE');
      const now = toTimestamp(this.ctx.clock.now());
      let updated = setMemberActive(member, active, now);
      // Coming back: keep the color unless another active member took it meanwhile (A6).
      if (active && updated !== member) {
        const others = (await this.ctx.members.getAll()).filter((m) => m.id !== member.id);
        if (others.some((m) => m.active && m.color === member.color)) updated = setMemberColor(updated, firstFreeColor(others), now);
      }
      if (updated !== member) await this.ctx.members.save(updated);
      return updated;
    });
  }

  /** Hard delete is only allowed for members with no financial history. */
  async delete(rawId: string): Promise<Member> {
    const id = asMemberId(parseInput(idSchema, rawId));
    return this.ctx.tx.run(async () => {
      const member = await this.require(id);
      const references =
        (await this.ctx.expenses.countByMember(id)) +
        (await this.ctx.incomes.countByMember(id)) +
        itemsWithShareOf(await this.ctx.planItems.getAll(), id, { includeZero: true }).length;
      if (references > 0) {
        throw new ApplicationError(
          'REFERENCE_IN_USE',
          `"${member.name}" tiene ${references} movimientos. Desactívalo en lugar de eliminarlo.`,
          [],
          { reason: 'MEMBER_IN_USE', params: { name: member.name, count: references } },
        );
      }
      await this.ctx.members.delete(id);
      return member;
    });
  }

  /** A2. `null` takes the member out of the family split. */
  async setReferenceIncome(input: { id: string; referenceIncome: { amountMinor: number; currency: string } | null }): Promise<Member> {
    const { id, referenceIncome } = parseInput(incomeSchema, input);
    return this.ctx.tx.run(async () => {
      const member = await this.require(asMemberId(id));
      if (!referenceIncome) await this.refuseIfHasShares(member, 'MEMBER_SHARES_BLOCK_CLEAR_INCOME');
      const updated = setReferenceIncome(
        member,
        referenceIncome && money(referenceIncome.amountMinor, asCurrencyCode(referenceIncome.currency)),
        toTimestamp(this.ctx.clock.now()),
      );
      await this.ctx.members.save(updated);
      return updated;
    });
  }

  /** A2 for several members in one transaction: if one is refused (Q6), none is saved. */
  async setReferenceIncomes(inputs: ReadonlyArray<Parameters<MemberService['setReferenceIncome']>[0]>): Promise<Member[]> {
    return this.ctx.tx.run(async () => {
      const updated: Member[] = [];
      for (const input of inputs) updated.push(await this.setReferenceIncome(input));
      return updated;
    });
  }

  /** A6: two active members never share a color. */
  async setColor(input: { id: string; color: string }): Promise<Member> {
    const { id, color } = parseInput(colorSchema, input);
    return this.ctx.tx.run(async () => {
      const member = await this.require(asMemberId(id));
      const owner = (await this.ctx.members.getAll()).find((m) => m.active && m.id !== member.id && m.color === color);
      if (owner) {
        throw new ApplicationError('CONFLICT', `${owner.name} ya usa ese color.`, [{ path: 'color', message: `Lo usa ${owner.name}` }], {
          reason: 'MEMBER_COLOR_TAKEN',
          params: { name: owner.name },
        });
      }
      const updated = setMemberColor(member, color, toTimestamp(this.ctx.clock.now()));
      if (updated !== member) await this.ctx.members.save(updated);
      return updated;
    });
  }

  /**
   * Q6: a non-zero share needs someone in the split to pay it, or the
   * contributions would stop adding up to the plan total.
   */
  private async refuseIfHasShares(
    member: Member,
    reason: 'MEMBER_SHARES_BLOCK_DEACTIVATE' | 'MEMBER_SHARES_BLOCK_CLEAR_INCOME',
  ): Promise<void> {
    const items = itemsWithShareOf(await this.ctx.planItems.getAll(), member.id);
    if (items.length === 0) return;
    const lines = items.map((i) => i.name).join(', ');
    throw new ApplicationError('CONFLICT', `${member.name} tiene una parte asignada en: ${lines}.`, [], {
      reason,
      params: { name: member.name, lines },
    });
  }

  private async require(id: MemberId): Promise<Member> {
    const member = await this.ctx.members.getById(id);
    if (!member) throw notFound('Member', id);
    return member;
  }
}
