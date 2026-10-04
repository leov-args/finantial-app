import { useCallback, useEffect, useState } from 'react';
import type { Member } from '../domain/member/member.ts';
import type { Money } from '../domain/money/money.ts';
import { MembersView } from './NameListView.tsx';
import { Field, FormError, amountText, readIncome, useData } from './common.tsx';
import { FORM, toErrors } from './errors.ts';
import { PlanList } from './FamilyView.tsx';
import { t, type MessageKey } from './i18n/index.ts';
import { useServices } from './services-context.tsx';

const STEPS: MessageKey[] = ['onboarding.step1', 'onboarding.step2', 'onboarding.step3'];
const INTROS: MessageKey[] = ['onboarding.membersIntro', 'onboarding.incomesIntro', 'onboarding.planIntro'];
const SETUP_STORAGE_KEY = 'family-finance.setup-step';

/**
 * Device-only progress of the first-use setup (X6): leaving and coming back resumes
 * at the same step. Everything typed is already in IndexedDB; only the step lives here.
 */
export function useSetupStep(): [number | null, (step: number | null) => void] {
  const [step, setStep] = useState<number | null>(() => {
    try {
      const saved = Number(localStorage.getItem(SETUP_STORAGE_KEY));
      return saved >= 1 && saved <= STEPS.length ? saved : null;
    } catch {
      return null;
    }
  });
  const save = useCallback((next: number | null) => {
    setStep(next);
    try {
      if (next) localStorage.setItem(SETUP_STORAGE_KEY, String(next));
      else localStorage.removeItem(SETUP_STORAGE_KEY);
    } catch {
      // A private browsing policy may deny localStorage; the setup still works until a reload.
    }
  }, []);
  return [step, save];
}

export function Onboarding({ step, onStep }: { step: number; onStep: (step: number | null) => void }) {
  const services = useServices();
  const load = useCallback(async () => {
    const [members, items] = await Promise.all([services.members.list(), services.plan.listWithAmounts()]);
    return { members, items };
  }, [services]);
  const { data, error, reload } = useData(load);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [incomeErrors, setIncomeErrors] = useState<Record<string, string>>({});

  // Saves the step as soon as the setup shows, so adding the first member doesn't end it.
  useEffect(() => onStep(step), [step, onStep]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="muted" role="status">{t('ui.loading')}</p>;

  const active = data.members.filter((member) => member.active);
  const incomeDraft = (member: Member): string => drafts[member.id] ?? (member.referenceIncome ? amountText(member.referenceIncome) : '');

  /** Step 2 saves on «Siguiente», so moving on never drops a typed income. */
  async function saveIncomesAndContinue() {
    const errors: Record<string, string> = {};
    const changes: { id: string; referenceIncome: Money | null }[] = [];
    for (const member of active) {
      const referenceIncome = readIncome(incomeDraft(member));
      if (referenceIncome === undefined) errors[member.id] = t('errors.invalidIncome');
      else changes.push({ id: member.id, referenceIncome });
    }
    if (Object.keys(errors).length > 0) {
      setIncomeErrors({ [FORM]: t('errors.review'), ...errors });
      return;
    }
    try {
      await services.members.setReferenceIncomes(changes);
      setIncomeErrors({});
      setDrafts({});
      reload();
      onStep(3);
    } catch (e) {
      setIncomeErrors(toErrors(e));
    }
  }

  const finish = () => {
    onStep(null);
    window.location.hash = '#/familiar';
  };

  return (
    <div className="onboarding">
      <header className="page-heading">
        <h2>{t('onboarding.title')}</h2>
        <p className="muted">{t('onboarding.intro')}</p>
      </header>

      <section className="onboarding__section" aria-labelledby="onboarding-title">
        <p className="muted small">{t('onboarding.progress', { step, total: STEPS.length })}</p>
        <h3 id="onboarding-title">{t(STEPS[step - 1] ?? 'onboarding.step1')}</h3>
        <p className="muted">{t(INTROS[step - 1] ?? 'onboarding.membersIntro')}</p>
        {step === 1 && <MembersView />}
        {step === 2 && (
          <div className="panel">
            <div className="settings-list">
              {active.map((member) => (
                <Field key={member.id} label={member.name} name={member.id} errors={incomeErrors}>
                  <input
                    name={member.id}
                    inputMode="decimal"
                    value={incomeDraft(member)}
                    onChange={(event) => setDrafts({ ...drafts, [member.id]: event.target.value })}
                  />
                </Field>
              ))}
            </div>
            <FormError errors={incomeErrors} />
          </div>
        )}
        {step === 3 && (
          <div className="panel">
            <PlanList items={data.items} members={data.members} reload={reload} />
          </div>
        )}
      </section>

      <div className="onboarding__nav">
        {step > 1 && (
          <button type="button" onClick={() => onStep(step - 1)}>
            {t('onboarding.back')}
          </button>
        )}
        {step === 1 && (
          <button type="button" className="primary" onClick={() => onStep(2)} disabled={active.length === 0}>
            {t('onboarding.next')}
          </button>
        )}
        {step === 2 && (
          <button type="button" className="primary" onClick={() => void saveIncomesAndContinue()}>
            {t('onboarding.next')}
          </button>
        )}
        {step === 3 && (
          <button type="button" className="primary" onClick={finish}>
            {t('onboarding.finish')}
          </button>
        )}
      </div>
    </div>
  );
}
