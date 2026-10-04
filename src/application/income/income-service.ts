import { z } from 'zod';
import { INCOME_SOURCES, type Income, type IncomeSchedule, type MemberIncomeShare, buildIncome, incomeByMember, updateIncome } from '../../domain/income/income.ts';
import { type CurrencyCode, DEFAULT_CURRENCY, asCurrencyCode } from '../../domain/money/currency.ts';
import { type Money, money, sum } from '../../domain/money/money.ts';
import { type IsoDate, type YearMonth, asIsoDate, monthRange, toTimestamp, yearRange } from '../../domain/shared/dates.ts';
import { asIncomeId, asMemberId } from '../../domain/shared/ids.ts';
import type { AppContext } from '../shared/context.ts';
import { ApplicationError, notFound } from '../shared/errors.ts';
import { requireMember } from '../shared/guards.ts';
import { descriptionSchema, idSchema, isoDateSchema, moneySchema, notesSchema, parseInput } from '../shared/schemas.ts';

const scheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('MONTHLY'), variability: z.enum(['FIXED', 'VARIABLE']) }),
  z.object({ kind: z.literal('ONE_OFF') }),
]);

const fields = {
  memberId: idSchema,
  amount: moneySchema,
  date: isoDateSchema,
  schedule: scheduleSchema,
  source: z.enum(INCOME_SOURCES),
  description: descriptionSchema.optional(),
  notes: notesSchema.optional(),
};

const createSchema = z.object(fields);
const updateSchema = z.object({ id: idSchema, changes: z.object(fields).partial() });

export type CreateIncomeInput = z.input<typeof createSchema>;
export type UpdateIncomeInput = z.input<typeof updateSchema>;

export interface IncomePeriodSummary {
  readonly total: Money;
  readonly byMember: readonly MemberIncomeShare[];
}

function sameSchedule(a: IncomeSchedule, b: IncomeSchedule): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'ONE_OFF') return b.kind === 'ONE_OFF';
  return b.kind === 'MONTHLY' && a.variability === b.variability;
}

function matchesExpectedIncome(current: Income, expected: Income): boolean {
  return current.id === expected.id
    && current.memberId === expected.memberId
    && current.amount.amountMinor === expected.amount.amountMinor
    && current.amount.currency === expected.amount.currency
    && current.date === expected.date
    && sameSchedule(current.schedule, expected.schedule)
    && current.source === expected.source
    && current.description === expected.description
    && current.notes === expected.notes
    && current.createdAt === expected.createdAt;
}

export class IncomeService {
  constructor(private readonly ctx: AppContext) {}

  async create(input: CreateIncomeInput): Promise<Income> {
    const p = parseInput(createSchema, input);
    return this.ctx.tx.run(async () => {
      const member = await requireMember(this.ctx, asMemberId(p.memberId), 'memberId', { mustBeActive: true });
      const now = toTimestamp(this.ctx.clock.now());
      const income = buildIncome({
        id: asIncomeId(this.ctx.newId()),
        memberId: member.id,
        amount: money(p.amount.amountMinor, asCurrencyCode(p.amount.currency)),
        date: asIsoDate(p.date),
        schedule: p.schedule,
        source: p.source,
        description: p.description ?? '',
        notes: p.notes ?? '',
        createdAt: now,
        updatedAt: now,
      });
      await this.ctx.incomes.save(income);
      return income;
    });
  }

  async update(input: UpdateIncomeInput): Promise<{ previous: Income; current: Income }> {
    const { id, changes: c } = parseInput(updateSchema, input);
    return this.ctx.tx.run(async () => {
      const previous = await this.ctx.incomes.getById(asIncomeId(id));
      if (!previous) throw notFound('Income', id);
      if (c.memberId && c.memberId !== previous.memberId) {
        await requireMember(this.ctx, asMemberId(c.memberId), 'memberId', { mustBeActive: true });
      }
      const current = updateIncome(
        previous,
        {
          ...(c.memberId && { memberId: asMemberId(c.memberId) }),
          ...(c.amount && { amount: money(c.amount.amountMinor, asCurrencyCode(c.amount.currency)) }),
          ...(c.date && { date: asIsoDate(c.date) }),
          ...(c.schedule && { schedule: c.schedule }),
          ...(c.source && { source: c.source }),
          ...(c.description !== undefined && { description: c.description }),
          ...(c.notes !== undefined && { notes: c.notes }),
        },
        toTimestamp(this.ctx.clock.now()),
      );
      await this.ctx.incomes.save(current);
      return { previous, current };
    });
  }

  /** Returns the deleted income; `expected` makes assistant undo conditional on the creation snapshot. */
  async delete(rawId: string, expected?: Income): Promise<Income> {
    const id = asIncomeId(parseInput(idSchema, rawId));
    return this.ctx.tx.run(async () => {
      const income = await this.ctx.incomes.getById(id);
      if (!income) throw notFound('Income', id);
      if (expected && !matchesExpectedIncome(income, expected)) {
        throw new ApplicationError('CONFLICT', 'El ingreso cambió desde que se creó.', [], { reason: 'RECORD_CHANGED' });
      }
      await this.ctx.incomes.delete(id);
      return income;
    });
  }

  /**
   * Writes back a snapshot returned by `update`/`delete` (undo). The member
   * may have been deactivated since: the snapshot was valid when taken.
   */
  async restore(snapshot: Income): Promise<Income> {
    const income = buildIncome(snapshot);
    return this.ctx.tx.run(async () => {
      await requireMember(this.ctx, income.memberId, 'memberId', { mustBeActive: false });
      await this.ctx.incomes.save(income);
      return income;
    });
  }

  getById(id: string): Promise<Income | undefined> {
    return this.ctx.incomes.getById(asIncomeId(parseInput(idSchema, id)));
  }

  listMonth(month: YearMonth): Promise<Income[]> {
    const { from, to } = monthRange(month);
    return this.ctx.incomes.findByDateRange(from, to);
  }

  /** Income of a month, total and per member (all members, active or not, with zeroes). */
  async monthSummary(month: YearMonth, currency: CurrencyCode = DEFAULT_CURRENCY): Promise<IncomePeriodSummary> {
    return this.summary(monthRange(month), currency);
  }

  async yearSummary(year: number, currency: CurrencyCode = DEFAULT_CURRENCY): Promise<IncomePeriodSummary> {
    return this.summary(yearRange(year), currency);
  }

  private async summary(range: { from: IsoDate; to: IsoDate }, currency: CurrencyCode): Promise<IncomePeriodSummary> {
    const [incomes, members] = await Promise.all([
      this.ctx.incomes.findByDateRange(range.from, range.to),
      this.ctx.members.getAll(),
    ]);
    const byMember = incomeByMember(
      incomes,
      members.map((m) => m.id),
      range.from,
      range.to,
      currency,
    );
    return { total: sum(byMember.map((b) => b.amount), currency), byMember };
  }
}
