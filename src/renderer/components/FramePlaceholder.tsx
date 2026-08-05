import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FrameState, Profile } from '@shared/types';
import { TabBar } from './TabBar';
import { FrameError } from './FrameError';
import { ProxyEditor } from './ProxyEditor';

interface Props {
  profile: Profile;
  state: FrameState | undefined;
  maximized: boolean;
  focused: boolean;
  onToggleMaximize: () => void;
  onFocus: () => void;
  registerCell: (el: HTMLDivElement | null) => void;
  emptyLabel: string;
  /** 2026-08-05 — ProxyEditor тут оновлює профіль напряму з фрейма, не лише з Settings. */
  onProfilesChange: (profiles: Profile[]) => void;
}

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2] as const;

export function FramePlaceholder({
  profile, state, maximized, focused, onToggleMaximize, onFocus, registerCell, emptyLabel, onProfilesChange,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const [address, setAddress] = useState(profile.startUrl === 'about:blank' ? '' : profile.startUrl);
  const [finding, setFinding] = useState(false);
  const id = profile.id;
  const error = state?.status.kind === 'error' ? state.status : null;
  // Ф-2.8/Ф-2.9 — без відкритої вкладки нема що інспектувати чи шукати:
  // withActiveWebContents() на боці main тихо не робить нічого в цьому
  // випадку, тож кнопка мала б вигляд зламаної без disabled-стану.
  const hasTab = Boolean(state && state.tabs.length > 0);
  // 2026-08-04 — вкладка є, але на about:blank (щойно перестворений фрейм
  // чи прогрів перед реальною навігацією, Frame.ts isBlankIdle()) — main
  // ховає view саме для цього випадку, інакше тут було б порожнє біле
  // вікно («біле вікно» з погляду користувача) замість статусу проксі.
  const isBlankIdle = hasTab && !error && state?.currentUrl === 'about:blank';

  // Запит користувача 2026-08-05 — швидка зміна проксі біля адресного
  // рядка, без відкриття Settings. Форма малюється оболонкою поверх ТІЛА
  // комірки, тому main має сховати реальний WebContentsView на час, поки
  // вона відкрита (§5.9 — view завжди над DOM оболонки) — per-frame,
  // окремим прапорцем від Settings/Splash (Frame.setToolbarOverlayOpen()),
  // інакше форма опинилась би ПІД сторінкою сайту.
  const [proxyOpen, setProxyOpen] = useState(false);
  const proxyPanelRef = useRef<HTMLDivElement | null>(null);
  const proxyButtonRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Знайдено користувачем 2026-08-05, того ж дня, що й сама фіча: якщо
   * форму лишити відкритою (не закривати явно) й одразу перейти за новою
   * адресою, `toolbarOverlayOpen` лишався `true` — реальний WebContentsView
   * НОВОЇ вкладки теж ховався б, попри коректно застосований проксі
   * (`shouldShowActiveView()`, Frame.ts). Виглядало це як «проксі не
   * працює», а насправді сторінка була просто прихована. Перемикання
   * «Save session» «допомагало» лише тому, що перестворює Frame з нуля —
   * дефолтний `toolbarOverlayOpen = false`. Реальний фікс — не лишати
   * прапорець застряглим: закривати панель і на навігації (go() нижче),
   * і на кліку поза її межами.
   */
  const setProxyPanel = (open: boolean): void => {
    setProxyOpen(open);
    void window.multiframe.invoke('frame:setToolbarOverlayOpen', { profileId: id, open });
  };
  useEffect(() => {
    if (!proxyOpen) return;
    const onDocMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (proxyPanelRef.current?.contains(target)) return;
      if (proxyButtonRef.current?.contains(target)) return;
      setProxyPanel(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [proxyOpen]);
  // Закривається й ховає view автоматично, якщо профіль випав із сітки
  // (розгортання іншого фрейму) — інакше прапорець лишився б застряглим у true.
  useEffect(() => {
    return () => void window.multiframe.invoke('frame:setToolbarOverlayOpen', { profileId: id, open: false }).catch(() => {});
  }, [id]);
  const refreshProfiles = async (): Promise<void> => {
    onProfilesChange(await window.multiframe.invoke('profile:list', undefined));
  };

  // Адресний рядок стежить за фактичною навігацією, доки користувач не редагує його.
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (!edited && state?.currentUrl && state.currentUrl !== 'about:blank') setAddress(state.currentUrl);
  }, [state?.currentUrl, edited]);

  const go = (): void => {
    if (!address.trim()) return;
    const url = /^https?:\/\//i.test(address) ? address : `https://${address}`;
    setEdited(false);
    if (proxyOpen) setProxyPanel(false);
    void window.multiframe.invoke('frame:navigate', { profileId: id, url });
  };

  /**
   * Ф-2.7 — зум змінює userZoom у формулі Ф-4.5, а не викликає
   * setZoomFactor. Інакше він конкурував би з масштабуванням комірки.
   */
  const stepZoom = (dir: -1 | 1 | 0): void => {
    const current = state?.userZoom ?? profile.userZoom;
    const idx = ZOOM_STEPS.findIndex((z) => z >= current - 1e-6);
    const next = dir === 0 ? 1 : ZOOM_STEPS[Math.min(Math.max(idx + dir, 0), ZOOM_STEPS.length - 1)] ?? 1;
    void window.multiframe.invoke('frame:setZoom', { profileId: id, userZoom: next });
  };

  // stepZoom — нова функція щорендеру (залежить від state.userZoom); ref,
  // щоб підписка нижче не перевстановлювалась при кожному оновленні FrameState.
  const stepZoomRef = useRef(stepZoom);
  stepZoomRef.current = stepZoom;

  /**
   * Ф-2.7 / Ф-2.9 — Ctrl +/−/0 і Ctrl+F перехоплюються в main
   * (before-input-event бачить клавіші й тоді, коли фокус усередині
   * сторінки сайту, куди React renderer не дотягнеться) і долітають
   * сюди подією, відфільтрованою за profileId.
   */
  useEffect(() => {
    const offZoom = window.multiframe.on('hotkey:zoom', (data) => {
      if (data.profileId === id) stepZoomRef.current(data.direction);
    });
    const offFind = window.multiframe.on('hotkey:openFind', (data) => {
      if (data.profileId === id) setFinding(true);
    });
    return () => { offZoom(); offFind(); };
  }, [id]);

  const btn = { padding: '4px 8px', background: 'transparent', border: '1px solid var(--border)' } as const;

  return (
    <div
      onMouseDown={onFocus}
      style={{
        display: 'flex', flexDirection: 'column', background: 'var(--bg)',
        minWidth: 0, minHeight: 0, position: 'relative',
        // Ф-1.9 / Ф-9.3 — янтарний зарезервований за станом «активний фрейм»
        outline: focused ? '2px solid var(--active)' : 'none',
        outlineOffset: -2,
      }}
    >
      <TabBar
        tabs={state?.tabs ?? []}
        activeTabId={state?.activeTabId ?? null}
        onActivate={(tabId) => void window.multiframe.invoke('frame:activateTab', { profileId: id, tabId })}
        onClose={(tabId) => void window.multiframe.invoke('frame:closeTab', { profileId: id, tabId })}
        onNew={() => void window.multiframe.invoke('frame:newTab', { profileId: id })}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
        background: 'var(--surface)', borderBottom: `2px solid ${profile.color}` }}>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{profile.name}</span>
          {/* Ф-3 — лише коли профіль реально йде через проксі (не 'direct'):
              exitIp приходить від Frame.refreshExitIp() (main), який сам
              звіряється через session.resolveProxy() з живою сесією, тож
              тут нема окремої перевірки profile.proxy.mode. */}
          {state?.exitIp && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.7, whiteSpace: 'nowrap' }}
              title={t('frame.exitIp', { ip: state.exitIp })}>
              {state.exitIp}
            </span>
          )}
        </span>

        <button style={btn} disabled={!state?.canGoBack} title={t('frame.back')}
          onClick={() => void window.multiframe.invoke('frame:goBack', { profileId: id })}>←</button>
        <button style={btn} disabled={!state?.canGoForward} title={t('frame.forward')}
          onClick={() => void window.multiframe.invoke('frame:goForward', { profileId: id })}>→</button>
        {state?.status.kind === 'loading' ? (
          <button style={btn} title={t('frame.stop')}
            onClick={() => void window.multiframe.invoke('frame:stop', { profileId: id })}>✕</button>
        ) : (
          <button style={btn} title={t('frame.reload')}
            onClick={() => void window.multiframe.invoke('frame:reload', { profileId: id })}>⟳</button>
        )}

        <input
          value={address}
          onChange={(e) => { setAddress(e.target.value); setEdited(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
          placeholder={t('frame.address')}
          spellCheck={false}
          style={{
            flex: 1, minWidth: 0, padding: '4px 8px',
            background: 'var(--bg)', color: 'var(--text)',
            border: `1px solid ${error ? 'var(--error)' : 'var(--border)'}`,
            borderRadius: 4, font: 'inherit', fontSize: 12,
          }}
        />

        <button style={btn} disabled={!hasTab} title={t('frame.find')} onClick={() => setFinding((v) => !v)}>⌕</button>
        <button style={btn} disabled={!hasTab} title={t('frame.devtools')}
          onClick={() => void window.multiframe.invoke('frame:openDevTools', { profileId: id })}>⚙</button>

        <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button style={btn} onClick={() => stepZoom(-1)}>−</button>
          <span onDoubleClick={() => stepZoom(0)}
            style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 34, textAlign: 'center' }}>
            {Math.round((state?.userZoom ?? 1) * 100)}%
          </span>
          <button style={btn} onClick={() => stepZoom(1)}>+</button>
        </span>

        {/* Ф-9.4 — режим мережі читається без кольору. Запит користувача
            2026-08-05 — клікабельна, відкриває швидкий редактор проксі
            нижче, без відкриття загальних Settings. */}
        <button
          ref={proxyButtonRef}
          onClick={() => setProxyPanel(!proxyOpen)}
          title={t('profiles.proxy')}
          style={{ ...btn, fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap',
            background: proxyOpen ? 'var(--surface)' : 'transparent' }}
        >
          {t(`proxy.${profile.proxy.mode}`)}
        </button>

        <button style={btn} onClick={onToggleMaximize} title={maximized ? t('frame.restore') : t('frame.maximize')}>
          {maximized ? '▣' : '▢'}
        </button>
      </div>

      {finding && (
        <input
          autoFocus
          placeholder={t('frame.find')}
          onChange={(e) => void window.multiframe.invoke('frame:findInPage', {
            profileId: id, text: e.target.value, forward: true,
          })}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            setFinding(false);
            void window.multiframe.invoke('frame:stopFind', { profileId: id });
          }}
          style={{ margin: '4px 8px', padding: '4px 8px', background: 'var(--bg)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
        />
      )}

      {/* Прямокутник, чию геометрію main використовує для setBounds (АРХ-7) */}
      <div ref={registerCell} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {/* Ф-1.7 / НФ-1.5 — той самий порожній стан і для ще не відкритого
            фрейму (state === undefined), і для присипаного (0 вкладок):
            клік/адреса однаково відкриває вкладку заново в обох випадках. */}
        {(!state || state.tabs.length === 0) && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%',
            color: 'var(--text-dim)', fontSize: 12 }}>{emptyLabel}</div>
        )}
        {error && (
          <FrameError
            error={error.error}
            code={error.code}
            detail={error.detail}
            url={error.url}
            onRetry={() => void window.multiframe.invoke('frame:reload', { profileId: id })}
          />
        )}
        {isBlankIdle && (
          profile.proxy.mode === 'direct' ? (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%',
              color: 'var(--text-dim)', fontSize: 12 }}>{emptyLabel}</div>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', textAlign: 'center' }}>
              {state?.exitIp ? (
                <div>
                  <div style={{ color: 'var(--success)', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                    {t('frame.proxyActive')}
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{state.exitIp}</div>
                </div>
              ) : state?.proxyCheckFailed ? (
                <div style={{ color: 'var(--warning)', fontSize: 13 }}>{t('frame.proxyCheckFailed')}</div>
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{t('frame.proxyChecking')}</div>
              )}
            </div>
          )
        )}
      </div>

      {proxyOpen && (
        <div ref={proxyPanelRef} style={{
          position: 'absolute', top: 40, right: 40, zIndex: 10,
          width: 360, boxShadow: '0 4px 16px rgba(0,0,0,.4)', border: '1px solid var(--border)', borderRadius: 4,
        }}>
          <ProxyEditor
            profile={profile}
            hasTab={hasTab}
            onChanged={async () => {
              await refreshProfiles();
              // Той самий стан, що й «Reload now» деінде — після успішного
              // призначення видима зміна лише після перезавантаження, форма
              // лишається відкритою, щоб користувач сам натиснув, коли готовий.
            }}
          />
        </div>
      )}
    </div>
  );
}
