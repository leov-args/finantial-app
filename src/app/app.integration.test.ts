import { afterEach, describe, expect, it } from 'vitest';
import { ApplicationError } from '../application/shared/errors.ts';
import { DomainError } from '../domain/shared/errors.ts';
import { asYearMonth } from '../domain/shared/dates.ts';
import { asMemberId } from '../domain/shared/ids.ts';
import { makeTestApp } from '../test/test-app.ts';
import { type App, createApp } from './container.ts';

const apps: App[] = [];
const newApp = (dbName?: string): App => {
  const app = dbName ? makeTestApp({ dbName }) : makeTestApp();
  apps.push(app);
  return app;
};
afterEach(async () => {
  for (const app of apps.splice(0)) {
    app.close();
    await app.db.delete();
  }
});

const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });

async function expectAppError(promise: Promise<unknown>, code: ApplicationError['code']): Promise<ApplicationError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApplicationError);
    expect((e as ApplicationError).code).toBe(code);
    return e as ApplicationError;
  }
  throw new Error(`Expected ApplicationError ${code}`);
}

async function household(app: App) {
  const ana = await app.services.members.create({ name: 'Ana' });
  const partner = await app.services.members.create({ name: 'Pareja' });
  return { ana, partner };
}

describe('members', () => {
  it('creates and lists members in creation order', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    expect((await app.services.members.list()).map((m) => m.name)).toEqual([ana.name, partner.name]);
  });

  it('validates input', async () => {
    const app = newApp();
    await expectAppError(app.services.members.create({ name: 'x'.repeat(100) }), 'VALIDATION');
    await expect(app.services.members.create({ name: '   ' })).rejects.toBeInstanceOf(DomainError);
  });

  it('refuses to delete members with history and allows deactivating them', async () => {
    const app = newApp();
    const { ana } = await household(app);
    await app.services.incomes.create({
      memberId: ana.id,
      amount: eur(400000),
      date: '2026-10-01',
      schedule: { kind: 'MONTHLY', variability: 'FIXED' },
      source: 'SALARY',
    });
    await expectAppError(app.services.members.delete(ana.id), 'REFERENCE_IN_USE');
    const inactive = await app.services.members.setActive({ id: ana.id, active: false });
    expect(inactive.active).toBe(false);
    expect((await app.services.members.listActive()).map((m) => m.id)).not.toContain(ana.id);
  });

  it('deletes members without history', async () => {
    const app = newApp();
    const { partner } = await household(app);
    await app.services.members.delete(partner.id);
    expect(await app.services.members.list()).toHaveLength(1);
  });
});

