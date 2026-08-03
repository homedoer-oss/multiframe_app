import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProxyProvider } from '@shared/constants';

/**
 * Ф-11.1–11.6 — вкладка «Платні проксі».
 * Ф-11.3 — партнерський характер посилань маркується явно, звичайним текстом.
 * Ф-11.6 — перехід ЛИШЕ в системний браузер: відкриття у фреймі забруднило б
 *          сховище профілю трекінговими cookies і витратило б трафік проксі.
 */
export function PaidProxyPanel(): JSX.Element {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<readonly ProxyProvider[]>([]);

  useEffect(() => {
    void window.multiframe.invoke('proxy:providers', undefined).then(setProviders);
  }, []);

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
        padding: 10, fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
        {t('paid.notice')}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {providers.map((p) => (
          <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{p.name}</strong>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                  {p.types.map((type) => t(`quality.subnet.${type === 'isp' ? 'unknown' : type}`)).join(' · ')}
                  {' — '}
                  {t(`paid.billing.${p.billing}`)}
                </div>
                {/* Ф-11.5 — узгоджено з вагами движка оцінки (Ф-10.17) */}
                {p.datacenterWarning && (
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                    {t('paid.datacenterWarning')}
                  </div>
                )}
              </div>
              <button
                onClick={() => void window.multiframe.invoke('shell:openExternal', { url: p.affiliateUrl })}
                style={{ whiteSpace: 'nowrap', fontSize: 12, padding: '6px 12px' }}
              >
                {t('paid.open')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
