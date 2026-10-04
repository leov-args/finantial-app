import { z } from 'zod';
import {
  EXPENSE_TYPES,
  type Expense,
  type ExpenseScope,
  type Recurrence,
  buildExpense,
  expensesOfType,
  sharedExpenses,
  totalOf,
  totalsBy,
  updateExpense,
} from '../../domain/expense/expense.ts';
import { type CurrencyCode, DEFAULT_CURRENCY, asCurrencyCode } from '../../domain/money/currency.ts';
import { type BasisPoints, type Money, money, shareInBasisPoints, subtract, zero } from '../../domain/money/money.ts';
import { type IsoDate, type YearMonth, asIsoDate, monthRange, toTimestamp } from '../../domain/shared/dates.ts';
import { type CategoryId, type MemberId, asCategoryId, asExpenseId, asMemberId, asReceiptId } from '../../domain/shared/ids.ts';
import type { AppContext } from '../shared/context.ts';
import { ApplicationError, notFound } from '../shared/errors.ts';
import { requireCategory, requireMember } from '../shared/guards.ts';
import {
  descriptionSchema,
  idSchema,
  isoDateSchema,
  merchantSchema,
  moneySchema,
  notesSchema,
  parseInput,
  recurrenceSchema,
  scopeSchema,
} from '../shared/schemas.ts';

const fields = {
  description: descriptionSchema.optional(),
  merchant: merchantSchema.nullable().optional(),
  amount: moneySchema,
  date: isoDateSchema,
  categoryId: idSchema,
  expenseType: z.enum(EXPENSE_TYPES),
  scope: scopeSchema,
  paidBy: idSchema,
  recurrence: recurrenceSchema.nullable().optional(),
  notes: notesSchema.optional(),
  receiptId: idSchema.nullable().optional(),
};

const createSchema = z.object(fields);
const updateSchema = z.object({ id: idSchema, changes: z.object(fields).partial() });

/** Input accepted by `create` (from the UI form, quick entry or, later, agent tools). */
export type CreateExpenseInput = z.input<typeof createSchema>;
export type UpdateExpenseInput = z.input<typeof updateSchema>;

/** Returned by mutations so callers can offer "Deshacer" (see docs/agent.md#undo). */
export interface ExpenseUpdate {
  readonly previous: Expense;
  readonly current: Expense;
}

/** Dashboard figures for one month. Shares are display-only. */
export interface ExpenseMonthSummary {
  readonly total: Money;
  /** Largest first. */
  readonly byCategory: readonly { categoryId: CategoryId; amount: Money; shareBasisPoints: BasisPoints }[];
  readonly shared: Money;
  readonly individual: Money;
  readonly fixed: Money;
  readonly variable: Money;
  /** Shared expenses paid by each member (every member, zero included, in member order). */
  readonly sharedPaidBy: readonly { memberId: MemberId; amount: Money }[];
}

/**
 * Quick entry ("42 € en Mercadona") has no description: derive it
 * deterministically from the merchant, else from the category.
 */
const describe = (description: string | undefined, merchant: string | null | undefined, categoryName: string): string =>
  description?.trim() || merchant?.trim() || categoryName;

function sameScope(a: ExpenseScope, b: ExpenseScope): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'SHARED') return b.type === 'SHARED';
  return b.type === 'INDIVIDUAL' && a.ownerId === b.ownerId;
}

function sameRecurrence(a: Recurrence | null, b: Recurrence | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.frequency !== b.frequency) return false;
  switch (a.frequency) {
    case 'WEEKLY':
      return b.frequency === 'WEEKLY' && a.dayOfWeek === b.dayOfWeek;
    case 'MONTHLY':
      return b.frequency === 'MONTHLY' && a.dayOfMonth === b.dayOfMonth;
    case 'YEARLY':
      return b.frequency === 'YEARLY' && a.month === b.month && a.day === b.day;
  }
}

