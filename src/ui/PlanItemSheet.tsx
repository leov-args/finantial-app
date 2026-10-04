import { type FormEvent, useId, useState } from 'react';
import type { CreatePlanItemInput, UpdatePlanItemInput } from '../application/family/plan-service.ts';
import type { Member } from '../domain/member/member.ts';
import type { PlanItem } from '../domain/family/plan.ts';
import { DEFAULT_CURRENCY } from '../domain/money/currency.ts';
import { type Money, isNegative, parseMoney } from '../domain/money/money.ts';
import { Field, FormError, amountText, text, useSheet } from './common.tsx';
import { FORM, toErrors } from './errors.ts';
import { useServices } from './services-context.tsx';
import { t } from './i18n/index.ts';

/** '' is a zero share; `undefined` means the text is not a valid non-negative amount. */
function readShare(input: string): Money | undefined {
  try {
    const amount = parseMoney(input || '0', DEFAULT_CURRENCY);
    return isNegative(amount) ? undefined : amount;
  } catch {
    return undefined;
  }
}

/** A modal sheet (bottom sheet on mobile, side panel on desktop) to add or edit a plan line. */
export function PlanItemSheet({ item, members, onSaved, onCancel, onDelete }: { item?: PlanItem; members: readonly Member[]; onSaved: () => void; onCancel: () => void; onDelete?: (item: PlanItem) => void }) {
  const { plan } = useServices();
  const sheet = useSheet(onCancel);
  const titleId = useId();
  const [kind, setKind] = useState<'FORMULA' | 'ASSIGNED'>(item?.kind.type ?? 'FORMULA');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const activeMembers = members.filter((member) => member.active && member.referenceIncome);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const name = text(form, 'name');
      let inputKind: CreatePlanItemInput['kind'];
      if (kind === 'FORMULA') {
        inputKind = { type: 'FORMULA', amount: parseMoney(text(form, 'amount'), DEFAULT_CURRENCY) };
      } else {
        const shareErrors: Record<string, string> = {};
        const shares = activeMembers.flatMap((member) => {
          const amount = readShare(text(form, `share-${member.id}`));
          if (amount) return [{ memberId: member.id, amount }];
          shareErrors[`share-${member.id}`] = t('errors.invalidAmount');
          return [];
        });
        if (Object.keys(shareErrors).length > 0) return setErrors({ [FORM]: t('errors.review'), ...shareErrors });
        inputKind = { type: 'ASSIGNED', shares };
      }
      if (item) await plan.update({ id: item.id, changes: { name, kind: inputKind } } satisfies UpdatePlanItemInput);
      else await plan.create({ name, kind: inputKind } satisfies CreatePlanItemInput);
      sheet.close(onSaved);
    } catch (error) {
      const found = toErrors(error);
      // An assigned line has no amount field: its total is the sum of the shares.
      if (kind === 'ASSIGNED' && found['amount']) found[FORM] = found['amount'];
      setErrors(found);
    }
  }

  return (
    <dialog {...sheet.dialogProps} className="sheet" aria-labelledby={titleId}>
      <div className="sheet__grabber" {...sheet.grabberProps} />
      <form className="form" onSubmit={submit}>
        <h3 id={titleId}>{item ? t('family.editLine') : t('family.addLine')}</h3>
        <Field label={t('common.name')} name="name" errors={errors}>
          <input name="name" required autoFocus defaultValue={item?.name ?? ''} />
        </Field>
        <Field label={t('common.type')} name="kind" errors={errors}>
          <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="FORMULA">{t('family.formula')}</option>
            <option value="ASSIGNED">{t('family.assigned')}</option>
          </select>
        </Field>
        {kind === 'FORMULA' ? (
          <Field label={t('common.amount')} name="amount" errors={errors}>
            <input name="amount" inputMode="decimal" required defaultValue={item?.kind.type === 'FORMULA' ? amountText(item.kind.amount) : ''} />
          </Field>
        ) : activeMembers.map((member) => {
          const share = item?.kind.type === 'ASSIGNED' ? item.kind.shares.find((part) => part.memberId === member.id)?.amount : undefined;
          return (
            <Field key={member.id} label={member.name} name={`share-${member.id}`} errors={errors}>
              <input name={`share-${member.id}`} inputMode="decimal" defaultValue={share ? amountText(share) : ''} />
            </Field>
          );
        })}
        <FormError errors={errors} />
        <div className="actions">
          <button type="submit">{t('common.save')}</button>
          <button type="button" onClick={() => sheet.close()}>{t('common.cancel')}</button>
          {item && onDelete && <button type="button" className="danger" onClick={() => sheet.close(() => onDelete(item))}>{t('common.delete')}</button>}
        </div>
      </form>
    </dialog>
  );
}
