// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { format, money } from '../domain/money/money.ts';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupApps, renderApp } from '../test/render-app.tsx';

afterEach(cleanupApps);

describe('onboarding', () => {
  it('X6: guides an empty household through members, incomes and plan, ending in Familiar with contributions', async () => {
    const user = userEvent.setup();
    await renderApp({ route: 'personal' });

    // Step 1: members
    expect(await screen.findByRole('heading', { name: 'Bienvenido a Family Finance' })).toBeTruthy();
    await user.type(await screen.findByLabelText('Nuevo miembro'), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(await screen.findByRole('button', { name: 'Renombrar Ana' })).toBeTruthy();
    // user-event doesn't see form.reset(), so clear its stale copy of the value first.
    await user.clear(screen.getByLabelText('Nuevo miembro'));
    await user.type(screen.getByLabelText('Nuevo miembro'), 'Pareja');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(await screen.findByRole('button', { name: 'Renombrar Pareja' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    // Step 2: reference incomes
    expect(await screen.findByRole('heading', { name: 'Ingresos de referencia' })).toBeTruthy();
    await user.type(screen.getByLabelText('Ana'), '2600');
    await user.type(screen.getByLabelText('Pareja'), '1400');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    // Step 3: plan line
    expect(await screen.findByRole('heading', { name: 'Plan del hogar' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Añadir gasto común' }));
    await user.type(await screen.findByLabelText('Nombre'), 'Alquiler');
    await user.type(screen.getByLabelText('Importe'), '1000');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByText('Alquiler')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('1.000,00 €')).toBeTruthy());

    // Finish: land in Familiar
    await user.click(screen.getByRole('button', { name: 'Ver aportes' }));
    const summary = within(await screen.findByRole('region', { name: 'Este mes transferís' }));
    // EQUAL_KEEP: 4.000 − 1.000 leaves 3.000; Ana covers the line and Pareja contributes nothing (Q3).
    expect(summary.getByText('Ana', { selector: 'span' }).closest('li')?.textContent).toContain(format(money(100000, 'EUR')));
    expect(summary.getByText('Pareja', { selector: 'span' }).closest('li')?.textContent).toContain(format(money(0, 'EUR')));
    expect(summary.getByText('Cuadra')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Bienvenido a Family Finance' })).toBeNull();
  });

  it('X6: leaving and coming back resumes the setup without losing what was entered', async () => {
    const user = userEvent.setup();
    const { app, reload } = await renderApp({ route: 'personal' });
    await user.type(await screen.findByLabelText('Nuevo miembro'), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    // Adding the first member doesn't end the setup.
    expect(await screen.findByRole('button', { name: 'Renombrar Ana' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await user.type(await screen.findByLabelText('Ana'), '2600');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByRole('heading', { name: 'Plan del hogar' })).toBeTruthy();

    reload();
    expect(await screen.findByRole('heading', { name: 'Plan del hogar' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    expect((await screen.findByLabelText<HTMLInputElement>('Ana')).value).toBe('2600,00');
    const [ana] = await app.services.members.list();
    expect(ana?.referenceIncome).toEqual({ amountMinor: 260000, currency: 'EUR' });
  });

  it('X6: an invalid income keeps the setup on the incomes step with a field error', async () => {
    const user = userEvent.setup();
    await renderApp({ route: 'personal' });
    await user.type(await screen.findByLabelText('Nuevo miembro'), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await screen.findByRole('button', { name: 'Renombrar Ana' });
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await user.type(await screen.findByLabelText('Ana'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Ingreso inválido')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ingresos de referencia' })).toBeTruthy();
  });

  it('X6: a household with members never sees the setup', async () => {
    await renderApp({ route: 'personal', seed: async (app) => app.services.members.create({ name: 'Ana' }) });
    // With members the setup is not shown.
    expect(await screen.findByRole('link', { name: 'Personal' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Bienvenido a Family Finance' })).toBeNull();
  });
});
