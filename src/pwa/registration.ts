import { useSyncExternalStore } from 'react';

type ServiceWorkerLike = {
  state: ServiceWorkerState;
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'statechange', listener: () => void) => void;
};

type ServiceWorkerRegistrationLike = {
  waiting: ServiceWorkerLike | null;
  installing: ServiceWorkerLike | null;
  addEventListener: (type: 'updatefound', listener: () => void) => void;
};

type ServiceWorkerContainerLike = {
  controller: ServiceWorkerLike | null;
  register: (path: string) => Promise<ServiceWorkerRegistrationLike>;
  addEventListener: (type: 'controllerchange', listener: () => void) => void;
};

type NavigatorLike = { serviceWorker: ServiceWorkerContainerLike };
type WindowLike = { location: { reload: () => void } };

interface RegisterOptions {
  prod?: boolean;
  navigator?: NavigatorLike;
  window?: WindowLike;
}

let registration: ServiceWorkerRegistrationLike | null = null;
let waiting = false;
let reloaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setWaiting(value: boolean) {
  if (waiting !== value) {
    waiting = value;
    emit();
  }
}

export function subscribeWaiting(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getWaitingSnapshot() {
  return waiting;
}

export function applyUpdate() {
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export function resetServiceWorkerStateForTests() {
  listeners.clear();
  registration = null;
  waiting = false;
  reloaded = false;
}

export async function registerServiceWorker(options: RegisterOptions = {}) {
  const isProd = options.prod ?? import.meta.env.PROD;
  if (!isProd) return;

  const nav = options.navigator ?? navigator;
  const win = options.window ?? window;
  if (!('serviceWorker' in nav)) return;

  try {
    registration = await nav.serviceWorker.register('./sw.js');
    setWaiting(registration.waiting !== null);

    const hadController = nav.serviceWorker.controller !== null;

    registration.addEventListener('updatefound', () => {
      const installing = registration?.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && nav.serviceWorker.controller) {
          setWaiting(true);
        }
      });
    });

    nav.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      win.location.reload();
    });
  } catch {
    // The app works without a service worker; failures are swallowed.
  }
}

export function useServiceWorkerUpdate(): { waiting: boolean; applyUpdate: () => void } {
  const waitingState = useSyncExternalStore(subscribeWaiting, getWaitingSnapshot);
  return { waiting: waitingState, applyUpdate };
}
