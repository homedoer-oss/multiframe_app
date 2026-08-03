import { CONFIG_VERSION } from './schema';

type Raw = Record<string, unknown>;

/**
 * Ф-5.7 — міграції конфігурації. Кожен крок піднімає версію рівно на одиницю.
 * Додаючи міграцію, підніміть CONFIG_VERSION і додайте запис сюди.
 */
const steps: Record<number, (c: Raw) => Raw> = {
  // 0 -> 1: початкова схема
  0: (c) => ({ ...c, version: 1 }),
};

export function migrate(raw: Raw): Raw {
  let current = raw;
  let version = typeof current.version === 'number' ? current.version : 0;

  while (version < CONFIG_VERSION) {
    const step = steps[version];
    if (!step) throw new Error(`Відсутня міграція конфігурації з версії ${version}`);
    current = step(current);
    version = typeof current.version === 'number' ? current.version : version + 1;
  }

  if (version > CONFIG_VERSION) {
    throw new Error(
      `Конфігурація версії ${version} новіша за підтримувану ${CONFIG_VERSION}. ` +
        'Оновіть застосунок.',
    );
  }
  return current;
}
