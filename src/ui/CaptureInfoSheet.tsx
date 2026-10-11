import { useId } from 'react';
import { esESGrammar } from '../agent/grammar/es-ES.ts';
import { useSheet } from './common.tsx';
import { t } from './i18n/index.ts';

/** A modal sheet listing the phrases the fixed-grammar capture bar accepts. Keep it in step with `agent/parser.ts`. */
export function CaptureInfoSheet({ onClose }: { onClose: () => void }) {
  const sheet = useSheet(onClose);
  const titleId = useId();

  return (
    <dialog {...sheet.dialogProps} className="sheet" aria-labelledby={titleId}>
      <div className="sheet__grabber" {...sheet.grabberProps} />
      <div className="form">
        <h3 id={titleId}>{t('assistant.infoTitle')}</h3>
        <p>{t('assistant.infoExpense', { command: esESGrammar.expense })}</p>
        <ul className="calculation-list">
          <li><code>{t('assistant.infoExampleExpense1')}</code></li>
          <li><code>{t('assistant.infoExampleExpense2')}</code></li>
        </ul>
        <p>{t('assistant.infoIncome', { command: esESGrammar.income })}</p>
        <ul className="calculation-list">
          <li><code>{t('assistant.infoExampleIncome')}</code></li>
        </ul>
        <p>{t('assistant.infoDefaults')}</p>
        <div className="actions">
          <button type="button" autoFocus onClick={() => sheet.close()}>{t('assistant.infoClose')}</button>
        </div>
      </div>
    </dialog>
  );
}
