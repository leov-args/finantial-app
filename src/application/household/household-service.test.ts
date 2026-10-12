import { afterEach, describe, expect, it, vi } from 'vitest';
import { asTimestamp } from '../../domain/shared/dates.ts';
import { makeTestApp } from '../../test/test-app.ts';
import { type TestHouseholdData, serializeTestHousehold } from '../../test/household-file.ts';

type TestApp = ReturnType<typeof makeTestApp>;

const apps: TestApp[] = [];
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

const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });
const old = asTimestamp('2026-10-01T10:00:00.000Z');
const newer = asTimestamp('2026-10-02T10:00:00.000Z');

function mergeData(overrides: Partial<TestHouseholdData> = {}): TestHouseholdData {
  return {
    members: [{ id: 'member-a', name: 'Ana', active: true, referenceIncome: null, color: 'blue', createdAt: old, updatedAt: old }],
    categories: [{ id: 'category-a', name: 'Comida', archived: false, createdAt: old, updatedAt: old }],
    incomes: [], expenses: [], planItems: [], settings: [], monthSnapshots: [], tombstones: [],
    ...overrides,
  };
}

function fileFor(data: TestHouseholdData): string {
  return serializeTestHousehold(data);
}

function existingMember() {
  const member = mergeData().members[0];
  if (!member) throw new Error('Base member missing from test household.');
  return member;
}

const sortByMonth = (rows: readonly { readonly month: string }[]) => [...rows].sort((a, b) => a.month.localeCompare(b.month));

