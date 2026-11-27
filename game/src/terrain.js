// terrain.js — seeded steppe heightfield, water, towns, runway geometry and
// distance queries. Deterministic for a given seed, so screenshots repeat.

import { DEG, RUNWAY, LAKE, TOWNS, VIEW } from './config.js';
import { clamp } from './mathx.js';

/** Small deterministic string/number hash → unsigned 32-bit seed. */
export function hashSeed(value) {
  let h = 2166136261;
  const s = String(value);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG. */
export function rng(seed) {
  let a = hashSeed(seed);
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = x - xi, ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

export class Terrain {
  constructor(seed = 1) {
    this.seed = hashSeed(seed);
    this.peaks = [];
    const random = rng(`mountains:${seed}`);
    // A distant skyline ridge; positions are in world coordinates far out.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + random() * 0.12;
      const dist = 9800 + random() * 3400;
      this.peaks.push({
        x: Math.sin(a) * dist,
        y: Math.cos(a) * dist,
        h: 900 + random() * 2600,
        w: 1400 + random() * 1800,
      });
    }
  }

  /** Raw height in feet at a world point. */
  height(x, y) {
    const s = this.seed;
    const rolling = (valueNoise(x / 4000, y / 4000, s) - 0.5) * 360;
    const dunes = (valueNoise(x / 1450, y / 1450, s ^ 0x5f3a) - 0.5) * 112;
    const grit = (valueNoise(x / 460, y / 460, s ^ 0x9e21) - 0.5) * 24;
    // The valley around the airfield is flat enough to land on.
    const d = Math.hypot(x, y);
    const basin = clamp((d - 900) / 2600, 0, 1);
    // A mountain ramp in the northeast gives the ring run a valley to fly.
    const ridge = Math.max(0, (x * 0.48 + y * 0.88 - 3600) / 6200);
    let h = (rolling + dunes + grit) * basin + ridge * ridge * 820;
    if (LAKE && Math.hypot(x - LAKE.x, y - LAKE.y) < LAKE.r) h = Math.min(h, LAKE.z - 30);
    return h;
  }

  /** Height clamped to the runway plane near the airfield. */
  surface(x, y) {
    const dx = x - RUNWAY.cx, dy = y - RUNWAY.cy;
    const along = -dx * Math.sin(RUNWAY.heading * DEG) + dy * Math.cos(RUNWAY.heading * DEG);
    const across = dx * Math.cos(RUNWAY.heading * DEG) + dy * Math.sin(RUNWAY.heading * DEG);
    if (Math.abs(along) < RUNWAY.length * 0.5 + 260 && Math.abs(across) < RUNWAY.width * 0.5 + 190) return 0;
    return this.height(x, y);
  }

  isRunway(x, y) {
    const dx = x - RUNWAY.cx, dy = y - RUNWAY.cy;
    const along = -dx * Math.sin(RUNWAY.heading * DEG) + dy * Math.cos(RUNWAY.heading * DEG);
    const across = dx * Math.cos(RUNWAY.heading * DEG) + dy * Math.sin(RUNWAY.heading * DEG);
    return Math.abs(along) <= RUNWAY.length * 0.5 && Math.abs(across) <= RUNWAY.width * 0.5;
  }

  runwayLocal(x, y) {
    const dx = x - RUNWAY.cx, dy = y - RUNWAY.cy;
    return {
      along: -dx * Math.sin(RUNWAY.heading * DEG) + dy * Math.cos(RUNWAY.heading * DEG),
      across: dx * Math.cos(RUNWAY.heading * DEG) + dy * Math.sin(RUNWAY.heading * DEG),
    };
  }

  /** Flat-shaded ground class for a sampled point, used by render.js. */
  groundColor(x, y, z) {
    if (Math.hypot(x - LAKE.x, y - LAKE.y) < LAKE.r) return z < LAKE.z + 2 ? 'water' : 'waterLight';
    for (const t of TOWNS) if (Math.hypot(x - t.x, y - t.y) < t.r) return 'rock';
    if (z > 620) return 'high';
    if (z > 340) return 'rock';
    if (z < 20) return 'sandLow';
    const patch = valueNoise(x / 900, y / 900, this.seed ^ 0x77aa);
    return patch > 0.62 ? 'olive' : patch < 0.31 ? 'ochre' : 'sand';
  }
}

/** Terrain grid cells around a centre position, in world space. */
export function gridAround(cx, cy) {
  const n = VIEW.cells;
  const step = VIEW.cell;
  const ox = Math.round(cx / step) * step;
  const oy = Math.round(cy / step) * step;
  const cells = [];
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      cells.push({ i, j, x: ox + i * step, y: oy + j * step });
    }
  }
  return cells;
}
