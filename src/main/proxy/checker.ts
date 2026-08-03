import { connect, type Socket } from 'node:net';
import type { AnonymityLevel, ProxyConfig } from '@shared/types';
import { ByteReader, CMD_CONNECT, METHOD_NOAUTH, METHOD_USERPASS, AUTH_VER, REP_OK, VER, readDestination } from './socks5';

export interface ProbeOptions {
  timeoutMs: number;
  /** Сервіс, що повертає IP клієнта та отримані заголовки у вигляді тексту. */
  echoHost: string;
  echoPath: string;
}

export const DEFAULT_PROBE: ProbeOptions = {
  timeoutMs: 10_000, // Ф-10.11 крок 4 — таймаут перевірки
  echoHost: 'httpbin.org',
  echoPath: '/get',
};

export interface ProbeResult {
  ok: boolean;
  error?: string;
  latencyMs?: number;
  body?: string;
}

/**
 * Ф-10.11 — конвеєр перевірки. Кожен наступний крок застосовується лише
 * до тих проксі, що пройшли попередній.
 *
 * ⚠️ Перевірка виконується ЧЕРЕЗ ЗВИЧАЙНИЙ HTTP, не HTTPS, і це навмисно:
 *    визначити рівень анонімності (крок 5) можна лише у відкритому трафіку.
 *    Крізь TLS-тунель проксі фізично не здатен додати заголовки, тому
 *    прозорий проксі виглядав би як елітний.
 */
export async function probe(config: ProxyConfig, opts: ProbeOptions = DEFAULT_PROBE): Promise<ProbeResult> {
  const started = Date.now();
  let socket: Socket | null = null;

  try {
    socket = await withTimeout(dial(config, opts), opts.timeoutMs, 'таймаут з’єднання з проксі');

    const request =
      config.mode === 'socks5'
        ? `GET ${opts.echoPath} HTTP/1.1\r\nHost: ${opts.echoHost}\r\nConnection: close\r\n\r\n`
        : // HTTP-проксі отримує абсолютну форму запиту
          `GET http://${opts.echoHost}${opts.echoPath} HTTP/1.1\r\nHost: ${opts.echoHost}\r\nConnection: close\r\n\r\n`;

    socket.write(request);
    const body = await withTimeout(readAll(socket), opts.timeoutMs, 'таймаут відповіді');
    return { ok: true, latencyMs: Date.now() - started, body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    socket?.destroy();
  }
}

function dial(config: ProxyConfig, opts: ProbeOptions): Promise<Socket> {
  return config.mode === 'socks5' ? dialSocks5(config, opts) : dialTcp(config.host, config.port);
}

function dialTcp(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port }, () => resolve(socket));
    socket.setNoDelay(true);
    socket.on('error', reject);
  });
}

async function dialSocks5(config: ProxyConfig, opts: ProbeOptions): Promise<Socket> {
  const socket = await dialTcp(config.host, config.port);
  const reader = new ByteReader(socket);

  const wantsAuth = Boolean(config.username);
  socket.write(
    wantsAuth
      ? Buffer.from([VER, 0x02, METHOD_NOAUTH, METHOD_USERPASS])
      : Buffer.from([VER, 0x01, METHOD_NOAUTH]),
  );

  const choice = await reader.read(2);
  if (choice[1] === METHOD_USERPASS) {
    const user = Buffer.from(config.username ?? '', 'utf8');
    const pass = Buffer.from(process.env.MF_PROBE_PASSWORD ?? '', 'utf8');
    socket.write(Buffer.concat([Buffer.from([AUTH_VER, user.length]), user, Buffer.from([pass.length]), pass]));
    const reply = await reader.read(2);
    if (reply[1] !== 0x00) throw new Error('проксі відхилив облікові дані');
  }

  const host = Buffer.from(opts.echoHost, 'utf8');
  const port = Buffer.alloc(2);
  port.writeUInt16BE(80, 0);
  socket.write(Buffer.concat([Buffer.from([VER, CMD_CONNECT, 0x00, 0x03, host.length]), host, port]));

  const reply = await reader.read(4);
  if (reply[1] !== REP_OK) throw new Error(`проксі відмовив, код ${reply[1]}`);
  await readDestination(reader, reply[3] as number);

  reader.detach();
  return socket;
}

function readAll(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '';
    socket.on('data', (d) => { out += d.toString('utf8'); });
    socket.on('end', () => resolve(out));
    socket.on('error', reject);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/** Заголовки, наявність яких видає реальну адресу клієнта. */
const LEAK_HEADERS = ['x-forwarded-for', 'x-real-ip', 'x-client-ip', 'forwarded', 'via', 'proxy-connection'];

/**
 * Ф-10.11 крок 5 / Ф-10.12 — визначення рівня анонімності.
 *
 * transparent — проксі додав заголовок з реальною адресою клієнта.
 *               Такі проксі відхиляються беззастережно: вони дають
 *               результат ГІРШИЙ за повну відсутність проксі, бо
 *               створюють хибне відчуття захищеності.
 * anonymous   — заголовки проксі присутні, реальної адреси немає.
 * elite       — жодних слідів проксі.
 */
export function detectAnonymity(body: string, realIp: string | null): AnonymityLevel {
  const lower = body.toLowerCase();
  if (realIp && lower.includes(realIp.toLowerCase())) return 'transparent';

  const found = LEAK_HEADERS.filter((h) => lower.includes(`"${h}"`) || lower.includes(`${h}:`));
  if (found.some((h) => h === 'x-forwarded-for' || h === 'x-real-ip' || h === 'x-client-ip')) return 'transparent';
  if (found.length > 0) return 'anonymous';
  return 'elite';
}

/** Витягує exit-IP із відповіді ip-echo сервісу. */
export function extractExitIp(body: string): string | null {
  const match = body.match(/"origin"\s*:\s*"([0-9a-fA-F.:]+)/) ?? body.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  return match?.[1] ?? null;
}
