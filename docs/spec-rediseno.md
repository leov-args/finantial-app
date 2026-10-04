# Spec: Rediseño — Personal, Familiar y Asistente

> **Documento vivo y fuente de verdad del rediseño.** Cualquier sesión nueva empieza leyendo *Estado del proceso*. Al terminar cada paso, actualiza esa tabla y la línea «Siguiente acción» antes de cerrar.

## Estado del proceso

Flujo spec-driven con una puerta de aprobación en cada paso: no se avanza sin el «sí» del usuario.

| # | Paso | Estado | Artefacto |
|---|---|---|---|
| 0 | Entrevista: intención confirmada | ✅ 2026-10-03 | `docs/intent/rediseno.md` |
| 1 | Spec funcional (este documento) | ✅ aprobada 2026-10-03, con Q1–Q5 tal como se proponían | `docs/spec-rediseno.md` |
| 2 | Contexto de producto: `/impeccable init` | ✅ validado por el usuario 2026-10-03 | `PRODUCT.md` |
| 3 | Diseño: `/impeccable shape` → *Resumen de diseño* confirmado y maqueta (`DESIGN.md` lo escribe el documentador de Impeccable al terminar la implementación, desde lo construido) | ✅ 2026-10-03: dirección Apple fijada por el usuario, maqueta y *Resumen de diseño* confirmados | `DESIGN.md` |
| 4 | Plan técnico y tareas | ✅ aprobado 2026-10-03 (17 tareas; se permite librería de animación, ADR-019) | `tasks/plan.md`, `tasks/todo.md` |
| 5 | Implementación por etapas, cada una con `npm run check` en verde | ✅ 2026-10-04: fases A–G (tareas 1–17, C fix 1–4 y E fix 1–2) cerradas | código y tests |
| 6 | Cierre: revisión final de Impeccable, `DESIGN.md` (documentador), docs, prueba manual en móvil y escritorio, revisión de código | ✅ 2026-10-04: veredicto `ship`, `DESIGN.md` escrito, docs y revisión de código hechas, *Checkpoint final* aprobado por el usuario. **Primera versión cerrada** (ver *Cierre*) | `DESIGN.md`, README, CLAUDE.md |

**Siguiente acción:** ninguna en este rediseño: la primera versión está cerrada y fusionada en `main` (2026-10-04). El trabajo siguiente sale del *Backlog* y de las notas informativas del *Cierre*, cada una con su propia spec o tarea.
- Marcar `[x]` en `tasks/todo.md` al cerrar cada tarea y parar en cada *Checkpoint* para revisar con el usuario.
- Al entrar en código de UI (desde la tarea 6), cargar las skills de diseño: `impeccable` (leer `reference/craft-floor.md` antes de editar UI), `apple-design`, `emil-design-eng` y `mobile-native`.
- La dirección de Impeccable está fijada por el usuario (ronda `0278a050`). En la tarea 6 se registra su contrato de dirección en el *surface brief* (`impeccable surface-brief write`) antes de construir la UI.

**Decisiones durante la implementación:**
- 2026-10-04: presupuesto de bundle de 160 kB gzip para todo el JS, que falla el build si se supera (ADR-020).
- 2026-10-04: librería de animación `motion`, solo `motion/mini` + `spring` (ADR-019), +5,5 kB gzip.

**Notas del paso 2:**
- **Flujo:** *code-first* (no hay generación de imágenes en este entorno); no queda guardado en `.impeccable/config.json`.
- **Modo *live* de Impeccable:** no se configura por ahora (exigiría tocar la CSP); se puede activar más adelante.
- **Nombre del producto:** sin decidir; «Family Finance» es provisional.
- **Voz:** cercana, de tú.
- **Diferenciadores:** el reparto justo y registrar en segundos.

**Reglas de continuidad:**
- **Decisiones:** toda decisión nueva se escribe aquí (o en `docs/decisions.md` si es de arquitectura) en el mismo turno en que se toma.
- **Avance de tareas:** durante la implementación, el progreso de cada tarea vive en `tasks/todo.md`.

---

## Objetivo

Convertir el CRUD genérico de la fase 1 en una app que responda a dos preguntas del hogar (intención completa en `docs/intent/rediseno.md`):

1. **Familiar:** ¿cuánto aporta cada uno este mes para cubrir el plan de gastos comunes de forma justa?
2. **Personal:** ¿cómo voy yo? Cuánto me queda, en qué lo gasto y cuánto voy a ahorrar.

