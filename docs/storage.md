# Almacenamiento

## Fuente de verdad

**IndexedDB** (base de datos `family-finance`), accedida exclusivamente a través de Dexie en `src/infrastructure`. El service worker (fase 9) solo cachea la aplicación; nunca es almacén de datos.

## Esquema (versión 1)

| Tabla | Clave | Índices | Contenido |
|---|---|---|---|
| `members` | `id` | `active` | `MemberRecord` |
| `categories` | `id` | `archived` | `CategoryRecord` |
| `incomes` | `id` | `date`, `memberId` | `IncomeRecord` |
| `expenses` | `id` | `date`, `categoryId`, `paidBy`, `ownerId`, `receiptId`, `createdAt` | `ExpenseRecord` |
| `planItems` | `id` | — | `PlanItemRecord`: líneas del plan del hogar, `FORMULA` (importe) o `ASSIGNED` (partes por miembro) |
| `settings` | `id` | — | `SettingsRecord`: una sola fila `household` con la regla de reparto (`splitRule`); sin fila, vale `EQUAL_KEEP` |

`MemberRecord` incluye `referenceIncome` (`MoneyRecord` o `null`) y `color` (clave de la paleta de miembros). «Quién soy en este dispositivo» no está aquí: es una preferencia del dispositivo en `localStorage` (`family-finance.me`), igual que el paso del asistente de primer uso (`family-finance.setup-step`); ninguna entra en los backups.

Los records (`records.ts`) son planos y compatibles con JSON:

- `Money` se guarda como `amountMinor` (entero) + `currency`.
- Las uniones discriminadas se aplanan cuando un campo debe indexarse (`scopeType` + `ownerId`; `ownerId = null` en gastos comunes, e IndexedDB no indexa `null`) o para guardarlas en una sola forma (`PlanItemRecord`: `amountMinor` solo en `FORMULA`, `shares` solo en `ASSIGNED`).
- Todos los campos están siempre presentes (`null` en vez de `undefined`), para backups estables.

Las fechas `YYYY-MM-DD` permiten consultas por rango con el índice `date` (`between('2026-10-01', '2026-10-31')`).

## Lectura y escritura

- **Escritura**: dominio → `xxxToRecord` → `put`.
- **Lectura**: record → `xxxFromRecord` → constructor del dominio. Un registro corrupto (importe decimal, fecha imposible, moneda desconocida) falla al leerse en vez de producir números incorrectos.
- **Transacciones**: cada caso de uso que comprueba y luego escribe se ejecuta en `db.transaction('rw', todas las tablas)` (`DexieTransactionRunner`). IndexedDB no tiene claves foráneas; la integridad referencial la garantiza la capa de aplicación dentro de esa transacción.

## Migraciones

`src/infrastructure/database/migrations.ts` contiene la lista ordenada de versiones.

Reglas:

1. Una versión publicada no se edita ni se borra. Se añade una nueva.
2. Cada versión declara el esquema completo de todas las tablas.
3. La transformación de datos va en `upgrade`, que corre dentro de la transacción `versionchange`: si falla, IndexedDB aborta y los datos anteriores quedan intactos (hay test que lo comprueba).
4. Cada versión nueva lleva su test de migración partiendo de una BD con datos de la versión anterior.
5. Nunca se asume una BD vacía: las semillas solo se crean en el evento `populate` (creación inicial), nunca en upgrades.

El rediseño amplía la propia **v1** (tablas `planItems` y `settings`; en `members`, `referenceIncome` y `color`) porque aún no había datos reales (ver `docs/spec-rediseno.md`, supuesto 5). Versiones previstas: `budgets` y similares (fase 3), `merchantRules` (fase 4) y `receipts` (fase 5).

## Persistencia del navegador

`src/storage/persistence.ts` solicita `navigator.storage.persist()` al arrancar. Sin ello, algunos navegadores (Safari sobre todo) pueden borrar IndexedDB por falta de espacio o inactividad. La UI muestra el estado. Aun así, **el backup periódico es la única garantía real** (ver `backup.md`).

## Recibos (fase 5)

Los blobs se guardarán en IndexedDB en una tabla propia separada de los metadatos, para que listar recibos no cargue los archivos en memoria. Las imágenes se comprimirán antes de guardar para respetar el espacio de móviles con poca memoria.
