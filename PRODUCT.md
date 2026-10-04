# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Mobile web first: used mostly on a phone, and it must work well on desktop. A PWA or a lightweight app on both partners' phones is the stated future (it needs sync, which isn't designed yet). It stays `web` until then.

## Users

A couple running one household, both Spanish speakers. Today they use **one shared device**, with a "who are you on this device" selector; later each will use their own phone.

- **The household planner:** self-employed with a fixed income. Owns the shared-costs plan and checks his personal savings. Logs his own day-to-day spending.
- **The partner:** salaried. Mainly needs to know what she contributes to the household this month, and has her own personal view.

Jobs, by frequency:
1. Log a personal expense the moment it happens, on the phone, in seconds.
2. See "how am I doing this month": what's left, where it went, what I'll save.
3. Occasionally (a few times a year, e.g. winter heating) edit the shared-costs plan and see each person's contribution recalculate at once.

## Product Purpose

A local-first family finance assistant that answers two questions the household actually asks:

1. **How much does each of us contribute to the home, fairly?**
2. **How am I doing personally this month?**

Success means opening the Family section shows the real plan, and contributions match the couple's own spreadsheet to the cent. Logging an expense takes a phrase like "gasto 126 comida" instead of a form, and the Personal view shows projected savings at a glance.

## Positioning

- **The household's own fairness rule, computed to the cent.** Shared costs are split so that **both partners keep the same amount** after covering them. That is not 50/50 and not proportional to income. Lines can also be **assigned** to a specific person (one partner's card purchases), outside the formula. Contributions always add up exactly to the plan total.
- **Recording in seconds.** A rule-based assistant understands short fixed phrases ("gasto 126 comida", "ingreso 1200"), asks for what's missing, and never invents values.

## Operating Context

- **Family plan:** a standing list of monthly shared costs that changes rarely. Current lines:

  | Line | Amount |
  |---|---:|
  | Alquiler | 900,00 |
  | Comida | 520,00 |
  | Colegio | 350,00 |
  | Seguro | 195,01 |
  | Luz | 60,00 |
  | Internet | 45,00 |
  | Agua | 30,00 |
  | Portátil | assigned per person |

  Seasonal lines get added (heating, hot water).
- **Incomes:** a fixed monthly reference income per person (payroll, fixed), edited only when it changes.
- **Day-to-day expenses:** all personal. Shared spending lives in the plan, not in logged transactions.
- **The use moment:** quick capture right after paying, on a phone, often one-handed. Review at home, sometimes on desktop.

## Capabilities and Constraints

- **Sections:** Personal, Familiar, Asistente, Ajustes. The functional spec is `docs/spec-rediseno.md`; confirmed intent is `docs/intent/rediseno.md`.
- **Data:**
  - **Local-first:** no server, accounts, cloud or bank connections. IndexedDB in the browser is the only copy (ADR-001), and there's no backup until phase 8; the UI must say so.
  - Money is integer cents, never floats. The single currency today is EUR.
- **Technical constraints:**
  - Strict production CSP: no inline styles, no external fonts or CDNs, no network calls.
  - All user text is rendered as plain text.
- **Stack** (existing, not up for redesign):
  - React 19, Vite 8, TypeScript, Dexie and Zod;
  - no router or state library;
  - charts with native CSS/SVG unless a dependency is approved.
- **Undecided:** the **product name**. "Family Finance" is a working name; the user hasn't chosen a final one, so don't build brand identity around the current name.

## Brand Commitments

- **Language:** UI copy in Spanish (Spain) today. The app must be **ready for more languages** (Latin American Spanish, English, French…; ADR-018), so copy lives in a message catalog and layouts must tolerate longer strings. Code identifiers in English.
- **Voice:** close and warm, speaking as **tú**, like a friend who's good with numbers. Plain words and no financial jargon ("Este mes vas a ahorrar 338 €", not "Ahorro previsto del periodo").
- No logo, name or visual identity assets exist yet.

## Evidence on Hand

- The couple's real fixed-cost table (above) and their worked fairness example:
  - incomes 2.600 / 1.400 and formula lines 2.100,01 give contributions 1.650,01 / 450,00;
  - plus Portátil assigned 300 / 50, the totals are 1.950,01 / 500,00.

  This is the acceptance case.
- There are no users beyond the couple, no testimonials, no metrics and no store presence. Don't fabricate any.

## Product Principles

1. **The numbers are sacred.** Every figure comes from the domain and adds up to the cent; the UI never rounds a total into a different story.
2. **Fair, and visibly so.** Show why each person pays what they pay, so the split is trusted rather than taken on faith.
3. **Capture beats configure.** The everyday action (logging an expense) is the fastest path in the app; setup tasks can be slower.
4. **Private by construction.** Nothing leaves the device, and the app says honestly where the data lives and what isn't backed up.
5. **Ask, don't assume.** When information is missing, the app (and the assistant) asks; defaults are visible and editable.

## Accessibility & Inclusion

- **Baseline:**
  - every control is labeled;
  - visible focus;
  - field errors are linked to their control (`aria-describedby` / `aria-invalid`);
  - fully keyboard-operable on desktop.
- **Touch:** targets must suit one-handed use on a phone.
- **Color:** never the only carrier of meaning. A negative balance needs text or a sign, not just red.
