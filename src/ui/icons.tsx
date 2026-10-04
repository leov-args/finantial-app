// One authored set: 24px grid, 2px round stroke, currentColor. Decorative; the control carries the label.
const PATHS = {
  personal: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
  familiar: 'M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  back: 'm15 5-7 7 7 7',
  forward: 'm9 5 7 7-7 7',
  send: 'M12 19V5M6 11l6-6 6 6',
  check: 'm5 12.5 4.5 4.5L19 7.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
