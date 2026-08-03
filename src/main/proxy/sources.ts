/**
 * Ф-10.6 — перелік джерел зберігається в конфігурації, оновлюваній без
 * перезбирання застосунку. Джерела зникають і змінюють формат постійно;
 * випуск релізу заради оновлення списку неприйнятний.
 *
 * Ф-10.7 — пріоритет джерелам зі стабільним текстовим форматом
 * над розбором HTML-сторінок.
 *
 * Ф-10.10 — використання джерел має відповідати умовам їх надання;
 * кожен запис супроводжується посиланням на ці умови.
 */
export interface ProxySource {
  id: string;
  /** Формат `host:port` по рядку — найстійкіший до змін. */
  url: string;
  mode: 'https' | 'socks5';
  termsUrl: string;
  enabled: boolean;
  /** Ф-10.8 — власний таймаут; недоступність не блокує решту джерел. */
  timeoutMs: number;
}

/**
 * Заготовка. Конкретні джерела заповнюються при реалізації вкладки —
 * до того часу перелік порожній, і вкладка чесно показує, що джерел немає.
 *
 * ⚠️ Ф-10.9 — запити до джерел і перевірка проксі виконуються З ПРЯМОГО
 *    З'ЄДНАННЯ КОРИСТУВАЧА. Це має бути явно сказано в інтерфейсі вкладки:
 *    трафік іде з його реальної IP-адреси.
 */
export const DEFAULT_SOURCES: ProxySource[] = [];

/** Ф-10.13 — стеля одночасних з'єднань. Без неї масова перевірка виглядає
 *  для обладнання провайдера як сканування портів. */
export const DEFAULT_CONCURRENCY = 64;

export function parseProxyList(text: string, mode: 'https' | 'socks5'): { host: string; port: number; mode: 'https' | 'socks5' }[] {
  const out: { host: string; port: number; mode: 'https' | 'socks5' }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9.-]+):(\d{1,5})\b/i);
    if (!match) continue;
    const port = Number(match[2]);
    if (port > 0 && port <= 65535) out.push({ host: match[1] as string, port, mode });
  }
  return out;
}
