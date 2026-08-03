import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { FALLBACK_LOCALE, SUPPORTED_LOCALES, type Locale } from '@shared/constants';
import { log } from '../logging/logger';
import { CONFIG_VERSION, configSchema, type Config } from './schema';
import { migrate } from './migrations';

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

function detectLocale(): Locale {
  const system = app.getSystemLocale().slice(0, 2).toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(system)
    ? (system as Locale)
    : FALLBACK_LOCALE; // Ф-8.2
}

function defaults(): Config {
  return configSchema.parse({
    version: CONFIG_VERSION,
    settings: { locale: detectLocale() },
    profiles: [],
    lastSession: null,
  });
}

let cache: Config | null = null;

export function loadConfig(): Config {
  if (cache) return cache;
  const path = configPath();

  if (!existsSync(path)) {
    cache = defaults();
    saveConfig(cache);
    return cache;
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    cache = configSchema.parse(migrate(raw));
  } catch (err) {
    log.error({ code: 'config.load_failed', error: String(err) });
    // Пошкоджений конфіг не має блокувати запуск: зберігаємо копію і стартуємо з типового.
    try {
      renameSync(path, `${path}.broken-${Date.now()}`);
    } catch {
      /* ignore */
    }
    cache = defaults();
  }
  return cache;
}

export function saveConfig(next: Config): void {
  cache = next;
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  // Запис через тимчасовий файл: обрив живлення не залишає обрізаного JSON.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  renameSync(tmp, path);
}

export function updateConfig(patch: (c: Config) => Config): Config {
  const next = patch(loadConfig());
  saveConfig(next);
  return next;
}
