import type { Dexie, Transaction } from 'dexie';

/**
 * Ordered list of schema versions. RULES:
 *  1. Never edit or delete a version that has shipped. Add a new one.
 *     (v1 has not shipped yet: the redesign extended it in place because the
 *     only existing data was test data. See docs/spec-rediseno.md, supuesto 5.)
 *  2. A version lists the FULL store/index definition for every table
 *     (Dexie diffs it against the previous version).
 *  3. Data reshaping goes in `upgrade`, which runs inside the version-change
 *     transaction: if it throws, IndexedDB aborts and the old data is intact.
 *  4. Bump CURRENT_DB_VERSION and add a migration test for every new version.
 *
 * Index syntax: first entry is the primary key; the rest are secondary indexes.
 */
export interface Migration {
  readonly version: number;
  readonly description: string;
  readonly stores: Record<string, string | null>;
  readonly upgrade?: (tx: Transaction) => Promise<void>;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'Initial schema: members, categories, incomes, expenses, plan items, household settings.',
    stores: {
      members: 'id, active',
      categories: 'id, archived',
      incomes: 'id, date, memberId',
      expenses: 'id, date, categoryId, paidBy, ownerId, receiptId, createdAt',
      planItems: 'id',
      settings: 'id',
    },
  },
];

export const CURRENT_DB_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export function applyMigrations(db: Dexie, migrations: readonly Migration[] = MIGRATIONS): void {
  let previous = 0;
  for (const m of migrations) {
    if (m.version <= previous) {
      throw new Error(`Migrations must have strictly increasing versions (${m.version} after ${previous}).`);
    }
    previous = m.version;
    const version = db.version(m.version).stores(m.stores);
    if (m.upgrade) version.upgrade(m.upgrade);
  }
}