function matchesExpectedExpense(current: Expense, expected: Expense): boolean {
  return current.id === expected.id
    && current.description === expected.description
    && current.merchant === expected.merchant
    && current.amount.amountMinor === expected.amount.amountMinor
    && current.amount.currency === expected.amount.currency
    && current.date === expected.date
    && current.categoryId === expected.categoryId
    && current.expenseType === expected.expenseType
    && sameScope(current.scope, expected.scope)
    && current.paidBy === expected.paidBy
    && sameRecurrence(current.recurrence, expected.recurrence)
    && current.notes === expected.notes
    && current.receiptId === expected.receiptId
    && current.createdAt === expected.createdAt;
}

type ParsedFields = Partial<z.output<z.ZodObject<typeof fields>>>;

function toDomainChanges(p: ParsedFields) {
  const scope: ExpenseScope | undefined = p.scope
    ? p.scope.type === 'SHARED'
      ? { type: 'SHARED' }
      : { type: 'INDIVIDUAL', ownerId: asMemberId(p.scope.ownerId) }
    : undefined;
  return {
    ...(p.description !== undefined && { description: p.description }),
    ...(p.merchant !== undefined && { merchant: p.merchant }),
    ...(p.amount && { amount: money(p.amount.amountMinor, asCurrencyCode(p.amount.currency)) }),
    ...(p.date && { date: asIsoDate(p.date) }),
    ...(p.categoryId && { categoryId: asCategoryId(p.categoryId) }),
    ...(p.expenseType && { expenseType: p.expenseType }),
    ...(scope && { scope }),
    ...(p.paidBy && { paidBy: asMemberId(p.paidBy) }),
    ...(p.recurrence !== undefined && { recurrence: p.recurrence }),
    ...(p.notes !== undefined && { notes: p.notes }),
    ...(p.receiptId !== undefined && { receiptId: p.receiptId === null ? null : asReceiptId(p.receiptId) }),
  };
}

export class ExpenseService {
  constructor(private readonly ctx: AppContext) {}

  getById(id: string): Promise<Expense | undefined> {
    return this.ctx.expenses.getById(asExpenseId(parseInput(idSchema, id)));
  }

  listRange(from: IsoDate, to: IsoDate): Promise<Expense[]> {
    return this.ctx.expenses.findByDateRange(from, to);
  }

  listMonth(month: YearMonth): Promise<Expense[]> {
    const { from, to } = monthRange(month);
    return this.ctx.expenses.findByDateRange(from, to);
  }

  recent(limit = 10): Promise<Expense[]> {
    return this.ctx.expenses.findRecent(limit);
  }

  async monthSummary(month: YearMonth, currency: CurrencyCode = DEFAULT_CURRENCY): Promise<ExpenseMonthSummary> {
    const [list, members] = await Promise.all([this.listMonth(month), this.ctx.members.getAll()]);
    const total = totalOf(list, currency);
    const shared = totalOf(sharedExpenses(list), currency);
    const fixed = totalOf(expensesOfType(list, 'FIXED'), currency);
    const paid = totalsBy(sharedExpenses(list), (e) => e.paidBy, currency);
    return {
      total,
      byCategory: [...totalsBy(list, (e) => e.categoryId, currency)]
        .map(([categoryId, amount]) => ({ categoryId, amount, shareBasisPoints: shareInBasisPoints(amount, total) }))
        .sort((a, b) => b.amount.amountMinor - a.amount.amountMinor),
      shared,
      individual: subtract(total, shared),
      fixed,
      variable: subtract(total, fixed),
      sharedPaidBy: members.map((m) => ({ memberId: m.id, amount: paid.get(m.id) ?? zero(currency) })),
    };
  }