describe('HouseholdService.exportFile', () => {
  it('builds a file that preview accepts and whose summary matches the household', async () => {
    const source = app();
    const ana = await source.services.members.create({ name: 'Ana' });
    await source.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
    await source.services.incomes.create({
      memberId: ana.id, amount: eur(260000), date: '2026-09-01',
      schedule: { kind: 'MONTHLY', variability: 'FIXED' }, source: 'SALARY', description: 'Nómina',
    });
    const category = (await source.services.categories.list()).find((item) => item.id === 'cat-food');
    if (!category) throw new Error('Seed category missing in test.');
    await source.services.expenses.create({
      description: 'Compra', amount: eur(1250), date: '2026-09-02',
      categoryId: category.id, expenseType: 'VARIABLE', scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id,
    });
    await source.services.plan.create({ name: 'Alquiler', kind: { type: 'FORMULA', amount: eur(90000) } });
    await source.services.plan.setSplitRule({ splitRule: 'PROPORTIONAL' });
    const temporaryCategory = await source.services.categories.create({ name: 'Temporary' });
    await source.services.categories.delete(temporaryCategory.id);

    const { filename, text } = await source.services.household.exportFile();
    const preview = source.services.household.preview(text);

    expect(filename).toMatch(/^family-finance-\d{4}-\d{2}-\d{2}\.json$/);
    expect(preview.summary).toEqual({
      memberNames: ['Ana'], expenses: 1, incomes: 1, planItems: 1, dateRange: { from: '2026-09-01', to: '2026-09-02' },
    });
    expect(preview.parsed).toMatchObject({
      tombstones: [{ table: 'categories', id: temporaryCategory.id, deletedAt: '2026-10-02T10:00:00.000Z' }],
    });
  });

  it('round-trips into a fresh empty app with equal data', async () => {
    const source = app();
    const ana = await source.services.members.create({ name: 'Ana' });
    const partner = await source.services.members.create({ name: 'Pareja' });
    await source.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
    await source.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
    await source.services.incomes.create({
      memberId: ana.id, amount: eur(260000), date: '2026-09-01',
      schedule: { kind: 'MONTHLY', variability: 'FIXED' }, source: 'SALARY', description: 'Nómina',
    });
    const category = (await source.services.categories.list()).find((item) => item.id === 'cat-food');
    if (!category) throw new Error('Seed category missing in test.');
    await source.services.expenses.create({
      description: 'Compra', amount: eur(1250), date: '2026-09-02',
      categoryId: category.id, expenseType: 'VARIABLE', scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id,
    });
    await source.services.plan.create({ name: 'Alquiler', kind: { type: 'FORMULA', amount: eur(90000) } });
    await source.services.plan.create({
      name: 'Portátil', kind: { type: 'ASSIGNED', shares: [{ memberId: ana.id, amount: eur(30000) }] },
    });
    await source.services.plan.setSplitRule({ splitRule: 'EQUAL_KEEP' });
    const removedCategory = await source.services.categories.create({ name: 'Temporal' });
    await source.services.categories.delete(removedCategory.id);

    const { text } = await source.services.household.exportFile();
    const target = app();
    const { parsed } = target.services.household.preview(text);
    await target.services.household.join(parsed);

    const sortById = <T extends { readonly id: string }>(rows: readonly T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    const [sourceData, targetData] = await Promise.all([
      readData(source), readData(target),
    ]);
    expect(sortById(targetData.members)).toEqual(sortById(sourceData.members));
    expect(sortById(targetData.categories)).toEqual(sortById(sourceData.categories));
    expect(sortById(targetData.incomes)).toEqual(sortById(sourceData.incomes));
    expect(sortById(targetData.expenses)).toEqual(sortById(sourceData.expenses));
    expect(sortById(targetData.planItems)).toEqual(sortById(sourceData.planItems));
    expect(targetData.settings).toEqual(sourceData.settings);
    expect(sortByMonth(targetData.monthSnapshots)).toEqual(sortByMonth(sourceData.monthSnapshots));
    expect(targetData.tombstones).toEqual(sourceData.tombstones);
  });
});

describe('HouseholdService.merge', () => {
  it('previews counts, applies changes, and performs no writes when the same file is merged again', async () => {
    const target = app();
    await target.services.household.join(target.services.household.preview(fileFor(mergeData())).parsed);
    const incoming = mergeData({
      members: [
        { ...existingMember(), name: 'Ana editada', updatedAt: newer },
        { id: 'member-b', name: 'Pareja', active: true, referenceIncome: null, color: 'indigo', createdAt: old, updatedAt: newer },
      ],
      expenses: [{
        id: 'expense-b', description: 'Compra', merchant: null, amountMinor: 1250, currency: 'EUR', date: '2026-10-02',
        categoryId: 'category-a', expenseType: 'VARIABLE', scopeType: 'SHARED', ownerId: null, paidBy: 'member-b',
        recurrence: null, notes: '', receiptId: null, createdAt: newer, updatedAt: newer,
      }],
    });
    const parsed = target.services.household.preview(fileFor(incoming)).parsed;

    expect(await target.services.household.previewMerge(parsed)).toEqual({ created: 2, updated: 1, deleted: 0, hasChanges: true });
    expect(await target.services.household.merge(parsed)).toEqual({ created: 2, updated: 1, deleted: 0, hasChanges: true });
    expect((await target.services.members.list()).map((member) => member.name)).toContain('Pareja');

    const tables = target.db.dataTables;
    const writeSpies = tables.flatMap((table) => [vi.spyOn(table, 'bulkPut'), vi.spyOn(table, 'bulkDelete')]);
    const dataBeforeRepeat = await readData(target);
    expect(await target.services.household.previewMerge(parsed)).toEqual({ created: 0, updated: 0, deleted: 0, hasChanges: false });
    expect(await target.services.household.merge(parsed)).toEqual({ created: 0, updated: 0, deleted: 0, hasChanges: false });
    expect(writeSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(await readData(target)).toEqual(dataBeforeRepeat);
    writeSpies.forEach((spy) => spy.mockRestore());
  });

  it('rejects an unrelated household with a translated application reason and writes nothing', async () => {
    const target = app();
    await target.services.household.join(target.services.household.preview(fileFor(mergeData())).parsed);
    const before = await readData(target);
    const unrelated = mergeData({
      members: [{ id: 'member-other', name: 'Otra casa', active: true, referenceIncome: null, color: 'blue', createdAt: old, updatedAt: old }],
    });
    const parsed = target.services.household.preview(fileFor(unrelated)).parsed;

    await expect(target.services.household.previewMerge(parsed)).rejects.toMatchObject({ reason: 'HOUSEHOLD_UNRELATED' });
    await expect(target.services.household.merge(parsed)).rejects.toMatchObject({ reason: 'HOUSEHOLD_UNRELATED' });
    expect(await readData(target)).toEqual(before);
  });

  it('rolls back every table when a write fails after an earlier table was written', async () => {
    const target = app();
    await target.services.household.join(target.services.household.preview(fileFor(mergeData())).parsed);
    const incoming = mergeData({
      members: [
        existingMember(),
        { id: 'member-b', name: 'Pareja', active: true, referenceIncome: null, color: 'indigo', createdAt: old, updatedAt: newer },
      ],
      expenses: [{
        id: 'expense-b', description: 'Compra', merchant: null, amountMinor: 1250, currency: 'EUR', date: '2026-10-02',
        categoryId: 'category-a', expenseType: 'VARIABLE', scopeType: 'SHARED', ownerId: null, paidBy: 'member-b',
        recurrence: null, notes: '', receiptId: null, createdAt: newer, updatedAt: newer,
      }],
    });
    const parsed = target.services.household.preview(fileFor(incoming)).parsed;
    const before = await readData(target);
    const failure = vi.spyOn(target.db.expenses, 'bulkPut').mockRejectedValue(new Error('write failed'));

    await expect(target.services.household.merge(parsed)).rejects.toThrow('write failed');
    expect(await readData(target)).toEqual(before);
    failure.mockRestore();
  });

  it('rejects broken references already present locally before merging or writing', async () => {
    const target = app();
    const local = mergeData({
      expenses: [{
        id: 'expense-a', description: 'Compra', merchant: null, amountMinor: 1250, currency: 'EUR', date: '2026-10-02',
        categoryId: 'category-a', expenseType: 'VARIABLE', scopeType: 'SHARED', ownerId: null, paidBy: 'member-a',
        recurrence: null, notes: '', receiptId: null, createdAt: old, updatedAt: old,
      }],
    });
    await target.services.household.join(target.services.household.preview(fileFor(local)).parsed);
    await target.db.members.delete('member-a');
    const before = await readData(target);
    const incoming = target.services.household.preview(fileFor(mergeData())).parsed;

    await expect(target.services.household.previewMerge(incoming)).rejects.toMatchObject({ reason: 'HOUSEHOLD_INVALID_FILE' });
    await expect(target.services.household.merge(incoming)).rejects.toMatchObject({ reason: 'HOUSEHOLD_INVALID_FILE' });
    expect(await readData(target)).toEqual(before);
  });
});

async function readData(instance: TestApp) {
  await instance.db.open();
  const [members, categories, incomes, expenses, planItems, settings, monthSnapshots, tombstones] = await Promise.all([
    instance.db.members.toArray(), instance.db.categories.toArray(), instance.db.incomes.toArray(), instance.db.expenses.toArray(),
    instance.db.planItems.toArray(), instance.db.settings.toArray(), instance.db.monthSnapshots.toArray(), instance.db.tombstones.toArray(),
  ]);
  return { members, categories, incomes, expenses, planItems, settings, monthSnapshots, tombstones };
}
