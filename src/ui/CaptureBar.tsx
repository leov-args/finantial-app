import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ApplicationError } from '../application/shared/errors.ts';
import type { Category } from '../domain/category/category.ts';
import type { Expense } from '../domain/expense/expense.ts';
import type { Income } from '../domain/income/income.ts';
import { format } from '../domain/money/money.ts';
import { toLocalIsoDate } from '../domain/shared/dates.ts';
import type { Intent, ParserContext } from '../agent/contracts.ts';
import { parse, selectExpenseCategory } from '../agent/parser.ts';
import { FORM, toErrors } from './errors.ts';
import { useData, useMe, useWide } from './common.tsx';
import { Icon } from './icons.tsx';
import { t } from './i18n/index.ts';
import { useServices } from './services-context.tsx';

type ExpenseIntent = Extract<Intent, { readonly kind: 'CREATE_EXPENSE' }>;
type UndoSnapshot = { readonly kind: 'EXPENSE'; readonly snapshot: Expense } | { readonly kind: 'INCOME'; readonly snapshot: Income };

interface CaptureMessage {
  readonly id: number;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly undo?: UndoSnapshot;
  readonly undoUsed?: boolean;
  readonly feedback?: string;
}

interface PendingCategory {
  readonly messageId: number;
  readonly intent: ExpenseIntent;
}

