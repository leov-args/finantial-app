import { type App, createApp } from '../app/container.ts';
import { type IdGenerator, sequentialIdGenerator } from '../application/ports/system.ts';
import { type Clock, fixedClock } from '../domain/shared/dates.ts';

/** A fresh app on its own in-memory IndexedDB database (fake-indexeddb). */
export function makeTestApp(options: { clock?: Clock; dbName?: string; newId?: IdGenerator } = {}): App {
  return createApp({
    dbName: options.dbName ?? `test-${crypto.randomUUID()}`,
    clock: options.clock ?? fixedClock('2026-10-02T10:00:00.000Z'),
    newId: options.newId ?? sequentialIdGenerator(`id${Math.random().toString(36).slice(2, 8)}`),
  });
}
