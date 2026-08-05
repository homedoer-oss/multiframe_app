import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PROFILE_COLOR_PALETTE, UA_PRESETS } from '@shared/constants';
import type { AssignResult } from '@shared/ipc';
import type { Profile, ProxyConfig, ProxyMode, ProxyQuality } from '@shared/types';
import { QualityCard } from '../components/QualityCard';

/** Ф-6.1 / Ф-6.2 — ім'я, кольорова мітка, дублювання, скидання даних, видалення. */

/** Спред у String.fromCharCode переповнив би стек на великих файлах — читаємо шматками. */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

type BackupResult = { id: string; path: string } | { id: string; error: string };

export function ProfileManagerPanel({
  profiles, onProfilesChange,
}: {
  profiles: Profile[];
  onProfilesChange: (profiles: Profile[]) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [diskUsage, setDiskUsage] = useState<Record<string, number>>({});
  const [backupOpenId, setBackupOpenId] = useState<string | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupIncludeProxy, setBackupIncludeProxy] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  // Ф-10.15/Ф-10.16 backend (`proxy:evaluate`/`proxy:assign`) вже готовий
  // і покритий тестами — раніше в renderer просто не було ЖОДНОЇ UI, що
  // його викликає (STATE.md §7.4). Ручний ввід — базовий сценарій, який
  // має існувати незалежно від вкладки безкоштовних проксі.
  type ProxyDraft = { mode: ProxyMode; host: string; port: string; username: string; password: string };
  const [proxyOpenId, setProxyOpenId] = useState<string | null>(null);
  const [proxyDrafts, setProxyDrafts] = useState<Record<string, ProxyDraft>>({});
  const [proxyTest, setProxyTest] = useState<Record<string, { quality: ProxyQuality } | { error: true } | undefined>>({});
  const [proxyTesting, setProxyTesting] = useState<string | null>(null);
  const [proxyAssignMsg, setProxyAssignMsg] = useState<Record<string, AssignResult>>({});

  // 2026-08-04 — знайдено користувачем: «Reload now» мовчки нічого не
  // робив для профілю без жодної відкритої вкладки (той самий клас багу,
  // що й DevTools/Find без активної вкладки, розділ 9 STATE.md — тут ще й
  // на профіль, налаштований лише через Settings, до першої навігації
  // адресним рядком узагалі не було з чого перезавантажувати). Підписка
  // на frame:state, як і Workspace.tsx, лише для прапорця «є вкладка».
  const [hasTab, setHasTab] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // Стан на момент монтування: Settings могли відкрити вже ПІСЛЯ того,
    // як вкладка з'явилась і встигла стабілізуватись — жодної подальшої
    // frame:state події для неї тоді не буде, підписка нижче її не зловить.
    void window.multiframe.invoke('workspace:tabPresence', undefined)
      .then((snapshot) => setHasTab((prev) => ({ ...snapshot, ...prev })));
    return window.multiframe.on('frame:state', (state) => {
      setHasTab((prev) => ({ ...prev, [state.profileId]: state.tabs.length > 0 }));
    });
  }, []);

  // Запит користувача 2026-08-05 — автоматичний або ручний (зі списку
  // популярних, UA_PRESETS) вибір User-Agent. reload-hint — той самий
  // hasTab вище: без активної вкладки нема що перезавантажувати.
  const [uaOpenId, setUaOpenId] = useState<string | null>(null);
  const [uaAssignMsg, setUaAssignMsg] = useState<Record<string, true>>({});

  const uaPresetLabel = (presetId: string): string =>
    UA_PRESETS.find((preset) => preset.id === presetId)?.label ?? presetId;

  const setUaMode = (p: Profile, mode: 'auto' | 'manual'): void => {
    void withBusy(p.id, async () => {
      await window.multiframe.invoke(
        'identity:setUserAgent',
        mode === 'auto'
          ? { profileId: p.id, mode: 'auto' }
          : { profileId: p.id, mode: 'manual', presetId: p.identity.uaPresetId },
      );
      setUaAssignMsg((m) => ({ ...m, [p.id]: true }));
      await refresh();
    });
  };

  const setUaPreset = (p: Profile, presetId: string): void => {
    void withBusy(p.id, async () => {
      await window.multiframe.invoke('identity:setUserAgent', { profileId: p.id, mode: 'manual', presetId });
      setUaAssignMsg((m) => ({ ...m, [p.id]: true }));
      await refresh();
    });
  };

  const draftFor = (p: Profile): ProxyDraft =>
    proxyDrafts[p.id] ?? {
      mode: p.proxy.mode,
      host: p.proxy.host,
      port: p.proxy.port ? String(p.proxy.port) : '',
      username: p.proxy.username ?? '',
      password: '',
    };

  const setDraft = (p: Profile, patch: Partial<ProxyDraft>): void => {
    setProxyDrafts((d) => ({ ...d, [p.id]: { ...draftFor(p), ...patch } }));
  };

  const buildConfig = (p: Profile): ProxyConfig => {
    const d = draftFor(p);
    return {
      mode: d.mode,
      host: d.mode === 'direct' ? '' : d.host.trim(),
      port: d.mode === 'direct' ? 0 : Number(d.port) || 0,
      username: d.mode === 'direct' || !d.username.trim() ? undefined : d.username.trim(),
      hasPassword: d.password.length > 0 || p.proxy.hasPassword,
      class: 'manual',
    };
  };

  const testProxy = (p: Profile): void => {
    setProxyTesting(p.id);
    setProxyTest((t) => ({ ...t, [p.id]: undefined }));
    void window.multiframe.invoke('proxy:evaluate', { config: buildConfig(p) })
      .then((quality) => {
        setProxyTest((t) => ({ ...t, [p.id]: quality ? { quality } : { error: true } }));
      })
      .finally(() => setProxyTesting(null));
  };

  const assignProxy = (p: Profile): void => {
    const d = draftFor(p);
    void withBusy(p.id, async () => {
      const result = await window.multiframe.invoke('proxy:assign', {
        profileId: p.id,
        config: buildConfig(p),
        password: d.password || undefined,
      });
      setProxyAssignMsg((m) => ({ ...m, [p.id]: result }));
      if (result.ok) {
        setDraft(p, { password: '' });
        await refresh();
      }
    });
  };

  const refresh = async (): Promise<void> => {
    onProfilesChange(await window.multiframe.invoke('profile:list', undefined));
  };

  const runRestore = async (): Promise<void> => {
    if (!restoreFile) return;
    setRestoreBusy(true);
    setRestoreError(null);
    setRestoreSuccess(null);
    try {
      const buf = await restoreFile.arrayBuffer();
      const restored = await window.multiframe.invoke('profile:restoreBackup', {
        fileBase64: arrayBufferToBase64(buf),
        password: restorePassword,
      });
      setRestoreSuccess(t('profiles.restoreSuccess', { name: restored.name }));
      setRestorePassword('');
      setRestoreFile(null);
      await refresh();
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoreBusy(false);
    }
  };

  const withBusy = async (id: string, fn: () => Promise<void>): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const togglePersistSession = (profile: Profile): void => {
    if (!window.confirm(t('profiles.persistSessionConfirm'))) return;
    void withBusy(profile.id, async () => {
      await window.multiframe.invoke('frame:setPersistSession', {
        profileId: profile.id,
        persistSession: !profile.persistSession,
      });
      await refresh();
    });
  };

  const commitName = (profile: Profile): void => {
    const name = draftName.trim();
    setEditingId(null);
    if (!name || name === profile.name) return;
    void withBusy(profile.id, async () => {
      await window.multiframe.invoke('profile:update', { id: profile.id, patch: { name } });
      await refresh();
    });
  };

  const setColor = (profile: Profile, color: string): void => {
    void withBusy(profile.id, async () => {
      await window.multiframe.invoke('profile:update', { id: profile.id, patch: { color } });
      await refresh();
    });
  };

  const duplicate = (profile: Profile): void => {
    void withBusy(profile.id, async () => {
      await window.multiframe.invoke('profile:duplicate', { id: profile.id });
      await refresh();
    });
  };

  const remove = (profile: Profile): void => {
    if (!window.confirm(t('profiles.deleteConfirm', { name: profile.name }))) return;
    void withBusy(profile.id, async () => {
      await window.multiframe.invoke('profile:delete', { id: profile.id });
      await refresh();
    });
  };

  const resetData = (profile: Profile): void => {
    if (!window.confirm(t('profiles.resetConfirm', { name: profile.name }))) return;
    void withBusy(profile.id, async () => {
      await window.multiframe.invoke('profile:resetData', { id: profile.id });
      setDiskUsage((d) => ({ ...d, [profile.id]: 0 }));
    });
  };

  const loadDiskUsage = async (id: string): Promise<void> => {
    const bytes = await window.multiframe.invoke('profile:diskUsage', { profileId: id });
    setDiskUsage((d) => ({ ...d, [id]: bytes }));
  };

  const clearCache = (profile: Profile): void => {
    void withBusy(profile.id, async () => {
      await window.multiframe.invoke('profile:clearCache', { profileId: profile.id });
      await loadDiskUsage(profile.id);
    });
  };

  const runBackup = (profile: Profile): void => {
    void withBusy(profile.id, async () => {
      try {
        const path = await window.multiframe.invoke('profile:backup', {
          profileId: profile.id,
          password: backupPassword,
          includeProxyPassword: backupIncludeProxy,
        });
        setBackupResult({ id: profile.id, path });
      } catch (err) {
        setBackupResult({ id: profile.id, error: err instanceof Error ? err.message : String(err) });
      }
      setBackupPassword('');
    });
  };

  const actionBtn: CSSProperties = { fontSize: 11, padding: '4px 10px', background: 'var(--surface)' };

  return (
    <div style={{ maxWidth: 660 }}>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, marginTop: 0 }}>
        {t('profiles.intent')}
      </p>
      {error && <div style={{ color: 'var(--error)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{t('profiles.restoreTitle')}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>{t('profiles.restoreHint')}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            accept=".mfbackup"
            onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 11, color: 'var(--text)' }}
          />
          <input
            type="password"
            value={restorePassword}
            onChange={(e) => setRestorePassword(e.target.value)}
            placeholder={t('profiles.backupPassword')}
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
          />
          <button
            disabled={restoreBusy || !restoreFile || restorePassword.length < 8}
            onClick={() => void runRestore()}
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            {t('profiles.restoreButton')}
          </button>
        </div>
        {restoreError && <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 6 }}>{restoreError}</div>}
        {restoreSuccess && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 6 }}>{restoreSuccess}</div>}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {profiles.map((p) => (
          <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              {editingId === p.id ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => commitName(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitName(p);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  style={{ flex: 1, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--accent)',
                    borderRadius: 4, padding: '3px 6px', fontSize: 13 }}
                />
              ) : (
                <span
                  onClick={() => { setEditingId(p.id); setDraftName(p.name); }}
                  title={t('profiles.rename')}
                  style={{ flex: 1, fontSize: 13, cursor: 'text' }}
                >
                  {p.name}
                </span>
              )}
              {diskUsage[p.id] !== undefined ? (
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{formatBytes(diskUsage[p.id] as number)}</span>
              ) : (
                <button onClick={() => void loadDiskUsage(p.id)} style={actionBtn}>{t('profiles.disk')}</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {PROFILE_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(p, c)}
                  title={c}
                  style={{ width: 16, height: 16, borderRadius: '50%', background: c, padding: 0,
                    border: c === p.color ? '2px solid var(--text)' : '2px solid transparent' }}
                />
              ))}
            </div>

            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={p.persistSession}
                disabled={busyId === p.id}
                onChange={() => togglePersistSession(p)}
              />
              {t('profiles.persistSession')}
            </label>

            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <button disabled={busyId === p.id} onClick={() => duplicate(p)} style={actionBtn}>
                {t('profiles.duplicate')}
              </button>
              <button disabled={busyId === p.id} onClick={() => clearCache(p)} style={actionBtn}>
                {t('profiles.clearCache')}
              </button>
              <button disabled={busyId === p.id} onClick={() => resetData(p)} style={actionBtn}>
                {t('profiles.resetData')}
              </button>
              <button
                disabled={busyId === p.id}
                onClick={() => setBackupOpenId(backupOpenId === p.id ? null : p.id)}
                style={actionBtn}
              >
                {t('profiles.backup')}
              </button>
              <button
                disabled={busyId === p.id}
                onClick={() => setProxyOpenId(proxyOpenId === p.id ? null : p.id)}
                style={actionBtn}
              >
                {t('profiles.proxy')} — {p.proxy.mode === 'direct' ? t('proxy.direct') : `${p.proxy.host}:${p.proxy.port}`}
              </button>
              <button
                disabled={busyId === p.id}
                onClick={() => setUaOpenId(uaOpenId === p.id ? null : p.id)}
                style={actionBtn}
              >
                {t('profiles.userAgent')} — {p.uaMode === 'auto'
                  ? `${t('profiles.ua.auto')} (${uaPresetLabel(p.identity.uaPresetId)})`
                  : uaPresetLabel(p.identity.uaPresetId)}
              </button>
              <button disabled={busyId === p.id} onClick={() => remove(p)} style={{ ...actionBtn, background: 'var(--error)' }}>
                {t('profiles.delete')}
              </button>
            </div>

            {proxyOpenId === p.id && (() => {
              const draft = draftFor(p);
              const test = proxyTest[p.id];
              const assignMsg = proxyAssignMsg[p.id];
              return (
                <div style={{ marginTop: 10, padding: 10, background: 'var(--bg)', borderRadius: 4 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <select
                      value={draft.mode}
                      onChange={(e) => setDraft(p, { mode: e.target.value as ProxyMode })}
                      style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
                    >
                      <option value="direct">{t('proxy.direct')}</option>
                      <option value="https">{t('proxy.https')}</option>
                      <option value="socks5">{t('proxy.socks5')}</option>
                    </select>

                    {draft.mode !== 'direct' && (
                      <>
                        <input
                          value={draft.host}
                          onChange={(e) => setDraft(p, { host: e.target.value })}
                          placeholder={t('profiles.proxy.host')}
                          style={{ width: 140, background: 'var(--surface)', color: 'var(--text)',
                            border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
                        />
                        <input
                          value={draft.port}
                          onChange={(e) => setDraft(p, { port: e.target.value.replace(/\D/g, '') })}
                          placeholder={t('profiles.proxy.port')}
                          style={{ width: 70, background: 'var(--surface)', color: 'var(--text)',
                            border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
                        />
                        <input
                          value={draft.username}
                          onChange={(e) => setDraft(p, { username: e.target.value })}
                          placeholder={t('profiles.proxy.username')}
                          style={{ width: 110, background: 'var(--surface)', color: 'var(--text)',
                            border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
                        />
                        <input
                          type="password"
                          value={draft.password}
                          onChange={(e) => setDraft(p, { password: e.target.value })}
                          placeholder={p.proxy.hasPassword ? t('profiles.proxy.passwordSet') : t('profiles.proxy.password')}
                          style={{ width: 110, background: 'var(--surface)', color: 'var(--text)',
                            border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
                        />
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {draft.mode !== 'direct' && (
                      <button
                        disabled={proxyTesting === p.id || !draft.host.trim() || !draft.port}
                        onClick={() => testProxy(p)}
                        style={{ fontSize: 11, padding: '4px 10px' }}
                      >
                        {proxyTesting === p.id ? t('profiles.proxy.testing') : t('profiles.proxy.test')}
                      </button>
                    )}
                    <button
                      disabled={busyId === p.id || (draft.mode !== 'direct' && (!draft.host.trim() || !draft.port))}
                      onClick={() => assignProxy(p)}
                      style={{ fontSize: 11, padding: '4px 10px' }}
                    >
                      {t('profiles.proxy.assign')}
                    </button>
                  </div>

                  {test && 'quality' in test && (
                    <div style={{ marginTop: 8 }}><QualityCard quality={test.quality} /></div>
                  )}
                  {test && 'error' in test && (
                    <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 8 }}>{t('profiles.proxy.testFailed')}</div>
                  )}
                  {assignMsg && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginTop: 8,
                      color: assignMsg.ok ? 'var(--success)' : 'var(--error)' }}>
                      {assignMsg.ok
                        ? (hasTab[p.id] ? t('profiles.proxy.assigned') : t('profiles.proxy.assignedNoTab'))
                        : t(`assign.refused.${assignMsg.reason}`)}
                      {assignMsg.ok && hasTab[p.id] && (
                        <button
                          onClick={() => void window.multiframe.invoke('frame:reload', { profileId: p.id })}
                          style={{ fontSize: 11, padding: '2px 8px' }}
                        >
                          {t('profiles.proxy.reloadNow')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {uaOpenId === p.id && (
              <div style={{ marginTop: 10, padding: 10, background: 'var(--bg)', borderRadius: 4 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <select
                    value={p.uaMode}
                    disabled={busyId === p.id}
                    onChange={(e) => setUaMode(p, e.target.value as 'auto' | 'manual')}
                    style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
                      borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
                  >
                    <option value="auto">{t('profiles.ua.auto')}</option>
                    <option value="manual">{t('profiles.ua.manual')}</option>
                  </select>

                  {p.uaMode === 'manual' && (
                    <select
                      value={p.identity.uaPresetId}
                      disabled={busyId === p.id}
                      onChange={(e) => setUaPreset(p, e.target.value)}
                      style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
                    >
                      {UA_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-dim)', wordBreak: 'break-all', marginBottom: 8 }}>
                  {p.identity.userAgent}
                </div>

                {uaAssignMsg[p.id] && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--success)' }}>
                    {hasTab[p.id] ? t('profiles.ua.changed') : t('profiles.ua.changedNoTab')}
                    {hasTab[p.id] && (
                      <button
                        onClick={() => void window.multiframe.invoke('frame:reload', { profileId: p.id })}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                      >
                        {t('profiles.proxy.reloadNow')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {backupOpenId === p.id && (
              <div style={{ marginTop: 10, padding: 10, background: 'var(--bg)', borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>{t('profiles.backupHint')}</div>
                <input
                  type="password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  placeholder={t('profiles.backupPassword')}
                  style={{ width: '100%', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
                    borderRadius: 4, padding: '6px 8px', fontSize: 12, marginBottom: 8 }}
                />
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={backupIncludeProxy}
                    onChange={(e) => setBackupIncludeProxy(e.target.checked)}
                  />
                  {t('profiles.backupIncludeProxyPassword')}
                </label>
                <button
                  disabled={busyId === p.id || backupPassword.length < 8}
                  onClick={() => runBackup(p)}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  {t('profiles.backupCreate')}
                </button>
                {backupResult?.id === p.id && (
                  'path' in backupResult ? (
                    <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 6, wordBreak: 'break-all' }}>
                      {t('profiles.backupSaved', { path: backupResult.path })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 6 }}>{backupResult.error}</div>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
