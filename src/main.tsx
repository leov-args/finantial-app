import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp } from './app/container.ts';
import { requestPersistentStorage } from './storage/persistence.ts';
import { AppShell } from './ui/AppShell.tsx';
import { ServicesProvider } from './ui/services-context.tsx';
import './ui/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root not found');

const app = createApp();
const persistence = await requestPersistentStorage();

createRoot(rootElement).render(
  <StrictMode>
    <ServicesProvider services={app.services}>
      <AppShell persistence={persistence} />
    </ServicesProvider>
  </StrictMode>,
);
