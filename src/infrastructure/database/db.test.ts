import { Dexie } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../../domain/category/category.ts';
import { FamilyFinanceDb } from './db.ts';
import { CURRENT_DB_VERSION, MIGRATIONS, type Migration, applyMigrations } from './migrations.ts';
import type { ExpenseRecord } from './records.ts';

const opened: Dexie[] = [];
const track = <T extends Dexie>(db: T): T => {
  opened.push(db);
  return db;
};
afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await Dexie.delete(db.name);
  }
});

const uniqueName = () => `db-${crypto.randomUUID()}`;

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing migration');
  return value;
}
const FIRST = required(MIGRATIONS[0]);
const LAST = required(MIGRATIONS.at(-1));

const sampleExpense: ExpenseRecord = {
  id: 'exp-1',
  description: 'Alquiler',
  merchant: null,
  amountMinor: 89000,
  currency: 'EUR',
  date: '2026-10-01',
  categoryId: 'cat-housing',
  expenseType: 'FIXED',
  scopeType: 'SHARED',
  ownerId: null,
  paidBy: 'm-ana',
  recurrence: { frequency: 'MONTHLY', dayOfMonth: 1 },
  notes: '',
  receiptId: null,
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
};

describe('FamilyFinanceDb', () => {
  it('opens at the current schema version', async () => {
    const db = track(new FamilyFinanceDb(uniqueName()));
    await db.open();
    expect(db.verno).toBe(CURRENT_DB_VERSION);
  });

  it('starts with an empty plan, no stored settings and every data table in transactions', async () => {
    const db = track(new FamilyFinanceDb(uniqueName()));
    expect(await db.planItems.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
    expect(db.dataTables.map((t) => t.name)).toEqual(['members', 'categories', 'incomes', 'expenses', 'planItems', 'settings']);
  });

  it('seeds the default categories once, on creation', async () => {
    const name = uniqueName();
    const db = track(new FamilyFinanceDb(name, { now: () => new Date('2026-10-02T10:00:00Z') }));
    expect(await db.categories.count()).toBe(DEFAULT_CATEGORIES.length);
    const food = await db.categories.get('cat-food');
    expect(food).toMatchObject({ name: 'Comida', archived: false, createdAt: '2026-10-02T10:00:00.000Z' });

    // The user renames and deletes seeds; reopening must not re-seed.
    await db.categories.update('cat-food', { name: 'Supermercado' });
    await db.categories.delete('cat-other');
    db.close();

    const reopened = track(new FamilyFinanceDb(name));
    expect(await reopened.categories.count()).toBe(DEFAULT_CATEGORIES.length - 1);
    expect((await reopened.categories.get('cat-food'))?.name).toBe('Supermercado');
  });

  it('keeps data after closing and reopening (browser restart)', async () => {
    const name = uniqueName();
    const db = track(new FamilyFinanceDb(name));
    await db.expenses.add(sampleExpense);
    db.close();

    const reopened = track(new FamilyFinanceDb(name));
    expect(await reopened.expenses.get('exp-1')).toEqual(sampleExpense);
  });

  it('indexes ownerId only for individual expenses', async () => {
    const db = track(new FamilyFinanceDb(uniqueName()));
    await db.expenses.bulkAdd([
      sampleExpense,
      { ...sampleExpense, id: 'exp-2', scopeType: 'INDIVIDUAL', ownerId: 'm-ana' },
    ]);
    expect(await db.expenses.where('ownerId').equals('m-ana').primaryKeys()).toEqual(['exp-2']);
  });
});

describe('migrations', () => {
  it('declares strictly increasing versions starting at 1', () => {
    expect(MIGRATIONS[0]?.version).toBe(1);
    MIGRATIONS.forEach((m, i) => {
      if (i > 0) expect(m.version).toBeGreaterThan(MIGRATIONS[i - 1]?.version ?? 0);
    });
    expect(() => applyMigrations(new Dexie(uniqueName()), [FIRST, FIRST])).toThrow(/increasing/);
  });

  it('upgrades an existing populated database without losing data (strategy check)', async () => {
    const name = uniqueName();
    const v1 = track(new FamilyFinanceDb(name));
    await v1.expenses.add(sampleExpense);
    v1.close();

    // A hypothetical future version that adds a field and an index.
    const v2: Migration = {
      version: CURRENT_DB_VERSION + 1,
      description: 'test: add expenses.tags',
      stores: { ...LAST.stores, expenses: `${LAST.stores['expenses'] ?? ''}, *tags` },
      upgrade: async (tx) => {
        await tx.table('expenses').toCollection().modify((e: Record<string, unknown>) => {
          e['tags'] = [];
        });
      },
    };
    const upgraded = track(new Dexie(name));
    applyMigrations(upgraded, [...MIGRATIONS, v2]);
    await upgraded.open();

    expect(upgraded.verno).toBe(CURRENT_DB_VERSION + 1);
    expect(await upgraded.table('expenses').get('exp-1')).toEqual({ ...sampleExpense, tags: [] });
    expect(await upgraded.table('categories').count()).toBe(DEFAULT_CATEGORIES.length);
  });

  it('aborts a failing upgrade and leaves the old data intact', async () => {
    const name = uniqueName();
    const v1 = track(new FamilyFinanceDb(name));
    await v1.expenses.add(sampleExpense);
    v1.close();

    const broken: Migration = {
      version: CURRENT_DB_VERSION + 1,
      description: 'test: failing upgrade',
      stores: LAST.stores,
      upgrade: async (tx) => {
        await tx.table('expenses').clear();
        throw new Error('boom');
      },
    };
    const failing = new Dexie(name);
    applyMigrations(failing, [...MIGRATIONS, broken]);
    await expect(failing.open()).rejects.toThrow();
    failing.close();

    const again = track(new FamilyFinanceDb(name));
    expect(again.verno).toBe(CURRENT_DB_VERSION);
    expect(await again.expenses.get('exp-1')).toEqual(sampleExpense);
  });
});
