# Tareas: rediseño

> **Contexto:** estado global en `docs/spec-rediseno.md` (*Estado del proceso*) y plan en `tasks/plan.md`.
> **Reglas:**
> - Marca `[x]` cada criterio al cumplirlo y la tarea al cerrarla.
> - Cada tarea termina con `npm run check` en verde.
> - Cada criterio de la spec (A*, F*, P*, G*, X*) lleva un test que lo nombra.
> - La UI se construye según la maqueta `docs/design/maqueta-apple.html` y el *Resumen de diseño*.
> - Desde la tarea 5, **ningún texto de interfaz fijo**: todo pasa por `t()` (X7).

---

## Fase A · Base

### [x] Tarea 1: Reparto justo en el dominio
**Descripción:** `PlanItem` (FORMULA | ASSIGNED) y la función pura `contributions(participants, items, rule, currency)` de la spec (F2, F4, F5, F7 y decisiones Q1–Q3), con las dos reglas de reparto.
**Aceptación:**
- [x] F6 literal: 2.600 / 1.400, fórmula 2.100,01 → 1.650,01 / 450,00; con Portátil 300 / 50 → 1.950,01 / 500,00.
- [x] La suma de aportes es igual al total del plan en varios casos: restante impar, tres participantes, partes a 0, plan vacío.
- [x] El restante negativo se marca como déficit.
- [x] Dos reglas (`EQUAL_KEEP` por defecto, `PROPORTIONAL`); ninguna da aportes negativos (Q3 revisada).

**Verificación:** `npx vitest run src/domain/family`.
**Depende de:** nada.
**Archivos:** `src/domain/family/plan.ts`, `src/domain/family/contributions.ts` y sus `*.test.ts`.
**Tamaño:** S
**Hecho (2026-10-03):** devuelve `{ planTotal, formulaTotal, remaining, contributions }`; `remaining < 0` es el déficit. Sin participantes, `contributions: []` (F7). Una parte no nula de un miembro que no participa lanza `INVALID_PLAN_ITEM` (lo evita Q6 en la tarea 4).

### [x] Tarea 2: Esquema del rediseño y campos nuevos del miembro
**Descripción:**
- `Member.referenceIncome: Money | null` y `Member.color` (clave de la paleta A6);
- `MemberRecord` y `PlanItemRecord`, con sus mappers;
- **sin migración** (supuesto 5 de la spec): las tablas `planItems` y `settings` se añaden a la propia v1, y sin fila guardada la regla vale `EQUAL_KEEP` (A7), así que no hace falta semilla;
- antes de probar en el navegador, el usuario borra la base de datos local (DevTools → Application → Storage → *Clear site data* en `localhost:5173`).

**Aceptación:**
- [x] Una base nueva tiene las tablas nuevas y la regla `EQUAL_KEEP`.
- [x] Los mappers rechazan un color o un ingreso corruptos al leer.

**Verificación:** `npx vitest run src/infrastructure`.
**Depende de:** 1 (por el tipo `PlanItem`).
**Archivos:** `src/domain/member/member.ts`, `src/infrastructure/database/records.ts`, `mappers.ts`, `migrations.ts`, `db.ts`, `db.test.ts`.
**Tamaño:** S
**Hecho (2026-10-03):** `buildMember` valida color e ingreso (también al leer). Registros `PlanItemRecord` y `SettingsRecord`; sin fila de ajustes, la regla es `EQUAL_KEEP`.

### [x] Tarea 3: PlanService
**Descripción:**
- puerto y repositorio Dexie de `PlanItem`;
- `PlanService` con list, create, update, delete, restore y `contributions()`, que lee los miembros activos con ingreso de referencia y la regla de reparto guardada;
- leer y cambiar la regla de reparto (A7);
- conexión en el contenedor.

**Aceptación:**
- [x] Crear, editar, borrar y restaurar líneas, con validación Zod y errores por campo.
- [x] Una línea asignada exige partes de miembros que existan.
- [x] `contributions()` con los datos guardados reproduce F6, y cambiar la regla a proporcional cambia los aportes.

**Verificación:** `npx vitest run src/app`.
**Depende de:** 1, 2.
**Archivos:** `src/application/ports/repositories.ts`, `src/application/family/plan-service.ts`, `src/infrastructure/repositories/dexie-repositories.ts`, `src/application/shared/context.ts`, `src/app/container.ts`, `src/app/app.integration.test.ts`.
**Tamaño:** M

### [x] Tarea 4: MemberService con ingreso de referencia y color
**Descripción:** `setReferenceIncome`, `setColor` (sin repetir entre miembros activos), y `create` asigna el primer color libre (A2, A6). Q6: no se puede vaciar el ingreso ni desactivar a un miembro con partes asignadas no nulas.
**Aceptación:**
- [x] Cambiar el ingreso actualiza los aportes que devuelve `PlanService`.
- [x] Elegir un color ya usado devuelve `CONFLICT` con un mensaje en español.
- [x] Los miembros nuevos reciben colores libres.
- [x] Q6: vaciar el ingreso de alguien con partes asignadas devuelve un error que nombra las líneas.

