import type { MessageKey, Messages } from './es-ES';
import { esES } from './es-ES';
import { setCurrentLocale } from '../../domain/shared/locale.ts';

type Params = Record<string, string | number>;

export type Locale = 'es-ES';
export type { MessageKey, Messages } from './es-ES.ts';

let currentLocale: Locale = 'es-ES';
let messages: Messages = esES;

export function setLocale(locale: Locale, localeMessages: Messages = esES) {
  currentLocale = locale;
  messages = localeMessages;
  setCurrentLocale(locale);
}

export type MessageParams = Params;

export function getLocale(): Locale {
  return currentLocale;
}

function getValue(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function t(key: MessageKey, params?: Params): string {
  const value = getValue(messages, key);
  if (typeof value !== 'string') {
    return key;
  }
  if (!params) {
    return value;
  }
  return value.replace(/\{\{(\w+)\}\}/g, (match, p1) => {
    if (p1 in params) {
      return String(params[p1]);
    }
    return match;
  });
}
