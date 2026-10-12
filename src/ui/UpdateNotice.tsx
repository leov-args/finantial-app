import { applyUpdate } from '../pwa/registration.ts';
import { t } from './i18n/index.ts';

export function UpdateNotice({ waiting }: { waiting: boolean }) {
  return (
    <div role="status" className="update-notice" aria-hidden={!waiting}>
      {waiting && (
        <>
          <span>{t('pwa.updateAvailable')}</span>
          <button type="button" onClick={applyUpdate}>
            {t('pwa.update')}
          </button>
        </>
      )}
    </div>
  );
}
