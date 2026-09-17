/* ============================================================
   audio.js — Motor de audio 100 % sintetizado (Web Audio API)
   Efectos (láser, explosiones, impactos, power-ups) + música
   procedural (bajo, arpegio, kick, hats con delay espacial).
   ============================================================ */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this._unlocked = false;
  }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  _now() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Debe llamarse desde un gesto del usuario (política de los navegadores). */
  unlock() {
    if (this._unlocked) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);

    // delay ambiental para la música
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.29;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.master);
    this.musicDelay = delay;

    this._buildEngine();
    this._unlocked = true;
    this._startMusic();
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume()  { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setSfx(on)  { this.sfxOn = on; }
  setMusic(on) { this.musicOn = on; }

  /* ---------------- ruido ---------------- */
  _noise(dur) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.7);
    return buf;
  }
  _env(g, t, a, d, peak, base = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(base, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(base, t + a + d);
  }

  /* ---------------- motor de la nave ---------------- */
  _buildEngine() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 320; filter.Q.value = 2;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 48;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 48.7;
    const o3 = ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 96;
    const g3 = ctx.createGain(); g3.gain.value = 0.5;
    o1.connect(filter); o2.connect(filter); o3.connect(g3); g3.connect(filter);
    filter.connect(this.engineGain); this.engineGain.connect(this.sfxBus);
    o1.start(); o2.start(); o3.start();
    this._engine = { o1, o2, o3, filter };
  }
  engine(on) {
    if (!this.ctx) return;
    const t = this._now();
    this.engineGain.gain.cancelScheduledValues(t);
    this.engineGain.gain.setTargetAtTime(on ? 0.13 : 0, t, 0.18);
  }
  engineUpdate(speed01, boost) {
    if (!this.ctx || !this.running) return;
    const t = this._now();
    const f = 42 + speed01 * 55 + (boost ? 30 : 0);
    this._engine.o1.frequency.setTargetAtTime(f, t, 0.08);
    this._engine.o2.frequency.setTargetAtTime(f * 1.013, t, 0.08);
    this._engine.o3.frequency.setTargetAtTime(f * 2, t, 0.08);
    this._engine.filter.frequency.setTargetAtTime(260 + speed01 * 900 + (boost ? 500 : 0), t, 0.1);
  }

  /* ---------------- efectos ---------------- */
  shoot() {
    if (!this.ctx || !this.sfxOn || !this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(920, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.12);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3400;
    const g = ctx.createGain(); this._env(g, t, 0.004, 0.13, 0.15);
    o.connect(f); f.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.16);
  }
  boom(big = false) {
    if (!this.ctx || !this.sfxOn || !this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = big ? 0.9 : 0.45;
    const src = ctx.createBufferSource(); src.buffer = this._noise(dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(big ? 1600 : 2600, t);
    f.frequency.exponentialRampToValueAtTime(90, t + dur);
    const g = ctx.createGain(); this._env(g, t, 0.005, dur, big ? 0.55 : 0.28);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(big ? 110 : 150, t);
    o.frequency.exponentialRampToValueAtTime(34, t + dur * 0.7);
    const g2 = ctx.createGain(); this._env(g2, t, 0.005, dur * 0.7, big ? 0.5 : 0.28);
    o.connect(g2); g2.connect(this.sfxBus);
    o.start(t); o.stop(t + dur);
  }
  hitShield() {
    if (!this.ctx || !this.sfxOn || !this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noise(0.22);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
    const g = ctx.createGain(); this._env(g, t, 0.004, 0.2, 0.26);
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start(t);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.16);
    const g2 = ctx.createGain(); this._env(g2, t, 0.004, 0.16, 0.2);
    o.connect(g2); g2.connect(this.sfxBus); o.start(t); o.stop(t + 0.2);
  }
  power() {
    if (!this.ctx || !this.sfxOn || !this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [523.25, 659.25, 880].forEach((fr, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      const g = ctx.createGain();
      this._env(g, t + i * 0.07, 0.005, 0.12, 0.16);
      o.connect(g); g.connect(this.sfxBus);
      o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.16);
    });
  }
  click() {
    if (!this.ctx || !this.sfxOn || !this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 660;
    const g = ctx.createGain(); this._env(g, t, 0.002, 0.05, 0.08);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.08);
  }
  die() {
    if (!this.ctx || !this.sfxOn || !this.running) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 1.2);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    const g = ctx.createGain(); this._env(g, t, 0.01, 1.2, 0.22);
    o.connect(f); f.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 1.3);
  }

  /* ---------------- música procedural ----------------
     A menor · 100 BPM · progresión Am F G C
     1 compás = 8 corcheas (0.3 s) · 32 pasos = 4 compases */
  _startMusic() {
    this._stepIdx = 0;
    this._nextTime = this.ctx.currentTime + 0.15;
    this._schedTimer = setInterval(() => this._schedule(), 50);
  }
  _schedule() {
    if (!this.ctx) return;
    if (!this.musicOn || this.ctx.state !== 'running') {
      this._nextTime = Math.max(this._nextTime, this.ctx.currentTime + 0.15);
      return;
    }
    if (this._nextTime < this.ctx.currentTime - 0.4) this._nextTime = this.ctx.currentTime + 0.05;
    while (this._nextTime < this.ctx.currentTime + 0.35) {
      this._step(this._stepIdx, this._nextTime);
      this._nextTime += 0.3;
      this._stepIdx = (this._stepIdx + 1) % 32;
    }
  }
  _step(i, t) {
    const bar = (i >> 3) & 3;      // 0..3
    const s = i & 7;               // 0..7 dentro del compás
    if (s % 2 === 0) this._kick(t);
    else this._hat(t);

    const roots = [55.0, 43.65, 49.0, 65.41];          // A1 F1 G1 C2
    const root = roots[bar];
    const pat = [1, 1, 1.5, 1, 1, 1.5, 2, 1.5];
    this._bass(root * pat[s], t);

    const chords = [
      [220.0, 261.63, 329.63, 440.0],   // Am
      [174.61, 220.0, 261.63, 349.23],  // F
      [196.0, 246.94, 293.66, 392.0],   // G
      [220.0, 293.66, 392.0, 493.88],   // C
    ];
    const ch = chords[bar];
    const arp = [0, 2, 1, 3, 2, 3, 1, 2];
    this._arp(ch[arp[s]], t);
  }
  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain(); this._env(g, t, 0.002, 0.16, 0.5);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.2);
  }
  _hat(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this._noise(0.05);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); this._env(g, t, 0.001, 0.045, 0.07);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t);
  }
  _bass(freq, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 430; f.Q.value = 3;
    const g = ctx.createGain(); this._env(g, t, 0.008, 0.24, 0.17);
    o.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.3);
  }
  _arp(freq, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain(); this._env(g, t, 0.004, 0.17, 0.05);
    o.connect(g); g.connect(this.musicBus); g.connect(this.musicDelay);
    o.start(t); o.stop(t + 0.22);
  }
}

export const audio = new AudioEngine();
