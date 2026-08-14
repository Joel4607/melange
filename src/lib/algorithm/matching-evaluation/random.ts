export interface SeededRandom {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(values: readonly T[]): T;
  normal(mean?: number, standardDeviation?: number): number;
}

export function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  let spareNormal: number | null = null;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  }

  return {
    next,
    int(minInclusive, maxInclusive) {
      return Math.floor(next() * (maxInclusive - minInclusive + 1)) + minInclusive;
    },
    pick<T>(values: readonly T[]): T {
      return values[Math.floor(next() * values.length)];
    },
    normal(mean = 0, standardDeviation = 1) {
      if (spareNormal !== null) {
        const result = spareNormal;
        spareNormal = null;
        return mean + result * standardDeviation;
      }
      const u = Math.max(Number.EPSILON, next());
      const v = next();
      const magnitude = Math.sqrt(-2 * Math.log(u));
      const first = magnitude * Math.cos(2 * Math.PI * v);
      spareNormal = magnitude * Math.sin(2 * Math.PI * v);
      return mean + first * standardDeviation;
    },
  };
}
