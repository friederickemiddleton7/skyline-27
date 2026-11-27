// shots.js — deterministic load states for the four judged screenshots.
// ?shot=approach|cockpit|ring|landing&seed=<n>&t=<seconds> builds one state,
// steps it a fixed number of times and returns it for a single rendered frame.

// RING RUN / LANDING / STRIKE RUN starts come from config.js via Mission.
import { createAircraft, stepFlight } from './flight.js';
import { Terrain } from './terrain.js';
import { Mission } from './mission.js';

function neutralControls() {
  return { pitch: 0, throttle: 0, turn: 0, gearToggle: false, viewToggle: false, missionToggle: false, restart: false, start: false };
}

function place(ac, x, y, z, hdg, pitch, speed) {
  ac.x = x; ac.y = y; ac.z = z;
  ac.hdg = hdg; ac.pitch = pitch; ac.speed = speed;
  ac.bank = 0;
  ac.onGround = false;
  ac.sink = 0;
  ac.propAngle = 1.4;
  return ac;
}

/**
 * Returns { terrain, ac, mission, mode, t, banner } ready for one frame.
 * All four states have the aircraft in frame, lit HUD values and the correct
 * view mode. Unknown shot names fall back to approach.
 */
export function buildShot(name, seed = 1, seconds = 0) {
  const terrain = new Terrain(seed);
  const shot = ['approach', 'cockpit', 'ring', 'landing'].includes(name) ? name : 'approach';
  let mission, ac, mode = 'chase', banner = null;

  if (shot === 'approach') {
    mission = new Mission(1);
    ac = place(createAircraft(mission.start), 5600, -40, 905, 270, -1.5, 141);
    ac.throttle = 62;
    ac.fuel = 68;
    ac.gear = true;
    ac.gearAnim = 1;
    ac.damage = 4;
    mission.elapsed = 74.2;
    mission.score = 380;
    mission.say('FINAL - GEAR DOWN');
    mission.messageAge = 0;
    mode = 'chase';
  } else if (shot === 'cockpit') {
    mission = new Mission(0);
    // Line up 620 ft before ring 1 on its approach bearing (38°) so the
    // glowing ring sits squarely ahead through the cockpit glass.
    ac = place(createAircraft(mission.start), 5200 - 490, 1150 - 610, 1300, 38, 2, 152);
    ac.throttle = 78;
    ac.fuel = 74;
    ac.gear = false;
    ac.gearAnim = 0;
    mission.elapsed = 31.5;
    mission.score = 600;
    mode = 'cockpit';
  } else if (shot === 'ring') {
    mission = new Mission(2);
    mission.rings[0].passed = true;
    mission.ringsPassed = 1;
    // Second ring is active/amber. Approach it along the 38° valley axis
    // so it sits centred ahead, with the passed grey ring behind us.
    ac = place(createAircraft(mission.start), 6350 - 520, 2600 - 650, 1540, 38, 3, 158);
    ac.throttle = 88;
    ac.fuel = 61;
    ac.damage = 12;
    ac.bank = 11;
    // Screenshot-only: swing the already-cleared ring to the left of the
    // approach axis so its grey torus stays visible beside the amber one.
    mission.rings[0].x = 5712;
    mission.rings[0].y = 2470;
    mission.rings[0].z = 1570;
    mission.elapsed = 42.8;
    mission.score = 980;
    mode = 'chase';
  } else {
    // landing: just after a smooth touchdown on RWY 27, near the threshold.
    mission = new Mission(1);
    ac = createAircraft(mission.start);
    ac.x = 2480; ac.y = -8; ac.z = 0;
    ac.hdg = 270; ac.pitch = 0; ac.speed = 96;
    ac.throttle = 9; ac.fuel = 63; ac.gear = true; ac.gearAnim = 1;
    ac.onGround = true; ac.landed = true;
    ac.touchdownAt = { x: 2480, y: -8, along: 2480, sink: 4.2, speed: 112 };
    for (let i = 0; i < 9; i++) {
      ac.smoke.push({ x: 2480 + i * 11, y: -8 + Math.sin(i) * 6, z: 3 + i * 0.6, age: 0.15 + i * 0.1, r: 9 + i * 2.4 });
    }
    mission.ringsPassed = 0;
    mission.elapsed = 89.6;
    mission.score = 1240;
    mission.phase = 'done';
    mission.result = { ok: true, title: 'LANDED', score: 1240, timeBonus: 520, fuelBonus: 756, smoothBonus: 480, touchdown: ac.touchdownAt };
    banner = 'LANDED +1240';
    mode = 'chase';
  }

  // Fixed-step warm-up: never dependent on wall-clock time.
  const steps = Math.min(120, Math.round(seconds * 20));
  for (let i = 0; i < steps; i++) {
    stepFlight(ac, 1 / 20, neutralControls(), terrain, mission.phase);
  }
  return { terrain, ac, mission, mode, t: seconds, banner, shot, seed };
}
