# Familiar: lo que de verdad le queda a cada uno

**Estado:** hecho (2026-10-05).

## Problema

En Familiar, «Se queda con», «Cada uno se queda con» y «Después de pagar» solo restaban los gastos comunes (líneas por fórmula). Las líneas asignadas se sumaban a la aportación, pero no a lo que queda. Además, la cuenta por persona (`3.000,00 − 458,99 + 399,53 MediaMarcket = 2.940,54`) terminaba en la aportación y se leía como dinero que queda.

Con el caso del usuario (ingresos 3.000 / 1.200, gastos comunes 3.282,01, MediaMarcket 399,53 / 45,47) la pantalla decía 458,99 · 459,00 y 917,99 después de pagar. Lo real era 59,46 · 413,53 y 472,99.

## Decisión (usuario, 2026-10-05): opción A

Una línea asignada es gasto propio de quien la tiene. La regla de Ajustes (A7) sigue repartiendo solo los gastos comunes. **Ninguna aportación cambia**, solo lo que significa «queda»:

- `keeps = ingreso − aporte total` (asignadas incluidas).
- `remaining` («Después de pagar») `= Σ ingresos − Σ todo el plan`. El déficit (F7) cuenta también las asignadas.
- La cuenta por persona termina en lo que queda: `3.000,00 − 2.541,01 comunes − 399,53 MediaMarcket = 59,46` (Proporcional: `− 2.344,29 (78,1 %)`).
- Los datos muestran «Líneas asignadas» como resta aparte cuando las hay. Se quita la fila «Cada uno se queda con».

Las cuatro combinaciones con ese ejemplo, como contexto (lo que se queda Leo · Meda):

| Regla | Solo comunes (A, elegida) | Todo el plan (B) |
|---|---|---|
| Igualar | 59,46 · 413,53 | 236,49 · 236,50 |
| Proporcional | 256,18 · 216,81 | 337,85 · 135,14 |

**B queda descartada por ahora.** Consiste en repartir el plan entero con la regla y descontar lo ya pagado en asignadas. Si se retoma, hay que decidir qué pasa cuando las asignadas de alguien superan su parte, porque su parte de los comunes saldría negativa.

## Criterios

- El test de dominio con el caso del usuario da keeps `[5946, 41353]`, remaining `47299` y totals `[294054, 78647]`.
- La vista Familiar muestra la cuenta terminando en lo que queda, para las dos reglas (`family.test.tsx`, «C fix 3»).