**Verificación:** `npx vitest run src/app`.
**Depende de:** 2.
**Archivos:** `src/application/members/member-service.ts`, `src/app/app.integration.test.ts`.
**Tamaño:** S

### Checkpoint A
- [x] `npm run check` en verde (179 tests, 2026-10-03).
- [x] Con la base local borrada, la app abre sin errores (prueba manual con `npm run dev` en el navegador integrado: tablas `planItems` y `settings`, consola limpia). Falta que el usuario borre su base en su navegador.
- [ ] Revisión con el usuario antes de tocar la UI.

---

## Fase B · Shell

### [x] Tarea 5: Base de idiomas
**Descripción:** preparación para varios idiomas (X7, ADR-018) sin librería:
- `src/ui/i18n/` con `es-ES.ts` (fuente de claves), el tipo `Messages` y `t(clave, params)`;
- un único `locale` activo que alimenta todos los formatos `Intl` (quitar `'es-ES'`/`'es'` escritos en `money.format`, `common.tsx` y `category-service`);
- `ApplicationError` gana `params`, y `toErrors` traduce `ApplicationError`, `DomainError` y los issues de Zod por código desde el catálogo;
- migrar los textos de la UI actual al catálogo.

**Aceptación:**
- [x] No quedan textos de interfaz fijos en `src/ui` (comprobado con grep; lo único fijo son las claves del catálogo).
- [x] El catálogo expone un tipo `Messages` completo y un único locale alimenta importes, fechas y porcentajes.
- [x] Los mensajes de error se resuelven desde el catálogo por código y parámetros, conservando el contexto de los errores existentes.

**Verificación:** `npm run check` (los tests de UI de la fase 1 siguen pasando).
**Depende de:** nada (puede ir en paralelo con la fase A).
**Archivos:** `src/ui/i18n/es-ES.ts`, `src/ui/i18n/index.ts`, `src/ui/errors.ts`, `src/application/shared/errors.ts`, `src/domain/money/money.ts`, `src/ui/common.tsx` (más los componentes de UI actuales, solo para sustituir textos).
**Tamaño:** M. Toca muchos archivos, pero de forma mecánica.

**Hecho (2026-10-03):** catálogo tipado `es-ES`, interpolación, locale compartido con dominio y formatos `Intl`; vistas actuales migradas y suite de fase 1 conservada.

### [x] Tarea 6: Shell Apple y contrato de dirección
**Descripción:**
- registrar el contrato de dirección de Impeccable en su *surface brief*, con la semilla `0278a050` y la dirección fijada por el usuario;
- nuevo `styles.css` con los tokens Apple (claro y oscuro, colores de miembro por `data-color`);
- shell con pestañas inferiores translúcidas en móvil y barra lateral a partir de 900 px;
- rutas `personal`, `familiar` y `ajustes`, con Personal como inicio;
- la barra de captura todavía inactiva.

Mientras tanto, Personal muestra la lista de gastos actual y Familiar un estado vacío.

**Aceptación:**
- [x] X1: tres secciones, inicio en Personal y la ruta sobrevive a la recarga.
- [x] Escritorio con lateral y móvil con pestañas; los dos modos de color.
- [x] Ningún estilo en línea en la app.

**Verificación:** tests de UI del shell actualizados, `npm run check`, y build de producción a 360 y 1280 px sin errores de CSP.
**Depende de:** 5 (los textos del shell van por `t()`).
**Archivos:** `src/ui/styles.css`, `src/ui/AppShell.tsx`, `src/ui/members-categories.test.tsx` (pruebas del shell) y el *surface brief* en `.impeccable/`.
**Tamaño:** M

**Hecho (2026-10-03):** rutas Personal/Familiar/Ajustes, navegación responsive, tokens Apple, materiales translucidos, safe areas, reduced motion/transparency y contrato en `.impeccable/surface-brief.md`.

### [x] Tarea 7: Ajustes
**Descripción:**
- miembros con su ingreso de referencia editable (A2) y su selector de color (A6);
- la regla de reparto del hogar (A7), explicada con un ejemplo corto;
- «¿Quién eres en este dispositivo?» (A4, en `localStorage`);
- las categorías (A3) y los avisos de almacenamiento (A5), con estilo de lista agrupada.

**Aceptación:**
- [x] A2, A4, A6 y A7 con un test cada uno (el color ocupado aparece deshabilitado con el nombre de quien lo usa).
- [x] M1–M4 y C1–C4 de la fase 1 siguen pasando.

**Verificación:** `npx vitest run src/ui`.
**Depende de:** 4, 6.
**Archivos:** `src/ui/SettingsView.tsx` (sustituye a `NameListView.tsx` o lo reutiliza), `src/ui/common.tsx` (hook `useMe`), `src/ui/styles.css` y tests.
**Tamaño:** M

