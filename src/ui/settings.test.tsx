// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupApps, eur, household, renderApp } from '../test/render-app.tsx';

afterEach(cleanupApps);

describe('redesign shell', () => {
  it('B6: exposes Personal, Familiar and Ajustes routes', async () => {
    const user = userEvent.setup();
    await renderApp({ route: 'personal', seed: household });

    expect(screen.getByRole('link', { name: 'Personal' }).getAttribute('aria-current')).toBe('page');
    await user.click(screen.getByRole('link', { name: 'Familiar' }));
    expect(window.location.hash).toBe('#/familiar');
    expect(await screen.findByRole('heading', { name: 'Familiar' })).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Ajustes' }));
    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeTruthy();
  });
});

describe('settings', () => {
  it('B7 A2: edits one reference income, persists it and keeps the untouched ones', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'ajustes', seed: async (app) => {
      const { partner } = await household(app);
      await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
    }});

    const income = await screen.findByLabelText('Ingreso de referencia de Ana');
    await user.clear(income);
    await user.type(income, '2600');
    await user.click(screen.getByRole('button', { name: 'Guardar ingresos' }));
    expect(await screen.findByText('Ingresos guardados')).toBeTruthy();
    const incomes = (await app.services.members.list()).map((m) => [m.name, m.referenceIncome?.amountMinor ?? null]);
    expect(incomes).toEqual([['Ana', 260000], ['Pareja', 140000]]);
  });

  it('B7 A2: rejects an invalid income on its own field without saving anything', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'ajustes', seed: household });

    await user.type(await screen.findByLabelText('Ingreso de referencia de Ana'), '2600');
    const partner = screen.getByLabelText('Ingreso de referencia de Pareja');
    await user.type(partner, '-5');
    await user.click(screen.getByRole('button', { name: 'Guardar ingresos' }));
    expect(await screen.findByText('Ingreso inválido')).toBeTruthy();
    expect(partner.getAttribute('aria-invalid')).toBe('true');
    expect((await app.services.members.list()).every((m) => m.referenceIncome === null)).toBe(true);
  });

  it('B7 A4: selects who I am on this device', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'ajustes', seed: household });
    const members = await app.services.members.list();
    const partner = members.find((member) => member.name === 'Pareja');
    if (!partner) throw new Error('Pareja fixture missing');

    await user.selectOptions(await screen.findByLabelText('¿Quién eres en este dispositivo?'), partner.id);
    expect(screen.getByRole('option', { name: 'Pareja', selected: true })).toBeTruthy();
    expect(localStorage.getItem('family-finance.me')).toBe(partner.id);
  });

  it('B7 A6: disables a color already used by another active member', async () => {
    await renderApp({ route: 'ajustes', seed: household });

    const palette = await screen.findByRole('group', { name: 'Color de Ana' });
    expect((within(palette).getByRole('button', { name: 'Índigo, lo usa Pareja' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('B7 A6: picks a free color and saves it', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'ajustes', seed: household });

    const palette = await screen.findByRole('group', { name: 'Color de Ana' });
    await user.click(within(palette).getByRole('button', { name: 'Naranja' }));
    expect(await screen.findByText('Color actualizado')).toBeTruthy();
    const saved = await screen.findByRole('group', { name: 'Color de Ana' });
    await waitFor(() => expect(within(saved).getByRole('button', { name: 'Naranja' }).getAttribute('aria-pressed')).toBe('true'));
    expect((await app.services.members.list()).find((m) => m.name === 'Ana')?.color).toBe('orange');
  });

  it('B7 A7: changes the household split rule', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'ajustes', seed: async (app) => {
      const { ana, partner } = await household(app);
      await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
      await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
    }});

    const rule = await screen.findByLabelText('Regla de reparto del hogar');
    await user.selectOptions(rule, 'PROPORTIONAL');
    expect(await screen.findByText('Regla guardada')).toBeTruthy();
    expect((await app.services.plan.getSettings()).splitRule).toBe('PROPORTIONAL');
  });
});
