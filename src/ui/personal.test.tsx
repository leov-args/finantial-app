// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { format, money } from '../domain/money/money.ts';
import { asYearMonth } from '../domain/shared/dates.ts';
import { cleanupApps, eur, household, renderApp } from '../test/render-app.tsx';
import { percent } from './common.tsx';

afterEach(cleanupApps);

const euros = (amountMinor: number) => format(money(amountMinor, 'EUR'));

describe('personal', () => {
  it('P1: calculates this month’s savings from reference income, extra income, household contribution and spending', async () => {
    await renderApp({
      route: 'personal',
      seed: async (app) => {
        const { ana, partner } = await household(app);
        localStorage.setItem('family-finance.me', ana.id);
        await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
        await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
        await app.services.plan.create({ name: 'Gastos comunes', kind: { type: 'FORMULA', amount: eur(50000) } });
        await app.services.incomes.create({
          memberId: ana.id,
          amount: eur(20000),
          date: '2026-10-02',
          schedule: { kind: 'ONE_OFF' },
          source: 'BONUS',
        });
        await app.services.incomes.create({
          memberId: ana.id,
          amount: eur(5000),
          date: '2026-10-01',
          schedule: { kind: 'MONTHLY', variability: 'FIXED' },
          source: 'SALARY',
        });
        await app.services.expenses.create({
          amount: eur(10000),
          date: '2026-10-02',
          categoryId: 'cat-food',
          expenseType: 'VARIABLE',
          scope: { type: 'INDIVIDUAL', ownerId: ana.id },
          paidBy: ana.id,
          description: 'Comida',
        });
      },
    });

    const savingsRegion = await screen.findByRole('region', { name: 'Este mes vas a ahorrar' });
    expect(savingsRegion.querySelector('.personal-savings__value')?.textContent).toBe(euros(225000));
    expect([...savingsRegion.querySelectorAll('rect')].reduce((total, bar) => total + Number(bar.getAttribute('width')), 0)).toBe(10000);

    const accounts = within(screen.getByRole('region', { name: 'Las cuentas del mes' }));
    expect(accounts.getByText('Ingreso de referencia').nextElementSibling?.textContent).toBe(euros(260000));
    expect(accounts.getByText('Ingresos extra').nextElementSibling?.textContent).toBe(euros(25000));
    expect(accounts.getByText('Aporte al hogar').nextElementSibling?.textContent).toBe(`−\u00a0${euros(50000)}`);
    expect(accounts.getByText('Gastado hasta hoy').nextElementSibling?.textContent).toBe(`−\u00a0${euros(10000)}`);
  });

  it('P2: lists only individual expenses owned by «yo» for the selected month', async () => {
    await renderApp({
      route: 'personal',
      seed: async (app) => {
        const { ana, partner } = await household(app);
        localStorage.setItem('family-finance.me', ana.id);
        const base = { amount: eur(1000), date: '2026-10-02', categoryId: 'cat-food', expenseType: 'VARIABLE' } as const;
        await app.services.expenses.create({
          ...base,
          scope: { type: 'INDIVIDUAL', ownerId: ana.id },
          paidBy: ana.id,
          description: 'Gasto de Ana',
        });
        await app.services.expenses.create({
          ...base,
          scope: { type: 'INDIVIDUAL', ownerId: partner.id },
          paidBy: partner.id,
          description: 'Gasto de Pareja',
        });
        await app.services.expenses.create({
          ...base,
          scope: { type: 'SHARED' },
          paidBy: ana.id,
          description: 'Gasto común',
        });
      },
    });

    expect(await screen.findByText('Gasto de Ana')).toBeTruthy();
    expect(screen.queryByText('Gasto de Pareja')).toBeNull();
    expect(screen.queryByText('Gasto común')).toBeNull();
  });

  it('P1: shows a signed negative saving with an explanatory message', async () => {
    await renderApp({
      route: 'personal',
      seed: async (app) => {
        const ana = await app.services.members.create({ name: 'Ana' });
        localStorage.setItem('family-finance.me', ana.id);
        await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(100000) });
        await app.services.expenses.create({
          amount: eur(150000),
          date: '2026-10-02',
          categoryId: 'cat-food',
          expenseType: 'VARIABLE',
          scope: { type: 'INDIVIDUAL', ownerId: ana.id },
          paidBy: ana.id,
          description: 'Compra grande',
        });
      },
    });

    const savings = await screen.findByRole('region', { name: 'Este mes vas a ahorrar' });
    expect(savings.querySelector('.personal-savings__value')?.textContent).toBe(euros(-50000));
    expect(within(savings).getByText(/ahorro previsto es negativo/i)).toBeTruthy();
  });

  it('P1: without a reference income it asks for one instead of showing a negative saving', async () => {
    await renderApp({
      route: 'personal',
      seed: async (app) => {
        const ana = await app.services.members.create({ name: 'Ana' });
        localStorage.setItem('family-finance.me', ana.id);
        await app.services.expenses.create({
          amount: eur(10000),
          date: '2026-10-02',
          categoryId: 'cat-food',
          expenseType: 'VARIABLE',
          scope: { type: 'INDIVIDUAL', ownerId: ana.id },
          paidBy: ana.id,
          description: 'Cena',
        });
      },
    });

    const savings = within(await screen.findByRole('region', { name: 'Este mes vas a ahorrar' }));
    expect(savings.getByText(/Añade tu ingreso de referencia/)).toBeTruthy();
    expect(savings.queryByText(/ahorro previsto es negativo/i)).toBeNull();
    expect(screen.getByRole('region', { name: 'Gastos personales' }).textContent).toContain('Cena');
  });

  it('P5: creates a personal expense quickly with its owner and payer fixed to «yo»', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => {
        const ana = await app.services.members.create({ name: 'Ana' });
        localStorage.setItem('family-finance.me', ana.id);
      },
    });
    const ana = (await app.services.members.list())[0];
    if (!ana) throw new Error('Member fixture missing');

    await user.click(await screen.findByRole('button', { name: 'Añadir gasto personal' }));
    const expenseForm = within(screen.getByRole('form', { name: 'Añadir gasto personal' }));
    expect(expenseForm.queryByLabelText('Pagado por')).toBeNull();
    expect(expenseForm.queryByLabelText('De quién es')).toBeNull();
    expect((expenseForm.getByLabelText('Fecha') as HTMLInputElement).value).toBe('2026-10-02');
    await user.type(expenseForm.getByLabelText('Importe'), '12,50');
    await user.selectOptions(expenseForm.getByLabelText('Categoría'), 'cat-food');
    await user.click(expenseForm.getByRole('button', { name: 'Guardar' }));

    const saved = await app.services.expenses.listMonth(asYearMonth('2026-10'));
    expect(saved).toHaveLength(1);
    expect(saved[0]?.scope).toEqual({ type: 'INDIVIDUAL', ownerId: ana.id });
    expect(saved[0]?.paidBy).toBe(ana.id);
    expect(saved[0]?.amount.amountMinor).toBe(1250);
  });

  it('P6: edits a personal expense and restores a deleted one with «Deshacer»', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => {
        const ana = await app.services.members.create({ name: 'Ana' });
        localStorage.setItem('family-finance.me', ana.id);
        await app.services.expenses.create({
          amount: eur(2500),
          date: '2026-10-02',
          categoryId: 'cat-food',
          expenseType: 'VARIABLE',
          scope: { type: 'INDIVIDUAL', ownerId: ana.id },
          paidBy: ana.id,
          description: 'Café',
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: /^Abrir gasto Café/ }));
    const expenseForm = within(screen.getByRole('form', { name: 'Editar gasto personal' }));
    await user.clear(expenseForm.getByLabelText('Importe'));
    await user.type(expenseForm.getByLabelText('Importe'), '30');
    await user.click(expenseForm.getByRole('button', { name: 'Guardar' }));
    expect((await app.services.expenses.listMonth(asYearMonth('2026-10')))[0]?.amount.amountMinor).toBe(3000);

    await user.click(await screen.findByRole('button', { name: /^Abrir gasto Café/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('Gasto «Café» eliminado.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByText('Café')).toBeTruthy();
    expect((await app.services.expenses.listMonth(asYearMonth('2026-10')))[0]?.amount.amountMinor).toBe(3000);
  });

  it('P6: reports a delete failure instead of silently losing the error', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => {
        const ana = await app.services.members.create({ name: 'Ana' });
        localStorage.setItem('family-finance.me', ana.id);
        await app.services.expenses.create({
          amount: eur(2500), date: '2026-10-02', categoryId: 'cat-food', expenseType: 'VARIABLE',
          scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id, description: 'Café',
        });
      },
    });
    await user.click(await screen.findByRole('button', { name: /^Abrir gasto Café/ }));
    const deleteButton = within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' });
    const expense = (await app.services.expenses.listMonth(asYearMonth('2026-10')))[0];
    if (!expense) throw new Error('Expense fixture missing');
    await app.services.expenses.delete(expense.id);

    await user.click(deleteButton);

    expect(await screen.findByText('Ya no existe: puede que se haya eliminado.')).toBeTruthy();
  });

  it('P6: reports a restore failure and keeps the undo notice available', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => {
        const ana = await app.services.members.create({ name: 'Ana' });
        localStorage.setItem('family-finance.me', ana.id);
        await app.services.expenses.create({
          amount: eur(2500), date: '2026-10-02', categoryId: 'cat-food', expenseType: 'VARIABLE',
          scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id, description: 'Café',
        });
      },
    });

    await user.click(await screen.findByRole('button', { name: /^Abrir gasto Café/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('Gasto «Café» eliminado.')).toBeTruthy();
    await app.services.categories.delete('cat-food');
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));

    expect(await screen.findByText('La categoría indicada no existe.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy();
  });

  it('A4: asks who I am on first use and lets me change it from Personal', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'personal', seed: household });
    const members = await app.services.members.list();
    const ana = members.find((member) => member.name === 'Ana');
    const partner = members.find((member) => member.name === 'Pareja');
    if (!ana || !partner) throw new Error('Household fixture missing');

    const who = await screen.findByRole('combobox', { name: '¿Quién eres en este dispositivo?' });
    await user.selectOptions(who, ana.id);
    expect(localStorage.getItem('family-finance.me')).toBe(ana.id);
    await user.selectOptions(await screen.findByRole('combobox', { name: '¿Quién eres en este dispositivo?' }), partner.id);
    expect(localStorage.getItem('family-finance.me')).toBe(partner.id);
    expect(screen.getByText('Pareja', { selector: 'p' })).toBeTruthy();
  });

  it('P2: hides the previous member’s summary immediately when «yo» changes', async () => {
    const { app } = await renderApp({
      route: 'personal',
      seed: async (app) => {
        const { ana, partner } = await household(app);
        localStorage.setItem('family-finance.me', ana.id);
        await app.services.members.setReferenceIncomes([
          { id: ana.id, referenceIncome: eur(260000) },
          { id: partner.id, referenceIncome: eur(140000) },
        ]);
        const base = { date: '2026-10-02', categoryId: 'cat-food', expenseType: 'VARIABLE' } as const;
        await app.services.expenses.create({
          ...base, amount: eur(15000), scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id, description: 'Cena de Ana',
        });
        await app.services.expenses.create({
          ...base, amount: eur(5000), scope: { type: 'INDIVIDUAL', ownerId: partner.id }, paidBy: partner.id, description: 'Cena de Pareja',
        });
      },
    });
    const members = await app.services.members.list();
    const partner = members.find((member) => member.name === 'Pareja');
    if (!partner) throw new Error('Household fixture missing');

    expect(await screen.findByText('Cena de Ana')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: '¿Quién eres en este dispositivo?' }), { target: { value: partner.id } });

    expect(screen.queryByText('Cena de Ana')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Cargando…');
  });

  it('shows a recovery path when all household members are inactive', async () => {
    await renderApp({
      route: 'personal',
      seed: async (app) => {
        const ana = await app.services.members.create({ name: 'Ana' });
        await app.services.members.setActive({ id: ana.id, active: false });
      },
    });

    expect(await screen.findByRole('heading', { name: 'No hay miembros activos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gestionar miembros' }).getAttribute('href')).toBe('#/ajustes');
  });

  it('P7: changing the month updates the personal expense list', async () => {
    await renderApp({
      route: 'personal',
      seed: async (app) => {
        const ana = await app.services.members.create({ name: 'Ana' });
        localStorage.setItem('family-finance.me', ana.id);
        const base = {
          amount: eur(1000), categoryId: 'cat-food', expenseType: 'VARIABLE',
          scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id,
        } as const;
        await app.services.expenses.create({ ...base, date: '2026-10-02', description: 'Gasto de octubre' });
        await app.services.expenses.create({ ...base, date: '2026-09-02', description: 'Gasto de septiembre' });
      },
    });

    const octoberExpenses = within(await screen.findByRole('region', { name: 'Gastos personales' }));
    expect(await octoberExpenses.findByText('Gasto de octubre')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(screen.queryByText('Gasto de octubre')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Cargando…');
    const septemberExpenses = within(await screen.findByRole('region', { name: 'Gastos personales' }));
    expect(await septemberExpenses.findByText('Gasto de septiembre')).toBeTruthy();
  });

  it('P3: shows accessible category bars whose amounts add up to the personal expense list', async () => {
    await renderApp({
      route: 'personal',
      seed: async (app) => {
        const { ana, partner } = await household(app);
        localStorage.setItem('family-finance.me', ana.id);
        const base = { date: '2026-10-02', expenseType: 'VARIABLE' } as const;
        await app.services.expenses.create({
          ...base, amount: eur(10000), categoryId: 'cat-food', scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id, description: 'Comida fuera',
        });
        await app.services.expenses.create({
          ...base, amount: eur(5000), categoryId: 'cat-health', scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id, description: 'Farmacia',
        });
        await app.services.expenses.create({
          ...base, amount: eur(7500), categoryId: 'cat-food', scope: { type: 'INDIVIDUAL', ownerId: partner.id }, paidBy: partner.id, description: 'Comida de Pareja',
        });
        await app.services.expenses.create({
          ...base, amount: eur(20000), categoryId: 'cat-food', scope: { type: 'SHARED' }, paidBy: ana.id, description: 'Compra común',
        });
      },
    });

    const categories = within(await screen.findByRole('region', { name: 'En qué se fue' }));
    const bars = categories.getAllByRole('meter');
    expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
      `Comida: ${euros(10000)} · ${percent(6667)}`,
      `Salud: ${euros(5000)} · ${percent(3333)}`,
    ]);
    expect(categories.getByText('Total del mes').nextElementSibling?.textContent).toBe(euros(15000));
    const expenses = within(screen.getByRole('region', { name: 'Gastos personales' }));
    expect(expenses.getAllByRole('button', { name: /^Abrir gasto/ })).toHaveLength(2);
    expect(expenses.queryByText('Comida de Pareja')).toBeNull();
    expect(expenses.queryByText('Compra común')).toBeNull();
  });

  it('P4: shows six accessible month bars and highlights the selected month', async () => {
    await renderApp({
      route: 'personal',
      seed: async (app) => {
        const { ana, partner } = await household(app);
        localStorage.setItem('family-finance.me', ana.id);
        const base = { categoryId: 'cat-food', expenseType: 'VARIABLE' } as const;
        await app.services.expenses.create({
          ...base, amount: eur(5000), date: '2026-05-04', scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id,
        });
        await app.services.expenses.create({
          ...base, amount: eur(10000), date: '2026-06-20', scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id,
        });
        await app.services.expenses.create({
          ...base, amount: eur(15000), date: '2026-09-10', scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id,
        });
        await app.services.expenses.create({
          ...base, amount: eur(25000), date: '2026-10-02', scope: { type: 'INDIVIDUAL', ownerId: ana.id }, paidBy: ana.id,
        });
        await app.services.expenses.create({
          ...base, amount: eur(40000), date: '2026-10-03', scope: { type: 'INDIVIDUAL', ownerId: partner.id }, paidBy: partner.id,
        });
      },
    });

    const history = within(await screen.findByRole('region', { name: 'Últimos 6 meses' }));
    const bars = history.getAllByRole('meter');
    expect(bars).toHaveLength(6);
    expect(bars.map((bar) => bar.getAttribute('aria-valuetext'))).toEqual([
      euros(5000), euros(10000), euros(0), euros(0), euros(15000), euros(25000),
    ]);
    expect(history.getByRole('meter', { name: /octubre de 2026.*mes seleccionado/i }).getAttribute('aria-current')).toBe('date');
  });
});
