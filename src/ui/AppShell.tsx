import { useCallback, useState, useSyncExternalStore } from 'react';
import { addMonths, toLocalIsoDate, yearMonthOf } from '../domain/shared/dates.ts';
import type { PersistenceStatus } from '../storage/persistence.ts';
import { monthLabel, useData } from './common.tsx';
import { SettingsView } from './SettingsView.tsx';
import { FamilyView } from './FamilyView.tsx';
import { PersonalView } from './PersonalView.tsx';
import { CaptureBar } from './CaptureBar.tsx';
import { Icon } from './icons.tsx';
import { Onboarding, useSetupStep } from './Onboarding.tsx';
import { useServices } from './services-context.tsx';
import { t, type MessageKey } from './i18n/index.ts';

const ROUTES = {
  personal: 'app.personal',
  familiar: 'app.familiar',
  ajustes: 'app.settings',
} as const satisfies Record<string, MessageKey>;
type Route = keyof typeof ROUTES;

const PERSISTENCE_LABEL: Record<PersistenceStatus, () => string> = {
  persisted: () => t('ui.persistenceGranted'),
  'best-effort': () => t('ui.persistenceBestEffort'),
  unsupported: () => t('ui.persistenceUnsupported'),
};

// The URL hash is the router (#/familiar): survives reloads, no dependency.
const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const currentRoute = (): Route => {
  const route = window.location.hash.replace(/^#\/?/, '');
  if (Object.hasOwn(ROUTES, route)) return route as Route;
  return 'personal';
};

export function AppShell({ persistence }: { persistence: PersistenceStatus }) {
  const { clock, members } = useServices();
  const route = useSyncExternalStore(subscribe, currentRoute);
  const thisMonth = yearMonthOf(toLocalIsoDate(clock.now()));
  const [month, setMonth] = useState(thisMonth);
  const monthly = route === 'personal';

  const loadMembers = useCallback(() => members.list(), [members]);
  const household = useData(loadMembers);
  const [savedSetupStep, setSetupStep] = useSetupStep();
  // X6: an empty database (no members at all) starts the setup; once started it lasts until «Ver aportes».
  const setupStep = household.data === undefined ? null : (savedSetupStep ?? (household.data.length === 0 ? 1 : null));
  const onboarding = setupStep !== null;

  return (
    <div className={`shell${onboarding ? ' shell--onboarding' : ''}`}>
      <header className="shell__header">
        <h1>{t('app.title')}</h1>
        {!onboarding && (
          <>
            <nav className="primary-nav" aria-label={t('ui.sections')}>
              {Object.entries(ROUTES).map(([id, key]) => (
                <a key={id} href={`#/${id}`} aria-current={route === id ? 'page' : undefined}>
                  <Icon name={id as Route} />
                  <span>{t(key)}</span>
                </a>
              ))}
            </nav>
            <CaptureBar />
          </>
        )}
      </header>

      {!onboarding && monthly && (
          <div className="month" role="group" aria-label={t('ui.month')}>
          <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('ui.previousMonth')}>
            <Icon name="back" />
          </button>
          <h2 aria-live="polite">{monthLabel(month)}</h2>
          <button type="button" onClick={() => setMonth(addMonths(month, 1))} aria-label={t('ui.nextMonth')}>
            <Icon name="forward" />
          </button>
          {month !== thisMonth && (
            <button type="button" onClick={() => setMonth(thisMonth)}>
              {t('ui.today')}
            </button>
          )}
        </div>
      )}

      <main className="shell__main">
        {household.data === undefined && household.error === undefined ? (
          // Until we know whether the household is empty, no view: it would flash before the setup.
          <p className="muted" role="status">{t('ui.loading')}</p>
        ) : onboarding ? (
          <Onboarding step={setupStep} onStep={setSetupStep} />
        ) : (
          <>
            {route === 'personal' && <PersonalView month={month} />}
            {route === 'familiar' && <FamilyView />}
            {route === 'ajustes' && <SettingsView />}
          </>
        )}
      </main>

      <footer className="shell__footer muted small">
        <p>
          {t('ui.dataNotice')}
        </p>
        <p>{PERSISTENCE_LABEL[persistence]()}</p>
      </footer>
    </div>
  );
}
