# Family Finance

Asistente privado de finanzas familiares. **Local-first**: no hay servidor, cuentas ni nube; todos los datos viven en el navegador del dispositivo.

> Estado: **primera versión cerrada** (2026-10-04, [spec](docs/spec-rediseno.md)). Moneda única: EUR; interfaz en español.

## Qué hace la primera versión

- **Personal:** cuánto vas a ahorrar este mes (ingreso de referencia + ingresos extra − aporte al hogar − gastos personales), tus gastos del mes, en qué se fue el dinero y la evolución de seis meses.
- **Familiar:** cuánto aporta cada uno para cubrir el plan de gastos comunes, al céntimo, con la cuenta a la vista y la marca de que cuadra. Dos reglas de reparto: «os quedáis con lo mismo» (por defecto) o proporcional al ingreso. Líneas del plan por fórmula o asignadas a alguien.
- **Ajustes:** miembros con su ingreso de referencia y color, regla de reparto, quién eres en este dispositivo y categorías.
- **Barra de captura:** frases fijas como «gasto 126 comida» o «ingreso 50 devolución», con «Deshacer»; si falta la categoría, la pregunta. Funciona sin LLM.
- **Primer uso:** con la base vacía, un asistente en tres pasos (quiénes sois, ingresos y plan) que termina en Familiar.
- **Diseño:** lenguaje visual de Apple, modo claro y oscuro, móvil (pestañas y hojas que se arrastran) y escritorio (barra lateral), con `prefers-reduced-motion` ([DESIGN.md](DESIGN.md)).

Lo que queda abierto (notas de la revisión final, desvíos de diseño, probar el arrastre de las hojas en un móvil real) está en el *Cierre* de la [spec](docs/spec-rediseno.md#cierre-2026-10-04), y lo que viene después, en [Fases](#fases).

## Requisitos

- Node.js ≥ 22
- npm ≥ 10

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:5173
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` | typecheck + build de producción en `dist/` |
| `npm run preview` | sirve la build de producción |
| `npm run typecheck` | TypeScript estricto |
| `npm run lint` | ESLint, incluidas las reglas de capas |
| `npm test` | tests de dominio, integración y UI (Vitest; UI con React Testing Library + jsdom) |
| `npm run test:watch` | tests en modo watch |
| `npm run check` | todo lo anterior en orden (falla si el JS supera 160 kB gzip, ADR-020) |

## Dónde se guardan los datos

En **IndexedDB** del navegador, base de datos `family-finance`, ligada al origen (dominio + puerto) desde el que se abre la app. Cada navegador y cada dispositivo tiene su propia copia; no se sincronizan.

- Borrar los datos del sitio en el navegador borra los datos de la app.
- Al arrancar, la app pide almacenamiento persistente para que el navegador no los expulse por falta de espacio.
- Ningún dato se envía a terceros: sin analítica, sin telemetría, CSP con `connect-src 'self'`.

## Backup y restauración

Se implementa en la fase 8 ([diseño](docs/backup.md)): exportará un ZIP `family-finance-backup-YYYY-MM-DD.zip` con `data.json`, `metadata.json` y los recibos; la importación validará todo antes de reemplazar los datos en una única transacción.

Hasta entonces, los datos solo existen en el navegador donde se crearon.

## Arquitectura

```text
ui (React) → app (composition root) → application (casos de uso, Zod)
                                        → domain (TypeScript puro)
                                        → ports ← infrastructure (Dexie) → IndexedDB
agent / ocr → application (nunca la base de datos)
```

- [Arquitectura](docs/architecture.md)
- [Modelo de dominio](docs/domain-model.md)
- [Almacenamiento y migraciones](docs/storage.md)
- [Sistema de diseño](DESIGN.md)
- [Backup](docs/backup.md)
- [Agente](docs/agent.md)
- [OCR](docs/ocr.md)
- [Decisiones](docs/decisions.md)

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Arquitectura, dominio base, persistencia | ✅ |
| 1 | Miembros, categorías, gastos, ingresos: CRUD + dashboard básico | ✅ |
| R | **Rediseño:** Personal, Familiar, Ajustes, asistente y estética Apple | ✅ cerrada, primera versión (2026-10-04, [spec](docs/spec-rediseno.md)) |
| 2 | Reparto del hogar | ✅ en el rediseño (regla «los dos os quedáis con lo mismo» o proporcional) |
| 3 | Ahorros, objetivos, presupuestos | |
| 4 | Lenguaje natural y herramientas del agente | parcial en el rediseño (asistente de frases fijas) |
| 5 | Recibos (archivos locales) | |
| 6 | OCR local | |
| 7 | Consultas al asistente | |
| 8 | Backup y restauración | |
| 9 | PWA / offline | |
