# Agente financiero

Estado: **parser G1 implementado** (`src/agent/parser.ts`, fase E). La barra de captura ejecuta gastos e ingresos con los servicios de aplicación; las consultas y herramientas genéricas siguen siendo trabajo futuro.

## Principios

1. **Funciona sin LLM.** El primer `IntentParser` es de reglas (expresiones, diccionarios de comercios y de fechas relativas). Registrar gastos, consultar balances, calcular aportaciones, presupuestos y backups nunca dependen de un modelo.
2. **No inventa datos.** Cada cifra que el agente muestra procede del resultado de una herramienta. El agente redacta; el dominio calcula.
3. **No toca IndexedDB.** Las herramientas llaman a servicios de aplicación; el lint impide que `agent/` importe infraestructura o Dexie.
4. **No asume en silencio.** Si falta una categoría de gasto, devuelve `Clarification` con `field: 'category'` y opciones activas; no incluye copy localizado en el parser. Los valores fijos de G1 (hoy, «yo», EUR y gasto personal) vienen del contexto y están definidos por la spec, no se infieren de texto ausente.

## Flujo

```text
"gasto 12,50 comida mercadona"
        │
        ▼
IntentParser.parse(texto, contexto)            contexto = hoy, «yo», miembros y categorías activas (sin importes)
        │
        ├─ COMPLETE             → Intent
        ├─ NEEDS_CLARIFICATION  → Intent parcial + campo/options (G2 pregunta categoría)
        └─ UNRECOGNIZED         → ayuda / sugerencias
        │
        ▼
CaptureBar ejecuta Intent       →  ExpenseService/IncomeService  →  dominio  →  IndexedDB
        │
        ▼
Confirmación con datos reales + Deshacer; historial solo en memoria de sesión
```

## Intenciones previstas

| Intent | Ejemplos |
|---|---|
| `CREATE_EXPENSE` (G1) | `gasto 126 comida`, `Gasto 12,50 comida mercadona` |
| `CREATE_INCOME` (G1) | `ingreso 1200 bonus` |
| `QUERY_SPENDING` | "¿Cuánto gastamos este mes?", "¿Cuánto gastamos en comida en septiembre?" |
| `QUERY_CONTRIBUTION` | "¿Quién ha aportado más?", "¿Cuánto debería aportar mi pareja?" |
| `QUERY_SAVINGS` | "¿Cuánto hemos ahorrado este año?" |
| `QUERY_BUDGET` | "¿Cuánto nos queda del presupuesto de comida?" |
| `UNDO` | "Deshaz eso" |

`ExpenseDraft` e `IncomeDraft` guardan cada campo como `Slot { value, confidence, source }`. `source` distingue texto escrito (`USER_TEXT`), categoría elegida explícitamente con botón (`USER_SELECTION`), reglas de comercio futuras (`MERCHANT_RULE`), defaults visibles (`DEFAULT_VISIBLE`) y contexto (`CONTEXT`). La gramática G1 no usa reglas de comercio.

G1 acepta `gasto <importe> [categoría] [resto]` e `ingreso <importe> [resto]`, sin distinguir mayúsculas ni acentos. En gastos, una categoría se reconoce solo por nombre activo exacto (la coincidencia de varias palabras más larga gana); si falta o no coincide, el resto completo queda en `merchant` y el parser pregunta `category`. La UI muestra ese comercio pendiente y las categorías activas. Los marcadores monetarios EUR se comparten con `parseMoney`; un marcador USD/PEN, importe no positivo, inválido o fuera del rango seguro produce `UNRECOGNIZED`, nunca conversión.

## Herramientas genéricas (futuro)

La interfaz futura `AgentTool<I, O>` tendrá `name`, `description`, `mutates` y `execute`. Las operaciones genéricas de consulta y los tools validados con Zod no forman parte de G1; en fase E, `CaptureBar` llama directamente a los dos servicios de creación definidos en el flujo.

## Undo

Diseño ya soportado por los servicios (fase 0):

| Acción | El servicio devuelve | Deshacer |
|---|---|---|
| `expenses.create` (G1) | el gasto creado | `expenses.delete(id, expectedSnapshot)`; no borra si el gasto cambió |
| `incomes.create` (G1) | el ingreso creado | `incomes.delete(id, expectedSnapshot)`; no borra si el ingreso cambió |
| `expenses.update` | `{ previous, current }` | `expenses.restore(previous)` |
| `expenses.delete` | el gasto borrado | `expenses.restore(deleted)` |

`restore` reescribe la instantánea exacta (mismos ids y fechas) tras comprobar referencias. El deshacer G1 de una creación compara la instantánea en la transacción antes de borrar: `updatedAt` se excluye porque el reloj de tests puede ser fijo; una fila ausente da `NOT_FOUND`, y un registro cambiado da `CONFLICT`. Lo mismo aplica a gastos e ingresos.

## Duplicados (fase 4)

Antes de crear, se buscarán gastos del mismo día con mismo importe y comercio (normalizado) creados recientemente. Si hay coincidencia, se muestra "Posible duplicado" y el usuario decide. Nunca se borra nada automáticamente.

## LLM opcional

`LanguageModelProvider` declara `locality: 'LOCAL' | 'REMOTE'`. Reglas:

- Uno remoto solo se activa por decisión explícita del usuario, con aviso de qué datos salen del dispositivo.
- Las claves de API no se guardan en IndexedDB ni en el bundle.
- El modelo solo propone `Intent`s o llamadas a herramientas; los resultados numéricos siguen viniendo de las herramientas.
- Cambiar de proveedor no toca el dominio ni los servicios.
