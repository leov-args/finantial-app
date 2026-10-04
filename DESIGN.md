---
name: Family Finance
description: Asistente local de finanzas del hogar, con el lenguaje de diseño de Apple traducido a la web, en modo Operate y pensado primero para móvil.
colors:
  system-blue: "#0066cc"
  on-accent: "#ffffff"
  system-green: "#248a3d"
  system-red: "#d70015"
  grouped-background: "#f2f2f7"
  surface: "#ffffff"
  fill-secondary: "rgba(120, 120, 128, 0.12)"
  label: "#1c1c1e"
  secondary-label: "#6c6c70"
  separator: "rgba(60, 60, 67, 0.18)"
  bar-material: "rgba(249, 249, 249, 0.78)"
  member-blue: "#007aff"
  member-indigo: "#5856d6"
  member-purple: "#af52de"
  member-pink: "#ff2d55"
  member-orange: "#ff9500"
  member-teal: "#5ac8fa"
  member-mint: "#00c7be"
  member-brown: "#a2845e"
typography:
  large-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "clamp(2rem, 8vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  hero-figure:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 10vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontFeature: "tnum"
  app-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  subheadline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  tab-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "6px"
  row: "0.5rem"
  nav-item: "0.6rem"
  field: "0.65rem"
  card: "12px"
  sheet: "1rem"
  pill: "999px"
  circle: "50%"
spacing:
  xxs: "0.25rem"
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.5rem"
  xxl: "2rem"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.label}"
    rounded: "{rounded.control}"
    padding: "0.35rem 0.7rem"
  button-primary:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "0.35rem 0.7rem"
  button-danger:
    textColor: "{colors.system-red}"
    rounded: "{rounded.control}"
  icon-button:
    textColor: "{colors.system-blue}"
    rounded: "{rounded.circle}"
    size: "2.5rem"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "1rem"
  list-row:
    textColor: "{colors.label}"
    rounded: "{rounded.row}"
    padding: "0.7rem 0.5rem"
  list-row-pressed:
    backgroundColor: "{colors.fill-secondary}"
  add-row:
    textColor: "{colors.system-blue}"
    rounded: "{rounded.row}"
    padding: "0.7rem 0.5rem"
  field-filled:
    backgroundColor: "{colors.fill-secondary}"
    textColor: "{colors.label}"
    rounded: "{rounded.field}"
    padding: "0.7rem 0.75rem"
  nav-item:
    textColor: "{colors.secondary-label}"
    rounded: "{rounded.nav-item}"
    padding: "0.55rem 0.75rem"
  nav-item-active:
    backgroundColor: "{colors.fill-secondary}"
    textColor: "{colors.system-blue}"
  tab-bar:
    backgroundColor: "{colors.bar-material}"
    height: "3.75rem"
  capture-composer:
    backgroundColor: "{colors.fill-secondary}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.3rem 0.25rem 0.85rem"
  capture-send:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.circle}"
    size: "2rem"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.label}"
    rounded: "{rounded.sheet}"
    padding: "1.25rem 1rem"
  member-dot:
    backgroundColor: "{colors.member-blue}"
    rounded: "{rounded.circle}"
    size: "1.75rem"
  progress-track:
    backgroundColor: "{colors.fill-secondary}"
    rounded: "{rounded.pill}"
    height: "0.75rem"
---

# Design System: Family Finance

## Overview

**Creative North Star: "La app del sistema que faltaba"**

Family Finance se comporta como si fuera una app más del sistema operativo: fuente del sistema, listas agrupadas sobre un fondo gris agrupado, colores del sistema que cambian solos entre claro y oscuro, barras translúcidas y respuesta táctil inmediata. La dirección la fijó el usuario (el lenguaje de diseño de Apple, traducido a la web) y el build la cumple con CSS nativo, un set de iconos propio y resortes de `motion/mini`, sin fuentes externas ni estilos en línea (CSP estricta).

