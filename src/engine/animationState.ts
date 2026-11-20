import { CrosshairConfig, LiveInputState } from '../types/crosshair';

export interface CrosshairRuntimeFrame {
  gapDelta: number;
  outerGapDelta: number;
  scaleMult: number;
  opacityMult: number;
  rotationDeltaDeg: number;
  recoilOffsetY: number;
  hitmarkerAlpha: number;
  colorOverride: string | null;
  rainbowHue: number | null;
  radarAngleRad: number;
  isAdsActive: boolean;
  useSecondaryProfile: boolean;
}

export class CrosshairAnimationController {
  private bloom = 0;
  private recoilY = 0;
  private pulseScale = 0;
  private spinDeg = 0;
  private fireFlash = 0;
  private hitmarker = 0;
  private adsBlend = 0;
  private adsToggled = false;
  private prevAdsTriggerDown = false;
  private prevFiringDown = false;
  private idleTime = 0;

  public reset(): void {
    this.bloom = 0;
    this.recoilY = 0;
    this.pulseScale = 0;
    this.spinDeg = 0;
    this.fireFlash = 0;
    this.hitmarker = 0;
    this.adsBlend = 0;
    this.adsToggled = false;
    this.prevAdsTriggerDown = false;
    this.prevFiringDown = false;
  }

  public triggerManualFirePulse(): void {
    this.bloom = Math.min(1, this.bloom + 0.65);
    this.recoilY = Math.min(1, this.recoilY + 0.85);
    this.pulseScale = 1;
    this.fireFlash = 1;
    this.hitmarker = 1;
  }

  private isAdsTriggerDown(config: CrosshairConfig, input: LiveInputState): boolean {
    switch (config.animation.adsTrigger) {
      case 'rmb':
        return input.rmb;
      case 'lt':
        return input.controller.ads;
      case 'rmb_or_lt':
        return input.rmb || input.controller.ads;
      case 'mmb':
        return input.mmb;
      case 'x1':
        return input.x1;
      case 'x2':
        return input.x2;
      case 'custom':
        return input.adsCustom;
      default:
        return false;
    }
  }

