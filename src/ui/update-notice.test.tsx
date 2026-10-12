// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  registerServiceWorker,
  resetServiceWorkerStateForTests,
} from '../pwa/registration.ts';
import {
  createFakeContainer,
  createFakeNavigator,
  createFakeRegistration,
  createFakeWindow,
  createFakeWorker,
} from '../pwa/test-helpers.ts';
import { cleanupApps, renderApp } from '../test/render-app.tsx';

async function setupWaitingWorker() {
  const waiting = createFakeWorker('installed');
  const controller = createFakeWorker('activated');
  const registration = createFakeRegistration({ waiting });
  const container = createFakeContainer(controller);
  container.setRegistration(registration);
  const navigator = createFakeNavigator(container);
  const window = createFakeWindow();
  await registerServiceWorker({ prod: true, navigator, window });
  return { waiting, window };
}

describe('update notice', () => {
  beforeEach(() => {
    resetServiceWorkerStateForTests();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupApps();
    resetServiceWorkerStateForTests();
  });

  it('is hidden when there is no waiting worker', async () => {
    await renderApp();
    expect(screen.queryByText('Hay una actualización lista.')).toBeNull();
  });

  it('shows the update notice and applies the update on click', async () => {
    const { waiting } = await setupWaitingWorker();
    await renderApp();

    expect(screen.getByText('Hay una actualización lista.')).toBeTruthy();

    const button = screen.getByRole('button', { name: 'Actualizar' });
    await userEvent.click(button);

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
});
