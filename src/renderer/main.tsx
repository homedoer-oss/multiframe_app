import React from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n } from './i18n';
import { App } from './App';
import './theme.css';

async function bootstrap(): Promise<void> {
  const settings = await window.multiframe.invoke('app:getSettings', undefined);
  await initI18n(settings.locale);

  const container = document.getElementById('root');
  if (!container) throw new Error('#root не знайдено');
  createRoot(container).render(
    <React.StrictMode>
      <App initialSettings={settings} />
    </React.StrictMode>,
  );
}

void bootstrap();
