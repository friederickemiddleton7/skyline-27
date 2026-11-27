// mathx.js — scalar helpers, vectors, headings and a pinhole projection.
// World axes: x east, y north, z up. Heading is degrees clockwise from north.

import { DEG, VIEW } from './config.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
export const wrap360 = (a) => ((a % 360) + 360) % 360;
export const angleDelta = (to, from) => {
  let d = wrap360(to) - wrap360(from);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a) => Math.hypot(a.x, a.y, a.z);
export const normalise = (a) => {
  const n = length(a) || 1;
  return v3(a.x / n, a.y / n, a.z / n);
};

/** Forward unit vector for a heading/pitch pair, in world axes. */
export function forwardVec(hdg, pitch) {
  const h = hdg * DEG, p = pitch * DEG;
  return v3(Math.sin(h) * Math.cos(p), Math.cos(h) * Math.cos(p), Math.sin(p));
}
export function rightVec(hdg) {
  const h = hdg * DEG;
  return v3(Math.cos(h), -Math.sin(h), 0);
}

/**
 * A camera with a stable basis: right, up, forward. Projecting is just a dot
 * product against each; keeping the basis tied to heading (not to bank) is
 * what stops the horizon from fighting the pilot when the aircraft rolls.
 */
export class Camera {
  constructor() {
    this.pos = v3();
    this.target = v3();
    this.hdg = 0;
    this.pitch = 0;
    this.roll = 0;
    this.right = v3(1, 0, 0);
    this.up = v3(0, 0, 1);
    this.fwd = v3(0, 1, 0);
    this.width = 1280;
    this.height = 720;
    this.updateBasis();
  }

  updateBasis() {
    this.fwd = forwardVec(this.hdg, this.pitch);
    const flatRight = rightVec(this.hdg);
    // Bank rotates the camera's right vector about the forward axis. Limited
    // to 28% so the horizon tilts for feel but never fights the pilot.
    const r = this.roll * DEG * 0.28;
    const flatUp = v3(
      -Math.sin(this.hdg * DEG) * Math.sin(this.pitch * DEG),
      -Math.cos(this.hdg * DEG) * Math.sin(this.pitch * DEG),
      Math.cos(this.pitch * DEG),
    );
    const rightRaw = add(mul(flatRight, Math.cos(r)), mul(flatUp, Math.sin(r)));
    this.up = normalise(cross(rightRaw, this.fwd));
    this.right = normalise(cross(this.fwd, this.up));
  }

  set(pos, hdg, pitch, roll, width, height) {
    this.pos = pos;
    this.hdg = hdg;
    this.pitch = pitch;
    this.roll = roll;
    this.width = width;
    this.height = height;
    this.updateBasis();
  }

  /** Returns { x, y, d, visible } in CSS pixels, or null when behind the camera. */
  project(p) {
    const d = sub(p, this.pos);
    const z = dot(d, this.fwd);
    if (z < VIEW.near) return null;
    const f = (this.height * 0.5) / Math.tan(VIEW.fov * 0.5);
    return {
      x: this.width * 0.5 + (dot(d, this.right) * f) / z,
      y: this.height * 0.5 - (dot(d, this.up) * f) / z,
      d: z,
      visible: true,
    };
  }

  /** Screen distance corresponding to one world unit at depth d. */
  scale(d) {
    return (this.height * 0.5) / (Math.tan(VIEW.fov * 0.5) * d);
  }
}
