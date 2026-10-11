// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupApps, renderApp } from '../test/render-app.tsx';
import { makeHouseholdFile } from '../test/household-file.ts';

afterEach(cleanupApps);

const file = (text: string) => new File([text], 'hogar.json', { type: 'application/json' });

describe('join household', () => {
  it('rejects an oversized file by its size before reading it', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'personal' });
    await user.click(await screen.findByRole('button', { name: 'Ya tenemos hogar: abrir archivo' }));
    const big = file('{}');
    Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText('Abrir archivo del hogar'), big);
    expect((await screen.findByRole('alert')).textContent).toContain('Archivo no válido o dañado');
    expect(await app.db.members.count()).toBe(0);
  });


  it('previews the archive, lets the user cancel without writing, then asks who they are', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'personal' });
    await user.click(await screen.findByRole('button', { name: 'Ya tenemos hogar: abrir archivo' }));
    const input = screen.getByLabelText('Abrir archivo del hogar');

    await user.upload(input, file(makeHouseholdFile(['Ana', 'Pareja'])));
    expect(await screen.findByText('Miembros: Ana, Pareja')).toBeTruthy();
    expect(screen.getByText('Gastos: 1 · Ingresos: 0 · Plan: 0')).toBeTruthy();
    expect(screen.getByText((text) => text.startsWith('Fechas: '))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await app.db.members.count()).toBe(0);

    await user.upload(input, file(makeHouseholdFile(['Ana', 'Pareja'])));
    await user.click(await screen.findByRole('button', { name: 'Unirme' }));
    expect(await screen.findByRole('heading', { name: '¿Quién eres en este dispositivo?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Pareja' }));

    expect(await screen.findByRole('link', { name: 'Personal' })).toBeTruthy();
    expect(localStorage.getItem('family-finance.me')).toBe('member-2');
    expect(localStorage.getItem('family-finance.setup-step')).toBeNull();
  });

  it('shows a file error and skips identity choice when there is one active member', async () => {
    const user = userEvent.setup();
    const { app } = await renderApp({ route: 'personal' });
    await user.click(await screen.findByRole('button', { name: 'Ya tenemos hogar: abrir archivo' }));
    const input = screen.getByLabelText('Abrir archivo del hogar');
    await user.upload(input, file('{'));
    expect((await screen.findByRole('alert')).textContent).toContain('Archivo no válido o dañado');
    expect(await app.db.members.count()).toBe(0);

    await user.upload(input, file(makeHouseholdFile(['Ana'])));
    await user.click(await screen.findByRole('button', { name: 'Unirme' }));

    expect(await screen.findByRole('link', { name: 'Personal' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '¿Quién eres en este dispositivo?' })).toBeNull();
    expect(localStorage.getItem('family-finance.me')).toBe('member-1');
    expect(localStorage.getItem('family-finance.setup-step')).toBeNull();
  });
});
