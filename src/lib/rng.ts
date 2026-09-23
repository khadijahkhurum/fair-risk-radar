// Seeded pseudo-random number generation (audit M2).
//
// Every draw in the engine previously came from Math.random(), so no run could
// be reproduced: an auditor handed a persisted assessment could not re-derive
// it, which is a basic model-validation failure (G4). These are two standard,
// public-domain constructions — xmur3 to turn a seed string into 32-bit state,
// sfc32 to generate from it. Nothing here is invented; the requirement is only
// that it is deterministic, fast, and has a long enough period for millions of
// draws.
//
// sfc32 has a period of at least 2^32 and passes PractRand — far beyond what
// 8,000 trials x a handful of draws needs. It is NOT cryptographically secure
// and must never be used for tokens; src/lib/password.ts handles those.

/** Hash a seed string into four 32-bit words of state. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** Small Fast Counter, 32-bit. Returns floats in [0, 1). */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export function createRng(seed: string): Rng {
  const h = xmur3(seed);
  const rng = sfc32(h(), h(), h(), h());
  // Discard the first few outputs: sfc32's early values correlate with the
  // seed before the state has mixed.
  for (let i = 0; i < 12; i++) rng();
  return rng;
}

/** A fresh seed for a run the caller did not pin. */
export function newSeed(): string {
  // Not security-sensitive — this only needs to be unlikely to repeat and
  // readable in an export footer.
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}
