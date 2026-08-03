import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PROFILE_COLOR_PALETTE } from '@shared/constants';
import type { Profile } from '@shared/types';

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
              <button disabled={busyId === p.id} onClick={() => remove(p)} style={{ ...actionBtn, background: 'var(--error)' }}>
                {t('profiles.delete')}
              </button>
            </div>

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
