/**
 * Константи та примітиви протоколу SOCKS5 (RFC 1928, RFC 1929).
 * Модуль свідомо не залежить від Electron — щоб relay можна було
 * тестувати звичайним Node без запуску застосунку.
 */
import type { Socket } from 'node:net';

export const VER = 0x05;
export const AUTH_VER = 0x01;

export const METHOD_NOAUTH = 0x00;
export const METHOD_USERPASS = 0x02;
export const METHOD_NONE_ACCEPTABLE = 0xff;

export const CMD_CONNECT = 0x01;

export const ATYP_IPV4 = 0x01;
export const ATYP_DOMAIN = 0x03;
export const ATYP_IPV6 = 0x04;

export const REP_OK = 0x00;
export const REP_GENERAL_FAILURE = 0x01;
export const REP_HOST_UNREACHABLE = 0x04;
export const REP_CMD_NOT_SUPPORTED = 0x07;

/** Буферизований читач: дозволяє чекати рівно N байтів з сокета. */
export class ByteReader {
  private buffer = Buffer.alloc(0);
  private pending: { n: number; resolve: (b: Buffer) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;

  private readonly onData = (chunk: Buffer): void => {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.settle();
  };
  private readonly onError = (err: Error): void => this.fail(err);
  private readonly onClose = (): void => this.fail(new Error("з'єднання закрито"));

  constructor(private readonly socket: Socket) {
    socket.on('data', this.onData);
    socket.on('error', this.onError);
    socket.on('close', this.onClose);
  }

  read(n: number): Promise<Buffer> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.pending = { n, resolve, reject };
      this.settle();
    });
  }

  private settle(): void {
    const p = this.pending;
    if (!p || this.buffer.length < p.n) return;
    this.pending = null;
    const out = this.buffer.subarray(0, p.n);
    this.buffer = this.buffer.subarray(p.n);
    p.resolve(out);
  }

  private fail(err: Error): void {
    this.failure = err;
    const p = this.pending;
    this.pending = null;
    p?.reject(err);
  }

  /** Байти, що вже надійшли, але не були спожиті рукостисканням. */
  leftover(): Buffer {
    const out = this.buffer;
    this.buffer = Buffer.alloc(0);
    return out;
  }

  detach(): void {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('close', this.onClose);
  }
}

export interface Destination {
  atyp: number;
  /** Для ATYP_DOMAIN — доменне ім'я в оригінальному вигляді. */
  host: string;
  port: number;
  /** Сирі байти адреси у форматі протоколу, придатні до пересилання без змін. */
  raw: Buffer;
}

/** Читає адресу призначення із запиту SOCKS5. */
export async function readDestination(reader: ByteReader, atyp: number): Promise<Destination> {
  if (atyp === ATYP_IPV4) {
    const addr = await reader.read(4);
    const port = (await reader.read(2)).readUInt16BE(0);
    return { atyp, host: Array.from(addr).join('.'), port, raw: addr };
  }
  if (atyp === ATYP_DOMAIN) {
    const len = (await reader.read(1))[0] as number;
    const addr = await reader.read(len);
    const port = (await reader.read(2)).readUInt16BE(0);
    return { atyp, host: addr.toString('utf8'), port, raw: Buffer.concat([Buffer.from([len]), addr]) };
  }
  if (atyp === ATYP_IPV6) {
    const addr = await reader.read(16);
    const port = (await reader.read(2)).readUInt16BE(0);
    const parts: string[] = [];
    for (let i = 0; i < 16; i += 2) parts.push(addr.readUInt16BE(i).toString(16));
    return { atyp, host: parts.join(':'), port, raw: addr };
  }
  throw new Error(`Непідтримуваний ATYP: ${atyp}`);
}

export function encodeReply(rep: number): Buffer {
  // BND.ADDR/BND.PORT нулями: клієнти Chromium їх не використовують.
  return Buffer.from([VER, rep, 0x00, ATYP_IPV4, 0, 0, 0, 0, 0, 0]);
}
