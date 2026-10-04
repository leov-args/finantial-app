import { createContext, use, type ReactNode } from 'react';
import type { AppServices } from '../app/container.ts';

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <ServicesContext value={services}>{children}</ServicesContext>;
}

/** Application services for components. Components never import Dexie or repositories. */
export function useServices(): AppServices {
  const services = use(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>.');
  return services;
}
