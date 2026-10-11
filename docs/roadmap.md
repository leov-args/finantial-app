# Roadmap

**Estado:** aprobado (2026-10-06). Sustituye al orden de la tabla *Fases* del README a partir de la primera versión. Cada ítem tiene después su propia spec, su rama desde `main` y la aprobación del usuario antes de cada paso.

## Decisiones

| Fecha | Decisión |
|---|---|
| 2026-10-05 | **Objetivo: casa primero, producto después.** Uso real en el hogar sin cerrar decisiones que impidan abrir la app a otras familias. |
| 2026-10-05 | **Cada uno usa su móvil.** Mover datos entre dispositivos pasa a ser la prioridad. |
| 2026-10-05 | **Sincronización por archivo, sin red** (opción 1): «Enviar cambios / Recibir» con fusión. No toca la CSP ni necesita servidor. Se descartan por ahora una carpeta en la nube del usuario (opción 2) y un servidor propio o P2P (opción 3). |
| 2026-10-05 | **SaaS con login: solo con cifrado de extremo a extremo** (el servidor guarda bloques que no puede leer) y **solo tras validarlo** con entrevistas. Es la etapa 4. |
| 2026-10-05 | **El historial del plan va antes que la sincronización:** hoy los meses pasados se calculan con el plan y el ingreso de referencia actuales (`PersonalService.monthSummary`), así que cambiar el plan reescribe la historia. |
| 2026-10-06 | **Benchmark (D-1) hecho:** `docs/benchmark.md`. Sube la prioridad de E0-1 y añade «varios gastos en una frase» a la etapa 3. |

## Etapas

| Etapa | Objetivo | Se cierra cuando… | Fases del README |
|---|---|---|---|
| **0. Pulido** | Dejar la v1 redonda | El *Cierre* de la spec del rediseño queda sin pendientes | — |
| **1. Que no se pierda ni se reescriba nada** | Datos fiables | Exportar → borrar → importar deja todo igual, y cambiar el plan no altera meses pasados | 8 |
| **2. Dos móviles** | Uso real en casa | Cada uno registra en su móvil y, tras sincronizar, los dos ven lo mismo | 9 |
| **3. Responder mejor** | Más valor | Al final del mes sabéis si el plan acertó | 3, 4, 7 |
| **4. Producto** | Abrir a otros | Hay evidencia de que alguien lo quiere | 5, 6 |

Las etapas 0–2 salen del uso real del hogar. Las 3 y 4 se apoyan en `docs/benchmark.md`.

## Etapa 0: Pulido

Todo tamaño S.

| Id | Ítem | Criterio de aceptación |
|---|---|---|
| E0-1 | ~~**Botón «i» en Familiar**~~ **Hecho (2026-10-11): botón «i» en Ajustes** (prioridad: explica el diferencial, ver benchmark) | Una hoja modal junto al selector de la regla de reparto: el peso de cada uno, el % sobre su propio sueldo y que las líneas asignadas quedan fuera; explica las dos reglas con las cifras del hogar. Se movió de Familiar a Ajustes porque allí repetía «Cómo se calcula». **Pendiente, aparte:** comparar las reglas («a partes iguales», «proporcional», «os quedáis con lo mismo») con las cifras del hogar. |
| E0-2 | ~~Botón «i» en la barra de captura~~ **Hecho (2026-10-11)** | Lo anotado en el *Backlog* de la spec: ejemplos sacados de `t()` que siguen a la gramática de `src/agent/parser.ts`. |
| E0-3 | ~~Accesibilidad~~ **Hecho (2026-10-11)** | El lector de pantalla oye la fecha y la categoría de cada fila (`personal.openExpense`, `family.openLine`/`openLineAssigned`). El chevron de «Cómo se calcula» respeta `prefers-reduced-motion`. |
| E0-4 | ~~Hoja~~ **Hecho (2026-10-11; arrastre en móviles reales pendiente)** | Velocidad acotada al soltar (`useSheet`). `shouldDismiss()` puro con un test de 3 casos. Pendiente: probar el arrastre en un Android y un iPhone reales. |
| E0-5 | ~~Deuda visual~~ **Hecho (2026-10-11)** | `--member-ink` en modo oscuro; los campos con borde de la fase 1 pasan a rellenos; el separador de «Cuadra» va al catálogo. Las hojas opacas que salen del borde se **aceptan** y se documentan en `DESIGN.md`. |

## Etapa 1: Que no se pierda ni se reescriba nada

