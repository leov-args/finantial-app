# Intención confirmada: rediseño de Family Finance

Confirmada con el usuario el 2026-10-03, tras una entrevista. Es la entrada de la fase de diseño (`/impeccable init`, `shape`) y de la spec del rediseño. No es todavía una spec.

## Por qué

La fase 1 es un CRUD genérico (miembros, categorías, gastos, ingresos y un resumen) que no responde a las dos preguntas reales del hogar:

1. **¿Cuánto aporta cada uno al hogar este mes?**
2. **¿Cómo voy yo?** Cuánto me queda y cuánto voy a ahorrar.

## Qué queremos

Tres secciones, más una de Ajustes (miembros, categorías e ingresos de referencia).

### Familiar
- Un **plan de gastos comunes**: una lista fija que se edita de vez en cuando, no cada mes. En invierno, por ejemplo, se añaden calefacción y agua caliente. Luz y agua varían poco y no se actualizan mensualmente.
- Cada línea es de uno de dos tipos:
  - **Por fórmula:** se reparte para que los dos se queden con lo mismo.
  - **Asignada:** cada persona asume un importe concreto. Ejemplo: Portátil 350, Ana 300 y su pareja 50. Se mantiene hasta que se quite; puede que uno siga pagando y el otro no, en cuyo caso su parte pasa a 0.
- Al añadir, editar o quitar una línea, **los aportes se recalculan al momento**.
- Los ingresos de cada persona son un **importe de referencia** (las nóminas, fijas) que se edita cuando cambia.

**Fórmula del usuario (líneas por fórmula):**
1. Sumar los ingresos de los dos.
2. Sumar los gastos comunes.
3. Restar los gastos a los ingresos totales.
4. Dividir lo que queda entre dos.
5. Cada persona conserva esa misma cantidad.
6. Aporte = ingreso individual − cantidad disponible.
7. Excluir los gastos personales y usar precisión decimal.

A esto se suman los importes asignados de cada persona.

**Ejemplo de referencia** (ingresos 2.600 y 1.400; líneas por fórmula 2.100,01 €; Portátil asignado):

| | Persona A | Persona B |
|---|---:|---:|
| Disponible (fórmula) | 949,99 € | 950,00 € |
| Aporte por fórmula | 1.650,01 € | 450,00 € |
| + Portátil asignado (300 / 50) | 1.950,01 € | 500,00 € |

Los aportes suman exactamente el total del plan. En el ejemplo original del usuario, con decimales sueltos, salían 1.650,01 + 450,01, un céntimo de más.

**Plan actual del hogar:** Alquiler 900,00 · Comida 520,00 · Colegio 350,00 · Seguro 195,01 · Luz 60,00 · Internet 45,00 · Agua 30,00 · Portátil 340,00 (asignada). Total: 2.440,01 €.

**Preguntas abiertas → resueltas en `docs/spec-rediseno.md` (Decisiones Q1–Q5):**
- **Importe de las líneas asignadas.** En el plan, Portátil figura con 340 €, pero el ejemplo de reparto (300 + 50) suma 350 €. Propuesta: en una línea asignada, el importe es la suma de las partes, y no se escribe aparte.
- **Céntimo sobrante.** ¿Quién se lo queda cuando el restante es impar? En la tabla de arriba lo paga quien más ingresa.
- **Aporte negativo.** ¿Qué pasa si el ingreso de alguien es menor que la parte disponible? El aporte saldría negativo, es decir, recibiría dinero.
- **Pantallas actuales.** ¿Qué pasa con las pantallas de Gastos e Ingresos de la fase 1?

### Personal
- **Ahorro del mes = ingreso de referencia − aporte familiar − gastos personales del mes.**
- Resumen visual de los gastos personales por categoría y por mes: «llevas X gastado; si sigues así ahorrarás Y».
- Los gastos del día a día se registran como **personales**. Lo común vive en el plan.
- Pertenece a un miembro: en un mismo dispositivo hay un selector de quién eres.

### Asistente «tonto»
- Acepta frases con estructura fija, como «gasto 126», «gasto 126 comida» o «ingreso 1200», y pregunta lo que falte.
- Sin imágenes ni PDF por ahora. Funciona sin LLM (ver `docs/agent.md`).

## Restricciones
- Offline, sin servidor ni sincronización, por ahora.
- Uso sobre todo en móvil, pero **debe funcionar bien en escritorio**.
- Dos personas usuarias, aunque de momento en un solo dispositivo.
- Siguen vigentes las reglas de CLAUDE.md: dinero en céntimos, capas, CSP estricta y privacidad.

## Futuro (no cerrar la puerta)
- PWA o app ligera en los móviles de los dos y, quizá, publicación en las tiendas de Android e iOS. Eso requiere sincronización.

## Backlog (fuera de este rediseño)
- **Validar el presupuesto de las líneas del plan:** «Comida 500» como presupuesto, al que se asignan gastos reales; a final de mes se ve si fue correcto. Encaja con la fase 3.
- Sincronización entre dispositivos, PWA instalable y apps de tienda.
- Fotos y PDF de tickets (OCR).
- Resúmenes conversacionales del asistente.
- Historial de cambios del plan, mes a mes.
