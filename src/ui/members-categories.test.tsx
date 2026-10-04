// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupApps, eur, household, renderApp } from '../test/render-app.tsx';

afterEach(cleanupApps);

/** Ajustes holds both lists; each is a region named by its heading. */
const region = async (name: 'Miembros' | 'Categorías') => within(await screen.findByRole('region', { name }));

const listUnder = async (heading: string) => {
  const list = (await screen.findByRole('heading', { name: heading })).nextElementSibling;
  if (!(list instanceof HTMLElement)) throw new Error(`No list after "${heading}"`);
  return within(list);
};

describe('shell', () => {
  it('S1: navigates with the URL hash and keeps the section after a reload', async () => {
    const user = userEvent.setup();
    const { reload } = await renderApp({ route: 'familiar', seed: household });
    await user.click(await screen.findByRole('link', { name: 'Ajustes' }));
    expect(window.location.hash).toBe('#/ajustes');
    expect(await screen.findByRole('heading', { name: 'Categorías' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ajustes' }).getAttribute('aria-current')).toBe('page');

    reload();
    expect(await screen.findByRole('heading', { name: 'Categorías' })).toBeTruthy();
  });

  it.each(['', 'gastos', 'ingresos', 'resumen'])('X1, X5: the hash «#/%s» opens Personal', async (route) => {
    await renderApp({ route, seed: household });
    expect((await screen.findByRole('link', { name: 'Personal' })).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('group', { name: 'Mes' })).toBeTruthy(); // only Personal has the month picker
  });

  it('S2: month picker starts at the clock month and moves both ways', async () => {
    const user = userEvent.setup();
    await renderApp({ route: 'personal', seed: household });
    expect(await screen.findByRole('heading', { name: 'octubre de 2026' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(screen.getByRole('heading', { name: 'noviembre de 2026' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(screen.getByRole('heading', { name: 'septiembre de 2026' })).toBeTruthy();
  });

  it('S5, S6: tells where the data lives, that there is no backup, and the persistence status', async () => {
    await renderApp({ route: 'personal' });
    expect(screen.getByText(/solo en este navegador.*todavía no hay copia de seguridad/s)).toBeTruthy();
    expect(screen.getByText('Almacenamiento persistente concedido.')).toBeTruthy();
  });
});

describe('members', () => {
  it('M1: without members the app opens the first-use setup (X6) to add them', async () => {
    await renderApp({ route: 'resumen' });
    expect(await screen.findByRole('heading', { name: 'Quiénes sois' })).toBeTruthy();
    expect(screen.getByLabelText('Nuevo miembro')).toBeTruthy();
  });

  it('M2: creates and renames; a blank name shows a field error in Spanish', async () => {
    const user = userEvent.setup();
    await renderApp({ route: 'ajustes' });
    await user.type(await screen.findByLabelText('Nuevo miembro'), '   ');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(await screen.findByText('Escribe un nombre')).toBeTruthy();

    await user.clear(screen.getByLabelText('Nuevo miembro'));
    await user.type(screen.getByLabelText('Nuevo miembro'), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await user.click(await screen.findByRole('button', { name: 'Renombrar Ana' }));
    await user.clear(screen.getByLabelText('Nuevo nombre de Ana'));
    await user.type(screen.getByLabelText('Nuevo nombre de Ana'), 'Ani');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('button', { name: 'Renombrar Ani' })).toBeTruthy();
    expect(screen.queryByText('Escribe un nombre')).toBeNull();
  });

  it('M3: deactivated members move to "Inactivos" and can be reactivated', async () => {
    const user = userEvent.setup();
    await renderApp({ route: 'ajustes', seed: household });
    await user.click(await screen.findByRole('button', { name: 'Desactivar Pareja' }));
    expect((await listUnder('Inactivos')).getByText('Pareja')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reactivar Pareja' }));
    expect(await screen.findByRole('button', { name: 'Desactivar Pareja' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Inactivos' })).toBeNull();
  });

  it('M4: deletes members without history; with history it explains to deactivate instead', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderApp({
      route: 'ajustes',
      seed: async (app) => {
        const { ana } = await household(app);
        await app.services.incomes.create({
          memberId: ana.id,
          amount: eur(100000),
          date: '2026-10-01',
          schedule: { kind: 'ONE_OFF' },
          source: 'OTHER',
        });
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Eliminar Pareja' }));
    expect(confirm).toHaveBeenCalledWith('¿Eliminar «Pareja»?');
    await waitFor(() => expect(screen.queryByText('Pareja')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Eliminar Ana' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Desactívalo en lugar de eliminarlo/);
    expect((await region('Miembros')).getByText('Ana')).toBeTruthy();
  });
});

describe('categories', () => {
  it('C1: lists active categories sorted by name', async () => {
    await renderApp({ route: 'ajustes', seed: household });
    const names = (await (await region('Categorías')).findAllByRole('button', { name: /^Renombrar / })).map((b) =>
      b.getAttribute('aria-label')?.replace('Renombrar ', ''),
    );
    expect(names.slice(0, 3)).toEqual(['Ahorro', 'Comida', 'Compras']);
    expect(names).toHaveLength(14);
  });

  it('C2: rejects a duplicate name ignoring case and accents', async () => {
    const user = userEvent.setup();
    await renderApp({ route: 'ajustes', seed: household });
    await user.type(await screen.findByLabelText('Nueva categoría'), 'educacion');
    await user.click((await region('Categorías')).getByRole('button', { name: 'Añadir' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Ya existe la categoría "Educación".');
    expect(screen.getByText('Nombre duplicado')).toBeTruthy();
  });

  it('C3: archived categories move to "Archivadas" and can be restored', async () => {
    const user = userEvent.setup();
    await renderApp({ route: 'ajustes', seed: household });
    await user.click(await screen.findByRole('button', { name: 'Archivar Ocio' }));
    expect((await listUnder('Archivadas')).getByText('Ocio')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Desarchivar Ocio' }));
    expect(await screen.findByRole('button', { name: 'Archivar Ocio' })).toBeTruthy();
  });

  it('C4: a used category cannot be deleted and the message suggests archiving it', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderApp({
      route: 'ajustes',
      seed: async (app) => {
        const { ana } = await household(app);
        await app.services.expenses.create({
          amount: eur(4235),
          date: '2026-10-02',
          categoryId: 'cat-food',
          expenseType: 'VARIABLE',
          scope: { type: 'SHARED' },
          paidBy: ana.id,
        });
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Eliminar Comida' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Archívala en lugar de eliminarla/);

    await user.click(screen.getByRole('button', { name: 'Eliminar Ocio' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Eliminar Ocio' })).toBeNull());
  });
});
