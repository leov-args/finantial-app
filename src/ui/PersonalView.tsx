import { useCallback, useState } from 'react';
import type { Category } from '../domain/category/category.ts';
import type { Expense } from '../domain/expense/expense.ts';
import type { Member } from '../domain/member/member.ts';
import { FULL_BASIS_POINTS, type Money, format, isNegative, shareInBasisPoints, sum } from '../domain/money/money.ts';
import { type YearMonth, defaultDateIn, toLocalIsoDate } from '../domain/shared/dates.ts';
import { dayLabel, Field, FormError, UndoNotice, useData, useDeleteWithUndo, useMe } from './common.tsx';
import { PersonalCategoryChart, PersonalHistoryChart } from './PersonalCharts.tsx';
import { PersonalExpenseSheet } from './PersonalExpenseSheet.tsx';
import { Icon } from './icons.tsx';
import { useServices } from './services-context.tsx';
import { t } from './i18n/index.ts';

/** P1 once there is a reference income. Bar widths are layout; every figure comes from the service. */
function SavingsSummary({ household, spent, savings }: { household: Money; spent: Money; savings: Money }) {
  const negative = isNegative(savings);
  const whole = sum(negative ? [household, spent] : [household, spent, savings], savings.currency);
  const householdWidth = whole.amountMinor > 0 ? shareInBasisPoints(household, whole) : 0;
  const spentWidth = whole.amountMinor > 0 ? Math.min(FULL_BASIS_POINTS - householdWidth, shareInBasisPoints(spent, whole)) : 0;
  const savingsWidth = whole.amountMinor > 0 ? FULL_BASIS_POINTS - householdWidth - spentWidth : 0;

  return (
    <>
      <p className={`personal-savings__value${negative ? ' negative' : ''}`}>{format(savings)}</p>
      {negative && <p className="personal-savings__notice" role="status">{t('personal.negativeSavings')}</p>}
      <svg className="personal-savings__bar" viewBox={`0 0 ${FULL_BASIS_POINTS} 16`} preserveAspectRatio="none" aria-hidden="true">
        <rect className="personal-savings__segment--household" x="0" y="0" width={householdWidth} height="16" />
        <rect className="personal-savings__segment--spent" x={householdWidth} y="0" width={spentWidth} height="16" />
        <rect className="personal-savings__segment--savings" x={householdWidth + spentWidth} y="0" width={savingsWidth} height="16" />
      </svg>
      <ul className="personal-savings__legend" aria-label={t('personal.savingsTitle')}>
        <li><span>{t('personal.household')}</span><strong>{format(household)}</strong></li>
        <li><span>{t('personal.spent')}</span><strong>{format(spent)}</strong></li>
        <li><span>{t('personal.savings')}</span><strong>{format(savings)}</strong></li>
      </ul>
    </>
  );
}

export function PersonalView({ month }: { month: YearMonth }) {
  const services = useServices();
  const loadHousehold = useCallback(
    () => Promise.all([services.members.list(), services.categories.list({ includeArchived: true })]),
    [services],
  );
  const household = useData(loadHousehold);
  const [me, setMe] = useMe(household.data?.[0] ?? []);
  if (household.error) return <p className="error" role="alert">{household.error}</p>;
  if (!household.data) return <p className="muted" role="status">{t('ui.loading')}</p>;
  const [members, categories] = household.data;

  const activeMembers = members.filter((member) => member.active);
  if (activeMembers.length === 0) {
    return (
      <section className="panel personal-who" aria-labelledby="personal-who-heading">
        <h2 id="personal-who-heading">{t('personal.noActiveMembersHeading')}</h2>
        <p className="muted">{t('personal.noActiveMembersHelp')}</p>
        <a href="#/ajustes">{t('personal.manageMembers')}</a>
      </section>
    );
  }

  const member = activeMembers.find((candidate) => candidate.id === me);
  if (!member) {
    return (
      <section className="panel personal-who" aria-labelledby="personal-who-heading">
        <h2 id="personal-who-heading">{t('members.whoAmI')}</h2>
        <Field label={t('members.whoAmI')} name="me" errors={{}}>
          <select value="" onChange={(event) => setMe((event.target.value || null) as Member['id'] | null)}>
            <option value="">{t('members.chooseWho')}</option>
            {activeMembers.map((activeMember) => <option key={activeMember.id} value={activeMember.id}>{activeMember.name}</option>)}
          </select>
        </Field>
      </section>
    );
  }
  return (
    <PersonalMonthView
      key={`${member.id}:${month}`}
      member={member}
      activeMembers={activeMembers}
      categories={categories}
      month={month}
      onMeChange={(id) => setMe(id)}
    />
  );
}

