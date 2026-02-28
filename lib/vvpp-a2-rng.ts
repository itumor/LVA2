export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }

  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DeterministicRng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed >>> 0);
  }

  float(): number {
    return this.next();
  }

  int(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error("RNG bounds must be finite numbers.");
    }
    if (max < min) {
      throw new Error(`Invalid RNG range: min=${min}, max=${max}`);
    }

    const span = max - min + 1;
    return min + Math.floor(this.float() * span);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array.");
    }

    return items[this.int(0, items.length - 1)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];

    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
  }
}

export function deriveTaskSeed(params: {
  seed: number;
  examIndex: number;
  officialOrder: number;
  retryIndex?: number;
}): number {
  const { seed, examIndex, officialOrder, retryIndex = 0 } = params;
  const base = fnv1a32(`${seed}:exam:${examIndex}:task:${officialOrder}`);
  return (base + retryIndex) >>> 0;
}
