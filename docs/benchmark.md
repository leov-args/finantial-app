# Benchmark de competidores (D-1)

**Estado:** hecho (2026-10-06). Tarea D-1 del roadmap, previa a la etapa 3. Una sesión acotada de búsqueda web; sin probar las apps.

**Ancla:** las dos preguntas del hogar (`docs/intent/rediseno.md`): *¿cuánto aporta cada uno?* y *¿cómo voy yo?*, más la tesis de privacidad (local-first). Lo que no sirva a eso va a la lista de lo que **no** haremos.

**Fiabilidad:** casi todas las fuentes son reseñas y comparativas de 2025–2026, muchas escritas por apps competidoras (sesgo). Los precios son de EE. UU. y no se comprobaron en las páginas oficiales: verificarlos antes de cualquier decisión de precio. El mercado español solo está cubierto por Fintonic.

## Competidores

| App | Tipo | Reparto en pareja | Privacidad / sincronización | Precio | Registro |
|---|---|---|---|---|---|
| **Splitwise** | Deudas entre personas | Por gasto: igual, importes, porcentajes | Nube | Gratis con límite de ~3–4 gastos/día y anuncios; Pro 4,99 $/mes o ~40–50 $/año | Formulario; OCR en Pro |
| **Tricount** (bunq) | Deudas entre personas | Por gasto: igual, importes, partes | Nube; funciona offline | Gratis, sin anuncios ni límites; lo financia el banco bunq | Formulario; gastos automáticos con tarjeta bunq |
| **Honeydue** | Finanzas de pareja | Gastos marcados para dividir, saldo de quién debe a quién | Nube + agregación bancaria (Plaid); cada uno elige qué cuentas comparte | Gratis | Bancos |
| **YNAB** | Presupuesto (sobres) | Una suscripción para hasta 6 personas | Nube + bancos | 14,99 $/mes o 109 $/año | Bancos o manual |
| **Monarch** | Panel financiero | «Household»: la pareja sin coste extra | Nube + bancos | 99,99 $/año (Plus 199 $) | Bancos |
| **Goodbudget** | Presupuesto (sobres) | Sobres compartidos; cada uno registra en su móvil | Nube; sin bancos en el plan gratis | Gratis (20 sobres, 1 cuenta, 2 dispositivos, 1 año); Premium 80 $/año | Manual |
| **Halfway / Cino / CouplePro** | Finanzas de pareja | **Proporcional al ingreso** como regla central | Nube (+ bancos en premium) | Halfway: gratis con reparto proporcional; Premium 9,99 $/mes | Manual o bancos |
| **Actual Budget** | Presupuesto (sobres) | — | **Local-first**, servidor de sincronización autoalojado, **E2E opcional** (segunda contraseña) | Gratis, código abierto; hay hosting de terceros | Manual o importación |
| **Firefly III** | Gestor financiero | Compartir = compartir usuario y contraseña | Autoalojado | Gratis, código abierto | Manual, API |
| **Fintonic** (España) | Agregador + marketplace | — | Nube + agregación PSD2 de solo lectura | Gratis; vive de comisiones por productos financieros | Bancos |
| **Justlog / Fintrack / MonAi / Finny** | Registro rápido | — | Nube + LLM | Freemium | **Lenguaje natural** («coffee 5, parking 12, lunch 16» → 3 gastos) |

## Respuestas a las cinco preguntas

### 1. ¿Cómo reparten los gastos comunes?

- **Por transacción, con deudas:** Splitwise, Tricount, Honeydue. Cada gasto se divide y se arrastra un saldo «quién debe a quién» que hay que liquidar.
- **Proporcional al ingreso:** se está volviendo estándar en las apps de pareja (Halfway se presenta como «justo = proporcional, no igual»; Cino y CouplePro también).
- **«Os quedáis con lo mismo» (*equal leftover*):** aparece en artículos y calculadoras web (p. ej. GoodShare) como tercera vía, útil cuando un sueldo es mucho menor, pero **no se encontró ninguna app que lo use como regla central**.
- **Un plan fijo que se reparte (no transacción a transacción):** no se encontró en ninguna. Es justo lo que pidió el hogar: un plan que se edita de vez en cuando y aportes al céntimo, sin deudas que liquidar.

**Conclusión:** el diferencial no es «reparto proporcional» (ya es común), sino **el plan + la regla de igualar lo que queda + la cuenta a la vista**. Hay que explicarlo bien: eso es el botón «i» (E0-1).

### 2. Modelo de privacidad y sincronización

