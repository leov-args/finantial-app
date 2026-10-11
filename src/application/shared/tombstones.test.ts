import { afterEach, describe, expect, it, vi } from 'vitest';
import { asTimestamp, fixedClock } from '../../domain/shared/dates.ts';
import type { TombstoneTable } from '../../domain/shared/tombstone.ts';
import { makeTestApp } from '../../test/test-app.ts';

type TestApplication = ReturnType<typeof makeTestApp>;
type TestApp = { readonly app: TestApplication; setNextId(id: string): void };

const apps: TestApplication[] = [];
const makeApp = (): TestApp => {
  let nextId = 'unused';
  const app = makeTestApp({
    dbName: `tombstones-${crypto.randomUUID()}`,
    clock: fixedClock('2026-10-02T10:00:00.000Z'),
    newId: () => nextId,
  });
  apps.push(app);
  return { app, setNextId: (id) => { nextId = id; } };
};

afterEach(async () => {
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) {
    app.close();
    await app.db.delete();
  }
});

const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });
const deletedAt = asTimestamp('2026-10-02T10:00:00.000Z');

describe('tombstones', () => {
  it('marks every supported hard delete using the injected clock and clears restored records', async () => {
    const { app, setNextId } = makeApp();
    setNextId('member-for-transactions');
    const member = await app.services.members.create({ name: 'Ana' });
    setNextId('unused-member');
    const unusedMember = await app.services.members.create({ name: 'Unused' });
    setNextId('unused-category');
    const category = await app.services.categories.create({ name: 'Coffee' });
    const income = await app.services.incomes.create({
      memberId: member.id,
      amount: eur(200000),
      date: '2026-10-02',
      schedule: { kind: 'MONTHLY', variability: 'FIXED' },
      source: 'SALARY',
    });
    const expense = await app.services.expenses.create({
      amount: eur(450),
      date: '2026-10-02',
      categoryId: 'cat-food',
      expenseType: 'VARIABLE',
      scope: { type: 'SHARED' },
      paidBy: member.id,
    });
    const planItem = await app.services.plan.create({ name: 'Rent', kind: { type: 'FORMULA', amount: eur(90000) } });

    await app.services.expenses.delete(expense.id);
    await app.services.incomes.delete(income.id);
    await app.services.members.delete(unusedMember.id);
    await app.services.categories.delete(category.id);
    await app.services.plan.delete(planItem.id);

    expect(await app.db.tombstones.toArray()).toHaveLength(5);
    expect(await app.db.tombstones.toArray()).toEqual(expect.arrayContaining([
      { table: 'expenses', id: expense.id, deletedAt },
      { table: 'incomes', id: income.id, deletedAt },
      { table: 'members', id: unusedMember.id, deletedAt },
      { table: 'categories', id: category.id, deletedAt },
      { table: 'planItems', id: planItem.id, deletedAt },
    ]));

    await app.services.expenses.restore(expense);
    await app.services.incomes.restore(income);
    await app.services.plan.restore(planItem);

    expect(await app.db.tombstones.toArray()).toEqual(expect.arrayContaining([
      { table: 'members', id: unusedMember.id, deletedAt },
      { table: 'categories', id: category.id, deletedAt },
    ]));
    expect(await app.db.tombstones.count()).toBe(2);
  });

  it('does not mark failed deletes and rolls a delete back if marking fails', async () => {
    const { app, setNextId } = makeApp();
    setNextId('referenced-member');
    const member = await app.services.members.create({ name: 'Ana' });
    const income = await app.services.incomes.create({
      memberId: member.id,
      amount: eur(200000),
      date: '2026-10-02',
      schedule: { kind: 'MONTHLY', variability: 'FIXED' },
      source: 'SALARY',
    });
    setNextId('referenced-category');
    const category = await app.services.categories.create({ name: 'Coffee' });
    await app.services.expenses.create({
      amount: eur(450), date: '2026-10-02', categoryId: category.id,
      expenseType: 'VARIABLE', scope: { type: 'SHARED' }, paidBy: member.id,
    });

    await expect(app.services.members.delete(member.id)).rejects.toMatchObject({ code: 'REFERENCE_IN_USE' });
    await expect(app.services.categories.delete(category.id)).rejects.toMatchObject({ code: 'REFERENCE_IN_USE' });
    await expect(app.services.expenses.delete('missing-expense')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await app.db.tombstones.count()).toBe(0);

    vi.spyOn(app.db.tombstones, 'put').mockRejectedValue(new Error('tombstone write failed'));
    await expect(app.services.incomes.delete(income.id)).rejects.toThrow('tombstone write failed');

    expect(await app.services.incomes.getById(income.id)).toEqual(income);
    expect(await app.db.tombstones.count()).toBe(0);
  });

  it('clears stale tombstones on create and update for every supported record', async () => {
    const { app, setNextId } = makeApp();
    const stale = (table: TombstoneTable, id: string) => ({ table, id, deletedAt });

    await app.db.tombstones.bulkPut([
      stale('members', 'created-member'), stale('categories', 'created-category'), stale('incomes', 'created-income'),
      stale('expenses', 'created-expense'), stale('planItems', 'created-plan-item'),
    ]);

    setNextId('created-member');
    const member = await app.services.members.create({ name: 'Ana' });
    setNextId('created-category');
    const category = await app.services.categories.create({ name: 'Coffee' });
    setNextId('created-income');
    const income = await app.services.incomes.create({
      memberId: member.id,
      amount: eur(200000),
      date: '2026-10-02',
      schedule: { kind: 'MONTHLY', variability: 'FIXED' },
      source: 'SALARY',
    });
    setNextId('created-expense');
    const expense = await app.services.expenses.create({
      amount: eur(450),
      date: '2026-10-02',
      categoryId: category.id,
      expenseType: 'VARIABLE',
      scope: { type: 'SHARED' },
      paidBy: member.id,
    });
    setNextId('created-plan-item');
    const planItem = await app.services.plan.create({ name: 'Rent', kind: { type: 'FORMULA', amount: eur(90000) } });
    expect(await app.db.tombstones.count()).toBe(0);

    await app.db.tombstones.bulkPut([
      stale('members', member.id), stale('categories', category.id), stale('incomes', income.id),
      stale('expenses', expense.id), stale('planItems', planItem.id),
    ]);
    await app.services.members.rename({ id: member.id, name: 'Ana M.' });
    await app.services.categories.rename({ id: category.id, name: 'Coffee beans' });
    await app.services.incomes.update({ id: income.id, changes: { notes: 'Updated' } });
    await app.services.expenses.update({ id: expense.id, changes: { notes: 'Updated' } });
    await app.services.plan.update({ id: planItem.id, changes: { name: 'Updated rent' } });

    expect(await app.db.tombstones.count()).toBe(0);

    await app.db.tombstones.bulkPut([stale('members', member.id), stale('categories', category.id)]);
    await app.services.members.setActive({ id: member.id, active: true });
    await app.services.members.setColor({ id: member.id, color: member.color });
    await app.services.categories.setArchived({ id: category.id, archived: false });
    expect(await app.db.tombstones.count()).toBe(0);
  });
});
