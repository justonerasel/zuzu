import React, { useRef, useEffect } from 'react';
import {
  OrbStyleId,
  OrbColorScheme,
  OrbRotationSpeed,
  OrbGlowIntensity,
  OrbParticleDensity
} from '../types';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface ParticleOrbProps {
  state?: OrbState;
  style?: OrbStyleId;
  colorScheme?: OrbColorScheme;
  rotationSpeed?: OrbRotationSpeed;
  glowIntensity?: OrbGlowIntensity;
  particleDensity?: OrbParticleDensity;
  onClick?: () => void;
  size?: number;
}

const BUCKET_COUNT = 12;

interface PaletteConfig {
  haloInner: string;
  haloMid: string;
  ring: string;
  ringBack: string;
  bucketsIdle: string[];
  bucketsActive: string[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function buildPaletteBuckets(
  baseRgb: [number, number, number],
  midRgb: [number, number, number],
  highRgb: [number, number, number],
  dimMode: boolean
): string[] {
  const buckets: string[] = new Array(BUCKET_COUNT);
  for (let b = 0; b < BUCKET_COUNT; b++) {
    const t = b / (BUCKET_COUNT - 1);
    let r: number;
    let g: number;
    let bl: number;
    if (t < 0.55) {
      const k = t / 0.55;
      r = Math.round(lerp(baseRgb[0], midRgb[0], k));
      g = Math.round(lerp(baseRgb[1], midRgb[1], k));
      bl = Math.round(lerp(baseRgb[2], midRgb[2], k));
    } else {
      const k = (t - 0.55) / 0.45;
      r = Math.round(lerp(midRgb[0], highRgb[0], k));
      g = Math.round(lerp(midRgb[1], highRgb[1], k));
      bl = Math.round(lerp(midRgb[2], highRgb[2], k));
    }

    const alpha = dimMode
      ? 0.14 + Math.pow(t, 1.25) * 0.48
      : 0.22 + Math.pow(t, 1.15) * 0.78;
    buckets[b] = `rgba(${r}, ${g}, ${bl}, ${alpha.toFixed(3)})`;
  }
  return buckets;
}

function getPalette(scheme: OrbColorScheme, state: OrbState): PaletteConfig {
  if (state === 'error') {
    return {
      haloInner: 'rgba(244, 63, 94, 0.34)',
      haloMid: 'rgba(190, 24, 93, 0.16)',
      ring: 'rgba(253, 164, 175, 0.55)',
      ringBack: 'rgba(244, 63, 94, 0.22)',
      bucketsIdle: buildPaletteBuckets([136, 19, 55], [225, 29, 72], [254, 205, 211], true),
      bucketsActive: buildPaletteBuckets([159, 18, 57], [244, 63, 94], [255, 241, 242], false)
    };
  }

  switch (scheme) {
    case 'cyan':
      return {
        haloInner: 'rgba(56, 189, 248, 0.32)',
        haloMid: 'rgba(14, 165, 233, 0.14)',
        ring: 'rgba(186, 230, 253, 0.52)',
        ringBack: 'rgba(56, 189, 248, 0.2)',
        bucketsIdle: buildPaletteBuckets([12, 74, 110], [56, 189, 248], [224, 242, 254], true),
        bucketsActive: buildPaletteBuckets([14, 116, 144], [56, 189, 248], [255, 255, 255], false)
      };
    case 'rose':
      return {
        haloInner: 'rgba(244, 114, 182, 0.32)',
        haloMid: 'rgba(225, 29, 72, 0.14)',
        ring: 'rgba(251, 207, 232, 0.52)',
        ringBack: 'rgba(244, 114, 182, 0.2)',
        bucketsIdle: buildPaletteBuckets([131, 24, 67], [244, 114, 182], [252, 231, 243], true),
        bucketsActive: buildPaletteBuckets([157, 23, 77], [244, 114, 182], [255, 255, 255], false)
      };
    case 'mint':
      return {
        haloInner: 'rgba(52, 211, 153, 0.3)',
        haloMid: 'rgba(16, 185, 129, 0.14)',
        ring: 'rgba(167, 243, 208, 0.52)',
        ringBack: 'rgba(52, 211, 153, 0.2)',
        bucketsIdle: buildPaletteBuckets([6, 78, 59], [52, 211, 153], [209, 250, 229], true),
        bucketsActive: buildPaletteBuckets([4, 120, 87], [52, 211, 153], [255, 255, 255], false)
      };
    case 'amber':
      return {
        haloInner: 'rgba(251, 191, 36, 0.3)',
        haloMid: 'rgba(217, 119, 6, 0.14)',
        ring: 'rgba(253, 230, 138, 0.52)',
        ringBack: 'rgba(251, 191, 36, 0.2)',
        bucketsIdle: buildPaletteBuckets([120, 53, 15], [251, 191, 36], [254, 243, 199], true),
        bucketsActive: buildPaletteBuckets([180, 83, 9], [251, 191, 36], [255, 255, 255], false)
      };
    case 'purple':
    default:
      return {
        haloInner: 'rgba(168, 85, 247, 0.34)',
        haloMid: 'rgba(109, 40, 217, 0.15)',
        ring: 'rgba(233, 213, 255, 0.56)',
        ringBack: 'rgba(168, 85, 247, 0.22)',
        bucketsIdle: buildPaletteBuckets([76, 29, 149], [168, 85, 247], [243, 232, 255], true),
        bucketsActive: buildPaletteBuckets([107, 33, 168], [192, 132, 252], [255, 255, 255], false)
      };
  }
}

export const ParticleOrb: React.FC<ParticleOrbProps> = ({
  state = 'idle',
  colorScheme = 'purple',
  rotationSpeed = 'normal',
  glowIntensity = 'medium',
  particleDensity = 'standard',
  onClick,
  size = 230
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const stateRef = useRef<OrbState>(state);
  const colorRef = useRef<OrbColorScheme>(colorScheme);
  const speedRef = useRef<OrbRotationSpeed>(rotationSpeed);
  const glowRef = useRef<OrbGlowIntensity>(glowIntensity);
  const micTargetRef = useRef<number>(0);
  const lastMicEventAtRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = state;
    colorRef.current = colorScheme;
    speedRef.current = rotationSpeed;
    glowRef.current = glowIntensity;
    if (state !== 'listening') {
      micTargetRef.current = 0;
    }
  }, [state, colorScheme, rotationSpeed, glowIntensity]);

  // Subscribe to passive live microphone RMS events emitted by speech pipeline
  useEffect(() => {
    const onMicLevel = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const lvl = Number(detail?.level ?? 0);
      micTargetRef.current = Math.max(0, Math.min(1, Number.isFinite(lvl) ? lvl : 0));
      lastMicEventAtRef.current = performance.now();
    };
    window.addEventListener('zuzu-mic-level', onMicLevel);
    return () => {
      window.removeEventListener('zuzu-mic-level', onMicLevel);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clean devicePixelRatio capped at 2 for crisp rendering + smooth 60fps on mobile GPUs
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fibonacci sphere point count strictly within 3000 - 4000 fine dots
    const dotCount =
      particleDensity === 'eco'
        ? 3100
        : particleDensity === 'ultra'
        ? 3900
        : 3500;

    // Precompute unit Fibonacci sphere coordinates into flat typed arrays (zero per-frame GC)
    const uxArr = new Float32Array(dotCount);
    const uyArr = new Float32Array(dotCount);
    const uzArr = new Float32Array(dotCount);
    const thetaArr = new Float32Array(dotCount);
    const phiArr = new Float32Array(dotCount);

    const phiGolden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < dotCount; i++) {
      const uy = 1 - (2 * i) / (dotCount - 1);
      const rSlice = Math.sqrt(Math.max(0, 1 - uy * uy));
      const theta = phiGolden * i;
      uxArr[i] = Math.cos(theta) * rSlice;
      uyArr[i] = uy;
      uzArr[i] = Math.sin(theta) * rSlice;
      thetaArr[i] = theta;
      phiArr[i] = Math.acos(Math.max(-1, Math.min(1, uy)));
    }

    // Pre-allocate depth/brightness bucket buffers so rendering 3500+ dots needs no sort or save/restore
    const bucketX: Float32Array[] = [];
    const bucketY: Float32Array[] = [];
    const bucketS: Float32Array[] = [];
    const bucketCounts = new Int32Array(BUCKET_COUNT);
    for (let b = 0; b < BUCKET_COUNT; b++) {
      bucketX.push(new Float32Array(dotCount));
      bucketY.push(new Float32Array(dotCount));
      bucketS.push(new Float32Array(dotCount));
    }

    // Pre-build palettes for all schemes so zero string interpolation runs per frame
    const paletteCache = new Map<string, PaletteConfig>();
    const getCachedPalette = (scheme: OrbColorScheme, st: OrbState): PaletteConfig => {
      const key = `${scheme}:${st === 'error' ? 'error' : 'normal'}`;
      let p = paletteCache.get(key);
      if (!p) {
        p = getPalette(scheme, st);
        paletteCache.set(key, p);
      }
      return p;
    };

    const centerX = size / 2;
    const centerY = size / 2;
    // Sphere radius sized comfortably so listening pulses and thin outer ring never clip fixed container
    const baseRadius = size * 0.305;
    const fov = size * 1.45;
    const tiltX = 0.24;
    const cosTiltX = Math.cos(tiltX);
    const sinTiltX = Math.sin(tiltX);

    let angleY = 0;
    let time = 0;
    let micEnvelope = 0;
    let isPaused = typeof document !== 'undefined' ? document.hidden : false;
    let lastDrawMs = 0;
    let lastStepMs = performance.now();
    const minFrameMs = 1000 / 60; // Cap at 60 fps

    const renderFrame = (now: number) => {
      if (isPaused) {
        animFrameRef.current = null;
        return;
      }

      if (lastDrawMs !== 0 && now - lastDrawMs < minFrameMs - 0.8) {
        animFrameRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      const dt = Math.min(0.05, Math.max(0.004, (now - lastStepMs) / 1000));
      lastStepMs = now;
      lastDrawMs = now;

      const st = stateRef.current;
      const sp = speedRef.current;
      const gl = glowRef.current;
      const scheme = colorRef.current || 'purple';
      const palette = getCachedPalette(scheme, st);

      const speedScalar = sp === 'slow' ? 0.55 : sp === 'fast' ? 1.75 : 1.0;

      // Smooth microphone envelope when listening
      if (st === 'listening') {
        const hasRecentHardwareRms = now - lastMicEventAtRef.current < 420;
        const targetMic = hasRecentHardwareRms
          ? micTargetRef.current
          : 0.22 + 0.16 * Math.sin(time * 3.4) + 0.1 * Math.sin(time * 7.1);
        const blend = targetMic > micEnvelope ? Math.min(1, dt * 16) : Math.min(1, dt * 7);
        micEnvelope += (targetMic - micEnvelope) * blend;
      } else {
        micEnvelope += (0 - micEnvelope) * Math.min(1, dt * 10);
      }

      // State-specific rotation & wave rates
      let rotVel = 0.24 * speedScalar; // idle: slow gentle rotation
      let timeRate = 1.0;
      if (st === 'listening') {
        rotVel = (0.38 + micEnvelope * 0.45) * speedScalar;
        timeRate = 1.4;
      } else if (st === 'thinking') {
        rotVel = 0.88 * speedScalar; // faster swirl
        timeRate = 2.6;
      } else if (st === 'speaking') {
        rotVel = 0.44 * speedScalar;
        timeRate = 2.1;
      } else if (st === 'error') {
        rotVel = 0.18 * speedScalar;
        timeRate = 2.2;
      }

      angleY += rotVel * dt;
      time += dt * timeRate;

      ctx.clearRect(0, 0, size, size);

      // 1. Soft halo behind the sphere
      const glowMult = gl === 'soft' ? 0.85 : gl === 'intense' ? 1.15 : 1.0;
      const haloPulse =
        st === 'idle'
          ? 0.72
          : st === 'listening'
          ? 0.92 + micEnvelope * 0.35
          : st === 'speaking'
          ? 1.0 + Math.sin(time * 4.2) * 0.12
          : st === 'thinking'
          ? 0.96
          : 0.9;
      const haloRadius = baseRadius * 1.48 * glowMult * (1 + micEnvelope * 0.06);
      const haloAlphaScale = (st === 'idle' ? 0.58 : 1.0) * (gl === 'soft' ? 0.75 : gl === 'intense' ? 1.2 : 1.0);

      ctx.save();
      ctx.globalAlpha = Math.min(1, haloAlphaScale * haloPulse);
      const haloGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.12,
        centerX,
        centerY,
        haloRadius
      );
      haloGrad.addColorStop(0, palette.haloInner);
      haloGrad.addColorStop(0.52, palette.haloMid);
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, haloRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Back half of the single thin orbital ring (behind the sphere)
      const ringRx = baseRadius * (1.29 + micEnvelope * 0.12);
      const ringRy = ringRx * 0.31;
      const ringTilt = -0.34;
      const ringOpacity =
        st === 'idle' ? 0.42 : st === 'listening' ? 0.65 + micEnvelope * 0.25 : 0.72;

      ctx.save();
      ctx.globalAlpha = ringOpacity;
      ctx.strokeStyle = palette.ringBack;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, ringRx, ringRy, ringTilt, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 3. Transform, modulate by state, and bucket all 3000-4000 Fibonacci dots
      bucketCounts.fill(0);
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const isIdle = st === 'idle';
      const isListening = st === 'listening';
      const isThinking = st === 'thinking';
      const isSpeaking = st === 'speaking';
      const isError = st === 'error';

      const radialListeningGain = isListening ? micEnvelope * 0.22 : 0;
      const basePixelSize = size >= 240 ? 1.45 : 1.25;

      for (let i = 0; i < dotCount; i++) {
        let ux = uxArr[i];
        let uy = uyArr[i];
        let uz = uzArr[i];
        const theta = thetaArr[i];
        const phi = phiArr[i];

        let r = baseRadius;
        let crestBoost = 0;

        if (isIdle) {
          // Calm slow micro-breath
          r *= 1 + Math.sin(time * 0.9 + phi * 2) * 0.008;
        } else if (isListening) {
          // Pulse outward directly with microphone volume + subtle radial shimmer
          const subtleWave = Math.sin(time * 3.8 + phi * 3.0 + theta * 2.0) * (0.015 + micEnvelope * 0.035);
          r *= 1 + radialListeningGain + subtleWave;
          crestBoost = micEnvelope * 0.32;
        } else if (isThinking) {
          // Faster helical swirl across latitude bands
          const swirlAngle =
            Math.sin(phi * 2.4 - time * 2.4) * 0.55 +
            Math.cos(phi * 4.0 + time * 1.7) * 0.16;
          const cosS = Math.cos(swirlAngle);
          const sinS = Math.sin(swirlAngle);
          const sx = ux * cosS - uz * sinS;
          const sz = ux * sinS + uz * cosS;
          ux = sx;
          uz = sz;
          r *= 1 + Math.sin(phi * 3 - time * 2.8) * 0.035;
          crestBoost = 0.14 + 0.14 * Math.sin(theta * 2 + phi * 3 - time * 3.2);
        } else if (isSpeaking) {
          // Smooth ripples sweeping across the sphere surface
          const rippleA = Math.sin(phi * 6.5 - time * 5.2);
          const rippleB = Math.sin(theta * 3.0 + phi * 4.0 - time * 3.8);
          const ripple = rippleA * 0.65 + rippleB * 0.35;
          r *= 1 + ripple * 0.095;
          crestBoost = Math.max(0, ripple) * 0.38;
        } else if (isError) {
          const jitter = Math.sin(time * 12 + theta * 7 + phi * 5) * 0.025;
          r *= 1 + jitter;
          crestBoost = 0.15;
        }

        // Rotate Y then gentle fixed X tilt
        const x1 = ux * r;
        const y1 = uy * r;
        const z1 = uz * r;

        const rx1 = x1 * cosY + z1 * sinY;
        const rz1 = -x1 * sinY + z1 * cosY;

        const ry2 = y1 * cosTiltX - rz1 * sinTiltX;
        const rz2 = y1 * sinTiltX + rz1 * cosTiltX;

        const persp = fov / (fov + rz2);
        const x2d = centerX + rx1 * persp;
        const y2d = centerY + ry2 * persp;

        // Normalized depth (-1 back .. +1 front) mapped to [0..1]
        const depthNorm = Math.max(0, Math.min(1, (rz2 / (baseRadius * 1.15) + 1) * 0.5));
        const bNorm = Math.max(0, Math.min(1, depthNorm * 0.84 + crestBoost));
        const bIdx = Math.min(BUCKET_COUNT - 1, Math.floor(bNorm * BUCKET_COUNT));

        const c = bucketCounts[bIdx];
        bucketX[bIdx][c] = x2d;
        bucketY[bIdx][c] = y2d;
        bucketS[bIdx][c] = (basePixelSize * (0.68 + depthNorm * 0.65)) * persp;
        bucketCounts[bIdx] = c + 1;
      }

      const activeBuckets = isIdle ? palette.bucketsIdle : palette.bucketsActive;
      for (let b = 0; b < BUCKET_COUNT; b++) {
        const len = bucketCounts[b];
        if (len === 0) continue;
        ctx.fillStyle = activeBuckets[b];
        const xs = bucketX[b];
        const ys = bucketY[b];
        const ss = bucketS[b];
        for (let i = 0; i < len; i++) {
          const d = ss[i];
          const half = d * 0.5;
          ctx.fillRect(xs[i] - half, ys[i] - half, d, d);
        }
      }

      // 4. Front half of the single thin orbital ring (in front of the sphere)
      ctx.save();
      ctx.globalAlpha = ringOpacity;
      ctx.strokeStyle = palette.ring;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, ringRx, ringRy, ringTilt, 0, Math.PI);
      ctx.stroke();
      ctx.restore();

      animFrameRef.current = requestAnimationFrame(renderFrame);
    };

    const startLoop = () => {
      if (isPaused || animFrameRef.current !== null) return;
      lastStepMs = performance.now();
      lastDrawMs = 0;
      animFrameRef.current = requestAnimationFrame(renderFrame);
    };

    const stopLoop = () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true;
        stopLoop();
      } else {
        isPaused = false;
        startLoop();
      }
    };

    const handlePageHide = () => {
      isPaused = true;
      stopLoop();
    };

    const handlePageShow = () => {
      isPaused = document.hidden;
      if (!isPaused) startLoop();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    if (!isPaused) {
      startLoop();
    }

    return () => {
      stopLoop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [size, particleDensity]);

  return (
    <button
      type="button"
      aria-label="Zuzu Voice Orb"
      className="relative flex-shrink-0 flex items-center justify-center cursor-pointer select-none touch-manipulation bg-transparent border-0 p-0 focus:outline-none"
      onClick={onClick}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        maxWidth: size,
        maxHeight: size
      }}
    >
      <canvas
        ref={canvasRef}
        className="block pointer-events-none"
        style={{ width: size, height: size }}
      />
    </button>
  );
};
