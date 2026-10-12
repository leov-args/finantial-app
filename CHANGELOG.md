# Changelog

All notable changes to Family Finance are listed here, newest first. Roadmap ids (E0-1, E2-4…) point to `docs/roadmap.md`. Add an entry in the same change that closes a roadmap step or fixes a bug.

## Unreleased

### Added
- **Receive changes** (E2-4): Ajustes can merge a household file received from another device. The newest `updatedAt` wins per record, deletions are applied, the preview shows «N nuevos, M actualizados, K borrados» before anything is written, and applying is one atomic transaction. Merging is idempotent and convergent (A←B and B←A leave both devices identical). A file from an unrelated household is rejected and points to restore.
- **Backup and restore** (E1-3): the household file carries tombstones, and Ajustes can restore a backup by replacing all data on the device after an explicit confirmation.
- **Tombstones** (E1-2): every deletion is recorded in the same transaction as the delete, and undo removes it.
- **Send changes** (E2-3): Ajustes shares the household file with the Web Share API, or downloads it when sharing is unavailable.
- **Join a household** (E2-2): on first use, open a household file instead of starting empty, then pick who you are.
- **Month snapshots** (E1-1): past months keep their family split even if the plan changes later.
- **Info popups** (E0-1, E0-2): the household split rule in Ajustes and the accepted phrases in the capture bar are explained in a sheet.

### Changed
- Ajustes groups «Enviar cambios» and «Recibir cambios» under «Sincronizar con tu pareja»; «Copia de seguridad» stays separate and its action is named by its effect (E2-4).
- Database schema is at version 4: tombstones table (v3) and `updatedAt` on household settings (v4). Older household files remain importable.
- Sheets cap the release velocity when dragged, fields are filled, and member ink is readable in dark mode (E0-4, E0-5).
- Accessibility: rows announce date, category and assigned shares, and the chevron honours reduced motion (E0-3).

### Fixed
- Familiar shows what each member really keeps (2026-10-05).

## 0.1.0 — 2026-10-04

First version: members, categories, expenses and incomes; Personal (monthly savings, expenses, charts); Familiar (fair household split of the plan); Ajustes; the fixed-phrase capture bar; first-use setup. Local-first on IndexedDB, published on GitHub Pages.