describe('categories', () => {
  it('lists seeded categories sorted by name', async () => {
    const app = newApp();
    const names = (await app.services.categories.list()).map((c) => c.name);
    expect(names).toHaveLength(14);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('creates, renames and rejects duplicate names (case/accent insensitive)', async () => {
    const app = newApp();
    const pets = await app.services.categories.create({ name: 'Mascotas' });
    await expectAppError(app.services.categories.create({ name: 'mascotas' }), 'CONFLICT');
    await expectAppError(app.services.categories.rename({ id: pets.id, name: 'educacion' }), 'CONFLICT');
    expect((await app.services.categories.rename({ id: pets.id, name: 'Perro' })).name).toBe('Perro');
  });

  it('archives instead of deleting used categories', async () => {
    const app = newApp();
    const { ana } = await household(app);
    await app.services.expenses.create({
      amount: eur(4235),
      merchant: 'Mercadona',
      date: '2026-10-02',
      categoryId: 'cat-food',
      expenseType: 'VARIABLE',
      scope: { type: 'SHARED' },
      paidBy: ana.id,
    });
    await expectAppError(app.services.categories.delete('cat-food'), 'REFERENCE_IN_USE');
    await app.services.categories.setArchived({ id: 'cat-food', archived: true });
    expect((await app.services.categories.list()).map((c) => c.id)).not.toContain('cat-food');
    expect((await app.services.categories.list({ includeArchived: true })).map((c) => c.id)).toContain('cat-food');
    const unused = await app.services.categories.create({ name: 'Temporal' });
    await app.services.categories.delete(unused.id);
    expect(await app.services.categories.list({ includeArchived: true })).toHaveLength(14);
    expect((await app.services.categories.list()).map((c) => c.id)).toContain('cat-other');
  });

  it('keeps the fallback category active, protected from deletion and renameable', async () => {
    const app = newApp();
    const fallback = (await app.services.categories.list()).find((category) => category.id === 'cat-other');
    expect(fallback).toBeDefined();
    expect(fallback?.name).toBe('Otros');
    expect(fallback?.archived).toBe(false);

    await expectAppError(app.services.categories.setArchived({ id: 'cat-other', archived: true }), 'CONFLICT');
    await expectAppError(app.services.categories.delete('cat-other'), 'CONFLICT');

    const renamed = await app.services.categories.rename({ id: 'cat-other', name: 'Varios' });
    expect(renamed.name).toBe('Varios');
    expect(renamed.archived).toBe(false);
    expect((await app.services.categories.list()).map((category) => category.id)).toContain('cat-other');
  });
});

describe('expenses', () => {
  it('creates a quick-entry expense, deriving the description from the merchant', async () => {
    const app = newApp();
    const { ana } = await household(app);
    const e = await app.services.expenses.create({
      amount: eur(4235),
      merchant: 'Mercadona',
      date: '2026-10-02',
      categoryId: 'cat-food',
      expenseType: 'VARIABLE',
      scope: { type: 'SHARED' },
      paidBy: ana.id,
    });
    expect(e.description).toBe('Mercadona');
    expect(await app.services.expenses.getById(e.id)).toEqual(e);
  });

  it('falls back to the category name when there is no merchant', async () => {
    const app = newApp();
    const { ana } = await household(app);
    const e = await app.services.expenses.create({
      amount: eur(89000),
      date: '2026-10-01',
      categoryId: 'cat-housing',
      expenseType: 'FIXED',
      scope: { type: 'SHARED' },
      paidBy: ana.id,
      recurrence: { frequency: 'MONTHLY', dayOfMonth: 1 },
    });
    expect(e.description).toBe('Vivienda');
    expect(e.recurrence).toEqual({ frequency: 'MONTHLY', dayOfMonth: 1 });
  });

  it('stores individual expenses paid by someone else', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    const e = await app.services.expenses.create({
      description: 'Gafas',
      amount: eur(12999),
      date: '2026-10-02',
      categoryId: 'cat-health',
      expenseType: 'VARIABLE',
      scope: { type: 'INDIVIDUAL', ownerId: partner.id },
      paidBy: ana.id,
    });
    expect(e.scope).toEqual({ type: 'INDIVIDUAL', ownerId: partner.id });
    expect(e.paidBy).toBe(ana.id);
  });

  it('rejects unknown members and categories, archived categories and inactive payers', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    const base = {
      amount: eur(1000),
      date: '2026-10-02',
      categoryId: 'cat-food',
      expenseType: 'VARIABLE' as const,
      scope: { type: 'SHARED' as const },
      paidBy: ana.id,
    };
    await expectAppError(app.services.expenses.create({ ...base, paidBy: 'ghost' }), 'VALIDATION');
    await expectAppError(app.services.expenses.create({ ...base, categoryId: 'nope' }), 'VALIDATION');
    await expectAppError(
      app.services.expenses.create({ ...base, scope: { type: 'INDIVIDUAL', ownerId: 'ghost' } }),
      'VALIDATION',
    );
    await app.services.members.setActive({ id: partner.id, active: false });
    await expectAppError(app.services.expenses.create({ ...base, paidBy: partner.id }), 'VALIDATION');
    await app.services.categories.setArchived({ id: 'cat-food', archived: true });
    await expectAppError(app.services.expenses.create(base), 'VALIDATION');
  });

  it('rejects malformed input with field-level issues', async () => {
    const app = newApp();
    const err = await expectAppError(
      app.services.expenses.create({
        amount: { amountMinor: 42.35, currency: 'EUR' },
        date: '2026-02-30',
        categoryId: 'cat-food',
        expenseType: 'VARIABLE',
        scope: { type: 'SHARED' },
        paidBy: 'x',
      }),
      'VALIDATION',
    );
    expect(err.issues.map((i) => i.path).sort()).toEqual(['amount.amountMinor', 'date']);
  });

  it('updates, deletes and restores (undo) without losing data', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    const created = await app.services.expenses.create({
      amount: eur(4235),
      merchant: 'Mercadona',
      date: '2026-10-02',
      categoryId: 'cat-food',
      expenseType: 'VARIABLE',
      scope: { type: 'SHARED' },
      paidBy: ana.id,
    });

    const { previous, current } = await app.services.expenses.update({
      id: created.id,
      changes: { amount: eur(4500), paidBy: partner.id },
    });
    expect(previous).toEqual(created);
    expect(current.amount.amountMinor).toBe(4500);
    expect(current.paidBy).toBe(partner.id);

    // Undo update
    await app.services.expenses.restore(previous);
    expect(await app.services.expenses.getById(created.id)).toEqual(created);

    // Delete + undo delete
    const deleted = await app.services.expenses.delete(created.id);
    expect(await app.services.expenses.getById(created.id)).toBeUndefined();
    await app.services.expenses.restore(deleted);
    expect(await app.services.expenses.getById(created.id)).toEqual(created);

    await expectAppError(app.services.expenses.delete('missing'), 'NOT_FOUND');
  });

  it('deletes an expense only while its expected business snapshot still matches', async () => {
    const app = newApp();
    const { ana } = await household(app);
    const input = {
      amount: eur(4235),
      merchant: 'Mercadona',
      date: '2026-10-02',
      categoryId: 'cat-food',
      expenseType: 'VARIABLE',
      scope: { type: 'INDIVIDUAL', ownerId: ana.id },
      paidBy: ana.id,
    } as const;
    const created = await app.services.expenses.create(input);

    const deleted = await app.services.expenses.delete(created.id, created);
    expect(deleted).toEqual(created);
    expect(await app.services.expenses.getById(created.id)).toBeUndefined();
    await app.services.expenses.restore(deleted);

    const { current: edited } = await app.services.expenses.update({
      id: created.id,
      changes: { notes: 'Editado después de la captura', scope: { type: 'SHARED' } },
    });
    expect(edited.updatedAt).toBe(created.updatedAt);
    await expectAppError(app.services.expenses.delete(created.id, created), 'CONFLICT');
    expect(await app.services.expenses.getById(created.id)).toEqual(edited);

    const other = await app.services.expenses.create({ ...input, amount: eur(5000) });
    await expectAppError(app.services.expenses.delete(created.id, other), 'CONFLICT');
    expect(await app.services.expenses.getById(created.id)).toEqual(edited);
    await expectAppError(app.services.expenses.delete('missing', created), 'NOT_FOUND');
  });

  it('derives a blank description again on update, from the new merchant or category', async () => {
    const app = newApp();
    const { ana } = await household(app);
    const e = await app.services.expenses.create({
      amount: eur(4235),
      merchant: 'Mercadona',
      date: '2026-10-02',
      categoryId: 'cat-food',
      expenseType: 'VARIABLE',
      scope: { type: 'SHARED' },
      paidBy: ana.id,
    });
    const lidl = await app.services.expenses.update({ id: e.id, changes: { merchant: 'Lidl', description: '' } });
    expect(lidl.current.description).toBe('Lidl');
    const leisure = await app.services.expenses.update({
      id: e.id,
      changes: { merchant: null, categoryId: 'cat-leisure', description: '  ' },
    });
    expect(leisure.current.description).toBe('Ocio');
    // Omitted description keeps the current one.
    const kept = await app.services.expenses.update({ id: e.id, changes: { amount: eur(5000) } });
    expect(kept.current.description).toBe('Ocio');
  });

  it('lists a month newest first and the most recent expenses', async () => {
    const app = newApp();
    const { ana } = await household(app);
    const add = (date: string, amountMinor: number) =>
      app.services.expenses.create({
        amount: eur(amountMinor),
        date,
        categoryId: 'cat-food',
        expenseType: 'VARIABLE',
        scope: { type: 'SHARED' },
        paidBy: ana.id,
      });
    await add('2026-09-30', 1);
    await add('2026-10-01', 2);
    await add('2026-10-31', 3);
    await add('2026-11-01', 4);

    const october = await app.services.expenses.listMonth(asYearMonth('2026-10'));
    expect(october.map((e) => e.amount.amountMinor)).toEqual([3, 2]);
    expect((await app.services.expenses.recent(2)).map((e) => e.amount.amountMinor)).toEqual([4, 3]);
  });
});

