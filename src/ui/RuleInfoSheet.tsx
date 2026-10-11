import { useId } from 'react';
import { format, shareInBasisPoints, subtract } from '../domain/money/money.ts';
import type { Member } from '../domain/member/member.ts';
import type { FamilySplit, SplitRule } from '../domain/family/contributions.ts';
import { percent, useSheet } from './common.tsx';
import { t } from './i18n/index.ts';

/** A modal sheet that explains the selected split rule with the household's own figures. */
export function RuleInfoSheet({ rule, split, members, onClose }: { rule: SplitRule; split: FamilySplit; members: readonly Member[]; onClose: () => void }) {
  const sheet = useSheet(onClose);
  const titleId = useId();
  const names = new Map(members.map((member) => [member.id, member.name]));
  // Weights are ÷ the total income: with none, there is nothing to weigh (a 0 € income still participates).
  const hasFigures = split.contributions.length > 0 && split.incomeTotal.amountMinor > 0;
  const equalKeep = rule === 'EQUAL_KEEP';
  const hasAssigned = subtract(split.planTotal, split.formulaTotal).amountMinor > 0;

  return (
    <dialog {...sheet.dialogProps} className="sheet" aria-labelledby={titleId}>
      <div className="sheet__grabber" {...sheet.grabberProps} />
      <div className="form">
        <h3 id={titleId}>{equalKeep ? t('members.equalKeep') : t('members.proportional')}</h3>
        {equalKeep && <p>{t('ui.ruleInfoEqualKeep')}</p>}
        {!equalKeep && !hasFigures && <p>{t('ui.proportionalDescription')}</p>}
        {!equalKeep && hasFigures && (
          <>
            <p>{t('ui.ruleInfoWeights')}</p>
            <ul className="calculation-list">
              {split.contributions.map((contribution) => (
                <li key={contribution.memberId}>
                  <strong>{names.get(contribution.memberId) ?? contribution.memberId}</strong>
                  <span>
                    {t('ui.ruleInfoWeight', {
                      income: format(contribution.income),
                      total: format(split.incomeTotal),
                      weight: percent(shareInBasisPoints(contribution.income, split.incomeTotal)),
                    })}
                  </span>
                </li>
              ))}
            </ul>
            {split.formulaTotal.amountMinor > 0 && <p>{t('ui.ruleInfoSameRate', { rate: percent(split.contributions[0]?.formulaRate ?? 0) })}</p>}
          </>
        )}
        <p>
          {t('ui.ruleInfoAssigned')}
          {!equalKeep && hasFigures && hasAssigned && ` ${t('ui.ruleInfoAssignedRate')}`}
        </p>
        <div className="actions">
          <button type="button" autoFocus onClick={() => sheet.close()}>{t('ui.ruleInfoClose')}</button>
        </div>
      </div>
    </dialog>
  );
}
