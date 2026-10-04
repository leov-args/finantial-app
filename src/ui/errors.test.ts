import { describe, expect, it } from 'vitest';
import { ApplicationError } from '../application/shared/errors.ts';
import { FORM, toErrors } from './errors.ts';
import { t } from './i18n/index.ts';

describe('toErrors', () => {
  it('translates an application error by reason and params, not by its developer message', () => {
    const error = new ApplicationError('VALIDATION', 'developer text', [{ path: 'categoryId', message: 'developer field text' }], {
      reason: 'CATEGORY_ARCHIVED',
      params: { name: 'Comida' },
    });

    expect(toErrors(error)).toEqual({
      [FORM]: t('errors.categoryArchived', { name: 'Comida' }),
      categoryId: t('errors.categoryArchivedField'),
    });
  });

  it('keeps field messages when the reason has no field key', () => {
    const error = new ApplicationError('VALIDATION', 'developer text', [{ path: 'kind.shares.0.amount', message: 'Su parte debe ser 0' }], {
      reason: 'INVALID_INPUT',
    });

    expect(toErrors(error)).toEqual({ [FORM]: t('errors.review'), kind: 'Su parte debe ser 0' });
  });
});
