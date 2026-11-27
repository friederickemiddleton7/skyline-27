// flight.js — the aircraft simulation: throttle, lift, drag, stall, bank,
// fuel, damage, gear and ground contact. Pure state, no DOM.

import { PLANE, KT_TO_FPS, RUNWAY, DEG } from './config.js';
import { clamp, wrap360 } from './mathx.js';

export function createAircraft(start) {
  return {
    x: start.x, y: start.y, z: start.z,
    hdg: start.hdg, pitch: start.pitch, bank: 0,
    speed: start.speed, throttle: 74,
    fuel: start.fuel, damage: 0,
    gear: start.gear, gearAnim: start.gear ? 1 : 0,
    propAngle: 0,
    stall: false,
    wingRock: 0,
    sink: 0,
    onGround: false,
    landed: false,
    crashed: false,
    touchdownAt: null,
    runwayLocal: { along: 0, across: 0 },
    smoke: [],
    trail: [],
    gForce: 1,
  };
}

/** Integrate one fixed time step. Controls are the object from input.js. */
export function stepFlight(ac, dt, ctl, terrain, missionPhase = 'fly') {
  const p = PLANE;

  if (ctl.gearToggle) ac.gear = !ac.gear;
  ac.gearAnim = clamp(ac.gearAnim + (ac.gear ? 2.8 : -2.8) * dt, 0, 1);

  if (!ac.crashed) {
    ac.throttle = clamp(ac.throttle + ctl.throttle * 26 * dt, 0, 100);
  } else {
    ac.throttle = clamp(ac.throttle - 40 * dt, 0, 100);
  }

  // Speed: thrust against quadratic drag, plus gear drag and climb penalty.
  const authority = ac.stall ? 0.42 : clamp((ac.speed - 34) / 44, 0.25, 1);
  const thrust = p.throttleAccel * (ac.throttle / 100) * (ac.crashed ? 0 : 1);
  const drag = p.dragK * ac.speed * ac.speed + (ac.gear ? p.gearDrag * 0.28 : 0);
  const climb = Math.max(0, Math.sin(ac.pitch * DEG)) * 7.5;
  ac.speed = clamp(ac.speed + (thrust - drag - climb) * dt, p.minSpeed, p.maxSpeed);

  ac.stall = ac.speed < p.stallSpeed && !ac.onGround;
  const stallAmt = ac.stall ? clamp((p.stallSpeed - ac.speed) / p.stallSpeed, 0, 1) : 0;
  ac.wingRock += ((ac.stall ? Math.sin(performanceNowSafe() * 0.006) * 16 * stallAmt : 0) - ac.wingRock) * Math.min(1, dt * 6);

  // Pitch and bank ease toward what the pilot asks for; no snap, no fight.
  const pitchTarget = clamp(ctl.pitch, -1, 1) * (ac.stall ? 13 : 27);
  const pitchRate = (ac.stall ? 15 : p.pitchRate) * authority;
  ac.pitch += clamp(pitchTarget - ac.pitch, -pitchRate * dt, pitchRate * dt);
  if (Math.abs(ctl.pitch) < 0.01) ac.pitch *= Math.pow(0.992, dt * 60);

  const bankTarget = ctl.turn * (ac.stall ? 21 : 47);
  ac.bank += clamp(bankTarget - ac.bank, -p.rollRate * dt * authority, p.rollRate * dt * authority);

  // Coordinated turn: bank drives heading, faster at low speed, weaker in a stall.
  const speedFactor = clamp(142 / Math.max(60, ac.speed), 0.72, 1.65);
  ac.hdg = wrap360(ac.hdg + ac.bank * p.turnK * speedFactor * authority * dt);
  ac.gForce = 1 + Math.abs(ac.bank) / 90;

  // Vertical speed from pitch, with stall and power-off sink added.
  const fps = ac.speed * KT_TO_FPS;
  let vz = fps * Math.sin(ac.pitch * DEG) - stallAmt * 26 - (ac.throttle < 12 ? 5 : 0);
  if (ac.onGround) vz = Math.min(0, vz);
  ac.sink = -vz;

  const prevZ = ac.z;
  ac.x += Math.sin(ac.hdg * DEG) * fps * Math.cos(ac.pitch * DEG) * dt;
  ac.y += Math.cos(ac.hdg * DEG) * fps * Math.cos(ac.pitch * DEG) * dt;
  ac.z += vz * dt;
  ac.propAngle += (ac.throttle * 2.4 + 5) * dt;

  const ground = terrain.surface(ac.x, ac.y);
  const local = terrain.runwayLocal(ac.x, ac.y);
  ac.runwayLocal = local;
  const onRunway = terrain.isRunway(ac.x, ac.y);

  if (ac.z <= ground) {
    const impact = -vz;
    ac.z = ground;
    if (ac.onGround) {
      // Rolling out: wheel brakes and aerodynamic drag.
      ac.speed = Math.max(0, ac.speed - (ac.gear ? 11 : 26) * dt);
      ac.pitch = 0;
      ac.vz = 0;
    } else if (onRunway && ac.gear && ac.gearAnim > 0.85 && impact <= PLANE.sinkLimit && ac.bank < 22 && missionPhase !== 'done') {
      ac.onGround = true;
      ac.landed = true;
      ac.touchdownAt = { x: ac.x, y: ac.y, along: local.along, sink: impact, speed: ac.speed };
      for (let i = 0; i < 6; i++) {
        ac.smoke.push({ x: ac.x - Math.sin(ac.hdg * DEG) * 12, y: ac.y - Math.cos(ac.hdg * DEG) * 12, z: 2, age: -i * 0.08, r: 5 + i * 1.4 });
      }
    } else {
      const hard = onRunway && ac.gear && impact > PLANE.sinkLimit;
      ac.damage = clamp(ac.damage + 18 + impact * (hard ? 7 : 3.6) + (ac.gear ? 0 : 26), 0, 100);
      ac.speed *= onRunway ? 0.55 : 0.31;
      ac.pitch = Math.min(ac.pitch, -4);
      ac.bank *= 0.4;
      ac.crashed = ac.damage >= 100;
      for (let i = 0; i < 9; i++) {
        ac.smoke.push({ x: ac.x, y: ac.y, z: 3, age: -i * 0.06, r: 8 + i * 2.2 });
      }
    }
  } else if (ac.onGround && ac.z - ground > 4) {
    ac.onGround = false;
  }

  // Fuel: idle burn plus throttle demand. Empty tanks mean no thrust.
  const burn = (p.fuelIdle + p.fuelThrottle * (ac.throttle / 100)) * dt;
  ac.fuel = clamp(ac.fuel - burn, 0, 100);
  if (ac.fuel <= 0) ac.throttle = 0;

  // Smoke and wingtip trail age out deterministically.
  for (const s of ac.smoke) { s.age += dt; s.r += dt * 17; }
  ac.smoke = ac.smoke.filter((s) => s.age < 2.6).slice(-36);
  if (!ac.onGround && ac.trail.length < 40) {
    ac.trail.push({ x: ac.x, y: ac.y, z: ac.z, age: 0 });
  }
  for (const t of ac.trail) t.age += dt;
  ac.trail = ac.trail.filter((t) => t.age < 1.1);

  return ac;
}

function performanceNowSafe() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