**Hecho (2026-10-03):** `SettingsView` conecta ingresos, colores, regla del hogar, selector de dispositivo, categorías y aviso local; `useMe` guarda solo la preferencia del dispositivo; los ingresos se guardan en una sola transacción (`MemberService.setReferenceIncomes`).

---

## Fase C · Familiar

### [x] Tarea 8: Familiar en lectura
**Descripción:**
- «Este mes transferís» con el color de cada miembro;
- «Cómo se calcula» desplegable;
- «✓ Cuadra»;
- la lista del plan con las asignadas marcadas;
- escritorio en dos columnas;
- los estados F7: sin ingresos y déficit;
- «Cómo se calcula» explica la regla activa (A7).

**Aceptación:**
- [x] F4, F6 (cifras en la UI) y F7 con un test cada uno.
- [x] Los números salen del servicio; la UI no hace cálculos.

**Verificación:** `npx vitest run src/ui`; comprobación visual frente a la maqueta.
**Depende de:** 3, 6.
**Archivos:** `src/ui/FamilyView.tsx`, `src/ui/styles.css` y tests.
**Tamaño:** M

**Hecho (2026-10-03):** `FamilyView` muestra aportaciones coloreadas, plan y líneas asignadas, explicación de la regla, estado equilibrado, ausencia de ingresos y déficit; los totales de líneas los prepara `PlanService`.

### [x] Tarea 9: Editar el plan
**Descripción:**
- añadir, editar y quitar líneas en una hoja (móvil) o un panel (escritorio);
- tipo fórmula o asignada, con un importe por miembro;
- quitar ofrece «Deshacer» (F2, F3).

**Aceptación:**
- [x] Añadir «Calefacción 80» recalcula los aportes al momento.
- [x] Una asignada con partes 300 / 50 vale 350.
- [x] Deshacer restaura la línea.
- [x] Hay errores por campo.

**Verificación:** `npx vitest run src/ui`.
**Depende de:** 8.
**Archivos:** `src/ui/PlanItemSheet.tsx`, `src/ui/FamilyView.tsx`, `src/ui/common.tsx` (componente de hoja) y tests.
**Tamaño:** M

**Hecho (2026-10-03):** `PlanItemSheet` es un `<dialog>` modal nativo (hoja inferior en móvil, panel lateral desde 900 px) para crear y editar líneas de fórmula o asignadas; recalcula al guardar, elimina con deshacer y marca el error en el campo exacto, incluida cada parte asignada.

### C fix · Ajustes de la revisión del Checkpoint C
Salen de la comprobación con el plan de ejemplo (2026-10-03). Se cierran antes de marcar la revisión del Checkpoint C.

### [x] C fix 1: Formato de miles
**Descripción:**
- `format()` agrupa siempre los miles: 1.950,01 € y no 2541,01 €, como en la spec y la maqueta;
- afecta a toda la app, incluidas las pantallas de la fase 1.

**Aceptación:**
- [x] F6 en la UI muestra exactamente «1.950,01 €» y «500,00 €».
- [x] Los importes de 4 cifras llevan punto de miles en todas las vistas; los tests existentes se actualizan.

**Verificación:** `npm run check`.
**Archivos:** `src/domain/money/money.ts` (o donde viva `format()`), tests afectados.
**Tamaño:** S

**Hecho (2026-10-03):** `format()` fuerza `useGrouping` para mantener el separador de miles en todos los importes.

### [x] C fix 2: Texto del aviso de deshacer
**Descripción:**
- el aviso dice «¿Eliminar «Calefacción»?» cuando la línea ya está eliminada y suena a confirmación;
- pasa a «Calefacción eliminada», con el botón «Deshacer» (vale para gastos, ingresos y líneas del plan).

**Aceptación:**
- [x] Tras eliminar, el aviso dice «X eliminada/o» y no es una pregunta.
- [x] Los tests de deshacer (gastos, ingresos, plan) siguen pasando con el texto nuevo.

**Verificación:** `npx vitest run src/ui`.
**Archivos:** `src/ui/i18n/es-ES.ts` (`ui.deletedNamed`), tests afectados.
**Tamaño:** XS

**Hecho (2026-10-03):** `ui.deletedNamed` dice «Se eliminó «X».» y conserva el botón «Deshacer»; la pregunta de miembros y categorías usa su propia clave `ui.confirmDelete` («¿Eliminar «X»?»).

### [x] C fix 3: «Cómo se calcula» con el desglose de la maqueta
**Descripción:**
- desglosar la cuenta como en la maqueta: ingresos de todos, gastos comunes a repartir, lo que queda, lo que conserva cada uno y, por persona, «ingreso − conserva + asignadas = aporte»;
- versión para cada regla (igualar y proporcional);
- todas las cifras salen del servicio; la UI no calcula.