Además, un **asistente «tonto»** que registra movimientos con frases cortas («gasto 126 comida»).

**Usuarios:** una pareja (dos miembros). Un solo dispositivo y offline por ahora; más adelante, cada uno en su móvil (fuera de alcance, pero sin cerrarle la puerta). Uso sobre todo en móvil; **debe funcionar bien en escritorio**.

**Éxito:** al abrir **Familiar**, el usuario ve su plan de ejemplo y los aportes cuadran al céntimo con su ejemplo. Al añadir «Calefacción», los aportes cambian al instante. En **Personal** ve, de un vistazo, cuánto lleva gastado y cuánto ahorrará este mes.

## Supuestos

1. **Sin cambio de stack:** React, Vite, Dexie y Zod. Sin router ni librería de estado. Los gráficos se hacen con CSS/SVG nativo, sin librería de gráficos (añadir una requiere preguntar).
2. **Moneda única EUR:** `DEFAULT_CURRENCY`, como en la fase 1.
3. **Reparto entre los miembros activos que tienen ingreso de referencia.** La fórmula del usuario dice «entre dos»; se generaliza a N repartiendo a partes iguales, y con dos personas da exactamente su fórmula.
4. **«Quién soy» es una preferencia de este dispositivo:** se guarda en `localStorage` y no es un dato de negocio ni entra en los backups. Si no está fijado, se pregunta al entrar en Personal.
5. **No se conservan los datos de la fase 1** (decisión del usuario, 2026-10-03): eran de prueba. Como la v1 nunca ha tenido datos reales, el esquema del rediseño se escribe **en la propia v1**, sin migración, y el usuario borra la base de datos local antes de abrir la versión nueva. La regla «nunca editar una versión publicada» empieza a aplicarse con el primer uso real.

## Requisitos

### Ajustes (A)
- **A1. Miembros:** se mantiene la pantalla actual (alta, renombrar, desactivar, borrar sin historial).
- **A2. Ingreso de referencia por miembro:** importe mensual editable, por ejemplo 2.600 y 1.400. Es lo que usa la fórmula y el ahorro personal. Vacío significa que el miembro no participa en el reparto.
- **A3. Categorías:** se mantiene la pantalla actual.
- **A4. «¿Quién eres en este dispositivo?»:** selector de miembro activo, que también se puede cambiar desde Personal.
- **A5. Avisos de almacenamiento:** se mantienen (persistencia y que no hay backup hasta la fase 8).
- **A6. Color de cada miembro** (añadido el 2026-10-03):
  - Cada miembro elige el color que lo representa (en aportes, cálculo, gráficos y avatar) entre una **paleta cerrada**: los colores del sistema de Apple **sin verde ni rojo**, que están reservados para «ahorro / cuadra» y para error o saldo negativo.
  - **Paleta:** Azul, Índigo, Morado, Rosa, Naranja, Turquesa, Menta y Marrón, cada uno con su variante para modo oscuro.
  - **Sin repetir:** dos miembros activos no pueden tener el mismo color; el ya elegido aparece bloqueado con el nombre de quien lo usa.
  - **Al crear un miembro** se le asigna el primer color libre, y se puede cambiar en cualquier momento desde Ajustes.
- **A7. Regla de reparto del hogar** (añadido el 2026-10-03): «Igualar lo que conserváis» (por defecto) o «Proporcional al ingreso» (F5). Es un dato del hogar: se guarda en IndexedDB y entra en los backups, no es una preferencia del dispositivo. Cambiarla recalcula Familiar al momento.

### Familiar (F)
- **F1. Plan de gastos comunes:** lista de líneas con nombre, tipo e importe, y el total. Al crear la base de datos el plan está vacío. Los datos del usuario se introducen desde la UI; no hay semillas con datos personales.
- **F2. Tipos de línea:**
  - **Por fórmula:** un importe. Se reparte según la regla de reparto del hogar (A7, F5).
  - **Asignada:** un importe por miembro participante (por ejemplo Portátil: Ana 300, Pareja 50). El importe de la línea es la suma de las partes y no se escribe aparte. Una parte puede ser 0.
