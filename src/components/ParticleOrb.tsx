import React, { useRef, useEffect, useState } from 'react';
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
  /** When set (e.g. 0.78 on Home), sizes orb to ~78% of screen width with a fixed state-independent size */
  responsiveWidthRatio?: number;
}

const DEPTH_BUCKETS = 10;

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface SchemePalette {
  primary: RGB;
  secondary: RGB;
  accent: RGB;
  deepCore: RGB;
  highlight: RGB;
  ring: RGB;
}

function rgbStr(c: RGB, alpha: number): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha.toFixed(3)})`;
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k)
  };
}

function getSchemePalette(scheme: OrbColorScheme, isError: boolean): SchemePalette {
  if (isError) {
    return {
      primary: { r: 239, g: 68, b: 68 },
      secondary: { r: 190, g: 24, b: 93 },
      accent: { r: 251, g: 113, b: 133 },
      deepCore: { r: 54, g: 10, b: 20 },
      highlight: { r: 254, g: 226, b: 226 },
      ring: { r: 253, g: 164, b: 175 }
    };
  }

  switch (scheme) {
    case 'cyan':
      return {
        primary: { r: 34, g: 211, b: 238 },
        secondary: { r: 37, g: 99, b: 235 },
        accent: { r: 129, g: 140, b: 248 },
        deepCore: { r: 8, g: 27, b: 56 },
        highlight: { r: 240, g: 253, b: 255 },
        ring: { r: 165, g: 243, b: 252 }
      };
    case 'rose':
      return {
        primary: { r: 244, g: 63, b: 94 },
        secondary: { r: 192, g: 38, b: 211 },
        accent: { r: 251, g: 113, b: 133 },
        deepCore: { r: 48, g: 10, b: 32 },
        highlight: { r: 255, g: 241, b: 245 },
        ring: { r: 253, g: 164, b: 175 }
      };
    case 'mint':
      return {
        primary: { r: 16, g: 185, b: 129 },
        secondary: { r: 6, g: 182, b: 212 },
        accent: { r: 110, g: 231, b: 183 },
        deepCore: { r: 6, g: 38, b: 30 },
        highlight: { r: 236, g: 253, b: 245 },
        ring: { r: 167, g: 243, b: 208 }
      };
    case 'amber':
      return {
        primary: { r: 245, g: 158, b: 11 },
        secondary: { r: 234, g: 88, b: 12 },
        accent: { r: 251, g: 191, b: 36 },
        deepCore: { r: 46, g: 20, b: 6 },
        highlight: { r: 255, g: 251, b: 235 },
        ring: { r: 253, g: 230, b: 138 }
      };
    case 'purple':
    default:
      return {
        primary: { r: 168, g: 85, b: 247 },
        secondary: { r: 109, g: 40, b: 217 },
        accent: { r: 217, g: 70, b: 239 },
        deepCore: { r: 22, g: 10, b: 52 },
        highlight: { r: 255, g: 255, b: 255 },
        ring: { r: 233, g: 213, b: 255 }
      };
  }
}

function buildDepthBucketStyles(
  backRgb: RGB,
  midRgb: RGB,
  frontRgb: RGB,
  minAlpha: number,
  maxAlpha: number
): string[] {
  const styles: string[] = new Array(DEPTH_BUCKETS);
  for (let b = 0; b < DEPTH_BUCKETS; b++) {
    const t = b / (DEPTH_BUCKETS - 1);
    const col =
      t < 0.55
        ? lerpRgb(backRgb, midRgb, t / 0.55)
        : lerpRgb(midRgb, frontRgb, (t - 0.55) / 0.45);
    const alpha = minAlpha + Math.pow(t, 0.9) * (maxAlpha - minAlpha);
    styles[b] = rgbStr(col, alpha);
  }
  return styles;
}

/** Build subdivided icosahedron mesh (frequency 4 => 162 vertices, 480 edges) */
function buildGeodesicMesh(subdivisions = 2): {
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  edges: Uint16Array;
} {
  const t = (1 + Math.sqrt(5)) / 2;
  const rawVerts: Array<[number, number, number]> = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ].map(([x, y, z]) => {
    const len = Math.hypot(x, y, z);
    return [x / len, y / len, z / len];
  });

  let faces: Array<[number, number, number]> = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  const midpointCache = new Map<string, number>();
  const getMid = (i1: number, i2: number): number => {
    const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
    const cached = midpointCache.get(key);
    if (cached !== undefined) return cached;
    const [x1, y1, z1] = rawVerts[i1];
    const [x2, y2, z2] = rawVerts[i2];
    const mx = (x1 + x2) * 0.5;
    const my = (y1 + y2) * 0.5;
    const mz = (z1 + z2) * 0.5;
    const len = Math.hypot(mx, my, mz) || 1;
    const idx = rawVerts.length;
    rawVerts.push([mx / len, my / len, mz / len]);
    midpointCache.set(key, idx);
    return idx;
  };

  for (let s = 0; s < subdivisions; s++) {
    const nextFaces: Array<[number, number, number]> = [];
    for (const [a, b, c] of faces) {
      const ab = getMid(a, b);
      const bc = getMid(b, c);
      const ca = getMid(c, a);
      nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nextFaces;
  }

  const edgeSet = new Set<string>();
  const edgeList: number[] = [];
  for (const [a, b, c] of faces) {
    const pairs: Array<[number, number]> = [[a, b], [b, c], [c, a]];
    for (const [p, q] of pairs) {
      const k = p < q ? `${p}_${q}` : `${q}_${p}`;
      if (!edgeSet.has(k)) {
        edgeSet.add(k);
        edgeList.push(p, q);
      }
    }
  }

  const vx = new Float32Array(rawVerts.length);
  const vy = new Float32Array(rawVerts.length);
  const vz = new Float32Array(rawVerts.length);
  for (let i = 0; i < rawVerts.length; i++) {
    vx[i] = rawVerts[i][0];
    vy[i] = rawVerts[i][1];
    vz[i] = rawVerts[i][2];
  }

  return {
    vx,
    vy,
    vz,
    edges: new Uint16Array(edgeList)
  };
}

function computeResponsiveOrbSize(ratio: number, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const vw = window.innerWidth || 390;
  const target = Math.round(vw * ratio);
  return Math.max(255, Math.min(340, target));
}

export const ParticleOrb: React.FC<ParticleOrbProps> = ({
  state = 'idle',
  style = 'purple_spiral_globe',
  colorScheme = 'purple',
  rotationSpeed = 'normal',
  glowIntensity = 'medium',
  particleDensity = 'standard',
  onClick,
  size = 260,
  responsiveWidthRatio
}) => {
  const [resolvedSize, setResolvedSize] = useState<number>(() =>
    responsiveWidthRatio ? computeResponsiveOrbSize(responsiveWidthRatio, size) : size
  );

  useEffect(() => {
    if (!responsiveWidthRatio) {
      setResolvedSize(size);
      return;
    }
    const updateSize = () => {
      setResolvedSize(computeResponsiveOrbSize(responsiveWidthRatio, size));
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [responsiveWidthRatio, size]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const stateRef = useRef<OrbState>(state);
  const prevStateRef = useRef<OrbState>(state);
  const errorStartMsRef = useRef<number>(0);
  const styleRef = useRef<OrbStyleId>(style);
  const colorRef = useRef<OrbColorScheme>(colorScheme);
  const speedRef = useRef<OrbRotationSpeed>(rotationSpeed);
  const glowRef = useRef<OrbGlowIntensity>(glowIntensity);
  const micTargetRef = useRef<number>(0);
  const lastMicEventAtRef = useRef<number>(0);

  useEffect(() => {
    if (state === 'error' && prevStateRef.current !== 'error') {
      errorStartMsRef.current = performance.now();
    }
    prevStateRef.current = state;
    stateRef.current = state;
    styleRef.current = style;
    colorRef.current = colorScheme;
    speedRef.current = rotationSpeed;
    glowRef.current = glowIntensity;
    if (state !== 'listening') {
      micTargetRef.current = 0;
    }
  }, [state, style, colorScheme, rotationSpeed, glowIntensity]);

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

    const canvasSize = resolvedSize;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvasSize * dpr);
    canvas.height = Math.round(canvasSize * dpr);
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Total dots strictly in 1500–2200 range for dot-based styles
    const dotCount =
      particleDensity === 'eco'
        ? 1500
        : particleDensity === 'ultra'
        ? 2200
        : 1850;

    // --- Geometry 1: Spiral Dot Globe (spiral rows from pole to pole) ---
    const spiralUx = new Float32Array(dotCount);
    const spiralUy = new Float32Array(dotCount);
    const spiralUz = new Float32Array(dotCount);
    const spiralPhi = new Float32Array(dotCount);
    const spiralTheta = new Float32Array(dotCount);
    const spiralIsWhite = new Uint8Array(dotCount);

    const numSpiralArms = 2;
    const spiralTurnsPerArm = 17;
    const dotsPerArm = Math.floor(dotCount / numSpiralArms);
    for (let i = 0; i < dotCount; i++) {
      const arm = i < dotsPerArm ? 0 : 1;
      const localIdx = arm === 0 ? i : i - dotsPerArm;
      const armLen = arm === 0 ? dotsPerArm : dotCount - dotsPerArm;
      const u = (localIdx + 0.5) / armLen;
      const uy = 1 - 2 * u;
      const rSlice = Math.sqrt(Math.max(0, 1 - uy * uy));
      const phi = Math.acos(Math.max(-1, Math.min(1, uy)));
      const theta = u * Math.PI * 2 * spiralTurnsPerArm + arm * Math.PI;
      spiralUx[i] = Math.cos(theta) * rSlice;
      spiralUy[i] = uy;
      spiralUz[i] = Math.sin(theta) * rSlice;
      spiralPhi[i] = phi;
      spiralTheta[i] = theta;
      // Alternating highlight strands + rhythmic white dots along the spiral rows
      spiralIsWhite[i] = arm === 1 && localIdx % 2 === 0 ? 1 : localIdx % 5 === 0 ? 1 : 0;
    }

    // Floating side particles around Style 1
    const ambientCount = 34;
    const ambientAngle = new Float32Array(ambientCount);
    const ambientRadiusMult = new Float32Array(ambientCount);
    const ambientYOffset = new Float32Array(ambientCount);
    const ambientSpeed = new Float32Array(ambientCount);
    const ambientSize = new Float32Array(ambientCount);
    for (let i = 0; i < ambientCount; i++) {
      // Cluster slightly more on the left & right flanks around the sphere
      const sideBias = i % 2 === 0 ? 0 : Math.PI;
      ambientAngle[i] = sideBias + ((i * 0.41) % (Math.PI * 0.7)) - Math.PI * 0.35;
      ambientRadiusMult[i] = 1.12 + ((i * 37) % 100) / 360;
      ambientYOffset[i] = (((i * 53) % 100) / 100 - 0.5) * 1.15;
      ambientSpeed[i] = 0.25 + ((i * 19) % 10) * 0.04;
      ambientSize[i] = 1.4 + ((i * 13) % 10) * 0.14;
    }

    // --- Geometry 3: Latitude & Longitude Particle Matrix ---
    const meridiansCount = particleDensity === 'eco' ? 20 : particleDensity === 'ultra' ? 26 : 24;
    const dotsPerMeridian = particleDensity === 'eco' ? 36 : particleDensity === 'ultra' ? 42 : 38;
    const parallelsCount = particleDensity === 'eco' ? 16 : particleDensity === 'ultra' ? 20 : 18;
    const dotsPerParallel = particleDensity === 'eco' ? 48 : particleDensity === 'ultra' ? 56 : 52;
    const matrixCount = meridiansCount * dotsPerMeridian + parallelsCount * dotsPerParallel;

    const matrixUx = new Float32Array(matrixCount);
    const matrixUy = new Float32Array(matrixCount);
    const matrixUz = new Float32Array(matrixCount);
    const matrixPhi = new Float32Array(matrixCount);
    const matrixTheta = new Float32Array(matrixCount);
    const matrixKind = new Uint8Array(matrixCount); // 0 = meridian, 1 = parallel
    const matrixLineIdx = new Uint8Array(matrixCount);

    let mPtr = 0;
    for (let m = 0; m < meridiansCount; m++) {
      const lon = (m / meridiansCount) * Math.PI * 2;
      for (let k = 0; k < dotsPerMeridian; k++) {
        const latFrac = (k + 0.5) / dotsPerMeridian;
        const phi = latFrac * Math.PI;
        const sinP = Math.sin(phi);
        matrixUx[mPtr] = Math.cos(lon) * sinP;
        matrixUy[mPtr] = Math.cos(phi);
        matrixUz[mPtr] = Math.sin(lon) * sinP;
        matrixPhi[mPtr] = phi;
        matrixTheta[mPtr] = lon;
        matrixKind[mPtr] = 0;
        matrixLineIdx[mPtr] = m;
        mPtr++;
      }
    }
    for (let p = 0; p < parallelsCount; p++) {
      const phi = ((p + 1) / (parallelsCount + 1)) * Math.PI;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      for (let k = 0; k < dotsPerParallel; k++) {
        const lon = (k / dotsPerParallel) * Math.PI * 2;
        matrixUx[mPtr] = Math.cos(lon) * sinP;
        matrixUy[mPtr] = cosP;
        matrixUz[mPtr] = Math.sin(lon) * sinP;
        matrixPhi[mPtr] = phi;
        matrixTheta[mPtr] = lon;
        matrixKind[mPtr] = 1;
        matrixLineIdx[mPtr] = p;
        mPtr++;
      }
    }

    // --- Geometry 4: Geodesic Wireframe Mesh ---
    const mesh = buildGeodesicMesh(2);
    const meshVCount = mesh.vx.length;
    const meshProjX = new Float32Array(meshVCount);
    const meshProjY = new Float32Array(meshVCount);
    const meshDepth = new Float32Array(meshVCount);
    const meshPulseVal = new Float32Array(meshVCount);

    // --- Shared dot batch buffers (size accommodates max of dotCount & matrixCount) ---
    const maxBatchPts = Math.max(dotCount, matrixCount);
    const primaryBucketX: Float32Array[] = [];
    const primaryBucketY: Float32Array[] = [];
    const primaryBucketR: Float32Array[] = [];
    const primaryCounts = new Int32Array(DEPTH_BUCKETS);

    const accentBucketX: Float32Array[] = [];
    const accentBucketY: Float32Array[] = [];
    const accentBucketR: Float32Array[] = [];
    const accentCounts = new Int32Array(DEPTH_BUCKETS);

    for (let b = 0; b < DEPTH_BUCKETS; b++) {
      primaryBucketX.push(new Float32Array(maxBatchPts));
      primaryBucketY.push(new Float32Array(maxBatchPts));
      primaryBucketR.push(new Float32Array(maxBatchPts));

      accentBucketX.push(new Float32Array(maxBatchPts));
      accentBucketY.push(new Float32Array(maxBatchPts));
      accentBucketR.push(new Float32Array(maxBatchPts));
    }

    const paletteCache = new Map<string, SchemePalette>();
    const bucketStyleCache = new Map<string, { primary: string[]; accent: string[] }>();

    const getPaletteCached = (scheme: OrbColorScheme, isErr: boolean): SchemePalette => {
      const k = `${scheme}:${isErr ? 'err' : 'ok'}`;
      let p = paletteCache.get(k);
      if (!p) {
        p = getSchemePalette(scheme, isErr);
        paletteCache.set(k, p);
      }
      return p;
    };

    const getBucketStyleCached = (
      modeKey: string,
      backA: RGB,
      midA: RGB,
      frontA: RGB,
      backB: RGB,
      midB: RGB,
      frontB: RGB,
      minAlpha: number
    ) => {
      let cached = bucketStyleCache.get(modeKey);
      if (!cached) {
        cached = {
          primary: buildDepthBucketStyles(backA, midA, frontA, minAlpha, 0.98),
          accent: buildDepthBucketStyles(backB, midB, frontB, Math.min(0.45, minAlpha + 0.1), 1.0)
        };
        bucketStyleCache.set(modeKey, cached);
      }
      return cached;
    };

    const baseCenterX = canvasSize / 2;
    const baseCenterY = canvasSize / 2;
    // Large sphere radius within fixed canvas; leaves margin for halo, thin ring, listening pulse & side particles
    const baseRadius = canvasSize * 0.345;
    const fov = canvasSize * 1.52;
    const tiltX = 0.23;
    const cosTiltX = Math.cos(tiltX);
    const sinTiltX = Math.sin(tiltX);

    // Dot radius scaled strictly in 1.8 - 3.5 CSS px at full Home scale, proportional in Settings preview
    const dotSizeScale = Math.max(0.76, Math.min(1.06, canvasSize / 295));
    const minDotR = 1.8 * dotSizeScale;
    const maxDotR = 3.45 * dotSizeScale;

    // Limit to ~30 fps on weak phones, ~50 fps on faster devices
    const isWeakPhone =
      (typeof navigator !== 'undefined' &&
        ((typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4) ||
          (typeof (navigator as any).deviceMemory === 'number' && (navigator as any).deviceMemory <= 4))) ||
      dpr <= 1.25;
    let adaptiveFpsCap = isWeakPhone ? 30 : 52;
    let slowFrameCount = 0;

    let angleY = 0;
    let time = 0;
    let micEnvelope = 0;
    let isPaused = typeof document !== 'undefined' ? document.hidden : false;
    let lastDrawMs = 0;
    let lastStepMs = performance.now();

    const drawBatchDots = (
      bucketsX: Float32Array[],
      bucketsY: Float32Array[],
      bucketsR: Float32Array[],
      counts: Int32Array,
      styles: string[]
    ) => {
      for (let b = 0; b < DEPTH_BUCKETS; b++) {
        const len = counts[b];
        if (len === 0) continue;
        ctx.fillStyle = styles[b];
        ctx.beginPath();
        const xs = bucketsX[b];
        const ys = bucketsY[b];
        const rs = bucketsR[b];
        for (let i = 0; i < len; i++) {
          const x = xs[i];
          const y = ys[i];
          const r = rs[i];
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };

    const drawSphereBackdrop = (
      cx: number,
      cy: number,
      radius: number,
      palette: SchemePalette,
      glowMult: number,
      st: OrbState,
      alphaBoost = 1.0
    ) => {
      // Soft outer halo behind the sphere
      const haloR = radius * 1.44 * glowMult;
      const haloGrad = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, haloR);
      const haloAlpha = (st === 'idle' ? 0.34 : 0.48) * Math.min(1.2, glowMult) * alphaBoost;
      haloGrad.addColorStop(0, rgbStr(palette.primary, Math.min(0.75, haloAlpha)));
      haloGrad.addColorStop(0.55, rgbStr(palette.secondary, Math.min(0.45, haloAlpha * 0.5)));
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Deep rich translucent sphere core so white & neon dots pop with high contrast on light & dark UI
      const coreGrad = ctx.createRadialGradient(
        cx - radius * 0.18,
        cy - radius * 0.2,
        radius * 0.08,
        cx,
        cy,
        radius * 1.03
      );
      coreGrad.addColorStop(0, rgbStr(lerpRgb(palette.secondary, palette.deepCore, 0.55), 0.92));
      coreGrad.addColorStop(0.62, rgbStr(palette.deepCore, 0.94));
      coreGrad.addColorStop(0.92, rgbStr(palette.secondary, 0.72));
      coreGrad.addColorStop(1, rgbStr(palette.primary, 0));
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.03, 0, Math.PI * 2);
      ctx.fill();
    };

    const renderFrame = (now: number) => {
      if (isPaused) {
        animFrameRef.current = null;
        return;
      }

      const minFrameMs = 1000 / adaptiveFpsCap;
      if (lastDrawMs !== 0 && now - lastDrawMs < minFrameMs - 0.8) {
        animFrameRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      const frameStart = performance.now();
      const dt = Math.min(0.055, Math.max(0.004, (now - lastStepMs) / 1000));
      lastStepMs = now;
      lastDrawMs = now;

      const st = stateRef.current;
      const activeStyle = styleRef.current || 'purple_spiral_globe';
      const scheme = colorRef.current || 'purple';
      const sp = speedRef.current || 'normal';
      const gl = glowRef.current || 'medium';

      const isError = st === 'error';
      const palette = getPaletteCached(scheme, isError);
      const speedScalar = sp === 'slow' ? 0.55 : sp === 'fast' ? 1.75 : 1.0;
      const glowMult = gl === 'soft' ? 0.86 : gl === 'intense' ? 1.16 : 1.0;

      // Smooth microphone RMS envelope when listening
      if (st === 'listening') {
        const hasHardwareRms = now - lastMicEventAtRef.current < 420;
        const targetMic = hasHardwareRms
          ? micTargetRef.current
          : 0.28 + 0.2 * Math.sin(time * 3.5) + 0.1 * Math.sin(time * 7.2);
        const blend = targetMic > micEnvelope ? Math.min(1, dt * 16) : Math.min(1, dt * 7);
        micEnvelope += (targetMic - micEnvelope) * blend;
      } else {
        micEnvelope += (0 - micEnvelope) * Math.min(1, dt * 10);
      }

      // State rotation & time velocity
      let rotVel = 0.22 * speedScalar;
      let timeRate = 1.0;
      if (st === 'listening') {
        rotVel = (0.34 + micEnvelope * 0.42) * speedScalar;
        timeRate = 1.35;
      } else if (st === 'thinking') {
        rotVel = 0.96 * speedScalar;
        timeRate = 2.65;
      } else if (st === 'speaking') {
        rotVel = 0.42 * speedScalar;
        timeRate = 2.15;
      } else if (st === 'error') {
        rotVel = 0.14 * speedScalar;
        timeRate = 2.0;
      }

      angleY += rotVel * dt;
      time += dt * timeRate;

      // Short decaying horizontal shake on Error
      let shakeX = 0;
      let shakeY = 0;
      if (isError) {
        const errElapsed = Math.max(0, (now - errorStartMsRef.current) / 1000);
        const decay = Math.exp(-errElapsed * 3.4);
        const amp = Math.max(0.8, 7.5 * decay);
        shakeX = Math.sin(errElapsed * 44) * amp;
        shakeY = Math.cos(errElapsed * 31) * amp * 0.28;
      }

      const cx = baseCenterX + shakeX;
      const cy = baseCenterY + shakeY;

      ctx.clearRect(0, 0, canvasSize, canvasSize);

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const isIdle = st === 'idle';
      const isListening = st === 'listening';
      const isThinking = st === 'thinking';
      const isSpeaking = st === 'speaking';
      const listenPulse = isListening ? micEnvelope * 0.145 : 0;

      // =========================================================================
      // STYLE 2: GLASS IRIDESCENT ORB (Smooth layered liquid waves, NOT dots)
      // =========================================================================
      if (activeStyle === 'glass_iridescent_wave') {
        const radius =
          baseRadius *
          (1 +
            listenPulse +
            (isIdle ? Math.sin(time * 1.1) * 0.014 : 0) +
            (isSpeaking ? Math.sin(time * 4.5) * 0.032 : 0));

        // Outer soft luminous aura
        const haloR = radius * 1.42 * glowMult;
        const haloGrad = ctx.createRadialGradient(cx, cy, radius * 0.28, cx, cy, haloR);
        haloGrad.addColorStop(0, rgbStr(palette.primary, 0.56 * Math.min(1.2, glowMult)));
        haloGrad.addColorStop(0.55, rgbStr(palette.secondary, 0.28));
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
        ctx.fill();

        // Clipped translucent iridescent glass sphere
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();

        // Deep glass body gradient
        const bodyGrad = ctx.createRadialGradient(
          cx - radius * 0.25,
          cy - radius * 0.28,
          radius * 0.1,
          cx + radius * 0.15,
          cy + radius * 0.2,
          radius * 1.1
        );
        bodyGrad.addColorStop(0, rgbStr(lerpRgb(palette.primary, palette.highlight, 0.22), 0.96));
        bodyGrad.addColorStop(0.45, rgbStr(palette.secondary, 0.96));
        bodyGrad.addColorStop(1, rgbStr(palette.deepCore, 0.98));
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(cx - radius - 2, cy - radius - 2, radius * 2 + 4, radius * 2 + 4);

        // Layered flowing iridescent waves inside the glass
        const waveConfigs = [
          {
            colorA: palette.primary,
            colorB: palette.accent,
            amp: isSpeaking ? 0.19 : isListening ? 0.15 + micEnvelope * 0.08 : 0.12,
            freq: 2.1,
            speed: isThinking ? 3.2 : 1.35,
            yBase: 0.15,
            alpha: 0.58
          },
          {
            colorA: palette.accent,
            colorB: { r: 56, g: 189, b: 248 },
            amp: isSpeaking ? 0.16 : 0.11,
            freq: 2.7,
            speed: isThinking ? -2.8 : -1.1,
            yBase: -0.08,
            alpha: 0.5
          },
          {
            colorA: palette.highlight,
            colorB: palette.primary,
            amp: isSpeaking ? 0.14 : 0.09,
            freq: 3.3,
            speed: isThinking ? 3.8 : 1.75,
            yBase: 0.02,
            alpha: 0.42
          },
          {
            colorA: palette.secondary,
            colorB: palette.ring,
            amp: 0.1,
            freq: 1.8,
            speed: isThinking ? -2.2 : 0.95,
            yBase: 0.28,
            alpha: 0.52
          }
        ];

        ctx.globalCompositeOperation = 'screen';
        for (let w = 0; w < waveConfigs.length; w++) {
          const wc = waveConfigs[w];
          const phase = time * wc.speed + w * 1.45 + angleY * 0.8;
          const waveGrad = ctx.createLinearGradient(
            cx - radius,
            cy - radius * 0.5,
            cx + radius,
            cy + radius * 0.8
          );
          waveGrad.addColorStop(0, rgbStr(wc.colorA, wc.alpha));
          waveGrad.addColorStop(0.55, rgbStr(wc.colorB, wc.alpha * 0.85));
          waveGrad.addColorStop(1, rgbStr(palette.deepCore, 0.05));

          ctx.fillStyle = waveGrad;
          ctx.beginPath();
          const steps = 26;
          for (let s = 0; s <= steps; s++) {
            const frac = s / steps;
            const px = cx - radius + frac * radius * 2;
            const envelope = Math.sin(frac * Math.PI);
            const py =
              cy +
              wc.yBase * radius +
              Math.sin(frac * Math.PI * wc.freq + phase) * radius * wc.amp * (0.45 + 0.55 * envelope) +
              Math.cos(frac * Math.PI * (wc.freq + 1.1) - phase * 0.7) * radius * wc.amp * 0.4;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineTo(cx + radius + 4, cy + radius + 4);
          ctx.lineTo(cx - radius - 4, cy + radius + 4);
          ctx.closePath();
          ctx.fill();
        }

        // Bright soft luminous core drifting gently inside the waves
        const coreDriftX = cx + Math.sin(time * 0.9) * radius * 0.14;
        const coreDriftY = cy + Math.cos(time * 0.75) * radius * 0.1;
        const coreR = radius * (isSpeaking ? 0.62 + Math.sin(time * 5.2) * 0.08 : 0.54 + micEnvelope * 0.14);
        const softCore = ctx.createRadialGradient(coreDriftX, coreDriftY, 0, coreDriftX, coreDriftY, coreR);
        softCore.addColorStop(0, rgbStr(palette.highlight, 0.92));
        softCore.addColorStop(0.32, rgbStr(palette.primary, 0.58));
        softCore.addColorStop(0.75, rgbStr(palette.accent, 0.22));
        softCore.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = softCore;
        ctx.beginPath();
        ctx.arc(coreDriftX, coreDriftY, coreR, 0, Math.PI * 2);
        ctx.fill();

        // Crisp top-left glass specular highlight & bottom-right Fresnel rim
        const specGrad = ctx.createRadialGradient(
          cx - radius * 0.38,
          cy - radius * 0.42,
          radius * 0.02,
          cx - radius * 0.34,
          cy - radius * 0.38,
          radius * 0.56
        );
        specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.68)');
        specGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.16)');
        specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = specGrad;
        ctx.beginPath();
        ctx.arc(cx - radius * 0.34, cy - radius * 0.38, radius * 0.56, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Outer glass rim stroke
        ctx.save();
        ctx.strokeStyle = rgbStr(palette.ring, 0.68);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const renderMs = performance.now() - frameStart;
        if (renderMs > 18 && adaptiveFpsCap > 30) {
          slowFrameCount++;
          if (slowFrameCount >= 6) adaptiveFpsCap = 30;
        }
        animFrameRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      // =========================================================================
      // STYLE 4: MAGENTA-CYAN GLOWING MESH (Wireframe geodesic + crossings + pulse)
      // =========================================================================
      if (activeStyle === 'magenta_cyan_mesh') {
        const meshCorePal: SchemePalette = isError
          ? palette
          : scheme === 'purple'
          ? {
              primary: { r: 236, g: 72, b: 153 },   // Magenta
              secondary: { r: 6, g: 182, b: 212 },  // Cyan
              accent: { r: 59, g: 130, b: 246 },    // Electric blue
              deepCore: { r: 18, g: 14, b: 46 },
              highlight: { r: 240, g: 253, b: 255 },
              ring: { r: 103, g: 232, b: 249 }
            }
          : {
              ...palette,
              accent: { r: 6, g: 182, b: 212 }
            };

        const meshR = baseRadius * (1 + listenPulse);
        drawSphereBackdrop(cx, cy, meshR, meshCorePal, glowMult, st, 1.05);

        // Slow pulse of light travelling vertically/diagonally through the mesh
        const pulseWavePhase = Math.sin(time * (isThinking ? 2.4 : 0.95));

        for (let i = 0; i < meshVCount; i++) {
          let ux = mesh.vx[i];
          let uy = mesh.vy[i];
          let uz = mesh.vz[i];

          let r = meshR;
          if (isIdle) {
            r *= 1 + Math.sin(time * 0.9 + uy * 2.2) * 0.012;
          } else if (isListening) {
            r *= 1 + Math.sin(time * 4.2 + uy * 3.5) * (0.018 + micEnvelope * 0.045);
          } else if (isThinking) {
            const twist = Math.sin(uy * 2.6 - time * 2.3) * 0.35;
            const cT = Math.cos(twist);
            const sT = Math.sin(twist);
            const tx = ux * cT - uz * sT;
            const tz = ux * sT + uz * cT;
            ux = tx;
            uz = tz;
          } else if (isSpeaking) {
            const ripple = Math.sin(uy * 6.0 - time * 5.2) * 0.085;
            r *= 1 + ripple;
          } else if (isError) {
            r *= 1 + Math.sin(time * 16 + i) * 0.025;
          }

          const x1 = ux * r;
          const y1 = uy * r;
          const z1 = uz * r;

          const rx1 = x1 * cosY + z1 * sinY;
          const rz1 = -x1 * sinY + z1 * cosY;
          const ry2 = y1 * cosTiltX - rz1 * sinTiltX;
          const rz2 = y1 * sinTiltX + rz1 * cosTiltX;

          const persp = fov / (fov + rz2);
          meshProjX[i] = cx + rx1 * persp;
          meshProjY[i] = cy + ry2 * persp;
          meshDepth[i] = Math.max(0, Math.min(1, (rz2 / (meshR * 1.1) + 1) * 0.5));

          // Travelling light pulse along diagonal axis
          const waveCoord = uy * 0.8 + ux * 0.45;
          const distToWave = Math.abs(waveCoord - pulseWavePhase);
          meshPulseVal[i] = Math.max(0, 1 - distToWave * 2.4);
        }

        // Draw wireframe edges in 3 depth/pulse passes (zero per-edge save/restore)
        const edgeCount = mesh.edges.length / 2;
        const edgeStyles = [
          rgbStr(meshCorePal.accent, 0.22),
          rgbStr(meshCorePal.secondary, 0.58),
          rgbStr(meshCorePal.primary, 0.88),
          rgbStr(meshCorePal.highlight, 0.96)
        ];
        const edgeWidths = [0.8, 1.15, 1.5, 1.85];

        for (let pass = 0; pass < 4; pass++) {
          ctx.strokeStyle = edgeStyles[pass];
          ctx.lineWidth = edgeWidths[pass];
          ctx.beginPath();
          for (let e = 0; e < edgeCount; e++) {
            const a = mesh.edges[e * 2];
            const b = mesh.edges[e * 2 + 1];
            const avgDepth = (meshDepth[a] + meshDepth[b]) * 0.5;
            const avgPulse = (meshPulseVal[a] + meshPulseVal[b]) * 0.5;

            let bucket = 0;
            if (avgDepth > 0.45 && avgPulse > 0.58) bucket = 3;
            else if (avgDepth > 0.56) bucket = 2;
            else if (avgDepth > 0.34) bucket = 1;

            if (bucket !== pass) continue;
            ctx.moveTo(meshProjX[a], meshProjY[a]);
            ctx.lineTo(meshProjX[b], meshProjY[b]);
          }
          ctx.stroke();
        }

        // Draw bright glowing nodes at mesh crossings
        for (let i = 0; i < meshVCount; i++) {
          const d = meshDepth[i];
          const p = meshPulseVal[i];
          if (d < 0.22 && p < 0.3) continue;

          const nodeX = meshProjX[i];
          const nodeY = meshProjY[i];
          const nodeR = (1.8 + d * 1.45 + p * 0.9) * dotSizeScale;

          if (d > 0.5 || p > 0.5) {
            ctx.fillStyle = rgbStr(
              p > 0.5 ? meshCorePal.highlight : i % 2 === 0 ? meshCorePal.primary : meshCorePal.secondary,
              0.28 + p * 0.28
            );
            ctx.beginPath();
            ctx.arc(nodeX, nodeY, nodeR * 1.85, 0, Math.PI * 2);
            ctx.fill();
          }

          const nodeCol =
            p > 0.62
              ? meshCorePal.highlight
              : i % 3 === 0
              ? meshCorePal.primary
              : i % 3 === 1
              ? meshCorePal.secondary
              : meshCorePal.accent;
          ctx.fillStyle = rgbStr(nodeCol, 0.35 + d * 0.65);
          ctx.beginPath();
          ctx.arc(nodeX, nodeY, nodeR, 0, Math.PI * 2);
          ctx.fill();
        }

        const renderMs = performance.now() - frameStart;
        if (renderMs > 18 && adaptiveFpsCap > 30) {
          slowFrameCount++;
          if (slowFrameCount >= 6) adaptiveFpsCap = 30;
        }
        animFrameRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      // =========================================================================
      // STYLE 3: BLUE-VIOLET PARTICLE MATRIX (Latitude & Longitude lines + data flow)
      // =========================================================================
      if (activeStyle === 'blue_violet_matrix') {
        const matrixPal: SchemePalette = isError
          ? palette
          : scheme === 'purple'
          ? {
              primary: { r: 59, g: 130, b: 246 },   // Vivid electric blue
              secondary: { r: 124, g: 58, b: 237 }, // Deep violet
              accent: { r: 56, g: 189, b: 248 },    // Bright sky cyan data pulse
              deepCore: { r: 10, g: 16, b: 48 },
              highlight: { r: 224, g: 242, b: 254 },
              ring: { r: 147, g: 197, b: 253 }
            }
          : palette;

        const matrixR = baseRadius * (1 + listenPulse);
        drawSphereBackdrop(cx, cy, matrixR, matrixPal, glowMult, st, 1.0);

        primaryCounts.fill(0);
        accentCounts.fill(0);

        for (let i = 0; i < matrixCount; i++) {
          let ux = matrixUx[i];
          let uy = matrixUy[i];
          let uz = matrixUz[i];
          const phi = matrixPhi[i];
          const theta = matrixTheta[i];
          const isParallel = matrixKind[i] === 1;
          const lineIdx = matrixLineIdx[i];

          let r = matrixR;
          if (isIdle) {
            r *= 1 + Math.sin(time * 1.1 + phi * 2.0) * 0.009;
          } else if (isListening) {
            r *= 1 + Math.sin(time * 4.0 + phi * 3.0) * (0.015 + micEnvelope * 0.042);
          } else if (isThinking) {
            const swirl = Math.sin(phi * 2.4 - time * 2.4) * 0.42;
            const cS = Math.cos(swirl);
            const sS = Math.sin(swirl);
            const tx = ux * cS - uz * sS;
            const tz = ux * sS + uz * cS;
            ux = tx;
            uz = tz;
          } else if (isSpeaking) {
            const ripple = Math.sin(phi * 7.0 - time * 5.6) * 0.082;
            r *= 1 + ripple;
          } else if (isError) {
            r *= 1 + Math.sin(time * 16 + theta * 5) * 0.025;
          }

          const x1 = ux * r;
          const y1 = uy * r;
          const z1 = uz * r;

          const rx1 = x1 * cosY + z1 * sinY;
          const rz1 = -x1 * sinY + z1 * cosY;
          const ry2 = y1 * cosTiltX - rz1 * sinTiltX;
          const rz2 = y1 * sinTiltX + rz1 * cosTiltX;

          const persp = fov / (fov + rz2);
          const x2d = cx + rx1 * persp;
          const y2d = cy + ry2 * persp;

          const depthNorm = Math.max(0, Math.min(1, (rz2 / (matrixR * 1.12) + 1) * 0.5));

          // Data-like pulse packets travelling sequentially along meridians & parallels
          const flowSignal = isParallel
            ? Math.sin(theta * 3.0 - time * 3.4 + lineIdx * 0.9)
            : Math.sin(phi * 4.0 - time * 3.8 + lineIdx * 0.7);
          const isDataPulse = flowSignal > 0.72;

          const bIdx = Math.min(
            DEPTH_BUCKETS - 1,
            Math.floor(Math.min(1, depthNorm * 0.9 + (isDataPulse ? 0.16 : 0)) * DEPTH_BUCKETS)
          );
          const dotR = (isDataPulse ? minDotR + 0.55 + depthNorm * 1.15 : minDotR * 0.92 + depthNorm * 1.15) * persp;
          const clampedR = Math.max(1.5 * dotSizeScale, Math.min(maxDotR, dotR));

          if (isDataPulse) {
            const c = accentCounts[bIdx];
            accentBucketX[bIdx][c] = x2d;
            accentBucketY[bIdx][c] = y2d;
            accentBucketR[bIdx][c] = clampedR;
            accentCounts[bIdx] = c + 1;
          } else {
            const c = primaryCounts[bIdx];
            primaryBucketX[bIdx][c] = x2d;
            primaryBucketY[bIdx][c] = y2d;
            primaryBucketR[bIdx][c] = clampedR;
            primaryCounts[bIdx] = c + 1;
          }
        }

        const styles = getBucketStyleCached(
          `matrix:${scheme}:${isError ? 'err' : 'ok'}`,
          lerpRgb(matrixPal.deepCore, matrixPal.secondary, 0.35),
          matrixPal.secondary,
          matrixPal.primary,
          matrixPal.primary,
          matrixPal.accent,
          matrixPal.highlight,
          0.18
        );

        drawBatchDots(primaryBucketX, primaryBucketY, primaryBucketR, primaryCounts, styles.primary);
        drawBatchDots(accentBucketX, accentBucketY, accentBucketR, accentCounts, styles.accent);

        const renderMs = performance.now() - frameStart;
        if (renderMs > 18 && adaptiveFpsCap > 30) {
          slowFrameCount++;
          if (slowFrameCount >= 6) adaptiveFpsCap = 30;
        }
        animFrameRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      // =========================================================================
      // STYLE 1: PURPLE SPIRAL DOT GLOBE (SIGNATURE)
      // Dense spiral rows, primary+white dots, soft halo, thin ring, floating side particles
      // =========================================================================
      const spiralR = baseRadius * (1 + listenPulse);
      drawSphereBackdrop(cx, cy, spiralR, palette, glowMult, st, 1.05);

      // Back arc of the single thin orbital ring
      const ringRx = spiralR * (1.28 + micEnvelope * 0.08);
      const ringRy = ringRx * 0.3;
      const ringTilt = -0.34;
      const ringAlpha = isIdle ? 0.56 : isListening ? 0.78 + micEnvelope * 0.2 : 0.75;

      ctx.save();
      ctx.globalAlpha = ringAlpha * 0.58;
      ctx.strokeStyle = rgbStr(palette.primary, 0.65);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, ringRx, ringRy, ringTilt, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Floating tiny particles drifting gently on the sides around the orb
      ctx.fillStyle = rgbStr(palette.highlight, isIdle ? 0.68 : 0.88);
      ctx.beginPath();
      for (let i = 0; i < ambientCount; i++) {
        const a = ambientAngle[i] + time * ambientSpeed[i] * (isThinking ? 1.5 : 0.45);
        const rad = spiralR * (ambientRadiusMult[i] + Math.sin(time * 1.4 + i) * 0.04);
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad * 0.45 + ambientYOffset[i] * spiralR * 0.72;
        const pr = ambientSize[i] * dotSizeScale;
        ctx.moveTo(px + pr, py);
        ctx.arc(px, py, pr, 0, Math.PI * 2);
      }
      ctx.fill();

      primaryCounts.fill(0);
      accentCounts.fill(0);

      for (let i = 0; i < dotCount; i++) {
        let ux = spiralUx[i];
        let uy = spiralUy[i];
        let uz = spiralUz[i];
        const phi = spiralPhi[i];
        const theta = spiralTheta[i];

        let r = spiralR;
        let crest = 0;

        if (isIdle) {
          r *= 1 + Math.sin(time * 0.95 + phi * 2.2) * 0.01;
        } else if (isListening) {
          const wave = Math.sin(time * 4.0 + phi * 3.0 + theta * 1.5) * (0.016 + micEnvelope * 0.038);
          r *= 1 + wave;
          crest = micEnvelope * 0.24;
        } else if (isThinking) {
          const swirl =
            Math.sin(phi * 2.5 - time * 2.6) * 0.56 +
            Math.cos(phi * 4.0 + time * 1.8) * 0.16;
          const cS = Math.cos(swirl);
          const sS = Math.sin(swirl);
          const sx = ux * cS - uz * sS;
          const sz = ux * sS + uz * cS;
          ux = sx;
          uz = sz;
          r *= 1 + Math.sin(phi * 3.0 - time * 3.0) * 0.036;
          crest = 0.16 * Math.max(0, Math.sin(theta + phi * 3 - time * 3.2));
        } else if (isSpeaking) {
          const rippleA = Math.sin(phi * 6.5 - time * 5.2);
          const rippleB = Math.sin(theta * 2.0 + phi * 3.5 - time * 3.8);
          const ripple = rippleA * 0.65 + rippleB * 0.35;
          r *= 1 + ripple * 0.092;
          crest = Math.max(0, ripple) * 0.34;
        } else if (isError) {
          r *= 1 + Math.sin(time * 16 + theta * 4) * 0.025;
          crest = 0.2;
        }

        const x1 = ux * r;
        const y1 = uy * r;
        const z1 = uz * r;

        const rx1 = x1 * cosY + z1 * sinY;
        const rz1 = -x1 * sinY + z1 * cosY;
        const ry2 = y1 * cosTiltX - rz1 * sinTiltX;
        const rz2 = y1 * sinTiltX + rz1 * cosTiltX;

        const persp = fov / (fov + rz2);
        const x2d = cx + rx1 * persp;
        const y2d = cy + ry2 * persp;

        const depthNorm = Math.max(0, Math.min(1, (rz2 / (spiralR * 1.12) + 1) * 0.5));
        const bNorm = Math.max(0, Math.min(1, depthNorm * 0.88 + crest));
        const bIdx = Math.min(DEPTH_BUCKETS - 1, Math.floor(bNorm * DEPTH_BUCKETS));

        const rawR = (minDotR + depthNorm * (maxDotR - minDotR)) * persp;
        const clampedR = Math.max(minDotR * 0.88, Math.min(maxDotR, rawR));

        if (spiralIsWhite[i] === 1) {
          const c = accentCounts[bIdx];
          accentBucketX[bIdx][c] = x2d;
          accentBucketY[bIdx][c] = y2d;
          accentBucketR[bIdx][c] = clampedR;
          accentCounts[bIdx] = c + 1;
        } else {
          const c = primaryCounts[bIdx];
          primaryBucketX[bIdx][c] = x2d;
          primaryBucketY[bIdx][c] = y2d;
          primaryBucketR[bIdx][c] = clampedR;
          primaryCounts[bIdx] = c + 1;
        }
      }

      const spiralStyles = getBucketStyleCached(
        `spiral:${scheme}:${isError ? 'err' : 'ok'}`,
        lerpRgb(palette.deepCore, palette.secondary, 0.45),
        palette.secondary,
        palette.primary,
        palette.primary,
        lerpRgb(palette.primary, palette.highlight, 0.55),
        palette.highlight,
        0.2
      );

      drawBatchDots(primaryBucketX, primaryBucketY, primaryBucketR, primaryCounts, spiralStyles.primary);
      drawBatchDots(accentBucketX, accentBucketY, accentBucketR, accentCounts, spiralStyles.accent);

      // Front half of the single thin glowing orbital ring (in front of sphere)
      ctx.save();
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = rgbStr(palette.ring, 0.92);
      ctx.lineWidth = 1.45;
      ctx.beginPath();
      ctx.ellipse(cx, cy, ringRx, ringRy, ringTilt, 0, Math.PI);
      ctx.stroke();
      ctx.restore();

      const renderMs = performance.now() - frameStart;
      if (renderMs > 18 && adaptiveFpsCap > 30) {
        slowFrameCount++;
        if (slowFrameCount >= 6) adaptiveFpsCap = 30;
      }

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
  }, [resolvedSize, particleDensity]);

  return (
    <button
      type="button"
      aria-label="Zuzu Voice Orb"
      className="relative flex-shrink-0 flex items-center justify-center cursor-pointer select-none touch-manipulation bg-transparent border-0 p-0 focus:outline-none"
      onClick={onClick}
      style={{
        width: resolvedSize,
        height: resolvedSize,
        minWidth: resolvedSize,
        minHeight: resolvedSize,
        maxWidth: resolvedSize,
        maxHeight: resolvedSize
      }}
    >
      <canvas
        ref={canvasRef}
        className="block pointer-events-none"
        style={{ width: resolvedSize, height: resolvedSize }}
      />
    </button>
  );
};
