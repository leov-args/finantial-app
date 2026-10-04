# Decisiones de arquitectura (ADR)

Formato breve: contexto → decisión → consecuencias. Estado: **Aceptada**, **Pendiente de confirmar**, **Aplazada** o **Sustituida**.

---

## ADR-001 · Local-first sin backend — Aceptada

IndexedDB (vía Dexie) es la única fuente de verdad. Sin login, servidor, nube ni sincronización. La pérdida del dispositivo se mitiga con backups exportables (ADR en `backup.md`).

## ADR-002 · Dinero como enteros en unidades menores — Aceptada

`Money { amountMinor: entero seguro, currency }`. Multiplicaciones y divisiones con `BigInt`, un solo redondeo explícito. Los repartos usan `allocate` (mayor resto), que garantiza que las partes suman exactamente el total. Los porcentajes en basis points son solo para mostrar.
*Consecuencia:* nunca hay `0.1 + 0.2`; cualquier cálculo de aportaciones cuadra al céntimo.

## ADR-003 · Capas con reglas de dependencia forzadas por lint — Aceptada

`domain → application → (agent, ocr) → infrastructure/app → ui`, ver `architecture.md`. ESLint (`no-restricted-imports`) bloquea las importaciones prohibidas. El dominio no depende de React, Dexie ni Zod.

## ADR-004 · Validación en dos niveles — Aceptada

Zod en la frontera de la capa de aplicación (convierte entrada desconocida en comandos tipados con errores por campo). El dominio mantiene sus invariantes con comprobaciones propias. Los mappers vuelven a pasar por el dominio al leer de IndexedDB, y lo mismo hará la restauración de backups.

## ADR-005 · Fechas de calendario local — Aceptada

Fechas de negocio como `YYYY-MM-DD` en la zona del usuario; `createdAt/updatedAt` como ISO UTC. Evita que un gasto de las 23:30 aparezca en el día anterior.

## ADR-006 · Un ingreso es dinero recibido en una fecha — Aceptada; complementada por el rediseño

**Contexto.** El enunciado pide ingresos "mensual fijo, mensual variable, puntual" y calcular ingreso mensual, anual y porcentaje. Hay dos modelos posibles:

- (A) **Registro fechado** (elegido): cada ingreso es una entrada con fecha, como un gasto. `schedule` describe su naturaleza. Ingreso del mes = suma de entradas del mes.
- (B) **Flujo proyectado**: una nómina fija se registra una vez con fecha de inicio y se aplica a todos los meses siguientes hasta una fecha de fin.

**Decisión.** (A): determinista, sin proyecciones ocultas, conserva el historial exacto cuando cambia el sueldo y es coherente con los gastos.

**Coste.** Hay que registrar la nómina cada mes. Se mitigará con un botón "copiar ingresos fijos del mes anterior" (acción explícita, sin generación automática), igual que se hará con los gastos recurrentes.

**Resolución (rediseño, 2026-10-03).** El reparto del hogar no usa los ingresos registrados, sino un **ingreso de referencia** fijo por miembro (`Member.referenceIncome`). Los ingresos fechados se mantienen como **ingresos extra** (bonus, devoluciones) que suman al ahorro personal del mes (`docs/spec-rediseno.md`, Q4/Q5).

## ADR-007 · Recurrencia como metadato — Aceptada

`Expense.recurrence` (semanal, mensual, anual) describe el gasto; no se generan gastos futuros automáticamente. Una futura acción explícita "registrar los fijos de este mes" usará este metadato.

## ADR-008 · Categorías semilla — Aceptada

14 categorías con ids estables (`cat-food`…) y nombres en español, creadas solo en `populate` (creación de la BD). El usuario puede renombrarlas o archivarlas; reabrir la app nunca las recrea.

## ADR-009 · Desactivar/archivar en vez de borrar — Aceptada

Miembros con historial se desactivan; categorías con gastos se archivan. Solo se borra lo que no tiene referencias. IndexedDB no tiene claves foráneas, así que los servicios comprueban referencias dentro de una transacción que abarca todas las tablas.

## ADR-010 · Undo mediante instantáneas — Aceptada

Los servicios devuelven lo necesario para revertir (`create` → creado, `update` → `{ previous, current }`, `delete` → borrado) y `restore(snapshot)` reescribe la instantánea exacta. El agente envolverá esto en `UndoAction`. Sin event sourcing (innecesario a esta escala).

## ADR-011 · Transferencias entre miembros no son gastos — Aplazada

