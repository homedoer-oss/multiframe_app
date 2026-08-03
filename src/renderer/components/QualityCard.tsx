import { useTranslation } from 'react-i18next';
import type { ProxyQuality } from '@shared/types';

/** Ф-10.16 — картка показує повний набір показників, а не лише країну. */
export function QualityCard({ quality }: { quality: ProxyQuality }): JSX.Element {
  const { t } = useTranslation();
  const ageMin = (Date.now() - Date.parse(quality.checkedAt)) / 60_000;
  const stale = ageMin > 60; // Ф-10.18

  const row = (label: string, value: string, tone?: string): JSX.Element => (
    <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
      <span style={{ color: 'var(--text-dim)', minWidth: 110 }}>{label}</span>
      <span style={{ color: tone ?? 'var(--text)' }}>{value}</span>
    </div>
  );

  const scoreTone =
    quality.score >= 70 ? 'var(--success)' : quality.score >= 45 ? 'var(--warning)' : 'var(--error)';

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong style={{ fontSize: 12 }}>{quality.exitIp}</strong>
        <strong style={{ color: scoreTone, fontSize: 12 }}>
          {t('quality.score')}: {quality.score}
        </strong>
      </div>

      {row(t('quality.subnet'), t(`quality.subnet.${quality.subnet}`),
        quality.subnet === 'datacenter' ? 'var(--warning)' : undefined)}
      {row(t('quality.anonymity'), t(`quality.anonymity.${quality.anonymity}`))}
      {row(t('quality.latency'), quality.latencyMs === null ? '—' : `${quality.latencyMs} ms`)}
      {quality.asn && row('ASN', `${quality.asn}${quality.operator ? ` · ${quality.operator}` : ''}`)}
      {row(t('quality.blacklists'),
        quality.blacklists.length ? quality.blacklists.join(', ') : '—',
        quality.blacklists.length ? 'var(--error)' : undefined)}

      {/* Ф-10.18 — час перевірки видно завжди й помітно */}
      {row(t('quality.checkedAt'), new Date(quality.checkedAt).toLocaleTimeString(),
        stale ? 'var(--warning)' : undefined)}
      {stale && (
        <div style={{ color: 'var(--warning)', fontSize: 10, marginTop: 4 }}>{t('quality.staleWarning')}</div>
      )}
    </div>
  );
}
