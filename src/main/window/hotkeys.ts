/**
 * Ф-7.1 / Ф-2.7 / Ф-2.9 / Ф-1.8 — гарячі клавіші.
 *
 * Ф-8.17 — прив'язка до ФІЗИЧНИХ кодів клавіш (`event.code`), а не до
 * символів (`event.key`): комбінація лишається на тому самому місці
 * клавіатури незалежно від розкладки, на відміну від символьних кодів,
 * які "їдуть" між локалями.
 *
 * Чиста функція без залежності від Electron — легко тестується без
 * запуску застосунку. Побічні ефекти (виклики Workspace, emit подій)
 * лежать окремо, у Workspace.handleHotkey().
 */
export interface HotkeyInput {
  type: string;
  code: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export type HotkeyAction =
  | { kind: 'cycleFrame'; reverse: boolean }
  | { kind: 'toggleMaximize' }
  | { kind: 'goBack' }
  | { kind: 'goForward' }
  | { kind: 'reload' }
  | { kind: 'openFind' }
  | { kind: 'zoom'; direction: -1 | 1 | 0 }
  | { kind: 'openSettings' };

export function matchHotkey(input: HotkeyInput): HotkeyAction | null {
  if (input.type !== 'keyDown') return null;
  // Ctrl — єдиний модифікатор-акселератор у застосунку (Windows-only, ОБМ).
  // meta (Win-клавіша) свідомо не прирівнюється до Ctrl: це інша клавіша.
  const ctrl = input.control && !input.alt && !input.meta;
  const alt = input.alt && !input.control && !input.meta;
  const { code } = input;

  if (ctrl && code === 'Tab') return { kind: 'cycleFrame', reverse: input.shift };
  if (ctrl && code === 'KeyM') return { kind: 'toggleMaximize' };
  if (alt && code === 'ArrowLeft') return { kind: 'goBack' };
  if (alt && code === 'ArrowRight') return { kind: 'goForward' };
  if ((ctrl && code === 'KeyR') || (!ctrl && !alt && code === 'F5')) return { kind: 'reload' };
  if (ctrl && code === 'KeyF') return { kind: 'openFind' };
  if (ctrl && (code === 'Equal' || code === 'NumpadAdd')) return { kind: 'zoom', direction: 1 };
  if (ctrl && (code === 'Minus' || code === 'NumpadSubtract')) return { kind: 'zoom', direction: -1 };
  if (ctrl && (code === 'Digit0' || code === 'Numpad0')) return { kind: 'zoom', direction: 0 };
  if (ctrl && code === 'Comma') return { kind: 'openSettings' };
  return null;
}