describe('income', () => {
  it('summarises monthly and annual income per member', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    const salary = { schedule: { kind: 'MONTHLY', variability: 'FIXED' }, source: 'SALARY' } as const;
    await app.services.incomes.create({ memberId: ana.id, amount: eur(400000), date: '2026-10-01', ...salary });
    await app.services.incomes.create({ memberId: partner.id, amount: eur(150000), date: '2026-10-05', ...salary });
    await app.services.incomes.create({ memberId: ana.id, amount: eur(400000), date: '2026-09-01', ...salary });

    const october = await app.services.incomes.monthSummary(asYearMonth('2026-10'));
    expect(october.total.amountMinor).toBe(550000);
    expect(october.byMember.map((b) => [b.memberId, b.amount.amountMinor, b.shareBasisPoints])).toEqual([
      [ana.id, 400000, 7273],
      [partner.id, 150000, 2727],
    ]);

    expect((await app.services.incomes.yearSummary(2026)).total.amountMinor).toBe(950000);
  });

  it('updates and deletes income', async () => {
    const app = newApp();
    const { ana } = await household(app);
    const income = await app.services.incomes.create({
      memberId: ana.id,
      amount: eur(50000),
      date: '2026-10-15',
      schedule: { kind: 'ONE_OFF' },
      source: 'BONUS',
    });
    const { current } = await app.services.incomes.update({ id: income.id, changes: { amount: eur(60000) } });
    expect(current.amount.amountMinor).toBe(60000);
    const deleted = await app.services.incomes.delete(income.id);
    expect(await app.services.incomes.listMonth(asYearMonth('2026-10'))).toEqual([]);

    // I3: undo restores the exact snapshot, even if the member was deactivated meanwhile
    await app.services.members.setActive({ id: ana.id, active: false });
    await app.services.incomes.restore(deleted);
    expect(await app.services.incomes.getById(income.id)).toEqual(current);
  });

  it('deletes income only while its expected business snapshot still matches', async () => {
    const app = newApp();
    const { ana } = await household(app);
    const income = await app.services.incomes.create({
      memberId: ana.id,
      amount: eur(50000),
      date: '2026-10-15',
      schedule: { kind: 'ONE_OFF' },
      source: 'BONUS',
      description: 'Bonus',
    });

    const deleted = await app.services.incomes.delete(income.id, income);
    expect(deleted).toEqual(income);
    expect(await app.services.incomes.getById(income.id)).toBeUndefined();
    await app.services.incomes.restore(deleted);

    const { current: edited } = await app.services.incomes.update({
      id: income.id,
      changes: { description: 'Bonus editado', schedule: { kind: 'MONTHLY', variability: 'FIXED' } },
    });
    expect(edited.updatedAt).toBe(income.updatedAt);
    await expectAppError(app.services.incomes.delete(income.id, income), 'CONFLICT');
    expect(await app.services.incomes.getById(income.id)).toEqual(edited);

    const other = await app.services.incomes.create({
      memberId: ana.id,
      amount: eur(25000),
      date: '2026-10-16',
      schedule: { kind: 'ONE_OFF' },
      source: 'OTHER',
    });
    await expectAppError(app.services.incomes.delete(income.id, other), 'CONFLICT');
    expect(await app.services.incomes.getById(income.id)).toEqual(edited);
    await expectAppError(app.services.incomes.delete('missing', income), 'NOT_FOUND');
  });
});