**Aceptación:**
- [x] Con el plan de ejemplo se ven 4.000,00 / − 2.100,01 / 1.899,99 / 949,99 · 950,00 y la línea por persona hasta 1.950,01 y 500,00.
- [x] Con la regla proporcional el desglose explica el porcentaje.
- [x] Un test por regla.

**Verificación:** `npx vitest run src/ui`; comprobación visual frente a la maqueta.
**Depende de:** C fix 1.
**Archivos:** `src/domain/family/contributions.ts` o `src/application/family/plan-service.ts` (si hace falta exponer el desglose), `src/ui/FamilyView.tsx`, `src/ui/i18n/es-ES.ts`, `src/ui/styles.css` y tests.
**Tamaño:** M

**Hecho (2026-10-03):** `FamilySplit` expone los ingresos totales y cada `Contribution` su `formulaRate` (solo para mostrar). Familiar muestra ingresos, «− gastos comunes», restante, lo que conserva cada uno y la cuenta por persona con las asignadas nombradas: «ingreso − conserva + X Portátil = aporte» (igualar) o «52,5 % de ingreso + … = aporte» (proporcional). Un test por regla.

### [x] C fix 4: Familiar fiel a la maqueta
**Descripción:**
- filas del plan tocables con chevron que abren la hoja de edición, en vez de botones «Editar» / «Eliminar» (eliminar pasa a la hoja);
- «Se queda con» en vez de «conserva»;
- total en la cabecera del plan: «Plan del hogar · 2.450,01 €»;
- «Añadir gasto común» como última fila de la lista, en vez del botón arriba;
- la inicial de cada persona dentro de su punto de color.

**Aceptación:**
- [x] Tocar una fila abre su hoja; la hoja permite eliminar y el aviso ofrece «Deshacer».
- [x] Las filas son accesibles por teclado y lector de pantalla (nombre e importe en la etiqueta).
- [x] Los textos coinciden con la maqueta y pasan por `t()`.
- [x] Comprobación visual a 360 y 1280 px frente a la maqueta.

**Verificación:** `npx vitest run src/ui`; comprobación visual frente a la maqueta.
**Depende de:** C fix 1.
**Archivos:** `src/ui/FamilyView.tsx`, `src/ui/PlanItemSheet.tsx`, `src/ui/i18n/es-ES.ts`, `src/ui/styles.css` y tests.
**Tamaño:** M

**Hecho (2026-10-03):** las filas son botones con chevron, sin doble borde; el total vive en la cabecera; «Añadir gasto común» es la última fila (también con el plan vacío) y sustituye al botón de arriba; la hoja concentra la eliminación; cada miembro muestra su inicial y «Se queda con». Comprobado a 360 y 1280 px sin scroll horizontal ni errores de consola.

### Checkpoint C
- [x] Criterios de éxito 1 y 2 de la spec, comprobados a mano con el plan de ejemplo.
- [x] C fix 1–4 cerradas.
- [x] Revisión con el usuario (aprobada 2026-10-03).

**Comprobación (2026-10-03, dev server, escritorio y móvil):** con 2.600 / 1.400 y las 8 líneas del plan de ejemplo, Familiar muestra 1.950,01 € / 500,00 €, conservan 949,99 / 950,00, total 2.450,01 € y «✓ Cuadra». Sin Portátil, 1.650,01 / 450,00. Añadir, quitar y «Deshacer» recalculan sin recargar. `npx vitest run -t "F6"` en verde. Sin errores en consola.
**Para la revisión:** los puntos de la primera revisión se resolvieron en C fix 1–4 (2026-10-03).

---

## Fase D · Personal

### [x] Tarea 10: Personal, ahorro y gastos del mes
**Descripción:**
- la tarjeta «Este mes vas a ahorrar», con barra hogar / gastado / ahorro (P1);
- las cuentas del mes, con los ingresos extra (Q4/Q5);
- la lista de gastos personales con editar y deshacer (P2, P6);
- el alta rápida (P5);
- el selector de mes (P7).

**Aceptación:**
- [x] P1, P2, P5 y P6 con un test cada uno.
- [x] Un ahorro negativo se muestra con signo y texto, no solo en rojo.

**Verificación:** `npx vitest run src/ui`.
**Depende de:** 4, 6, 7 («quién soy»).
**Archivos:** `src/ui/PersonalView.tsx`, `src/ui/ExpenseForm.tsx` (alta personal simplificada) y tests.
**Tamaño:** M

**Hecho (2026-10-03):** el ahorro (ingreso de referencia + ingresos registrados en el mes − aporte familiar − gastos personales) lo calcula la función de dominio `personalMonth` y lo sirve `PersonalService.monthSummary`; la vista solo lo muestra, así el asistente podrá reutilizarlo. Sin ingreso de referencia no se muestra ahorro, sino el aviso que lleva a Ajustes. Elegir «quién soy», alta rápida en una hoja `<dialog>` (`PersonalExpenseSheet`), edición y deshacer. `ExpenseForm` vuelve a ser solo el de la fase 1. `npm run check` en verde (221 tests).

