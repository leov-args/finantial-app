# Receive and merge a household file (E2-4)

**Status:** approved (2026-10-12), tier complex, model `opencode-go/gpt-6-luna`; merge rules 2, 3 and 5 accepted as written. Branch `e2-4-merge`, from `main`.

## Problem

Two phones of the same household edit independently and exchange the file produced by "Send changes" (E2-3). Today the only way to apply a received file is "restore, replacing" (E1-3), which throws the local edits away. E2-4 merges the file into the local data: the newest change wins per record, deletions (tombstones, E1-2) are applied, and both devices end up identical after exchanging files.

## Merge rules

Entities with an id and a timestamp: `members`, `categories`, `incomes`, `expenses`, `planItems`. For each `(table, id)` the candidates are the local live record (`updatedAt`), the local tombstone (`deletedAt`), the incoming live record and the incoming tombstone. Timestamps are ISO UTC with milliseconds, so string comparison is chronological.

1. **Newest wins.** The candidate with the greatest timestamp wins.
2. **Ties are deterministic** (needed for convergence): a tombstone beats a live record; between two live records with equal `updatedAt`, the one with the greater canonical JSON string (keys sorted) wins; between two tombstones the greater `deletedAt` is kept (equal means identical).
3. **A live reference beats a deletion.** If a tombstone wins for a member or category that some surviving live record still references (`paidBy`, `ownerId`, `memberId`, `categoryId`, plan shares), the deletion is dropped and the newest live version of that entity (from either side) is kept, with its tombstone cleared. Only members and categories are referenced, and they reference nothing, so one pass is enough. This prevents dangling references when one device deletes an unreferenced member while the other adds an expense for it.
4. **Winning tombstones** delete the local row (if any) and are stored (so they propagate), also when neither side has the live record.
5. **Settings** (`splitRule`) gain an `updatedAt` (migration v4, existing rows get the epoch `1970-01-01T00:00:00.000Z`); newest wins, tie broken by the greater `splitRule` string. Changing the rule stamps `updatedAt` from the clock. Files with `dbVersion` < 4 import with the epoch.
6. **Month snapshots** are immutable per month: if both sides have the month, the one with the earlier `createdAt` is kept (tie: smaller canonical JSON). Otherwise the union.
7. **Unrelated household guard.** If both sides have members and share no member id, the merge is rejected (`HOUSEHOLD_UNRELATED`, nothing written); the user is pointed to "restore, replacing". Categories are ignored by this check (the seeded ones share ids on every device).
8. After applying, all references of the merged result must hold (same validation as reading a file); if not, the merge aborts with nothing written.

Known limitation (document it): the rules trust device clocks; a phone with a wrong clock can win or lose unfairly. Tombstones are never garbage-collected here.

## Behavior

- Ajustes gets a "Recibir cambios" section (own component, next to Copia de seguridad): file picker (`.json`, 20 MB, same checks as join/restore).
- A valid file shows a summary computed against the live local data before anything is written: "N nuevos, M actualizados, K borrados" (K counts only local live rows removed) and a notice when there is nothing to apply. Actions: Apply (disabled when nothing to apply) and Cancel. Cancel, invalid files and unrelated households write nothing.
- Apply recomputes the plan inside one `rw` transaction over all tables and writes it atomically; any failure rolls back everything. The summary shown is what was applied.
- **Idempotent:** merging the same file twice changes nothing (the second plan is empty and performs no writes).
- **Convergent:** after A merges B's file and B merges A's file, both databases are identical (all tables, including tombstones).
- After applying: reload the data; the device's "who am I" is kept only if that member is still an active member (same as restore).
- Join (first use) and restore keep their current behavior.

## Design