describe('dashboard', () => {
  it('D6: the month summary adds up exactly to the month lists', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    const base = { date: '2026-10-02', expenseType: 'VARIABLE', scope: { type: 'SHARED' }, paidBy: ana.id } as const;
    await app.services.expenses.create({ ...base, amount: eur(89000), categoryId: 'cat-housing', expenseType: 'FIXED' });
    await app.services.expenses.create({ ...base, amount: eur(4235), categoryId: 'cat-food', paidBy: partner.id });
    await app.services.expenses.create({ ...base, amount: eur(1999), categoryId: 'cat-food' });
    await app.services.expenses.create({
      ...base,
      amount: eur(12000),
      categoryId: 'cat-health',
      scope: { type: 'INDIVIDUAL', ownerId: partner.id },
    });
    await app.services.expenses.create({ ...base, date: '2026-09-30', amount: eur(5000), categoryId: 'cat-food' });

    const month = asYearMonth('2026-10');
    const s = await app.services.expenses.monthSummary(month);
    const listed = (await app.services.expenses.listMonth(month)).reduce((acc, e) => acc + e.amount.amountMinor, 0);

    expect(s.total.amountMinor).toBe(listed);
    expect(s.total.amountMinor).toBe(107234);
    expect(s.byCategory.map((c) => [c.categoryId, c.amount.amountMinor])).toEqual([
      ['cat-housing', 89000],
      ['cat-health', 12000],
      ['cat-food', 6234],
    ]);
    expect(s.byCategory.reduce((acc, c) => acc + c.amount.amountMinor, 0)).toBe(listed);
    expect([s.shared.amountMinor, s.individual.amountMinor]).toEqual([95234, 12000]);
    expect([s.fixed.amountMinor, s.variable.amountMinor]).toEqual([89000, 18234]);
    expect(s.sharedPaidBy.map((p) => [p.memberId, p.amount.amountMinor])).toEqual([
      [ana.id, 90999],
      [partner.id, 4235],
    ]);
  });

  it('summarises an empty month with zeroes for every member', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    const s = await app.services.expenses.monthSummary(asYearMonth('2026-10'));
    expect(s.total.amountMinor).toBe(0);
    expect(s.byCategory).toEqual([]);
    expect(s.sharedPaidBy.map((p) => [p.memberId, p.amount.amountMinor])).toEqual([
      [ana.id, 0],
      [partner.id, 0],
    ]);
  });
});

