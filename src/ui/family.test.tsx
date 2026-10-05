// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../app/container.ts';
import { format, money } from '../domain/money/money.ts';
import { cleanupApps, eur, household, renderApp } from '../test/render-app.tsx';

afterEach(cleanupApps);

/** Formatted euros as getByText sees them: its default normalizer turns no-break spaces into plain ones. */
const f = (amountMinor: number) => format(money(amountMinor, 'EUR')).replace(/\s/g, ' ');

/** The plan row that shows `name`. */
async function planRow(name: string): Promise<HTMLElement> {
  const row = (await screen.findByText(name)).closest('li');
  if (!row) throw new Error(`No plan row for ${name}`);
  return row;
}

async function couple(app: App) {
  const members = await household(app);
  await app.services.members.setReferenceIncome({ id: members.ana.id, referenceIncome: eur(260000) });
  await app.services.members.setReferenceIncome({ id: members.partner.id, referenceIncome: eur(140000) });
  return members;
}

describe('family', () => {
  it('F4, F6: shows named contributions and the worked example to the cent', async () => {
    await renderApp({
      route: 'familiar',
      seed: async (app) => {
        const { ana, partner } = await household(app);
        await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
        await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
        await app.services.plan.create({ name: 'Gastos comunes', kind: { type: 'FORMULA', amount: eur(210001) } });
        await app.services.plan.create({
          name: 'Portátil',
          kind: {
            type: 'ASSIGNED',
            shares: [
              { memberId: ana.id, amount: eur(30000) },
              { memberId: partner.id, amount: eur(5000) },
            ],
          },
        });
      },
    });

    expect(await screen.findByRole('heading', { name: 'Este mes transferís' })).toBeTruthy();
    expect(screen.getAllByText(/1\.950,01/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/500,00/).length).toBeGreaterThan(0);
    expect(screen.getByText('Gastos comunes')).toBeTruthy();
    expect(screen.getByText('Portátil')).toBeTruthy();
    expect(screen.getByText('Cuadra')).toBeTruthy();
    expect(screen.getByText(`${f(195001)} + ${f(50000)} = ${f(245001)}`)).toBeTruthy();
  });

  it('F7: explains when the household has no participating incomes', async () => {
    await renderApp({ route: 'familiar', seed: async (app) => household(app) });

    expect(await screen.findByRole('heading', { name: 'Aún no hay ingresos de referencia' })).toBeTruthy();
    expect(screen.getByText(/Añade los ingresos de referencia/i)).toBeTruthy();
  });

  it('F7: marks a plan larger than the household income as a deficit', async () => {
    await renderApp({
      route: 'familiar',
      seed: async (app) => {
        const { ana } = await household(app);
        await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(10000) });
        await app.services.plan.create({ name: 'Alquiler', kind: { type: 'FORMULA', amount: eur(20000) } });
      },
    });

    expect(await screen.findByText(/Déficit del hogar/i)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/-100,00/);
  });

  it('F2, F3: adds a formula line, recalculates contributions, and restores a deleted line', async () => {
    const user = userEvent.setup();
    await renderApp({
      route: 'familiar',
      seed: async (app) => {
        const { ana, partner } = await household(app);
        await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
        await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Añadir gasto común' }));
    await user.type(screen.getByLabelText('Nombre'), ' ');
    await user.type(screen.getByLabelText('Importe'), '1');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribe un nombre')).toBeTruthy();
    await user.clear(screen.getByLabelText('Nombre'));
    await user.type(screen.getByLabelText('Nombre'), 'Calefacción');
    await user.clear(screen.getByLabelText('Importe'));
    await user.type(screen.getByLabelText('Importe'), '80');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(within(await planRow('Calefacción')).getByText(/80,00/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Abrir línea Calefacción/ }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(screen.queryByText('Calefacción')).toBeNull());
    expect(screen.getByText('Se eliminó «Calefacción».')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByText('Calefacción')).toBeTruthy();
  });

  it('F2: saves an assigned line as the sum of its member shares', async () => {
    const user = userEvent.setup();
    await renderApp({
      route: 'familiar',
      seed: async (app) => {
        const { ana, partner } = await household(app);
        await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
        await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Añadir gasto común' }));
    await user.type(screen.getByLabelText('Nombre'), 'Portátil');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'ASSIGNED');
    await user.type(screen.getByLabelText('Ana'), '300');
    await user.type(screen.getByLabelText('Pareja'), '50');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(within(await planRow('Portátil')).getByText(/350,00/)).toBeTruthy();
  });

  it('F2: marks the share that is not a valid amount', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'familiar', seed: couple });

    await user.click(await screen.findByRole('button', { name: 'Añadir gasto común' }));
    await user.type(screen.getByLabelText('Nombre'), 'Portátil');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'ASSIGNED');
    await user.type(screen.getByLabelText('Ana'), '300');
    await user.type(screen.getByLabelText('Pareja'), '-50');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Revisa los campos marcados.')).toBeTruthy();
    expect(screen.getByLabelText('Pareja').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Ana').getAttribute('aria-invalid')).not.toBe('true');
    expect(await app.services.plan.list()).toEqual([]);
  });

  it('F2: an assigned line whose shares are all zero is explained in Spanish', async () => {
    const user = userEvent.setup();
    await renderApp({ route: 'familiar', seed: couple });

    await user.click(await screen.findByRole('button', { name: 'Añadir gasto común' }));
    await user.type(screen.getByLabelText('Nombre'), 'Vacía');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'ASSIGNED');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El importe debe ser mayor que cero')).toBeTruthy();
  });

  it('F2: switching to another line while editing loads that line, not the open one', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({
      route: 'familiar',
      seed: async (app) => {
        await couple(app);
        await app.services.plan.create({ name: 'Luz', kind: { type: 'FORMULA', amount: eur(5600) } });
        await app.services.plan.create({ name: 'Agua', kind: { type: 'FORMULA', amount: eur(3500) } });
      },
    });

    await user.click(await screen.findByRole('button', { name: /Abrir línea Luz/ }));
    await user.click(screen.getByRole('button', { name: /Abrir línea Agua/ }));
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Agua');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await app.services.plan.list()).map((item) => item.name)).toEqual(['Luz', 'Agua']);
  });

  it('F2: cancel closes the sheet without saving', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'familiar', seed: couple });

    await user.click(await screen.findByRole('button', { name: 'Añadir gasto común' }));
    expect(screen.getByRole('dialog', { name: 'Añadir línea' })).toBeTruthy();
    await user.type(screen.getByLabelText('Nombre'), 'Borrador');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await app.services.plan.list()).toEqual([]);
  });

  it('A7: "Cómo se calcula" explains the active split rule', async () => {
    await renderApp({
      route: 'familiar',
      seed: async (app) => {
        await couple(app);
        await app.services.plan.setSplitRule({ splitRule: 'PROPORTIONAL' });
      },
    });

    expect(await screen.findByText(/el mismo porcentaje de su ingreso/)).toBeTruthy();
    expect(screen.queryByText(/conservéis lo mismo/)).toBeNull();
  });

  it('C fix 3: shows the complete equal-keep calculation from service values', async () => {
    await renderApp({
      route: 'familiar',
      seed: async (app) => {
        const { ana, partner } = await couple(app);
        await app.services.plan.create({ name: 'Gastos comunes', kind: { type: 'FORMULA', amount: eur(210001) } });
        await app.services.plan.create({
          name: 'Portátil',
          kind: { type: 'ASSIGNED', shares: [{ memberId: ana.id, amount: eur(30000) }, { memberId: partner.id, amount: eur(5000) }] },
        });
      },
    });

    // Each calculation ends in what the member really keeps, assigned lines included.
    expect(await screen.findByText(`${f(260000)} − ${f(165001)} comunes − ${f(30000)} Portátil = ${f(64999)}`)).toBeTruthy();
    expect(screen.getByText(`${f(140000)} − ${f(45000)} comunes − ${f(5000)} Portátil = ${f(90000)}`)).toBeTruthy();
    expect(screen.getByText(`Se queda con ${f(64999)}`)).toBeTruthy();
    expect(screen.getByText(/Ingresos de referencia/)).toBeTruthy();
    expect(screen.getByText('Líneas asignadas')).toBeTruthy();
    expect(screen.getByText(`− ${f(35000)}`)).toBeTruthy();
    expect(screen.getByText(f(154999))).toBeTruthy();
  });

  it('C fix 3, A7: the proportional breakdown shows the share of income each one pays', async () => {
    await renderApp({
      route: 'familiar',
      seed: async (app) => {
        const { ana } = await couple(app);
        await app.services.plan.setSplitRule({ splitRule: 'PROPORTIONAL' });
        await app.services.plan.create({ name: 'Gastos comunes', kind: { type: 'FORMULA', amount: eur(210001) } });
        await app.services.plan.create({ name: 'Portátil', kind: { type: 'ASSIGNED', shares: [{ memberId: ana.id, amount: eur(30000) }] } });
      },
    });

    // F6 with the proportional rule: 1.365,01 / 735,00, both 52,5 % of their income.
    expect(await screen.findByText(/^2\.600,00.€ − 1\.365,01.€ \(52,5.%\) − 300,00.€ Portátil = 934,99.€$/)).toBeTruthy();
    expect(screen.getByText(/^1\.400,00.€ − 735,00.€ \(52,5.%\) = 665,00.€$/)).toBeTruthy();
  });
});
