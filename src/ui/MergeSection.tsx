import { useRef, useState } from 'react';
import type { HouseholdArchiveReadResult, HouseholdMergeSummary } from '../application/ports/household-archive.ts';
import { MAX_HOUSEHOLD_FILE_BYTES } from '../application/ports/household-archive.ts';
import { FORM, toErrors } from './errors.ts';
import { t } from './i18n/index.ts';
import { useServices } from './services-context.tsx';
import { HouseholdPreview } from './HouseholdPreview.tsx';

interface MergePreview {
  readonly archive: HouseholdArchiveReadResult;
  readonly summary: HouseholdMergeSummary;
  readonly applied: boolean;
}

export function MergeSection({ onMerged }: { readonly onMerged: () => Promise<void> }) {
  const services = useServices();
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const latestPick = useRef(0);

  async function readFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    const pick = ++latestPick.current;
    setPreview(null);
    setErrors({});
    if (!file) return;
    if (file.size > MAX_HOUSEHOLD_FILE_BYTES) {
      setErrors({ [FORM]: t('errors.householdInvalidFile') });
      return;
    }
    try {
      const text = await file.text();
      if (pick !== latestPick.current) return;
      const archive = services.household.preview(text);
      const summary = await services.household.previewMerge(archive.parsed);
      if (pick === latestPick.current) setPreview({ archive, summary, applied: false });
    } catch (error) {
      if (pick === latestPick.current) setErrors(toErrors(error));
    }
  }

  async function apply() {
    if (!preview || preview.applied || busy) return;
    setBusy(true);
    setErrors({});
    try {
      const summary = await services.household.merge(preview.archive.parsed);
      setPreview({ ...preview, summary, applied: true });
      await onMerged();
    } catch (error) {
      setErrors(toErrors(error));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    latestPick.current += 1;
    setPreview(null);
    setErrors({});
  }

  return (
    <div className="merge-section">
      <h4>{t('ui.mergeTitle')}</h4>
      <p className="muted">{t('ui.mergeDescription')}</p>
      <label className="field">
        <span className="field__label">{t('ui.mergeChooseFile')}</span>
        <input type="file" accept=".json" disabled={busy} onChange={(event) => void readFile(event.currentTarget)} />
      </label>
      {errors[FORM] && <p className="error" role="alert">{errors[FORM]}</p>}
      {preview && (
        <HouseholdPreview archive={preview.archive}>
          <p className="merge-section__summary" aria-live="polite">
            {t('ui.mergeSummary', {
              created: preview.summary.created, updated: preview.summary.updated, deleted: preview.summary.deleted,
            })}
          </p>
          {!preview.summary.hasChanges && !preview.applied && (
            <p className="muted" role="status">{t('ui.mergeNothing')}</p>
          )}
          {preview.applied && <p className="success" role="status">{t('ui.mergeApplied')}</p>}
          {!preview.applied && (
            <>
              <p className="muted small">{t('ui.mergeRestoreHint')}</p>
              <div className="actions">
                <button type="button" onClick={cancel} disabled={busy}>{t('common.cancel')}</button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void apply()}
                  disabled={busy || !preview.summary.hasChanges}
                >
                  {t('ui.mergeApply')}
                </button>
              </div>
            </>
          )}
        </HouseholdPreview>
      )}
    </div>
  );
}
