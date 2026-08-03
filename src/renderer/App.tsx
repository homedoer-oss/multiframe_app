import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings, Profile } from '@shared/types';
import { Launcher } from './screens/Launcher';
import { Workspace } from './screens/Workspace';
import { Settings } from './screens/Settings';

export function App({ initialSettings }: { initialSettings: AppSettings }): JSX.Element {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(initialSettings);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Ф-7.1 — Ctrl+, («відкриття налаштувань профілю»); гаряча клавіша
  // працює навіть якщо фокус усередині сторінки якогось фрейму.
  useEffect(() => window.multiframe.on('hotkey:openSettings', () => setSettingsOpen(true)), []);

  // Ф-9.6 — тема інтерфейсу застосунку. Не плутати з мовою профілю (Ф-8.6):
  // це виключно data-theme на <html> оболонки, жодного стосунку до
  // navigator.language чи інших параметрів, які бачить сайт у фреймі.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  if (!profiles) return <Launcher onLaunched={setProfiles} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Ф-1.9 / §5.9 — WebContentsView лежать НАД оболонкою за z-порядком.
          Раніше кнопка Settings мала position:fixed поверх усієї сітки
          (height:100vh, без відступів) — щойно в правій нижній комірці
          відкривалась вкладка, її реальний WebContentsView фізично
          накривав кнопку (вона й досі була в DOM, просто під видимим
          вмістом). Сітка тепер займає лише flex:1 над цим смужком —
          measureRect() комірок (АРХ-7) ніколи не заходить у зарезервовану
          зону, тож main ніколи не позиціонує сюди жоден фрейм. */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Workspace profiles={profiles} settings={settings} />
      </div>

      <div data-testid="shell-footer" style={{
        flexShrink: 0, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 8, padding: '0 10px', background: 'var(--surface)', borderTop: '1px solid var(--border)',
      }}>
        <button onClick={() => setSettingsOpen(true)} title={t('settings.open')}
          style={{ padding: '4px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}>
          {t('settings.open')}
        </button>
      </div>

      {settingsOpen && (
        <Settings
          settings={settings}
          profiles={profiles}
          onSettings={setSettings}
          onProfilesChange={setProfiles}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
