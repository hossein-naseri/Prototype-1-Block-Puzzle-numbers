// Seeded PRNG (mulberry32). Same seed -> same sequence, always.
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
    this.callCount = 0;
  }

  float() {
    this.callCount++;
    return this._next();
  }

  int(maxExclusive) {
    return Math.floor(this.float() * maxExclusive);
  }

  pick(array) {
    return array[this.int(array.length)];
  }

  // Weighted pick from { key: weight } map.
  weighted(weightMap) {
    const entries = Object.entries(weightMap);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.float() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }
}

export function seedFromString(str) {
  if (/^-?\d+$/.test(str)) return Number(str) >>> 0;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
