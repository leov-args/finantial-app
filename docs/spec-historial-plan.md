# Historial del plan y de los ingresos de referencia (E1-1)

**Estado:** aprobada (2026-10-11); hecha (2026-10-11). Rama `e1-1-historial-plan`.

## Problema

`PersonalService.monthSummary` y `PlanService.contributions()` calculan **cualquier mes** con el plan, los ingresos de referencia, los miembros activos y la regla de reparto *actuales*. Cambiar cualquiera de los cuatro reescribe los meses pasados, en Personal y en Familiar (que además no tiene selector de mes).

## Decisión (usuario, 2026-10-11): opción B, instantáneas automáticas

Se descarta la vigencia por fecha (A): no cubre `Member.active` ni `splitRule`, duplica el modelo y complica la fusión de E2-4. Nadie usa la app todavía, así que no hay datos que migrar.

- **No hay botón ni acción mensual.** Se llama *instantánea*, no «cierre de mes».
- El mes en curso siempre usa el estado actual.
- **Justo antes de cualquier cambio** de plan, ingreso de referencia, miembros (alta, baja, activar/desactivar) o regla, el servicio guarda una instantánea de cada mes **terminado** que aún no la tenga, y después aplica el cambio. Dentro de la misma transacción.
- Un mes terminado **con** instantánea se calcula con ella; **sin** instantánea, nada cambió desde entonces y el estado actual da lo mismo.
- Se congelan las **entradas**, no los resultados: `contributions()` sigue siendo el único sitio que calcula. Así el desglose por línea («Cuadra», hoja de cada línea) funciona en meses pasados sin guardar cifras derivadas.
- Rango a congelar: desde el mes del gasto o ingreso más antiguo hasta el mes anterior al actual. Sin transacciones no se congela nada.
- Una instantánea es **inmutable** y no se edita. Un error del pasado se corrige en el mes siguiente. Reabrir queda en el *Backlog*.

### Limitación aceptada

Cambiar el plan a mitad de mes afecta al mes entero en curso; no hay «efectivo desde el día 15». Se congela al terminar el mes.

## Modelo

Tabla nueva `monthSnapshots`, clave `month` (`"YYYY-MM"`), un registro plano:

```text
{ month, splitRule, createdAt,
  members: [{ memberId, active, referenceIncomeMinor | null, currency }],
  planItems: [registro de PlanItem tal cual] }
```

- Versión de esquema **2** en `migrations.ts` (lista completa de tablas + `monthSnapshots: 'month'`). Sin `upgrade`: no hay datos que reformar.
- Dominio: `MonthSnapshot` + `buildMonthSnapshot` (inmutable, valida). Puerto `MonthSnapshotRepository` (`getByMonth`, `save`, `getAll`).
- `PlanService.contributions(month?)`: sin mes o mes actual, lee el estado vivo; mes pasado con instantánea, usa sus miembros, líneas y regla.
- `PersonalService.monthSummary` toma `referenceIncome` y la aportación de la misma fuente.
- Nombres, colores y categorías de miembros **no** se congelan: se leen vivos (no son importes).

## UI

- Familiar gana el selector de mes que ya usa Personal (`AppShell` lo sube para las dos rutas).
- En un mes pasado con instantánea las líneas se ven en solo lectura (no se edita la historia).
- Textos por `t()`, errores por código.

## Criterios de aceptación

1. Cambiar un ingreso, una línea del plan, la regla o desactivar a un miembro en el mes N no altera ningún mes anterior a N, ni en Personal ni en Familiar (test de servicio por cada uno de los cuatro).
2. El mes en curso refleja el cambio de inmediato.
3. Cambiar dos veces no duplica ni sobrescribe instantáneas (idempotente).
4. Si el cambio falla, tampoco se guarda la instantánea (misma transacción).
5. Deshacer (`restore`) tras un cambio mantiene los meses pasados intactos.
6. Test de migración: base en versión 1 con datos abre en 2 sin perderlos.
7. Sin transacciones previas no se crea ninguna instantánea.
8. `npm run check` pasa; el presupuesto de bundle se respeta.

## Tareas (borrador)

1. Dominio `MonthSnapshot` + tests.
2. Registro, mapper, repositorio Dexie, migración v2 + test de migración.
3. `SnapshotService.freezePast()` + engancharlo en los servicios de plan, miembros y ajustes.
4. `contributions(month)` y `monthSummary` leen de la instantánea.
5. Selector de mes en Familiar, lectura solo en meses pasados congelados.
6. Documentar en `docs/decisions.md` (ADR) y `docs/domain-model.md`; marcar E1-1 hecho en el roadmap.

## Preguntas abiertas

- Si un mes pasado **sin** instantánea se abre y luego se edita el plan, se congela primero (criterio 1). Confirmar que es suficiente y no hace falta congelar también al *abrir*.
- Alta de un miembro nuevo: se congela antes, así no aparece en meses donde no existía. Confirmar.
