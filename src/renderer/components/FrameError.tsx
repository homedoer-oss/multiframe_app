import { useTranslation } from 'react-i18next';
import type { FrameErrorKind } from '@shared/types';

interface Props {
  error: FrameErrorKind;
  code: string;
  detail: string;
  url: string;
  onRetry: () => void;
}

/**
 * Ф-2.4 / Ф-8.18 — власна сторінка помилки замість вбудованої в Chromium.
 * Вбудована відображається мовою Chromium, а не мовою інтерфейсу, і не
 * підлягає стилізації. Тут main ховає WebContentsView, і крізь нього
 * проступає цей блок оболонки.
 */
export function FrameError({ error, code, detail, url, onRetry }: Props): JSX.Element {
  const { t } = useTranslation();
  const hintKey = `error.${error}Hint`;
  const hint = t(hintKey);

  return (
    <div style={{ padding: 20, height: '100%', overflow: 'auto' }}>
      <div style={{ color: 'var(--error)', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
        {t(`error.${error}`)}
      </div>

      {hint !== hintKey && (
        <div style={{ color: 'var(--text-dim)', fontSize: 12, maxWidth: 460, marginBottom: 14 }}>{hint}</div>
      )}

      <div style={{ color: 'var(--text-dim)', fontSize: 11, wordBreak: 'break-all', marginBottom: 4 }}>{url}</div>
      <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 16 }}>
        {t('error.code')}: {code} · {detail}
      </div>

      <button onClick={onRetry} style={{ padding: '6px 14px', fontSize: 12 }}>
        {t('error.retry')}
      </button>
    </div>
  );
}
