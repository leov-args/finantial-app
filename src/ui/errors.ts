import { ApplicationError, type ApplicationErrorReason } from '../application/shared/errors.ts';
import { type DomainErrorCode, isDomainError } from '../domain/shared/errors.ts';
import { type MessageKey, t } from './i18n/index.ts';

export const FORM = '_form';

const DOMAIN: Partial<Record<DomainErrorCode, [field: string, key: 'errors.invalidAmount' | 'errors.amountTooLarge' | 'errors.invalidDate' | 'errors.invalidIncome' | 'errors.validation' | 'errors.positiveAmount' | 'validation.enterName']>> = {
  INVALID_AMOUNT: ['amount', 'errors.invalidAmount'],
  AMOUNT_OVERFLOW: ['amount', 'errors.amountTooLarge'],
  INVALID_EXPENSE: ['amount', 'errors.positiveAmount'],
  INVALID_INCOME: ['amount', 'errors.positiveAmount'],
  INVALID_PLAN_ITEM: ['amount', 'errors.positiveAmount'],
  INVALID_DATE: ['date', 'errors.invalidDate'],
  INVALID_NAME: ['name', 'validation.enterName'],
};

// Exhaustive: a new reason does not compile until it has a translation. Without a
// field key, field issues keep their own message (e.g. per-share plan issues).
const REASON: Record<ApplicationErrorReason, readonly [form: MessageKey, field?: MessageKey]> = {
  INVALID_INPUT: ['errors.review'],
  MEMBER_UNKNOWN: ['errors.memberUnknown', 'errors.memberUnknownField'],
  MEMBER_INACTIVE: ['errors.memberInactive', 'errors.memberInactiveField'],
  MEMBER_IN_USE: ['errors.memberInUse'],
  MEMBER_COLOR_TAKEN: ['errors.memberColorTaken', 'errors.memberColorTakenField'],
  MEMBER_SHARES_BLOCK_DEACTIVATE: ['errors.cannotDeactivateWithAssignedParts'],
  MEMBER_SHARES_BLOCK_CLEAR_INCOME: ['errors.cannotClearIncomeWithAssignedParts'],
  CATEGORY_UNKNOWN: ['errors.categoryUnknown', 'errors.categoryUnknownField'],
  CATEGORY_ARCHIVED: ['errors.categoryArchived', 'errors.categoryArchivedField'],
  CATEGORY_DUPLICATE: ['errors.categoryDuplicate', 'errors.categoryDuplicateField'],
  CATEGORY_MUST_STAY_ACTIVE: ['errors.categoryMustStayActive'],
  CATEGORY_NOT_DELETABLE: ['errors.categoryNotDeletable'],
  CATEGORY_IN_USE: ['errors.categoryInUse'],
  RECORD_CHANGED: ['errors.recordChanged'],
};

export function toErrors(e: unknown): Record<string, string> {
  if (e instanceof ApplicationError) {
    if (e.code === 'NOT_FOUND') return { [FORM]: t('errors.notFound') };
    const [formKey, fieldKey] = e.reason ? REASON[e.reason] : [];
    const fields = Object.fromEntries(
      e.issues.map((i) => [i.path.split('.')[0] || FORM, fieldKey ? t(fieldKey, e.params) : i.message]),
    );
    return { [FORM]: formKey ? t(formKey, e.params) : e.message, ...fields };
  }
  if (isDomainError(e)) {
    const [field, key] = DOMAIN[e.code] ?? [FORM, 'errors.validation'];
    return { [FORM]: field === FORM ? e.message : t('errors.review'), [field]: t(key) };
  }
  console.error(e);
  return { [FORM]: t('errors.generic') };
}
