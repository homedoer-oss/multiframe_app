#!/usr/bin/env node
/**
 * Ф-13.21 — автоматична перевірка контрольних сум криптоадрес.
 *
 * Запускається в CI при кожній зміні. Помилка в одному символі адреси
 * означає безповоротну втрату донатів, тому це блокуючий тест, не попередження.
 *
 * Перевіряється:
 *   BTC     — контрольна сума bech32/bech32m + HRP mainnet
 *   ERC-20  — формат + контрольна сума EIP-55 (регістр)
 *   TRC-20  — base58check + версійний байт 0x41
 *   SOL     — base58 декодується рівно у 32 байти
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { keccak256, toHex } from './keccak256.mjs';

const CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

function checkBtc(addr) {
  if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) return 'змішаний регістр неприпустимий';
  const a = addr.toLowerCase();
  const pos = a.lastIndexOf('1');
  if (pos < 1 || pos + 7 > a.length || a.length > 90) return 'некоректна структура bech32';
  const hrp = a.slice(0, pos);
  const data = a.slice(pos + 1);
  if ([...data].some((c) => !CS.includes(c))) return 'недопустимий символ';
  const dv = [...data].map((c) => CS.indexOf(c));
  const expanded = [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31), dv);
  const pm = bech32Polymod(expanded);
  const enc = pm === 1 ? 'bech32' : pm === 0x2bc830a3 ? 'bech32m' : null;
  if (!enc) return 'НЕ ЗБІГАЄТЬСЯ контрольна сума bech32';
  if (hrp !== 'bc') return `HRP="${hrp}", очікувався "bc" (mainnet)`;
  const witver = dv[0];
  if (witver === 0 && enc !== 'bech32') return 'segwit v0 має кодуватися bech32';
  if (witver !== 0 && enc !== 'bech32m') return `segwit v${witver} має кодуватися bech32m`;
  return null;
}

function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error(`недопустимий символ base58: "${c}"`);
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  let pad = 0;
  while (pad < s.length && s[pad] === '1') pad++;
  return Uint8Array.from([...new Array(pad).fill(0), ...bytes]);
}

function checkTron(addr) {
  let raw;
  try { raw = b58decode(addr); } catch (e) { return e.message; }
  if (raw.length !== 25) return `довжина ${raw.length} байт, очікувалось 25`;
  if (raw[0] !== 0x41) return `версійний байт 0x${raw[0].toString(16)}, очікувався 0x41`;
  const body = Buffer.from(raw.slice(0, 21));
  const sum = createHash('sha256').update(createHash('sha256').update(body).digest()).digest();
  for (let i = 0; i < 4; i++) if (sum[i] !== raw[21 + i]) return 'НЕ ЗБІГАЄТЬСЯ контрольна сума base58check';
  return null;
}

function checkEth(addr) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return 'очікувався формат 0x + 40 hex-символів';
  const body = addr.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return 'адреса без EIP-55: регістр не захищає від друкарської помилки';
  const hash = toHex(keccak256(Buffer.from(body.toLowerCase(), 'utf8')));
  for (let i = 0; i < 40; i++) {
    const expected = parseInt(hash[i], 16) >= 8 ? body[i].toUpperCase() : body[i].toLowerCase();
    if (body[i] !== expected) return 'НЕ ЗБІГАЄТЬСЯ контрольна сума EIP-55 — ймовірна помилка в символі';
  }
  return null;
}

function checkSol(addr) {
  let raw;
  try { raw = b58decode(addr); } catch (e) { return e.message; }
  if (raw.length !== 32) return `декодовано ${raw.length} байт, очікувалось 32`;
  return null;
}

const CHECKERS = { BTC: checkBtc, 'ERC-20': checkEth, 'TRC-20': checkTron, SOL: checkSol };

// Читаємо константи як текст: скрипт не має залежати від збірки TypeScript.
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'src', 'shared', 'constants.ts'), 'utf8');

function extract(constName) {
  const block = source.split(`export const ${constName}`)[1]?.split('] as const')[0] ?? '';
  return [...block.matchAll(/network:\s*'([^']+)',\s*address:\s*'([^']+)'/g)].map((m) => ({
    network: m[1],
    address: m[2],
  }));
}

const groups = {
  'PROJECT_WALLETS (Ф-13.19)': extract('PROJECT_WALLETS'),
};

let failures = 0;
let total = 0;

for (const [label, entries] of Object.entries(groups)) {
  console.log(`\n${label}`);
  if (entries.length === 0) { console.error('  ПОМИЛКА: адрес не знайдено у constants.ts'); failures++; continue; }
  for (const { network, address } of entries) {
    total++;
    const checker = CHECKERS[network];
    if (!checker) { console.error(`  ✗ ${network}: невідома мережа`); failures++; continue; }
    const problem = checker(address);
    if (problem) { console.error(`  ✗ ${network.padEnd(7)} ${address}\n      ${problem}`); failures++; }
    else console.log(`  ✓ ${network.padEnd(7)} ${address}`);
  }
}

// Адреси мають бути однакові в коді, ТЗ і README (критерій приймання 41).
for (const file of ['ТЗ.md', 'README.md']) {
  const text = readFileSync(join(here, '..', file), 'utf8');
  for (const entries of Object.values(groups)) {
    for (const { address } of entries) {
      if (!text.includes(address)) { console.error(`\n✗ ${file}: відсутня адреса ${address}`); failures++; }
    }
  }
}

console.log(`\nПеревірено адрес: ${total}. Проблем: ${failures}.`);
process.exit(failures === 0 ? 0 : 1);
