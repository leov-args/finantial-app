import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTestApp } from '../test/test-app.ts';
import { serializeHousehold } from '../infrastructure/backup/household-file.ts';
import type { HouseholdFileData } from '../infrastructure/backup/household-file.ts';
import { asTimestamp } from '../domain/shared/dates.ts';

const apps: ReturnType<typeof makeTestApp>[] = [];
const app = () => {
  const instance = makeTestApp();
  apps.push(instance);
  return instance;
};

afterEach(async () => {
  for (const instance of apps.splice(0)) {
    instance.close();
    await instance.db.delete();
  }
});

async function readData(instance: ReturnType<typeof makeTestApp>): Promise<HouseholdFileData> {
  await instance.db.open();
  const [members, categories, incomes, expenses, planItems, settings, monthSnapshots, tombstones] = await Promise.all([
    instance.db.members.toArray(), instance.db.categories.toArray(), instance.db.incomes.toArray(), instance.db.expenses.toArray(),
    instance.db.planItems.toArray(), instance.db.settings.toArray(), instance.db.monthSnapshots.toArray(), instance.db.tombstones.toArray(),
  ]);
  return { members, categories, incomes, expenses, planItems, settings, monthSnapshots, tombstones };
}

describe('HouseholdService', () => {
  it('replaces a fresh database with the exact validated household records', async () => {
    const source = app();
    const ana = await source.services.members.create({ name: 'Ana' });
    await source.services.incomes.create({
      memberId: ana.id, amount: { amountMinor: 260000, currency: 'EUR' }, date: '2026-09-01',
      schedule: { kind: 'MONTHLY', variability: 'FIXED' }, source: 'SALARY', description: 'Nómina',
    });
    const category = (await source.services.categories.list()).find((item) => item.id === 'cat-food');
    if (!category) throw new Error('Seed category missing in test.');
    await source.services.expenses.create({
      description: 'Compra', amount: { amountMinor: 1250, currency: 'EUR' }, date: '2026-09-02',
      categoryId: category.id, expenseType: 'VARIABLE', scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id,
    });
    await source.services.plan.create({ name: 'Alquiler', kind: { type: 'FORMULA', amount: { amountMinor: 90000, currency: 'EUR' } } });
    await source.services.plan.setSplitRule({ splitRule: 'PROPORTIONAL' });
    await source.db.monthSnapshots.add({
      month: '2026-08', splitRule: 'EQUAL_KEEP', members: [{ id: ana.id, active: true, referenceIncome: null }], planItems: [],
      createdAt: '2026-09-01T10:00:00.000Z',
    });

    const data = await readData(source);
    const archive = serializeHousehold(data, new Date('2026-10-11T10:00:00.000Z'));
    const target = app();
    const preview = target.services.household.preview(archive);
    await target.services.household.join(preview.parsed);

    expect(await readData(target)).toEqual(data);
    expect(preview.summary).toEqual({
      memberNames: ['Ana'], expenses: 1, incomes: 1, planItems: 1, dateRange: { from: '2026-09-01', to: '2026-09-02' },
    });
  });

  it('rejects joining over existing household data', async () => {
    const source = app();
    await source.services.members.create({ name: 'Ana' });
    const text = serializeHousehold(await readData(source));
    const target = app();
    await target.services.members.create({ name: 'Local' });
    const { parsed } = target.services.household.preview(text);

    await expect(target.services.household.join(parsed)).rejects.toMatchObject({
      name: 'ApplicationError', reason: 'HOUSEHOLD_NOT_EMPTY',
    });
    expect((await target.services.members.list()).map((member) => member.name)).toEqual(['Local']);
  });

  it('does not treat a database containing only tombstones as empty during join', async () => {
    const source = app();
    await source.services.members.create({ name: 'Ana' });
    const { parsed } = source.services.household.preview(serializeHousehold(await readData(source)));
    const target = app();
    const tombstone = { table: 'members' as const, id: 'deleted-member', deletedAt: asTimestamp('2026-10-02T10:00:00.000Z') };
    await target.db.tombstones.put(tombstone);

    await expect(target.services.household.join(parsed)).rejects.toMatchObject({
      name: 'ApplicationError', reason: 'HOUSEHOLD_NOT_EMPTY',
    });
    expect(await target.db.tombstones.toArray()).toEqual([tombstone]);
  });

  it('imports a v2 household without creating tombstones', async () => {
    const source = app();
    await source.services.members.create({ name: 'Ana' });
    const v2File = JSON.parse(serializeHousehold(await readData(source))) as { dbVersion: number; data: Record<string, unknown> };
    v2File.dbVersion = 2;
    delete v2File.data['tombstones'];
    const target = app();
    const { parsed } = target.services.household.preview(JSON.stringify(v2File));

    await target.services.household.join(parsed);

    expect((await target.services.members.list()).map((member) => member.name)).toEqual(['Ana']);
    expect(await target.db.tombstones.toArray()).toEqual([]);
  });

  it('restores a populated database by replacing all data, including snapshots and tombstones', async () => {
    const source = app();
    const ana = await source.services.members.create({ name: 'Restored Ana' });
    await source.services.categories.create({ name: 'Restored category' });
    await source.services.plan.create({ name: 'Restored plan', kind: { type: 'FORMULA', amount: { amountMinor: 90000, currency: 'EUR' } } });
    await source.db.monthSnapshots.add({
      month: '2026-08', splitRule: 'EQUAL_KEEP', members: [{ id: ana.id, active: true, referenceIncome: null }], planItems: [],
      createdAt: '2026-09-01T10:00:00.000Z',
    });
    await source.db.tombstones.put({ table: 'members', id: 'deleted-in-source', deletedAt: asTimestamp('2026-10-02T10:00:00.000Z') });
    const sourceData = await readData(source);
    const target = app();
    const local = await target.services.members.create({ name: 'Local member' });
    await target.services.incomes.create({
      memberId: local.id, amount: { amountMinor: 120000, currency: 'EUR' }, date: '2026-09-01',
      schedule: { kind: 'ONE_OFF' }, source: 'OTHER', description: 'Local income',
    });
    await target.services.plan.create({ name: 'Local plan', kind: { type: 'FORMULA', amount: { amountMinor: 50000, currency: 'EUR' } } });
    await target.services.categories.create({ name: 'Local category' });
    await target.db.monthSnapshots.add({
      month: '2026-07', splitRule: 'PROPORTIONAL', members: [{ id: local.id, active: true, referenceIncome: null }], planItems: [],
      createdAt: '2026-08-01T10:00:00.000Z',
    });
    await target.db.tombstones.put({ table: 'expenses', id: 'deleted-on-target', deletedAt: asTimestamp('2026-10-01T10:00:00.000Z') });
    const { parsed } = target.services.household.preview(serializeHousehold(sourceData, new Date('2026-10-11T10:00:00.000Z')));

    await target.services.household.restore(parsed);

    expect(await readData(target)).toEqual(sourceData);
  });

  it('rolls a failed restore back to all pre-existing household data', async () => {
    const source = app();
    await source.services.members.create({ name: 'Restored Ana' });
    const { parsed } = source.services.household.preview(serializeHousehold(await readData(source)));
    const target = app();
    const local = await target.services.members.create({ name: 'Local member' });
    await target.services.incomes.create({
      memberId: local.id, amount: { amountMinor: 120000, currency: 'EUR' }, date: '2026-09-01',
      schedule: { kind: 'ONE_OFF' }, source: 'OTHER', description: 'Local income',
    });
    await target.services.categories.create({ name: 'Local category' });
    await target.db.monthSnapshots.add({
      month: '2026-07', splitRule: 'PROPORTIONAL', members: [{ id: local.id, active: true, referenceIncome: null }], planItems: [],
      createdAt: '2026-08-01T10:00:00.000Z',
    });
    await target.db.tombstones.put({ table: 'members', id: 'local-tombstone', deletedAt: asTimestamp('2026-10-01T10:00:00.000Z') });
    const before = await readData(target);
    vi.spyOn(target.db.expenses, 'bulkAdd').mockRejectedValue(new Error('simulated disk failure'));

    await expect(target.services.household.restore(parsed)).rejects.toThrow('simulated disk failure');
    expect(await readData(target)).toEqual(before);
  });

  it('maps invalid files to a translated application error reason', () => {
    const target = app();
    expect(() => target.services.household.preview('{')).toThrow(expect.objectContaining({ reason: 'HOUSEHOLD_INVALID_FILE' }));
  });

  it('rolls back all tables if a write fails partway through replacement', async () => {
    const source = app();
    await source.services.members.create({ name: 'Ana' });
    const text = serializeHousehold(await readData(source));
    const target = app();
    const seedCategories = await target.services.categories.list({ includeArchived: true });
    const { parsed } = target.services.household.preview(text);
    vi.spyOn(target.db.expenses, 'bulkAdd').mockRejectedValue(new Error('simulated disk failure'));

    await expect(target.services.household.join(parsed)).rejects.toThrow('simulated disk failure');
    expect(await target.db.members.count()).toBe(0);
    expect(await target.services.categories.list({ includeArchived: true })).toEqual(seedCategories);
  });
});
