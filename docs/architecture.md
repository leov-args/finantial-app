# Arquitectura

Family Finance es una aplicación web **local-first**: no hay servidor, ni cuentas, ni sincronización. Todo vive en el navegador del dispositivo (IndexedDB). Después de la primera carga funciona sin conexión (PWA en la fase 9).

## Capas

```text
┌──────────────────────────────────────────────────────────────┐
│ ui/            React. Pantallas, componentes, hooks.         │
│                Solo habla con AppServices (vía contexto).    │
├──────────────────────────────────────────────────────────────┤
│ app/           Composition root: crea la BD, repositorios y  │
│                servicios, y los conecta. Único sitio que     │
│                conoce a la vez la infraestructura y la UI.   │
├──────────────────────────────────────────────────────────────┤
│ agent/  ocr/   Parser de intenciones, herramientas tipadas,  │
│                motor OCR, parser de tickets. Usan servicios  │
│                de aplicación; nunca la base de datos.        │
├──────────────────────────────────────────────────────────────┤
│ application/   Casos de uso (servicios). Validan entrada con │
│                Zod, comprueban referencias, abren            │
│                transacciones y delegan las reglas al         │
│                dominio. Dependen de PUERTOS (interfaces).    │
├──────────────────────────────────────────────────────────────┤
│ domain/        TypeScript puro. Money, Member, Category,     │
│                Income, Expense y los cálculos. Sin React,    │
│                Dexie ni Zod. Determinista y testeable.       │
├──────────────────────────────────────────────────────────────┤
│ infrastructure/ Dexie: esquema, migraciones, mappers y       │
│                repositorios que implementan los puertos.     │
│ storage/       Asuntos del navegador que no son "la BD":     │
│                persistencia, cuota, (fase 5) blobs.          │
└──────────────────────────────────────────────────────────────┘
                              │
                          IndexedDB
```

## Reglas de dependencia

Están **forzadas por ESLint** (`eslint.config.js`, `no-restricted-imports`), no solo documentadas:

| Capa | Puede importar | No puede importar |
|---|---|---|
| `domain` | `domain` | todo lo demás, React, Dexie, Zod |
| `application` | `domain`, Zod | `infrastructure`, `ui`, `app`, React, Dexie |
| `agent`, `ocr` | `domain`, `application` | `infrastructure`, `ui`, `app`, React, Dexie |
| `infrastructure`, `storage` | `domain`, `application/ports` | `ui`, `app`, React |
| `ui` | `domain` (tipos y formato), `app` (tipos), `application` | `infrastructure`, Dexie |
| `app` | todo | — |

Consecuencia práctica: el dominio y los servicios se pueden reutilizar en una futura app móvil o con otro motor de almacenamiento implementando los mismos puertos (`src/application/ports/repositories.ts`).

## Estructura

```text
src/
├── domain/
│   ├── shared/        ids con marca (branded), fechas, errores, texto
│   ├── money/         Currency, Money, allocate, parseMoney, format
│   ├── member/
│   ├── category/
│   ├── income/
│   ├── expense/
│   ├── family/        PlanItem y contributions(): el reparto justo, al céntimo
│   └── personal/      personalMonth(): ahorro del mes, totales por categoría e histórico
├── application/
│   ├── ports/         interfaces de repositorio, transacciones, ids
│   ├── shared/        AppContext, errores de aplicación, esquemas Zod, guardas
│   ├── members/  categories/  income/  expenses/
│   ├── family/        PlanService (líneas del plan, regla de reparto, aportes)
│   └── personal/      PersonalService (resumen del mes de «yo»)
├── infrastructure/
│   ├── database/      FamilyFinanceDb (Dexie), records, mappers, migrations
│   └── repositories/  implementaciones Dexie de los puertos
├── agent/             parser de frases fijas (G1) con su gramática por idioma, y contratos (fase 4/7)
├── ocr/contracts.ts   contratos de OCR (fase 6)
├── storage/           persistencia del navegador
├── app/container.ts   composition root
├── ui/                React: AppShell (rutas por hash), Personal, Familiar, Ajustes, barra de captura,
│                      asistente de primer uso, hojas (useSheet), errores por código
│   └── i18n/          catálogo de textos (es-ES) y t(); un único locale para los formatos Intl
├── test/              setup (fake-indexeddb), fixtures, helpers
└── main.tsx
```

