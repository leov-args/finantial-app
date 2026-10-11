import { useRef, useState } from 'react';
import type { Member } from '../domain/member/member.ts';
import type { MemberId } from '../domain/shared/ids.ts';
import type { HouseholdArchiveReadResult } from '../application/ports/household-archive.ts';
import { MAX_HOUSEHOLD_FILE_BYTES } from '../application/ports/household-archive.ts';
import { useMe } from './common.tsx';
import { FORM, toErrors } from './errors.ts';
import { t } from './i18n/index.ts';
import { useServices } from './services-context.tsx';
import { HouseholdPreview } from './HouseholdPreview.tsx';

export function JoinHousehold({ onBack, onStep, onJoined }: {
  readonly onBack: () => void;
  readonly onStep: (step: number | null) => void;
  readonly onJoined: () => void;
}) {
  const services = useServices();
  const [archive, setArchive] = useState<HouseholdArchiveReadResult | null>(null);
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [phase, setPhase] = useState<'file' | 'who'>('file');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [, setMe] = useMe(activeMembers);
  const latestPick = useRef(0);

  async function readFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Cleared so choosing the same file again (e.g. after Cancel) still fires onChange.
    input.value = '';
    const pick = ++latestPick.current;
    setArchive(null);
    setErrors({});
    if (!file) return;
    if (file.size > MAX_HOUSEHOLD_FILE_BYTES) {
      setErrors({ [FORM]: t('errors.householdInvalidFile') });
      return;
    }
    try {
      const text = await file.text();
      if (pick !== latestPick.current) return;
      setArchive(services.household.preview(text));
    } catch (error) {
      if (pick === latestPick.current) setErrors(toErrors(error));
    }
  }

  async function confirm() {
    if (!archive) return;
    setBusy(true);
    setErrors({});
    try {
      await services.household.join(archive.parsed);
      const active = await services.members.listActive();
      setActiveMembers(active);
      setMe(null);
      onStep(null);
      if (active.length <= 1) {
        const onlyMember = active[0];
        if (onlyMember) setMe(onlyMember.id);
        onJoined();
      } else {
        setPhase('who');
      }
    } catch (error) {
      setErrors(toErrors(error));
    } finally {
      setBusy(false);
    }
  }

  function choose(id: MemberId) {
    setMe(id);
    onJoined();
  }

  if (phase === 'who') {
    return (
      <section className="join-household" aria-labelledby="join-household-who">
        <h3 id="join-household-who">{t('members.whoAmI')}</h3>
        <div className="join-household__members">
          {activeMembers.map((member) => (
            <button key={member.id} type="button" onClick={() => choose(member.id)}>
              {member.name}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="join-household" aria-labelledby="join-household-title">
      <h3 id="join-household-title">{t('onboarding.joinHousehold')}</h3>
      <label className="field">
        <span className="field__label">{t('onboarding.chooseHouseholdFile')}</span>
        <input type="file" accept=".json"
          onChange={(event) => void readFile(event.currentTarget)} />
      </label>
      {errors[FORM] && <p className="error" role="alert">{errors[FORM]}</p>}
      {archive && (
        <HouseholdPreview archive={archive}>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void confirm()} disabled={busy}>
              {t('onboarding.householdConfirm')}
            </button>
            <button type="button" onClick={() => { setArchive(null); setErrors({}); }} disabled={busy}>
              {t('common.cancel')}
            </button>
          </div>
        </HouseholdPreview>
      )}
      <button type="button" onClick={onBack} disabled={busy}>{t('onboarding.back')}</button>
    </section>
  );
}
