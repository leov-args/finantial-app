import { toTimestamp } from '../../domain/shared/dates.ts';
import type { TombstoneTable } from '../../domain/shared/tombstone.ts';
import type { AppContext } from './context.ts';

export async function markTombstone(ctx: AppContext, table: TombstoneTable, id: string): Promise<void> {
  await ctx.tombstones.mark(table, id, toTimestamp(ctx.clock.now()));
}

export function clearTombstone(ctx: AppContext, table: TombstoneTable, id: string): Promise<void> {
  return ctx.tombstones.clear(table, id);
}