### [x] Tarea 11: Gráficos de Personal
**Descripción:** barras por categoría del mes (P3) y evolución de seis meses hasta el mes seleccionado, con ese mes destacado (P4), en CSS o SVG. El cálculo va en una función pura de agregación por mes.
**Aceptación:**
- [x] P3 y P4 con un test cada uno.
- [x] Los totales cuadran con la lista.
- [x] Las barras tienen texto accesible.

**Verificación:** `npx vitest run src/domain src/ui`.
**Depende de:** 10.
**Archivos:** `src/domain/expense/expense.ts` (agregación mensual si hace falta), `src/ui/PersonalView.tsx` y tests.
**Tamaño:** S

**Hecho (2026-10-03):** barras por categoría y evolución de seis meses en SVG con `role="meter"` (el `<meter>` nativo ignoraba los colores de la app), con el mes seleccionado destacado. Totales por categoría e histórico salen de `personalMonth` (`monthlyExpenseTotals` con meses vacíos a cero). `npm run check` en verde (221 tests).

---

## Fase E · Asistente

### [x] Tarea 12: Parser del asistente
**Descripción:** `parse(texto, contexto)` con la gramática G1 (`gasto <importe> [categoría] [resto]`, `ingreso <importe> [resto]`): sin distinguir mayúsculas ni acentos, el importe con `parseMoney` y la categoría con `categoryNameKey`. `currencyMarkers(text)` en el dominio clasifica los mismos marcadores que quita `parseMoney`, para no interpretar como EUR una cantidad marcada en otra moneda. Añade `CREATE_INCOME` y `USER_SELECTION` a `contracts.ts`. La gramática (palabras clave por idioma) va en `src/agent/grammar/es-ES.ts`, porque el agente no puede importar de `ui/` (X7).
**Aceptación:**
- [x] Tabla de frases a resultado: COMPLETE, NEEDS_CLARIFICATION (categoría ausente o no reconocida) y UNRECOGNIZED; incluye las frases literales G1, categoría compuesta, marcadores EUR (`€`, `EUR`, `euro(s)`) antes/después pegados y separados, marcadores no EUR (`$`, `S/`, `USD`, `PEN`) e importes ausentes, inválidos, cero, negativos o fuera del rango seguro (`AMOUNT_OVERFLOW`).
- [x] El parser no inventa valores.
- [x] `currencyMarkers(text)` devuelve los códigos indicados por los marcadores reconocidos; `parseMoney` y el agente usan el mismo catálogo, sin lista duplicada.

**Verificación:** `npx vitest run src/agent src/domain/money`; `npm run check`.
**Depende de:** nada.
**Archivos:** `src/agent/contracts.ts`, `src/agent/parser.ts`, `src/agent/grammar/es-ES.ts`, `src/agent/parser.test.ts`, `src/domain/money/money.ts` y sus tests, `docs/agent.md`.
**Tamaño:** S

### [x] Tarea 13: Barra de captura conectada
**Descripción:** la barra ejecuta lo que entiende el parser con los servicios:
- un gasto personal de «yo» o un ingreso extra;
- pregunta la categoría con botones si falta (G2);
- confirma con las cifras reales y «Deshacer» (G3);
- muestra la ayuda si no entiende (G4);
- guarda el historial de la sesión en memoria (G5).

**Aceptación:**
- [x] G1–G5 con un test cada uno.
- [x] Criterio de éxito 4 de la spec.
- [x] G2 cubre categoría explícita no reconocida y marca la elección de botón como `USER_SELECTION`.
- [x] La categoría elegida por botón conserva el texto de comercio que quedaba después del importe.
- [x] Sin miembro activo, con varios miembros sin «yo» elegido o con una selección guardada inactiva, el asistente no crea ningún registro.
- [x] G3 confirma los datos reales de gastos e ingresos y el deshacer no borra un registro que haya cambiado desde su creación.
- [x] G1 verifica en los registros todos los campos definidos: gasto personal de «yo», pagado por «yo», fecha local, EUR, `VARIABLE`, sin recurrencia; ingreso extra de «yo», fecha local, EUR, `ONE_OFF`, fuente `OTHER` y resto como descripción.
- [x] G2 muestra el texto restante como comercio pendiente y lo conserva literalmente al elegir una categoría.
- [x] Los borrados condicionales con instantánea se prueban para gastos e ingresos: registro igual borra, registro cambiado da `CONFLICT` sin borrar, registro ausente da `NOT_FOUND`; los borrados existentes sin instantánea conservan su comportamiento.
- [x] `cat-other` («Otros» al crear la base) no se puede archivar ni borrar, pero sí renombrar; permanece como opción activa de G2.

**Verificación:** `npx vitest run src/app src/ui`; `npm run check`.
**Depende de:** 6, 7, 12.
**Archivos:** `src/ui/CaptureBar.tsx`, `src/ui/AppShell.tsx`, `src/application/expenses/expense-service.ts`, `src/application/income/income-service.ts` (borrado condicional para el deshacer), `src/application/categories/category-service.ts` (proteger `cat-other`) y tests.
**Tamaño:** M