Se crearán subcarpetas (`agent/tools`, `ocr/engine`…) cuando haya código que meter en ellas; no se crean carpetas vacías.

## UI

- **Rutas:** el hash de la URL (`#/personal`, `#/familiar`, `#/ajustes`), sin router. Sin ningún miembro, el shell muestra el asistente de primer uso.
- **Datos:** cada vista carga con `useData(load)`; cualquier escritura llama a `reload()` y todas las vistas montadas vuelven a leer.
- **Textos:** todo pasa por `t()` (`ui/i18n`); los errores se traducen por código (`ui/errors.ts`).
- **Estilos:** un único `ui/styles.css` con tokens en `:root` (modo claro y oscuro) y colores de miembro por `data-color`; sin estilos en línea (CSP). El sistema visual está en [DESIGN.md](../DESIGN.md).
- **Movimiento:** las hojas son `<dialog>` nativos (foco, Esc, `inert`) animados por `useSheet` (`ui/common.tsx`) con `motion/mini`: entran y salen por el mismo borde con resortes interrumpibles y, en móvil, se cierran arrastrando (ADR-019). Lo demás es CSS, y `prefers-reduced-motion` cambia los desplazamientos por fundidos.

## Flujo de una operación

```text
UI  ──input sin tipar──▶  ExpenseService.create()
                             │ 1. Zod → comando tipado (o ApplicationError VALIDATION)
                             │ 2. transacción Dexie (todas las tablas)
                             │ 3. guardas: categoría existe y no archivada, miembros activos
                             │ 4. buildExpense() → invariantes del dominio
                             │ 5. repositorio.save() → mapper → record plano → IndexedDB
                             ▼
UI  ◀──Expense inmutable──
```

Lecturas: IndexedDB → record → mapper → constructor del dominio (se revalida) → objeto inmutable.

## Errores

- `DomainError` (código estable: `INVALID_AMOUNT`, `CURRENCY_MISMATCH`…): se viola un invariante.
- `ApplicationError` (`VALIDATION`, `NOT_FOUND`, `CONFLICT`, `REFERENCE_IN_USE`) con `issues` por campo para formularios.

La UI y el agente traducen por **código**, nunca por texto del mensaje.

## Privacidad y seguridad

- Sin analítica, telemetría ni logging remoto. No hay dependencias que hagan peticiones de red.
- CSP estricta en la build de producción (`connect-src 'self'`): la app no puede enviar datos a otro origen ni por error.
- Todo el texto (notas, comercios, OCR) se guarda y muestra como texto plano. ESLint prohíbe `dangerouslySetInnerHTML` en `ui/`.
- Se solicita almacenamiento persistente (`navigator.storage.persist()`) para que el navegador no expulse los datos.
- Ningún secreto en el bundle ni en IndexedDB (ver `agent.md` para un futuro LLM remoto).

## Testing

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Dominio | Vitest (Node) | reglas financieras puras, sin BD ni React |
| Persistencia + casos de uso | Vitest + `fake-indexeddb` | Dexie real sobre IndexedDB conforme a la spec: transacciones, índices, versiones, migraciones, reapertura |
| UI | React Testing Library + `user-event` + jsdom | la app real sobre `fake-indexeddb` (`src/test/render-app.tsx`), sin mocks de servicios; un test por criterio de aceptación de la fase |
| E2E | Playwright | se añade cuando exista un flujo completo (registrar gasto, cerrar, reabrir) |

Comandos en el [README](../README.md).
