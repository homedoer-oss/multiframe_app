import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssignResult } from '@shared/ipc';
import type { Profile, ProxyConfig, ProxyMode, ProxyQuality } from '@shared/types';
import { QualityCard } from './QualityCard';

type ProxyDraft = { mode: ProxyMode; host: string; port: string; username: string; password: string };

/**
 * 2026-08-05 — витягнуто з ProfileManagerPanel.tsx: та сама форма проксі
 * тепер потрібна ще й у швидкому редакторі біля адресного рядка фрейма
 * (FramePlaceholder.tsx), не лише в Settings. Самодостатній компонент —
 * власний чернетковий стан, ініціалізований від поточного profile.proxy
 * при монтуванні (панель монтується заново щоразу, коли її відкривають,
 * тож завжди стартує зі свіжого стану — втрати немає).
 */
export function ProxyEditor({
  profile, hasTab, onChanged,
}: {
  profile: Profile;
  hasTab: boolean;
  onChanged: () => Promise<void> | void;
}): JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraftState] = useState<ProxyDraft>({
    mode: profile.proxy.mode,
    host: profile.proxy.host,
    port: profile.proxy.port ? String(profile.proxy.port) : '',
    username: profile.proxy.username ?? '',
    password: '',
  });
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ quality: ProxyQuality } | { error: true } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [assignMsg, setAssignMsg] = useState<AssignResult | undefined>(undefined);

  const patch = (p: Partial<ProxyDraft>): void => setDraftState((d) => ({ ...d, ...p }));

  const buildConfig = (): ProxyConfig => ({
    mode: draft.mode,
    host: draft.mode === 'direct' ? '' : draft.host.trim(),
    port: draft.mode === 'direct' ? 0 : Number(draft.port) || 0,
    username: draft.mode === 'direct' || !draft.username.trim() ? undefined : draft.username.trim(),
    hasPassword: draft.password.length > 0 || profile.proxy.hasPassword,
    class: 'manual',
  });

  const testProxy = (): void => {
    setTesting(true);
    setTest(undefined);
    void window.multiframe.invoke('proxy:evaluate', { config: buildConfig() })
      .then((quality) => setTest(quality ? { quality } : { error: true }))
      .finally(() => setTesting(false));
  };

  const assignProxy = (): void => {
    setBusy(true);
    void window.multiframe.invoke('proxy:assign', {
      profileId: profile.id,
      config: buildConfig(),
      password: draft.password || undefined,
    })
      .then(async (result) => {
        setAssignMsg(result);
        if (result.ok) {
          patch({ password: '' });
          await onChanged();
        }
      })
      .finally(() => setBusy(false));
  };

  return (
    <div style={{ padding: 10, background: 'var(--bg)', borderRadius: 4 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <select
          value={draft.mode}
          onChange={(e) => patch({ mode: e.target.value as ProxyMode })}
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
              onChange={(e) => patch({ host: e.target.value })}
              placeholder={t('profiles.proxy.host')}
              style={{ width: 140, background: 'var(--surface)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
            />
            <input
              value={draft.port}
              onChange={(e) => patch({ port: e.target.value.replace(/\D/g, '') })}
              placeholder={t('profiles.proxy.port')}
              style={{ width: 70, background: 'var(--surface)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
            />
            <input
              value={draft.username}
              onChange={(e) => patch({ username: e.target.value })}
              placeholder={t('profiles.proxy.username')}
              style={{ width: 110, background: 'var(--surface)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
            />
            <input
              type="password"
              value={draft.password}
              onChange={(e) => patch({ password: e.target.value })}
              placeholder={profile.proxy.hasPassword ? t('profiles.proxy.passwordSet') : t('profiles.proxy.password')}
              style={{ width: 110, background: 'var(--surface)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
            />
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {draft.mode !== 'direct' && (
          <button
            disabled={testing || !draft.host.trim() || !draft.port}
            onClick={testProxy}
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            {testing ? t('profiles.proxy.testing') : t('profiles.proxy.test')}
          </button>
        )}
        <button
          disabled={busy || (draft.mode !== 'direct' && (!draft.host.trim() || !draft.port))}
          onClick={assignProxy}
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
            ? (hasTab ? t('profiles.proxy.assigned') : t('profiles.proxy.assignedNoTab'))
            : t(`assign.refused.${assignMsg.reason}`)}
          {assignMsg.ok && hasTab && (
            <button
              onClick={() => void window.multiframe.invoke('frame:reload', { profileId: profile.id })}
              style={{ fontSize: 11, padding: '2px 8px' }}
            >
              {t('profiles.proxy.reloadNow')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
