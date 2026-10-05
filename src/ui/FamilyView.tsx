import { useCallback, useState } from 'react';
import { format, subtract } from '../domain/money/money.ts';
import type { Money } from '../domain/money/money.ts';
import type { Member } from '../domain/member/member.ts';
import type { PlanItem } from '../domain/family/plan.ts';
import type { Contribution, FamilySplit, HouseholdSettings } from '../domain/family/contributions.ts';
import { useData, UndoNotice, percent, useDeleteWithUndo, useWide } from './common.tsx';
import { Icon } from './icons.tsx';
import { PlanItemSheet } from './PlanItemSheet.tsx';
import { useServices } from './services-context.tsx';
import { t } from './i18n/index.ts';

type FamilyData = { items: Array<{ item: PlanItem; amount: Money }>; members: Member[]; split: FamilySplit; settings: HouseholdSettings };

/** « + 300,00 € Portátil» for each non-zero share of the member; '' when there is none. */
const assignedTerms = (items: FamilyData['items'], contribution: Contribution): string =>
  items
    .flatMap(({ item }) => (item.kind.type === 'ASSIGNED' ? item.kind.shares.map((share) => ({ item, share })) : []))
    .filter(({ share }) => share.memberId === contribution.memberId && share.amount.amountMinor !== 0)
    .map(({ item, share }) => t('family.assignedTerm', { amount: format(share.amount), name: item.name }))
    .join('');

