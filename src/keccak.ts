/**
 * Minimal pure-JS Keccak-256 (Keccak-f[1600], 256-bit output).
 * Small, dependency-free implementation for EIP-55 checksums.
 */

const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const RHO: number[] = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const PI: number[] = [
  0, 10, 20, 5, 15,
  16, 1, 11, 21, 6,
  7, 17, 2, 12, 22,
  23, 8, 18, 3, 13,
  14, 24, 9, 19, 4,
];

const MASK = 0xffffffffffffffffn;

function rol(x: bigint, n: number): bigint {
  const r = BigInt(n % 64);
  return ((x << r) | (x >> (64n - r))) & MASK;
}

function round(A: bigint[], rc: bigint): void {
  const C = new Array<bigint>(5).fill(0n);
  const D = new Array<bigint>(5).fill(0n);
  const B = new Array<bigint>(25).fill(0n);

  for (let x = 0; x < 5; x++) {
    C[x] = A[x]! ^ A[x + 5]! ^ A[x + 10]! ^ A[x + 15]! ^ A[x + 20]!;
  }
  for (let x = 0; x < 5; x++) {
    D[x] = C[(x + 4) % 5]! ^ rol(C[(x + 1) % 5]!, 1);
  }
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      A[x + 5 * y] = A[x + 5 * y]! ^ D[x]!;
    }
  }

  for (let i = 0; i < 25; i++) {
    B[i] = A[PI[i]!]!;
  }
  for (let i = 0; i < 25; i++) {
    const y = Math.floor(i / 5);
    const x = i % 5;
    A[i] = rol(B[i]!, RHO[i]!) ^ ((~B[(x + 1) % 5 + 5 * y]!) & B[(x + 2) % 5 + 5 * y]!);
  }

  A[0] = A[0]! ^ rc;
}

function keccakF(state: bigint[]): void {
  for (let r = 0; r < 24; r++) {
    round(state, RC[r]!);
  }
}

/** Keccak-256 over utf-8 string. Returns lowercase hex digest. */
export function keccak_256(input: string): string {
  const rate = 136; // 1088 bits / 8
  const data = new TextEncoder().encode(input);
  const padded: number[] = [];
  for (const b of data) padded.push(b);
  padded.push(0x01); // Keccak padding (not SHA3's 0x06)
  while (padded.length % rate !== rate - 1) padded.push(0x00);
  padded.push(0x80);

  const state = new Array<bigint>(25).fill(0n);
  const blockCount = padded.length / rate;

  for (let blk = 0; blk < blockCount; blk++) {
    for (let i = 0; i < rate / 8; i++) {
      const off = blk * rate + i * 8;
      let lane = 0n;
      for (let b = 7; b >= 0; b--) {
        lane = (lane << 8n) | BigInt(padded[off + b]!);
      }
      state[i] = state[i]! ^ lane;
    }
    keccakF(state);
  }

  let out = "";
  for (let i = 0; i < 4; i++) {
    const lane = state[i]!;
    for (let b = 0; b < 8; b++) {
      out += ((lane >> BigInt(8 * b)) & 0xffn).toString(16).padStart(2, "0");
    }
  }
  return out;
}
