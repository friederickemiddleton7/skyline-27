// audio.js — WebAudio synthesis only: no files, no fetches. The engine is an
// oscillator pair whose pitch tracks RPM; wind is filtered noise; beeps are
// short envelope blips for ring passes, stalls and touchdown.

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.lastStallBeep = 0;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);

      this.engine = this.ctx.createOscillator();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 70;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.18;
      this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
      this.engine.start();

      this.engine2 = this.ctx.createOscillator();
      this.engine2.type = 'square';
      this.engine2.frequency.value = 35;
      const g2 = this.ctx.createGain();
      g2.gain.value = 0.05;
      this.engine2.connect(g2).connect(this.engineFilter);
      this.engine2.start();

      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = this.ctx.createBufferSource();
      this.noise.buffer = buf;
      this.noise.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 700;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.05;
      this.noise.connect(this.windFilter).connect(this.windGain).connect(this.master);
      this.noise.start();
      this.ready = true;
    } catch { this.ready = false; }
  }

  update(ac, t) {
    if (!this.ready || this.muted) return;
    const rpm = 48 + ac.throttle * 1.65 + (ac.stall ? -12 : 0);
    this.engine.frequency.setTargetAtTime(rpm, this.ctx.currentTime, 0.08);
    this.engine2.frequency.setTargetAtTime(rpm * 0.5, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(260 + ac.throttle * 7, this.ctx.currentTime, 0.12);
    this.windGain.gain.setTargetAtTime(0.012 + ac.speed / 2600, this.ctx.currentTime, 0.2);
    if (ac.stall && t - this.lastStallBeep > 0.8) {
      this.lastStallBeep = t;
      this.beep(180, 0.14, 'square');
    }
  }

  beep(freq = 660, dur = 0.16, type = 'sine') {
    if (!this.ready || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.22, this.ctx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + dur + 0.02);
  }

  chime() { this.beep(880, 0.22); setTimeout(() => this.beep(1320, 0.3), 110); }
  thud() { this.beep(90, 0.42, 'sawtooth'); }
}
