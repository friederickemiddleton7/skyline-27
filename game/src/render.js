// render.js — all canvas drawing: sky, stepped terrain, airfield, rings,
// aircraft geometry, cockpit furniture and effects. Flat-shaded palette only.

import { PALETTE, VIEW, DEG, RUNWAY, LAKE, TOWNS, PLANE } from './config.js';
import { clamp, lerp, v3, add, mul, forwardVec, rightVec, normalise, cross } from './mathx.js';
import { gridAround } from './terrain.js';

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const C = Object.fromEntries(Object.entries(PALETTE).filter(([, v]) => typeof v === 'string' && v.startsWith('#')).map(([k, v]) => [k, rgb(v)]));
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function poly(ctx, pts, fill, stroke = null) {
  if (pts.length < 3 || pts.some((p) => !p)) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function line(ctx, a, b, color, w = 1) {
  if (!a || !b) return;
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

// ----------------------------------------------------------------- sky

export function drawSky(ctx, cam, W, H, t) {
  const f = (H * 0.5) / Math.tan(VIEW.fov * 0.5);
  const horizon = H / 2 + Math.tan(cam.pitch * DEG) * f;
  const grad = ctx.createLinearGradient(0, Math.min(0, horizon - H * 1.5), 0, horizon);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.54, PALETTE.skyMid);
  grad.addColorStop(0.94, PALETTE.skyHaze);
  grad.addColorStop(1, PALETTE.groundHaze);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Haze band sits exactly on the geometric horizon band.
  const band = ctx.createLinearGradient(0, horizon - 46, 0, horizon + 54);
  band.addColorStop(0, 'rgba(222,207,169,0)');
  band.addColorStop(0.46, 'rgba(226,208,166,0.56)');
  band.addColorStop(1, 'rgba(180,167,130,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, horizon - 46, W, 100);

  // Soft sun disc, drifting with heading so the world feels directional.
  const sunRel = ((120 - cam.hdg + 540) % 360) - 180;
  if (Math.abs(sunRel) < 80) {
    const sx = W / 2 + sunRel * 6.5;
    const sy = horizon - 150;
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 160);
    glow.addColorStop(0, 'rgba(255,224,160,0.66)');
    glow.addColorStop(1, 'rgba(255,224,160,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 165, sy - 165, 330, 330);
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath(); ctx.arc(sx, sy, 17, 0, Math.PI * 2); ctx.fill();
  }
  return horizon;
}

export function drawMountains(ctx, terrain, cam, W, H) {
  const list = [];
  for (const p of terrain.peaks) {
    const apex = cam.project(v3(p.x, p.y, p.h));
    const left = cam.project(v3(p.x - p.w, p.y, 0));
    const right = cam.project(v3(p.x + p.w, p.y, 0));
    if (!apex || !left || !right) continue;
    list.push({ p, apex, left, right, d: apex.d });
  }
  list.sort((a, b) => b.d - a.d);
  for (const m of list) {
    const haze = clamp((m.d - 9000) / 7000, 0, 0.62);
    const far = mix(C.mountainNear, C.mountainFar, haze);
    const near = mix(far, C.groundHaze, 0.18);
    poly(ctx, [m.left, m.apex, m.right], css(far));
    poly(ctx, [m.left, m.apex, { x: (m.left.x + m.right.x) / 2, y: m.apex.y + (m.left.y - m.apex.y) * 0.24 }], css(near));
    poly(ctx, [{ x: (m.left.x + m.right.x) / 2, y: m.apex.y + (m.left.y - m.apex.y) * 0.24 }, m.apex, m.right], css(mix(far, [30, 40, 48], 0.18)));
  }
}

// ----------------------------------------------------------------- terrain

export function drawTerrain(ctx, terrain, cam, W, H) {
  const cells = gridAround(cam.pos.x, cam.pos.y);
  const projected = [];
  for (const c of cells) {
    const x = c.x, y = c.y;
    const sx = x + VIEW.cell, sy = y + VIEW.cell;
    const corners = [
      cam.project(v3(x, y, terrain.height(x, y))),
      cam.project(v3(sx, y, terrain.height(sx, y))),
      cam.project(v3(sx, sy, terrain.height(sx, sy))),
      cam.project(v3(x, sy, terrain.height(x, sy))),
    ];
    if (corners.some((p) => !p)) continue;
    if (corners.every((p) => p.x < -90 || p.x > W + 90)) continue;
    const d = (corners[0].d + corners[1].d + corners[2].d + corners[3].d) / 4;
    projected.push({ corners, d, x: x + VIEW.cell / 2, y: y + VIEW.cell / 2, z: terrain.height(x + VIEW.cell / 2, y + VIEW.cell / 2) });
  }
  projected.sort((a, b) => b.d - a.d);
  for (const cell of projected) {
    const key = terrain.groundColor(cell.x, cell.y, cell.z);
    let col = C[key] ?? C.sand;
    // Simple directional shading from the height gradient.
    const hx = terrain.height(cell.x + 90, cell.y) - terrain.height(cell.x - 90, cell.y);
    const hy = terrain.height(cell.x, cell.y + 90) - terrain.height(cell.x, cell.y - 90);
    const shade = clamp(0.5 + (-hx * 0.0015 - hy * 0.0011), 0.28, 0.94);
    col = mix(col.map((v) => v * (0.62 + shade * 0.62)), C.groundHaze, clamp(cell.d / 11500, 0, 0.72));
    poly(ctx, cell.corners, css(col));
  }
}

export function drawGroundPatches(ctx, terrain, cam) {
  // Lake: a flat oval at fixed elevation with a lighter rim.
  const lakePoly = [];
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2;
    const p = cam.project(v3(LAKE.x + Math.cos(a) * LAKE.r, LAKE.y + Math.sin(a) * LAKE.r * 0.72, LAKE.z));
    if (!p) { lakePoly.length = 0; break; }
    lakePoly.push(p);
  }
  poly(ctx, lakePoly, css(C.water), css(C.waterLight));
  if (lakePoly.length) {
    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.strokeStyle = PALETTE.waterLight;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const yOff = (i - 2) * 6;
      ctx.beginPath();
      for (const p of lakePoly) ctx.lineTo(p.x, p.y + yOff);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Towns: clusters of small flat roofs, no sprites or images.
  for (const town of TOWNS) {
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39996;
      const r = town.r * Math.sqrt((i + 0.5) / 13);
      const x = town.x + Math.cos(a) * r, y = town.y + Math.sin(a) * r;
      const z = terrain.height(x, y);
      const w = 48 + (i % 3) * 20;
      const corners = [
        cam.project(v3(x - w, y - w * 0.6, z + 10)),
        cam.project(v3(x + w, y - w * 0.6, z + 10)),
        cam.project(v3(x + w, y + w * 0.6, z + 10)),
        cam.project(v3(x - w, y + w * 0.6, z + 10)),
      ];
      poly(ctx, corners, css(i % 4 === 0 ? C.metal : C.rock), 'rgba(40,45,44,0.35)');
    }
  }
}

// ----------------------------------------------------------------- airfield

function runwayPoints(cam, along, across, z = 1) {
  const h = RUNWAY.heading * DEG;
  const fx = Math.sin(h), fy = Math.cos(h);
  const rx = Math.cos(h), ry = -Math.sin(h);
  return cam.project(v3(fx * along + rx * across, fy * along + ry * across, z));
}

export function drawAirfield(ctx, terrain, cam, W, H) {
  const halfL = RUNWAY.length / 2, halfW = RUNWAY.width / 2;
  const body = [runwayPoints(cam, -halfL, -halfW), runwayPoints(cam, halfL, -halfW), runwayPoints(cam, halfL, halfW), runwayPoints(cam, -halfL, halfW)];
  poly(ctx, body, css(C.asphalt), css(C.asphaltEdge));
  if (!body[0]) return;

  // Edge stripes and centreline dashes.
  for (const s of [-1, 1]) line(ctx, runwayPoints(cam, -halfL + 120, s * (halfW - 12)), runwayPoints(cam, halfL - 120, s * (halfW - 12)), PALETTE.paint, 1.6);
  for (let a = -halfL + 420; a < halfL - 320; a += 380) {
    line(ctx, runwayPoints(cam, a, -5), runwayPoints(cam, a + 190, -5), PALETTE.paint, 2.2);
  }
  // Thresholds at both ends: eight bars and big numerals.
  for (const end of [-1, 1]) {
    const base = end * (halfL - 210);
    for (let i = -3; i <= 3; i++) {
      const across = i * 20;
      line(ctx, runwayPoints(cam, base, across - 6), runwayPoints(cam, base + end * 130, across - 6), PALETTE.paint, 2.4);
      line(ctx, runwayPoints(cam, base, across + 6), runwayPoints(cam, base + end * 130, across + 6), PALETTE.paint, 2.4);
    }
    const numPos = cam.project(v3(
      Math.sin(RUNWAY.heading * DEG) * (end * (halfL - 460)),
      Math.cos(RUNWAY.heading * DEG) * (end * (halfL - 460)), 2,
    ));
    if (numPos) {
      const size = clamp(cam.scale(numPos.d) * 90, 6, 150);
      ctx.save();
      ctx.translate(numPos.x, numPos.y);
      ctx.rotate(-cam.roll * DEG * 0.2);
      ctx.fillStyle = PALETTE.paint;
      ctx.font = `700 ${size}px Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(end === 1 ? '09' : '27', 0, 0);
      ctx.restore();
    }
  }

  drawBox(ctx, cam, RUNWAY.tower.x, RUNWAY.tower.y, 58, 58, RUNWAY.tower.h, C.metal, C.asphaltEdge);
  drawBox(ctx, cam, RUNWAY.tower.x, RUNWAY.tower.y, 86, 86, RUNWAY.tower.h + 34, C.metal, PALETTE.paint, RUNWAY.tower.h - 4);
  const beacon = cam.project(v3(RUNWAY.tower.x, RUNWAY.tower.y, RUNWAY.tower.h + 62));
  if (beacon) {
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath(); ctx.arc(beacon.x, beacon.y, clamp(cam.scale(beacon.d) * 12, 1, 7), 0, Math.PI * 2); ctx.fill();
  }
  for (const h of RUNWAY.hangars) {
    drawBox(ctx, cam, h.x, h.y, h.w, h.d, h.h, C.rock, C.sandLow);
  }
}

/** Axis-aligned box with three shaded faces, in world coordinates. */
function drawBox(ctx, cam, x, y, w, d, h, base, edge, z0 = null) {
  const z = z0 ?? terrainHeightSafe(x, y);
  const top = z + h;
  const corners = [
    cam.project(v3(x - w / 2, y - d / 2, z)), cam.project(v3(x + w / 2, y - d / 2, z)),
    cam.project(v3(x + w / 2, y + d / 2, z)), cam.project(v3(x - w / 2, y + d / 2, z)),
    cam.project(v3(x - w / 2, y - d / 2, top)), cam.project(v3(x + w / 2, y - d / 2, top)),
    cam.project(v3(x + w / 2, y + d / 2, top)), cam.project(v3(x - w / 2, y + d / 2, top)),
  ];
  if (corners.some((p) => !p)) return;
  poly(ctx, [corners[0], corners[1], corners[5], corners[4]], css(mix(base, [0, 0, 0], 0.12)), css(edge));
  poly(ctx, [corners[1], corners[2], corners[6], corners[5]], css(base), css(edge));
  poly(ctx, [corners[2], corners[3], corners[7], corners[6]], css(mix(base, [0, 0, 0], 0.25)), css(edge));
  poly(ctx, [corners[4], corners[5], corners[6], corners[7]], css(mix(base, [255, 255, 255], 0.13)), css(edge));
}
let sharedTerrain = null;
export function bindTerrain(t) { sharedTerrain = t; }
function terrainHeightSafe(x, y) { return sharedTerrain ? sharedTerrain.height(x, y) : 0; }

// ----------------------------------------------------------------- rings

export function drawRings(ctx, mission, cam, ac) {
  // The precision-landing mission has no ring objectives; keep its final
  // clean and readable without stray amber hoops near the runway.
  if (mission.def.id === 'landing') return;
  const rings = mission.rings;
  const ordered = rings.map((r) => ({ r, p: cam.project(v3(r.x, r.y, r.z)) })).filter((o) => o.p);
  ordered.sort((a, b) => b.p.d - a.p.d);
  for (const { r, p } of ordered) {
    const ringDir = { x: Math.sin(42 * DEG), y: Math.cos(42 * DEG), z: 0.28 };
    const side = normalise(cross(v3(0, 0, 1), ringDir));
    const up = normalise(cross(ringDir, side));
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2;
      const world = add(v3(r.x, r.y, r.z), add(mul(side, Math.cos(a) * r.r), mul(up, Math.sin(a) * r.r)));
      const sp = cam.project(world);
      if (!sp) { pts.length = 0; break; }
      pts.push(sp);
    }
    if (!pts.length) continue;
    const isTarget = mission.target === r;
    const active = !r.passed && isTarget;
    ctx.save();
    ctx.globalAlpha = r.passed ? 0.42 : active ? 1 : 0.58;
    ctx.lineWidth = clamp(cam.scale(p.d) * r.r * 0.085, 1.5, 13);
    ctx.strokeStyle = r.passed ? '#a6a8a2' : active ? PALETTE.amber : '#d1a463';
    ctx.shadowColor = active ? PALETTE.amber : 'transparent';
    ctx.shadowBlur = active ? 22 : 0;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
    ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = r.passed ? 0.17 : 0.12;
    ctx.fillStyle = r.passed ? '#8d918a' : PALETTE.amber;
    ctx.fill();
    ctx.restore();
    // Number plate above the ring.
    ctx.fillStyle = r.passed ? 'rgba(200,200,195,0.55)' : PALETTE.amber;
    ctx.font = '700 15px monospace'; ctx.textAlign = 'center';
    ctx.fillText(r.passed ? 'PASS' : `${r.index + 1}`, p.x, p.y - clamp(cam.scale(p.d) * r.r, 10, 240) - 12);
  }
}

// ----------------------------------------------------------------- aircraft

/** Aircraft body coordinates: x right wing, y nose, z up. */
function bodyPoint(ac, x, y, z) {
  const fwd = forwardVec(ac.hdg, ac.pitch);
  const flatRight = rightVec(ac.hdg);
  const flatUp = v3(0, 0, 1);
  const b = ac.bank * DEG;
  const right = normalise(add(mul(flatRight, Math.cos(b)), mul(flatUp, Math.sin(b))));
  const up = normalise(cross(right, fwd));
  return add(v3(ac.x, ac.y, ac.z), add(add(mul(right, x), mul(fwd, y)), mul(up, z)));
}

function bodyPoly(ctx, cam, ac, pts, fill, edge = null) {
  const projected = pts.map((p) => cam.project(bodyPoint(ac, p[0], p[1], p[2])));
  poly(ctx, projected, fill, edge);
  return projected;
}

export function drawShadow(ctx, terrain, cam, ac) {
  const g = terrain.surface(ac.x, ac.y);
  const centre = cam.project(v3(ac.x, ac.y, g + 2));
  if (!centre) return;
  const s = cam.scale(centre.d);
  ctx.save();
  ctx.globalAlpha = clamp(1 - (ac.z - g) / 3200, 0.12, 0.44);
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(centre.x, centre.y, Math.max(4, s * PLANE.wingSpan * 0.52), Math.max(2, s * PLANE.length * 0.27), -cam.roll * DEG, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawAircraft(ctx, cam, ac, mode, t) {
  const cockpit = mode === 'cockpit';
  const metal = css(C.metal);
  const dark = css(mix(C.metal, [20, 24, 28], 0.55));
  const shade = css(mix(C.metal, [40, 45, 50], 0.28));

  // Wings and tailplane, seen from above/below as the camera dictates.
  bodyPoly(ctx, cam, ac, [[-19, 2, 0], [-3, 11, 0], [3, 11, 0], [19, 2, 0], [3, -3, 0], [-3, -3, 0]], metal, 'rgba(45,50,52,0.7)');
  bodyPoly(ctx, cam, ac, [[-19, 2, 0], [-19, 2, -1.1], [-3, -3, -1.1], [-3, -3, 0]], shade);
  bodyPoly(ctx, cam, ac, [[-8, -13, 1], [8, -13, 1], [8, -15, 1], [-8, -15, 1]], shade, 'rgba(45,50,52,0.7)');

  // Fuselage: tapered nose, straight cabin, squared tail.
  bodyPoly(ctx, cam, ac, [[-4, -15, 2], [4, -15, 2], [4.6, -6, 4.6], [-4.6, -6, 4.6]], shade);
  bodyPoly(ctx, cam, ac, [[-4.6, -6, -2], [4.6, -6, -2], [4.6, 9, -1.6], [-4.6, 9, -1.6]], dark);
  bodyPoly(ctx, cam, ac, [[-4.6, -6, 4.6], [4.6, -6, 4.6], [4.6, 9, 3.8], [-4.6, 9, 3.8]], metal, 'rgba(45,50,52,0.65)');
  bodyPoly(ctx, cam, ac, [[-4.6, 9, -1.6], [4.6, 9, -1.6], [2.8, 16, 1.4], [-2.8, 16, 1.4]], shade);
  bodyPoly(ctx, cam, ac, [[-4.6, 9, 3.8], [4.6, 9, 3.8], [2.8, 16, 1.4], [-2.8, 16, 1.4]], metal);

  // Vertical fin and rudder.
  bodyPoly(ctx, cam, ac, [[0, 6, 3], [0, 16, 3], [0, 14, 12], [0, 4, 11]], shade, 'rgba(45,50,52,0.7)');

  // Canopy glass with frame line.
  bodyPoly(ctx, cam, ac, [[-3.4, -5.5, 4.5], [3.4, -5.5, 4.5], [3.0, 4.4, 6.0], [-3.0, 4.4, 6.0]], 'rgba(62,104,122,0.92)', 'rgba(20,30,35,0.85)');
  bodyPoly(ctx, cam, ac, [[-1.8, -4.6, 4.8], [1.8, -4.6, 4.8], [1.4, 3.4, 5.8], [-1.4, 3.4, 5.8]], 'rgba(154,204,214,0.48)');

  // Propeller hub and translucent disc.
  const hub = cam.project(bodyPoint(ac, 0, 17.4, 1.4));
  const bladeA = cam.project(bodyPoint(ac, Math.cos(ac.propAngle) * 10, 17.4, 1.4 + Math.sin(ac.propAngle) * 10));
  const bladeB = cam.project(bodyPoint(ac, -Math.cos(ac.propAngle) * 10, 17.4, 1.4 - Math.sin(ac.propAngle) * 10));
  if (hub && bladeA && bladeB) {
    ctx.save();
    ctx.globalAlpha = ac.throttle > 8 ? 0.30 : 0.75;
    ctx.fillStyle = 'rgba(226,232,228,0.55)';
    ctx.beginPath(); ctx.ellipse(hub.x, hub.y, Math.abs(bladeA.x - bladeB.x) * 0.6 + 2, Math.abs(bladeA.y - bladeB.y) * 0.6 + 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    line(ctx, bladeA, bladeB, 'rgba(35,40,42,0.85)', 2.4);
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath(); ctx.arc(hub.x, hub.y, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Landing gear: struts and wheels project as real geometry.
  if (ac.gearAnim > 0.02) {
    const g = ac.gearAnim;
    for (const x of [-8.5, 8.5]) {
      const top = cam.project(bodyPoint(ac, x * 0.6, -1, -1));
      const wheel = cam.project(bodyPoint(ac, x, -1 + g * 2, -5 - g * 3));
      line(ctx, top, wheel, 'rgba(35,40,42,0.95)', 2.2);
      if (wheel) {
        ctx.fillStyle = '#252a2c';
        ctx.beginPath(); ctx.arc(wheel.x, wheel.y, clamp(cam.scale(wheel.d) * 5.5, 1, 16), 0, Math.PI * 2); ctx.fill();
      }
    }
    const noseTop = cam.project(bodyPoint(ac, 0, 9, 0));
    const noseWheel = cam.project(bodyPoint(ac, 0, 10 + g, -4 - g * 3));
    line(ctx, noseTop, noseWheel, 'rgba(35,40,42,0.95)', 2);
  }

  // Navigation lights, always readable even at a distance.
  for (const [p, col] of [[[-18.5, 2, 0], '#ff6a5d'], [[18.5, 2, 0], '#8dffb1']]) {
    const sp = cam.project(bodyPoint(ac, p[0], p[1], p[2]));
    if (sp) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, clamp(cam.scale(sp.d) * 3.2, 1.2, 5), 0, Math.PI * 2); ctx.fill();
    }
  }

  if (cockpit) drawCockpitFrame(ctx, ac, W_from_cam(cam), H_from_cam(cam), t);
}

function W_from_cam(cam) { return cam.width; }
function H_from_cam(cam) { return cam.height; }

function drawCockpitFrame(ctx, ac, W, H, t) {
  const c = PALETTE.cockpit;
  ctx.save();
  // Glare shield and panel silhouette.
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H * 0.70);
  ctx.lineTo(W * 0.18, H * 0.76);
  ctx.lineTo(W * 0.38, H * 0.82);
  ctx.lineTo(W * 0.62, H * 0.82);
  ctx.lineTo(W * 0.84, H * 0.76);
  ctx.lineTo(W, H * 0.70);
  ctx.lineTo(W, H);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(175,196,192,0.35)'; ctx.lineWidth = 3; ctx.stroke();

  // Canopy pillars: left, right and roof arch.
  ctx.fillStyle = '#252b2d';
  ctx.fillRect(0, 0, W * 0.055, H * 0.75);
  ctx.fillRect(W * 0.945, 0, W * 0.055, H * 0.75);
  ctx.fillRect(0, 0, W, H * 0.055);
  ctx.strokeStyle = 'rgba(180,200,198,0.22)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W * 0.055, 0); ctx.quadraticCurveTo(W * 0.5, H * 0.10, W * 0.945, 0); ctx.stroke();

  // Instrument panel: six round instruments with real needles.
  const baseY = H * 0.89;
  const gauges = [
    { x: 0.28, label: 'ALT', f: ac.z / 2000, needle: (ac.z % 1000) / 1000 },
    { x: 0.38, label: 'SPD', f: ac.speed / 220, needle: ac.speed / 220 },
    { x: 0.49, label: 'ADI', f: clamp(ac.bank / 60, -1, 1), needle: ac.pitch / 40 },
    { x: 0.60, label: 'HDG', f: ac.hdg / 360, needle: ac.hdg / 360 },
    { x: 0.71, label: 'FUEL', f: ac.fuel / 100, needle: ac.fuel / 100 },
  ];
  for (const g of gauges) {
    const x = W * g.x, y = baseY, r = clamp(W * 0.041, 20, 48);
    ctx.fillStyle = '#141b1d';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PALETTE.hudDim; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(143,242,212,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
      ctx.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
      ctx.stroke();
    }
    const a = -Math.PI / 2 + clamp(g.needle, -1, 1) * Math.PI * 0.82;
    ctx.strokeStyle = PALETTE.hud; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.74, y + Math.sin(a) * r * 0.74); ctx.stroke();
    ctx.fillStyle = PALETTE.hud; ctx.font = `600 ${Math.max(8, r * 0.3)}px monospace`; ctx.textAlign = 'center';
    ctx.fillText(g.label, x, y + r * 0.45);
  }
  // Throttle quadrant and marker.
  const tx = W * 0.815, ty = H * 0.86;
  ctx.fillStyle = '#171d1f'; ctx.fillRect(tx, ty, W * 0.09, H * 0.11);
  ctx.fillStyle = PALETTE.amber;
  ctx.fillRect(tx + 5, ty + H * 0.095 - (H * 0.08 * ac.throttle / 100), W * 0.09 - 10, 5);
  ctx.restore();
}

// ----------------------------------------------------------------- effects

export function drawEffects(ctx, ac, cam, W, H) {
  for (const s of ac.smoke) {
    if (s.age < 0) continue;
    const p = cam.project(v3(s.x, s.y, s.z));
    if (!p) continue;
    ctx.save();
    ctx.globalAlpha = clamp(1 - s.age / 2.6, 0, 0.5);
    ctx.fillStyle = s.age > 1.2 ? '#b7b0a2' : '#d9d2c4';
    ctx.beginPath(); ctx.arc(p.x, p.y, clamp(cam.scale(p.d) * s.r, 2, 70), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/** A full frame: environment, objective, aircraft, effects. HUD drawn by main. */
export function drawWorld(ctx, terrain, mission, cam, ac, W, H, t, mode) {
  bindTerrain(terrain);
  drawSky(ctx, cam, W, H, t);
  drawMountains(ctx, terrain, cam, W, H);
  drawTerrain(ctx, terrain, cam, W, H);
  drawGroundPatches(ctx, terrain, cam);
  drawAirfield(ctx, terrain, cam, W, H);
  drawShadow(ctx, terrain, cam, ac);
  drawRings(ctx, mission, cam, ac);
  drawAircraft(ctx, cam, ac, mode, t);
  drawEffects(ctx, ac, cam, W, H);
}
