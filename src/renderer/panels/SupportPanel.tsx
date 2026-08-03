import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DonationAddress } from '@shared/constants';

interface Wallets {
  project: readonly DonationAddress[];
  ukraine: readonly DonationAddress[];
  ukraineEnabled: boolean;
  reportUrl: string;
}

/**
 * Ф-13.1–13.18 — вікно підтримки.
 *
 * Ф-13.7  — адреси приходять з коду через IPC, ніколи з мережі.
 * Ф-13.8  — відкриття вкладки не породжує жодного мережевого запиту.
 * Ф-13.9  — адреса показується ПОВНІСТЮ: скорочений вигляд приховує підміну
 *           адресою зі збіжними початком і кінцем.
 * Ф-13.13 — мережа вказана помітно поруч з адресою: надсилання токена
 *           в неправильну мережу — найчастіша причина втрати коштів.
 */
export function SupportPanel(): JSX.Element {
  const { t } = useTranslation();
  const [wallets, setWallets] = useState<Wallets | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void window.multiframe.invoke('support:wallets', undefined).then(setWallets);
  }, []);

  if (!wallets) return <div />;

  const copy = (address: string): void => {
    void navigator.clipboard.writeText(address);
    setCopied(address);
    window.setTimeout(() => setCopied(null), 6000);
  };

  const list = (items: readonly DonationAddress[]): JSX.Element => (
    <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
      {items.map((w) => (
        <div key={w.network} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            {/* Ф-13.13 — мережа помітно, не дрібним шрифтом */}
            <strong style={{ fontSize: 12, color: 'var(--accent)' }}>{w.network}</strong>
            <button onClick={() => copy(w.address)} style={{ fontSize: 11, padding: '3px 10px' }}>
              {t('support.copy')}
            </button>
          </div>
          {/* Ф-13.9 — повна адреса, без скорочення середини */}
          <code style={{ fontSize: 11, wordBreak: 'break-all', color: 'var(--text)', userSelect: 'text' }}>
            {w.address}
          </code>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: 620 }}>
      {/* Ф-13.12 — застереження про підміну адрес у буфері обміну */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--warning)', borderRadius: 6,
        padding: 10, fontSize: 12, color: 'var(--warning)', marginBottom: 16 }}>
        {t('support.verifyWarning')}
      </div>

      <h3 style={{ marginTop: 0, fontSize: 14 }}>{t('support.project')}</h3>
      {list(wallets.project)}

      {/* Ф-13.2 — розділи розділені так, щоб переплутати призначення було неможливо */}
      <h3 style={{ marginTop: 24, fontSize: 14, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        {t('support.ukraine')}
      </h3>
      {/* Ф-13.4 — явне застереження про волонтерський характер збору */}
      <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>{t('support.ukraineUnit')}</p>

      {/* Ф-13.5 — посилання на публічний звіт обов'язкове */}
      <button
        onClick={() => void window.multiframe.invoke('shell:openExternal', { url: wallets.reportUrl })}
        style={{ fontSize: 12, padding: '6px 12px', marginBottom: 12, background: 'var(--surface)' }}
      >
        {t('support.report')} ↗
      </button>

      {wallets.ukraineEnabled ? (
        list(wallets.ukraine)
      ) : (
        // Ф-13.22.2 — до наповнення сторінки звіту розділ не публікується
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          {t('support.disabledNotice')}
        </div>
      )}

      {copied && (
        <div style={{ position: 'sticky', bottom: 0, marginTop: 12, padding: 10,
          background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 6,
          fontSize: 12, color: 'var(--accent)' }}>
          {t('support.copied')}
        </div>
      )}
    </div>
  );
}
