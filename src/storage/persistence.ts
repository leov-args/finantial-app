/**
 * Browser storage concerns that are not "the database": persistence
 * guarantees and quota. (Phase 5 adds receipt blob handling here.)
 *
 * Without persistent storage, browsers (notably Safari) may evict IndexedDB
 * under storage pressure or after inactivity. For an app whose only copy of
 * the data lives in the browser, asking for persistence is essential.
 */
export type PersistenceStatus = 'persisted' | 'best-effort' | 'unsupported';

export async function requestPersistentStorage(storage: StorageManager | undefined = globalThis.navigator?.storage): Promise<PersistenceStatus> {
  if (!storage?.persist || !storage.persisted) return 'unsupported';
  try {
    if (await storage.persisted()) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}

export interface StorageUsage {
  readonly usageBytes: number;
  readonly quotaBytes: number;
}

export async function getStorageUsage(storage: StorageManager | undefined = globalThis.navigator?.storage): Promise<StorageUsage | null> {
  if (!storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await storage.estimate();
  return { usageBytes: usage, quotaBytes: quota };
}