### Checkpoint E
- [x] `npm run check`.
- [x] Prueba manual en el móvil (360 px): apuntar, deshacer y la pregunta de categoría.
- [x] Revisión con el usuario (cerrado 2026-10-04; los puntos de la revisión pasan a «E fix» en la fase F).

**Comprobación (2026-10-04, build de producción con `vite preview` y CSP real, 360 y 1280 px):** 306 tests y presupuesto de bundle 152.46 / 160 kB gzip (ADR-020). Un miembro añadido en Miembros desbloquea la barra sin recargar. «gasto 126 comida» registra 126,00 € en Comida y Personal se actualiza sin desmontar la vista; «Deshacer» lo borra y vuelve a 0,00 €; «gasto 126» pregunta con las 14 categorías activas y «Comida» lo registra. La barra está en Personal, Familiar y Ajustes con el historial conservado; sin scroll horizontal, el final de la página queda libre por encima de la barra y no hay errores ni violaciones de CSP en consola (la altura de la barra se escribe por CSSOM). En escritorio la barra va estática al pie de la columna lateral. CSP idéntica a `main`.
**Para la revisión:** los tres puntos (arreglos ya aplicados, selector de mes en escritorio y pregunta de categoría en móvil) pasan a «E fix» en la fase F.

---

## Fase F · Cierre funcional

### [x] Tarea 14: Asistente de primer uso
**Descripción:** con la base sin miembros: quiénes sois → ingresos → líneas del plan → termina en Familiar con los aportes (X6).
**Aceptación:**
- [x] X6 con un test de recorrido completo sobre una base vacía.
- [x] Se puede salir y volver; lo introducido no se pierde.

**Verificación:** `npx vitest run src/ui`.
**Depende de:** 7, 9.
**Archivos:** `src/ui/Onboarding.tsx`, `src/ui/AppShell.tsx` y tests.
**Tamaño:** M

**Hecho (2026-10-04):** sin ningún miembro (ni inactivo) el shell muestra `Onboarding` en lugar de las vistas, sin navegación ni barra de captura. El paso actual se guarda en `localStorage` (`family-finance.setup-step`, solo del dispositivo), así que añadir el primer miembro no cierra el asistente y una recarga vuelve al mismo paso; todo lo introducido ya está en IndexedDB. «Siguiente» en ingresos guarda antes de avanzar. El paso 3 reutiliza `PlanList`, extraída de `FamilyView`. «Ver aportes» borra el paso y abre Familiar. El shell no pinta ninguna vista hasta saber si hay miembros (evita un parpadeo y que se escriba en un formulario que va a desaparecer). Los tests de la fase 1 que empezaban con la base vacía siembran un miembro; M1 comprueba ahora que sin miembros se abre el asistente. Comprobado a 375 y 1280 px: recorrido completo, recarga en el paso 3 y consola limpia.

### [x] Tarea 15: Retirar las pantallas de la fase 1
**Descripción:**
- quitar `DashboardView`, la pantalla de Ingresos y la de Gastos antigua;
- borrar el código muerto que quede (preguntar antes de borrar algo dudoso);
- actualizar o eliminar sus tests;
- conservar los servicios (Q4).

**Aceptación:**
- [x] No queda código ni CSS sin usar.
- [x] `npm run check` en verde.
- [x] El bundle no crece respecto a la fase 1 por código muerto.

**Verificación:** `npm run check`; grep de imports huérfanos.
**Depende de:** 10, 11, 13, 14.
**Archivos:** `src/ui/DashboardView.tsx`, `IncomesView.tsx`, `ExpensesView.tsx`, sus tests y `styles.css`.
**Tamaño:** M

**Hecho (2026-10-04):** fuera `DashboardView`, `ExpensesView`, `IncomesView`, `ExpenseForm` y sus tests (`expenses.test.tsx`, `incomes-dashboard.test.tsx`), las rutas antiguas y el menú «Fase 1»; un hash antiguo (`#/gastos`) abre Personal. Miembros pasa a Ajustes, encima de todo (A1), junto a Categorías (A3); cada lista es una región con nombre y los enlaces a `#/miembros` apuntan a `#/ajustes`. También se quitan `NoMembers` (el asistente de primer uso cubre la base sin miembros), 154 claves del catálogo sin uso (comprobado buscando cada clave; la única búsqueda dinámica es `colors.*`) y las reglas CSS sin uso (`.legacy-nav`, `.filters`, `.table`, `.bar`, `.facts--big`). Los servicios se conservan (Q4); el único export que queda sin usar es el tipo `CreateIncomeInput` del servicio. Bundle: 153,42 → 149,33 kB gzip. `npm run check` en verde (298 tests).

