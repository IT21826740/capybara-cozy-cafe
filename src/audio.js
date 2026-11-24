class CozyAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  tone(freq, duration = 0.12, type = 'sine', vol = 0.12, delay = 0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playPop() {
    this.tone(520, 0.08, 'triangle', 0.14);
    this.tone(720, 0.08, 'sine', 0.1, 0.04);
  }

  playWrong() {
    this.tone(220, 0.12, 'sawtooth', 0.08);
    this.tone(180, 0.14, 'sawtooth', 0.07, 0.08);
  }

  playCoin() {
    this.tone(987, 0.09, 'sine', 0.12);
    this.tone(1318, 0.18, 'sine', 0.13, 0.07);
  }

  playDing() {
    this.tone(880, 0.18, 'triangle', 0.11);
  }

  playSuccess() {
    this.tone(523, 0.1, 'triangle', 0.12, 0);
    this.tone(659, 0.1, 'triangle', 0.12, 0.08);
    this.tone(784, 0.2, 'triangle', 0.14, 0.16);
  }

  playClean() {
    this.tone(420, 0.08, 'sine', 0.1, 0);
    this.tone(640, 0.12, 'sine', 0.11, 0.06);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}

export const audio = new CozyAudio();