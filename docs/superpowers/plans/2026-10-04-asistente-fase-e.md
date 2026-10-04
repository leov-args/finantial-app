# Asistente de captura (fase E) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el parser G1 y una barra global que registra gastos personales e ingresos puntuales, pregunta categorías cuando hace falta y conserva confirmación, deshacer e historial de sesión.

**Architecture:** Un helper puro del dominio monetario comparte el catálogo de marcadores con `parseMoney`; el parser puro de `src/agent/` produce intenciones sin importar la UI. `CaptureBar` obtiene contexto desde `AppServices`, resuelve aclaraciones y ejecuta las escrituras con servicios; los servicios protegen el deshacer con comparación condicional dentro de la transacción.

**Tech Stack:** React, TypeScript, Vitest, Dexie existente, Zod existente. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-04-asistente-fase-e-design.md`

## Global Constraints

- EUR es la única moneda; no se convierte ni se guarda una moneda extranjera como EUR.
- El dinero permanece en céntimos enteros; no usar `float`.
- El parser vive en `src/agent/`, es puro y nunca accede a IndexedDB; las escrituras pasan por `ExpenseService`/`IncomeService`.
- La UI solo usa textos de `t()`; la gramática se aloja por idioma en `src/agent/grammar/` (en esta fase solo `es-ES`).
- No añadir dependencias, LLM, red, tablas ni estilos en línea.
- «Hoy» es `toLocalIsoDate(services.clock.now())`; sin un «yo» activo y válido no se escribe.
- `cat-other` (inicialmente «Otros») permanece activa; se puede renombrar, pero no archivar ni borrar.
- Nombrar las pruebas de UI con el criterio G correspondiente; cada tarea termina con `npm run check` en verde.
- El historial de captura solo vive en memoria React durante la sesión; no usar `localStorage` ni IndexedDB para persistirlo.

## Review Focus

- **Marcadores e importes extremos:** EUR en prefijo/sufijo pegado o separado; `$`, `USD`, `S/`, `PEN`; cero, negativo, inválido y `AMOUNT_OVERFLOW` → `UNRECOGNIZED`, sin excepción escapada. Test en T1/T2.
- **Categoría ausente o desconocida:** no aproximar nombres; conservar todo el resto como comercio y mostrarlo mientras se pide categoría. Test en T2/T6.
- **Identidad «yo»:** cero miembros activos, varios sin selección y preferencia guardada que apunta a un miembro inactivo → no escribir; un cambio desde Ajustes debe llegar a la barra global sin recarga. Test en T5.
- **Deshacer obsoleto:** registro cambiado o ausente con instantánea esperada → no borrar (`CONFLICT` o `NOT_FOUND`); comparar aun con reloj de prueba fijo. Test en T3/T6/T7.
- **Última categoría activa:** archivar/borrar no puede dejar inactivo o eliminar `cat-other`; renombrarla sí. Test en T4/T5.

---

## Estructura de archivos

- `src/domain/money/money.ts`: catálogo canónico de marcadores y `currencyMarkers()` compartido por `parseMoney` y el agente.
- `src/domain/money/money.test.ts`: resultados de clasificación y regresiones de `parseMoney`.
- `src/agent/contracts.ts`: `IncomeDraft`, intent `CREATE_INCOME`, `Slot.source: 'USER_SELECTION'` y aclaraciones sin pregunta textual.
- `src/agent/grammar/es-ES.ts`: palabras clave en español, sin dependencias de UI.
- `src/agent/parser.ts`: gramática, extracción de importes/categorías y finalización pura de la aclaración de categoría.
- `src/agent/parser.test.ts`: tabla G1 y procedencia de la selección.
- `src/application/expenses/expense-service.ts`, `src/application/income/income-service.ts`: borrado condicional con instantánea opcional.
- `src/domain/category/category.ts`, `src/application/categories/category-service.ts`: ID estable y protección de `cat-other`.
- `src/app/app.integration.test.ts`: contratos reales de servicios con Dexie de prueba.
- `src/ui/CaptureBar.tsx`: captura, identidad, ayuda, aclaración, ejecución, confirmación, deshacer e historial local.
- `src/ui/AppShell.tsx`, `src/ui/common.tsx`, `src/ui/styles.css`: barra global responsive, sincronización de «yo» entre vistas y refresco de la vista activa tras cambios.
- `src/ui/i18n/es-ES.ts`: claves del asistente, sin copy fijo en el componente.
- `src/ui/capture.test.tsx`: recorrido G1–G5 con `renderApp` y servicios reales, incluida la preferencia «yo».
- `docs/agent.md`: contratos y flujo actualizados al parser G1.
- `docs/spec-rediseno.md`, `tasks/plan.md`, `tasks/todo.md`: estado y alcance alineados; marcar criterios solo al implementarlos y probarlos.

---

### Task 1: Catálogo compartido de marcadores monetarios

**Files:**
- Modify: `src/domain/money/money.ts`
- Test: `src/domain/money/money.test.ts`

**Interfaces:**
- Produces: `currencyMarkers(text: string): readonly CurrencyCode[]`; devuelve los códigos distintos encontrados en orden de aparición, o `[]` si no hay marcador.
- `parseMoney` conserva sus resultados actuales y usa el mismo catálogo para quitar marcadores.

- [x] **Step 1: Write the failing tests** en `money.test.ts`:
  - `currencyMarkers` clasifica `€`, `EUR`, `euro`, `euros` como `EUR`; `$`, `USD` como `USD`; `S/`, `PEN` como `PEN`.
  - Cada marcador se prueba antes/después de una cifra, pegado y separado (`€42`, `€ 42`, `42€`, `42 €`, `EUR42`, `EUR 42`, `42EUR`, `42 EUR`).
  - `currencyMarkers('€42 USD')` devuelve ambos códigos, sin duplicar códigos repetidos; texto sin marcador devuelve `[]`.
  - Los casos existentes de `parseMoney`, incluidos los tokens de moneda, siguen produciendo los mismos importes.
- [x] **Step 2: Run the focused test and verify failure**

  Run: `npx vitest run src/domain/money/money.test.ts`
  Expected: falla porque `currencyMarkers` aún no existe.

- [x] **Step 3: Implement the shared token source** en `money.ts`

  Define una única tabla token→`CurrencyCode`; usa esa fuente tanto para construir la eliminación de marcadores de `parseMoney` como para `currencyMarkers`. El helper devuelve códigos únicos en orden de aparición.

- [x] **Step 4: Run domain-money tests and project check**

  Run: `npx vitest run src/domain/money`
  Expected: PASS.

  Run: `npm run check`
  Expected: PASS.

- [x] **Step 5: Commit**

  ```bash
  git add src/domain/money/money.ts src/domain/money/money.test.ts
  git commit -m "feat: classify currency markers from shared catalog"
  ```

### Task 2: Contratos y parser G1

**Files:**
- Create: `src/agent/grammar/es-ES.ts`
- Create: `src/agent/parser.ts`
- Test: `src/agent/parser.test.ts`
- Modify: `src/agent/contracts.ts`, `docs/agent.md`
- Consumes: `currencyMarkers()` and `parseMoney()` from Task 1.

**Interfaces:**
- `IncomeDraft` has optional slots `amountMinor: Slot<number>`, `currency: Slot<CurrencyCode>`, `date: Slot<IsoDate>`, `memberId: Slot<string>` and `description: Slot<string>`.
- `Intent` adds `{ kind: 'CREATE_INCOME'; draft: IncomeDraft }`.
- `Slot.source` adds `'USER_SELECTION'`; `Clarification` contains `field` and optional `options`, but no `question` string.
- `parse(text: string, context: ParserContext): Promise<ParseResult>` implements `IntentParser.parse`.
- `selectExpenseCategory(intent: Extract<Intent, { kind: 'CREATE_EXPENSE' }>, categoryId: string)` returns the same expense intent with `categoryId` slot source `USER_SELECTION` and confidence `1`.

- [x] **Step 1: Write the failing G1 parser tests** in `parser.test.ts`

  Add named cases for:
  - `gasto 126` → `NEEDS_CLARIFICATION(category)`, amount `12600`, no category invented.
  - `Gasto 12,50 comida mercadona` → `COMPLETE`, amount `1250`, active `Comida` id and merchant `mercadona`.
  - `ingreso 1200 bonus` → `COMPLETE`, amount `120000`, description `bonus`, context member/date.
  - Case/accent normalization; longest exact multiword active category; explicit unknown category and whole remainder preserved as `merchant`.
  - EUR marker variants from Task 1; any USD/PEN marker, missing/invalid/zero/negative/overflow amount, and unrelated phrase → `UNRECOGNIZED`.
  - `selectExpenseCategory` sets `source: 'USER_SELECTION'` without changing amount or merchant.

- [x] **Step 2: Run parser tests and verify failure**

  Run: `npx vitest run src/agent/parser.test.ts`
  Expected: fails because parser/intent variants are not implemented.

- [x] **Step 3: Define contracts and Spanish grammar**

  Add the contract types above. `es-ES.ts` defines only `gasto` and `ingreso` command keywords; do not import from `src/ui/`.

- [x] **Step 4: Implement `parse()` and `selectExpenseCategory()`**

  Normalize case, accents and whitespace. Lex one numeric amount with optional currency marker before/after; pass only that amount text to `currencyMarkers` and `parseMoney`. Return `UNRECOGNIZED` for non-EUR markers, non-positive values, `INVALID_AMOUNT`, `AMOUNT_OVERFLOW`, missing amount or unknown command. For expenses, match active category names on a word boundary and prefer the longest exact prefix; if none match, preserve the entire tail as merchant and return category clarification. For income, preserve the full remainder as description. Populate context-derived slots with `source: 'CONTEXT'`; text-derived slots use `USER_TEXT`.

- [x] **Step 5: Update `docs/agent.md`**

  Document the implemented `CREATE_INCOME`, `USER_SELECTION`, `Clarification` without `question`, amount failure behavior, and the rule that the parser only proposes intents.

- [x] **Step 6: Run agent/money tests and project check**

  Run: `npx vitest run src/agent src/domain/money`
  Expected: PASS.

  Run: `npm run check`
  Expected: PASS.

- [x] **Step 7: Commit**

  ```bash
  git add src/agent/contracts.ts src/agent/grammar/es-ES.ts src/agent/parser.ts src/agent/parser.test.ts src/domain/money/money.ts src/domain/money/money.test.ts docs/agent.md
  git commit -m "feat: parse expense and income capture commands"
  ```

### Task 3: Borrado condicional para el deshacer

**Files:**
- Modify: `src/application/expenses/expense-service.ts`
- Modify: `src/application/income/income-service.ts`
- Test: `src/app/app.integration.test.ts`

**Interfaces:**
- `expenses.delete(rawId: string, expected?: Expense): Promise<Expense>`
- `incomes.delete(rawId: string, expected?: Income): Promise<Income>`
- Omitting `expected` preserves the existing unconditional behavior.

- [x] **Step 1: Write failing application integration tests**

  Test expense and income delete with a matching creation snapshot; edit one persisted business field using the fixed test clock and assert conditional delete returns `CONFLICT` without deleting; pass a snapshot with mismatched ID and assert `CONFLICT`; pass an expected snapshot for a missing ID and assert `NOT_FOUND`; retain the existing no-snapshot delete/restore assertions.

- [x] **Step 2: Run app tests and verify failure**

  Run: `npx vitest run src/app/app.integration.test.ts`
  Expected: fails because delete has no expected-snapshot parameter.

- [x] **Step 3: Implement guarded deletes inside the existing transaction**

  Read the current row inside `ctx.tx.run`. If absent, throw `notFound`. If `expected` is provided, require the same ID and compare every persisted field except `updatedAt` (including nested `scope`/`schedule` and amount currency/minor units); mismatch throws `ApplicationError('CONFLICT')`. Delete and return only after the comparison passes. Calls without `expected` follow the current path.

- [x] **Step 4: Run app tests and project check**

  Run: `npx vitest run src/app`
  Expected: PASS.

  Run: `npm run check`
  Expected: PASS.

- [x] **Step 5: Commit**

  ```bash
  git add src/application/expenses/expense-service.ts src/application/income/income-service.ts src/app/app.integration.test.ts
  git commit -m "fix: guard assistant undo against stale records"
  ```

### Task 4: Categoría de respaldo siempre activa

**Files:**
- Modify: `src/domain/category/category.ts`
- Modify: `src/application/categories/category-service.ts`
- Test: `src/app/app.integration.test.ts`

**Interfaces:**
- Export `FALLBACK_CATEGORY_ID` for the stable `cat-other` identifier and use it in `DEFAULT_CATEGORIES`.
- `CategoryService.rename()` remains allowed for the fallback; `setArchived({ id: FALLBACK_CATEGORY_ID, archived: true })` and `delete(FALLBACK_CATEGORY_ID)` reject with `CONFLICT`.

- [x] **Step 1: Write failing service integration tests**

  Assert `cat-other` is active in a fresh database, archiving it fails and leaves it active, deleting it fails even when unused, renaming it succeeds and it remains active. Assert another unused category still follows the existing archive/delete behavior.

- [x] **Step 2: Run app tests and verify failure**

  Run: `npx vitest run src/app/app.integration.test.ts`
  Expected: fails because the service currently permits archiving/deleting `cat-other`.

- [x] **Step 3: Implement the invariant**

  Define the stable fallback ID once in the category domain. Guard only attempts to archive/delete that ID in `CategoryService`; do not add a migration or make it unrenameable.

- [x] **Step 4: Run app tests and project check**

  Run: `npx vitest run src/app`
  Expected: PASS.

  Run: `npm run check`
  Expected: PASS.

- [x] **Step 5: Commit**

  ```bash
  git add src/domain/category/category.ts src/application/categories/category-service.ts src/app/app.integration.test.ts
  git commit -m "fix: keep fallback category active"
  ```

### Task 5: CaptureBar completa de captura

**Files:**
- Create: `src/ui/CaptureBar.tsx`
- Test: `src/ui/capture.test.tsx`
- Modify: `src/ui/AppShell.tsx`, `src/ui/common.tsx`, `src/ui/styles.css`, `src/ui/i18n/es-ES.ts`

**Interfaces:**
- `CaptureBar({ onMutation }: { onMutation: () => void })` permanece montada en todas las rutas.
- `useMe()` sincroniza cambios hechos desde cualquier instancia del hook en la misma pestaña y cambios `storage` de otras pestañas.

- [x] **Step 1: Write failing G1–G5 UI integration tests**

  En `capture.test.tsx`, usa `renderApp`, miembros/categorías sembrados y servicios reales. Nombra los tests con G1–G5 y comprueba: gasto EUR 12600 con fecha local, ámbito/owner/pagador `me`, VARIABLE y sin recurrencia; ingreso EUR 120000 con fecha local, member `me`, ONE_OFF, OTHER y descripción `bonus`; cero escrituras sin identidad válida y sincronización «Quién soy» desde Ajustes; G2 conserva y muestra `electricidad mercadona`, y marca la selección como `USER_SELECTION`; G3 confirma valores reales y undo condicional; G4 ayuda; G5 historia solo en memoria. Comprueba la barra en las tres rutas y que el texto no se guarda en IndexedDB ni `localStorage`.

- [x] **Step 2: Run the focused UI test and verify failure**

  Run: `npx vitest run src/ui/capture.test.tsx`
  Expected: falla porque la barra aún no existe.

- [x] **Step 3: Synchronize the device identity preference**

  En `common.tsx`, conserva el almacenamiento de `family-finance.me` y publica un evento local al ejecutar `setMe`; cada instancia de `useMe` escucha ese evento y `storage`, actualiza su estado y vuelve a filtrar contra miembros activos. Incluye la sincronización en el test Settings→CaptureBar.

- [x] **Step 4: Montar la barra y sus estados de shell**

  Monta `CaptureBar` en `AppShell` para las tres secciones y rutas heredadas. Carga miembros y categorías activas con `useData`, obtiene la identidad con `useMe` y la fecha con `toLocalIsoDate(clock.now())`. Sin «yo» válido, muestra enlaces localizados a Miembros o Ajustes y no intenta parsear ni escribir.

- [x] **Step 5: Implementar el flujo del parser, aclaraciones, ayuda e historial**

  Añade formulario accesible y estado ocupado. Envía el texto a `parse()`: `UNRECOGNIZED` muestra ayuda G4; `NEEDS_CLARIFICATION(category)` muestra la pregunta traducida por `field`, el comercio pendiente y botones con categorías activas; la selección llama a `selectExpenseCategory()`. Mantén transcript y estado de deshacer en React; no persistas el historial.

- [x] **Step 6: Ejecutar y confirmar los dos tipos de intención**

  Para `CREATE_EXPENSE`, llama a `expenses.create` con amount/currency/date/category/merchant del intent y los campos P5: VARIABLE, INDIVIDUAL owner/payer `me`, recurrence `null`. Para `CREATE_INCOME`, llama a `incomes.create` con los slots del intent y `ONE_OFF`/`OTHER`. Confirma usando las entidades devueltas; conserva el texto en errores.

- [x] **Step 7: Implementar undo condicional y refrescar la vista activa**

  El undo pasa la instantánea creada a `delete`, solo se ofrece una vez y marca el mensaje como no deshacible tras éxito/conflicto. El conflicto usa `t('assistant.undoConflict')`; otros errores pasan por `toErrors`. `onMutation` incrementa una revision key de `<main>` en `AppShell`, manteniendo CaptureBar/historial montados.

- [x] **Step 8: Añadir mensajes traducidos y estilos responsive**

  Añade claves tipadas `assistant.*` para input, history, help, pregunta de categoría, comercio pendiente, identidad, confirmaciones, undo y conflicto. No pongas copy fijo en JSX ni estilos en línea. En móvil (<900px), sitúa la barra fija encima de la navegación inferior, reserva espacio para ambas e incluye safe areas. En escritorio (≥900px), colócala al pie del lateral.

- [x] **Step 9: Run UI/app tests and project check**

  Run: `npx vitest run src/app src/ui`
  Expected: PASS.

  Run: `npm run check`
  Expected: PASS.

- [x] **Step 10: Commit**

  ```bash
  git add src/ui/CaptureBar.tsx src/ui/capture.test.tsx src/ui/AppShell.tsx src/ui/common.tsx src/ui/styles.css src/ui/i18n/es-ES.ts
  git commit -m "feat: connect the assistant capture bar"
  ```

## Checkpoint E (after Tasks 1–5)

- [x] `npm run check` passes.
- [x] Manual 360px mobile check: enter expense, undo it, and complete a category question; confirm no horizontal overflow or console errors.
- [x] Confirm capture appears on Personal, Familiar and Ajustes; verify 1280px desktop placement and unchanged CSP.
- [x] Stop for the user's review before marking Checkpoint E complete. (Closed 2026-10-04; review points moved to «E fix» in `tasks/todo.md`, phase F.)