Es una herramienta de modo *Operate*: densa pero tranquila, para apuntar un gasto con una mano y revisar el plan del hogar de vez en cuando. La jerarquía la llevan los títulos grandes y las cifras, no la decoración: la única cifra héroe es el ahorro del mes, y la prueba de confianza es la cuenta visible («Cómo se calcula», «Cuadra» con su check verde). Todo número usa cifras tabulares para que las columnas de importes alineen.

Rechazos confirmados en el contrato: estética de banca o *fintech*, gráficos decorativos y gamificación. Los gráficos son SVG/CSS nativos y solo muestran cifras que salen del dominio.

**Key Characteristics:**
- Fuente del sistema con tracking negativo que crece con el tamaño.
- Tarjetas blancas (negras en oscuro) sobre fondo agrupado, casi sin sombra.
- Un único acento, el azul del sistema, para lo accionable y lo actual.
- Verde y rojo reservados para estado (cuadra/ahorro, error/déficit).
- Materiales translúcidos solo en la navegación flotante (barra de pestañas y barra de captura).
- Pulsación en pointer-down: los botones se encogen, las filas se iluminan.
- Hojas nativas `<dialog>` que entran y salen por el mismo borde con resortes interrumpibles.

## Colors

Paleta de sistema Apple con dos juegos completos (claro y oscuro vía `prefers-color-scheme`), todos como custom properties en `:root` de `src/ui/styles.css`. Los valores del frontmatter son los del modo claro; los del modo oscuro van en el sidecar (`colorMeta.<token>.dark`).

### Primary
- **Azul del sistema, versión AA** (`--accent`): enlaces, botón primario, pestaña y mes actuales, barras de categoría, filas de «Añadir…», botón de enviar de la captura, anillo de foco, caret y `accent-color`. En claro se oscurece respecto al azul de Apple para pasar AA sobre blanco; en oscuro usa el azul oscuro del sistema con texto negro encima (`--on-accent`).

### Tertiary
- **Paleta de miembros** (`--member-*`, ocho claves: blue, indigo, purple, pink, orange, teal, mint, brown): identidad de cada persona del hogar en el punto de miembro y el selector de color. Se aplican solo mediante `data-color` (que fija `--member-color` y, en orange/teal/mint, tinta oscura `--member-ink`), nunca con estilos en línea.

### Neutral
- **Fondo agrupado** (`--bg`): lienzo de toda la app y `theme-color` del navegador.
- **Superficie** (`--surface`): tarjetas, hojas, botones por defecto.
- **Relleno secundario** (`--surface-secondary`): campos rellenos, pistas de barras, fila pulsada, pestaña activa, compositor de captura.
- **Etiqueta** (`--text`): texto principal y títulos.
- **Etiqueta secundaria** (`--muted`): texto de apoyo, etiquetas de campo, iconos de chevron, segmento «Hogar» y meses pasados del histórico.
- **Separador** (`--border`): líneas entre filas, borde de barras flotantes y grabber.
- **Material de barra** (`--bar`): fondo translúcido de pestañas y captura, siempre con `backdrop-filter: blur(20px) saturate(180%)`.

### Status
- **Verde del sistema** (`--positive`): «Cuadra», segmento de ahorro, mensajes de éxito.
- **Rojo del sistema** (`--negative`): errores de campo, aviso de déficit, botón Borrar.

### Named Rules
**The One Accent Rule.** El azul es el único color de acción. Lo actual (pestaña, mes en el histórico) y lo pulsable usan azul; nada más compite con él.

**The Reserved Status Rule.** Verde y rojo significan estado y nada más. Por eso la paleta de miembros no incluye verde ni rojo.

**The Member Through Attribute Rule.** El color de una persona llega siempre por `data-color` y la variable `--member-color`; nunca por `style`, porque la CSP lo prohíbe.

## Typography

**Display Font:** fuente del sistema (`-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`)
**Body Font:** la misma pila del sistema
**Label/Mono Font:** ninguna distinta; las cifras usan `font-variant-numeric: tabular-nums` (activado en `:root`).

