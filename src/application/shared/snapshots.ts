import { buildMonthSnapshot } from '../../domain/family/snapshot.ts';
import { type YearMonth, addMonths, toLocalIsoDate, toTimestamp, yearMonthOf } from '../../domain/shared/dates.ts';
import type { AppContext } from './context.ts';

/**
 * E1-1: call inside the transaction, BEFORE changing anything that feeds the
 * family split (plan, members, reference incomes, split rule). Saves a
 * snapshot of every finished month from the oldest movement onward that has
 * none, so the change cannot rewrite them. Idempotent; the current month is
 * never frozen.
 */
export async function freezePastMonths(ctx: AppContext): Promise<void> {
  const thisMonth = yearMonthOf(toLocalIsoDate(ctx.clock.now()));
  const firstDates = (await Promise.all([ctx.expenses.firstDate(), ctx.incomes.firstDate()])).flatMap((d) => (d ? [d] : []));
  const first = firstDates.sort()[0];
  if (!first) return;

  const pending: YearMonth[] = [];
  const done = new Set(await ctx.snapshots.months());
  for (let month = yearMonthOf(first); month < thisMonth; month = addMonths(month, 1)) {
    if (!done.has(month)) pending.push(month);
  }
  if (pending.length === 0) return;

  const [members, planItems, settings] = await Promise.all([ctx.members.getAll(), ctx.planItems.getAll(), ctx.settings.getHousehold()]);
  const createdAt = toTimestamp(ctx.clock.now());
  for (const month of pending) {
    await ctx.snapshots.save(
      buildMonthSnapshot({
        month,
        splitRule: settings.splitRule,
        members: members.map((m) => ({ id: m.id, active: m.active, referenceIncome: m.referenceIncome })),
        planItems,
        createdAt,
      }),
    );
  }
}
