// playability-check.mjs — probes each mission with simple deterministic
// control laws to confirm the objectives are actually reachable.

import { Terrain } from './game/src/terrain.js';
import { Mission } from './game/src/mission.js';
import { createAircraft, stepFlight } from './game/src/flight.js';
import { angleDelta } from './game/src/mathx.js';

const dt = 1 / 60;

function ringAutopilot(ac, mission) {
  const b = mission.bearingTo(ac);
  const turn = Math.max(-1, Math.min(1, (b.delta ?? angleDelta(b.hdg, ac.hdg)) / 24 - ac.bank / 47));
  const dz = mission.target ? mission.target.z - ac.z : 0;
  const pitch = Math.max(-0.34, Math.min(0.34, dz / 180 - ac.pitch / 30));
  return { pitch, throttle: ac.speed < 145 ? 1 : 0, turn, gearToggle: false };
}

function landingAutopilot(ac) {
  // Dive at ~ -8.4° then flare at 100 ft for a 7.7 ft/s touchdown.
  const pitch = ac.z > 100 ? -0.31 : -0.075;
  return { pitch, throttle: 0, turn: 0, gearToggle: false };
}

function homeAutopilot(ac, mission) {
  const b = mission.bearingTo(ac);
  const turn = Math.max(-1, Math.min(1, (b.delta ?? angleDelta(b.hdg, ac.hdg)) / 24 - ac.bank / 47));
  // Cruise home level, then descend on the final 4000 ft like a landing.
  const pitch = ac.z > 900 ? 0 : ac.z > 100 ? -0.31 : -0.075;
  return { pitch, throttle: ac.speed < 110 ? 0.5 : 0, turn, gearToggle: false };
}

for (let m = 0; m < 3; m++) {
  const terrain = new Terrain(3);
  const mission = new Mission(m);
  const ac = createAircraft(mission.start);
  if (m === 1) { ac.gear = true; ac.gearAnim = 1; }
  let touchdown = null;
  for (let i = 0; i < 60 * 200 && mission.phase !== 'done'; i++) {
    const ctl = m === 1 ? landingAutopilot(ac) : m === 2 && mission.homeLeg ? homeAutopilot(ac, mission) : ringAutopilot(ac, mission);
    stepFlight(ac, dt, ctl, terrain, mission.phase);
    mission.update(ac, dt);
    if (ac.landed && !touchdown) touchdown = { t: mission.elapsed.toFixed(1), sink: ac.touchdownAt.sink.toFixed(1), speed: ac.touchdownAt.speed.toFixed(0) };
  }
  console.log(`mission ${m} (${mission.def.name}): phase=${mission.phase} rings=${mission.ringsPassed}/${mission.def.target} fuel=${ac.fuel.toFixed(0)}% result=${mission.result?.title ?? '-'} touch=${JSON.stringify(touchdown)}`);
}