**Character:** una sola familia, la del dispositivo, como en una app nativa. El carácter sale del tamaño, el peso y el tracking, no de una fuente de marca.

### Hierarchy
- **Large title** (700, `clamp(2rem, 8vw, 3rem)`, 1.05, -0.04em): título de cada sección (Personal, Familiar, Ajustes, primer uso) y de los estados vacíos.
- **Hero figure** (700, `clamp(2.25rem, 10vw, 3.25rem)`, 1, -0.035em): la cifra «Este mes vas a ahorrar». Una por pantalla.
- **App title** (700, 1.1rem, -0.01em): nombre de la app en la cabecera o el rail.
- **Title** (700, 1rem): título de tarjeta («Las cuentas del mes», «Plan del hogar»), mes del selector, títulos de hoja. El paso de primer uso sube a 1.35rem.
- **Body** (400, 1rem / 16px, 1.5): filas, valores, campos. Los campos nunca bajan de 16px (evita el zoom de iOS).
- **Subheadline** (400, 0.85–0.95rem): importes por categoría, avisos de captura, etiquetas de campo en Ajustes (0.95rem), `small` (0.875rem).
- **Caption** (400, 0.72–0.78rem): leyenda de la barra de ahorro, meses del histórico, «Asignada», identidad e historial de la captura, etiquetas de pestaña (0.72rem).
- Pesos intermedios: 600 para importes en filas y listas de definición; 650 para pestaña activa, estado «Cuadra»/déficit y swatch seleccionado.

### Named Rules
**The Tracking Scales With Size Rule.** Cuanto más grande el texto, más negativo el tracking: -0.04em en el título grande, -0.035em en la cifra héroe, -0.01em en el título de la app, normal en el cuerpo.

**The Tabular Money Rule.** Todo importe se compone con cifras tabulares, alineado a la derecha en las listas de cuentas.

## Layout

Mobile-first con un único corte en **900px** (el mismo que usa `useWide()` en `common.tsx`).

- **Móvil (< 900px):** una columna dentro de `.shell` (ancho `min(1100px, 100%)`, padding 1rem respetando `env(safe-area-inset-*)`). La barra de pestañas (3.75rem) queda fija abajo y la barra de captura flota encima, separada 0.5rem y con ancho máximo 38rem. El padding inferior de la página suma la altura medida de la captura (`--capture-bar-height`), la de pestañas y 1.5rem, para que nada quede tapado. El aviso de deshacer flota por encima de la captura.
- **Escritorio (≥ 900px):** rejilla de dos columnas, rail de 14rem y contenido, separadas 2rem. El rail es sticky, ocupa `100dvh - 2rem` y lleva la captura al pie. Personal pasa a dos columnas de tarjetas (cabecera y gastos a todo el ancho); Familiar a dos columnas, plan | transferencias, con la segunda sticky. Las hojas pasan a panel lateral derecho de 26rem a toda altura.
- **Ritmo:** pasos de 0.25rem; 1rem entre tarjetas, 1.25rem entre bloques del main, 0.75rem bajo los títulos de tarjeta, 0.8rem entre filas de listas sin separador. El primer uso se limita a 40rem de ancho.
- `index.html` declara `viewport-fit=cover`, `interactive-widget=resizes-content`, `color-scheme: light dark` y un `theme-color` por modo igual al fondo agrupado.

**The Safe Area Rule.** Todo lo que toca un borde de la pantalla (shell, pestañas, captura, hojas, deshacer) suma su `env(safe-area-inset-*)`.

## Elevation & Depth

Sistema casi plano: la profundidad la da el contraste tonal entre el fondo agrupado y las superficies, y los materiales translúcidos de la navegación flotante. Las tarjetas no tienen borde y apenas sombra; solo lo que flota sobre el contenido tiene sombra apreciable.