export function FamilyView() {
  const { members, plan } = useServices();
  const load = useCallback(async (): Promise<FamilyData> => {
    const [items, householdMembers, split, settings] = await Promise.all([
      plan.listWithAmounts(),
      members.list(),
      plan.contributions(),
      plan.getSettings(),
    ]);
    return { items, members: householdMembers, split, settings };
  }, [members, plan]);
  const { data, error, reload } = useData(load);
  const wide = useWide();

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="muted" role="status">{t('ui.loading')}</p>;

  const names = new Map(data.members.map((member) => [member.id, member]));
  const hasParticipants = data.split.contributions.length > 0;
  const isDeficit = data.split.remaining.amountMinor < 0;
  const equalKeep = data.settings.splitRule === 'EQUAL_KEEP';
  const assignedTotal = subtract(data.split.planTotal, data.split.formulaTotal);
  const breakdown = (contribution: Contribution): string => {
    const params = {
      income: format(contribution.income),
      formula: format(contribution.formula),
      assigned: assignedTerms(data.items, contribution),
      keeps: format(contribution.keeps),
    };
    return equalKeep
      ? t('family.breakdownEqualKeep', params)
      : t('family.breakdownProportional', { ...params, rate: percent(contribution.formulaRate) });
  };

  return (
    <div className="family-view">
      <header className="page-heading">
        <h2>{t('app.familiar')}</h2>
      </header>

      <div className="family-grid">
        <section className="panel family-summary" aria-labelledby="family-summary-heading">
          <h3 id="family-summary-heading">{t('family.monthlyTransfers')}</h3>
          {hasParticipants ? (
            <ul className="family-members list">
              {data.split.contributions.map((contribution) => {
                const member = names.get(contribution.memberId);
                return (
                  <li className="family-member" key={contribution.memberId}>
                    <span className="member-dot" data-color={member?.color} aria-hidden="true">{member ? [...member.name][0] : ''}</span>
                    <span className="family-member__name">{member?.name ?? contribution.memberId}</span>
                    <strong>{format(contribution.total)}</strong>
                    <span className={contribution.keeps.amountMinor < 0 ? 'muted small negative' : 'muted small'}>{t('family.keeps', { amount: format(contribution.keeps) })}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state family-empty">
              <h4>{t('family.noReferenceIncomes')}</h4>
              <p className="muted">{t('family.addReferenceIncomes')}</p>
              <a href="#/ajustes">{t('family.openSettings')}</a>
            </div>
          )}

          <div className="family-total">
            <span>{t('family.planTotal')}</span>
            <strong>{format(data.split.planTotal)}</strong>
          </div>
          {hasParticipants && !isDeficit && (
            <div className="family-balanced" role="status">
              <p><Icon name="check" /> {t('family.balanced')}</p>
              {/* The proof is the visible sum: every contribution adds up to the plan total. */}
              <p className="muted small">
                {t('family.balancedSum', { terms: data.split.contributions.map((contribution) => format(contribution.total)).join(' + '), total: format(data.split.planTotal) })}
              </p>
            </div>
          )}
          {isDeficit && (
            <p className="family-deficit negative" role="alert">
              {t('family.deficit', { amount: format(data.split.remaining) })}
            </p>
          )}

          {/* Open by default beside the plan on desktop; a row of this card on mobile. */}
          <details className="family-explanation" open={wide}>
            <summary><span>{t('family.howItWorks')}</span><Icon name="forward" /></summary>
            <p>{equalKeep ? t('family.equalKeepExplanation') : t('family.proportionalExplanation')}</p>
            <dl className="facts">
              <dt>{t('family.incomeTotal')}</dt>
              <dd>{format(data.split.incomeTotal)}</dd>
              <dt>{t('family.formulaTotal')}</dt>
              <dd>{t('family.minusAmount', { amount: format(data.split.formulaTotal) })}</dd>
              {assignedTotal.amountMinor > 0 && (
                <>
                  <dt>{t('family.assignedTotal')}</dt>
                  <dd>{t('family.minusAmount', { amount: format(assignedTotal) })}</dd>
                </>
              )}
              <dt>{t('family.remaining')}</dt>
              <dd className={isDeficit ? 'negative' : undefined}>{format(data.split.remaining)}</dd>
            </dl>
            <ul className="calculation-list">
              {data.split.contributions.map((contribution) => (
                <li key={contribution.memberId}>
                  <strong>{names.get(contribution.memberId)?.name ?? contribution.memberId}</strong>
                  <span>{breakdown(contribution)}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>

        <section className="panel family-plan" aria-labelledby="family-plan-heading">
          <h3 id="family-plan-heading">{t('family.planHeader', { amount: format(data.split.planTotal) })}</h3>
          <PlanList items={data.items} members={data.members} reload={reload} />
        </section>
      </div>
    </div>
  );
}

/** The plan lines with their edit sheet and undo; shared by Familiar and the first-use setup. */
export function PlanList({ items, members, reload }: { items: FamilyData['items']; members: Member[]; reload: () => void }) {
  const { plan } = useServices();
  const [editing, setEditing] = useState<PlanItem | null | undefined>(undefined);
  const planActions = useDeleteWithUndo<PlanItem>((item) => plan.delete(item.id), plan.restore.bind(plan), reload);
  const names = new Map(members.map((member) => [member.id, member]));
  return (
    <>
      {editing !== undefined && (
        <PlanItemSheet
          key={editing?.id ?? 'new'}
          item={editing ?? undefined}
          members={members}
          onSaved={() => { setEditing(undefined); reload(); }}
          onCancel={() => setEditing(undefined)}
          onDelete={(item) => { setEditing(undefined); planActions.remove(item); }}
        />
      )}
      {items.length === 0 && <p className="muted">{t('family.emptyPlan')}</p>}
      <ul className="list plan-list">
        {items.map(({ item, amount }) => (
          <li key={item.id}>
            <button
              type="button"
              className="plan-row"
              aria-label={t('family.openLine', { name: item.name, amount: format(amount) })}
              onClick={() => setEditing(item)}
            >
              <span className="row__main">
                <span>{item.name}</span>
                {item.kind.type === 'ASSIGNED' && (
                  <span className="muted small">
                    {item.kind.shares.map((share) => `${names.get(share.memberId)?.name ?? share.memberId}: ${format(share.amount)}`).join(' · ')}
                  </span>
                )}
              </span>
              {item.kind.type === 'ASSIGNED' && <span className="assigned-badge">{t('family.assigned')}</span>}
              <span className="row__amount">{format(amount)}</span>
              <Icon name="forward" />
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="add-line-row" onClick={() => setEditing(null)}>{t('family.addCommonExpense')}</button>
        </li>
      </ul>
      <UndoNotice message={planActions.deleted ? t('ui.deletedNamed', { name: planActions.deleted.name }) : null} onUndo={planActions.undo} />
    </>
  );
}
