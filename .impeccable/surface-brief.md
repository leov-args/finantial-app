# Surface brief · Family Finance redesign

## Direction

- Seed: `0278a050`
- Apple-inspired, calm and direct: system typography, grouped surfaces, translucent navigation and immediate press feedback.
- The interface must feel like a useful household tool, not a fintech dashboard.

## Shell contract (B6)

- Primary sections are Personal, Familiar and Ajustes.
- Personal is the default route and the URL hash survives reloads.
- Mobile uses a translucent bottom tab bar; desktop uses a left navigation rail from 900px.
- The capture bar is intentionally deferred to task 13.

## Settings contract (B7)

- Reference income, household split rule and member color are business settings in IndexedDB.
- “Quién soy” is a device preference in `localStorage`, never backup data.
- Colors are palette keys rendered through `data-color`; green and red remain reserved for positive and error states.
- Storage copy explains that data remains local and is not automatically backed up.

## Motion contract (G16)

- Sheets are native `<dialog>`s driven by `useSheet`: they enter and leave through the same edge (bottom on mobile, right from 900px) on interruptible springs (`motion/mini`), and drag down from the grabber on mobile with velocity handoff.
- Presses respond on pointer-down (`:active` scale 0.97, list rows highlight instead).
- Notices enter with transitions or `@starting-style`, never restarting keyframes.
- Reduced motion swaps movement for fades; reduced transparency makes bars opaque.

## Constraints

- No inline styles or external assets.
- Inputs remain keyboard accessible and at least 16px on mobile.
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.
