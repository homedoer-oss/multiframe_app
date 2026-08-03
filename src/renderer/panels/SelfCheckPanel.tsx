import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CheckResult, SelfCheckReport } from '@shared/ipc';
import type { Profile } from '@shared/types';

/**
 * Ф-4.9 — самоперевірка профілю.
 * RECOMMENDATIONS §4 — показуємо НЕВІДПОВІДНОСТІ, а не «бал анонімності».
 */
const TONE: Record<CheckResult['status'], string> = {
  ok: 'var(--success)',
  warn: 'var(--warning)',
  fail: 'var(--error)',
};

export function SelfCheckPanel({ profiles }: { profiles: Profile[] }): JSX.Element {
  const { t } = useTranslation();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');
  const [report, setReport] = useState<SelfCheckReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    setBusy(true); setError(null);
    try {
      setReport(await window.multiframe.invoke('identity:selfCheck', { profileId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 660 }}>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, marginTop: 0 }}>
        {t('selfcheck.intent')}
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '6px 8px', font: 'inherit', fontSize: 12 }}
        >
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => void run()} disabled={busy || !profileId} style={{ fontSize: 12 }}>
          {t('selfcheck.run')}
        </button>
        {report && (
          <button
            onClick={() => void navigator.clipboard.writeText(JSON.stringify(report, null, 2))}
            style={{ fontSize: 12, background: 'var(--surface)' }}
          >
            {t('selfcheck.export')}
          </button>
        )}
      </div>

      {error && <div style={{ color: 'var(--error)', fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {report && (
        <>
          <div style={{ fontSize: 12, marginBottom: 10,
            color: report.failed > 0 ? 'var(--error)' : report.warned > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {t('selfcheck.summary', { failed: report.failed, warned: report.warned, total: report.checks.length })}
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            {report.checks.map((c) => (
              <div key={c.id} style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${TONE[c.status]}`,
                borderRadius: 4, padding: '6px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  {/* Ідентифікатор технічний і не локалізується — як коди журналу (Ф-8.20) */}
                  <code style={{ fontSize: 11 }}>{c.id}</code>
                  <span style={{ fontSize: 10, color: TONE[c.status] }}>{t(`selfcheck.status.${c.status}`)}</span>
                </div>
                {c.status !== 'ok' && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, wordBreak: 'break-all' }}>
                    {c.expected !== undefined && <>{t('selfcheck.expected')}: {c.expected} · </>}
                    {t('selfcheck.actual')}: {c.actual}
                  </div>
                )}
                {c.note && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, fontStyle: 'italic' }}>{c.note}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
