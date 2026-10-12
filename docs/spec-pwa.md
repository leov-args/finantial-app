# Installable, offline PWA (E2-1)

**Status:** approved (2026-10-12). Branch `e2-1-pwa`, from `main`. Tier: standard (`opencode-go/kimi-k2.7-code`).

## Problem

The app is local-first but needs the network to start: a cold open in airplane mode fails, and it cannot be installed. E2-1 makes it installable and fully usable offline after the first load, with no dependency (ADR-014) and no CSP change (`worker-src 'self'` and `connect-src 'self'` already allow it).

## Behavior

- **Manifest** `manifest.webmanifest`: name «Family Finance», `display: standalone`, relative `start_url: "./"` and `scope: "./"` (works under `/<repo>/`, ADR-021), theme/background colours taken from `:root` tokens, icons 192 and 512 (`any`), one 512 `maskable`. `index.html` links it and an apple-touch-icon (180 px) with relative hrefs.
- **Service worker** hand-written plain JS, emitted at the site root as `sw.js` by a small Vite plugin (build only). The plugin lists every emitted file (JS, CSS, HTML, manifest, icons, favicon) except `sw.js` itself and injects the list plus a build version (hash of those files' names and contents) into the worker.
  - `install`: precache the whole list in cache `ff-<version>`; **do not** `skipWaiting` on its own.
  - `activate`: delete every other cache whose name starts with `ff-`, then `clients.claim()`.
  - `fetch`: only same-origin `GET`. Navigation requests: cache-first on the cached `index.html`. Other requests: cache-first, falling back to the network. Never cache anything outside the precache list, never touch cross-origin requests.
  - `message {type: 'SKIP_WAITING'}` calls `skipWaiting()`.
- **Registration** (`src/pwa/`): register `./sw.js` only when `import.meta.env.PROD` and `'serviceWorker' in navigator`; any failure is swallowed (the app works without it). When a worker is installed while another controls the page, a waiting worker exists: expose it through a tiny subscribe/`useSyncExternalStore` store. `applyUpdate()` posts `SKIP_WAITING` and the page reloads once on `controllerchange`.
- **Update notice** in `AppShell`: a `role="status"` bar like the undo notice, text via `t()`, with an «Actualizar» button that calls `applyUpdate()`. Hidden when there is nothing waiting. Reuses existing tokens and the undo-notice styling pattern; no inline `style`, honours `prefers-reduced-motion`, safe-area aware, dark mode included.
- **Dev and tests:** nothing registers in dev or jsdom.

## Acceptance criteria

| ID | Criterion | Verification | Result | Evidence |
|---|---|---|---|---|
| AC-01 | Built `manifest.webmanifest` is valid and linked from `index.html` (relative `start_url`/`scope`, standalone, 192/512/maskable icons exist as files, apple-touch-icon linked) | automated test over `dist/` or the plugin output | PASS | `src/pwa/manifest.test.ts`; `dist/` has manifest, 3 icons, apple-touch-icon; `index.html` links both |
| AC-02 | `sw.js` precaches every built asset and serves it (and the app shell for navigations) from cache with the network gone | automated test of the worker logic with a fake `self`/cache | PASS | `src/pwa/sw.test.ts` (precache, cache-first, navigation shell); browser: app boots offline from cache with the server stopped |
| AC-03 | Cache name changes with the build; old `ff-*` caches are deleted on activate; foreign caches are untouched | automated | PASS | `src/pwa/sw.test.ts` (activate deletes only old `ff-*`); cache `ff-<hash>` seen in the browser |
| AC-04 | A waiting worker shows the notice; «Actualizar» sends `SKIP_WAITING` and reloads once on `controllerchange`; the install itself never skips waiting | automated (store and component with a fake registration) | PASS | `src/pwa/registration.test.ts`, `src/ui/update-notice.test.tsx`; browser: notice shown, «Actualizar» activated the new worker and reloaded once |
| AC-05 | No registration in dev/jsdom or without `serviceWorker` support; registration errors are swallowed | automated | PASS | `src/pwa/registration.test.ts` (no-op outside prod / without support, errors swallowed, no reload on first install) |
| AC-06 | CSP unchanged, JS bundle ≤ 200 kB gzip, `npm run check` green, layer lint clean | `npm run check` | PASS | `npm run check`: 426 tests, JS 165.14 / 200 kB gzip, lint and typecheck clean, CSP constant untouched |
| AC-07 | After the first load on GitHub Pages the app opens and works in airplane mode on Android and iOS; install prompt / Add to Home Screen works | manual (real phones) | NOT RUN | Manual on real Android/iOS over GitHub Pages; pending the user |
| AC-08 | Update notice follows `DESIGN.md` (tokens, dark mode, `t()` strings, no inline style) and works in the browser preview, console clean | manual review + preview | PASS | Browser preview in dark mode: inverted label, tokens only, no inline style, console clean online; `t()` strings |

## Design notes

- Build plugin lives in `vite.config.ts` next to the CSP and budget plugins; the worker template is a plain file (e.g. `src/pwa/sw.template.js`) with placeholders for the file list and version, so it can be unit-tested by evaluating it against a fake `self`. The worker is an emitted asset, not a chunk, so the JS budget does not count it (verify on build).
- Icons: PNGs generated once from the favicon artwork (Pillow is available locally) and committed under `public/icons/`; no build-time image dependency.
- A cache-first shell means a deployed fix reaches a user only after the new worker installs and they accept the notice (or close all tabs). Accepted: the notice is the mitigation.
- ADR: record the strategy (hand-written worker, precache + cache-first, user-confirmed update) in `docs/decisions.md`.

## Out of scope

Background sync, push, runtime caching of anything not built, auto-applying updates without consent, offline-fallback pages beyond the cached shell.