- **F3. Editar:** añadir, editar y quitar líneas. Los cambios se guardan al momento y los aportes se recalculan en la misma pantalla. Quitar una línea ofrece «Deshacer», como los gastos de la fase 1.
- **F4. Aportes por miembro:** ingreso de referencia, lo que conserva, aporte por fórmula, asignados y **aporte total**.
  - La suma de los aportes es **exactamente** el total del plan.
  - **Nunca hay aportes negativos** ni transferencias entre miembros (Q3).
  - Si sobra un céntimo, lo paga quien más ingresa (Q2).
- **F5. Fórmula** (función pura del dominio; enteros en céntimos, sin floats). Las líneas por fórmula se reparten según la **regla de reparto** del hogar (A7):
  - **«Igualar lo que conserváis»** (`EQUAL_KEEP`, por defecto): paga primero quien más ingresa, hasta que todos conserváis lo mismo; a partir de ahí, el resto se reparte para que todos sigáis conservando lo mismo. Cuando todos pagan es exactamente `conserva = allocate(restante, pesos iguales)` y `aporte por fórmula = ingreso − conserva`, con `restante = Σ ingresos − Σ líneas por fórmula`. Si el plan es menor que la diferencia de ingresos, quien menos ingresa aporta 0 y lo que no aporta quien más ingresa queda como su ahorro personal.
  - **«Proporcional al ingreso»** (`PROPORTIONAL`): cada uno aporta el mismo porcentaje de su ingreso (`allocate(Σ líneas por fórmula, ingresos)`).
  - En ambas: `aporte total = aporte por fórmula + Σ partes asignadas del miembro`.
  - Ejemplo con 2.600 / 1.400 y un plan de 1.000: igualar → 1.000 / 0; proporcional → 714,29 / 285,71.
- **F6. Ejemplo de aceptación,** como test literal (regla «igualar»; con «proporcional» la parte por fórmula sería 1.365,01 / 735,00):

  | | A (2.600) | B (1.400) |
  |---|---:|---:|
  | Líneas por fórmula: 2.100,01 | | |
  | Conserva | 949,99 | 950,00 |
  | Aporte por fórmula | 1.650,01 | 450,00 |
  | Más Portátil asignado 300 / 50 | **1.950,01** | **500,00** |

- **F7. Casos límite visibles,** nunca un error genérico:
  - **Sin ingresos de referencia:** se muestra «Añade los ingresos en Ajustes».
  - **Restante negativo** (los gastos superan los ingresos): aviso destacado con el déficit.

### Personal (P), del miembro «yo» y del mes seleccionado
- **P1. Tarjeta principal:**

  | Concepto | Cálculo |
  |---|---|
  | Ingreso de referencia | — |
  | + ingresos extra del mes | ver Q5 |
  | − aporte familiar | F4 |
  | = disponible | — |
  | − gastado | gastos personales del mes |
  | = **ahorro previsto** | en grande; en rojo si es negativo |

- **P2. Gastos personales del mes:** los de ámbito `INDIVIDUAL` cuyo propietario es «yo» (modelo existente; `paidBy` es «yo» por defecto).
- **P3. Gráfico de gastos del mes por categoría:** barras horizontales con importe y porcentaje (reutiliza `totalsBy`).
- **P4. Gráfico de evolución:** gasto personal de los seis meses hasta el mes seleccionado, con ese mes destacado (al abrir Personal coincide con el actual).
- **P5. Registro rápido de gasto personal:** importe, categoría y fecha (hoy por defecto). Comercio y notas son opcionales y el ámbito y el pagador se fijan solos. Reutiliza `ExpenseService`.
- **P6. Lista de gastos personales del mes** con editar y borrar con deshacer (reutiliza la fase 1).
- **P7. Selector de mes,** como en la fase 1.

### Asistente (G)
- **G1. Entrada de texto con gramática fija,** sin distinguir mayúsculas ni acentos:
  - `gasto <importe> [categoría] [resto = comercio/descripción]` registra un gasto personal de «yo», con fecha de hoy;
  - `ingreso <importe> [resto = descripción]` registra un ingreso extra puntual de «yo» (ver Q5).

  El importe lo interpreta `parseMoney`. La app solo maneja EUR: si la frase contiene un marcador explícito de otra moneda, no se convierte ni se etiqueta como EUR; el asistente muestra la ayuda de G4. Los importes ausentes, no válidos, no positivos o fuera del rango seguro también muestran esa ayuda. La categoría se reconoce por nombre con `categoryNameKey`.