function PersonalMonthView({
  member,
  activeMembers,
  categories,
  month,
  onMeChange,
}: {
  member: Member;
  activeMembers: readonly Member[];
  categories: readonly Category[];
  month: YearMonth;
  onMeChange: (memberId: Member['id'] | null) => void;
}) {
  const services = useServices();
  const loadMonth = useCallback(
    () => services.personal.monthSummary(member.id, month),
    [services, member.id, month],
  );
  const summary = useData(loadMonth);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const expenseActions = useDeleteWithUndo<Expense>(
    (expense) => services.expenses.delete(expense.id),
    services.expenses.restore.bind(services.expenses),
    summary.reload,
  );

  if (summary.error) return <p className="error" role="alert">{summary.error}</p>;
  if (!summary.data) return <p className="muted" role="status">{t('ui.loading')}</p>;

  const data = summary.data;
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return (
    <div className="personal-view">
      <header className="page-heading">
        <h2>{t('app.personal')}</h2>
        <p className="muted">{member.name}</p>
        {activeMembers.length > 1 && (
          <Field label={t('members.whoAmI')} name="me" errors={{}}>
            <select value={member.id} onChange={(event) => onMeChange((event.target.value || null) as Member['id'] | null)}>
              {activeMembers.map((activeMember) => <option key={activeMember.id} value={activeMember.id}>{activeMember.name}</option>)}
            </select>
          </Field>
        )}
      </header>
      <FormError errors={expenseActions.errors} />

      <section className="panel personal-savings" aria-labelledby="personal-savings-heading">
        <h3 id="personal-savings-heading">{t('personal.savingsTitle')}</h3>
        {data.savings === null
          ? <p className="muted">{t('personal.noReferenceIncome')} <a href="#/ajustes">{t('family.openSettings')}</a></p>
          : <SavingsSummary household={data.household} spent={data.spent} savings={data.savings} />}
      </section>

      <section className="panel personal-accounts" aria-labelledby="personal-accounts-heading">
        <h3 id="personal-accounts-heading">{t('personal.accountsHeading')}</h3>
        <dl>
          {data.referenceIncome && <><dt>{t('personal.referenceIncome')}</dt><dd>{format(data.referenceIncome)}</dd></>}
          <dt>{t('personal.extraIncome')}</dt><dd>{format(data.extraIncome)}</dd>
          <dt>{t('personal.householdContribution')}</dt><dd>{t('family.minusAmount', { amount: format(data.household) })}</dd>
          <dt>{t('personal.spentToDate')}</dt><dd>{t('family.minusAmount', { amount: format(data.spent) })}</dd>
        </dl>
      </section>

      <PersonalCategoryChart byCategory={data.byCategory} spent={data.spent} categories={categories} />
      <PersonalHistoryChart history={data.history} selectedMonth={month} />

      {editing !== null && (
        <PersonalExpenseSheet
          key={editing === 'new' ? 'new' : editing.id}
          expense={editing === 'new' ? undefined : editing}
          me={member.id}
          categories={categories}
          today={defaultDateIn(month, toLocalIsoDate(services.clock.now()))}
          onSaved={() => { setEditing(null); summary.reload(); }}
          onCancel={() => setEditing(null)}
          onDelete={(expense) => { setEditing(null); void expenseActions.remove(expense); }}
        />
      )}

      <section className="panel personal-expenses" aria-labelledby="personal-expenses-heading">
        <h3 id="personal-expenses-heading">{t('personal.expensesHeading')}</h3>
        {data.expenses.length === 0 && <p className="muted">{t('personal.noExpenses')}</p>}
        <ul className="list plan-list">
          {data.expenses.map((expense) => (
            <li key={expense.id}>
              <button
                type="button"
                className="plan-row"
                aria-label={t('personal.openExpense', { name: expense.description, amount: format(expense.amount) })}
                onClick={() => setEditing(expense)}
              >
                <span className="row__main">
                  <span>{expense.description}</span>
                  <span className="muted small">{dayLabel(expense.date)} · {categoryNames.get(expense.categoryId) ?? ''}</span>
                </span>
                <span className="row__amount">{format(expense.amount)}</span>
                <Icon name="forward" />
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="add-line-row" onClick={() => setEditing('new')}>{t('personal.addExpense')}</button>
          </li>
        </ul>
      </section>
      <UndoNotice message={expenseActions.deleted && t('ui.deletedExpense', { name: expenseActions.deleted.description })} onUndo={() => void expenseActions.undo()} />
    </div>
  );
}
