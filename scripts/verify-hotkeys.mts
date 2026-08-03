#!/usr/bin/env node --experimental-transform-types
/**
 * Регресія для matchHotkey (Ф-7.1 / Ф-8.17). Чиста функція, без Electron —
 * прив'язка до фізичних кодів клавіш, а не символів, і немає конфліктів
 * між комбінаціями.
 */
import { matchHotkey, type HotkeyAction, type HotkeyInput } from '../src/main/window/hotkeys.ts';

const input = (code: string, mods: Partial<HotkeyInput> = {}): HotkeyInput => ({
  type: 'keyDown', code, control: false, shift: false, alt: false, meta: false, ...mods,
});

const t = (n: string, ok: boolean, extra = ''): number => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${extra ? '  (' + extra + ')' : ''}`);
  return ok ? 0 : 1;
};
let bad = 0;

const eq = (a: HotkeyAction | null, b: HotkeyAction | null): boolean => JSON.stringify(a) === JSON.stringify(b);

console.log('\nФ-8.17 — прив\'язка до фізичних кодів (не символів):');
bad += t('Ctrl+Tab → наступний фрейм', eq(matchHotkey(input('Tab', { control: true })), { kind: 'cycleFrame', reverse: false }));
bad += t('Ctrl+Shift+Tab → попередній фрейм', eq(matchHotkey(input('Tab', { control: true, shift: true })), { kind: 'cycleFrame', reverse: true }));
bad += t('Ctrl+M → розгорнути/згорнути', eq(matchHotkey(input('KeyM', { control: true })), { kind: 'toggleMaximize' }));
bad += t('Alt+ArrowLeft → назад', eq(matchHotkey(input('ArrowLeft', { alt: true })), { kind: 'goBack' }));
bad += t('Alt+ArrowRight → вперед', eq(matchHotkey(input('ArrowRight', { alt: true })), { kind: 'goForward' }));
bad += t('Ctrl+R → оновити', eq(matchHotkey(input('KeyR', { control: true })), { kind: 'reload' }));
bad += t('F5 без модифікаторів → оновити', eq(matchHotkey(input('F5')), { kind: 'reload' }));
bad += t('Ctrl+F → пошук на сторінці', eq(matchHotkey(input('KeyF', { control: true })), { kind: 'openFind' }));
bad += t('Ctrl+= → зум +', eq(matchHotkey(input('Equal', { control: true })), { kind: 'zoom', direction: 1 }));
bad += t('Ctrl+NumpadAdd → зум +', eq(matchHotkey(input('NumpadAdd', { control: true })), { kind: 'zoom', direction: 1 }));
bad += t('Ctrl+- → зум −', eq(matchHotkey(input('Minus', { control: true })), { kind: 'zoom', direction: -1 }));
bad += t('Ctrl+0 → зум скинути', eq(matchHotkey(input('Digit0', { control: true })), { kind: 'zoom', direction: 0 }));
bad += t('Ctrl+, → налаштування', eq(matchHotkey(input('Comma', { control: true })), { kind: 'openSettings' }));

console.log('\nНе спрацьовує без потрібних модифікаторів чи на keyUp:');
bad += t('Tab без Ctrl → null', matchHotkey(input('Tab')) === null);
bad += t('KeyF без Ctrl → null (звичайне набирання тексту)', matchHotkey(input('KeyF')) === null);
bad += t('KeyR з Alt замість Ctrl → null', matchHotkey(input('KeyR', { alt: true })) === null);
bad += t('keyUp ігнорується', matchHotkey({ ...input('KeyM', { control: true }), type: 'keyUp' }) === null);
bad += t('невідома клавіша → null', matchHotkey(input('KeyQ', { control: true })) === null);

console.log('\nВзаємовиключність (жодна комбінація не мапиться на дві дії):');
const combos: HotkeyInput[] = [
  input('Tab', { control: true }), input('Tab', { control: true, shift: true }),
  input('KeyM', { control: true }), input('ArrowLeft', { alt: true }), input('ArrowRight', { alt: true }),
  input('KeyR', { control: true }), input('F5'), input('KeyF', { control: true }),
  input('Equal', { control: true }), input('Minus', { control: true }), input('Digit0', { control: true }),
  input('Comma', { control: true }),
];
const seen = new Map<string, number>();
for (const c of combos) {
  const key = `${c.code}:${c.control}:${c.shift}:${c.alt}`;
  seen.set(key, (seen.get(key) ?? 0) + 1);
}
bad += t('усі перевірені комбінації унікальні', [...seen.values()].every((n) => n === 1));

console.log(`\nПроблем: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