Dos mundos:
- **Nube + agregación bancaria** (YNAB, Monarch, Honeydue, Fintonic): cómodo, pero su queja nº 1 es que **la conexión con el banco se rompe** (Honeydue: cada pocos días; Fintonic: problemas con ciertos bancos). Y el usuario entrega sus movimientos a la empresa y al agregador.
- **Manual / local / autoalojado** (Goodbudget gratis, Actual, Firefly, apps «sin Plaid»): hay un nicho explícito de gente que **no quiere conectar el banco**; existen guías y apps enteras dedicadas a ello.

**Actual Budget prueba que la arquitectura del roadmap funciona:** local-first, cada dispositivo con la copia completa, sincronización en segundo plano y E2E opcional en la que el servidor no puede leer nada. Su punto débil es que **hay que autoalojar el servidor** (o pagar a un tercero). Firefly lo resuelve aún peor para parejas: compartir la contraseña.

**Conclusión:** el hueco es **sincronización cifrada de extremo a extremo, alojada, sin montar nada, pensada para la pareja.** Confirma la etapa 4 como hipótesis de negocio. Goodbudget da sincronización entre los dos móviles **gratis**: para una pareja es lo mínimo esperable, lo que confirma la etapa 2.

### 3. ¿Cuánto cobran y por qué?

- Rango de suscripción: **~40–110 $/año** (Splitwise ~40–50, Goodbudget 80, Monarch 99,99, YNAB 109).
- Se cobra **por hogar, no por persona**: Monarch incluye a la pareja; YNAB, hasta 6 personas.
- Lo que se paga: bancos, sincronización y más dispositivos (Goodbudget), quitar límites y anuncios (Splitwise).
- Tricount y Fintonic son gratis porque los financia otro negocio (un banco, comisiones de productos financieros).

**Conclusión:** si llega la etapa 4, cobrar **por hogar** y **por la sincronización cifrada**, con el núcleo local gratis y completo. Lo que más rechazo genera es **quitar funciones gratuitas** y poner límites diarios (la reacción contra Splitwise).

### 4. ¿Cómo se registra un gasto?

- **Bancos** (los grandes): sin esfuerzo cuando funciona, pero frágil y contrario a la privacidad.
- **Lenguaje natural con LLM** (Justlog, Fintrack, MonAi, Finny): es la tendencia de 2025–2026; varias entradas en una frase, voz. Pero el texto viaja a la nube.
- **Formulario manual** (Splitwise, Tricount, Goodbudget): con espera y anuncios en Splitwise gratis.

**Conclusión:** la barra de captura de frases fijas está en el carril de moda **sin enviar nada fuera**. Lo que falta frente a ellos: **varios gastos en una frase** y una gramática más tolerante. El OCR es función de pago en Splitwise Pro, no un diferencial, y puede esperar.

### 5. ¿Qué se critica más?

| Queja | Quién | Qué hacemos |
|---|---|---|
| La conexión con el banco se rompe | Honeydue, Fintonic | No conectar bancos |
| Límites diarios, anuncios, funciones que pasan a pago | Splitwise | Núcleo gratis y completo, sin anuncios |
| Subidas de precio sin mejoras | YNAB | Precio solo por lo que cuesta servir (sincronización) |
| Publicidad de productos financieros, baja difícil | Fintonic | Sin marketplace ni venta de productos |
| Soporte que no responde | Honeydue | Menos superficie: sin bancos ni servidor, hasta la etapa 4 |
| Compartir con la pareja = compartir contraseña | Firefly III | Unirse a un hogar (E2-2) |
| Tener que convencer a todos de instalar y registrarse | Splitwise | Sin cuentas; sincronizar por archivo |

## Posicionamiento (borrador)

> Para parejas que comparten gastos de casa con sueldos distintos y no quieren dar sus datos bancarios a nadie: Family Finance dice cuánto aporta cada uno al plan común, al céntimo, para que los dos se queden con lo mismo, y cuánto vas a ahorrar tú este mes. Todo vive en vuestros móviles; sin bancos, sin cuentas, sin anuncios.

## Qué cambia en el roadmap

