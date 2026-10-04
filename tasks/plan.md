# Plan de implementación: rediseño (Personal / Familiar / Ajustes + asistente)

> **Fuentes:** `docs/spec-rediseno.md` (spec aprobada y *Resumen de diseño* confirmado), `PRODUCT.md` y la maqueta `docs/design/maqueta-apple.html`.
> **Tareas detalladas y su estado:** `tasks/todo.md`. **Estado global del proceso:** la tabla de la spec.

## Resumen

Pasar del CRUD de la fase 1 a tres secciones con estética Apple (más una barra de captura fija) **sin perder datos**:
- primero, el **cálculo del reparto** en el dominio y el **esquema nuevo** (en la v1, sin migración: los datos de la fase 1 eran de prueba);
- después, las pantallas por cortes verticales (Ajustes → Familiar → Personal → asistente);
- al final, el primer uso, la limpieza de la fase 1 y el cierre de diseño de Impeccable, que genera `DESIGN.md`.

## Decisiones de arquitectura

- **Reparto como función pura del dominio** (`domain/family/contributions.ts`):
  - dos reglas, elegidas en Ajustes (A7): «igualar lo que conserváis» (por defecto; llenado por niveles desde el ingreso más alto, que con todos pagando es `allocate(restante, [1, …])`) y «proporcional al ingreso»; nunca hay aportes negativos (Q3 revisada);
  - regla Q2 del céntimo: los ingresos se ordenan de mayor a menor antes de repartir, así que el céntimo sobrante lo paga quien más ingresa;
  - los aportes suman exactamente el total del plan, y lo comprueba un test;
  - F6 es un test literal.
- **Sin migración** (supuesto 5): tablas `planItems` y `settings` (regla de reparto, A7), y `referenceIncome` y `color` en los miembros, escritos en la propia v1; el usuario borra su base local de prueba.
- **`PlanItem` aplanado en el record:** `kind` (`FORMULA | ASSIGNED`), `amountMinor` (solo FORMULA) y `shares: { memberId, amountMinor }[]` (solo ASSIGNED). El importe de una línea asignada es la suma de las partes (Q1).
- **El color del miembro** se guarda como **clave de paleta** (`'blue'`, `'indigo'`…), nunca como hex. La UI lo pinta con un atributo `data-color` y variables CSS por clase, porque la CSP prohíbe los estilos en línea en la app.
- **«Quién soy»** se guarda en `localStorage` con `try/catch` (A4). Es preferencia del dispositivo y no va a IndexedDB ni a los backups.
- **Preparada para varios idiomas, sin librería** (X7, ADR-018):
  - catálogo tipado `src/ui/i18n/` con `t()` y un `locale` único para `Intl`;
  - errores traducidos por código y parámetros;
  - gramática del asistente por idioma en `src/agent/grammar/`.

  Es la tarea 5, antes de cualquier pantalla nueva, para no escribir textos fijos que luego haya que migrar.
- **El asistente es un parser puro** en `src/agent/parser.ts`, que implementa el `IntentParser` existente. Se añade el intent `CREATE_INCOME` a `contracts.ts`. La ejecución, con confirmación y deshacer, llama a los servicios desde la UI de la barra de captura; el agente nunca toca la base de datos.
- **Marcadores de moneda del asistente:** `currencyMarkers(text)` se define junto a `parseMoney` en `domain/money` y comparte su catálogo de marcadores. G1 usa EUR; si el importe indica otra moneda, el parser no convierte ni lo registra como EUR.
- **Deshacer de capturas antiguas:** la barra pasa la instantánea creada a los servicios de gastos/ingresos. El borrado condicional compara el registro y elimina en la misma transacción; si los datos cambiaron, devuelve `CONFLICT` y conserva el registro. Las llamadas actuales sin instantánea mantienen el borrado existente.
- **G2 siempre puede ofrecer una categoría:** el ID estable `cat-other` (inicialmente «Otros») permanece activo. Se puede renombrar, pero `CategoryService` no permite archivarlo ni borrarlo.
- **Movimiento:**
  - CSS para la respuesta al pulsar y las transiciones simples;
  - **una librería de animación permitida** (ADR-019, aprobada por el usuario el 2026-10-03) para resortes interrumpibles, traspaso de velocidad y hojas arrastrables; se elige en la tarea 16 con `pick-ui-library` (candidata principal: `motion`);
  - fundidos con `prefers-reduced-motion`.
