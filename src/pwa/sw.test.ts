/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const VERSION = 'test-version';
const PRECACHE = ['index.html', 'assets/index-abc.js', 'manifest.webmanifest'];

interface VaryEntry {
  response: unknown;
  vary: string;
  origin: string;
}

interface FakeCache {
  store: Map<string, unknown | VaryEntry>;
  addAll(urls: string[]): Promise<void>;
  match(request: { url: string; headers?: { origin?: string } } | string, options?: { ignoreVary?: boolean }): Promise<unknown>;
}

interface FakeCaches {
  stores: Map<string, FakeCache>;
  deleted: string[];
  matchCalls: { request: unknown; options?: { ignoreVary?: boolean } }[];
  open(name: string): Promise<FakeCache>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
  match(request: { url: string; headers?: { origin?: string } } | string, options?: { ignoreVary?: boolean }): Promise<unknown>;
}

interface FakeSelf {
  addEventListener: (type: string, handler: (event: unknown) => void) => void;
  skipWaiting: ReturnType<typeof vi.fn>;
  location: { origin: string };
  clients: { claim: ReturnType<typeof vi.fn> };
}

type Listeners = {
  install: ((event: unknown) => void)[];
  activate: ((event: unknown) => void)[];
  fetch: ((event: unknown) => void)[];
  message: ((event: unknown) => void)[];
};

interface WorkerEnvironment {
  self: FakeSelf;
  caches: FakeCaches;
  clients: { claim: ReturnType<typeof vi.fn> };
  fetch: ReturnType<typeof vi.fn>;
  listeners: Listeners;
}

function loadWorker(): WorkerEnvironment {
  const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');
  const source = template
    .replaceAll('__VERSION__', VERSION)
    .replaceAll('__PRECACHE__', JSON.stringify(PRECACHE));

  const listeners: Listeners = { install: [], activate: [], fetch: [], message: [] };
  const clients = { claim: vi.fn().mockResolvedValue(undefined) };
  const fetch = vi.fn().mockResolvedValue({ source: 'network' });

  const self: FakeSelf = {
    addEventListener(type, handler) {
      listeners[type as keyof Listeners].push(handler);
    },
    skipWaiting: vi.fn(),
    location: { origin: 'https://example.com' },
    clients,
  };

  const caches: FakeCaches = {
    stores: new Map<string, FakeCache>(),
    deleted: [],
    matchCalls: [],
    async open(name) {
      if (!this.stores.has(name)) {
        this.stores.set(name, {
          store: new Map<string, unknown>(),
          async addAll(urls) {
            for (const url of urls) this.store.set(url, { cached: url });
          },
          async match(request, options) {
            const key = typeof request === 'string' ? request : request.url;
            const entry = this.store.get(key);
            if (!entry) return null;
            if (options?.ignoreVary) return (entry as VaryEntry).response ?? entry;
            if ((entry as VaryEntry).vary === 'origin') {
              const requestOrigin = typeof request === 'string' ? undefined : request.headers?.origin;
              return (entry as VaryEntry).origin === requestOrigin ? (entry as VaryEntry).response : null;
            }
            return entry;
          },
        });
      }
      const cache = this.stores.get(name);
      if (!cache) throw new Error(`Cache ${name} not found`);
      return cache;
    },
    async keys() {
      return [...this.stores.keys()];
    },
    async delete(name) {
      this.deleted.push(name);
      return this.stores.delete(name);
    },
    async match(request, options) {
      this.matchCalls.push({ request, options });
      for (const cache of this.stores.values()) {
        const response = await cache.match(request, options);
        if (response) return response;
      }
      return null;
    },
  };

  runInNewContext(source, { self, caches, clients, fetch, URL, console });

  return { self, caches, clients, fetch, listeners };
}

function installEvent() {
  const event = { waitUntil: vi.fn((promise: Promise<unknown>) => promise) };
  return event;
}

function activateEvent() {
  const event = { waitUntil: vi.fn((promise: Promise<unknown>) => promise) };
  return event;
}

function fetchEvent(request: {
  url: string;
  method?: string;
  mode?: string;
  headers?: { origin?: string };
}) {
  const event = {
    request,
    respondWith: vi.fn((promise: Promise<unknown>) => promise),
  };
  return event;
}

