import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_PROFILES, MIN_PROFILES } from '@shared/constants';
import type { Profile } from '@shared/types';
import { gridShapeFor } from '../lib/grid';
import iconUrl from '../../../assets/multiframe-icon.svg';

/** Ф-1.1, Ф-1.2 — екран старту: кількість профілів і відновлення сесії. */
export function Launcher({ onLaunched }: { onLaunched: (p: Profile[]) => void }): JSX.Element {
  const { t } = useTranslation();
  const [count, setCount] = useState(4);
  const [restore, setRestore] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.multiframe.invoke('app:hasPreviousSession', undefined).then(setHasPrevious);
  }, []);

  const shape = gridShapeFor(count);

  const launch = async (): Promise<void> => {
    setBusy(true);
    try {
      const profiles = await window.multiframe.invoke('workspace:launch', {
        profileCount: count,
        restorePrevious: restore,
      });
      onLaunched(profiles);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'grid', placeItems: 'center', height: '100vh', padding: 24 }}>
      {/* Рішення користувача 2026-08-03 — логотип водяним знаком позаду
          вибору кількості профілів. pointer-events:none і z-index:0
          (theme.css, .launcher-watermark) — суто декоративний, не заважає
          кліку по кнопках над ним. */}
      <div className="launcher-watermark">
        <img src={iconUrl} alt="" />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, width: '100%' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 26 }}>{t('launcher.title')}</h1>
        <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>{t('launcher.subtitle')}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 8, margin: '28px 0 12px' }}>
          {Array.from({ length: MAX_PROFILES - MIN_PROFILES + 1 }, (_, i) => i + MIN_PROFILES).map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              style={{
                padding: '14px 0',
                background: n === count ? 'var(--accent)' : 'var(--surface)',
                border: `1px solid ${n === count ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {n}
            </button>
          ))}
        </div>

        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          {t('launcher.count', { count })} · {t('workspace.grid', { cols: shape.cols, rows: shape.rows })}
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '24px 0' }}>
          <input
            type="checkbox"
            checked={restore}
            disabled={!hasPrevious}
            onChange={(e) => setRestore(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            {t('launcher.restore')}
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t('launcher.restoreHint')}</div>
          </span>
        </label>

        <button onClick={() => void launch()} disabled={busy} style={{ width: '100%', padding: 14 }}>
          {t('launcher.start')}
        </button>
      </div>
    </div>
  );
}
