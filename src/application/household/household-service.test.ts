import { afterEach, describe, expect, it } from 'vitest';
import { makeTestApp } from '../../test/test-app.ts';

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

    const { filename, text } = await source.services.household.exportFile();
    const preview = source.services.household.preview(text);

    expect(filename).toMatch(/^family-finance-\d{4}-\d{2}-\d{2}\.json$/);
    expect(preview.summary).toEqual({
      memberNames: ['Ana'], expenses: 1, incomes: 1, planItems: 1, dateRange: { from: '2026-09-01', to: '2026-09-02' },
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
  });
});

async function readData(instance: TestApp) {
  await instance.db.open();
  const [members, categories, incomes, expenses, planItems, settings, monthSnapshots] = await Promise.all([
    instance.db.members.toArray(), instance.db.categories.toArray(), instance.db.incomes.toArray(), instance.db.expenses.toArray(),
    instance.db.planItems.toArray(), instance.db.settings.toArray(), instance.db.monthSnapshots.toArray(),
  ]);
  return { members, categories, incomes, expenses, planItems, settings, monthSnapshots };
}
