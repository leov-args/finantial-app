# Backup y restauración

El formato del backup y del hogar es el mismo JSON. **E2-2 adelanta el formato y la restauración mínima al primer uso** para poder pasar un hogar a otro móvil. La exportación desde Ajustes sigue pendiente de E1-3.

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
