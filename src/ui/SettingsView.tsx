import { useCallback, useState } from 'react';
import { type Member, MEMBER_COLORS } from '../domain/member/member.ts';
import type { Money } from '../domain/money/money.ts';
import { useData, useMe, amountText, readIncome, Field, FormError } from './common.tsx';
import { CategoriesView, MembersView } from './NameListView.tsx';
import { FORM, toErrors } from './errors.ts';
import { t } from './i18n/index.ts';
import { useServices } from './services-context.tsx';

/** Feedback belongs to the section that triggered it, so it shows next to the control. */
type Status = { section: string; message: string; errors: Record<string, string> };

export function SettingsView() {
  const services = useServices();
  const load = useCallback(() => Promise.all([services.members.list(), services.plan.getSettings()]), [services]);
  const { data, error, reload } = useData(load);
  const [me, setMe] = useMe(data?.[0] ?? []);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status | null>(null);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="muted">{t('ui.loading')}</p>;
  const [members, settings] = data;
  const incomeDraft = (member: Member): string => drafts[member.id] ?? (member.referenceIncome ? amountText(member.referenceIncome) : '');
  const active = members.filter((member) => member.active);
  const colorOwner = new Map(active.map((member) => [member.color, member]));
  const errorsOf = (section: string) => (status?.section === section ? status.errors : {});
  const feedback = (section: string) =>
    status?.section === section && (
      <>
        <FormError errors={status.errors} />
        {status.message && <span className="success" role="status">{status.message}</span>}
      </>
    );
  const done = (section: string, message: string) => {
    setStatus({ section, message, errors: {} });
    reload();
  };
  const fail = (section: string, errors: Record<string, string>) => setStatus({ section, message: '', errors });

  async function run(section: string, message: string, action: () => Promise<unknown>) {
    try {
      await action();
      done(section, message);
    } catch (e) {
      fail(section, toErrors(e));
    }
  }

  // Only edited members are written: an untouched field must never clear a saved income.
  async function saveIncomes() {
    const errors: Record<string, string> = {};
    const changes: { id: string; referenceIncome: Money | null }[] = [];
    for (const [id, input] of Object.entries(drafts)) {
      const referenceIncome = readIncome(input);
      if (referenceIncome === undefined) errors[id] = t('errors.invalidIncome');
      else changes.push({ id, referenceIncome });
    }
    if (Object.keys(errors).length > 0) return fail('incomes', { [FORM]: t('errors.review'), ...errors });
    await run('incomes', t('ui.incomesSaved'), async () => {
      await services.members.setReferenceIncomes(changes);
      setDrafts({});
    });
  }

  return (
    <div className="settings-grid">
      <header className="page-heading">
        <h2>{t('app.settings')}</h2>
        <p className="muted">{t('ui.settingsIntro')}</p>
      </header>

      <MembersView />

      <section className="panel settings-section">
        <h3>{t('members.whoAmI')}</h3>
        <Field label={t('members.whoAmI')} name="me" errors={{}}>
          <select value={me ?? ''} onChange={(event) => setMe((event.target.value || null) as Member['id'] | null)}>
            <option value="">{t('members.chooseWho')}</option>
            {active.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </Field>
      </section>

      <section className="panel settings-section">
        <h3>{t('members.referenceIncome')}</h3>
        <div className="settings-list">
          {members.map((member) => (
            <Field key={member.id} label={t('ui.incomeFor', { name: member.name })} name={member.id} errors={errorsOf('incomes')}>
              <input
                name={member.id}
                inputMode="decimal"
                value={incomeDraft(member)}
                onChange={(event) => setDrafts({ ...drafts, [member.id]: event.target.value })}
                disabled={!member.active}
              />
            </Field>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="primary" onClick={() => void saveIncomes()}>{t('ui.saveIncomes')}</button>
          {feedback('incomes')}
        </div>
      </section>

      {active.map((member) => (
        <section className="panel settings-section" key={member.id}>
          <h3>{t('ui.colorFor', { name: member.name })}</h3>
          <div className="swatches" role="group" aria-label={t('ui.colorFor', { name: member.name })}>
            {MEMBER_COLORS.map((color) => {
              const owner = colorOwner.get(color);
              const disabled = owner !== undefined && owner.id !== member.id;
              const name = t(`colors.${color}`);
              const label = disabled ? t('ui.colorUsedBy', { color: name, name: owner.name }) : name;
              return (
                <button
                  key={color}
                  type="button"
                  className="swatch"
                  data-color={color}
                  aria-label={label}
                  aria-pressed={member.color === color}
                  title={label}
                  disabled={disabled}
                  onClick={() => void run(`color-${member.id}`, t('ui.colorSaved'), () => services.members.setColor({ id: member.id, color }))}
                >
                  <span aria-hidden="true" />
                  {name}
                </button>
              );
            })}
          </div>
          {feedback(`color-${member.id}`)}
        </section>
      ))}

      <section className="panel settings-section">
        <h3>{t('members.householdRule')}</h3>
        <Field label={t('members.householdRule')} name="splitRule" errors={{}}>
          <select
            value={settings.splitRule}
            onChange={(event) => {
              const splitRule = event.target.value;
              void run('rule', t('ui.splitRuleSaved'), () => services.plan.setSplitRule({ splitRule }));
            }}
          >
            <option value="EQUAL_KEEP">{t('members.equalKeep')}</option>
            <option value="PROPORTIONAL">{t('members.proportional')}</option>
          </select>
        </Field>
        <p className="muted small">{settings.splitRule === 'EQUAL_KEEP' ? t('ui.equalKeepDescription') : t('ui.proportionalDescription')}</p>
        {feedback('rule')}
      </section>

      <section className="panel settings-section">
        <h3>{t('ui.storageTitle')}</h3>
        <p className="muted">{t('ui.storageDescription')}</p>
      </section>

      <CategoriesView />
    </div>
  );
}
