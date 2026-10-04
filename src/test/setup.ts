// Gives Node a spec-compliant in-memory IndexedDB so Dexie repositories are
// tested against real IndexedDB semantics (transactions, indexes, versions).
import 'fake-indexeddb/auto';