### Shadow Vocabulary
- **Tarjeta en reposo** (`box-shadow: 0 0.1rem 0.4rem rgba(0,0,0,0.04)`): todas las tarjetas (`.panel`). Casi invisible; separa en modo claro.
- **Barra flotante** (`box-shadow: 0 0.5rem 1.5rem rgba(0,0,0,0.12)`): solo la barra de captura en móvil.
- **Anillo de selección** (`box-shadow: 0 0 0 0.18rem var(--surface), 0 0 0 0.3rem var(--member-color)`): swatch elegido del selector de color.
- **Velo de hoja** (`::backdrop` `rgba(0,0,0,0.32)`): fondo modal de las hojas, con fundido.

### Named Rules
**The Material Only Where It Floats Rule.** `backdrop-filter: blur(20px) saturate(180%)` sobre `--bar` solo en la barra de pestañas y la barra de captura móvil. Con `prefers-reduced-transparency: reduce` ambas pasan a `--surface` opaco.

**The Tonal Card Rule.** Las tarjetas se separan del fondo por tono, no por borde ni sombra marcada.

## Shapes

Esquinas continuas y suaves, siempre redondeadas; nada recto salvo el panel lateral de escritorio, que toca los bordes de la ventana. Tarjetas y rail a 12px (`--radius`); hojas móviles a 1rem solo arriba; barra de captura a 1rem; campos rellenos a 0.65rem; elementos del rail y pestañas a 0.6rem; filas pulsables a 0.5rem. Píldora completa (999px) para el compositor de captura, las opciones de aclaración, las barras de progreso y el grabber. Círculo para los puntos de miembro, swatches, botón de enviar y botones de mes. Los iconos son un set propio (`src/ui/icons.tsx`): rejilla de 24px, trazo de 2px redondeado, `currentColor`, decorativos (`aria-hidden`), a 1.25rem en el rail y 1.4rem en pestañas.

## Components

### Buttons
Táctiles e inmediatos: responden al apoyar el dedo, no al soltar.
- **Shape:** esquina pequeña heredada (6px).
- **Primary:** fondo azul de acento, texto `--on-accent`; el primer botón de las acciones de un formulario es el primario.
- **Default:** superficie con borde separador.
- **Danger:** texto rojo, empujado a la derecha en las acciones de hoja.
- **Press:** `:active` escala 0.97 en 120ms con `--ease-out`; con movimiento reducido no escala, baja la opacidad a 0.6.
- **Icon button:** círculo de 2.5rem transparente en azul (flechas de mes); al pulsar toma el relleno secundario.

### Chips
- **Opciones de aclaración del asistente:** botones en píldora a 0.85rem; en móvil, una fila con scroll horizontal sin barra.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** `--surface` sobre `--bg`.
- **Shadow Strategy:** tarjeta en reposo (ver Elevation).
- **Border:** ninguno.
- **Internal Padding:** 1rem.
- Títulos de tarjeta en estilo Title; totales separados por una línea `--border` con 1rem por encima.

### Inputs / Fields
- **Style:** dentro de hojas y Ajustes, campo relleno: `--surface-secondary`, sin borde, 0.65rem de radio, 0.7rem 0.75rem de padding, 16px. Etiqueta encima en etiqueta secundaria a 0.875rem.
- **Focus:** contorno de 2px en azul con 2px de separación (`:focus-visible`, global).
- **Error / Disabled:** mensaje en rojo a 0.875rem bajo el campo; deshabilitado a opacidad 0.5.

### Navigation
- **Móvil:** barra de pestañas inferior fija y translúcida, tres pestañas (Personal, Familiar, Ajustes) con icono de 1.4rem sobre etiqueta de 0.72rem; la activa toma relleno secundario, texto azul y peso 650.
- **Escritorio:** rail lateral (material `color-mix(in srgb, var(--surface) 70%, var(--bg))`, 12px, borde derecho) con icono y etiqueta en fila; mismos estados.
- Enrutado por hash; la pestaña actual lleva `aria-current="page"`.

