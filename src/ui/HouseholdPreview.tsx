import type { ReactNode } from 'react';
import type { HouseholdArchiveReadResult } from '../application/ports/household-archive.ts';
import { t } from './i18n/index.ts';

export function HouseholdPreview({ archive, children }: {
  readonly archive: HouseholdArchiveReadResult;
  readonly children?: ReactNode;
}) {
  const dateRange = archive.summary.dateRange;
  return (
    <div className="panel join-household__preview">
      <h4>{t('onboarding.householdPreviewTitle')}</h4>
      <p>{t('app.members')}: {archive.summary.memberNames.join(', ') || '—'}</p>
      <p>{t('onboarding.householdCounts', {
        expenses: archive.summary.expenses, incomes: archive.summary.incomes, planItems: archive.summary.planItems,
      })}</p>
      <p>{t('onboarding.householdDateRange', {
        from: dateRange?.from ?? '—', to: dateRange?.to ?? '—',
      })}</p>
      {children}
    </div>
  );
}
