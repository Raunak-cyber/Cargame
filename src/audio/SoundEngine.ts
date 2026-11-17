import { AudioSettings, CarSpec } from '../types/game';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private turboOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private screechSource: AudioBufferSourceNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;

  private nitroSource: AudioBufferSourceNode | null = null;
  private nitroGain: GainNode | null = null;

  private musicTimer: number | null = null;
  private musicStep = 0;

  private settings: AudioSettings = {
    master: 0.7,
    engine: 0.75,
    sfx: 0.8,
    music: 0.45,
    muted: false,
  };

  private initialized = false;

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      this.masterGain = ctx.createGain();
      this.engineGain = ctx.createGain();
      this.sfxGain = ctx.createGain();
      this.musicGain = ctx.createGain();

      this.engineGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);

      // Engine synth chain
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 340;
      this.engineFilter.Q.value = 2.2;

      const engineAmp = ctx.createGain();
      engineAmp.gain.value = 0.0;

      this.engineOsc1 = ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.value = 55;

      this.engineOsc2 = ctx.createOscillator();
      this.engineOsc2.type = 'triangle';
      this.engineOsc2.frequency.value = 110;

      const turboGain = ctx.createGain();
      turboGain.gain.value = 0.04;
      this.turboOsc = ctx.createOscillator();
      this.turboOsc.type = 'sine';
      this.turboOsc.frequency.value = 680;
      this.turboOsc.connect(turboGain);
      turboGain.connect(this.engineFilter);

      this.engineOsc1.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(engineAmp);
      engineAmp.connect(this.engineGain);

      this.engineOsc1.start();
      this.engineOsc2.start();
      this.turboOsc.start();
      (this.engineFilter as unknown as { _amp: GainNode })._amp = engineAmp;

      // Noise buffer for tire screech & nitro jet
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      // Tire screech chain
      this.screechFilter = ctx.createBiquadFilter();
      this.screechFilter.type = 'bandpass';
      this.screechFilter.frequency.value = 1350;
      this.screechFilter.Q.value = 5.5;
      this.screechGain = ctx.createGain();
      this.screechGain.gain.value = 0;
      this.screechSource = ctx.createBufferSource();
      this.screechSource.buffer = noiseBuffer;
      this.screechSource.loop = true;
      this.screechSource.connect(this.screechFilter);
      this.screechFilter.connect(this.screechGain);
      this.screechGain.connect(this.sfxGain);
      this.screechSource.start();

      // Nitro jet chain
      const nitroFilter = ctx.createBiquadFilter();
      nitroFilter.type = 'bandpass';
      nitroFilter.frequency.value = 620;
      nitroFilter.Q.value = 1.2;
      this.nitroGain = ctx.createGain();
      this.nitroGain.gain.value = 0;
      this.nitroSource = ctx.createBufferSource();
      this.nitroSource.buffer = noiseBuffer;
      this.nitroSource.loop = true;
      this.nitroSource.connect(nitroFilter);
      nitroFilter.connect(this.nitroGain);
      this.nitroGain.connect(this.sfxGain);
      this.nitroSource.start();

      this.initialized = true;
      this.applySettings(this.settings);
    } catch {
      // AudioContext unavailable in restricted headless environments
    }
  }

  public applySettings(settings: AudioSettings): void {
    this.settings = { ...settings };
    if (!this.ctx || !this.masterGain || !this.engineGain || !this.sfxGain || !this.musicGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const master = settings.muted ? 0 : settings.master;
    this.masterGain.gain.setTargetAtTime(master, now, 0.04);
    this.engineGain.gain.setTargetAtTime(settings.engine * 0.25, now, 0.04);
    this.sfxGain.gain.setTargetAtTime(settings.sfx * 0.35, now, 0.04);
    this.musicGain.gain.setTargetAtTime(settings.music * 0.18, now, 0.05);
  }

  public updateDriving(
    active: boolean,
    spec: CarSpec,
    rpm: number,
    throttle: number,
    slipAngle: number,
    speedMs: number,
    nitroActive: boolean,
    braking: boolean
  ): void {
    if (!this.initialized || !this.ctx || !this.engineFilter) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;
    const engineAmp = (this.engineFilter as unknown as { _amp: GainNode })._amp;

    if (!active) {
      engineAmp.gain.setTargetAtTime(0, now, 0.06);
      this.screechGain?.gain.setTargetAtTime(0, now, 0.05);
      this.nitroGain?.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    const rpmNorm = Math.max(0, Math.min(1, (rpm - 900) / 7500));
    const freq = spec.audio.baseFreq + rpmNorm * (spec.audio.maxFreq - spec.audio.baseFreq);

    this.engineOsc1?.frequency.setTargetAtTime(freq, now, 0.03);
    this.engineOsc2?.frequency.setTargetAtTime(freq * 1.5, now, 0.03);
    this.turboOsc?.frequency.setTargetAtTime(600 + rpmNorm * 1900, now, 0.05);

    this.engineFilter.frequency.setTargetAtTime(
      260 + rpmNorm * 1200 + throttle * 550,
      now,
      0.04
    );
    engineAmp.gain.setTargetAtTime(0.22 + throttle * 0.22 + rpmNorm * 0.14, now, 0.04);

    // Tire screech when drifting or hard braking at speed
    const screechLevel =
      speedMs > 9 && (Math.abs(slipAngle) > 0.22 || (braking && speedMs > 18))
        ? Math.min(0.45, Math.abs(slipAngle) * 0.65 + (braking ? 0.18 : 0))
        : 0;
    this.screechGain?.gain.setTargetAtTime(screechLevel, now, 0.04);
    this.screechFilter?.frequency.setTargetAtTime(1100 + speedMs * 14, now, 0.05);

    // Nitro roar
    this.nitroGain?.gain.setTargetAtTime(nitroActive ? 0.42 : 0, now, 0.04);
  }

  public playCollision(intensity: number): void {
    if (!this.initialized || !this.ctx || !this.sfxGain || this.settings.muted) return;
    if (intensity < 2.5) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.18);

    const vol = Math.min(0.85, intensity * 0.045);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playUiClick(pitch = 520): void {
    if (!this.initialized || !this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.35, now + 0.055);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playCountdownBeep(final = false): void {
    if (!this.initialized || !this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(final ? 880 : 440, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (final ? 0.35 : 0.16));
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + (final ? 0.36 : 0.18));
  }

  public startMusic(): void {
    if (this.musicTimer !== null) return;
    this.init();
    const bassNotes = [55, 55, 65.41, 73.42, 55, 55, 82.41, 73.42];
    const arpNotes = [220, 261.63, 329.63, 440, 220, 293.66, 349.23, 392];

    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.settings.muted || this.settings.music <= 0.02) {
        return;
      }
      if (this.ctx.state === 'suspended') return;
      const now = this.ctx.currentTime;
      const idx = this.musicStep % bassNotes.length;

      // Bass pulse
      const bassOsc = this.ctx.createOscillator();
      const bassEnv = this.ctx.createGain();
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(bassNotes[idx], now);
      bassEnv.gain.setValueAtTime(0.16, now);
      bassEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
      bassOsc.connect(bassEnv);
      bassEnv.connect(this.musicGain);
      bassOsc.start(now);
      bassOsc.stop(now + 0.22);

      // Lead arp
      if (this.musicStep % 2 === 0) {
        const arpOsc = this.ctx.createOscillator();
        const arpEnv = this.ctx.createGain();
        arpOsc.type = 'triangle';
        arpOsc.frequency.setValueAtTime(arpNotes[idx], now);
        arpEnv.gain.setValueAtTime(0.08, now);
        arpEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        arpOsc.connect(arpEnv);
        arpEnv.connect(this.musicGain);
        arpOsc.start(now);
        arpOsc.stop(now + 0.2);
      }

      this.musicStep++;
    }, 220);
  }

  public stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  public dispose(): void {
    this.stopMusic();
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.turboOsc?.stop();
      this.screechSource?.stop();
      this.nitroSource?.stop();
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.initialized = false;
  }
}
