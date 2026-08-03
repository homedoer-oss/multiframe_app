import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Status = { hasLicenseKey: boolean; hasDatabases: boolean; lastUpdated: string | null };

/**
 * Ф-4.6 / Ф-10.21 — локальна база MaxMind GeoLite2 (рішення користувача,
 * не зовнішній сервіс). Ключ вводить сам користувач і зберігає у власному
 * обліковому записі MaxMind — застосунок нічого не завантажує без нього
 * і не постачає базу в дистрибутиві (умови ліцензії цього не дозволяють).
 */
export function GeoIpPanel(): JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status | null>(null);
  const [licenseKey, setLicenseKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const refresh = (): void => {
    void window.multiframe.invoke('geoip:getStatus', undefined).then(setStatus);
  };

  useEffect(refresh, []);

  const saveKey = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const result = await window.multiframe.invoke('geoip:setLicenseKey', { licenseKey });
      if (!result.ok) {
        setError(t('geoip.saveError'));
        return;
      }
      setLicenseKeyInput('');
      setSavedNotice(true);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const download = async (): Promise<void> => {
    setDownloading(true);
    setError(null);
    try {
      const result = await window.multiframe.invoke('geoip:downloadDatabases', undefined);
      if (!result.ok) {
        setError(result.error ?? t('geoip.downloadError'));
        return;
      }
      refresh();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h3 style={{ marginTop: 0, fontSize: 14 }}>{t('geoip.title')}</h3>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>{t('geoip.notice')}</p>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
        padding: 12, marginTop: 12, fontSize: 12 }}>
        <div>
          {t('geoip.status.licenseKey')}:{' '}
          <strong>{status?.hasLicenseKey ? t('geoip.status.set') : t('geoip.status.notSet')}</strong>
        </div>
        <div style={{ marginTop: 4 }}>
          {t('geoip.status.databases')}:{' '}
          <strong>{status?.hasDatabases ? t('geoip.status.present') : t('geoip.status.absent')}</strong>
        </div>
        {status?.lastUpdated && (
          <div style={{ marginTop: 4, color: 'var(--text-dim)' }}>
            {t('geoip.status.lastUpdated')}: {new Date(status.lastUpdated).toLocaleString()}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>{t('geoip.licenseKeyLabel')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={licenseKey}
            onChange={(e) => setLicenseKeyInput(e.target.value)}
            placeholder={t('geoip.licenseKeyPlaceholder')}
            style={{ flex: 1, fontSize: 12, padding: '8px 10px' }}
          />
          <button onClick={() => void saveKey()} disabled={saving || !licenseKey.trim()} style={{ fontSize: 12, padding: '8px 14px' }}>
            {t('geoip.save')}
          </button>
        </div>
        {savedNotice && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 6 }}>{t('geoip.saved')}</div>}
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={() => void download()} disabled={downloading || !status?.hasLicenseKey} style={{ fontSize: 12, padding: '8px 14px' }}>
          {downloading ? t('geoip.downloading') : t('geoip.download')}
        </button>
        {error && <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}