Si alguna vez se registran transferencias, serán una entidad `Settlement { from, to, amount, date }`, nunca un gasto. El rediseño no las necesita: lo común vive en el plan familiar y los aportes se calculan, no se registran.

## ADR-012 · Un pagador por gasto; importes positivos — Aceptada para el MVP

`paidBy` es un único miembro. Pagos divididos y devoluciones (importes negativos) quedan fuera del MVP; si se necesitan, se modelarán explícitamente en una nueva versión del esquema.

## ADR-013 · TypeScript 6.0, no 7.0 — Aceptada

TypeScript 7 (compilador nativo) ya es `latest`, pero `typescript-eslint` 8 solo soporta `<6.1`. Se fija `~6.0.3`. Revisar cuando `typescript-eslint` soporte 7.

## ADR-014 · Dependencias mínimas — Aceptada

| Dependencia | Motivo |
|---|---|
| `react`, `react-dom` | UI (requisito) |
| `dexie` | IndexedDB con versiones, índices y transacciones (requisito) |
| `zod` | validación de entrada y de backups (requisito; ver nota) |
| `vite`, `@vitejs/plugin-react` | build y dev (requisito) |
| `typescript` | tipado estricto |
| `vitest` | tests (requisito) |
| `fake-indexeddb` | probar Dexie contra IndexedDB conforme a la spec en Node, sin navegador |
| `@testing-library/react`, `@testing-library/user-event`, `jsdom` | tests de UI (fase 1), solo en desarrollo |
| `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals` | lint y reglas de capas |
| `@types/*` | tipos |

Aplazadas hasta que haya algo que probar o usar: Playwright (cuando haya flujo E2E), `vite-plugin-pwa` (fase 9), librería ZIP pequeña p. ej. `fflate` (fase 8), motor OCR (fase 6, carga diferida).

Nota de tamaño: el bundle inicial ronda 138 kB gzip tras la fase 1 (131 kB en la fase 0; React ≈ 60 %). Si hiciera falta reducirlo, `zod/mini` es la primera opción (misma librería, API funcional y tree-shakeable). Desde 2026-10-04 hay un presupuesto obligatorio: ver ADR-020.

## ADR-015 · Seguridad del frontend — Aceptada

CSP estricta en producción (`connect-src 'self'`, sin `unsafe-inline`), texto siempre plano (prohibido `dangerouslySetInnerHTML` por lint), sin secretos en bundle ni IndexedDB, sin sourcemaps en producción.

## ADR-016 · Almacenamiento persistente — Aceptada

Se solicita `navigator.storage.persist()` al arrancar y se muestra el resultado, porque sin él el navegador puede expulsar los datos.

## ADR-017 · Idioma — Aceptada

UI, textos de error de aplicación y documentación en español; identificadores de código en inglés. Los mensajes de `DomainError` (en inglés) son para desarrolladores; la UI traduce por código.

---

## ADR-018 · App preparada para varios idiomas — Aceptada (2026-10-03)

**Contexto.** Hoy la app solo está en español de España, pero se quiere poder ofrecer español latino, inglés, francés y otros sin reescribir la UI.

**Decisión.** Preparación sin librería (ADR-014):
- **Catálogo de textos:**
  - tipado en `src/ui/i18n/`, con un archivo por idioma (`es-ES.ts` es la fuente de claves);
  - los demás idiomas se declaran con `satisfies Messages`, así que TypeScript señala cualquier clave que falte;
  - los componentes usan `t(clave, params)` y nunca texto fijo.
- **Un solo `locale` activo** alimenta todo `Intl` (importes, fechas, porcentajes, ordenación). No hay `'es-ES'` escrito en el código fuera del catálogo y la configuración.
- **Errores:**
  - la UI los traduce por **código y parámetros**, tanto los `DomainError` como los `ApplicationError` (este último gana `reason`, un motivo estable tipado, y `params`; implementado el 2026-10-04 con un mapa exhaustivo en `ui/errors.ts`, así que un motivo nuevo no compila sin traducción);
  - los issues de Zod se traducen por su código de issue;
  - el texto de los servicios queda solo como respaldo para desarrolladores.
- **Asistente:** la gramática (palabras clave «gasto» e «ingreso») se define por idioma.
- **No se traducen:** los datos del usuario, incluidas las categorías iniciales, que se pueden renombrar. La moneda va aparte del idioma.