### E fix · Pendientes de la revisión del Checkpoint E
Salen de la comprobación del Checkpoint E (2026-10-04). Antes del checkpoint ya se habían aplicado los arreglos de la revisión de código del commit `8e7ccdf`: datos del hogar siempre frescos, sin desmontar `<main>`, opciones de categoría vivas y altura medida de la barra. También la traducción de `ApplicationError` por `reason` (ADR-018) y el presupuesto de bundle (ADR-020). La revisión final (tarea 17) debe tenerlos en cuenta.

### [x] E fix 1: Selector de mes en escritorio
**Descripción:**
- fallo anterior a la fase E: a partir de 900 px, `.month` no tiene sitio en la rejilla de `.shell` y cae en una fila implícita al pie de la columna lateral, bajo el pliegue (y=818 con una ventana de 800 px);
- colocarlo en la columna principal, encima de la vista (columna 2, fila 1), y ajustar `.shell__main` para que no lo tape.

**Aceptación:**
- [x] A 1280 px el selector de mes queda visible arriba de la columna principal en Personal, Gastos, Ingresos y Resumen.
- [x] El móvil no cambia; sin scroll horizontal.

**Verificación:** prueba manual a 360 y 1280 px; `npm run check`.
**Archivos:** `src/ui/styles.css`.
**Tamaño:** XS

### [x] E fix 2: Pregunta de categoría en móvil
**Descripción:**
- a 360 px, la pregunta de categoría (14 botones) ocupa cerca de media pantalla;
- decidir con el usuario una forma más compacta (por ejemplo, menos opciones visibles o una hoja), sin perder la regla de que todas las categorías activas se pueden elegir y `cat-other` siempre está disponible (G2).

**Aceptación:**
- [x] Forma acordada con el usuario: fila horizontal de chips desplazable.
- [x] A 360 px la pregunta ocupa una sola fila; los tests G2 siguen pasando.

**Verificación:** prueba manual a 360 px; `npx vitest run src/ui/capture.test.tsx`.
**Archivos:** `src/ui/CaptureBar.tsx`, `src/ui/styles.css` y tests.
**Tamaño:** S

---

## Fase G · Cierre de diseño (paso 6 del proceso)

### [x] Tarea 16: Movimiento y sensación nativa
**Descripción:**
- respuesta al pulsar, hojas que nacen de su origen y se cierran por el mismo camino;
- resortes amortiguados e interrumpibles (`apple-design`) con **la librería de animación permitida** (ADR-019): elegirla con `pick-ui-library` (candidata `motion`; `vaul` para hojas) e instalarla en esta tarea;
- `mobile-native`: safe areas, `100dvh`, inputs de 16 px sin zoom, sin el resaltado al tocar;
- `prefers-reduced-motion` y `prefers-reduced-transparency`.

**Aceptación:**
- [x] La revisión con `review-animations` no deja problemas graves.
- [x] Reduced-motion y reduced-transparency funcionan.
- [x] Librería de animación elegida e integrada; consola limpia con la CSP de producción; impacto en el bundle anotado.

**Verificación:** prueba manual a 360 px y en escritorio; `npm run check`.
**Depende de:** 15.
**Archivos:** `package.json` (librería de animación), `src/ui/styles.css`, `src/ui/common.tsx` (hoja) e `index.html` (`viewport-fit`).
**Tamaño:** M

**Hecho (2026-10-04):** librería `motion`, solo `motion/mini` + `spring` (ADR-019; la versión completa y `vaul` no caben o sustituyen el `<dialog>` nativo). `useSheet` (`common.tsx`) sirve a las dos hojas: entran y salen por el mismo borde (abajo en móvil, derecha desde 900 px) con un resorte crítico (amortiguación 1, respuesta 0,35 s), y una animación nueva parte de donde está la hoja en pantalla. En móvil, el asa arrastra 1:1 con resistencia hacia arriba; al soltar se proyecta el gesto y la velocidad pasa al resorte (amortiguación 0,8): cierra o vuelve. Esc, Cancelar, Guardar y Eliminar salen por el mismo camino, el fondo se desvanece y la hoja queda `inert` mientras sale. El aviso de deshacer entra con una transición (interrumpible), y los avisos de la barra de captura con `@starting-style`. Reduced-motion cambia los desplazamientos por fundidos y la pulsación por atenuación; reduced-transparency ya era opaca. Las bases de `mobile-native` (safe areas, `100dvh`, inputs de 16 px, sin resaltado al tocar, `theme-color`) ya estaban de la tarea 6. Arreglado de paso: en móvil el aviso de deshacer quedaba tapado por la barra de captura y ahora flota encima. La revisión con `review-animations` encontró keyframes en el aviso (un toast), ya cambiados por transiciones. Bundle: 149,33 → 154,86 / 160 kB gzip. Probado a 375 y 1280 px en dev y con `vite preview` (CSP real): consola limpia. El arrastre se ha probado con ratón en el navegador integrado, falta probarlo en un móvil real. `npm run check` en verde (298 tests).