1. **E0-1 (botón «i» en Familiar) sube de importancia:** explica el diferencial. Que también compare las reglas («a partes iguales», «proporcional», «os quedáis con lo mismo») con vuestras cifras.
2. **Etapa 2 confirmada como imprescindible:** la sincronización entre los dos móviles es lo mínimo esperable para una pareja (Goodbudget la da gratis). El archivo es aceptable como primer paso; la fricción se mide en el uso real.
3. **Etapa 3, el asistente:** añadir **varios gastos en una frase** («gasto 12 comida, 5 café») y tolerancia a variantes, sin LLM. Va por delante del OCR.
4. **Etapa 3, presupuesto del plan:** YNAB y Goodbudget son de sobres; validar las líneas del plan con gastos reales acerca la app a ese modelo **sin** convertirla en una app de sobres (no es el ancla).
5. **Etapa 4, hipótesis para las entrevistas:**
   - ¿La regla «os quedáis con lo mismo» resuena más que la proporcional?
   - ¿Pagaríais ~40–80 €/año por hogar por sincronización cifrada automática, o basta el archivo?
   - ¿Es «sin bancos» una ventaja o una carencia para vosotros?
6. **OCR y recibos** siguen en la etapa 4: en la competencia son función de pago, no motivo de elección.

## Lo que no haremos

- Conectar bancos ni agregadores (PSD2, Plaid).
- Anuncios, límites diarios o funciones gratuitas que pasen a pago.
- Marketplace, comparador o recomendaciones de productos financieros.
- Saldos de deudas por transacción al estilo Splitwise: el reparto vive en el plan (ADR-011).
- LLM en la nube para registrar gastos.

## Fuentes

- Splitwise: [Splittyapp, límites](https://splittyapp.com/learn/splitwise-free-limits/), [Hipposplit, reseña 2026](https://hipposplit.com/blog/splitwise-review/), [AreWeEven, por qué se van](https://www.areweeven.com/blog/why-people-switching-from-splitwise), [Getfinny, precios 2026](https://getfinny.app/blog/splitwise-pricing-2026)
- Tricount: [tricount.com](https://tricount.com/), [funciones](https://tricount.com/en-us/expense-tracker-features), [App Store](https://apps.apple.com/us/app/tricount-split-settle-bills/id349866256)
- Honeydue: [CNBC Select](https://www.cnbc.com/select/honeydue-budgeting-app-review/), [Experian](https://www.experian.com/blogs/ask-experian/honeydue-app-review/), [FinCompareLab, reseña 2026](https://www.fincomparelab.com/reviews/honeydue-review/)
- YNAB: [Costbench](https://costbench.com/software/personal-finance/ynab/), [Fortune, pros y contras](https://fortune.com/article/ynab-pros-and-cons)
- Monarch: [Getfinny, precios 2026](https://getfinny.app/blog/monarch-money-pricing-2026), [Envelope, reseña](https://envelopebudgeting.com/articles/monarch-money-review)
- Goodbudget: [Getfinny, precios 2026](https://getfinny.app/blog/goodbudget-pricing-2026), [FinCompareLab](https://www.fincomparelab.com/reviews/goodbudget-review/)
- Reparto proporcional: [Halfway](https://meethalfway.app/for-couples), [Cino](https://www.getcino.com/post/split-bills-based-on-income), [CouplePro](https://play.google.com/store/apps/details?id=com.parejapro.app&hl=en_US)
- *Equal leftover*: [GoodShare, calculadora](https://goodshare.app/tools/fair-share-calculator/), [HyperJar](https://hyperjar.com/blog/how-to-split-bills-as-a-couple)
- Actual Budget: [actualbudget.com](https://actualbudget.com/), [Medium, autoalojar Actual](https://medium.com/@paperkite_hq/self-hosting-actual-budget-a-local-first-alternative-to-ynab-65a3edf1f172), [ElfHosted](https://docs.elfhosted.com/app/actual/)
- Firefly III: [GitHub](https://github.com/firefly-iii/firefly-iii), [FAQ](https://docs.firefly-iii.org/references/faq/firefly-iii/general/)
- Fintonic: [Trustpilot](https://www.trustpilot.com/review/www.fintonic.com), [El Confidencial Digital](https://www.elconfidencialdigital.com/articulo/negocio/fintonic-app-independiente-bancos-quitan-ojo/20190417123449124285.html), [Banktrack, alternativas](https://banktrack.com/blog/alternativas-fintonic)
- Sin bancos: [Monavio](https://monavio.app/blog/best-budget-apps-without-bank-access/), [DefineYourDollars](https://blog.defineyourdollars.com/budget-app-reviews/free-budget-app-no-bank-account-2025/)
- Registro en lenguaje natural: [Justlog](https://play.google.com/store/apps/details?id=com.justlog.app&hl=en_GB), [Getfinny, registrar por texto](https://getfinny.app/blog/log-expenses-by-text)