export function CaptureBar() {
  const services = useServices();
  const wide = useWide();
  const loadHousehold = useCallback(async () => {
    const [members, categories] = await Promise.all([services.members.list(), services.categories.list()]);
    return { members, categories };
  }, [services]);
  const household = useData(loadHousehold);
  const members = household.data?.members ?? [];
  const categories = household.data?.categories ?? [];
  const activeMembers = members.filter((member) => member.active);
  const [me] = useMe(members);
  const currentMember = activeMembers.find((member) => member.id === me);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<CaptureMessage[]>([]);
  const [pendingCategory, setPendingCategory] = useState<PendingCategory | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeUndoId, setNoticeUndoId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const nextMessageId = useRef(0);
  const barRef = useRef<HTMLElement>(null);

  // On mobile the bar is fixed over the page; its live height lets the page leave room for it.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty('--capture-bar-height', `${bar.offsetHeight}px`));
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--capture-bar-height');
    };
  }, []);

  function appendMessage(role: CaptureMessage['role'], text: string): number {
    const id = nextMessageId.current++;
    setMessages((previous) => [...previous, { id, role, text }]);
    return id;
  }

  function updateMessage(id: number, update: (message: CaptureMessage) => CaptureMessage): void {
    setMessages((previous) => previous.map((message) => (message.id === id ? update(message) : message)));
  }

  /** An assistant message, also shown as the current notice. */
  function reply(text: string): number {
    setNotice(text);
    return appendMessage('assistant', text);
  }

  function showError(error: unknown): void {
    reply(toErrors(error)[FORM] ?? t('errors.generic'));
  }

  function addResult(messageId: number | undefined, text: string, undo: UndoSnapshot): void {
    const id = messageId ?? appendMessage('assistant', text);
    updateMessage(id, (message) => ({ ...message, text, undo, undoUsed: false }));
    setNotice(text);
    setNoticeUndoId(id);
    household.reload();
  }

  async function executeIntent(intent: Intent, messageId?: number, selectedCategoryName?: string): Promise<void> {
    switch (intent.kind) {
      case 'CREATE_EXPENSE': {
        const draft = intent.draft;
        const amount = draft.amountMinor?.value;
        const currency = draft.currency?.value;
        const date = draft.date?.value;
        const categoryId = draft.categoryId?.value;
        const expenseType = draft.expenseType?.value;
        const scope = draft.scope?.value;
        const paidBy = draft.paidBy?.value;
        if (amount === undefined || !currency || !date || !categoryId || !expenseType || !scope || !paidBy) {
          throw new Error('Incomplete expense intent.');
        }
        const created = await services.expenses.create({
          amount: { amountMinor: amount, currency },
          date,
          categoryId,
          expenseType,
          scope,
          paidBy,
          merchant: draft.merchant?.value ?? null,
          recurrence: null,
        });
        const categoryName = selectedCategoryName ?? categories.find((category) => category.id === created.categoryId)?.name;
        const confirmation = t('assistant.expenseSaved', {
          amount: format(created.amount),
          category: categoryName ?? t('assistant.unknownCategory'),
        });
        addResult(messageId, confirmation, { kind: 'EXPENSE', snapshot: created });
        return;
      }
      case 'CREATE_INCOME': {
        const draft = intent.draft;
        const amount = draft.amountMinor?.value;
        const currency = draft.currency?.value;
        const date = draft.date?.value;
        const memberId = draft.memberId?.value;
        if (amount === undefined || !currency || !date || !memberId) throw new Error('Incomplete income intent.');
        const created = await services.incomes.create({
          memberId,
          amount: { amountMinor: amount, currency },
          date,
          schedule: { kind: 'ONE_OFF' },
          source: 'OTHER',
          ...(draft.description && { description: draft.description.value }),
        });
        const description = created.description
          ? t('assistant.incomeDescription', { description: created.description })
          : '';
        const confirmation = t('assistant.incomeSaved', { amount: format(created.amount), description });
        addResult(messageId, confirmation, { kind: 'INCOME', snapshot: created });
        return;
      }
      default:
        reply(t('assistant.help'));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const phrase = input.trim();
    if (!phrase) return;

    appendMessage('user', phrase);
    setNotice(null);
    setNoticeUndoId(null);
    setPendingCategory(null);

    if (household.error) {
      reply(household.error);
      return;
    }
    if (!household.data) {
      setNotice(t('ui.loading'));
      return;
    }
    if (!currentMember) {
      reply(activeMembers.length === 0 ? t('assistant.noActiveMembers') : t('assistant.chooseMe'));
      return;
    }

    setBusy(true);
    const context: ParserContext = {
      today: toLocalIsoDate(services.clock.now()),
      currentMemberId: currentMember.id,
      members: activeMembers.map(({ id, name }) => ({ id, name })),
      categories: categories.map(({ id, name }) => ({ id, name })),
    };
    try {
      const result = await parse(phrase, context);
      if (result.status === 'COMPLETE') {
        await executeIntent(result.intent);
      } else if (
        result.status === 'NEEDS_CLARIFICATION'
        && result.intent.kind === 'CREATE_EXPENSE'
        && result.questions.some((item) => item.field === 'category')
      ) {
        const messageId = reply(t('assistant.categoryQuestion'));
        setPendingCategory({ intent: result.intent, messageId });
      } else {
        reply(t('assistant.help'));
      }
      setInput('');
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function chooseCategory(category: Category): Promise<void> {
    if (!pendingCategory || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const selected = selectExpenseCategory(pendingCategory.intent, category.id);
      await executeIntent(selected, pendingCategory.messageId, category.name);
      setPendingCategory(null);
    } catch (error) {
      showError(error);
      household.reload();
    } finally {
      setBusy(false);
    }
  }

  async function undo(messageId: number): Promise<void> {
    const message = messages.find((item) => item.id === messageId);
    if (!message?.undo || message.undoUsed || busy) return;
    setBusy(true);
    try {
      if (message.undo.kind === 'EXPENSE') {
        await services.expenses.delete(message.undo.snapshot.id, message.undo.snapshot);
      } else {
        await services.incomes.delete(message.undo.snapshot.id, message.undo.snapshot);
      }
      updateMessage(messageId, (item) => ({ ...item, undoUsed: true }));
      setNotice(t('assistant.undoDone'));
      setNoticeUndoId(null);
      household.reload();
    } catch (error) {
      const text = error instanceof ApplicationError && error.code === 'CONFLICT'
        ? t('assistant.undoConflict')
        : (toErrors(error)[FORM] ?? t('errors.generic'));
      updateMessage(messageId, (item) => ({ ...item, undoUsed: true, feedback: text }));
      setNotice(text);
      setNoticeUndoId(null);
    } finally {
      setBusy(false);
    }
  }

  const latestUndo = messages.find((message) => message.id === noticeUndoId && message.undo && !message.undoUsed);
  const currentIdentity = household.error
    ? household.error
    : !household.data
      ? t('ui.loading')
      : currentMember
        ? t('assistant.actingAs', { name: currentMember.name })
        : activeMembers.length === 0
          ? t('assistant.noActiveMembers')
          : t('assistant.chooseMe');

  return (
    <section ref={barRef} className="capture-bar" aria-label={t('assistant.captureLabel')}>
      <p className={`capture-bar__identity${currentMember ? '' : ' capture-bar__identity--warning'}`}>
        {currentIdentity}
        {!currentMember && household.data && (
          <a href="#/ajustes">
            {activeMembers.length === 0 ? t('assistant.manageMembers') : t('assistant.chooseMeLink')}
          </a>
        )}
      </p>
      <form className="capture-bar__form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
        <div className="capture-bar__composer">
          <input
            aria-label={t('assistant.inputLabel')}
            autoComplete="off"
            enterKeyHint="send"
            placeholder={wide ? t('assistant.placeholderShort') : t('assistant.placeholder')}
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
          />
          <button type="submit" aria-label={t('assistant.submit')} disabled={busy}><Icon name="send" /></button>
        </div>
        {notice && (
          <div className="capture-bar__notice" role="status" aria-live="polite">
            <span>{notice}</span>
            {latestUndo && <button type="button" onClick={() => void undo(latestUndo.id)} disabled={busy}>{t('common.restore')}</button>}
          </div>
        )}
        {pendingCategory && (
          <div className="capture-bar__clarification">
            {pendingCategory.intent.draft.merchant && (
              <p>{t('assistant.merchantPreview', { merchant: pendingCategory.intent.draft.merchant.value })}</p>
            )}
            <div className="capture-bar__options" role="group" aria-label={t('assistant.categoryQuestion')}>
              {/* Live active categories, so one archived or renamed meanwhile is not offered stale. */}
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  aria-label={t('assistant.chooseCategory', { name: category.name })}
                  onClick={() => void chooseCategory(category)}
                  disabled={busy}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <details className="capture-bar__history">
          <summary>{t('assistant.history')}</summary>
          <ol role="log" aria-label={t('assistant.history')}>
            {messages.map((message) => (
              <li key={message.id}>
                <p className="capture-bar__speaker">{t(message.role === 'user' ? 'assistant.you' : 'assistant.reply')}</p>
                <p>{message.text}</p>
                {message.feedback && <p className="error" role="alert">{message.feedback}</p>}
                {message.undo && message.undoUsed && <p className="muted">{t('assistant.undoUsed')}</p>}
                {message.undo && !message.undoUsed && message.id !== noticeUndoId && (
                  <button type="button" onClick={() => void undo(message.id)} disabled={busy}>{t('common.restore')}</button>
                )}
              </li>
            ))}
          </ol>
        </details>
      </form>
    </section>
  );
}