- **Format:** `dbVersion` 4; `data.settings[*].updatedAt`. Version 3 and older files stay importable (missing `updatedAt` → epoch); a version 4 file must carry it. Update `docs/backup.md`.
- **Migration v4** (append-only, full store list): settings rows get `updatedAt`; migration test from a populated v3 database.
- **Pure merge function** in `infrastructure/backup/household-merge.ts`: `(local: HouseholdFileData, incoming: HouseholdFileData) => { result, plan }` on records, no Dexie, no clock. The plan lists per-table puts and deletes, tombstone puts/clears and the summary counts.
- **Port** `HouseholdArchive`: `planMerge(parsed)` (read-only) and `merge(parsed)` (returns the applied summary). Dexie adapter loads the tables, runs the pure function, writes only the plan.
- **Application:** `HouseholdService.previewMerge(parsed)` and `merge(parsed)`, same error mapping; new failure `HOUSEHOLD_UNRELATED` with its `reason` and `t()` key.
- **UI layout (UX decision, 2026-10-12):** keep merge and restore as separate sections, grouped by task, not by file. Merging is frequent and safe; replacing is rare and destructive, so they must not share a picker. In `SettingsView`: a section «Sincronizar con tu pareja» holding the existing Send changes action and the new Receive changes (`MergeSection`); further down, «Copia de seguridad» with only restore, its action named by effect («Restaurar copia (reemplaza todo)»). Cross hints: restore preview says to use Receive changes to combine with local data; the unrelated-household rejection says to use restore to replace local data.
- **UI:** `MergeSection.tsx` used from `SettingsView`, built from existing tokens and the BackupSection/HouseholdPreview patterns (`DESIGN.md`); inline panel, not a new pattern; no inline `style`; all text via `t()` (Spanish).

## Acceptance criteria

1. Newest-wins per table: a newer incoming record replaces the local one; an older one is ignored; equal timestamps resolve deterministically in both directions.
2. A winning incoming tombstone deletes the local row and is stored; a newer local edit beats an older incoming tombstone; an incoming live record older than a local tombstone is not resurrected.
3. A tombstoned member/category still referenced by a live record is kept alive (rule 3) and no dangling reference is ever written.
4. Settings (with the v4 migration + test) and month snapshots merge as specified.
5. Idempotence: applying the same file twice leaves the database unchanged (second plan empty, no writes).
6. Convergence: with divergent edits, deletions and new records on both sides, A←B then B←A (and the reverse order) yield identical databases on both devices.
7. Unrelated household, invalid/newer file, oversized file and broken post-merge references are rejected with nothing written; a failure mid-write rolls back.
8. UI: section in Ajustes; summary with counts; nothing-to-apply notice; Cancel/invalid write nothing; Apply updates the screens; "who am I" kept only if still valid.
9. UI layout: Send and Receive changes are grouped in one section, restore stays separate below with the destructive action named by effect, and both cross hints are shown.
10. `npm run check` passes; bundle <= 200 kB; CSP untouched; no strings outside `t()`; `docs/backup.md` updated.

## Out of scope

Tombstone garbage collection, per-field merging (the whole record wins), conflict UI, last-sync status (E2-5), receipts, clock-skew correction, merging from the first-use screen (join keeps replacing an empty database).

## Closing notes (2026-10-12)

Done. Review found one required defect, fixed in one round: settings-, snapshot- and tombstone-only changes were not counted, so Apply stayed disabled; the plan now exposes `hasChanges`, which gates the notice and the button. Also fixed: the unrelated-household guard counts tombstoned member ids, stronger convergence/idempotence tests (rescue, tombstones, settings), and small UI/import nits. The reviewer's fuzz run over 1,676 random household pairs found the merge symmetric, idempotent and free of dangling references.

Informational leftovers (non-blocking):
- A corrupt local database is reported as an invalid file; a distinct reason with its own `t()` key would be clearer.
- Tombstones are never garbage-collected; they must outlive the slowest device's next sync.
- The rules trust device clocks; a phone with a wrong clock can win or lose unfairly.
- Not yet tried between two real phones.
