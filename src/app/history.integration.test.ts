import { afterEach, describe, expect, it } from 'vitest';
import { asYearMonth } from '../domain/shared/dates.ts';
import { makeTestApp } from '../test/test-app.ts';
import type { App } from './container.ts';

const apps: App[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) {
    app.close();
    await app.db.delete();
  }
});

const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });
const SEP = asYearMonth('2026-09');
const OCT = asYearMonth('2026-10'); // the fixed clock's month

/** Ana 3.000 and Pareja 1.200 sharing a 1.000 line; one income in August so September is a finished month with history. */
async function setup() {
  const app = makeTestApp();
  apps.push(app);
  const { members, plan, incomes } = app.services;
  const ana = await members.create({ name: 'Ana' });
  const pareja = await members.create({ name: 'Pareja' });
  await members.setReferenceIncome({ id: ana.id, referenceIncome: eur(300000) });
  await members.setReferenceIncome({ id: pareja.id, referenceIncome: eur(120000) });
  const line = await plan.create({ name: 'Alquiler', kind: { type: 'FORMULA', amount: eur(100000) } });
  await incomes.create({ memberId: ana.id, amount: eur(1000), date: '2026-08-15', source: 'OTHER', schedule: { kind: 'ONE_OFF' }, description: 'Extra' });
  return { app, ana, pareja, line };
}

const totalsOf = async (app: App, month = SEP) => (await app.services.plan.monthView(month)).split.contributions.map((c) => c.total.amountMinor);

describe('month snapshots (E1-1)', () => {
  it('a plan change does not alter finished months, but the current one', async () => {
    const { app, line } = await setup();
    const before = await totalsOf(app);
    await app.services.plan.update({ id: line.id, changes: { kind: { type: 'FORMULA', amount: eur(200000) } } });
    expect(await totalsOf(app)).toEqual(before);
    expect(await totalsOf(app, OCT)).not.toEqual(before);
  });

  it('a reference income change keeps the past income, in Familiar and in Personal', async () => {
    const { app, ana } = await setup();
    const before = await app.services.personal.monthSummary(ana.id, SEP);
    await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(500000) });
    const after = await app.services.personal.monthSummary(ana.id, SEP);
    expect(after.referenceIncome?.amountMinor).toBe(300000);
    expect(after.savings).toEqual(before.savings);
    expect((await app.services.personal.monthSummary(ana.id, OCT)).referenceIncome?.amountMinor).toBe(500000);
  });

  it('changing the split rule or deactivating a member leaves finished months alone', async () => {
    const { app, pareja, line } = await setup();
    const before = await totalsOf(app);
    await app.services.plan.setSplitRule({ splitRule: 'PROPORTIONAL' });
    expect(await totalsOf(app)).toEqual(before);
    await app.services.plan.delete(line.id);
    await app.services.members.setActive({ id: pareja.id, active: false });
    expect(await totalsOf(app)).toEqual(before);
    expect((await app.services.plan.monthView(SEP)).items.map((i) => i.item.name)).toEqual(['Alquiler']);
  });

  it('a member created later does not appear in finished months', async () => {
    const { app } = await setup();
    const nueva = await app.services.members.create({ name: 'Nueva' });
    await app.services.members.setReferenceIncome({ id: nueva.id, referenceIncome: eur(100000) });
    expect((await app.services.plan.monthView(SEP)).split.contributions).toHaveLength(2);
    expect((await app.services.plan.monthView(OCT)).split.contributions).toHaveLength(3);
  });

  it('a member deleted later is still in the finished months', async () => {
    const { app } = await setup();
    const nueva = await app.services.members.create({ name: 'Nueva' });
    await app.services.members.setReferenceIncome({ id: nueva.id, referenceIncome: eur(100000) });
    await app.services.members.delete(nueva.id);
    // The snapshot from the earlier change still lists her; the live month no longer does.
    expect((await app.services.plan.monthView(SEP)).split.contributions).toHaveLength(2);
    expect((await app.services.plan.monthView(OCT)).split.contributions).toHaveLength(2);
  });

  it('is idempotent and survives undo', async () => {
    const { app, line } = await setup();
    const before = await totalsOf(app);
    const { previous } = await app.services.plan.update({ id: line.id, changes: { name: 'Renta' } });
    await app.services.plan.update({ id: line.id, changes: { name: 'Renta 2' } });
    await app.services.plan.restore(previous);
    expect(await app.db.monthSnapshots.count()).toBe(2); // August and September, once each
    expect(await totalsOf(app)).toEqual(before);
  });

  it('freezes nothing without movements, and never the current month', async () => {
    const app = makeTestApp();
    apps.push(app);
    const ana = await app.services.members.create({ name: 'Ana' });
    await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(300000) });
    expect(await app.db.monthSnapshots.count()).toBe(0);
    await app.services.incomes.create({ memberId: ana.id, amount: eur(1000), date: '2026-10-01', source: 'OTHER', schedule: { kind: 'ONE_OFF' }, description: 'Extra' });
    await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(400000) });
    expect(await app.db.monthSnapshots.count()).toBe(0);
  });

  it('a refused change saves no snapshot', async () => {
    const { app, pareja } = await setup();
    await app.services.plan.create({ name: 'Portátil', kind: { type: 'ASSIGNED', shares: [{ memberId: pareja.id, amount: eur(5000) }] } });
    const count = await app.db.monthSnapshots.count();
    await expect(app.services.members.setActive({ id: pareja.id, active: false })).rejects.toThrow();
    expect(await app.db.monthSnapshots.count()).toBe(count);
  });
});
