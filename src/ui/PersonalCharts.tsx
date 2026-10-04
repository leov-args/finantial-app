import type { Category } from '../domain/category/category.ts';
import type { MonthlyExpenseTotal } from '../domain/expense/expense.ts';
import { FULL_BASIS_POINTS, type Money, format } from '../domain/money/money.ts';
import type { CategoryTotal } from '../domain/personal/personal-month.ts';
import type { YearMonth } from '../domain/shared/dates.ts';
import { monthLabel, percent, shortMonthLabel } from './common.tsx';
import { t } from './i18n/index.ts';

/** P3. Figures come from `PersonalService`; bar widths are the shares it computed. */
export function PersonalCategoryChart({ byCategory, spent, categories }: { byCategory: readonly CategoryTotal[]; spent: Money; categories: readonly Category[] }) {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <section className="panel personal-categories" aria-labelledby="personal-categories-heading">
      <h3 id="personal-categories-heading">{t('personal.categoryHeading')}</h3>
      {byCategory.length === 0 ? <p className="muted">{t('personal.noExpenses')}</p> : (
        <ul className="personal-category-list">
          {byCategory.map(({ categoryId, total, share }) => {
            const category = categoryNames.get(categoryId) ?? categoryId;
            return (
              <li key={categoryId}>
                <span className="personal-category-list__name">{category}</span>
                <span className="personal-category-list__amount">{format(total)} · {percent(share)}</span>
                <svg
                  className="personal-category-list__bar"
                  viewBox={`0 0 ${FULL_BASIS_POINTS} 8`}
                  preserveAspectRatio="none"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={FULL_BASIS_POINTS}
                  aria-valuenow={share}
                  aria-valuetext={percent(share)}
                  aria-label={t('personal.categoryBarLabel', { category, amount: format(total), percentage: percent(share) })}
                >
                  <rect className="personal-category-list__track" width={FULL_BASIS_POINTS} height="8" />
                  <rect className="personal-category-list__fill" width={share} height="8" />
                </svg>
              </li>
            );
          })}
        </ul>
      )}
      <p className="total"><span>{t('personal.categoryTotal')}</span> <strong>{format(spent)}</strong></p>
    </section>
  );
}

/** P4. Six months up to the selected one, which is highlighted. */
export function PersonalHistoryChart({ history, selectedMonth }: { history: readonly MonthlyExpenseTotal[]; selectedMonth: YearMonth }) {
  const max = history.reduce((largest, { total }) => Math.max(largest, total.amountMinor), 0);

  return (
    <section className="panel personal-history" aria-labelledby="personal-history-heading">
      <h3 id="personal-history-heading">{t('personal.historyHeading')}</h3>
      {max === 0 && <p className="muted">{t('personal.noHistory')}</p>}
      <ul className="personal-history__bars">
        {history.map(({ month, total }) => {
          const selected = month === selectedMonth;
          const height = max > 0 ? Math.round(total.amountMinor * 100 / max) : 0;
          return (
            <li key={month} className="personal-history__item">
              <svg
                className="personal-history__bar"
                viewBox="0 0 36 100"
                preserveAspectRatio="none"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={Math.max(1, max)}
                aria-valuenow={total.amountMinor}
                aria-valuetext={format(total)}
                aria-label={t('personal.monthBarLabel', {
                  month: monthLabel(month),
                  amount: format(total),
                  selected: selected ? t('personal.selectedMonthSuffix') : '',
                })}
                aria-current={selected ? 'date' : undefined}
              >
                <rect className="personal-history__fill" x="6" y={100 - height} width="24" height={height} rx="4" />
              </svg>
              <span className="personal-history__month" aria-hidden="true">{shortMonthLabel(month)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