### List rows
Filas agrupadas tipo ajustes: ancho completo, título y subtítulo a la izquierda, importe en 600 y chevron de 1rem en etiqueta secundaria a la derecha, separador `--border` entre filas. Al pulsar no encogen: se iluminan con el relleno secundario (y en hover con puntero fino). La última fila «Añadir…» va en azul.

### Bottom sheet / side panel
`<dialog>` nativo controlado por `useSheet` (`common.tsx`): foco atrapado y Esc gratis. En móvil, hoja inferior (máx. 90dvh, esquinas superiores de 1rem, grabber de 2.25rem × 0.3rem) que se arrastra 1:1 con resistencia elástica por encima, proyecta el impulso y cierra si la proyección pasa de la mitad. Desde 900px, panel derecho de 26rem. Entra y sale por el mismo borde con resorte *settle* (stiffness 322, damping 36), el lanzamiento tras arrastre usa *flick* (439 / 34) con la velocidad del dedo, y con movimiento reducido es un fundido de 200ms. Es interrumpible: se puede agarrar a mitad de animación.

### Capture bar (signature)
La barra del asistente: compositor en píldora sobre relleno secundario con campo transparente y botón circular azul de 2rem con flecha de envío; encima, «Registrando como …» en caption; debajo, avisos, aclaraciones e historial plegable. En móvil flota sobre las pestañas con material translúcido, 1rem de radio y sombra flotante; en escritorio se asienta al pie del rail sin material. Avisos y aclaraciones entran con transición y `@starting-style` (opacidad + 0.5rem de desplazamiento en 200ms), nunca con keyframes que se reinician.

### Savings bar and charts
Barra apilada de 0.75rem en píldora (Hogar en etiqueta secundaria, Gastado en azul, Ahorro en verde) con leyenda de tres columnas; barras de categoría de 0.5rem en azul sobre pista secundaria; histórico de seis meses en barras grises con el mes actual en azul y negrita. Todo SVG/CSS nativo.

### Member dot and swatches
Círculo de 1.75rem con la inicial en mayúscula (0.8rem, 700) sobre `--member-color`; tinta blanca por defecto y `#1c1c1e` en orange, teal y mint (`--member-ink`), en ambos modos. El selector de color es una rejilla de 4 swatches circulares de 2.5rem con anillo de selección; los colores ocupados por otro miembro quedan deshabilitados a opacidad 0.32.

### Undo notice
Tostada fija en etiqueta invertida (`--text` de fondo, `--bg` de texto), 12px, máx. 30rem; entra con transición de opacidad y 0.5rem en 240ms.

## Do's and Don'ts

### Do:
- **Do** usar solo los custom properties de `:root`; todo color nuevo necesita su par claro/oscuro.
- **Do** responder en pointer-down: botones `scale(0.97)` en 120ms, filas con relleno secundario en lugar de encoger.
- **Do** animar hojas con los resortes *settle*/*flick* de `useSheet` y avisos con transiciones o `@starting-style`; con `prefers-reduced-motion` sustituir movimiento por fundido.
- **Do** dibujar iconos nuevos en el set de `icons.tsx` (24px, trazo 2px redondeado, `currentColor`, `aria-hidden`).
- **Do** mantener los campos a 16px y los objetivos táctiles en torno a 2.5rem en móvil.
- **Do** usar cifras tabulares y alinear importes a la derecha.
- **Do** aplicar el color de miembro solo vía `data-color`.

### Don't:
- **Don't** usar estilos en línea ni fuentes externas: la CSP de producción los bloquea.
- **Don't** usar verde o rojo para nada que no sea estado; no añadir verde ni rojo a la paleta de miembros.
- **Don't** poner material translúcido fuera de las barras flotantes ni ignorar `prefers-reduced-transparency`.
- **Don't** añadir gráficos decorativos, estética de banca o *fintech*, ni gamificación.
- **Don't** reiniciar keyframes para notificaciones que pueden cambiar de contenido.
- **Don't** añadir librerías de animación distintas de `motion/mini` (ADR-019) ni superar el presupuesto de 160 kB gzip (ADR-020).