**Consecuencias.** Añadir un idioma consiste en añadir un archivo de catálogo y su gramática, más un selector de idioma en Ajustes (por hacer, cuando haya un segundo idioma). Se sustituye la parte de ADR-017 que decía que los textos de error de aplicación eran la fuente de la UI.

## ADR-019 · Se permite una librería de animación — Aceptada (2026-10-03)

**Contexto.** La dirección de diseño (estilo Apple, ver `docs/spec-rediseno.md`) depende de un movimiento con resortes interrumpibles, con traspaso de velocidad y hojas que se arrastran, y el usuario prioriza esa experiencia.

**Decisión.** Excepción a ADR-014: se permite **una** librería de animación para la UI.
- **Elección:** se hace en la tarea 16 del plan con la skill `pick-ui-library`. Candidata principal: `motion`; para hojas inferiores se valorará `vaul`.
- **Condiciones:**
  - carga solo en la UI, nunca en el dominio ni en la aplicación;
  - compatible con la CSP de producción: anima con JS vía CSSOM, que la CSP permite; nada de `<style>` inyectados ni de `unsafe-inline`;
  - respeta `prefers-reduced-motion`;
  - se mide su impacto en el bundle.

**Consecuencias.** Cualquier otra dependencia sigue requiriendo preguntar.

**Elección (tarea 16, 2026-10-04): `motion`, solo `motion/mini` (`animate`) + `spring`.**
- **Por qué:** anima con WAAPI (`element.animate`) y estilos por CSSOM, así que respeta la CSP sin cambios; el resorte se convierte en una curva `linear()` y una animación nueva parte del valor en pantalla, así que es interrumpible.
- **Descartadas:** `motion` completo (`animate` híbrido, ~19 kB gzip) y `motion/react` (~45 kB) no caben en el presupuesto (ADR-020); `vaul` sustituiría el `<dialog>` nativo (foco, Esc, `inert`) por Radix Dialog y añadiría otra dependencia.
- **Uso:** solo en `useSheet` (`src/ui/common.tsx`): entrada y salida por el mismo borde, arrastre hacia abajo en móvil con proyección del gesto y traspaso de velocidad. Los resortes se dan en física (rigidez/amortiguación), porque `motion/mini` ignora la velocidad en los resortes por duración. Lo demás (pulsación, avisos) es CSS.
- **Impacto en el bundle:** 149,33 → 154,86 kB gzip (+5,5 kB).

## ADR-020 · Presupuesto de bundle — Aceptada (2026-10-04)

**Contexto.** Tras la barra de captura (fase E), el JS pasó de 498.51 kB (149.09 kB gzip) a 511.03 kB (152.93 kB gzip) y Vite empezó a avisar de un chunk mayor de 500 kB. Un aviso que nadie atiende se normaliza. Es una app local para móviles modestos, así que el tamaño cuenta en la instalación y en el parseo. Reparto aproximado, antes de minificar: `react-dom` 51 %, `zod` 15 %, `dexie` 13 %, código propio 18 % (`src/ui` 11 %).

**Decisión.**
- **Presupuesto:** 160 kB gzip para todo el JS emitido, sumando todos los chunks; dividir en chunks no lo esquiva, porque la app offline los acaba cargando todos.
- **Cómo se aplica:** lo comprueba el plugin `family-finance:bundle-budget` de `vite.config.ts` al construir; si se supera, falla `npm run build` y, con él, `npm run check`. Mide gzip sobre el archivo emitido, así que su cifra puede diferir unas décimas de la que imprime Vite.
- **Aviso de Vite:** `chunkSizeWarningLimit` se sube a 540 kB (equivalente sin comprimir), para que el aviso solo salte cuando el presupuesto esté en riesgo.
- **Subirlo** es una decisión: se edita esta entrada con el motivo y la nueva medida.

**Consecuencias.**
- Margen de ~8 kB sobre la medida de hoy (151.54 kB con el plugin).
- La librería de animación (ADR-019, tarea 16) debe caber, o revisar esta entrada al elegirla. Cupo: 154,86 kB con `motion/mini` (2026-10-04).
- Si falta margen, el primer recorte es `zod/mini` (ADR-014); después, cargar de forma diferida lo que no se usa al arrancar (por ejemplo, el motor OCR de la fase 6).

## Decisiones abiertas

| # | Pregunta | Cuándo |
|---|---|---|
| 1 | Dónde guardar la configuración global (moneda por defecto, idioma) cuando haya más de una opción | Al añadir un segundo idioma o moneda |
