import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyUpdate,
  getWaitingSnapshot,
  registerServiceWorker,
  resetServiceWorkerStateForTests,
  subscribeWaiting,
} from './registration.ts';
import {
  createFakeContainer,
  createFakeNavigator,
  createFakeRegistration,
  createFakeWindow,
  createFakeWorker,
} from './test-helpers.ts';

describe('service worker registration', () => {
  beforeEach(() => {
    resetServiceWorkerStateForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetServiceWorkerStateForTests();
  });

  it('does nothing in dev mode', async () => {
    const container = createFakeContainer();
    const navigator = createFakeNavigator(container);
    await registerServiceWorker({ prod: false, navigator, window: createFakeWindow() });
    expect(container.register).not.toHaveBeenCalled();
  });

  it('does nothing when service workers are unsupported', async () => {
    const window = createFakeWindow();
    await registerServiceWorker({ prod: true, navigator: {} as never, window });
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('swallows registration failures', async () => {
    const container = createFakeContainer();
    container.register.mockRejectedValue(new Error('network'));
    const navigator = createFakeNavigator(container);
    await expect(registerServiceWorker({ prod: true, navigator, window: createFakeWindow() })).resolves.toBeUndefined();
    expect(getWaitingSnapshot()).toBe(false);
  });

  it('reflects an already-waiting worker', async () => {
    const waiting = createFakeWorker('installed');
    const controller = createFakeWorker('activated');
    const registration = createFakeRegistration({ waiting });
    const container = createFakeContainer(controller);
    container.setRegistration(registration);
    const navigator = createFakeNavigator(container);

    await registerServiceWorker({ prod: true, navigator, window: createFakeWindow() });

    expect(getWaitingSnapshot()).toBe(true);
  });

  it('reflects a worker that moves to installed while the page is controlled', async () => {
    const installing = createFakeWorker('installing');
    const controller = createFakeWorker('activated');
    const registration = createFakeRegistration({ installing });
    const container = createFakeContainer(controller);
    container.setRegistration(registration);
    const navigator = createFakeNavigator(container);

    await registerServiceWorker({ prod: true, navigator, window: createFakeWindow() });
    registration.dispatchEvent('updatefound');
    installing.state = 'installed';
    installing.dispatchEvent('statechange');

    expect(getWaitingSnapshot()).toBe(true);
  });

  it('posts SKIP_WAITING when applying an update', async () => {
    const waiting = createFakeWorker('installed');
    const controller = createFakeWorker('activated');
    const registration = createFakeRegistration({ waiting });
    const container = createFakeContainer(controller);
    container.setRegistration(registration);
    const navigator = createFakeNavigator(container);

    await registerServiceWorker({ prod: true, navigator, window: createFakeWindow() });
    applyUpdate();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('notifies subscribers when waiting changes', async () => {
    const waiting = createFakeWorker('installed');
    const controller = createFakeWorker('activated');
    const registration = createFakeRegistration({ waiting });
    const container = createFakeContainer(controller);
    container.setRegistration(registration);
    const navigator = createFakeNavigator(container);
    const callback = vi.fn();
    subscribeWaiting(callback);

    await registerServiceWorker({ prod: true, navigator, window: createFakeWindow() });
    expect(callback).toHaveBeenCalled();
  });

  it('reloads on controllerchange during an update', async () => {
    const controller = createFakeWorker('activated');
    const registration = createFakeRegistration();
    const container = createFakeContainer(controller);
    container.setRegistration(registration);
    const navigator = createFakeNavigator(container);
    const window = createFakeWindow();

    await registerServiceWorker({ prod: true, navigator, window });
    container.dispatchEvent('controllerchange');

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload on first install because there is no previous controller', async () => {
    const registration = createFakeRegistration();
    const container = createFakeContainer(null);
    container.setRegistration(registration);
    const navigator = createFakeNavigator(container);
    const window = createFakeWindow();

    await registerServiceWorker({ prod: true, navigator, window });
    container.dispatchEvent('controllerchange');

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('reloads at most once even if controllerchange fires multiple times', async () => {
    const controller = createFakeWorker('activated');
    const registration = createFakeRegistration();
    const container = createFakeContainer(controller);
    container.setRegistration(registration);
    const navigator = createFakeNavigator(container);
    const window = createFakeWindow();

    await registerServiceWorker({ prod: true, navigator, window });
    container.dispatchEvent('controllerchange');
    container.dispatchEvent('controllerchange');

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});