- **G2. Si falta un dato obligatorio** (la categoría en un gasto), el asistente pregunta y ofrece las categorías activas como botones. La categoría de respaldo `cat-other` (inicialmente «Otros») siempre permanece activa; se puede renombrar, pero no archivar ni borrar. No inventa valores.
- **G3. Tras guardar** muestra una confirmación con las cifras reales («Gasto de 126,00 € en Comida registrado») y un botón «Deshacer».
- **G4. Si no entiende la frase,** muestra la ayuda con ejemplos.
- **G5. Historial de la conversación de la sesión** en memoria; no se guarda.
- **G6. El parser es puro y está en `src/agent/`** (funciona sin LLM, como pide `docs/agent.md`). Llama a los servicios, nunca a la base de datos.

### Transversal (X)
- **X1. Navegación** (decidido en `shape`, 2026-10-03):
  - **Secciones:** tres, Personal, Familiar y Ajustes. Barra inferior en móvil; lateral o superior en escritorio (≥ 900 px). La ruta va por hash, como ahora.
  - **La app se abre en Personal.**
  - **El asistente no es una pestaña:** es una **barra de captura fija en todas las pantallas** («Escribe un gasto…»), encima de la navegación en móvil. La respuesta aparece como aviso con «Deshacer», y el historial de la sesión se abre desde la propia barra.
- **X7. Preparada para varios idiomas** (ADR-018, añadido el 2026-10-03):
  - Por ahora solo es-ES, pero sin textos fijos en los componentes: todo pasa por un catálogo tipado con `t()`.
  - Un único `locale` controla los formatos `Intl`.
  - Los errores se traducen por código y parámetros.
  - La gramática del asistente se define por idioma.
  - El diseño aguanta textos un 30–40 % más largos (inglés, francés) sin romperse.
- **X6. Primer uso:** con la base de datos vacía (sin miembros), un asistente de configuración en tres pasos: quiénes sois → ingresos de referencia → líneas del plan. Termina en Familiar mostrando los aportes. Después todo se edita en Ajustes y en Familiar.
- **X2. Diseño visual:** tokens, tipografía y componentes según `DESIGN.md` (paso 3). Fuentes empaquetadas, sin CDN.
  - **Dirección fijada (2026-10-03):** el enfoque de Apple: fuente del sistema, listas agrupadas, barras translúcidas, respuesta inmediata y movimiento con resortes interrumpibles. Del cuaderno de cuadrícula se conserva **mostrar la cuenta**: cada aporte enseña su cálculo («2.600 − 949,99 + 400 = 1.950,01») y una marca de que el plan cuadra.
  - **Descartadas:** la baldosa hidráulica y el cuaderno como estética.
- **X3. Sensación de app en móvil** (skill `mobile-native`): safe areas, `100dvh`, inputs sin zoom, sin el flash al tocar.
- **X4. Se mantienen las restricciones de la fase 1:** CSP estricta sin estilos en línea, texto plano, accesibilidad (etiquetas, foco visible, errores asociados a su campo) y errores traducidos por código.
- **X5. Pantallas de la fase 1 que desaparecen:**
  - *Resumen* queda sustituido por Personal y Familiar;
  - *Gastos* pasa a ser la lista personal (P6);
  - *Ingresos* queda sustituido por los ingresos de referencia (A2) y los extra (G1, P1).

  Los servicios se conservan (ver Q4).

## Resumen de diseño (salida de `/impeccable shape`, confirmado 2026-10-03)

1. **Trabajo y público.** Modo *Operate*: una pareja que apunta gastos al momento en el móvil (a menudo con una mano) y, de vez en cuando, revisa el plan en casa, a veces en escritorio.
2. **Resultado y prueba.** Aportes del hogar que cuadran al céntimo con su propio ejemplo (1.950,01 / 500,00) y ahorro personal de un vistazo. La prueba es la cuenta visible: «Cómo se calcula» y «✓ Cuadra».
3. **Dirección elegida.** Fijada por el usuario: el lenguaje de diseño de Apple, traducido a la web (skill `apple-design`).
   - **Visual:** fuente del sistema con tracking según tamaño; títulos grandes; listas agrupadas; materiales translúcidos (`backdrop-filter`) en la barra de captura, las pestañas y las hojas; colores del sistema que se adaptan al modo claro y oscuro.
   - **Movimiento:** respuesta al pulsar (no al soltar) y resortes amortiguados e interrumpibles; las hojas se arrastran con proyección de impulso; con `prefers-reduced-motion` se usan fundidos.
   - **Lo que conserva del cuaderno:** cada aporte enseña su cuenta.
   - **Momento clave:** en Familiar, editar o añadir una línea y ver los aportes y el «✓ Cuadra» recalcularse al instante.
