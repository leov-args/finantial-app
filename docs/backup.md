# Backup y restauración

Estado: **diseño**. Implementación en la fase 8. Es la única protección contra la pérdida del dispositivo o el borrado del almacenamiento del navegador.

## Formato

```text
family-finance-backup-YYYY-MM-DD.zip
├── metadata.json
├── data.json
└── receipts/
    └── <receiptId>.<ext>
```

`metadata.json`:

```json
{
  "format": "family-finance-backup",
  "formatVersion": 1,
  "dbVersion": 1,
  "appVersion": "0.1.0",
  "createdAt": "2026-10-02T21:52:00.000Z",
  "counts": { "members": 2, "categories": 14, "incomes": 6, "expenses": 120, "receipts": 15 },
  "checksums": { "data.json": "sha256-…", "receipts/rcp-1.jpg": "sha256-…" }
}
```

`data.json`: un objeto por tabla con los **records** tal cual (`MemberRecord[]`, `ExpenseRecord[]`…), más `settings`. Usar el formato de records (no el de dominio) hace que el backup coincida con `dbVersion` y que las migraciones existentes sirvan también para backups antiguos.

## Exportar

1. Leer todas las tablas en una única transacción de lectura (instantánea coherente).
2. Escribir `data.json`, los blobs y las sumas SHA-256 (`crypto.subtle`, local).
3. Generar el ZIP en el navegador y descargarlo. Nada sale del dispositivo salvo la descarga que el usuario inicia.

## Restaurar

Nunca se tocan los datos actuales hasta que todo lo siguiente ha pasado:

1. Abrir el ZIP y leer `metadata.json`; `format` correcto.
2. **Versión**: `dbVersion` ≤ versión actual (si es menor, se migra en memoria con las mismas funciones que las migraciones); si es mayor, se rechaza ("backup de una versión más nueva").
3. **Integridad**: checksums correctos; recibos referenciados presentes.
4. **Esquema**: cada record se valida con Zod y se reconstruye con los constructores del dominio (mismo camino que una lectura normal).
5. **Referencias**: ids únicos por tabla; todo `paidBy`, `ownerId`, `memberId`, `categoryId`, `receiptId` apunta a algo existente en el backup.
6. Mostrar resumen (recuentos, rango de fechas) y pedir confirmación.
7. Restaurar en **una única transacción** `rw`: vaciar tablas y escribir. Si algo falla, IndexedDB revierte y los datos anteriores siguen ahí.

Modo inicial: **reemplazar** todo. La fusión de backups queda fuera del MVP.

## Tests previstos

Exportar → importar (ida y vuelta exacta, incluidos blobs), backup inválido, versión incompatible, recibo ausente, ids duplicados, referencia rota, fallo a mitad de escritura (rollback).