  async create(input: CreateExpenseInput): Promise<Expense> {
    const parsed = parseInput(createSchema, input);
    const changes = toDomainChanges(parsed);
    return this.ctx.tx.run(async () => {
      const category = await requireCategory(this.ctx, asCategoryId(parsed.categoryId), 'categoryId', { mustBeActive: true });
      await this.checkMembers(changes.paidBy, changes.scope, true);
      const now = toTimestamp(this.ctx.clock.now());
      const description = describe(parsed.description, parsed.merchant, category.name);
      const expense = buildExpense({
        id: asExpenseId(this.ctx.newId()),
        description,
        merchant: changes.merchant ?? null,
        amount: money(parsed.amount.amountMinor, asCurrencyCode(parsed.amount.currency)),
        date: asIsoDate(parsed.date),
        categoryId: category.id,
        expenseType: parsed.expenseType,
        scope: changes.scope ?? { type: 'SHARED' },
        paidBy: asMemberId(parsed.paidBy),
        recurrence: changes.recurrence ?? null,
        notes: changes.notes ?? '',
        receiptId: changes.receiptId ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await this.ctx.expenses.save(expense);
      return expense;
    });
  }

  async update(input: UpdateExpenseInput): Promise<ExpenseUpdate> {
    const { id, changes: raw } = parseInput(updateSchema, input);
    const changes = toDomainChanges(raw);
    return this.ctx.tx.run(async () => {
      const previous = await this.ctx.expenses.getById(asExpenseId(id));
      if (!previous) throw notFound('Expense', id);
      if (changes.categoryId && changes.categoryId !== previous.categoryId) {
        await requireCategory(this.ctx, changes.categoryId, 'categoryId', { mustBeActive: true });
      }
      // An explicitly blank description is derived again from the (possibly new)
      // merchant or category, as in `create`, so it never goes stale.
      if (changes.description?.trim() === '') {
        const categoryId = changes.categoryId ?? previous.categoryId;
        const category = await requireCategory(this.ctx, categoryId, 'categoryId', { mustBeActive: false });
        const merchant = changes.merchant !== undefined ? changes.merchant : previous.merchant;
        changes.description = describe('', merchant, category.name);
      }
      await this.checkMembers(
        changes.paidBy !== previous.paidBy ? changes.paidBy : undefined,
        changes.scope,
        true,
      );
      const current = updateExpense(previous, changes, toTimestamp(this.ctx.clock.now()));
      await this.ctx.expenses.save(current);
      return { previous, current };
    });
  }

  /** Returns the deleted expense; `expected` makes assistant undo conditional on the creation snapshot. */
  async delete(rawId: string, expected?: Expense): Promise<Expense> {
    const id = asExpenseId(parseInput(idSchema, rawId));
    return this.ctx.tx.run(async () => {
      const expense = await this.ctx.expenses.getById(id);
      if (!expense) throw notFound('Expense', id);
      if (expected && !matchesExpectedExpense(expense, expected)) {
        throw new ApplicationError('CONFLICT', 'El gasto cambió desde que se creó.', [], { reason: 'RECORD_CHANGED' });
      }
      await this.ctx.expenses.delete(id);
      return expense;
    });
  }

  /**
   * Writes back an exact snapshot previously returned by this service
   * (undo of delete or update). References are re-checked, but archived
   * categories and inactive members are accepted: the snapshot was valid
   * when it was taken.
   */
  async restore(snapshot: Expense): Promise<Expense> {
    const expense = buildExpense(snapshot);
    return this.ctx.tx.run(async () => {
      await requireCategory(this.ctx, expense.categoryId, 'categoryId', { mustBeActive: false });
      await this.checkMembers(expense.paidBy, expense.scope, false);
      await this.ctx.expenses.save(expense);
      return expense;
    });
  }

  private async checkMembers(
    paidBy: ReturnType<typeof asMemberId> | undefined,
    scope: ExpenseScope | undefined,
    mustBeActive: boolean,
  ): Promise<void> {
    if (paidBy) await requireMember(this.ctx, paidBy, 'paidBy', { mustBeActive });
    if (scope?.type === 'INDIVIDUAL') await requireMember(this.ctx, scope.ownerId, 'scope.ownerId', { mustBeActive });
  }
}
