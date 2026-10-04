// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { asYearMonth, toLocalIsoDate, yearMonthOf } from '../domain/shared/dates.ts';
import { format, money } from '../domain/money/money.ts';
import { cleanupApps, household, renderApp } from '../test/render-app.tsx';
import { t } from './i18n/index.ts';

afterEach(cleanupApps);

const captureForm = async () => screen.findByRole('region', { name: 'Barra de captura' });
const findNotice = async (form: HTMLElement) => within(form).findByRole('status');

async function submitCapture(phrase: string) {
  const user = userEvent.setup();
  const form = await captureForm();
  const input = within(form).getByRole('textbox', { name: 'Escribe un movimiento' });
  await user.clear(input);
  await user.type(input, phrase);
  await user.click(within(form).getByRole('button', { name: 'Registrar' }));
  return { user, form, input };
}

describe('assistant capture bar shell', () => {
  it.each(['personal', 'familiar', 'ajustes'])('G5: is present on route %s', async (route) => {
    await renderApp({
      route,
      seed: async (app) => app.services.members.create({ name: 'Ana' }),
    });

    expect(await captureForm()).toBeTruthy();
  });

  it('G1: does not write when there are no active members and the saved me is inactive', async () => {
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => {
        const member = await app.services.members.create({ name: 'Ana' });
        await app.services.members.setActive({ id: member.id, active: false });
        localStorage.setItem('family-finance.me', member.id);
      },
    });

    const { form } = await submitCapture('gasto 126 comida');

    expect((await findNotice(form)).textContent).toContain('Activa o añade un miembro para registrar.');
    expect(await app.services.expenses.listMonth(asYearMonth('2026-10'))).toHaveLength(0);
    expect(await app.services.incomes.listMonth(asYearMonth('2026-10'))).toHaveLength(0);
  });

  it('G1: does not write when several active members have no selected me', async () => {
    const { app } = await renderApp({ route: 'personal', seed: household });

    const { form } = await submitCapture('ingreso 1200 bonus');

    expect((await findNotice(form)).textContent).toContain('Elige quién eres en Ajustes para registrar.');
    expect(await app.services.expenses.listMonth(asYearMonth('2026-10'))).toHaveLength(0);
    expect(await app.services.incomes.listMonth(asYearMonth('2026-10'))).toHaveLength(0);
  });

  it('G1: reflects a me selection made in Settings without reloading', async () => {
    const user = userEvent.setup();
    const { partner } = await householdFromRender();
    const selector = await screen.findByLabelText('¿Quién eres en este dispositivo?');

    await user.selectOptions(selector, partner.id);

    const captureBar = await screen.findByRole('region', { name: 'Barra de captura' });
    expect(await within(captureBar).findByText('Registrando como Pareja')).toBeTruthy();
  });

  it('G1: picks up a member added in Miembros without reloading', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'ajustes',
      seed: async (app) => {
        const old = await app.services.members.create({ name: 'Antiguo' });
        await app.services.members.setActive({ id: old.id, active: false });
      },
    });
    await user.type(await screen.findByLabelText('Nuevo miembro'), 'Ana');
    await user.click(within(screen.getByRole('region', { name: 'Miembros' })).getByRole('button', { name: 'Añadir' }));
    const form = await captureForm();
    expect(await within(form).findByText('Registrando como Ana')).toBeTruthy();

    await submitCapture('gasto 126 comida');

    await waitFor(async () => expect(await app.services.expenses.listMonth(asYearMonth('2026-10'))).toHaveLength(1));
  });

  it('G1: recognizes a category created in Categorías without reloading', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'ajustes',
      seed: async (app) => app.services.members.create({ name: 'Ana' }),
    });
    await user.type(await screen.findByLabelText('Nueva categoría'), 'Mascotas');
    await user.click(within(screen.getByRole('region', { name: 'Categorías' })).getByRole('button', { name: 'Añadir' }));
    await screen.findByText('Mascotas');

    await submitCapture('gasto 20 mascotas');

    await waitFor(async () => {
      const [expense] = await app.services.expenses.listMonth(asYearMonth('2026-10'));
      expect(expense?.amount).toEqual(money(2000, 'EUR'));
    });
  });

  it('G3: refreshes the current view without discarding an open form', async () => {
    const user = userEvent.setup();
    await renderApp({
      route: 'personal',
      seed: async (app) => app.services.members.create({ name: 'Ana' }),
    });
    await user.click(await screen.findByRole('button', { name: 'Añadir gasto personal' }));
    const expenseForm = screen.getByRole('form', { name: 'Añadir gasto personal' });
    await user.type(within(expenseForm).getByLabelText('Importe'), '42');

    await submitCapture('gasto 126 comida');

    const list = screen.getByRole('region', { name: 'Gastos personales' });
    await waitFor(() => expect(list.textContent).toContain(format(money(12600, 'EUR'))));
    expect((within(screen.getByRole('form', { name: 'Añadir gasto personal' })).getByLabelText('Importe') as HTMLInputElement).value).toBe('42');
  });

  it('G1: saves a personal expense with the exact household context values', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => app.services.members.create({ name: 'Ana' }),
    });
    const member = (await app.services.members.listActive())[0];
    if (!member) throw new Error('Active member fixture missing');
    const today = toLocalIsoDate(app.services.clock.now());
    const form = await captureForm();

    await user.type(within(form).getByRole('textbox', { name: 'Escribe un movimiento' }), 'gasto 126 comida');
    await user.click(within(form).getByRole('button', { name: 'Registrar' }));

    const expenses = await app.services.expenses.listMonth(yearMonthOf(today));
    expect(expenses).toHaveLength(1);
    const expense = expenses[0];
    if (!expense) throw new Error('Captured expense missing');
    expect(expense).toMatchObject({
      amount: money(12600, 'EUR'),
      date: today,
      categoryId: 'cat-food',
      expenseType: 'VARIABLE',
      scope: { type: 'INDIVIDUAL', ownerId: member.id },
      paidBy: member.id,
      recurrence: null,
    });
    expect((await findNotice(form)).textContent).toContain(
      t('assistant.expenseSaved', { amount: format(expense.amount), category: 'Comida' }),
    );
  });

  it('G1: saves a one-off income with its description and actual confirmation', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => app.services.members.create({ name: 'Ana' }),
    });
    const member = (await app.services.members.listActive())[0];
    if (!member) throw new Error('Active member fixture missing');
    const today = toLocalIsoDate(app.services.clock.now());
    const form = await captureForm();

    await user.type(within(form).getByRole('textbox', { name: 'Escribe un movimiento' }), 'ingreso 1200 bonus');
    await user.click(within(form).getByRole('button', { name: 'Registrar' }));

    const incomes = await app.services.incomes.listMonth(yearMonthOf(today));
    expect(incomes).toHaveLength(1);
    const income = incomes[0];
    if (!income) throw new Error('Captured income missing');
    expect(income).toMatchObject({
      memberId: member.id,
      amount: money(120000, 'EUR'),
      date: today,
      schedule: { kind: 'ONE_OFF' },
      source: 'OTHER',
      description: 'bonus',
    });
    expect((await findNotice(form)).textContent).toContain(
      t('assistant.incomeSaved', {
        amount: format(income.amount),
        description: t('assistant.incomeDescription', { description: 'bonus' }),
      }),
    );
  });

  it('G2: shows and preserves the full merchant remainder for an unknown category', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => app.services.members.create({ name: 'Ana' }),
    });
    const form = await captureForm();

    await user.type(within(form).getByRole('textbox', { name: 'Escribe un movimiento' }), 'gasto 10 electricidad mercadona');
    await user.click(within(form).getByRole('button', { name: 'Registrar' }));

    expect(await within(form).findByText('Comercio o descripción: electricidad mercadona')).toBeTruthy();
    await user.click(within(form).getByRole('button', { name: 'Usar Comida' }));

    const expenses = await app.services.expenses.listMonth(asYearMonth('2026-10'));
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ merchant: 'electricidad mercadona', categoryId: 'cat-food' });
  });

  it('G3: undoes an unchanged expense exactly once', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => app.services.members.create({ name: 'Ana' }),
    });
    const form = await captureForm();
    await user.type(within(form).getByRole('textbox', { name: 'Escribe un movimiento' }), 'gasto 126 comida');
    await user.click(within(form).getByRole('button', { name: 'Registrar' }));
    const notice = await findNotice(form);

    const undo = within(notice).getByRole('button', { name: 'Deshacer' });
    await user.click(undo);
    expect(await app.services.expenses.listMonth(asYearMonth('2026-10'))).toHaveLength(0);
    await waitFor(() => expect(within(notice).queryByRole('button', { name: 'Deshacer' })).toBeNull());
  });

  it('G3: undoes an unchanged income', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => app.services.members.create({ name: 'Ana' }),
    });
    const { form } = await submitCapture('ingreso 1200 bonus');
    await user.click(within(await findNotice(form)).getByRole('button', { name: 'Deshacer' }));

    await waitFor(async () => expect(await app.services.incomes.listMonth(asYearMonth('2026-10'))).toHaveLength(0));
    expect((await findNotice(form)).textContent).toContain('Se deshizo el último registro.');
  });

  it('G2: keeps a creation failure visible and stops offering a category archived meanwhile', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => app.services.members.create({ name: 'Ana' }),
    });
    const { form } = await submitCapture('gasto 10 electricidad');
    const useFood = await within(form).findByRole('button', { name: 'Usar Comida' });
    await app.services.categories.setArchived({ id: 'cat-food', archived: true });

    await user.click(useFood);

    expect((await findNotice(form)).textContent).toContain('La categoría "Comida" está archivada.');
    await waitFor(() => expect(within(form).queryByRole('button', { name: 'Usar Comida' })).toBeNull());
    expect(within(form).getByRole('button', { name: 'Usar Otros' })).toBeTruthy();
    expect(await app.services.expenses.listMonth(asYearMonth('2026-10'))).toHaveLength(0);
  });

  it('G3: refuses to undo an expense edited after creation', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => app.services.members.create({ name: 'Ana' }),
    });
    const form = await captureForm();
    await user.type(within(form).getByRole('textbox', { name: 'Escribe un movimiento' }), 'gasto 126 comida');
    await user.click(within(form).getByRole('button', { name: 'Registrar' }));
    const [created] = await app.services.expenses.listMonth(asYearMonth('2026-10'));
    if (!created) throw new Error('Captured expense missing');
    await app.services.expenses.update({ id: created.id, changes: { notes: 'Ya lo revisé' } });

    await user.click(within(form).getByRole('button', { name: 'Deshacer' }));

    expect(await app.services.expenses.getById(created.id)).toMatchObject({ notes: 'Ya lo revisé' });
    expect((await findNotice(form)).textContent).toContain('Ya no se puede deshacer: el registro cambió.');
  });

  it('G4: shows localized help for an unrecognized phrase', async () => {
    await renderApp({ route: 'personal', seed: async (app) => {
      const member = await app.services.members.create({ name: 'Ana' });
      localStorage.setItem('family-finance.me', member.id);
    } });

    const { form } = await submitCapture('hola, qué tal');

    expect((await findNotice(form)).textContent).toContain('Prueba con «gasto 126 comida» o «ingreso 1200 bonus».');
  });

  it('G5: keeps session history across routes but not after reload or in persistent storage', async () => {
    const { app, reload } = await renderApp({
      route: 'personal',
      seed: async (app) => {
        const member = await app.services.members.create({ name: 'Ana' });
        localStorage.setItem('family-finance.me', member.id);
      },
    });
    const user = userEvent.setup();

    const { form } = await submitCapture('hola');
    await user.click(within(form).getByText('Historial'));
    await user.click(screen.getByRole('link', { name: 'Familiar' }));
    expect(await within(await captureForm()).findByText('hola')).toBeTruthy();
    expect(localStorage.getItem('family-finance.assistant-history')).toBeNull();
    expect(app.db.tables.map((table) => table.name)).not.toContain('assistantHistory');

    reload();
    expect(await captureForm()).toBeTruthy();
    expect(screen.queryByText('hola')).toBeNull();
  });
});

async function householdFromRender() {
  let members: Awaited<ReturnType<typeof household>> | undefined;
  await renderApp({
    route: 'ajustes',
    seed: async (app) => {
      members = await household(app);
    },
  });
  if (!members) throw new Error('Household fixture missing');
  return members;
}
