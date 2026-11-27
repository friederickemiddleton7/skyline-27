// main.js — boot, fixed-step loop, state machine and frame composition.
// Interprets ?shot= for deterministic single-frame screenshot rendering.

import { PLANE, MISSIONS } from './config.js';
import { Input } from './input.js';
import { Terrain } from './terrain.js';
import { createAircraft, stepFlight } from './flight.js';
import { FlightCamera } from './camera.js';
import { Mission } from './mission.js';
import { Audio } from './audio.js';
import { drawWorld } from './render.js';
import { drawHUD, drawDebrief } from './hud.js';
import { buildShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') ?? 1) || 1;
const shotTime = Number(params.get('t') ?? 0) || 0;
const isShot = shotName !== null;

let W = 1280, H = 720;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(480, window.innerWidth || 1280);
  H = Math.max(360, window.innerHeight || 720);
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

const input = new Input(canvas);
const audio = new Audio();
const flightCam = new FlightCamera();

let terrain = new Terrain(shotSeed);
let mission = new Mission(0);
let ac = createAircraft(mission.start);
let state = 'title';
let clock = 0;
let accumulator = 0;
let lastTime = 0;
let shotState = null;
const STEP = 1 / 60;

function launch(index = 0) {
  terrain = new Terrain(shotSeed + index * 17 + Math.floor(clock * 7));
  mission = new Mission(index);
  ac = createAircraft(mission.start);
  flightCam.initialised = false;
  state = 'fly';
  clock = 0;
  audio.start();
}

function neutral() {
  return { pitch: 0, throttle: 0, turn: 0, gearToggle: false, viewToggle: false, missionToggle: false, restart: false, start: false };
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || STEP);
  lastTime = now;
  clock += dt;

  if (isShot) {
    // One deterministic frame, no title card and no live input.
    if (!shotState) shotState = buildShot(shotName, shotSeed, shotTime);
    renderShot(shotState);
    return;
  }

  let ctl = neutral();
  if (state === 'title') {
    const startPressed = input.tapped('enter') || input.tapped(' ');
    if (startPressed) launch(0);
  } else if (state === 'fly' || state === 'debrief') {
    ctl = input.controls(flightCam.mode);
    if (ctl.viewToggle) flightCam.toggle();
    if (ctl.missionToggle && state === 'fly') { mission.next(); launch(mission.index); }
    if (ctl.restart) launch(mission.index);
    if (state === 'debrief' && ctl.start) {
      if (mission.result?.ok) launch((mission.index + 1) % MISSIONS.length);
      else launch(mission.index);
    }
    const prevRings = mission.ringsPassed;
    const prevLanded = ac.landed;
    accumulator += dt;
    while (accumulator >= STEP) {
      stepFlight(ac, STEP, ctl, terrain, mission.phase);
      if (state === 'fly') mission.update(ac, STEP);
      accumulator -= STEP;
    }
    if (mission.ringsPassed > prevRings) audio.chime();
    if (ac.landed && !prevLanded) { audio.thud(); flightCam.kick(4); }
    if (mission.phase === 'done' && state === 'fly') state = 'debrief';
    audio.update(ac, clock);
  }
  input.endFrame();
  renderLive();
  requestAnimationFrame(frame);
}

function compose(acNow, missionNow, mode, banner, t) {
  const cam = flightCam.update(acNow, STEP, W, H, false);
  drawWorld(ctx, terrain, missionNow, cam, acNow, W, H, t, mode);
  drawHUD(ctx, acNow, missionNow, W, H, { compass: mode === 'cockpit' ? 'HDG' : 'HUD', ringPassed: missionNow.ringsPassed > 0 });
  if (banner) drawDebriefBanner(banner);
}

function renderLive() {
  compose(ac, mission, flightCam.mode, null, clock);
  if (state === 'title') drawTitle();
  if (state === 'debrief') drawDebrief(ctx, mission, W, H);
}

function renderShot(s) {
  // Use the shot's own camera and freeze all animation.
  const cam = flightCam.update(s.ac, 0, W, H, true);
  flightCam.mode = s.mode;
  flightCam.blend = s.mode === 'cockpit' ? 1 : 0;
  const fixedCam = flightCam.update(s.ac, 0, W, H, true);
  void cam;
  drawWorld(ctx, s.terrain, s.mission, fixedCam, s.ac, W, H, s.t, s.mode);
  drawHUD(ctx, s.ac, s.mission, W, H, { compass: s.mode === 'cockpit' ? 'HDG' : 'HUD', ringPassed: s.mission.ringsPassed > 0 });
  if (s.banner) drawDebriefBanner(s.banner);
}

function drawDebriefBanner(label) {
  ctx.save();
  const w = Math.min(760, W * 0.82), h = 116;
  const x = (W - w) / 2, y = H * 0.60;
  ctx.fillStyle = 'rgba(10,26,30,0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8ff2d4'; ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.font = '700 52px "Bahnschrift", "Arial Narrow", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8ff2d4';
  ctx.fillText(label, W / 2, y + h / 2);
  ctx.restore();
}

function drawTitle() {
  ctx.save();
  ctx.fillStyle = 'rgba(8,20,26,0.60)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8ff2d4';
  ctx.font = '700 68px "Bahnschrift", "Arial Narrow", sans-serif';
  ctx.fillText('SKYLINE 27', W / 2, H / 2 - 90);
  ctx.fillStyle = '#ffbc55';
  ctx.font = '600 22px monospace';
  ctx.fillText('FLIGHT TRAINER  /  STEPPE AIRFIELD', W / 2, H / 2 - 36);
  ctx.fillStyle = '#d8e6de';
  ctx.font = '16px monospace';
  ctx.fillText('W/S THROTTLE   ↑↓ PITCH   A/D BANK+TURN   G GEAR   V VIEW   M MISSION', W / 2, H / 2 + 16);
  ctx.fillText('THREE MISSIONS: RING RUN · LANDING · STRIKE RUN', W / 2, H / 2 + 46);
  ctx.fillStyle = '#8ff2d4';
  ctx.font = '700 22px monospace';
  ctx.fillText('PRESS ENTER TO FLY', W / 2, H / 2 + 106);
  ctx.restore();
}

if (isShot) {
  resize();
  const s = buildShot(shotName, shotSeed, shotTime);
  shotState = s;
  renderShot(s);
} else {
  launch(0);
  state = 'title';
  requestAnimationFrame(frame);
}
