// Мінімальний keccak-256 без залежностей — потрібен лише для перевірки EIP-55.
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808An, 0x8000000080008000n,
  0x000000000000808Bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008An, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000An,
  0x000000008000808Bn, 0x800000000000008Bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800An, 0x800000008000000An,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const R = [[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]];
const M = (1n << 64n) - 1n;
const rol = (x, n) => { const s = BigInt(n % 64); return ((x << s) | (x >> (64n - s))) & M; };

function keccakF(A) {
  for (let rnd = 0; rnd < 24; rnd++) {
    const C = [], D = [];
    for (let x = 0; x < 5; x++) C[x] = A[x][0] ^ A[x][1] ^ A[x][2] ^ A[x][3] ^ A[x][4];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rol(C[(x + 1) % 5], 1);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x][y] ^= D[x];
    const B = Array.from({ length: 5 }, () => new Array(5).fill(0n));
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y][(2 * x + 3 * y) % 5] = rol(A[x][y], R[x][y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x][y] = B[x][y] ^ (~B[(x + 1) % 5][y] & M & B[(x + 2) % 5][y]);
    A[0][0] ^= RC[rnd];
  }
  return A;
}

export function keccak256(bytes) {
  const rate = 136;
  const A = Array.from({ length: 5 }, () => new Array(5).fill(0n));
  const p = Array.from(bytes);
  p.push(0x01);
  while (p.length % rate !== 0) p.push(0x00);
  p[p.length - 1] ^= 0x80;

  for (let off = 0; off < p.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(p[off + i * 8 + b]);
      A[i % 5][Math.floor(i / 5)] ^= lane;
    }
    keccakF(A);
  }

  const out = [];
  for (let i = 0; i < 4; i++) {
    let lane = A[i % 5][Math.floor(i / 5)];
    for (let b = 0; b < 8; b++) { out.push(Number(lane & 0xffn)); lane >>= 8n; }
  }
  return Uint8Array.from(out.slice(0, 32));
}

export const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
