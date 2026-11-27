// input.js — keyboard and mouse state, translated into flight controls.
// Nothing here touches the game state; main.js owns that.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseY = 0.5;
    this.mouseActive = false;
    this.pressed = new Set();
    this.canvas = canvas;

    this.onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'control'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    };
    this.onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    this.onBlur = () => { this.keys.clear(); this.pressed.clear(); };
    this.onMouseMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseY = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
      this.mouseActive = true;
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  /** One-shot key press consumed once per frame. */
  tapped(k) {
    if (this.pressed.has(k)) { this.pressed.delete(k); return true; }
    return false;
  }

  endFrame() { this.pressed.clear(); }

  /** Continuous controls: throttle rate, pitch rate, bank target, gear toggle. */
  controls(view) {
    const k = this.keys;
    let pitch = 0;
    if (k.has('arrowup')) pitch += 1;
    if (k.has('arrowdown')) pitch -= 1;
    if (view === 'chase' && this.mouseActive && pitch === 0) {
      // Mouse Y biases pitch toward a comfortable cruise envelope.
      const wanted = (0.5 - this.mouseY) * 26;
      pitch = Math.max(-1, Math.min(1, wanted / 16));
    }
    let throttle = 0;
    if (k.has('w') || k.has('shift')) throttle += 1;
    if (k.has('s') || k.has('control')) throttle -= 1;
    const turn = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    return { pitch, throttle, turn, gearToggle: this.tapped('g'), viewToggle: this.tapped('v'), missionToggle: this.tapped('m'), restart: this.tapped('r'), start: this.tapped('enter') || this.tapped(' ') };
  }
}