describe('durability', () => {
  it('data survives closing the app and opening it again', async () => {
    const dbName = `durable-${crypto.randomUUID()}`;
    const first = createApp({ dbName });
    const ana = await first.services.members.create({ name: 'Ana' });
    const e = await first.services.expenses.create({
      amount: eur(4235),
      merchant: 'Mercadona',
      date: '2026-10-02',
      categoryId: 'cat-food',
      expenseType: 'VARIABLE',
      scope: { type: 'SHARED' },
      paidBy: ana.id,
    });
    first.close();

    const second = newApp(dbName);
    expect(await second.services.expenses.getById(e.id)).toEqual(e);
    expect((await second.services.members.list()).map((m) => m.name)).toEqual(['Ana']);
  });
});

describe('members: reference income and color (A2, A6)', () => {
  it('A6: new members get distinct free colors', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    expect([ana.color, partner.color]).toEqual(['blue', 'indigo']);
    expect(ana.referenceIncome).toBeNull();
  });

  it('A6: picking a color an active member uses is a CONFLICT that names them', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    const error = await expectAppError(app.services.members.setColor({ id: partner.id, color: ana.color }), 'CONFLICT');
    expect(error.message).toBe('Ana ya usa ese color.');
    expect((await app.services.members.setColor({ id: partner.id, color: 'mint' })).color).toBe('mint');
    await expectAppError(app.services.members.setColor({ id: partner.id, color: 'green' }), 'VALIDATION');
  });

  it('A6: a deactivated member frees the color and gets a free one back if it was taken', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    await app.services.members.setActive({ id: ana.id, active: false });
    await app.services.members.setColor({ id: partner.id, color: 'blue' });
    expect((await app.services.members.setActive({ id: ana.id, active: true })).color).toBe('indigo');
  });

  it('A2: changing an income changes the contributions', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
    await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
    await app.services.plan.create({ name: 'Gastos comunes', kind: { type: 'FORMULA', amount: eur(210001) } });
    const before = await app.services.plan.contributions();
    await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(150000) });
    const after = await app.services.plan.contributions();
    expect(before.contributions.map((c) => c.total.amountMinor)).toEqual([165001, 45000]);
    expect(after.contributions.map((c) => c.total.amountMinor)).toEqual([160001, 50000]);
    await expectAppError(app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(1.5) }), 'VALIDATION');
  });

  it('Q6: cannot clear the income or deactivate someone with a non-zero assigned share', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
    await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
    const item = await app.services.plan.create({
      name: 'Portátil',
      kind: { type: 'ASSIGNED', shares: [{ memberId: ana.id, amount: eur(30000) }, { memberId: partner.id, amount: eur(5000) }] },
    });
    const error = await expectAppError(app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: null }), 'CONFLICT');
    expect(error.message).toContain('Portátil');
    await expectAppError(app.services.members.setActive({ id: partner.id, active: false }), 'CONFLICT');
    await expectAppError(app.services.members.delete(partner.id), 'REFERENCE_IN_USE');

    // Her share paid off: set it to 0 and the income can go.
    await app.services.plan.update({
      id: item.id,
      changes: { kind: { type: 'ASSIGNED', shares: [{ memberId: ana.id, amount: eur(30000) }, { memberId: partner.id, amount: eur(0) }] } },
    });
    await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: null });
    const split = await app.services.plan.contributions();
    expect(split.contributions.map((c) => c.memberId)).toEqual([ana.id]);
    expect(split.contributions[0]?.total.amountMinor).toBe(30000);
  });

  it('A2: saves several incomes atomically, so a refused one rolls back the rest', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    await app.services.members.setReferenceIncomes([
      { id: ana.id, referenceIncome: eur(260000) },
      { id: partner.id, referenceIncome: eur(140000) },
    ]);
    await app.services.plan.create({ name: 'Móvil', kind: { type: 'ASSIGNED', shares: [{ memberId: partner.id, amount: eur(2000) }] } });

    await expectAppError(
      app.services.members.setReferenceIncomes([
        { id: ana.id, referenceIncome: eur(310000) },
        { id: partner.id, referenceIncome: null },
      ]),
      'CONFLICT',
    );
    const incomes = (await app.services.members.list()).map((m) => m.referenceIncome?.amountMinor ?? null);
    expect(incomes).toEqual([260000, 140000]);
  });
});

