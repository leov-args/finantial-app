# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Family Finance: a **local-first** family finance assistant (React + Vite + TypeScript). No server, accounts, cloud or sync — IndexedDB (via Dexie) in the browser is the only source of truth. **The first version is closed (2026-10-04)**: Phase 1 (CRUD for members, categories, expenses and incomes) plus the redesign that replaced its screens — Personal (monthly savings, expenses, charts), Familiar (fair household split of the plan), Ajustes, the capture bar (fixed-phrase assistant) and the first-use setup.

**Work is spec-driven with approval gates.** The redesign's record is `docs/spec-rediseno.md` (*Estado del proceso*, decisions, and a *Cierre* section with informational follow-ups: final code review notes, design deviations, sheet drag untested on a real phone); confirmed intent is in `docs/intent/rediseno.md`. New work comes from the spec's *Backlog*, the *Cierre* notes or the roadmap in `README.md`, each with its own spec/tasks, on a new branch from `main`; take no step without the user's explicit "yes" and record decisions as they are made. The visual system is `DESIGN.md` (generated from the built UI; `docs/design/maqueta-apple.html` was the reference mock). Design docs live in `docs/` (in Spanish) and `docs/decisions.md` holds the ADRs plus the open questions.

## Commands

Requires Node ≥ 22.

```bash
npm run dev          # Vite dev server, http://localhost:5173
npm run typecheck    # tsc -b --noEmit (strict)
npm run lint         # ESLint, --max-warnings=0, includes layer-boundary rules
npm test             # Vitest, all unit + integration tests
npm run check        # typecheck → lint → test → build (run before finishing work)
npx vitest run src/domain/money/money.test.ts   # single file
npx vitest run -t "allocate"                     # tests matching a name
```

Tests run in Node (`environment: 'node'`); `src/test/setup.ts` loads `fake-indexeddb/auto`, so Dexie code is tested against real IndexedDB semantics. Use `makeTestApp()` (`src/test/test-app.ts`) for integration tests: fresh in-memory DB, fixed clock (`2026-10-02T10:00Z`), sequential ids. Fixtures are in `src/test/fixtures.ts`.

