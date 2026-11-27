// camera.js — chase and cockpit views, blended without fighting the pilot.

import { VIEW } from './config.js';
import { Camera, add, sub, mul, v3, lerp, clamp, forwardVec, rightVec } from './mathx.js';

export class FlightCamera {
  constructor() {
    this.cam = new Camera();
    this.mode = 'chase';
    this.blend = 0;
    this.chasePos = v3();
    this.shake = 0;
    this.initialised = false;
  }

  toggle() { this.mode = this.mode === 'chase' ? 'cockpit' : 'chase'; }

  /** Follow the aircraft with lag on position, never on orientation. */
  update(ac, dt, width, height, instant = false) {
    const targetBlend = this.mode === 'cockpit' ? 1 : 0;
    this.blend = instant ? targetBlend : lerp(this.blend, targetBlend, clamp(dt * 7, 0, 1));

    const fwd = forwardVec(ac.hdg, 0);
    const right = rightVec(ac.hdg);
    const desired = add(
      v3(ac.x, ac.y, ac.z + VIEW.chaseUp),
      add(mul(fwd, -VIEW.chaseBack), mul(right, ac.bank * 0.10)),
    );
    if (!this.initialised || instant) {
      this.chasePos = desired;
      this.initialised = true;
    } else {
      const k = clamp(dt / Math.max(VIEW.chaseLag, dt), 0, 1);
      this.chasePos = add(this.chasePos, mul(sub(desired, this.chasePos), k));
    }

    const cockpitPos = add(v3(ac.x, ac.y, ac.z + 3.2), mul(fwd, 4));
    const pos = add(mul(this.chasePos, 1 - this.blend), mul(cockpitPos, this.blend));

    // Pitch is damped in cockpit so the ground does not swing wildly.
    const camPitch = lerp(clamp(ac.pitch * 0.42, -9, 11), ac.pitch, this.blend);
    const roll = lerp(ac.bank * 0.32, 0, this.blend);

    if (this.shake > 0) {
      pos.x += (Math.random() - 0.5) * this.shake;
      pos.z += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 9);
    }

    this.cam.set(pos, ac.hdg, camPitch, roll, width, height);
    return this.cam;
  }

  kick(amount) { this.shake = Math.max(this.shake, amount); }
}