describe('plan (F1–F5, A7)', () => {
  async function couple(app: App) {
    const { ana, partner } = await household(app);
    await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
    await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
    return { ana, partner };
  }

  it('F1: a new database has an empty plan, nobody to split between and the EQUAL_KEEP rule', async () => {
    const app = newApp();
    expect(await app.services.plan.list()).toEqual([]);
    expect(await app.services.plan.getSettings()).toEqual({ splitRule: 'EQUAL_KEEP' });
    const split = await app.services.plan.contributions();
    expect(split.contributions).toEqual([]);
    expect(split.planTotal.amountMinor).toBe(0);
  });

  it('F6: the stored plan reproduces the user example; switching to PROPORTIONAL changes it', async () => {
    const app = newApp();
    const { ana, partner } = await couple(app);
    await app.services.plan.create({ name: 'Gastos comunes', kind: { type: 'FORMULA', amount: eur(210001) } });
    await app.services.plan.create({
      name: 'Portátil',
      kind: { type: 'ASSIGNED', shares: [{ memberId: ana.id, amount: eur(30000) }, { memberId: partner.id, amount: eur(5000) }] },
    });
    const split = await app.services.plan.contributions();
    expect(split.contributions.map((c) => [c.memberId, c.total.amountMinor])).toEqual([
      [ana.id, 195001],
      [partner.id, 50000],
    ]);
    expect(split.planTotal.amountMinor).toBe(245001);

    await app.services.plan.setSplitRule({ splitRule: 'PROPORTIONAL' });
    const proportional = await app.services.plan.contributions();
    expect(proportional.contributions.map((c) => c.formula.amountMinor)).toEqual([136501, 73500]);
    await expectAppError(app.services.plan.setSplitRule({ splitRule: 'RANDOM' }), 'VALIDATION');
  });

  it('F3: creates, edits, deletes and restores lines, and the split follows', async () => {
    const app = newApp();
    await couple(app);
    const rent = await app.services.plan.create({ name: 'Alquiler', kind: { type: 'FORMULA', amount: eur(200000) } });
    const heating = await app.services.plan.create({ name: 'Calefacción', kind: { type: 'FORMULA', amount: eur(8000) } });
    expect((await app.services.plan.list()).map((i) => i.name)).toEqual(['Alquiler', 'Calefacción']);
    expect((await app.services.plan.contributions()).planTotal.amountMinor).toBe(208000);

    const { previous, current } = await app.services.plan.update({ id: rent.id, changes: { name: 'Alquiler piso' } });
    expect(previous.name).toBe('Alquiler');
    expect(current).toMatchObject({ name: 'Alquiler piso', kind: rent.kind });

    const deleted = await app.services.plan.delete(heating.id);
    expect((await app.services.plan.contributions()).planTotal.amountMinor).toBe(200000);
    await app.services.plan.restore(deleted);
    expect((await app.services.plan.list()).map((i) => i.name)).toEqual(['Alquiler piso', 'Calefacción']);
    await expectAppError(app.services.plan.delete(heating.id + 'x'), 'NOT_FOUND');
  });

  it('validates input with field errors', async () => {
    const app = newApp();
    const { ana } = await couple(app);
    const error = await expectAppError(app.services.plan.create({ name: 'x'.repeat(100), kind: { type: 'ASSIGNED', shares: [] } }), 'VALIDATION');
    expect(error.issues.map((i) => i.path)).toEqual(['name', 'kind.shares']);
    await expect(app.services.plan.create({ name: 'Cero', kind: { type: 'FORMULA', amount: eur(0) } })).rejects.toBeInstanceOf(DomainError);
    await expect(
      app.services.plan.create({ name: 'Doble', kind: { type: 'ASSIGNED', shares: [{ memberId: ana.id, amount: eur(1) }, { memberId: ana.id, amount: eur(2) }] } }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('an assigned line needs existing members, and non-zero shares only for participants', async () => {
    const app = newApp();
    const { ana } = await couple(app);
    const guest = await app.services.members.create({ name: 'Invitado' });
    const unknown = await expectAppError(
      app.services.plan.create({ name: 'X', kind: { type: 'ASSIGNED', shares: [{ memberId: 'nobody', amount: eur(100) }] } }),
      'VALIDATION',
    );
    expect(unknown.issues).toEqual([{ path: 'kind.shares.0.memberId', message: 'Miembro desconocido' }]);
    const outside = await expectAppError(
      app.services.plan.create({
        name: 'X',
        kind: { type: 'ASSIGNED', shares: [{ memberId: ana.id, amount: eur(100) }, { memberId: guest.id, amount: eur(100) }] },
      }),
      'VALIDATION',
    );
    expect(outside.issues.map((i) => i.path)).toEqual(['kind.shares.1.amount']);
    // A zero share for a non-participant is harmless.
    await app.services.plan.create({
      name: 'X',
      kind: { type: 'ASSIGNED', shares: [{ memberId: ana.id, amount: eur(100) }, { memberId: guest.id, amount: eur(0) }] },
    });
  });
});

describe('personal (P1–P4)', () => {
  it('summarises the month for «yo» from incomes, the household split and personal expenses', async () => {
    const app = newApp();
    const { ana, partner } = await household(app);
    await app.services.members.setReferenceIncomes([
      { id: ana.id, referenceIncome: eur(260000) },
      { id: partner.id, referenceIncome: eur(140000) },
    ]);
    await app.services.plan.create({ name: 'Gastos comunes', kind: { type: 'FORMULA', amount: eur(210001) } });
    await app.services.expenses.create({
      amount: eur(10000),
      date: '2026-10-02',
      categoryId: 'cat-food',
      expenseType: 'VARIABLE',
      scope: { type: 'INDIVIDUAL', ownerId: ana.id },
      paidBy: ana.id,
      description: 'Cena',
    });

    const summary = await app.services.personal.monthSummary(ana.id, asYearMonth('2026-10'));
    expect(summary.household.amountMinor).toBe(165001);
    expect(summary.spent.amountMinor).toBe(10000);
    expect(summary.savings?.amountMinor).toBe(260000 - 165001 - 10000);
    expect(summary.history).toHaveLength(6);
  });

  it('fails loudly for an unknown member', async () => {
    const app = newApp();
    await expectAppError(app.services.personal.monthSummary(asMemberId('m-ghost'), asYearMonth('2026-10')), 'NOT_FOUND');
  });
});
