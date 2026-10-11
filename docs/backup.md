# Backup y restauración

El formato del backup y del hogar es el mismo JSON. **E2-2 adelanta el formato y la restauración mínima al primer uso** para poder pasar un hogar a otro móvil. **E2-3 añade la exportación desde Ajustes**: genera el archivo y lo comparte con la Web Share API, o lo descarga si no está disponible. Todavía no incluye tombstones (E1-2) ni recibos.

## Formato (`formatVersion: 1`)

```json
{
  "format": "family-finance-household",
  "formatVersion": 1,
  "dbVersion": 2,
  "appVersion": "0.1.0",
  "createdAt": "2026-10-11T10:00:00.000Z",
  "data": {
    "members": [],
    "categories": [],
    "incomes": [],
    "expenses": [],
    "planItems": [],
    "settings": [],
    "monthSnapshots": []
  }
}
```

`data` contiene los records tal cual, no objetos de dominio. Todavía no incluye tombstones (E1-2) ni recibos. No hay ZIP ni sumas de comprobación. El tamaño máximo es 20 MB. Se rechaza una `formatVersion` desconocida y un `dbVersion` posterior al de la aplicación; las tablas ausentes en una versión anterior cuentan como vacías.

## Unirse a un hogar (E2-2)

En el primer uso, el paso 1 permite abrir un `.json`. La aplicación valida el formato, reconstruye cada record con su mapper y verifica ids únicos y referencias antes de mostrar los nombres de los miembros, el número de gastos, ingresos y líneas del plan, y el rango de fechas. Cancelar no escribe nada.

Al confirmar, la base vacía se reemplaza en una transacción de escritura; si cualquier escritura falla, IndexedDB revierte todos los cambios. Las categorías predeterminadas que se crean al abrir una base nueva no cuentan como datos del hogar y también se reemplazan. Tras importar, si hay más de un miembro activo se pregunta quién usa este dispositivo; la elección se guarda solo en `localStorage`. Con un único miembro activo se continúa directamente a Personal.

No se fusionan hogares. Una segunda importación en un dispositivo que ya tiene datos se rechaza. La exportación desde Ajustes y la inclusión de tombstones en el backup corresponden a E1-3, tras E1-2; se ampliará el formato de forma versionada si hace falta.

## Tests previstos

- Ida y vuelta exacta hogar → archivo → base vacía, incluidas las instantáneas.
- JSON/formato inválido, versión de base más nueva, archivo mayor de 20 MB, record corrupto, ids duplicados y referencias rotas.
- Rechazar una base no vacía y comprobar la reversión si falla una escritura intermedia.
- En UI: mostrar resumen, cancelar sin escribir, mostrar error de archivo inválido, guardar «quién eres» por dispositivo y saltar la pregunta con una sola persona activa.

## E1-2 database version

The application writes `dbVersion: 3`. The backup data shape is unchanged and does not include tombstones; files with older database versions remain importable, with absent tables treated as empty.

## E1-3 current behavior

The sections above record the pre-E1-3 format and first-use flow. This section supersedes their statements about the current database version, tombstones, and replacing an existing household.

Household files keep `formatVersion: 1` and write `dbVersion: 3`. Their `data` contains the record arrays for members, categories, incomes, expenses, plan items, settings, month snapshots, and tombstones. Each tombstone is `{ "table": "members", "id": "deleted-id", "deletedAt": "2026-10-02T10:00:00.000Z" }`; `table` is one of `members`, `categories`, `incomes`, `expenses`, or `planItems`. Tombstone timestamps must be valid ISO UTC timestamps. A file cannot contain duplicate tombstones for the same table and id, or a tombstone for an id that is still live in that table.

Files with `dbVersion` 1 or 2 remain importable; missing tables, including tombstones, are treated as empty. A version 3 file must include every table, including `tombstones`. Files with a newer database version are rejected. The maximum file size is 20 MB. The file contains records, not domain objects; it is not compressed, checksummed, encrypted, or accompanied by receipts.

Joining a household during first use still requires an empty database (the default seeded categories are allowed). In Ajustes, **Copia de seguridad** can instead preview a valid file and replace all data on the device after explicit confirmation. The warning recommends sending the current data first. Cancel and invalid files do not write anything. Restore clears every data table, including seeded categories, month snapshots, and tombstones, then writes the file in one IndexedDB read-write transaction. A failed write rolls the transaction back. Restore does not merge households. The device's “who am I” preference remains only when its member id is active in the restored household; otherwise it is cleared.

The existing “Send changes” action exports the backup file. There is no separate export action. The file summary shown before joining or restoring is unchanged: member names, expense/income/plan counts, and the date range.