4. **Alcance.** Calidad de producción: Personal, Familiar, Ajustes (incluido el selector de color, A6), barra de captura, asistente de primer uso (X6), móvil y escritorio. Sin landing ni marketing. Anti-objetivos: estética de banco o *fintech*, gráficos decorativos, gamificación y cualquier cifra que no salga del dominio.
5. **Estados y rangos.**
   - **Miembros:** 1 a 4 (2 típico).
   - **Líneas del plan:** 0 a ~20 (10 típico).
   - **Importes:** de 0,01 € a 99.999,99 €.
   - **Estados que se diseñan:** vacío (primer uso), sin ingresos, déficit (los gastos superan los ingresos), error de validación, deshacer y frase no entendida por el asistente.
6. **Interacción y estructura.**
   - **Móvil:** pestañas inferiores translúcidas (Personal, Familiar, Ajustes) con la barra de captura encima.
   - **Escritorio (≥ 900 px):** barra lateral con las secciones y la captura al pie; en Familiar, dos columnas (plan | aportes y cálculo).
   - **Edición:** editar una línea abre una hoja (móvil) o un panel (escritorio) que nace de la fila tocada; borrar ofrece «Deshacer».
7. **Restricciones.**
   - CSP estricta: sin estilos en línea en la app (las variables CSS de los colores de miembro se aplican vía clases o atributos `data-color`) y sin fuentes externas, porque se usa la fuente del sistema.
   - WCAG AA en los dos modos.
   - Español, voz cercana de tú.
   - Sin dependencias nuevas sin preguntar. Los resortes se implementan con CSS o a mano; una librería de animación requiere aprobación.

**Maqueta de referencia** (estática, con datos reales): `docs/design/maqueta-apple.html`. Es la referencia de la crítica final, no un contrato píxel a píxel.

## Modelo de datos y cambios técnicos

| Cambio | Dónde |
|---|---|
| `Member.referenceIncome: Money \| null` | `domain/member`, `MemberRecord`, mappers |
| `Member.color: MemberColor` (clave de la paleta, por ejemplo `'blue'`; el valor hex vive en la UI) | `domain/member`, `MemberRecord`, mappers |
| Entidad `PlanItem { id, name, kind: { type: 'FORMULA', amount } \| { type: 'ASSIGNED', shares: { memberId, amount }[] }, createdAt, updatedAt }` | `domain/family/plan.ts` (nuevo) |
| Función pura `contributions(participants, items, rule, currency)` con `SplitRule = 'EQUAL_KEEP' \| 'PROPORTIONAL'` | `domain/family/contributions.ts` (nuevo) |
| Ajustes del hogar: `splitRule` (A7), por defecto `EQUAL_KEEP` | tabla `settings` del esquema v1; servicio en `application/` |
| `PlanService`: list, create, update, delete, restore, `contributions()` | `application/family/plan-service.ts` (nuevo) |
| `MemberService.setReferenceIncome` | `application/members/member-service.ts` |
| **Esquema v1 ampliado (sin migración, supuesto 5):** tablas `planItems` (`id`) y `settings` (`id`; una fila `household` con `splitRule`; si no existe, vale `EQUAL_KEEP`) | `infrastructure/database/migrations.ts` |
| Parser del asistente y su ejecutor | `agent/parser.ts`; el ejecutor vive en `ui/CaptureBar.tsx` y llama a los servicios (decidido en la spec de fase E, 2026-10-04, como en `tasks/plan.md`) |
| Nueva estructura de la UI, según `DESIGN.md` | `ui/` |

## Commands

```bash
npm run dev            # http://localhost:5173
npm run check          # typecheck → lint → test → build (obligatorio al cerrar cada etapa)
npx vitest run src/domain/family      # un módulo
npx vitest run -t "F6"                # por criterio
```

## Estructura del proyecto

Se sigue `CLAUDE.md`: las capas están forzadas por el lint y los tests van junto al código. Se crean carpetas solo cuando tienen código: `domain/family/`, `application/family/` y `agent/`.

## Estilo de código

Las convenciones de `CLAUDE.md`: dinero en céntimos, `import type`, extensiones explícitas, textos de UI en español y errores por código. Ejemplo de la firma esperada del cálculo central:

```ts
export interface Participant { readonly memberId: MemberId; readonly income: Money }
export interface Contribution {
  readonly memberId: MemberId;
  readonly income: Money;
  readonly keeps: Money;        // ingreso − formula
  readonly formula: Money;      // parte de las líneas por fórmula, según la regla; nunca negativa
  readonly assigned: Money;     // Σ partes asignadas
  readonly total: Money;        // formula + assigned
}
export interface FamilySplit { planTotal: Money; formulaTotal: Money; remaining: Money /* < 0 = déficit */; contributions: readonly Contribution[] }
export function contributions(participants: readonly Participant[], items: readonly PlanItem[], rule: SplitRule, currency: CurrencyCode): FamilySplit;
```

## Testing

| Nivel | Qué |
|---|---|
| Dominio | `contributions`: F6 literal, restante impar (Q2), restante negativo, las dos reglas (nunca negativos, la suma cuadra), asignados con partes a 0 y tres participantes |
| Base de datos | Una base nueva abre con las tablas nuevas y la regla `EQUAL_KEEP`; los mappers rechazan un color o un ingreso corruptos |
| Aplicación | `PlanService` (crear, editar, borrar y restaurar), `contributions()` con los datos guardados |
| Asistente | Tabla de frases → intención (`gasto 126`, `Gasto 12,50 comida mercadona`, `ingreso 1200 bonus`, frases no reconocidas) |
| UI | Un test por criterio (A, F, P, G, X1) con `renderApp`, sin mocks, como en la fase 1 |

## Boundaries

- **Siempre:**
  - `npm run check` en verde para cerrar una etapa;
  - actualizar *Estado del proceso*;
  - un test por criterio;
  - los aportes suman exactamente el total del plan;
  - respetar las capas y la CSP.
- **Preguntar antes:**
  - añadir cualquier dependencia (incluidas librerías de gráficos o de fuentes), salvo **una librería de animación**, ya permitida por ADR-019;
  - cambiar el esquema más allá del descrito en *Modelo de datos*;
  - relajar la CSP;
  - cambiar la fórmula o la regla del céntimo;
  - borrar código de la fase 1 que tenga datos asociados.
- **Nunca:**
  - floats para dinero;
  - que el asistente invente cifras o categorías;
  - datos personales del usuario como semillas;
  - peticiones de red o analítica;
  - desactivar el lint o saltarse tests para llegar a verde.

## Criterios de éxito

1. **F6** pasa como test, y en la UI se ven 1.950,01 / 500,00 tras introducir el plan de ejemplo.
2. Añadir o quitar una línea recalcula los aportes sin recargar, y deshacer restaura la línea.
3. **Personal** muestra el ahorro previsto, el gráfico por categoría y la evolución de 6 meses para el miembro «yo».
4. **Asistente:** «gasto 126 comida» registra un gasto personal de 126,00 € en Comida y se puede deshacer; «gasto 126» pregunta la categoría.
5. Se usa cómodamente a 360 px y en escritorio a 1280 px, con la build de producción, la CSP activa y sin errores en la consola.
6. ~~Los datos de la fase 1 sobreviven a la migración.~~ Retirado el 2026-10-03 (supuesto 5): una base vacía abre con el esquema nuevo.

## Decisiones (antes preguntas abiertas; aprobadas el 2026-10-03)

- **Q1. Importe de las líneas asignadas.** El plan pone Portátil 340, pero 300 + 50 suman 350. **Decisión:** el importe es la suma de las partes (F2).
- **Q2. Céntimo sobrante cuando el restante es impar.** **Decisión:** conserva un céntimo menos quien más ingresa, lo que cuadra con F6.
- **Q3. Aporte negativo** (alguien ingresa menos de lo que le toca conservar). ~~Se permite y se muestra «recibe X»~~. **Decisión revisada (2026-10-03):** nunca hay aportes negativos ni transferencias. Hay dos reglas de reparto y el hogar elige en Ajustes (A7, F5): «igualar lo que conserváis» (por defecto) o «proporcional al ingreso».
- **Q6. Ingreso de referencia vacío con partes asignadas** (2026-10-03). Una parte asignada de alguien que no participa en el reparto descuadraría el total, así que el dominio la rechaza. **Decisión:** `MemberService` no deja vaciar el ingreso de referencia (ni desactivar al miembro) mientras tenga partes no nulas en el plan, con un mensaje que nombra las líneas. Quitar su parte (ponerla a 0) sí está permitido y cuadra. Un ingreso de 0 es válido y sigue participando.
- **Q4. Pantallas de la fase 1.** **Decisión:** desaparecen como pantallas (X5) y sus servicios se reutilizan. Los ingresos registrados en la fase 1 cuentan como «ingresos extra» en Personal.
- **Q5. Qué es un «ingreso» del asistente.** **Decisión:** un ingreso extra puntual (bonus, devolución) de «yo», que suma al disponible de ese mes en Personal. **No cambia el reparto familiar**, que usa solo los ingresos de referencia.