### [x] Tarea 17: Revisión de Impeccable, DESIGN.md y documentación
**Descripción:**
- ejecutar el detector (`impeccable detect`) y capturar `desktop.png` y `mobile.png`;
- el revisor final (`impeccable-finish-reviewer`) y su ronda de arreglos;
- el documentador escribe `DESIGN.md` y `.impeccable/design.json`;
- actualizar README, CLAUDE.md, `docs/architecture.md` y `docs/storage.md` (esquema del rediseño);
- revisión de código (`/agent-skills:review`).

**Aceptación:**
- [x] Criterios de éxito 1–6 de la spec.
- [x] Veredicto `ship` del revisor.
- [x] `DESIGN.md` existe.
- [x] Tabla de la spec con los pasos 5 y 6 en ✅.

**Verificación:** `npm run check`; build de producción con la consola limpia a 360 y 1280 px.
**Depende de:** 16.
**Archivos:** docs, `DESIGN.md`, `.impeccable/` y los arreglos que salgan de la revisión.
**Tamaño:** M

**Hecho (2026-10-04):**
- **Detector:** `impeccable detect` sobre `src/ui` e `index.html` no encuentra nada.
- **Capturas:** se hicieron con el build de producción (Personal y Familiar a 1440 y 390 px, más una en modo claro); se retiraron del repositorio porque mostraban datos reales del hogar.
- **Revisión final (`impeccable-finish-reviewer`):**
  - Primer veredicto `fix`, con 8 arreglos.
  - Aplicados en un solo lote, los tres de estructura con el «sí» del usuario:
    - Familiar en dos columnas: el plan a la izquierda; aportes, «Cuadra» y «Cómo se calcula» (abierto en escritorio) a la derecha. En móvil, «Cómo se calcula» es una fila de la tarjeta de aportes.
    - Gastos personales como filas tocables que abren la hoja; Eliminar está en la hoja, con deshacer; «Añadir gasto personal» es la última fila.
    - Iconos SVG propios (`icons.tsx`) en pestañas, lateral, mes, filas, envío y «Cuadra».
  - El resto de arreglos:
    - fuera la regla de navegación de la fase 1, que subrayaba la pestaña activa;
    - contraste AA en modo claro (`--muted #6c6c70`, `--accent #0066cc`, `--on-accent`);
    - «Cuadra» en verde con su suma visible («1.950,01 € + 500,00 € = 2.450,01 €», test F6);
    - lateral de escritorio como panel con material propio y placeholder corto;
    - selección, cursor y `accent-color` con el acento;
    - histórico sin la caja de fondo.
  - Segundo veredicto: `ship`, con los 8 resueltos.
- **Documentación:** `DESIGN.md` y `.impeccable/design.json` los escribe `impeccable-documenter` a partir de lo construido. README, CLAUDE.md, `docs/architecture.md` (capas nuevas y sección UI) y `docs/storage.md` (`planItems`, `settings`, campos del miembro y preferencias de `localStorage`) actualizados.
- **Revisión de código (`/agent-skills:review`):** sin hallazgos críticos. Arreglado:
  - la salida de la hoja termina aunque se cancele la animación;
  - la altura se guarda al empezar el arrastre;
  - `pointercancel` no proyecta el gesto;
  - fuera la clave `common.edit`, que se había quedado sin uso.

  Una prueba de mutación en `useSheet` (no avisar al cerrar) rompe 6 tests de UI, así que los tests sí la detectan.
- **Criterios de éxito:** 1–5 comprobados a mano a 360 px con `vite preview` y la CSP real, con la consola limpia; el 6 está retirado y una base vacía abre el asistente.
- **Bundle:** 155,37 / 160 kB gzip. `npm run check` en verde (298 tests).
- **Desvíos que señala el documentador (no corregidos, para decidir):**
  - las hojas son opacas, aunque el Resumen las quería translúcidas;
  - el Resumen 6 dice que la hoja «nace de la fila tocada», pero G16 y el build la sacan desde el borde;
  - quedan botones y campos con borde de la fase 1 (radio de 6 px) junto a los campos rellenos;
  - `--member-ink` no tiene par para modo oscuro.
- **Mejora opcional del revisor:** en escritorio, la cuenta de «Cómo se calcula» parte líneas en la columna estrecha.
- **Falta:** probar el arrastre de las hojas en un móvil real.

### Checkpoint final
- [x] Todos los criterios de la spec tienen un test que pasa (mapa en *Cierre* de `docs/spec-rediseno.md`; X2–X4 se verifican con la revisión de diseño y la build con CSP).
- [x] Aprobación final del usuario (2026-10-04).

**Comprobación (2026-10-04):** se añadió el test «X1, X5: the hash … opens Personal» (inicio y rutas antiguas de la fase 1), el único criterio sin test propio. `npm run check` en verde (302 tests, 155,37 / 160 kB gzip). La revisión de código final y los desvíos del documentador quedan como notas informativas en el *Cierre* de la spec. **Primera versión cerrada.**