function messageEvent(data: unknown) {
  return { data };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('service worker', () => {
  it('installs and precaches every emitted asset', async () => {
    const { listeners, caches } = loadWorker();
    const event = installEvent();
    listeners.install[0]?.(event);
    await event.waitUntil.mock.calls[0]?.[0];

    const cache = caches.stores.get(`ff-${VERSION}`);
    expect(cache).toBeDefined();
    expect([...(cache?.store.keys() ?? [])]).toEqual(PRECACHE);
  });

  it('activate deletes old ff-* caches and leaves foreign caches untouched', async () => {
    const { listeners, caches, clients } = loadWorker();
    caches.stores.set('ff-old', {
      store: new Map(),
      addAll: async () => undefined,
      match: async () => null,
    });
    caches.stores.set(`ff-${VERSION}`, {
      store: new Map(),
      addAll: async () => undefined,
      match: async () => null,
    });
    caches.stores.set('other-cache', {
      store: new Map(),
      addAll: async () => undefined,
      match: async () => null,
    });

    const event = activateEvent();
    listeners.activate[0]?.(event);
    await event.waitUntil.mock.calls[0]?.[0];

    expect(caches.deleted).toEqual(['ff-old']);
    expect(caches.stores.has(`ff-${VERSION}`)).toBe(true);
    expect(caches.stores.has('other-cache')).toBe(true);
    expect(clients.claim).toHaveBeenCalledTimes(1);
  });

  it('serves a cached asset when offline', async () => {
    const { listeners, caches } = loadWorker();
    const cached = { body: 'cached-app' };
    const cache = await caches.open(`ff-${VERSION}`);
    cache.store.set('https://example.com/assets/index-abc.js', cached);

    const event = fetchEvent({ url: 'https://example.com/assets/index-abc.js', method: 'GET' });
    listeners.fetch[0]?.(event);
    const response = await event.respondWith.mock.calls[0]?.[0];

    expect(response).toBe(cached);
  });

  it('returns the cached shell for navigation requests', async () => {
    const { listeners, caches } = loadWorker();
    const shell = { body: 'index-html' };
    caches.stores.set(`ff-${VERSION}`, {
      store: new Map([['index.html', shell]]),
      addAll: async () => undefined,
      match: async (request) => {
        const key = typeof request === 'string' ? request : request.url;
        const cache = caches.stores.get(`ff-${VERSION}`);
        return cache?.store.get(key) ?? null;
      },
    });

    const event = fetchEvent({ url: 'https://example.com/familiar', method: 'GET', mode: 'navigate' });
    listeners.fetch[0]?.(event);
    const response = await event.respondWith.mock.calls[0]?.[0];

    expect(response).toBe(shell);
  });

  it('matches cached assets with ignoreVary so CORS-mode requests work offline', async () => {
    const { listeners, caches } = loadWorker();
    const cached = { body: 'cached-app' };
    const cache = await caches.open(`ff-${VERSION}`);
    cache.store.set('https://example.com/assets/index-abc.js', cached);

    const event = fetchEvent({
      url: 'https://example.com/assets/index-abc.js',
      method: 'GET',
      headers: { origin: 'https://example.com' },
    });
    listeners.fetch[0]?.(event);
    await event.respondWith.mock.calls[0]?.[0];

    const cacheMatch = caches.matchCalls.find((call) =>
      typeof call.request === 'object' &&
      call.request !== null &&
      'url' in call.request &&
      (call.request as { url: string }).url === event.request.url,
    );
    expect(cacheMatch?.options).toEqual({ ignoreVary: true });
  });

  it('serves a Vary:Origin precached asset despite a different Origin header', async () => {
    const { listeners, caches } = loadWorker();
    const cached = { body: 'cached-module' };
    const cache = await caches.open(`ff-${VERSION}`);
    cache.store.set('https://example.com/assets/index-abc.js', {
      response: cached,
      vary: 'origin',
      origin: 'https://example.com',
    });

    const event = fetchEvent({
      url: 'https://example.com/assets/index-abc.js',
      method: 'GET',
      headers: { origin: 'https://other.example.com' },
    });
    listeners.fetch[0]?.(event);
    const response = await event.respondWith.mock.calls[0]?.[0];

    expect(response).toBe(cached);
  });

  it('matches the cached shell with ignoreVary for navigation requests', async () => {
    const { listeners, caches } = loadWorker();
    const shell = { body: 'index-html' };
    const cache = await caches.open(`ff-${VERSION}`);
    cache.store.set('index.html', { response: shell, vary: 'origin', origin: 'https://example.com' });

    const event = fetchEvent({
      url: 'https://example.com/familiar',
      method: 'GET',
      mode: 'navigate',
      headers: { origin: 'https://example.com' },
    });
    listeners.fetch[0]?.(event);
    const response = await event.respondWith.mock.calls[0]?.[0];

    expect(response).toBe(shell);
    const cacheMatch = caches.matchCalls.find((call) => call.request === 'index.html');
    expect(cacheMatch?.options).toEqual({ ignoreVary: true });
  });

  it('does not intercept non-GET requests', () => {
    const { listeners } = loadWorker();
    const event = fetchEvent({ url: 'https://example.com/api', method: 'POST' });
    listeners.fetch[0]?.(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('does not intercept cross-origin requests', () => {
    const { listeners } = loadWorker();
    const event = fetchEvent({ url: 'https://other-origin.com/app.js', method: 'GET' });
    listeners.fetch[0]?.(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('skips waiting on SKIP_WAITING message', () => {
    const { self, listeners } = loadWorker();
    listeners.message[0]?.(messageEvent({ type: 'SKIP_WAITING' }));
    expect(self.skipWaiting).toHaveBeenCalledTimes(1);
  });
});
