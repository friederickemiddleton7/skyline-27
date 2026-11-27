// hud.js — altitude/speed tapes, heading ribbon, fuel/damage/throttle gauges,
// mission line, target bearing arrow and debrief. Drawn on the same 2D canvas.

import { PALETTE, KT_TO_FPS, MISSIONS } from './config.js';
import { clamp, wrap360, angleDelta } from './mathx.js';

const FONT = '"DIN Alternate", "Bahnschrift", "Arial Narrow", monospace';

function text(ctx, s, x, y, size, color = PALETTE.hud, align = 'left', weight = '600') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function panel(ctx, x, y, w, h, alpha = 0.20) {
  ctx.fillStyle = `rgba(8,26,30,${alpha})`;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(143,242,212,0.24)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

function tape(ctx, x, y, h, value, step, labelColor, format) {
  const half = Math.floor(h / (step * 3.4));
  const centre = Math.round(value / step) * step;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, 74, h);
  ctx.clip();
  for (let i = -half - 1; i <= half + 1; i++) {
    const v = centre + i * step;
    const py = y + h / 2 - (v - value) * (h / 200);
    if (py < y - 20 || py > y + h + 20) continue;
    const major = Math.abs(v % (step * 5)) < 0.01;
    ctx.strokeStyle = major ? PALETTE.hud : PALETTE.hudDim;
    ctx.globalAlpha = major ? 0.85 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x + (major ? 8 : 20), py);
    ctx.lineTo(x + 74, py);
    ctx.stroke();
    if (major) text(ctx, format(v), x + 4, py - 8, 11, PALETTE.hud);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  panel(ctx, x, y + h / 2 - 15, 74, 30, 0.48);
  text(ctx, format(Math.round(value / step) * step), x + 70, y + h / 2, 19, PALETTE.hud, 'right');
  text(ctx, labelColor, x + 4, y - 16, 11, PALETTE.hudDim);
}

function gauge(ctx, x, y, w, h, frac, label, value, color) {
  panel(ctx, x, y, w, h, 0.32);
  ctx.fillStyle = 'rgba(143,242,212,0.13)';
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = color;
  ctx.fillRect(x + 4, y + 4, (w - 8) * clamp(frac, 0, 1), h - 8);
  text(ctx, label, x + 2, y - 12, 10, PALETTE.hudDim);
  text(ctx, value, x + w - 2, y - 12, 11, color, 'right');
  for (let i = 1; i < 5; i++) {
    ctx.strokeStyle = 'rgba(8,26,30,0.5)';
    ctx.beginPath();
    ctx.moveTo(x + 4 + (w - 8) * i / 5, y + 4);
    ctx.lineTo(x + 4 + (w - 8) * i / 5, y + h - 4);
    ctx.stroke();
  }
}

