import { useRef, useState } from 'react';
import type { HouseholdArchiveReadResult } from '../application/ports/household-archive.ts';
import { MAX_HOUSEHOLD_FILE_BYTES } from '../application/ports/household-archive.ts';
import { FORM, toErrors } from './errors.ts';
import { t } from './i18n/index.ts';
import { useServices } from './services-context.tsx';
import { HouseholdPreview } from './HouseholdPreview.tsx';

export function BackupSection({ onRestored }: { readonly onRestored: () => Promise<void> }) {
  const services = useServices();
  const [archive, setArchive] = useState<HouseholdArchiveReadResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const latestPick = useRef(0);

  async function readFile(input: HTMLInputElement) {
    const file = input.files?.[0];
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

  async function restore() {
    if (!archive || busy) return;
    setBusy(true);
    setErrors({});
    try {
      await services.household.restore(archive.parsed);
      setArchive(null);
      await onRestored();
    } catch (error) {
      setErrors(toErrors(error));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setArchive(null);
    setErrors({});
  }

  return (
    <section className="panel settings-section backup-section" aria-labelledby="backup-title">
      <h3 id="backup-title">{t('ui.backupTitle')}</h3>
      <p className="muted">{t('ui.backupDescription')}</p>
      <label className="field">
        <span className="field__label">{t('ui.backupChooseFile')}</span>
        <input type="file" accept=".json" disabled={busy} onChange={(event) => void readFile(event.currentTarget)} />
      </label>
      {errors[FORM] && <p className="error" role="alert">{errors[FORM]}</p>}
      {archive && (
        <HouseholdPreview archive={archive}>
          <p className="backup-section__warning"><strong>{t('ui.backupReplaceWarning')}</strong></p>
          <p className="muted small">{t('ui.backupSendFirst')}</p>
          <p className="muted small">{t('ui.backupMergeHint')}</p>
          <div className="actions">
            <button type="button" onClick={cancel} disabled={busy}>{t('common.cancel')}</button>
            <button type="button" className="danger" onClick={() => void restore()} disabled={busy}>
              {t('ui.backupReplaceAction')}
            </button>
          </div>
        </HouseholdPreview>
      )}
    </section>
  );
}
