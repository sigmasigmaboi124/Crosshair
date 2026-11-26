import { AudioGameProfile } from '../types/crosshair';

class AimAudioSynth {
  private ctx: AudioContext | null = null;
  private previewStopTimer: number | null = null;

  private getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playHit(volume = 0.35, streak = 1): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pitchBoost = Math.min(280, streak * 14);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(640 + pitchBoost, now);
    osc.frequency.exponentialRampToValueAtTime(1120 + pitchBoost, now + 0.045);

    gain.gain.setValueAtTime(volume * 0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playKill(volume = 0.4): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.03);
      gain.gain.setValueAtTime(volume * 0.32, now + i * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.03);
      osc.stop(now + i * 0.03 + 0.12);
    });
  }

  public playMiss(volume = 0.25): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.06);
    gain.gain.setValueAtTime(volume * 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playTrackTick(volume = 0.2): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);
    gain.gain.setValueAtTime(volume * 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  public playFinish(volume = 0.4): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(volume * 0.3, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.26);
    });
  }

  /**
   * Plays a realistic 2.5s tactical sequence (4 quiet footsteps -> 2 loud gunshots + explosion rumble -> 2 footsteps)
   * either raw (bypass=true) or processed through the active profile's 5-band Footstep EQ + Gunshot Ceiling Limiter.
   */
  public playLimiterSoundCheck(profile: AudioGameProfile, bypassDsp = false, onDone?: () => void): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    if (this.previewStopTimer !== null) {
      window.clearTimeout(this.previewStopTimer);
      this.previewStopTimer = null;
    }

    const now = ctx.currentTime + 0.03;
    const masterOut = ctx.createGain();
    masterOut.gain.value = 0.55;
    masterOut.connect(ctx.destination);

    let chainInput: AudioNode = masterOut;

    if (!bypassDsp) {
      // Brickwall ceiling waveshaper
      const shaper = ctx.createWaveShaper();
      const ceilingLin = Math.pow(10, Math.max(-30, Math.min(-2, profile.ceilingDb)) / 20);
      const curve = new Float32Array(2048);
      for (let i = 0; i < 2048; i++) {
        const x = (i / 1023.5) - 1;
        curve[i] = Math.max(-ceilingLin, Math.min(ceilingLin, x));
      }
      shaper.curve = curve;
      shaper.connect(masterOut);

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(Math.min(profile.ceilingDb - 2, profile.thresholdDb), now);
      comp.knee.setValueAtTime(4, now);
      comp.ratio.setValueAtTime(Math.max(2, Math.min(20, profile.ratio)), now);
      comp.attack.setValueAtTime(0.002, now);
      comp.release.setValueAtTime(Math.max(0.025, Math.min(0.35, profile.releaseMs / 1000)), now);
      comp.connect(shaper);

      const makeup = ctx.createGain();
      makeup.gain.setValueAtTime(Math.pow(10, (profile.footstepLiftDb * 0.65) / 20), now);
      makeup.connect(comp);

      const bHigh = ctx.createBiquadFilter();
      bHigh.type = 'highshelf';
      bHigh.frequency.value = 7500;
      bHigh.gain.value = profile.trebleTameDb;
      bHigh.connect(makeup);

      const bPres = ctx.createBiquadFilter();
      bPres.type = 'peaking';
      bPres.frequency.value = 3400;
      bPres.Q.value = 1.4;
      bPres.gain.value = profile.presenceGainDb;
      bPres.connect(bHigh);

      const bStep = ctx.createBiquadFilter();
      bStep.type = 'peaking';
      bStep.frequency.value = 1800;
      bStep.Q.value = 1.25;
      bStep.gain.value = profile.footstepMidGainDb;
      bStep.connect(bPres);

      const bMud = ctx.createBiquadFilter();
      bMud.type = 'peaking';
      bMud.frequency.value = 350;
      bMud.Q.value = 1.1;
      bMud.gain.value = profile.lowMidGainDb;
      bMud.connect(bStep);

      const bSub = ctx.createBiquadFilter();
      bSub.type = 'lowshelf';
      bSub.frequency.value = 110;
      bSub.gain.value = profile.subBassCutDb;
      bSub.connect(bMud);

      chainInput = bSub;
    }

    const noiseLen = Math.floor(ctx.sampleRate * 0.4);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const triggerFootstep = (t: number, panOffset: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1750 + panOffset * 260;
      bp.Q.value = 2.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.075, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.075);
      src.connect(bp);
      bp.connect(g);
      g.connect(chainInput);
      src.start(t);
      src.stop(t + 0.09);
    };

    const triggerGunshotAndBoom = (t: number, withSubBoom: boolean) => {
      // Sharp rifle crack
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 650;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.95, t);
      g.gain.exponentialRampToValueAtTime(0.002, t + 0.16);
      src.connect(hp);
      hp.connect(g);
      g.connect(chainInput);
      src.start(t);
      src.stop(t + 0.18);

      // Low-end muzzle / explosion thump
      const sub = ctx.createOscillator();
      const subG = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(withSubBoom ? 105 : 140, t);
      sub.frequency.exponentialRampToValueAtTime(38, t + (withSubBoom ? 0.28 : 0.12));
      subG.gain.setValueAtTime(withSubBoom ? 0.92 : 0.65, t);
      subG.gain.exponentialRampToValueAtTime(0.001, t + (withSubBoom ? 0.3 : 0.14));
      sub.connect(subG);
      subG.connect(chainInput);
      sub.start(t);
      sub.stop(t + 0.32);
    };

    // Sequence: 4 footsteps -> rifle shot -> grenade/shot -> 2 footsteps right after
    triggerFootstep(now + 0.05, -0.4);
    triggerFootstep(now + 0.38, 0.4);
    triggerFootstep(now + 0.71, -0.3);
    triggerFootstep(now + 1.04, 0.3);
    triggerGunshotAndBoom(now + 1.38, false);
    triggerGunshotAndBoom(now + 1.62, true);
    triggerFootstep(now + 1.98, -0.2);
    triggerFootstep(now + 2.30, 0.2);

    this.previewStopTimer = window.setTimeout(() => {
      this.previewStopTimer = null;
      onDone?.();
    }, 2550);
  }
}

export const aimAudio = new AimAudioSynth();