- **Se reutiliza lo existente:**
  - `ExpenseService` (gastos personales, `restore`), `IncomeService` (ingresos extra, Q4/Q5) y `MemberService`/`CategoryService`;
  - `totalsBy`, `allocate`, `parseMoney`, `format`, `categoryNameKey`, `useData`, `useDeleteWithUndo`, `toErrors`/`Field`/`FormError`, el router por hash y `renderApp` en los tests.
- **Las pantallas de la fase 1 desaparecen** (Resumen, Gastos, Ingresos), pero solo cuando su sustituto ya está hecho (tarea 15), para que cada tarea deje la app funcionando.

## Grafo de dependencias

```text
1 contributions ─┐
2 esquema ──────┼─▶ 3 PlanService ─▶ 8 Familiar (lectura) ─▶ 9 edición del plan ─┐
                 └─▶ 4 MemberService ─▶ 7 Ajustes ──────────────────────────────┤
5 idiomas ─▶ 6 shell + tokens ─▶ 7, 8, 10 ─▶ 10 Personal ─▶ 11 gráficos     ├─▶ 14 primer uso ─▶ 15 limpieza ─▶ 16 movimiento ─▶ 17 cierre
12 parser ──────────────────────────────────▶ 13 barra de captura ─────────┘
```

Se pueden paralelizar: (1 → 2) ∥ 5 ∥ 12, y 10–11 ∥ 8–9 una vez hecha la 6.

## Índice de tareas (detalle en `tasks/todo.md`)

| Fase | Tareas |
|---|---|
| A · Base | 1. Reparto en el dominio · 2. Esquema y miembro · 3. `PlanService` · 4. `MemberService` (ingreso y color) |
| Checkpoint A | `npm run check`; datos de la fase 1 migrados; F6 vía servicio |
| B · Shell | 5. Base de idiomas (catálogo, `locale`, errores por código) · 6. Shell Apple (tokens, pestañas o lateral, rutas) y contrato de dirección · 7. Ajustes (quién soy, ingresos, color) |
| C · Familiar | 8. Aportes, «Cómo se calcula», «✓ Cuadra» y plan en lectura · 9. Editar el plan (hojas, asignadas, deshacer) |
| Checkpoint C | Plan real del usuario → 1.950,01 / 500,00 en la UI; «Calefacción» recalcula |
| D · Personal | 10. Ahorro previsto, cuentas, gastos del mes y alta rápida · 11. Gráficos por categoría y de 6 meses |
| E · Asistente | 12. Parser (gramática por idioma) · 13. Barra de captura conectada |
| Checkpoint E | «gasto 126 comida» registra y se puede deshacer; «gasto 126» pregunta la categoría |
| F · Cierre funcional | 14. Asistente de primer uso · 15. Retirar las pantallas de la fase 1 |
| G · Cierre de diseño | 16. Movimiento y sensación nativa · 17. Revisión de Impeccable, `DESIGN.md`, docs y revisión de código |
| Checkpoint final | Criterios de éxito 1–6 de la spec |

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Una base local antigua choca con el esquema nuevo | Bajo | Los datos eran de prueba: se borra la base local antes de probar (supuesto 5) |
| Céntimo descuadrado en el reparto | Alto | Test de propiedad: la suma de aportes es igual al total del plan para varias combinaciones, además de F6 literal |
| Los colores de miembro chocan con la CSP (estilos en línea) | Medio | `data-color` y clases CSS por clave de paleta; se comprueba en la build de producción con la consola limpia |
| `backdrop-filter` lento en móviles modestos | Medio | Fondo casi opaco de respaldo; `prefers-reduced-transparency`; prueba a 360 px |
| La librería de animación choca con la CSP o engorda el bundle | Medio | ADR-019: solo animación vía CSSOM (sin `<style>` inyectados) y se mide el bundle en las tareas 16 y 17 |
| Textos más largos en otros idiomas rompen el diseño | Medio | X7 obliga a aguantar un 30–40 % más de texto; se comprueba con `break-ui` en la tarea 17 |
| El tamaño del bundle crece | Bajo | Una sola dependencia nueva (animación); se mide en la tarea 17 (fase 1: 137,8 kB gzip) |

## Preguntas abiertas

1. ~~Librería de animación~~ → **resuelta:** sí se permite (ADR-019).
2. **Quién soy con un solo miembro.** *Por defecto:* se asume automáticamente; con dos o más, se pregunta al entrar en Personal.
