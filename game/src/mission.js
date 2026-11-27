// mission.js — the three missions, objective tracking and debrief scoring.

import { MISSIONS, RINGS, RUNWAY } from './config.js';
import { clamp, angleDelta } from './mathx.js';

export class Mission {
  constructor(index = 0) {
    this.index = index % MISSIONS.length;
    this.def = MISSIONS[this.index];
    this.reset();
  }

  reset() {
    this.phase = 'fly';
    this.ringsPassed = 0;
    this.rings = RINGS.map((r, i) => ({ ...r, index: i, passed: false }));
    this.elapsed = 0;
    this.score = 0;
    this.message = 'IN THE AIR';
    this.messageAge = 0;
    this.result = null;
    this.landingPhase = 0;
    this.homeLeg = false;
  }

  next() {
    this.index = (this.index + 1) % MISSIONS.length;
    this.def = MISSIONS[this.index];
    this.reset();
  }

  get start() { return this.def.start; }
  get missionLine() {
    if (this.def.id === 'landing') return 'APPROACH - RWY 27';
    if (this.def.id === 'strike') return this.homeLeg ? 'RTB - RWY 27' : `STRIKE RING ${Math.min(this.ringsPassed + 1, 3)}/3`;
    return `RING ${Math.min(this.ringsPassed + 1, 5)}/5`;
  }

  get target() {
    if (this.homeLeg) return null;
    return this.rings[this.ringsPassed] ?? null;
  }

  say(text) { this.message = text; this.messageAge = 2.6; }

  /** Distance from an aircraft point to a ring centre, used for pass detection. */
  update(ac, dt) {
    if (this.phase === 'done') return;
    this.elapsed += dt;
    this.messageAge = Math.max(0, this.messageAge - dt);

    if (ac.damage >= 100) {
      this.phase = 'done';
      this.result = { ok: false, title: 'AIRCRAFT LOST', reason: 'Structural failure', score: 0 };
      return;
    }
    if (ac.fuel <= 0 && !ac.onGround && ac.z > 40) {
      this.phase = 'done';
      this.result = { ok: false, title: 'FUEL EXHAUSTED', reason: 'Engine out in the valley', score: 0 };
      return;
    }

    const target = this.target;
    if (target && !target.passed) {
      const d = Math.hypot(ac.x - target.x, ac.y - target.y, ac.z - target.z);
      if (d < target.r * 1.28) {
        target.passed = true;
        this.ringsPassed++;
        this.say(`RING ${this.ringsPassed} CLEARED +${300 * this.ringsPassed}`);
        this.score += 300 * this.ringsPassed;
        if (this.def.id === 'strike' && this.ringsPassed >= 3) {
          this.homeLeg = true;
          this.say('TARGETS HIT - RETURN TO BASE');
        }
      }
    }

    if (this.def.id === 'rings' && this.ringsPassed >= 5) this.complete(ac, 'RING RUN COMPLETE');
    if (this.def.id === 'strike' && this.homeLeg && ac.landed) this.complete(ac, 'STRIKE RUN COMPLETE');
    if (this.def.id === 'landing' && ac.landed) this.complete(ac, 'PRECISION LANDING');
  }

  complete(ac, title) {
    const timeBonus = Math.max(0, Math.round(2400 - this.elapsed * 22));
    const fuelBonus = Math.round(ac.fuel * 12);
    const smoothBonus = ac.touchdownAt ? Math.max(0, Math.round((10 - ac.touchdownAt.sink) * 85)) : 0;
    this.score += timeBonus + fuelBonus + smoothBonus;
    this.phase = 'done';
    this.result = { ok: true, title, score: this.score, timeBonus, fuelBonus, smoothBonus, touchdown: ac.touchdownAt };
    this.say(title);
  }

  /** Bearing/heading of the current objective for the HUD arrow. */
  bearingTo(ac) {
    // With no active ring (e.g. the landing mission) the bearing arrow leads
    // to the runway centre, so the field stays findable from any position.
    if (this.homeLeg || !this.target) {
      const hdg = (Math.atan2(RUNWAY.cx - ac.x, RUNWAY.cy - ac.y) * 180 / Math.PI + 360) % 360;
      return { hdg, name: 'RWY 27', delta: angleDelta(hdg, ac.hdg), dist: Math.hypot(RUNWAY.cx - ac.x, RUNWAY.cy - ac.y) };
    }
    const t = this.target;
    const hdg = (Math.atan2(t.x - ac.x, t.y - ac.y) * 180 / Math.PI + 360) % 360;
    return { hdg, name: `RING ${this.ringsPassed + 1}`, delta: angleDelta(hdg, ac.hdg), dist: Math.hypot(t.x - ac.x, t.y - ac.y, t.z - ac.z) };
  }
}
