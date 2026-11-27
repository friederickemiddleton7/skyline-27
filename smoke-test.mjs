// smoke-test.mjs — DOM-less runtime check: import the game's ES modules,
// construct every ?shot= state, step the flight model, and drive the renderer
// with a stub 2D context so any runtime error surfaces without a browser.

const noop = () => {};
const gradient = { addColorStop: noop };
const ctxStub = new Proxy({
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
  measureText: () => ({ width: 10 }),
  canvas: { width: 1280, height: 720 },
}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return noop;
  },
  set(target, prop, value) { target[prop] = value; return true; },
});

const listeners = {};
globalThis.window = {
  addEventListener: (k, f) => { listeners[k] = f; },
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  AudioContext: undefined, webkitAudioContext: undefined,
};
globalThis.document = {
  getElementById: () => ({
    getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    style: {}, width: 1280, height: 720,
    addEventListener: noop,
  }),
};
globalThis.location = { search: '?shot=approach&seed=3' };
globalThis.requestAnimationFrame = noop;
globalThis.performance = { now: () => 0 };

const { buildShot } = await import('./game/src/shots.js');
const { drawWorld } = await import('./game/src/render.js');
const { drawHUD, drawDebrief } = await import('./game/src/hud.js');
const { Camera } = await import('./game/src/mathx.js');
const { Terrain } = await import('./game/src/terrain.js');
const { stepFlight, createAircraft } = await import('./game/src/flight.js');
const { Mission } = await import('./game/src/mission.js');
const { FlightCamera } = await import('./game/src/camera.js');

const neutral = { pitch: 0, throttle: 0, turn: 0, gearToggle: false, viewToggle: false, missionToggle: false, restart: false, start: false };
let failures = 0;
for (const shot of ['approach', 'cockpit', 'ring', 'landing']) {
  const s = buildShot(shot, 7, 0.5);
  const fc = new FlightCamera();
  fc.mode = s.mode;
  const cam = fc.update(s.ac, 0, 1280, 720, true);
  drawWorld(ctxStub, s.terrain, s.mission, cam, s.ac, 1280, 720, 0.5, s.mode);
  drawHUD(ctxStub, s.ac, s.mission, 1280, 720);
  if (s.banner) drawDebrief(ctxStub, s.mission, 1280, 720, true);
  const a = s.ac;
  console.log(`${shot}: alt=${a.z.toFixed(0)}ft spd=${a.speed.toFixed(0)}kt hdg=${a.hdg.toFixed(0)} fuel=${a.fuel.toFixed(0)}% dmg=${a.damage.toFixed(0)}% rings=${s.mission.ringsPassed} mode=${s.mode}`);
}

// Exercise a full 20-second flight from each mission, with real turning.
for (let m = 0; m < 3; m++) {
  const terrain = new Terrain(11);
  const mission = new Mission(m);
  const ac = createAircraft(mission.start);
  const fc = new FlightCamera();
  for (let i = 0; i < 1200; i++) {
    const ctl = { ...neutral, pitch: Math.sin(i / 90) * 0.5, throttle: 0.4, turn: Math.sin(i / 120) * 0.8 };
    stepFlight(ac, 1 / 60, ctl, terrain, mission.phase);
    mission.update(ac, 1 / 60);
    const cam = fc.update(ac, 1 / 60, 1280, 720, false);
    if (i % 300 === 0) drawWorld(ctxStub, terrain, mission, cam, ac, 1280, 720, i / 60, fc.mode);
  }
  console.log(`mission ${m}: pos=(${ac.x.toFixed(0)},${ac.y.toFixed(0)},${ac.z.toFixed(0)}) spd=${ac.speed.toFixed(0)} fuel=${ac.fuel.toFixed(0)}% phase=${mission.phase}`);
}
console.log(failures === 0 ? 'SMOKE OK' : `SMOKE FAILED: ${failures}`);
