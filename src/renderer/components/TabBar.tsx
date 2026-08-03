import { useTranslation } from 'react-i18next';
import type { Tab } from '@shared/types';

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNew: () => void;
}

/**
 * Ф-2.2 — вкладки всередині фрейму. Без них ламаються сценарії OAuth,
 * де провайдер відкриває вікно через window.open.
 */
export function TabBar({ tabs, activeTabId, onActivate, onClose, onNew }: Props): JSX.Element | null {
  const { t } = useTranslation();
  if (tabs.length <= 1) return null;

  return (
    <div style={{ display: 'flex', gap: 1, background: 'var(--border)', overflowX: 'auto' }}>
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onActivate(tab.id)}
            title={tab.url}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px', maxWidth: 180, minWidth: 60,
              background: active ? 'var(--bg)' : 'var(--surface)',
              borderTop: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {tab.loading ? '…' : tab.title || t('frame.untitled')}
            </span>
            <span
              role="button"
              title={t('frame.closeTab')}
              onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              style={{ color: 'var(--text-dim)', padding: '0 2px' }}
            >
              ×
            </span>
          </div>
        );
      })}
      <button
        onClick={onNew}
        title={t('frame.newTab')}
        style={{ padding: '2px 10px', background: 'var(--surface)', border: 0, borderRadius: 0, fontSize: 13 }}
      >
        +
      </button>
    </div>
  );
}
