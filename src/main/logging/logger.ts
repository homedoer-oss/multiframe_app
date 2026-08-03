import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * Ф-7.3 / Ф-8.20 — журнал зберігається з нелокалізованими кодами подій.
 * Локалізується лише відображення, тому експортовані логи придатні
 * для підтримки незалежно від мови користувача.
 */
export interface LogEvent {
  code: string;
  profileId?: string;
  [key: string]: unknown;
}

let logPath: string | null = null;

function target(): string {
  if (!logPath) {
    const dir = join(app.getPath('userData'), 'logs');
    mkdirSync(dir, { recursive: true });
    logPath = join(dir, `${new Date().toISOString().slice(0, 10)}.log`);
  }
  return logPath;
}

function write(level: Level, event: LogEvent): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...event });
  if (!app.isPackaged) console[level === 'debug' ? 'log' : level](line);
  try {
    appendFileSync(target(), line + '\n', 'utf8');
  } catch {
    /* журнал не повинен ламати застосунок */
  }
}

export const log = {
  debug: (e: LogEvent) => write('debug', e),
  info: (e: LogEvent) => write('info', e),
  warn: (e: LogEvent) => write('warn', e),
  error: (e: LogEvent) => write('error', e),
};