export function drawHUD(ctx, ac, mission, W, H, opts = {}) {
  const alt = ac.z;
  const spd = ac.speed;
  const compass = opts.compass ?? 'HUD';
  ctx.save();

  // Heading ribbon across the top.
  const ribbonY = 30;
  panel(ctx, W / 2 - 260, 0, 520, 62, 0.20);
  ctx.save();
  ctx.beginPath(); ctx.rect(W / 2 - 256, 0, 512, 60); ctx.clip();
  const centreH = Math.round(ac.hdg / 10) * 10;
  for (let d = centreH - 140; d <= centreH + 140; d += 10) {
    const x = W / 2 + angleDelta(d, ac.hdg) * 3.3;
    const major = ((d % 90) + 90) % 90 === 0;
    if (major) {
      const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      text(ctx, names[Math.round(d / 45) % 8], x, ribbonY, 16, PALETTE.hud, 'center');
    } else if (d % 30 === 0) text(ctx, String((d + 360) % 360).padStart(3, '0'), x, ribbonY, 11, PALETTE.hudDim, 'center');
    ctx.strokeStyle = major ? PALETTE.hud : PALETTE.hudDim;
    ctx.globalAlpha = major ? 0.9 : 0.45;
    ctx.beginPath(); ctx.moveTo(x, 46); ctx.lineTo(x, major ? 56 : 52); ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.amber;
  ctx.beginPath(); ctx.moveTo(W / 2, 46); ctx.lineTo(W / 2 - 6, 56); ctx.lineTo(W / 2 + 6, 56); ctx.closePath(); ctx.fill();
  text(ctx, `${String(Math.round(ac.hdg)).padStart(3, '0')}°  ${compass}`, W / 2 + 274, 30, 13, PALETTE.hud, 'right');

  // Tapes.
  tape(ctx, 34, H / 2 - 120, 240, alt, 50, 'ALT FT', (v) => String(Math.round(v)).padStart(4, '0'));
  tape(ctx, W - 108, H / 2 - 120, 240, spd, 20, 'SPD KT', (v) => String(Math.round(v)).padStart(3, '0'));

  // Centre aircraft reference and pitch ladder.
  ctx.strokeStyle = 'rgba(143,242,212,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 46, H / 2); ctx.lineTo(W / 2 - 16, H / 2);
  ctx.moveTo(W / 2 + 16, H / 2); ctx.lineTo(W / 2 + 46, H / 2);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 2.5, 0, Math.PI * 2); ctx.stroke();
  for (const deg of [-20, -10, 10, 20]) {
    const y = H / 2 - (deg - ac.pitch) * 5.2;
    if (Math.abs(y - H / 2) > 140) continue;
    ctx.strokeStyle = 'rgba(143,242,212,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 62, y); ctx.lineTo(W / 2 + 62, y); ctx.stroke();
    text(ctx, String(Math.abs(deg)), W / 2 - 68, y, 10, PALETTE.hudDim, 'right');
  }

  // Target bearing arrow, left of centre and below the ribbon.
  const bearing = mission.bearingTo(ac);
  const delta = bearing.delta ?? angleDelta(bearing.hdg, ac.hdg);
  const arrowX = W / 2 + clamp(delta * 3.1, -230, 230);
  const arrowY = 88;
  ctx.fillStyle = opts.ringPassed ? PALETTE.hudDim : PALETTE.amber;
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY - 10); ctx.lineTo(arrowX - 8, arrowY + 7); ctx.lineTo(arrowX + 8, arrowY + 7); ctx.closePath(); ctx.fill();
  text(ctx, `${bearing.name}${bearing.dist ? ` ${Math.round(bearing.dist)}ft` : ''}`, arrowX, arrowY + 21, 11, PALETTE.amber, 'center');

  // Gauges bottom-left; mission and status bottom-right.
  gauge(ctx, 42, H - 66, 196, 18, ac.fuel / 100, 'FUEL', `${Math.round(ac.fuel)}%`, ac.fuel < 20 ? PALETTE.danger : PALETTE.hud);
  gauge(ctx, 42, H - 118, 196, 18, ac.damage / 100, 'DAMAGE', `${Math.round(ac.damage)}%`, ac.damage > 40 ? PALETTE.danger : PALETTE.hud);
  gauge(ctx, 42, H - 170, 196, 18, ac.throttle / 100, 'THROTTLE', `${Math.round(ac.throttle)}%`, PALETTE.amber);
  text(ctx, `GEAR ${ac.gear ? 'DOWN' : 'UP'}`, 250, H - 60, 12, ac.gear ? PALETTE.hud : PALETTE.hudDim);
  if (ac.stall) text(ctx, 'STALL', W / 2, H / 2 + 96, 24, PALETTE.danger, 'center');

  const bx = W - 42;
  text(ctx, mission.missionLine, bx, H - 158, 18, PALETTE.hud, 'right');
  text(ctx, mission.def.name, bx, H - 132, 12, PALETTE.hudDim, 'right');
  text(ctx, `TIME ${mission.elapsed.toFixed(1)}s   SCORE ${mission.score}`, bx, H - 108, 12, PALETTE.hud, 'right');
  if (mission.messageAge > 0) text(ctx, mission.message, bx, H - 82, 14, PALETTE.amber, 'right');
  text(ctx, 'V VIEW   M MISSION   G GEAR   W/S THROTTLE   A/D TURN', bx, H - 52, 11, PALETTE.hudDim, 'right');

  ctx.restore();
}

export function drawDebrief(ctx, mission, W, H, bannerOnly = false) {
  const r = mission.result;
  if (!r) return;
  ctx.save();
  if (!bannerOnly) {
    ctx.fillStyle = 'rgba(10,22,26,0.72)';
    ctx.fillRect(0, H / 2 - 150, W, 300);
    ctx.strokeStyle = r.ok ? PALETTE.hud : PALETTE.danger;
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 300, H / 2 - 150, 600, 300);
  }
  const baseY = bannerOnly ? H / 2 - 10 : H / 2 - 84;
  text(ctx, r.title, W / 2, baseY, bannerOnly ? 52 : 42, r.ok ? PALETTE.hud : PALETTE.danger, 'center', '700');
  text(ctx, `+${r.score} POINTS`, W / 2, baseY + 48, bannerOnly ? 32 : 28, PALETTE.amber, 'center');
  if (!bannerOnly) {
    text(ctx, r.reason ?? `${MISSIONS[mission.index].name} COMPLETE`, W / 2, baseY + 88, 15, PALETTE.hud, 'center');
    text(ctx, `TIME ${mission.elapsed.toFixed(1)}s   FUEL LEFT`, W / 2, baseY + 118, 13, PALETTE.hudDim, 'center');
    text(ctx, 'ENTER NEXT MISSION    R RESTART', W / 2, baseY + 158, 12, PALETTE.hud, 'center');
  }
  ctx.restore();
}
