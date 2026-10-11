# Backup: tombstones in the file and restore-by-replacing (E1-3)

**Status:** approved (2026-10-12). Branch `e1-3-backup`, from `main` after E1-2 is merged.

## Problem

The household file (`docs/backup.md`) already round-trips through "Send changes" (E2-3) and "Join a household" (E2-2), but:

1. It does not carry tombstones (E1-2), so a restored or received file loses the knowledge of what was deleted, and E2-4 could not apply deletions.
2. Restoring is only possible on an empty database (first use). A user whose device has data and who has a backup file has no way to go back to it.

## Decisions (2026-10-12, with the user)

- E1-3 covers both: tombstones in the file **and** "restore, replacing" from Ajustes.
- "Replace" means the whole local database is replaced by the file; there is no merge (that is E2-4).
- The file produced by "Send changes" is the backup; no second export button.

## Behavior

### File format
- `data.tombstones`: array of `{ table, id, deletedAt }` records, exported from the `tombstones` table.
- `formatVersion` stays `1` (additive change); `dbVersion` is `3` (already bumped by E1-2). Files with `dbVersion` < 3 stay importable and count as having no tombstones; a `dbVersion` 3 file **must** contain the `tombstones` key (like the other tables).
- Validation on read: `table` is one of the five tombstone tables; `deletedAt` is a valid ISO UTC timestamp; `(table,id)` unique; **a tombstone must not coexist with a live record of the same table and id** (an id is never both live and deleted) -> `INVALID_FILE`.
- The summary shown to the user is unchanged.

### Restore, replacing (Ajustes)
- New section in Ajustes, "Copia de seguridad": a file picker (`.json`, 20 MB limit, same checks as join) and, once a file is valid, the same summary as the join preview (members, counts, date range) plus a clear warning that **all data on this device will be replaced**, and a suggestion to send the current data first.
- Two explicit actions: a destructive "Replace my data" and "Cancel". Cancel or an invalid file writes nothing.
- Confirm runs one `rw` transaction over all tables: clear everything (including seeded categories, snapshots and tombstones) and write the file. Any failure rolls everything back.
- After restoring: reload the data. The device's "who am I" (`localStorage`) is kept if that member id is still an active member in the restored data, otherwise cleared (the existing "Who am I" select in Ajustes then asks).
- Join (first use) stays strict: still rejects a non-empty database with `HOUSEHOLD_NOT_EMPTY`.

## Design

- **Infrastructure:** `household-file.ts` schema/validation/serialize gain tombstones; `DexieHouseholdArchive.export` reads the table; `replaceAll` writes it. Split the current `replaceAll` into the emptiness check (join only) and the shared clear-and-write, e.g. `replaceAll(parsed, { requireEmpty })` or a second port method `restore`. Keep the port opaque (`ParsedHousehold`).
- **Application:** `HouseholdService.restore(parsed)` next to `join`, same error mapping. No new `ApplicationError` reasons are needed (invalid/newer file reuse the existing ones).
- **UI:** new `BackupSection` (own file) used from `SettingsView`; reuse the preview markup/classes of `JoinHousehold` (extract a small shared component if that is cheaper than duplicating). Follow `DESIGN.md` and existing tokens; destructive action styled like other destructive buttons in the app; no inline `style`; all text via `t()` (Spanish). Sheets use `useSheet` if a confirmation sheet is used; an inline confirm panel is acceptable if it matches the join flow.
- **Docs:** update `docs/backup.md` (format with tombstones, restore flow); keep it English for new text.

## Acceptance criteria

1. Export -> import round trip is exact including tombstones; tombstones created by deleting records appear in the exported file.
2. A v2 file (no `tombstones`, `dbVersion` 2) still imports, leaving the table empty; a v3 file without the key is invalid.
3. Invalid tombstones (unknown table, bad `deletedAt`, duplicate `(table,id)`, tombstone for a live id) are rejected as `INVALID_FILE` with nothing written.
4. Restore on a database with data replaces everything (data, snapshots, categories, tombstones) and leaves only the file's content; a failure in the middle rolls back to the previous data.
5. Join on a non-empty database is still rejected.
6. UI: Ajustes shows the section; picking a valid file shows the summary and the replace warning; Cancel and invalid files write nothing; confirming replaces the data and the screens show the restored data; "who am I" is kept only if still valid.
7. `npm run check` passes; bundle <= 200 kB; CSP untouched; no new strings outside `t()`.

## Out of scope

Merging files (E2-4), automatic/scheduled backups, receipts, ZIP, checksums, encryption, a separate "export backup" button, garbage-collecting tombstones.
