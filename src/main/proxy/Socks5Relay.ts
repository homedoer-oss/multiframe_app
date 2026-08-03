import { createServer, connect, type Server, type Socket } from 'node:net';
import {
  ATYP_DOMAIN, AUTH_VER, ByteReader, CMD_CONNECT, METHOD_NOAUTH, METHOD_NONE_ACCEPTABLE,
  METHOD_USERPASS, REP_GENERAL_FAILURE, REP_HOST_UNREACHABLE, REP_OK, VER,
  encodeReply, readDestination, type Destination,
} from './socks5';

export interface UpstreamConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface RelayAddress {
  host: string;
  port: number;
}

/**
 * Ф-3.3 — локальний SOCKS5-relay з авторизацією до апстріму.
 *
 * Причина існування: Chromium НЕ підтримує автентифікацію SOCKS5
 * (RFC 1929, user/password). Це багаторічне обмеження рушія, а не
 * помилка Electron. Тому фрейму віддається адреса цього relay, який
 * приймає з'єднання без авторизації на 127.0.0.1 і пересилає їх
 * в апстрім із обліковими даними.
 *
 * Ф-3.10 — доменне ім'я передається в апстрім БЕЗ локального резолвінгу,
 * тобто DNS виконує проксі. Локальний резолвінг тут був би витоком.
 *
 * Ф-3.4 — relay є керованим компонентом: падіння апстріму не перетворюється
 * на пряме з'єднання, а завершує сесію помилкою.
 */
export class Socks5Relay {
  private server: Server | null = null;
  private address: RelayAddress | null = null;
  private failures = 0;

  constructor(
    private readonly upstream: UpstreamConfig,
    private readonly onFailure?: (error: Error) => void,
  ) {}

  get listenAddress(): RelayAddress | null {
    return this.address;
  }

  get failureCount(): number {
    return this.failures;
  }

  start(): Promise<RelayAddress> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => {
        void this.handleClient(socket).catch((err: unknown) => {
          this.failures++;
          this.onFailure?.(err instanceof Error ? err : new Error(String(err)));
          socket.destroy();
        });
      });

      server.on('error', reject);
      // Слухаємо тільки петлю: relay не має бути доступний ззовні машини.
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr === null || typeof addr === 'string') {
          reject(new Error('Не вдалося визначити порт relay'));
          return;
        }
        this.server = server;
        this.address = { host: '127.0.0.1', port: addr.port };
        resolve(this.address);
      });
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
    this.address = null;
  }

  private async handleClient(client: Socket): Promise<void> {
    client.setNoDelay(true);
    const reader = new ByteReader(client);

    // --- Вітання від Chromium: приймаємо лише "без авторизації" ---
    const [ver, nmethods] = await reader.read(2);
    if (ver !== VER) throw new Error(`Непідтримувана версія SOCKS: ${ver}`);
    const methods = await reader.read(nmethods as number);
    if (!methods.includes(METHOD_NOAUTH)) {
      client.write(Buffer.from([VER, METHOD_NONE_ACCEPTABLE]));
      throw new Error('Клієнт не пропонує метод без авторизації');
    }
    client.write(Buffer.from([VER, METHOD_NOAUTH]));

    // --- Запит клієнта ---
    const head = await reader.read(4);
    if (head[1] !== CMD_CONNECT) {
      client.write(encodeReply(REP_GENERAL_FAILURE));
      throw new Error(`Підтримується лише CONNECT, отримано ${head[1]}`);
    }
    const dest = await readDestination(reader, head[3] as number);

    // --- Своя сесія з апстрімом ---
    let upstreamSocket: Socket;
    try {
      upstreamSocket = await this.dialUpstream(dest);
    } catch (err) {
      client.write(encodeReply(REP_HOST_UNREACHABLE));
      throw err;
    }

    client.write(encodeReply(REP_OK));

    // Байти, що встигли надійти під час рукостискання, не губимо.
    reader.detach();
    const pendingFromClient = reader.leftover();
    if (pendingFromClient.length > 0) upstreamSocket.write(pendingFromClient);

    const teardown = (): void => {
      client.destroy();
      upstreamSocket.destroy();
    };
    client.on('error', teardown);
    upstreamSocket.on('error', teardown);

    client.pipe(upstreamSocket);
    upstreamSocket.pipe(client);
  }

  private dialUpstream(dest: Destination): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.upstream.host, port: this.upstream.port }, () => {
        void (async () => {
          const reader = new ByteReader(socket);
          try {
            const { username, password } = this.upstream;
            const wantsAuth = Boolean(username);

            socket.write(
              wantsAuth
                ? Buffer.from([VER, 0x02, METHOD_NOAUTH, METHOD_USERPASS])
                : Buffer.from([VER, 0x01, METHOD_NOAUTH]),
            );

            const choice = await reader.read(2);
            if (choice[0] !== VER) throw new Error('Апстрім відповів невідомою версією');

            if (choice[1] === METHOD_USERPASS) {
              if (!wantsAuth) throw new Error('Апстрім вимагає авторизації, а облікові дані не задані');
              const user = Buffer.from(username ?? '', 'utf8');
              const pass = Buffer.from(password ?? '', 'utf8');
              socket.write(
                Buffer.concat([
                  Buffer.from([AUTH_VER, user.length]), user,
                  Buffer.from([pass.length]), pass,
                ]),
              );
              const authReply = await reader.read(2);
              if (authReply[1] !== 0x00) throw new Error('Апстрім відхилив облікові дані SOCKS5');
            } else if (choice[1] !== METHOD_NOAUTH) {
              throw new Error(`Апстрім обрав непідтримуваний метод: ${choice[1]}`);
            }

            // Ф-3.10 — доменне ім'я йде в апстрім як є; локального DNS немає.
            socket.write(
              Buffer.concat([
                Buffer.from([VER, CMD_CONNECT, 0x00, dest.atyp]),
                dest.raw,
                (() => { const p = Buffer.alloc(2); p.writeUInt16BE(dest.port, 0); return p; })(),
              ]),
            );

            const reply = await reader.read(4);
            if (reply[1] !== REP_OK) throw new Error(`Апстрім відмовив, код ${reply[1]}`);
            await readDestination(reader, reply[3] as number); // споживаємо BND.*

            reader.detach();
            const early = reader.leftover();
            if (early.length > 0) socket.unshift(early);
            resolve(socket);
          } catch (err) {
            socket.destroy();
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        })();
      });

      socket.setNoDelay(true);
      socket.on('error', reject);
    });
  }
}

/** Тип адреси, який фрейм передає у proxyRules. */
export function relayProxyRule(address: RelayAddress): string {
  return `socks5://${address.host}:${address.port}`;
}

export { ATYP_DOMAIN };