UI tests (`src/ui/*.test.tsx`) start with the docblock `// @vitest-environment jsdom` and use `renderApp({ route, seed })` from `src/test/render-app.tsx`: the real app on fake IndexedDB, no service mocks. Call `afterEach(cleanupApps)` (vitest globals are off, so RTL doesn't auto-clean). Query by role/label; `format()` and `percent()` output contains U+00A0 spaces, so compare against those helpers rather than literals.

## Architecture

```text
ui (React) → app (composition root) → application (use cases, Zod)
                                        → domain (pure TS)
                                        → ports ← infrastructure (Dexie) → IndexedDB
agent / ocr → application (never the DB)
```

**Layer rules are enforced by ESLint `no-restricted-imports`** in `eslint.config.js` — a lint failure on an import means you crossed a boundary; fix the design, don't disable the rule:
- `domain/`: pure TypeScript. No React, Dexie, **or Zod**, no other layers.
- `application/`: depends on `domain`, Zod and the ports in `application/ports/`. No Dexie/React/infrastructure.
- `agent/`, `ocr/`: only `domain` + `application`. `agent/` has the pure fixed-phrase parser (`parser.ts`, grammar per language in `agent/grammar/`) used by the capture bar; `ocr/` is only `contracts.ts` until Phase 6.
- `infrastructure/`, `storage/`: no UI/app.
- `ui/`: never imports Dexie or `infrastructure`; gets `AppServices` through `useServices()` (`ui/services-context.tsx`). `dangerouslySetInnerHTML` is banned — all user/OCR text is rendered as plain text.
- `app/container.ts` (`createApp`) is the only place wiring concrete Dexie repositories into services via an `AppContext` (repos, `tx`, `clock`, `newId`). `AppServices` also exposes `clock`, so the UI gets "today" deterministically.

### UI (`src/ui/`, flat)
- Routing is the URL hash (`#/familiar`) via `useSyncExternalStore` in `AppShell.tsx`; no router or state library. The selected month lives in `AppShell` and is passed to Personal. With no members at all, `AppShell` shows the first-use setup (`Onboarding.tsx`) instead of the views.
- Views load with `useData(load)` (`common.tsx`) where `load` is a `useCallback`; mutations call `reload()`. Forms are uncontrolled and read `FormData`; money is typed as text and parsed with `parseMoney` (never floats).
- Errors go through `toErrors(e)` (`errors.ts`): field-keyed messages translated by code, plus `FORM` for a general one; `<Field name errors>` shows them.
- Deletes of expenses/incomes go through `useDeleteWithUndo` (`common.tsx`): `UndoNotice` calls `restore(snapshot)`, and failures are shown, never swallowed. A blank description sent to `ExpenseService.update` is re-derived from merchant/category; the edit form leaves derived descriptions blank. Members/categories share `NameListView.tsx`.
- No inline `style` attributes (production CSP); styles live in `ui/styles.css` with color tokens on `:root`. The visual system is documented in `DESIGN.md`.
- Sheets (`PlanItemSheet`, `PersonalExpenseSheet`) are native `<dialog>`s driven by `useSheet` (`common.tsx`): springs from `motion/mini` (only that entry point fits the bundle budget, ADR-019), enter/exit through the same edge, drag-to-dismiss on mobile. Close through `sheet.close(after)` so the exit plays before the owner unmounts it. In jsdom there is no WAAPI, so sheets open and close instantly in tests.
- All UI text goes through `t()` (`ui/i18n/es-ES.ts` is the source catalog); no hard-coded strings in `src/ui`.

### Write path of a use case (e.g. `ExpenseService.create`)
1. `parseInput(zodSchema, input)` → typed command, or `ApplicationError('VALIDATION')` with per-field `issues`.
2. `ctx.tx.run(...)` — a Dexie `rw` transaction over **all tables**. IndexedDB has no foreign keys, so reference checks (`requireCategory`, `requireMember` in `application/shared/guards.ts`) happen inside this transaction.
3. Domain builder (`buildExpense`, `updateExpense`…) enforces invariants (throws `DomainError` with a stable code).
4. Repository `save` → mapper → flat record → IndexedDB.

Reads go record → mapper → domain constructor again, so corrupt rows fail loudly instead of producing wrong numbers.

### Conventions that span files
- **Money** is `{ amountMinor: safe integer, currency }`; never floats. Rounding uses `BigInt` with an explicit mode; splits use `allocate()` (largest remainder, parts always sum to the total). Basis-point percentages are display-only. Mixing currencies throws `CURRENCY_MISMATCH`.
- **Dates**: business dates are local `IsoDate` `"YYYY-MM-DD"` (lexicographic = chronological, range queries via the `date` index); `createdAt`/`updatedAt` are ISO UTC `Timestamp`s. Time comes from an injected `Clock`, ids from an injected `IdGenerator` — never call `new Date()`/`crypto.randomUUID()` directly in domain/application code.
- **Branded ids** (`MemberId`, `CategoryId`…) — convert with `asXxxId()`.
- Domain objects are immutable (`Object.freeze`).
- **Undo via snapshots**: `create` returns the entity, `update` returns `{ previous, current }`, `delete` returns the deleted entity, and `restore(snapshot)` writes it back (accepting archived/inactive references).
- **Deactivate/archive instead of delete**: members with history are deactivated, categories with expenses archived; delete only when unreferenced (`REFERENCE_IN_USE`).
- `Expense.scope` (whose expense: `SHARED` | `INDIVIDUAL` + `ownerId`) is independent of `paidBy` (who paid). Shared household costs live in the family plan (`PlanItem`, redesign), not as transactions; transfers/`Settlement` are deferred (ADR-011). `recurrence` is metadata only — nothing auto-generates future expenses.
- Records (`infrastructure/database/records.ts`) are flat and JSON-compatible: `null` instead of `undefined`, discriminated unions flattened when a field must be indexed (e.g. `scopeType` + `ownerId`). Backups (Phase 8) will use the record format.
- UI and agent translate errors **by code**, never by message text: `DomainError.code`, and for `ApplicationError` a typed `reason` + `params` mapped exhaustively in `ui/errors.ts` (`REASON`); every new throw needs a reason and a `t()` key. UI text is Spanish; service messages (Spanish) and `DomainError` messages (English) are developer fallbacks only.
- Imports use explicit `.ts`/`.tsx` extensions and `import type` (`verbatimModuleSyntax`, `consistent-type-imports`). TS config is very strict (`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, etc.).

### Database migrations (`infrastructure/database/migrations.ts`)
- Never edit or delete a shipped version; append a new one listing the **full** store/index definition for every table.
- Data reshaping goes in `upgrade` (runs in the versionchange transaction, aborts atomically).
- Every new version needs a migration test starting from a DB populated at the previous version.
- Seed data (14 categories with stable ids like `cat-food`) is created only in Dexie's `populate`, never in upgrades.

## Constraints
- Privacy: no analytics, telemetry or network-calling dependencies. Production builds inject a strict CSP (`connect-src 'self'`, no `unsafe-inline`) from `vite.config.ts`; relaxing it requires an entry in `docs/decisions.md`. No source maps in production.
- JS bundle budget: 160 kB gzip, enforced by a Vite plugin so `npm run build`/`check` fail over it (ADR-020); raising it needs an ADR edit.
- Dependencies are deliberately minimal (ADR-014); new libraries are deferred until the phase that needs them. The one animation library allowed (ADR-019) is `motion`, used only through `motion/mini` + `spring`. TypeScript is pinned to `~6.0` because `typescript-eslint` 8 doesn't support 7 (ADR-013).
- Agent (Phase 4/7) must work without an LLM, never invent figures (all numbers come from tool results), and never touch IndexedDB. OCR must never create an expense without explicit user confirmation.
- Don't create empty folders for future phases; add subfolders when there's code to put in them.