## Backlog (fuera de este rediseño)

Validar el presupuesto de las líneas del plan con gastos reales (fase 3), sincronización, PWA y apps de tienda, OCR de fotos y PDF, resúmenes conversacionales e historial de cambios del plan (ver `docs/intent/rediseno.md`).

## Cierre (2026-10-04)

Primera versión cerrada con el *Checkpoint final* de `tasks/todo.md`: 302 tests en verde, bundle de 155,37 / 160 kB gzip y aprobación del usuario. Las notas siguientes son **informativas**: no bloquean el cierre ni son compromisos; se retoman, si se quiere, como tareas nuevas.

**Desvíos que anotó el documentador de Impeccable:**
- las hojas son opacas, aunque el *Resumen de diseño* las quería translúcidas;
- el *Resumen* 6 dice que la hoja «nace de la fila tocada», pero sale desde el borde (abajo en móvil, derecha en escritorio);
- quedan botones y campos con borde de la fase 1 (radio de 6 px) junto a los campos rellenos;
- `--member-ink` no tiene par para modo oscuro;
- mejora opcional del revisor: en escritorio, la cuenta de «Cómo se calcula» parte líneas en la columna estrecha.

**Revisión de código final (`/agent-skills:review`, sin hallazgos críticos ni obligatorios):**
- **Velocidad al soltar la hoja** (`useSheet`, `src/ui/common.tsx`): la velocidad del resorte se divide por la distancia que falta; soltando muy cerca de la posición abierta con un gesto rápido hacia arriba, la hoja rebasa unos 10 px y deja ver el fondo. Arreglo posible: acotar el denominador (`Math.max(Math.abs(offset), ~20)`).
- **Sin test de la decisión de cerrar al arrastrar:** `project`, `rubberband` y el umbral (`offset + project(v) > altura / 2`) son puros, pero jsdom no tiene WAAPI. Extraerlos a `shouldDismiss()` con un test de tres casos lo fijaría.
- **Nombre accesible de las filas de gasto** (`personal.openExpense`, igual que `family.openLine`): el `aria-label` sustituye al contenido y el lector de pantalla no oye la fecha ni la categoría.
- **`prefers-reduced-motion`:** ya no hay regla global; el giro de 200 ms del chevron de «Cómo se calcula» sigue animando.
- Nits: la ref `motion` de `useSheet` se llama como el paquete; el separador `' + '` de «Cuadra» está escrito en el componente y no en el catálogo.
- FYI: quedan 4,6 kB de margen en el bundle; `motion` va con `^14.0.0`. (La caché `.impeccable/hook.cache.json` y los logs de `.impeccable/questions/` ya no se versionan.)

**Privacidad antes de publicar:** el ejemplo F6, los tests, la maqueta y los docs usaban los ingresos, el plan y los nombres reales del hogar. Se sustituyeron por un hogar ficticio (Ana y Pareja, 2.600 / 1.400, plan por fórmula de 2.100,01 más Portátil asignado 300 / 50) con las cifras recalculadas por `contributions()`, y se retiraron las capturas de `.impeccable/review/`.

**Pendiente de comprobar:** el arrastre de las hojas en un móvil real (solo se probó con ratón).

**Cobertura de criterios:** cada criterio funcional tiene un test que lo nombra, en algunos casos con el identificador de la fase 1 que conserva (A1 → M1–M4, A3 → C1–C4, A5 → S5–S6). X1 y X5 los cubre «X1, X5: the hash … opens Personal», y G6 el lint de capas más `parser.test.ts`. X2, X3 y X4 (diseño visual, sensación en móvil, CSP sin estilos en línea) no son comprobables con tests unitarios: se verificaron con `impeccable detect`, el revisor final y la build de producción con la CSP real, con la consola limpia.
