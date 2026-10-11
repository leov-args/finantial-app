import type { Timestamp } from './dates.ts';

export type TombstoneTable = 'members' | 'categories' | 'incomes' | 'expenses' | 'planItems';

export interface Tombstone {
  readonly table: TombstoneTable;
  readonly id: string;
  readonly deletedAt: Timestamp;
}
