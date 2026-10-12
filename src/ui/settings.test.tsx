// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupApps, eur, household, renderApp } from '../test/render-app.tsx';
import { makeRestorableHouseholdFile } from '../test/household-file.ts';

afterEach(cleanupApps);

function stubNavigatorShare({ canShare = true, share = vi.fn().mockResolvedValue(undefined) }: { canShare?: boolean; share?: () => Promise<void> } = {}) {
  const originalCanShare = navigator.canShare;
  const originalShare = navigator.share;
  Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => canShare), configurable: true, writable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  return () => {
    Object.defineProperty(navigator, 'canShare', { value: originalCanShare, configurable: true, writable: true });
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true, writable: true });
  };
}

function stubDownload() {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalClick = HTMLAnchorElement.prototype.click;
  const clicks: { href: string; download: string }[] = [];
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock-url'), configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clicks.push({ href: this.href, download: this.download });
  };
  return {
    clicks,
    restore: () => {
      Object.defineProperty(URL, 'createObjectURL', { value: originalCreateObjectURL, configurable: true, writable: true });
      Object.defineProperty(URL, 'revokeObjectURL', { value: originalRevokeObjectURL, configurable: true, writable: true });
      HTMLAnchorElement.prototype.click = originalClick;
    },
  };
}

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
    expect(await app.db.settings.get('household')).toMatchObject({ updatedAt: '2026-10-02T10:00:00.000Z' });
  });

  describe('E0-1: the «i» popup of the split rule', () => {
    const seedWithPlan = async (app: Parameters<typeof household>[0]) => {
      const { ana, partner } = await household(app);
      await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
      await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
      await app.services.plan.create({ name: 'Gastos comunes', kind: { type: 'FORMULA', amount: eur(210001) } });
      await app.services.plan.create({ name: 'Portátil', kind: { type: 'ASSIGNED', shares: [{ memberId: ana.id, amount: eur(30000) }] } });
    };
    const openInfo = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole('button', { name: 'Cómo funciona esta regla' }));
      return screen.findByRole('dialog');
    };

    it('proportional: gives each weight with the household figures, the same rate and the assigned lines left out', async () => {
      const user = userEvent.setup();
      await renderApp({ route: 'ajustes', seed: async (app) => { await seedWithPlan(app); await app.services.plan.setSplitRule({ splitRule: 'PROPORTIONAL' }); } });

      const dialog = await openInfo(user);
      expect(within(dialog).getByRole('heading', { name: 'Proporcional al ingreso' })).toBeTruthy();
      // 2.600 / 4.000 = 65 % and 1.400 / 4.000 = 35 %.
      expect(within(dialog).getByText(/^2\.600,00.€ ÷ 4\.000,00.€ = 65.%$/)).toBeTruthy();
      expect(within(dialog).getByText(/^1\.400,00.€ ÷ 4\.000,00.€ = 35.%$/)).toBeTruthy();
      expect(within(dialog).getByText(/el mismo 52,5.% de vuestro ingreso/)).toBeTruthy();
      expect(within(dialog).getByText(/no entran en los gastos comunes a repartir/)).toBeTruthy();
      expect(within(dialog).getByText(/porcentaje total de cada uno puede ser distinto/)).toBeTruthy();
    });

    it('equal keep: explains its own rule, with no weights', async () => {
      const user = userEvent.setup();
      await renderApp({ route: 'ajustes', seed: seedWithPlan });

      const dialog = await openInfo(user);
      expect(within(dialog).getByRole('heading', { name: 'Igualar lo que conserváis' })).toBeTruthy();
      expect(within(dialog).getByText(/quienes pagáis conservéis lo mismo.*quien gana más aporta más euros.*no paga gastos comunes y conserva todo su ingreso/)).toBeTruthy();
      expect(within(dialog).getByText(/no entran en los gastos comunes a repartir/)).toBeTruthy();
      expect(within(dialog).queryByText(/÷/)).toBeNull();
      expect(within(dialog).queryByText(/porcentaje total de cada uno puede ser distinto/)).toBeNull();
    });

    it('follows the rule selected in the dropdown and closes with «Entendido»', async () => {
      const user = userEvent.setup();
      await renderApp({ route: 'ajustes', seed: seedWithPlan });

      await user.selectOptions(await screen.findByLabelText('Regla de reparto del hogar'), 'PROPORTIONAL');
      await screen.findByText('Regla guardada');
      const dialog = await openInfo(user);
      expect(within(dialog).getByText(/= 65.%/)).toBeTruthy();
      await user.click(within(dialog).getByRole('button', { name: 'Entendido' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('proportional without common-expense lines does not claim a «0 %» rate', async () => {
      const user = userEvent.setup();
      await renderApp({ route: 'ajustes', seed: async (app) => {
        const { ana, partner } = await household(app);
        await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
        await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(140000) });
        await app.services.plan.setSplitRule({ splitRule: 'PROPORTIONAL' });
      } });

      const dialog = await openInfo(user);
      expect(within(dialog).getByText(/= 65.%/)).toBeTruthy();
      expect(within(dialog).queryByText(/el mismo/)).toBeNull();
    });

    it('proportional with all incomes at zero shows no weights', async () => {
      const user = userEvent.setup();
      await renderApp({ route: 'ajustes', seed: async (app) => {
        const { ana, partner } = await household(app);
        await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(0) });
        await app.services.members.setReferenceIncome({ id: partner.id, referenceIncome: eur(0) });
        await app.services.plan.setSplitRule({ splitRule: 'PROPORTIONAL' });
      } });

      const dialog = await openInfo(user);
      expect(within(dialog).queryByText(/÷/)).toBeNull();
      expect(within(dialog).getByText('Cada persona aporta el mismo porcentaje de su ingreso.')).toBeTruthy();
    });

    it('the «i» button announces that it opens a dialog', async () => {
      await renderApp({ route: 'ajustes', seed: household });
      expect((await screen.findByRole('button', { name: 'Cómo funciona esta regla' })).getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('without reference incomes it explains the rule but shows no figures', async () => {
      const user = userEvent.setup();
      await renderApp({ route: 'ajustes', seed: async (app) => { await household(app); await app.services.plan.setSplitRule({ splitRule: 'PROPORTIONAL' }); } });

      const dialog = await openInfo(user);
      expect(within(dialog).getByText('Cada persona aporta el mismo porcentaje de su ingreso.')).toBeTruthy();
      expect(within(dialog).queryByText(/÷/)).toBeNull();
    });
  });

  describe('E2-3: send changes', () => {
    it('shares the household file when the Web Share API is available', async () => {
      const user = userEvent.setup();
      const restoreShare = stubNavigatorShare();
      const { app } = await renderApp({ route: 'ajustes', seed: async (app) => {
        const { ana } = await household(app);
        await app.services.members.setReferenceIncome({ id: ana.id, referenceIncome: eur(260000) });
      }});
      const share = vi.mocked(navigator.share);

      await user.click(await screen.findByRole('button', { name: 'Enviar cambios' }));
      expect(await screen.findByText('Archivo enviado')).toBeTruthy();
      expect(share).toHaveBeenCalledTimes(1);
      const shareData = share.mock.calls[0]?.[0];
      const files = shareData && 'files' in shareData ? shareData.files : undefined;
      const file = files?.[0];
      expect(file).toBeInstanceOf(File);
      expect(file?.name).toMatch(/^family-finance-\d{4}-\d{2}-\d{2}\.json$/);
      expect(file?.type).toBe('application/json');
      if (!(file instanceof File)) throw new Error('Expected a File');
      expect(app.services.household.preview(await file.text()).summary.memberNames).toEqual(['Ana', 'Pareja']);

      restoreShare();
    });

    it('downloads the file when sharing files is not available', async () => {
      const user = userEvent.setup();
      const restoreShare = stubNavigatorShare({ canShare: false });
      const { clicks, restore } = stubDownload();
      await renderApp({ route: 'ajustes', seed: household });

      await user.click(await screen.findByRole('button', { name: 'Enviar cambios' }));
      expect(await screen.findByText('Archivo descargado')).toBeTruthy();
      expect(clicks).toHaveLength(1);
      expect(clicks[0]?.href).toBe('blob:mock-url');
      expect(clicks[0]?.download).toMatch(/^family-finance-\d{4}-\d{2}-\d{2}\.json$/);

      restore();
      restoreShare();
    });

    it('does not show an error when the user cancels the share sheet', async () => {
      const user = userEvent.setup();
      const restoreShare = stubNavigatorShare({ share: vi.fn().mockRejectedValue(new DOMException('Share canceled', 'AbortError')) });
      await renderApp({ route: 'ajustes', seed: household });

      await user.click(await screen.findByRole('button', { name: 'Enviar cambios' }));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
      expect(screen.queryByText('Ha ocurrido un error')).toBeNull();

      restoreShare();
    });

    it('shows a translated error when sharing fails for a real reason', async () => {
      const user = userEvent.setup();
      const restoreShare = stubNavigatorShare({ share: vi.fn().mockRejectedValue(new Error('Network failure')) });
      await renderApp({ route: 'ajustes', seed: household });

      await user.click(await screen.findByRole('button', { name: 'Enviar cambios' }));
      expect(await screen.findByText('Ha ocurrido un error')).toBeTruthy();

      restoreShare();
    });
  });

  describe('E1-3: restore a backup', () => {
    it('previews, rejects invalid files and cancels without writing, then replaces data and refreshes Personal', async () => {
      const user = userEvent.setup();
      const { app } = await renderApp({ route: 'ajustes', seed: household });
      const originalMembers = await app.services.members.list();
      const partner = originalMembers.find((member) => member.name === 'Pareja');
      if (!partner) throw new Error('Partner fixture missing');
      await user.selectOptions(await screen.findByLabelText('¿Quién eres en este dispositivo?'), partner.id);

      const originalData = {
        members: await app.db.members.toArray(), categories: await app.db.categories.toArray(),
        incomes: await app.db.incomes.toArray(), expenses: await app.db.expenses.toArray(), planItems: await app.db.planItems.toArray(),
        settings: await app.db.settings.toArray(), monthSnapshots: await app.db.monthSnapshots.toArray(), tombstones: await app.db.tombstones.toArray(),
      };
      const input = await screen.findByLabelText('Abrir copia de seguridad');
      await user.upload(input, new File(['{'], 'invalid.json', { type: 'application/json' }));
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect({
        members: await app.db.members.toArray(), categories: await app.db.categories.toArray(),
        incomes: await app.db.incomes.toArray(), expenses: await app.db.expenses.toArray(), planItems: await app.db.planItems.toArray(),
        settings: await app.db.settings.toArray(), monthSnapshots: await app.db.monthSnapshots.toArray(), tombstones: await app.db.tombstones.toArray(),
      }).toEqual(originalData);

      const backup = makeRestorableHouseholdFile();
      await user.upload(input, new File([backup], 'backup.json', { type: 'application/json' }));
      expect(await screen.findByText('Miembros: Hogar restaurado')).toBeTruthy();
      expect(screen.getByText('Todos los datos de este dispositivo se reemplazarán. Envía antes los datos actuales si quieres conservarlos.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Restaurar copia (reemplaza todo)' })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect({
        members: await app.db.members.toArray(), categories: await app.db.categories.toArray(),
        incomes: await app.db.incomes.toArray(), expenses: await app.db.expenses.toArray(), planItems: await app.db.planItems.toArray(),
        settings: await app.db.settings.toArray(), monthSnapshots: await app.db.monthSnapshots.toArray(), tombstones: await app.db.tombstones.toArray(),
      }).toEqual(originalData);

      await user.upload(input, new File([backup], 'backup.json', { type: 'application/json' }));
      await user.click(await screen.findByRole('button', { name: 'Restaurar copia (reemplaza todo)' }));
      await waitFor(async () => expect((await app.services.members.list()).map((member) => member.name)).toEqual(['Hogar restaurado']));
      expect(localStorage.getItem('family-finance.me')).toBeNull();
      expect(await app.services.categories.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'restored-category', name: 'Categoría restaurada' })]));

      await user.click(screen.getByRole('link', { name: 'Personal' }));
      expect(await screen.findByText('Gasto restaurado')).toBeTruthy();
    });

    it('keeps the device identity when that member remains active in the restored household', async () => {
      const user = userEvent.setup();
      const { app } = await renderApp({ route: 'ajustes', seed: household });
      const ana = (await app.services.members.list()).find((member) => member.name === 'Ana');
      if (!ana) throw new Error('Ana fixture missing');
      await user.selectOptions(await screen.findByLabelText('¿Quién eres en este dispositivo?'), ana.id);
      const exported = await app.services.household.exportFile();
      const payload = JSON.parse(exported.text) as { data: { members: Array<Record<string, unknown>> } };
      payload.data.members = payload.data.members.map((member) => member['id'] === ana.id ? { ...member, name: 'Ana restaurada' } : member);
      await user.upload(await screen.findByLabelText('Abrir copia de seguridad'), new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' }));
      await user.click(await screen.findByRole('button', { name: 'Restaurar copia (reemplaza todo)' }));

      await waitFor(() => expect(localStorage.getItem('family-finance.me')).toBe(ana.id));
    });
  });

  describe('E2-4: receive and merge household changes', () => {
    it('enables apply when the only incoming change is the household split rule', async () => {
      const user = userEvent.setup();
      const { app } = await renderApp({ route: 'ajustes', seed: async (app) => { await household(app); } });
      const exported = await app.services.household.exportFile();
      const payload = JSON.parse(exported.text) as {
        data: { settings: Array<Record<string, unknown>> };
      };
      payload.data.settings = [{ id: 'household', splitRule: 'PROPORTIONAL', updatedAt: '2026-10-03T10:00:00.000Z' }];

      await user.upload(await screen.findByLabelText('Abrir archivo de cambios'), new File([JSON.stringify(payload)], 'rule.json', { type: 'application/json' }));

      expect(await screen.findByText('0 nuevos, 0 actualizados, 0 borrados')).toBeTruthy();
      const apply = await screen.findByRole('button', { name: 'Aplicar cambios' });
      expect((apply as HTMLButtonElement).disabled).toBe(false);
      await user.click(apply);

      expect(await screen.findByText('Cambios aplicados')).toBeTruthy();
      expect(screen.queryByText('No hay cambios nuevos que aplicar.')).toBeNull();
      expect((await app.services.plan.getSettings()).splitRule).toBe('PROPORTIONAL');
    });

    it('groups send and receive, previews, cancels without writing, then applies and preserves a valid device identity', async () => {
      const user = userEvent.setup();
      const { app } = await renderApp({ route: 'ajustes', seed: async (app) => { await household(app); } });
      const ana = (await app.services.members.list()).find((member) => member.name === 'Ana');
      if (!ana) throw new Error('Ana fixture missing');
      await user.selectOptions(await screen.findByLabelText('¿Quién eres en este dispositivo?'), ana.id);

      const sync = screen.getByRole('region', { name: 'Sincronizar con tu pareja' });
      expect(within(sync).getByRole('heading', { name: 'Enviar cambios' })).toBeTruthy();
      expect(within(sync).getByRole('heading', { name: 'Recibir cambios' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Copia de seguridad' })).toBeTruthy();

      const before = await app.db.members.toArray();
      const changes = await app.services.household.exportFile();
      const payload = JSON.parse(changes.text) as {
        data: { members: Array<Record<string, unknown>> };
      };
      payload.data.members.push({
        id: 'member-merge-new', name: 'Nueva pareja', active: true, referenceIncome: null, color: 'purple',
        createdAt: '2026-10-03T10:00:00.000Z', updatedAt: '2026-10-03T10:00:00.000Z',
      });
      const file = new File([JSON.stringify(payload)], 'changes.json', { type: 'application/json' });
      const input = await screen.findByLabelText('Abrir archivo de cambios');
      await user.upload(input, new File(['{'], 'invalid.json', { type: 'application/json' }));
      expect(await screen.findByText('Archivo no válido o dañado (máx. 20 MB).')).toBeTruthy();
      expect(await app.db.members.toArray()).toEqual(before);

      await user.upload(input, file);
      expect(await screen.findByText('1 nuevos, 0 actualizados, 0 borrados')).toBeTruthy();
      expect(screen.getByText(/Si quieres reemplazar todos los datos/)).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(await app.db.members.toArray()).toEqual(before);

      await user.upload(input, file);
      await user.click(await screen.findByRole('button', { name: 'Aplicar cambios' }));
      expect(await screen.findByText('Cambios aplicados')).toBeTruthy();
      await waitFor(async () => expect((await app.services.members.list()).map((member) => member.name)).toContain('Nueva pareja'));
      expect(localStorage.getItem('family-finance.me')).toBe(ana.id);

      const backup = await screen.findByLabelText('Abrir copia de seguridad');
      await user.upload(backup, new File([changes.text], 'backup.json', { type: 'application/json' }));
      expect(await screen.findByText(/Para combinar esta copia con los datos actuales/)).toBeTruthy();
    });

    it('points an unrelated household to restore-by-replacing', async () => {
      const user = userEvent.setup();
      const { app } = await renderApp({ route: 'ajustes', seed: async (app) => { await household(app); } });
      const exported = await app.services.household.exportFile();
      const payload = JSON.parse(exported.text) as { data: { members: Array<Record<string, unknown>> } };
      payload.data.members = payload.data.members.map((member, index) => ({ ...member, id: `other-member-${index}` }));

      await user.upload(await screen.findByLabelText('Abrir archivo de cambios'), new File([JSON.stringify(payload)], 'other.json', { type: 'application/json' }));

      expect(await screen.findByText(/Este archivo parece de otro hogar/)).toBeTruthy();
      expect(screen.getByText(/Restaurar copia \(reemplaza todo\)/)).toBeTruthy();
    });

    it('clears the device identity when the merged member is no longer active', async () => {
      const user = userEvent.setup();
      const { app } = await renderApp({ route: 'ajustes', seed: async (app) => { await household(app); } });
      const ana = (await app.services.members.list()).find((member) => member.name === 'Ana');
      if (!ana) throw new Error('Ana fixture missing');
      await user.selectOptions(await screen.findByLabelText('¿Quién eres en este dispositivo?'), ana.id);
      const exported = await app.services.household.exportFile();
      const payload = JSON.parse(exported.text) as { data: { members: Array<Record<string, unknown>> } };
      payload.data.members = payload.data.members.map((member) => member['id'] === ana.id
        ? { ...member, active: false, updatedAt: '2026-10-03T10:00:00.000Z' }
        : member);

      await user.upload(await screen.findByLabelText('Abrir archivo de cambios'), new File([JSON.stringify(payload)], 'deactivate.json', { type: 'application/json' }));
      await user.click(await screen.findByRole('button', { name: 'Aplicar cambios' }));

      await waitFor(() => expect(localStorage.getItem('family-finance.me')).toBeNull());
    });
  });
});
