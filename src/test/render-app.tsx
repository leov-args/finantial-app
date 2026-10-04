import { cleanup, render } from '@testing-library/react';
import type { App } from '../app/container.ts';
import { AppShell } from '../ui/AppShell.tsx';
import { ServicesProvider } from '../ui/services-context.tsx';
import { makeTestApp } from './test-app.ts';

const apps: App[] = [];

// jsdom has <dialog> but not its modal API; enough of it for sheets to open and close.
if (!('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.open = true;
    },
    close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    },
  });
}

/**
 * Renders the real app (services + fake IndexedDB, fixed clock 2026-10-02).
 * `seed` runs before the first render; `route` sets the hash (#/gastos).
 * Components never see mocks: tests exercise UI → services → IndexedDB.
 */
export async function renderApp(options: { route?: string; seed?: (app: App) => Promise<unknown> } = {}) {
  const app = makeTestApp();
  apps.push(app);
  await options.seed?.(app);
  if (options.route !== undefined) window.location.hash = `#/${options.route}`;
  const view = () => (
    <ServicesProvider services={app.services}>
      <AppShell persistence="persisted" />
    </ServicesProvider>
  );
  const utils = render(view());
  /** Unmount and render again on the same database: a page reload. */
  const reload = () => {
    utils.unmount();
    return render(view());
  };
  return { app, reload, ...utils };
}

/** Call in afterEach: RTL's auto-cleanup needs vitest globals, which this project doesn't enable. */
export async function cleanupApps(): Promise<void> {
  cleanup();
  localStorage.clear();
  for (const app of apps.splice(0)) {
    app.close();
    await app.db.delete();
  }
}

export const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });

/** Two members, Ana and Pareja. */
export async function household(app: App) {
  const ana = await app.services.members.create({ name: 'Ana' });
  const partner = await app.services.members.create({ name: 'Pareja' });
  return { ana, partner };
}
