import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DiscoveryProgress, DiscoveryResult } from '@shared/ipc';
import { QualityCard } from '../components/QualityCard';

/**
 * Ф-10.1–10.14 — вкладка «Безкоштовні проксі».
 * Ф-10.4 — одноразове пояснення ризиків подається звичайним текстом
 *          інтерфейсу, а не приміткою дрібним шрифтом.
 */
export function FreeProxyPanel(): JSX.Element {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const [results, setResults] = useState<DiscoveryResult[]>([]);

  useEffect(() => {
    const offProgress = window.multiframe.on('proxy:discoveryProgress', (p) => {
      setProgress(p);
      if (p.done >= p.total) setRunning(false);
    });
    const offResult = window.multiframe.on('proxy:discoveryResult', (r) => {
      // Ф-10.12 — прозорі не потрапляють до списку в жодному вигляді.
      if (r.rejected === 'transparent' || !r.quality) return;
      setResults((prev) => [...prev, r].sort((a, b) => (b.quality?.score ?? 0) - (a.quality?.score ?? 0)));
    });
    return () => { offProgress(); offResult(); };
  }, []);

  if (!acknowledged) {
    return (
      <div style={{ maxWidth: 620 }}>
        <h3 style={{ color: 'var(--warning)', marginTop: 0 }}>{t('free.riskTitle')}</h3>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>{t('free.riskBody')}</p>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)' }}>{t('free.riskScope')}</p>
        <button onClick={() => setAcknowledged(true)}>{t('free.acknowledge')}</button>
      </div>
    );
  }

  const start = async (): Promise<void> => {
    setResults([]); setProgress(null); setRunning(true);
    const total = await window.multiframe.invoke('proxy:discoverStart', { text, mode: 'https' });
    if (total === 0) setRunning(false);
  };

  return (
    <div style={{ maxWidth: 620 }}>
      {/* Ф-10.9 — прямо кажемо, що трафік іде з реальної адреси користувача */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--warning)', borderRadius: 6,
        padding: 10, fontSize: 12, color: 'var(--warning)', marginBottom: 12 }}>
        {t('free.directNotice')}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('free.noSources')}</p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('free.import')}
        spellCheck={false}
        style={{ width: '100%', height: 110, background: 'var(--bg)', color: 'var(--text)',
          border: '1px solid var(--border)', borderRadius: 6, padding: 8, font: 'inherit', fontSize: 12 }}
      />

      <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
        <button onClick={() => void start()} disabled={running || !text.trim()}>{t('free.start')}</button>
        <button
          onClick={() => { void window.multiframe.invoke('proxy:discoverStop', undefined); setRunning(false); }}
          disabled={!running}
          style={{ background: 'var(--surface)' }}
        >
          {t('free.stop')}
        </button>
      </div>

      {progress && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
          {t('free.progress', {
            done: progress.done, total: progress.total,
            accepted: progress.accepted, rejected: progress.rejectedTransparent,
          })}
        </div>
      )}
      {progress && progress.rejectedTransparent > 0 && (
        <div style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 10 }}>
          {t('free.rejectedTransparent')}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {results.map((r) => r.quality && <QualityCard key={`${r.host}:${r.port}`} quality={r.quality} />)}
      </div>
    </div>
  );
}
