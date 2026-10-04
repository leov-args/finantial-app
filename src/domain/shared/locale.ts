export type Locale = 'es-ES';

let currentLocale: Locale = 'es-ES';

export function setCurrentLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getCurrentLocale(): Locale {
  return currentLocale;
}