| Id | Ítem | Tamaño | Criterio de aceptación |
|---|---|---|---|
| E1-1 | **Historial del plan y de los ingresos de referencia** | L | Cambiar el plan o un ingreso en el mes N no altera ningún mes anterior a N, ni en Personal ni en Familiar. Migración con su test. *Decisión de su spec:* fechas de vigencia por línea e ingreso, o un «cierre de mes» que congele la aportación. |
| E1-2 | Borrados con marca (*tombstones*) | S–M | Tabla nueva `tombstones {table, id, deletedAt}` escrita en la misma transacción que el borrado; deshacer la quita. Las consultas actuales no cambian. Migración con su test. |
| E1-3 | Backup: exportar y restaurar (reemplazar) | M | En Ajustes. Archivo JSON con los records y los borrados (sin ZIP hasta que existan recibos; `formatVersion` permite añadirlo). La restauración sigue `docs/backup.md`: valida todo, muestra un resumen, pide confirmación y escribe en una transacción. Tests: ida y vuelta exacta, archivo inválido, versión más nueva rechazada, referencia rota, reversión si falla a mitad. Actualizar `docs/backup.md`. |

## Etapa 2: Dos móviles

El archivo de backup y el de sincronización son **el mismo formato**: restaurar *reemplaza* y recibir *fusiona*.

| Id | Ítem | Tamaño | Criterio de aceptación |
|---|---|---|---|
| E2-1 | PWA instalable y offline | M | Manifest, iconos y un service worker escrito a mano, sin dependencias. Funciona en modo avión tras la primera carga. Avisa de que hay una versión nueva. La CSP no cambia. Probado en GitHub Pages en Android e iOS. |
| E2-2 | Unirse a un hogar | M | En el primer uso, «Ya tenemos hogar: abrir archivo» importa los datos y luego pregunta quién eres. No se crean miembros duplicados. «Quién eres» sigue en `localStorage`, por dispositivo. |
| E2-3 | Enviar cambios | S | Genera el archivo y lo comparte con la Web Share API (WhatsApp, AirDrop); si no está disponible, lo descarga. |
| E2-4 | **Recibir y fusionar** | L | Por cada registro gana el `updatedAt` más reciente, y los borrados se aplican. Valida todo antes de escribir y escribe en una transacción. Muestra un resumen («5 nuevos, 2 actualizados, 1 borrado») antes de confirmar. **Idempotente:** recibir el mismo archivo dos veces no cambia nada. **Convergente:** tras A→B y B→A los dos dispositivos quedan iguales. |
| E2-5 | Estado de sincronización | S | «Última sincronización hace N días» en Ajustes. |

**Riesgos aceptados:**
- Si los relojes de los dos móviles van desfasados, «gana el último» puede elegir mal. Para dos personas es aceptable.
- Si los dos editan el mismo registro entre una sincronización y otra, gana una de las dos ediciones. El resumen lo hace visible.

## Etapa 3: Responder mejor (a grandes rasgos)

Se detalla al empezarla.

- **Presupuesto del plan contra gastos reales:** «Comida 520» como presupuesto; a final de mes se ve si acertó. Se acerca al modelo de sobres de YNAB y Goodbudget sin convertir la app en uno.
- **Objetivos de ahorro.**
- **Asistente sin LLM:** varios gastos en una frase («gasto 12 comida, 5 café»), tolerancia a variantes y consultas («¿cuánto llevo en comida?»).

## Etapa 4: Producto (a grandes rasgos, con validación previa)

1. **Entrevistas** con 5–10 parejas sobre las hipótesis de `docs/benchmark.md`: si la regla «os quedáis con lo mismo» convence, si pagarían por sincronización cifrada por hogar y si «sin bancos» es una ventaja.
2. Solo si se valida:
   - sincronización cifrada de extremo a extremo con login, reutilizando la fusión de E2-4 (requiere ADR para la CSP);
   - idiomas y monedas;
   - recibos y OCR local, en un trozo que se carga bajo demanda por el presupuesto del bundle.

## Lo que no haremos

Viene de `docs/benchmark.md`:

- conectar bancos o agregadores;
- anuncios, límites diarios o funciones gratuitas que pasen a pago;
- marketplace o recomendación de productos financieros;
- deudas por transacción al estilo Splitwise (ADR-011);
- LLM en la nube para registrar gastos.

## Hecho

- **D-1 Benchmark** (2026-10-06): `docs/benchmark.md`.
