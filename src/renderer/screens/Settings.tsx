import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, type Locale } from '@shared/constants';
import type { AppSettings, Profile } from '@shared/types';
import { changeLocale } from '../i18n';
import { FreeProxyPanel } from '../panels/FreeProxyPanel';
import { PaidProxyPanel } from '../panels/PaidProxyPanel';
import { SupportPanel } from '../panels/SupportPanel';
import { SelfCheckPanel } from '../panels/SelfCheckPanel';
import { ProfileManagerPanel } from '../panels/ProfileManagerPanel';
import { GeoIpPanel } from '../panels/GeoIpPanel';

type TabId = 'profiles' | 'selfCheck' | 'freeProxy' | 'paidProxy' | 'geoip' | 'support' | 'language';

const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English', uk: 'Українська', de: 'Deutsch', es: 'Español', fr: 'Français',
};

export function Settings({
  settings, profiles, onClose, onSettings, onProfilesChange,
}: {
  settings: AppSettings;
  profiles: Profile[];
  onClose: () => void;
  onSettings: (s: AppSettings) => void;
  onProfilesChange: (profiles: Profile[]) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>('profiles');

  // Фрейми лежать над оболонкою по z — без цього модальне вікно
  // виявилося б під ними і виглядало б як «кнопка нічого не робить».
  useEffect(() => {
    void window.multiframe.invoke('workspace:setFramesVisible', { visible: false });
    return () => {
      void window.multiframe.invoke('workspace:setFramesVisible', { visible: true });
    };
  }, []);

  const tabs: { id: TabId; visible: boolean }[] = [
    { id: 'profiles', visible: true },
    { id: 'selfCheck', visible: true },
    { id: 'freeProxy', visible: settings.showFreeProxyTab },
    { id: 'paidProxy', visible: settings.showPaidProxyTab },
    { id: 'geoip', visible: true }, // Ф-4.6 / Ф-10.21
    { id: 'support', visible: settings.showSupportTab }, // Ф-13.17
    { id: 'language', visible: true },
  ];

  /** Ф-8.3 — перемикання без перезапуску і без перезавантаження фреймів. */
  const pickLocale = async (locale: Locale): Promise<void> => {
    await changeLocale(locale);
    const next = await window.multiframe.invoke('app:setSettings', { locale });
    onSettings(next);
  };

  /** Ф-9.6 — лише data-theme оболонки; не впливає на жоден профіль. */
  const pickTheme = async (theme: AppSettings['theme']): Promise<void> => {
    const next = await window.multiframe.invoke('app:setSettings', { theme });
    onSettings(next);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,27,51,.82)', display: 'grid',
      placeItems: 'center', zIndex: 100 }}>
      <div style={{ width: 'min(900px, 92vw)', height: 'min(640px, 88vh)', display: 'flex',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>

        <nav style={{ width: 210, background: 'var(--surface)', padding: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{t('settings.title')}</div>
          {tabs.filter((x) => x.visible).map(({ id }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4,
                fontSize: 12, padding: '8px 10px',
                background: tab === id ? 'var(--primary)' : 'transparent' }}
            >
              {t(`settings.tab.${id}`)}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: 20, overflow: 'auto' }}>
          {tab === 'profiles' && <ProfileManagerPanel profiles={profiles} onProfilesChange={onProfilesChange} />}
          {tab === 'selfCheck' && <SelfCheckPanel profiles={profiles} />}
          {tab === 'freeProxy' && <FreeProxyPanel />}
          {tab === 'paidProxy' && <PaidProxyPanel />}
          {tab === 'geoip' && <GeoIpPanel />}
          {tab === 'support' && <SupportPanel />}
          {tab === 'language' && (
            <div style={{ maxWidth: 420 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>{t('settings.language')}</h3>
              {/* Ф-8.6 — ключове застереження: мова UI не впливає на мову профілів */}
              <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                {t('settings.languageHint')}
              </p>
              <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                {SUPPORTED_LOCALES.map((locale) => (
                  <button
                    key={locale}
                    onClick={() => void pickLocale(locale)}
                    style={{ textAlign: 'left', fontSize: 12, padding: '8px 12px',
                      background: settings.locale === locale ? 'var(--primary)' : 'var(--surface)' }}
                  >
                    {LOCALE_NAMES[locale]}
                  </button>
                ))}
              </div>

              <h3 style={{ fontSize: 14, marginTop: 24 }}>{t('settings.theme')}</h3>
              <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                {(['dark', 'light'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => void pickTheme(theme)}
                    style={{ textAlign: 'left', fontSize: 12, padding: '8px 12px',
                      background: settings.theme === theme ? 'var(--primary)' : 'var(--surface)' }}
                  >
                    {t(`settings.theme.${theme}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>

        <button onClick={onClose} title={t('settings.close')}
          style={{ position: 'absolute', top: 'calc(50% - min(320px, 44vh) + 10px)',
            right: 'calc(50% - min(450px, 46vw) + 10px)', background: 'transparent',
            border: '1px solid var(--border)', padding: '4px 10px', fontSize: 13 }}>
          ✕
        </button>
      </div>
    </div>
  );
}
