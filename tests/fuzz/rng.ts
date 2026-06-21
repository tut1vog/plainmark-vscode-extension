// Mulberry32 — a tiny, deterministic, 32-bit-state PRNG. Used by the fuzz
// suite for seed-reproducible doc + edit generation. Chosen over `seedrandom`
// to avoid a runtime dep; the property the fuzz suite needs is deterministic
// replay from a recorded seed, which mulberry32 delivers in ~5 LoC.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function range(rng: Rng, lo: number, hi_inclusive: number): number {
  return lo + Math.floor(rng() * (hi_inclusive - lo + 1));
}
