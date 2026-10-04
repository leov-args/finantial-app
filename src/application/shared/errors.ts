export type ApplicationErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'REFERENCE_IN_USE';

/** Stable cause the UI translates with `params` (ADR-018); `message` is only a developer fallback. */
export type ApplicationErrorReason =
  | 'INVALID_INPUT'
  | 'MEMBER_UNKNOWN'
  | 'MEMBER_INACTIVE'
  | 'MEMBER_IN_USE'
  | 'MEMBER_COLOR_TAKEN'
  | 'MEMBER_SHARES_BLOCK_DEACTIVATE'
  | 'MEMBER_SHARES_BLOCK_CLEAR_INCOME'
  | 'CATEGORY_UNKNOWN'
  | 'CATEGORY_ARCHIVED'
  | 'CATEGORY_DUPLICATE'
  | 'CATEGORY_MUST_STAY_ACTIVE'
  | 'CATEGORY_NOT_DELETABLE'
  | 'CATEGORY_IN_USE'
  | 'RECORD_CHANGED';

type Params = Readonly<Record<string, string | number>>;

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
  readonly code?: string;
  readonly params?: Params;
}

/**
 * Errors raised by use cases. Domain invariant violations surface as
 * DomainError; these cover input validation and cross-entity rules.
 */
export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly issues: readonly FieldIssue[];
  readonly reason: ApplicationErrorReason | undefined;
  readonly params: Params;

  constructor(
    code: ApplicationErrorCode,
    message: string,
    issues: readonly FieldIssue[] = [],
    { reason, params = {} }: { reason?: ApplicationErrorReason; params?: Params } = {},
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.issues = issues;
    this.reason = reason;
    this.params = params;
  }
}

export const notFound = (what: string, id: string): ApplicationError =>
  new ApplicationError('NOT_FOUND', `${what} "${id}" does not exist.`);