  public step(config: CrosshairConfig, input: LiveInputState, dtSec: number): CrosshairRuntimeFrame {
    const dt = Math.min(0.05, Math.max(0.001, dtSec));
    const anim = config.animation;
    this.idleTime += dt;

    // 1. ADS Trigger (Hold or Toggle)
    const triggerDown = this.isAdsTriggerDown(config, input);
    if (anim.adsMode === 'toggle') {
      if (triggerDown && !this.prevAdsTriggerDown) {
        this.adsToggled = !this.adsToggled;
      }
    } else {
      this.adsToggled = triggerDown;
    }
    this.prevAdsTriggerDown = triggerDown;

    const adsTarget = anim.adsAction !== 'none' && this.adsToggled ? 1 : 0;
    const fadeSec = Math.max(0.015, anim.adsFadeMs / 1000);
    const adsStep = dt / fadeSec;
    if (this.adsBlend < adsTarget) {
      this.adsBlend = Math.min(adsTarget, this.adsBlend + adsStep);
    } else if (this.adsBlend > adsTarget) {
      this.adsBlend = Math.max(adsTarget, this.adsBlend - adsStep);
    }

    // 2. Firing (LMB or Controller RT)
    const firingDown = input.lmb || input.controller.fire;
    const justFired = firingDown && !this.prevFiringDown;
    this.prevFiringDown = firingDown;

    if (anim.firingEnabled) {
      if (firingDown) {
        this.bloom = Math.min(1, this.bloom + dt * anim.bloomSpeed * 0.65);
        this.recoilY = Math.min(1, this.recoilY + dt * anim.bloomSpeed * 0.8);
        this.fireFlash = 1;
        if (justFired) {
          this.pulseScale = 1;
          this.hitmarker = 1;
          this.bloom = Math.min(1, this.bloom + 0.35);
        }
        if (anim.firingType === 'spin') {
          this.spinDeg = (this.spinDeg + dt * 360 * (0.7 + anim.bloomSpeed * 0.08)) % 360;
        }
      } else {
        this.bloom = Math.max(0, this.bloom - dt * anim.recoverySpeed * 0.45);
        this.recoilY = Math.max(0, this.recoilY - dt * anim.recoverySpeed * 0.55);
        this.fireFlash = Math.max(0, this.fireFlash - dt * 8);
      }
      this.pulseScale = Math.max(0, this.pulseScale - dt * 7);
      this.hitmarker = Math.max(0, this.hitmarker - dt * 5.5);
    } else {
      this.bloom = Math.max(0, this.bloom - dt * 10);
      this.recoilY = Math.max(0, this.recoilY - dt * 10);
      this.pulseScale = 0;
      this.fireFlash = 0;
      this.hitmarker = 0;
    }

    // 3. Movement Spread (WASD / Stick / Sprint / Crouch / Jump)
    let moveSpread = 0;
    if (anim.movementBloomEnabled) {
      if (input.moving) {
        moveSpread = anim.movementSpreadPx * (input.sprint ? anim.sprintMultiplier : 1);
      }
      if (input.jump) {
        moveSpread += anim.movementSpreadPx * 0.9;
      }
      if (input.crouch) {
        moveSpread -= anim.crouchTightenPx;
      }
    }

    // 4. Compute firing offsets by mode
    let gapDelta = moveSpread;
    let recoilOffsetY = 0;
    let scaleMult = 1;
    let rotationDeltaDeg = 0;
    let colorOverride: string | null = null;
    let hitmarkerAlpha = 0;

    if (anim.firingEnabled) {
      switch (anim.firingType) {
        case 'bloom':
          gapDelta += this.bloom * anim.bloomAmount;
          break;
        case 'recoil':
          gapDelta += this.bloom * (anim.bloomAmount * 0.45);
          recoilOffsetY = -this.recoilY * anim.recoilKickPx;
          break;
        case 'pulse':
          scaleMult += this.pulseScale * (0.12 + anim.bloomAmount * 0.015);
          break;
        case 'spin':
          rotationDeltaDeg += this.spinDeg;
          gapDelta += this.bloom * (anim.bloomAmount * 0.3);
          break;
        case 'flash':
          if (this.fireFlash > 0.1) {
            colorOverride = anim.fireColor;
          }
          gapDelta += this.bloom * (anim.bloomAmount * 0.25);
          break;
        case 'hitmarker':
          hitmarkerAlpha = this.hitmarker;
          gapDelta += this.bloom * (anim.bloomAmount * 0.2);
          break;
        case 'none':
        default:
          break;
      }
    }

    // 5. Idle / Continuous Animations
    let opacityMult = 1;
    let rainbowHue: number | null = null;
    let radarAngleRad = 0;

    switch (anim.idleType) {
      case 'breathe': {
        const wave = Math.sin(this.idleTime * anim.idleSpeed * 3.2);
        scaleMult *= 1 + wave * 0.14 * anim.idleIntensity;
        opacityMult *= 1 - (1 - (wave * 0.5 + 0.5)) * 0.35 * anim.idleIntensity;
        break;
      }
      case 'spin': {
        rotationDeltaDeg = (rotationDeltaDeg + this.idleTime * 90 * anim.idleSpeed) % 360;
        break;
      }
      case 'rainbow': {
        rainbowHue = (this.idleTime * 110 * anim.idleSpeed) % 360;
        break;
      }
      case 'radar': {
        radarAngleRad = (this.idleTime * Math.PI * 1.4 * anim.idleSpeed) % (Math.PI * 2);
        break;
      }
      case 'none':
      default:
        break;
    }

    // 6. Apply ADS behavior
    let useSecondaryProfile = false;
    if (this.adsBlend > 0.001) {
      switch (anim.adsAction) {
        case 'hide':
          opacityMult *= 1 - this.adsBlend;
          break;
        case 'dim':
          opacityMult *= 1 - this.adsBlend * (1 - anim.adsDimOpacity);
          break;
        case 'shrink':
          gapDelta -= this.adsBlend * anim.adsShrinkGapPx;
          break;
        case 'switch':
          useSecondaryProfile = this.adsBlend >= 0.5 && !!anim.adsSecondaryProfileId;
          break;
        case 'none':
        default:
          break;
      }
    }

    const outerGapDelta = gapDelta * config.outerLines.bloomMultiplier;

    return {
      gapDelta,
      outerGapDelta,
      scaleMult,
      opacityMult: Math.max(0, Math.min(1, opacityMult)),
      rotationDeltaDeg,
      recoilOffsetY,
      hitmarkerAlpha,
      colorOverride,
      rainbowHue,
      radarAngleRad,
      isAdsActive: this.adsToggled && anim.adsAction !== 'none',
      useSecondaryProfile,
    };
  }
}

export const STATIC_FRAME: CrosshairRuntimeFrame = {
  gapDelta: 0,
  outerGapDelta: 0,
  scaleMult: 1,
  opacityMult: 1,
  rotationDeltaDeg: 0,
  recoilOffsetY: 0,
  hitmarkerAlpha: 0,
  colorOverride: null,
  rainbowHue: null,
  radarAngleRad: 0,
  isAdsActive: false,
  useSecondaryProfile: false,
};
