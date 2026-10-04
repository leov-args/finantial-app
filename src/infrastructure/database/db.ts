import { Dexie, type Table } from 'dexie';
import { DEFAULT_CATEGORIES } from '../../domain/category/category.ts';
import { toTimestamp } from '../../domain/shared/dates.ts';
import type {
  CategoryRecord,
  ExpenseRecord,
  IncomeRecord,
  MemberRecord,
  PlanItemRecord,
  SettingsRecord,
} from './records.ts';
import { applyMigrations } from './migrations.ts';

export const DB_NAME = 'family-finance';

export interface DbOptions {
  /** Used for seed timestamps; injectable for deterministic tests. */
  readonly now?: () => Date;
  /** Passed to Dexie (e.g. a different indexedDB implementation). */
  readonly dexie?: ConstructorParameters<typeof Dexie>[1];
}

/**
 * The single IndexedDB database of the app. Only code in
 * src/infrastructure touches this class.
 */
export class FamilyFinanceDb extends Dexie {
  members!: Table<MemberRecord, string>;
  categories!: Table<CategoryRecord, string>;
  incomes!: Table<IncomeRecord, string>;
  expenses!: Table<ExpenseRecord, string>;
  planItems!: Table<PlanItemRecord, string>;
  /** No row means the defaults (see DexieSettingsRepository). */
  settings!: Table<SettingsRecord, string>;

  constructor(name: string = DB_NAME, options: DbOptions = {}) {
    super(name, options.dexie);
    applyMigrations(this);

    // Runs exactly once, when the database is created for the first time
    // (never on upgrades, never on an existing database).
    this.on('populate', (tx) => {
      const now = toTimestamp((options.now ?? (() => new Date()))());
      const seed: CategoryRecord[] = DEFAULT_CATEGORIES.map((c) => ({
        id: c.id,
        name: c.name,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }));
      return tx.table<CategoryRecord, string>('categories').bulkAdd(seed).then(() => undefined);
    });
  }

  /** Tables that hold user data, in backup/restore order. */
  get dataTables(): Table[] {
    return [this.members, this.categories, this.incomes, this.expenses, this.planItems, this.settings];
  }
}
