import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings, CellRect, FrameState, Profile } from '@shared/types';
import { gridShapeFor } from '../lib/grid';
import { FramePlaceholder } from '../components/FramePlaceholder';

/**
 * АРХ-7 — WebContentsView не є частиною DOM. React рендерить плейсхолдери,
 * вимірює їх і надсилає геометрію в main, який позиціонує реальні view.
 */
export function Workspace({
  profiles, onProfilesChange,
}: {
  profiles: Profile[];
  settings: AppSettings;
  /** 2026-08-05 — ProxyEditor у FramePlaceholder.tsx оновлює профіль напряму з фрейма, не лише з Settings. */
  onProfilesChange: (profiles: Profile[]) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const shape = gridShapeFor(profiles.length);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const [states, setStates] = useState<Record<string, FrameState>>({});
  const [maximized, setMaximized] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(profiles[0]?.id ?? null);

  const publishRects = useCallback(() => {
    const rects: Record<string, CellRect> = {};
    for (const [id, el] of cellRefs.current) {
      const r = el.getBoundingClientRect();
      rects[id] = {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }
    void window.multiframe.invoke('workspace:setCellRects', rects);
  }, []);

  useLayoutEffect(() => {
    publishRects();
  }, [publishRects, profiles.length, maximized]);

  useEffect(() => {
    const offState = window.multiframe.on('frame:state', (state) => {
      setStates((prev) => ({ ...prev, [state.profileId]: state }));
    });
    const offLayout = window.multiframe.on('workspace:layoutInvalidated', () => publishRects());
    // Ф-7.1 — Ctrl+Tab перемикає фокус із main; renderer лише підсвічує рамку (Ф-1.9).
    const offFocus = window.multiframe.on('workspace:focusChanged', ({ profileId }) => setFocused(profileId));

    // Ресайз вікна: гасимо дрібні зміни, щоб не смикати геометрію view.
    let timer: number | undefined;
    const onResize = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(publishRects, 40);
    };
    window.addEventListener('resize', onResize);

    return () => {
      offState();
      offLayout();
      offFocus();
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
    };
  }, [publishRects]);

  /** Ф-1.8 — розгортання фрейму змінює лише scale, не логічний viewport. */
  const toggleMaximize = (id: string): void => {
    const next = maximized === id ? null : id;
    setMaximized(next);
    void window.multiframe.invoke('workspace:maximizeFrame', { profileId: next });
  };

  /** Ф-1.9 — фокус визначає, який фрейм отримує клавіатурне введення. */
  const focus = (id: string): void => {
    if (focused === id) return;
    setFocused(id);
    void window.multiframe.invoke('frame:focus', { profileId: id });
  };

  const visible = maximized ? profiles.filter((p) => p.id === maximized) : profiles;

  return (
    <div
      data-testid="workspace-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: maximized ? '1fr' : `repeat(${shape.cols}, 1fr)`,
        gridTemplateRows: maximized ? '1fr' : `repeat(${shape.rows}, 1fr)`,
        gap: 2,
        height: '100%',
        background: 'var(--border)',
      }}
    >
      {visible.map((profile) => (
        <FramePlaceholder
          key={profile.id}
          profile={profile}
          state={states[profile.id]}
          maximized={maximized === profile.id}
          focused={focused === profile.id}
          onToggleMaximize={() => toggleMaximize(profile.id)}
          onFocus={() => focus(profile.id)}
          onProfilesChange={onProfilesChange}
          registerCell={(el) => {
            if (el) cellRefs.current.set(profile.id, el);
            else cellRefs.current.delete(profile.id);
          }}
          emptyLabel={t('workspace.emptyFrame')}
        />
      ))}
    </div>
  );
}
