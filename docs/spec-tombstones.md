# Tombstones (E1-2)

**Status:** approved (2026-10-12). Branch `e1-2-tombstones`, from `main` after E2-3 is merged.

## Problem

Deleting a record removes its row, so a file exported later cannot say "this was deleted". E2-4 (merge) could not tell "deleted on A" from "never seen by A" and would resurrect deleted records. E1-2 records every hard delete as a tombstone so the merge can apply it.

## Behavior

- Every hard delete of an expense, income, member, category or plan item also writes a tombstone `{ table, id, deletedAt }`, in **the same transaction** as the delete.
- Undo (`restore(snapshot)`) removes the tombstone of that record. Creating or updating a record with a tombstoned id also removes it (an id is never both live and deleted).
- Nothing reads tombstones yet: current queries, screens and the export format do not change (the export includes them in E1-3; the merge uses them in E2-4).
- Month snapshots are never deleted individually: no tombstone for them.
- Importing a household (`replaceAll`, E2-2) clears the tombstones table together with the data.

## Design

- **Migration v3** (append-only, full store list): new store `tombstones: '[table+id], deletedAt'`; no data to reshape. `CURRENT_DB_VERSION` becomes 3. `dbVersion` written to files becomes 3 (older files stay importable; a v2 file has no tombstones).
- **Domain:** `Tombstone { table: TombstoneTable; id: string; deletedAt: Timestamp }` and `TombstoneTable = 'members' | 'categories' | 'incomes' | 'expenses' | 'planItems'`, a pure type next to the other shared domain types.
- **Port** `TombstoneRepository` in `application/ports/repositories.ts`: `mark(table, id, deletedAt)` (upsert) and `clear(table, id)`; exposed on `AppContext` as `tombstones`. Dexie implementation and record in `infrastructure`; `deletedAt` comes from `ctx.clock`.
- **Services:** `delete` calls `tombstones.mark` after the repository delete; `restore` and `save` paths (create/update/restore) call `tombstones.clear`. A tiny helper in `application/shared/` avoids repeating it. Everything stays inside the existing `ctx.tx.run`, which already spans **all tables** (add the new table to `dataTables`-driven transaction scope, and to the `replaceAll` clear).
- No UI changes.

## Acceptance criteria

1. Deleting each of the five entity kinds leaves exactly one tombstone with the injected clock's time.
2. A failed delete (e.g. `REFERENCE_IN_USE`, not found) leaves no tombstone; a failure after the delete rolls both back.
3. `restore` after a delete removes the tombstone; creating or updating a record clears a stale tombstone with that id.
4. Migration test: a DB populated at v2 opens at v3 with data intact and an empty `tombstones` table.
5. Household join clears tombstones; export format and all existing tests unchanged apart from the version number.
6. `npm run check` passes; bundle <= 200 kB; CSP untouched.

## Out of scope

Exporting tombstones (E1-3), applying them on merge (E2-4), garbage-collecting old tombstones (revisit with E2-4: they must outlive the slowest device's next sync), UI.
