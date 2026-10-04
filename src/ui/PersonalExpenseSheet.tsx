import { type FormEvent, useId, useState } from 'react';
import type { CreateExpenseInput } from '../application/expenses/expense-service.ts';
import type { Category } from '../domain/category/category.ts';
import type { Expense } from '../domain/expense/expense.ts';
import { DEFAULT_CURRENCY } from '../domain/money/currency.ts';
import { parseMoney } from '../domain/money/money.ts';
import type { IsoDate } from '../domain/shared/dates.ts';
import type { MemberId } from '../domain/shared/ids.ts';
import { TEXT_LIMITS } from '../domain/shared/text.ts';
import { Field, FormError, amountText, text, useSheet } from './common.tsx';
import { toErrors } from './errors.ts';
import { useServices } from './services-context.tsx';
import { t } from './i18n/index.ts';

/**
 * P5: quick personal expense in a sheet. Only amount, category and date are
 * asked; owner and payer are «yo», and an edit keeps the payer, type and
 * recurrence the expense already had.
 */
export function PersonalExpenseSheet({ expense, me, categories, today, onSaved, onCancel, onDelete }: {
  expense?: Expense | undefined;
  me: MemberId;
  categories: readonly Category[];
  today: IsoDate;
  onSaved: () => void;
  onCancel: () => void;
  onDelete?: (expense: Expense) => void;
}) {
  const { expenses } = useServices();
  const sheet = useSheet(onCancel);
  const titleId = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const categoryOptions = categories.filter((c) => !c.archived || c.id === expense?.categoryId);
  // A derived description is left blank so it follows merchant/category changes.
  const derived = expense && (expense.merchant ?? categories.find((c) => c.id === expense.categoryId)?.name);
  const ownDescription = expense && expense.description !== derived ? expense.description : '';
  const fixed = {
    scope: { type: 'INDIVIDUAL', ownerId: me },
    paidBy: expense?.paidBy ?? me,
    expenseType: expense?.expenseType ?? 'VARIABLE',
    recurrence: expense?.recurrence ?? null,
  } as const;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      const amount = parseMoney(text(f, 'amount'), DEFAULT_CURRENCY);
      const fields: CreateExpenseInput = {
        ...fixed,
        amount: { amountMinor: amount.amountMinor, currency: amount.currency },
        date: text(f, 'date'),
        categoryId: text(f, 'categoryId'),
        merchant: text(f, 'merchant') || null,
        // Empty → the service derives it from the merchant or the category.
        description: text(f, 'description'),
        notes: text(f, 'notes'),
      };
      if (expense) await expenses.update({ id: expense.id, changes: fields });
      else await expenses.create(fields);
      sheet.close(onSaved);
    } catch (err) {
      setErrors(toErrors(err));
    }
  }

  const title = expense ? t('personal.editExpense') : t('personal.addExpense');
  return (
    <dialog {...sheet.dialogProps} className="sheet" aria-labelledby={titleId}>
      <div className="sheet__grabber" {...sheet.grabberProps} />
      <form className="form" onSubmit={submit} aria-label={title}>
        <h3 id={titleId}>{title}</h3>
        <Field label={t('common.amount')} name="amount" errors={errors}>
          <input name="amount" inputMode="decimal" required autoFocus defaultValue={expense ? amountText(expense.amount) : ''} />
        </Field>
        <Field label={t('common.category')} name="categoryId" errors={errors}>
          <select name="categoryId" required defaultValue={expense?.categoryId ?? ''}>
            <option value="" disabled>{t('ui.chooseCategory')}</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.archived ? t('ui.archivedLabel', { name: c.name }) : c.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('common.date')} name="date" errors={errors}>
          <input type="date" name="date" required defaultValue={expense?.date ?? today} />
        </Field>
        <details>
          <summary>{t('ui.moreOptions')}</summary>
          <Field label={t('common.merchant')} name="merchant" errors={errors}>
            <input name="merchant" maxLength={TEXT_LIMITS.merchant} defaultValue={expense?.merchant ?? ''} />
          </Field>
          <Field label={t('common.description')} name="description" errors={errors}>
            <input name="description" maxLength={TEXT_LIMITS.description} placeholder={t('ui.emptyDescription')} defaultValue={ownDescription} />
          </Field>
          <Field label={t('common.notes')} name="notes" errors={errors}>
            <textarea name="notes" maxLength={TEXT_LIMITS.notes} defaultValue={expense?.notes ?? ''} />
          </Field>
        </details>
        <FormError errors={errors} />
        <div className="actions">
          <button type="submit">{t('common.save')}</button>
          <button type="button" onClick={() => sheet.close()}>{t('common.cancel')}</button>
          {expense && onDelete && <button type="button" className="danger" onClick={() => sheet.close(() => onDelete(expense))}>{t('common.delete')}</button>}
        </div>
      </form>
    </dialog>
  );
}
