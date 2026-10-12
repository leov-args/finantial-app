import type { Mock } from 'vitest';
import { vi } from 'vitest';

type EventHandler = () => void;

type ServiceWorkerLike = {
  state: ServiceWorkerState;
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'statechange', handler: EventHandler) => void;
  dispatchEvent: (type: 'statechange') => void;
};

type ServiceWorkerRegistrationLike = {
  waiting: ServiceWorkerLike | null;
  installing: ServiceWorkerLike | null;
  addEventListener: (type: 'updatefound', handler: EventHandler) => void;
  dispatchEvent: (type: 'updatefound') => void;
};

type ServiceWorkerContainerLike = {
  controller: ServiceWorkerLike | null;
  register: (path: string) => Promise<ServiceWorkerRegistrationLike>;
  addEventListener: (type: 'controllerchange', handler: EventHandler) => void;
  dispatchEvent: (type: 'controllerchange') => void;
};

export interface FakeContainer extends ServiceWorkerContainerLike {
  register: Mock<(path: string) => Promise<ServiceWorkerRegistrationLike>>;
  setRegistration(value: ServiceWorkerRegistrationLike): void;
}

export function createFakeWorker(state: ServiceWorkerState = 'activated'): ServiceWorkerLike {
  const listeners = new Map<string, EventHandler[]>();
  return {
    state,
    postMessage: vi.fn(),
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(type: string) {
      listeners.get(type)?.forEach((handler) => handler());
    },
  };
}

export function createFakeRegistration(options: {
  waiting?: ServiceWorkerLike;
  installing?: ServiceWorkerLike;
} = {}): ServiceWorkerRegistrationLike {
  const listeners = new Map<string, EventHandler[]>();
  return {
    waiting: options.waiting ?? null,
    installing: options.installing ?? null,
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(type: string) {
      listeners.get(type)?.forEach((handler) => handler());
    },
  };
}

export function createFakeContainer(controller: ServiceWorkerLike | null = null): FakeContainer {
  const listeners = new Map<string, EventHandler[]>();
  let registration: ServiceWorkerRegistrationLike | null = null;
  return {
    controller,
    register: vi.fn(async () => {
      if (!registration) throw new Error('registration not set');
      return registration;
    }),
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    dispatchEvent(type: string) {
      listeners.get(type)?.forEach((handler) => handler());
    },
    setRegistration(value: ServiceWorkerRegistrationLike) {
      registration = value;
    },
  };
}

type NavigatorLike = { serviceWorker: ServiceWorkerContainerLike };

export function createFakeNavigator(container: ServiceWorkerContainerLike): NavigatorLike {
  return { serviceWorker: container };
}

export function createFakeWindow() {
  return { location: { reload: vi.fn() } };
}
