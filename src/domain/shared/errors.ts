/**
 * Stable, machine-readable error codes. The UI and the agent map these to
 * human messages; code never matches on message text.
 */
export type DomainErrorCode =
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_DATE'
  | 'INVALID_ID'
  | 'INVALID_NAME'
  | 'INVALID_WEIGHTS'
  | 'INVALID_RECURRENCE'
  | 'INVALID_EXPENSE'
  | 'INVALID_INCOME'
  | 'INVALID_PLAN_ITEM'
  | 'INVALID_MEMBER'
  | 'AMOUNT_OVERFLOW';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
