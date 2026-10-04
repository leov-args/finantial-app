import { DomainError } from './errors.ts';

// Control characters (except tab/newline) have no place in financial records.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Normalises free text coming from users, OCR or the agent.
 * Text is always stored and rendered as plain text (never HTML); this only
 * removes invisible garbage and enforces limits.
 */
export function cleanText(value: string, maxLength: number): string {
  const cleaned = value.replace(CONTROL_CHARS, '').trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/** Single-line required name: collapses whitespace, must be non-empty. */
export function requireName(value: string, maxLength: number, what: string): string {
  const cleaned = cleanText(value, Number.MAX_SAFE_INTEGER).replace(/\s+/g, ' ');
  if (cleaned.length === 0) {
    throw new DomainError('INVALID_NAME', `${what} must not be empty.`);
  }
  if (cleaned.length > maxLength) {
    throw new DomainError('INVALID_NAME', `${what} must be at most ${maxLength} characters.`);
  }
  return cleaned;
}

export const TEXT_LIMITS = {
  name: 60,
  description: 200,
  merchant: 100,
  notes: 2000,
} as const;
