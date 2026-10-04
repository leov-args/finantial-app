# Modelo de dominio

Todo el código está en `src/domain`. Es TypeScript puro, inmutable (`Object.freeze`) y determinista. Los tipos usados aquí son los que viajan por toda la app.

## Tipos base

| Tipo | Representación | Notas |
|---|---|---|
| `MemberId`, `CategoryId`, `IncomeId`, `ExpenseId`, `ReceiptId` | `string` con marca (branded) | No se puede pasar un `MemberId` donde se espera un `CategoryId`. Formato `[A-Za-z0-9_-]{1,64}`. |
| `IsoDate` | `"YYYY-MM-DD"` | Fecha de calendario **local**, sin hora ni zona. Orden lexicográfico = cronológico. |
| `YearMonth` | `"YYYY-MM"` | Mes. `monthRange()` da el rango inclusivo. |
| `Timestamp` | ISO-8601 UTC | Solo para auditoría (`createdAt`, `updatedAt`). |
| `Clock` | `{ now(): Date }` | Inyectado: tests y expresiones como "ayer" son deterministas. |

## Money

```ts
interface Money { amountMinor: number; currency: CurrencyCode }   // 4235 EUR = 42,35 €
```

- `amountMinor` es siempre un entero seguro. Nunca se guarda ni se opera con decimales en coma flotante.
- `CurrencyCode`: `EUR | USD | PEN` (añadir una moneda es añadir una línea en `currency.ts`). No hay conversión: sumar o comparar monedas distintas lanza `CURRENCY_MISMATCH`.
- Todo cálculo con redondeo usa `BigInt` y un modo explícito (`HALF_UP` por defecto, `HALF_EVEN` disponible).

| Función | Uso |
|---|---|
| `add`, `subtract`, `negate`, `abs`, `sum(list, currency)` | aritmética exacta |
| `multiply(m, entero)` | p. ej. 12 cuotas |
| `multiplyRatio(m, num, den, modo)` | una sola división, un solo redondeo |
| `percentage(m, basisPoints)` | 2150 bp = 21,50 % |
| `allocate(total, pesos)` | **reparto exacto**: las partes suman siempre el total (método del mayor resto, desempate por índice) |
| `shareInBasisPoints(parte, total)` | porcentaje **solo para mostrar** |
| `parseMoney(texto, moneda)` | "42,35", "1.234,56", "1,234.56", "42 €"… sin floats; rechaza más decimales de los permitidos |
| `format(m, 'es-ES')`, `toMajorString(m)` | presentación |

Uso en el reparto del hogar (rediseño): lo que queda tras cubrir las líneas por fórmula se reparte a partes iguales.

```text
allocate(1.899,99 €, pesos = [1, 1])  →  [950,00 €, 949,99 €]   // el céntimo sobrante, según la regla Q2
```

## Member

```ts
Member { id, name, active, createdAt, updatedAt }
```

- No se asume un número fijo de miembros ni nombres concretos.
- Un miembro con historial (gastos pagados, gastos propios o ingresos) **no se borra**: se desactiva. Así ningún registro apunta a alguien que no existe.

## Category

```ts
Category { id, name, archived, createdAt, updatedAt }
```

- 14 categorías iniciales con id estable (`cat-housing`, `cat-food`…) y nombre en español (Vivienda, Comida, Transporte, Salud, Educación, Ocio, Suscripciones, Ropa, Viajes, Compras, Impuestos, Seguros, Ahorro, Otros). Se crean **una sola vez**, al crear la base de datos.
- El usuario puede crear, renombrar y archivar. Los nombres son únicos sin distinguir mayúsculas ni acentos.
- Una categoría con gastos no se borra: se archiva (deja de aparecer en selectores, los gastos antiguos siguen siendo válidos).
- Ninguna regla de negocio depende de una categoría concreta.

## Income

```ts
Income {
  id, memberId, amount: Money, date: IsoDate,
  schedule: { kind: 'MONTHLY', variability: 'FIXED' | 'VARIABLE' } | { kind: 'ONE_OFF' },
  source: 'SALARY' | 'FREELANCE' | 'BONUS' | 'OTHER',
  description, notes, createdAt, updatedAt
}
```

- Un ingreso es **dinero recibido en una fecha** (ADR-006). `schedule` describe su naturaleza (nómina fija, freelance variable, bonus puntual); no proyecta importes a otros meses.
- "Puntual + fijo" no es representable (unión discriminada).
- Cálculos: `monthlyIncome`, `annualIncome`, `totalIncome(rango)`, `incomeByMember` (incluye miembros con 0 € y su porcentaje de visualización).

## Expense

```ts
Expense {
  id, description, merchant: string | null, amount: Money, date: IsoDate,
  categoryId, expenseType: 'FIXED' | 'VARIABLE',
  scope: { type: 'SHARED' } | { type: 'INDIVIDUAL', ownerId: MemberId },
  paidBy: MemberId,
  recurrence: null
    | { frequency: 'WEEKLY',  dayOfWeek: 1..7 }        // ISO: 1 = lunes
    | { frequency: 'MONTHLY', dayOfMonth: 1..31 }      // 29–31 = o último día del mes
    | { frequency: 'YEARLY',  month: 1..12, day },
  notes, receiptId: ReceiptId | null, createdAt, updatedAt
}
```

- **`scope` responde a "¿de quién es el gasto?"; `paidBy` a "¿quién lo pagó?"**. Son independientes: Ana puede pagar las gafas de su pareja (individual de la pareja, pagado por Ana).
- Importe estrictamente positivo. Las devoluciones quedan fuera del MVP (decisión pendiente).
- `description` es obligatoria en el dominio; el caso de uso la deriva del comercio o, si no hay, del nombre de la categoría, para que el registro rápido no pida más campos.
- `recurrence` es metadato: no se generan gastos futuros automáticamente (ADR-007).
- Un gasto es una transacción real. **Las transferencias entre miembros no son gastos** (ver abajo).

## Plan familiar y aportes (rediseño)

Lo define `docs/spec-rediseno.md` (F1–F7, decisiones Q1–Q5). En resumen:

- `Member.referenceIncome: Money | null` es el ingreso mensual de referencia, y `Member.color` una clave de paleta (A6).
- `PlanItem` es una línea del plan común:
  - `FORMULA`: un importe, repartido para que todos conserven lo mismo;
  - `ASSIGNED`: un importe por miembro, que se suma a su aporte. El total de la línea es la suma de las partes.
- `contributions(participantes, líneas)` es una función pura:
  1. `restante = Σ ingresos − Σ líneas por fórmula`;
  2. `conserva = allocate(restante, [1, …])`;
  3. `aporte = ingreso − conserva + Σ asignadas`.

  Los aportes suman exactamente el total del plan.
- Lo común **no** se registra como gastos: vive en el plan. Las transferencias entre miembros (`Settlement`) quedan aplazadas (ADR-011).
