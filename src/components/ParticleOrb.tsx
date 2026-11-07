import React, { useRef, useEffect } from 'react';
import { 
  OrbStyleId, 
  OrbColorScheme, 
  OrbRotationSpeed, 
  OrbGlowIntensity, 
  OrbParticleDensity 
} from '../types';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

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

interface Point3D {
  x: number;
  y: number;
  z: number;
  baseRadius: number;
  phase: number;
  colorType: number;
  type?: 'head' | 'shoulder' | 'eye' | 'mouth' | 'node' | 'ring' | 'crystal' | 'spark';
  connections?: number[];
}

export const ParticleOrb: React.FC<ParticleOrbProps> = ({
  state = 'idle',
  style = 'human',
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
  const styleRef = useRef<OrbStyleId>(style);
  const colorRef = useRef<OrbColorScheme>(colorScheme);
  const speedRef = useRef<OrbRotationSpeed>(rotationSpeed);
  const glowRef = useRef<OrbGlowIntensity>(glowIntensity);
  const densityRef = useRef<OrbParticleDensity>(particleDensity);

  useEffect(() => {
    stateRef.current = state;
    styleRef.current = style;
    colorRef.current = colorScheme;
    speedRef.current = rotationSpeed;
    glowRef.current = glowIntensity;
    densityRef.current = particleDensity;
  }, [state, style, colorScheme, rotationSpeed, glowIntensity, particleDensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    // Particle count based on density
    let count = 1200;
    if (densityRef.current === 'eco') count = 700;
    else if (densityRef.current === 'ultra') count = 1800;

    const points: Point3D[] = [];
    const baseRadius = size * 0.35;
    const currentStyle = styleRef.current;

    // 1. STYLE: 'human' — Abstract AI Human Silhouette/Bust dot-matrix
    if (currentStyle === 'human') {
      const headRadius = baseRadius * 0.55;
      const headCenterY = -baseRadius * 0.25;

      // Head / Cranium 3D ellipsoid shell
      const headCount = Math.round(count * 0.55);
      for (let i = 0; i < headCount; i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = headRadius * (0.95 + Math.random() * 0.1);
        const x = r * Math.sin(phi) * Math.cos(theta) * 0.85;
        const y = headCenterY + r * Math.cos(phi) * 1.15;
        const z = r * Math.sin(phi) * Math.sin(theta) * 0.95;

        points.push({
          x,
          y,
          z,
          baseRadius: r,
          phase: Math.random() * Math.PI * 2,
          colorType: i % 4,
          type: 'head'
        });
      }

      // Facial Neural Nodes & Eyes
      const eyeOffset = headRadius * 0.32;
      const eyeY = headCenterY - headRadius * 0.05;
      const eyeZ = headRadius * 0.82;
      for (let i = 0; i < 24; i++) {
        // Left eye cluster
        points.push({
          x: -eyeOffset + (Math.random() - 0.5) * 8,
          y: eyeY + (Math.random() - 0.5) * 5,
          z: eyeZ + (Math.random() - 0.5) * 4,
          baseRadius: 10,
          phase: i,
          colorType: 0,
          type: 'eye'
        });
        // Right eye cluster
        points.push({
          x: eyeOffset + (Math.random() - 0.5) * 8,
          y: eyeY + (Math.random() - 0.5) * 5,
          z: eyeZ + (Math.random() - 0.5) * 4,
          baseRadius: 10,
          phase: i + 1,
          colorType: 0,
          type: 'eye'
        });
      }

      // Mouth / Speech articulation node line
      const mouthY = headCenterY + headRadius * 0.48;
      const mouthZ = headRadius * 0.75;
      for (let i = 0; i < 28; i++) {
        const mx = ((i - 14) / 14) * (headRadius * 0.42);
        points.push({
          x: mx,
          y: mouthY + Math.sin((i / 28) * Math.PI) * 3,
          z: mouthZ,
          baseRadius: 8,
          phase: i * 0.3,
          colorType: 1,
          type: 'mouth'
        });
      }

      // Neck & Shoulder Bust Arch
      const shoulderCount = Math.round(count * 0.38);
      for (let i = 0; i < shoulderCount; i++) {
        const t = (i / shoulderCount) * 2 - 1; // -1 to 1
        const shoulderWidth = baseRadius * 1.45;
        const x = t * shoulderWidth * 0.5 + (Math.random() - 0.5) * 12;
        const curve = Math.cos(t * Math.PI * 0.5);
        const y = baseRadius * 0.45 + (1 - curve) * baseRadius * 0.4 + (Math.random() - 0.5) * 10;
        const z = (Math.random() - 0.5) * baseRadius * 0.65;

        points.push({
          x,
          y,
          z,
          baseRadius: Math.hypot(x, y),
          phase: Math.random() * Math.PI * 2,
          colorType: 2,
          type: 'shoulder'
        });
      }
    } 
    // 2. STYLE: 'galaxy' — Cosmic 3-Arm Galactic Core
    else if (currentStyle === 'galaxy') {
      const arms = 3;
      for (let i = 0; i < count; i++) {
        const armIndex = i % arms;
        const armAngle = (armIndex * 2 * Math.PI) / arms;
        const distNorm = Math.pow(Math.random(), 0.65);
        const r = distNorm * baseRadius * 1.35;
        const spiralAngle = armAngle + distNorm * Math.PI * 3.2;
        const spread = (Math.random() - 0.5) * (0.35 * baseRadius * (1 - distNorm * 0.5));
        const zSpread = (Math.random() - 0.5) * (0.3 * baseRadius * (1 - distNorm * 0.6));

        points.push({
          x: Math.cos(spiralAngle) * r + spread,
          y: Math.sin(spiralAngle) * r + spread,
          z: zSpread,
          baseRadius: Math.max(8, r),
          phase: Math.random() * Math.PI * 2,
          colorType: i % 4
        });
      }
    }
    // 3. STYLE: 'neon' — Cyberpunk Gyroscope Laser Rings
    else if (currentStyle === 'neon') {
      const rings = 4;
      const ptsPerRing = Math.floor(count / rings);
      for (let r = 0; r < rings; r++) {
        const ringRadius = baseRadius * (0.45 + r * 0.24);
        const ringTiltX = (r * Math.PI) / 3;
        const ringTiltY = (r * Math.PI) / 4;

        for (let i = 0; i < ptsPerRing; i++) {
          const theta = (i / ptsPerRing) * Math.PI * 2;
          const px = Math.cos(theta) * ringRadius;
          const py = Math.sin(theta) * ringRadius;
          const pz = (Math.random() - 0.5) * 6;

          // Rotate by ring tilt
          const x = px * Math.cos(ringTiltY) + pz * Math.sin(ringTiltY);
          const y = py * Math.cos(ringTiltX) - (pz * Math.cos(ringTiltY) - px * Math.sin(ringTiltY)) * Math.sin(ringTiltX);
          const z = py * Math.sin(ringTiltX) + (pz * Math.cos(ringTiltY) - px * Math.sin(ringTiltY)) * Math.cos(ringTiltX);

          points.push({
            x,
            y,
            z,
            baseRadius: ringRadius,
            phase: theta,
            colorType: r % 4,
            type: 'ring'
          });
        }
      }
    }
    // 4. STYLE: 'crystal' / 'pixel' — 3D Polyhedral Geometric Crystal
    else if (currentStyle === 'crystal' || currentStyle === 'pixel') {
      const phiAngle = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const yNorm = 1 - (i / (count - 1)) * 2;
        const radiusAtY = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
        const theta = phiAngle * i;

        // Faceted crystal quantization
        const facetSteps = 8;
        const quantizedTheta = Math.round(theta * facetSteps / Math.PI) * (Math.PI / facetSteps);
        const quantizedY = Math.round(yNorm * facetSteps) / facetSteps;
        const r = baseRadius * (0.85 + Math.sin(theta * 6) * 0.15);

        const x = Math.cos(quantizedTheta) * radiusAtY * r;
        const y = quantizedY * r;
        const z = Math.sin(quantizedTheta) * radiusAtY * r;

        points.push({
          x,
          y,
          z,
          baseRadius: r,
          phase: theta,
          colorType: Math.abs(Math.round(quantizedY * 4)) % 4,
          type: 'crystal'
        });
      }
    }
    // 5. STYLE: 'energy' — Turbulent Plasma Electric Arc Sphere
    else if (currentStyle === 'energy') {
      for (let i = 0; i < count; i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = baseRadius * (0.6 + Math.random() * 0.5);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        points.push({
          x,
          y,
          z,
          baseRadius: r,
          phase: Math.random() * Math.PI * 2,
          colorType: i % 3,
          type: 'spark'
        });
      }
    }
    // 6. STYLE: 'quantum' / 'particle' — Harmonic Quantum Waveform Torus
    else {
      const R = baseRadius * 0.72; // Major radius
      const rTube = baseRadius * 0.38; // Minor radius
      for (let i = 0; i < count; i++) {
        const u = Math.random() * Math.PI * 2;
        const v = Math.random() * Math.PI * 2;
        const wave = Math.sin(u * 5 + v * 3) * (rTube * 0.25);

        const x = (R + (rTube + wave) * Math.cos(v)) * Math.cos(u);
        const y = (rTube + wave) * Math.sin(v);
        const z = (R + (rTube + wave) * Math.cos(v)) * Math.sin(u);

        points.push({
          x,
          y,
          z,
          baseRadius: Math.hypot(x, y, z),
          phase: u,
          colorType: i % 4
        });
      }
    }

    // Palette Palette definition for Orb Hue only
    const getColorPalette = (scheme: OrbColorScheme): { primary: string; secondary: string; highlight: string; glow: string } => {
      switch (scheme) {
        case 'cyan':
          return { primary: '#06b6d4', secondary: '#22d3ee', highlight: '#e0f2fe', glow: 'rgba(6, 182, 212, 0.45)' };
        case 'rose':
          return { primary: '#f43f5e', secondary: '#fb7185', highlight: '#ffe4e6', glow: 'rgba(244, 63, 94, 0.45)' };
        case 'mint':
          return { primary: '#10b981', secondary: '#34d399', highlight: '#d1fae5', glow: 'rgba(16, 185, 129, 0.45)' };
        case 'amber':
          return { primary: '#f59e0b', secondary: '#fbbf24', highlight: '#fef3c7', glow: 'rgba(245, 158, 11, 0.45)' };
        case 'purple':
        default:
          return { primary: '#9333ea', secondary: '#c084fc', highlight: '#f3e8ff', glow: 'rgba(147, 51, 234, 0.45)' };
      }
    };

    let angleX = 0;
    let angleY = 0;
    let time = 0;

    const render = () => {
      ctx.clearRect(0, 0, size, size);

      const st = stateRef.current;
      const sp = speedRef.current;
      const gl = glowRef.current;
      const palette = getColorPalette(colorRef.current);
      const isHuman = styleRef.current === 'human';

      // Speed multipliers
      let baseSpeed = 0.007;
      if (sp === 'slow') baseSpeed = 0.0035;
      else if (sp === 'fast') baseSpeed = 0.013;

      let rotationMultiplier = 1;
      let waveFrequency = 1;
      let waveAmplitude = 1;

      if (st === 'listening') {
        rotationMultiplier = 1.35;
        waveFrequency = 2.2;
        waveAmplitude = 1.6;
      } else if (st === 'thinking') {
        rotationMultiplier = 2.2;
        waveFrequency = 3.5;
        waveAmplitude = 1.2;
      } else if (st === 'speaking') {
        rotationMultiplier = 1.5;
        waveFrequency = 4.2;
        waveAmplitude = 2.4;
      }

      time += 0.025 * waveFrequency;

      if (isHuman) {
        // Human bust oscillates gently left-to-right rather than spinning uncontrollably
        angleY = Math.sin(time * 0.4) * 0.45;
        angleX = Math.sin(time * 0.3) * 0.15;
      } else {
        angleY += baseSpeed * rotationMultiplier;
        angleX += baseSpeed * 0.5 * rotationMultiplier;
      }

      const centerX = size / 2;
      const centerY = size / 2;
      const fov = size * 1.1;

      // Center Ambient Core Glow
      let glowRadius = size * 0.28;
      if (gl === 'soft') glowRadius = size * 0.20;
      else if (gl === 'intense') glowRadius = size * 0.38;

      const radialGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        glowRadius * (1 + Math.sin(time) * 0.08 * waveAmplitude)
      );
      radialGrad.addColorStop(0, palette.glow);
      radialGrad.addColorStop(0.65, palette.glow.replace(/[\d.]+\)$/, '0.12)'));
      radialGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = radialGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, glowRadius * 1.25, 0, Math.PI * 2);
      ctx.fill();

      // Transform & Project 3D Points
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      // Render points sorted by depth Z
      const projectedList: Array<{
        x2d: number;
        y2d: number;
        z: number;
        size: number;
        alpha: number;
        color: string;
      }> = [];

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];

        // Dynamic State Modulation
        let modX = pt.x;
        let modY = pt.y;
        let modZ = pt.z;

        if (st === 'speaking') {
          if (pt.type === 'mouth') {
            // Mouth rhythmically expands with speech volume
            const speechPulse = Math.sin(time * 6 + pt.phase) * 5 * waveAmplitude;
            modY += speechPulse;
            modZ += Math.abs(speechPulse) * 0.8;
          } else {
            const ripple = Math.sin(time * 4 + pt.phase) * 3 * waveAmplitude;
            modX += (pt.x / (pt.baseRadius || 1)) * ripple;
            modY += (pt.y / (pt.baseRadius || 1)) * ripple;
            modZ += (pt.z / (pt.baseRadius || 1)) * ripple;
          }
        } else if (st === 'thinking') {
          if (pt.type === 'eye' || pt.type === 'head') {
            // Neural synapses glow and spark
            const thinkPulse = Math.sin(time * 8 + pt.phase) * 2;
            modY += thinkPulse;
          }
        } else if (st === 'listening') {
          const listenWave = Math.sin(time * 3 + pt.phase) * 2;
          modX += listenWave;
          modZ += listenWave;
        }

        // Rotation around Y axis
        const x1 = modX * cosY - modZ * sinY;
        const z1 = modZ * cosY + modX * sinY;

        // Rotation around X axis
        const y2 = modY * cosX - z1 * sinX;
        const z2 = z1 * cosX + modY * sinX;

        // Perspective projection
        const scale = fov / (fov + z2 + baseRadius * 1.5);
        const x2d = centerX + x1 * scale;
        const y2d = centerY + y2 * scale;

        // Depth alpha and radius
        const depthNorm = (z2 + baseRadius * 1.5) / (baseRadius * 3);
        const alpha = Math.max(0.12, Math.min(1.0, 0.25 + (1 - depthNorm) * 0.85));

        let dotSize = Math.max(0.8, (1 - depthNorm * 0.6) * 2.8);
        if (pt.type === 'eye') dotSize = 3.6;
        if (pt.type === 'mouth') dotSize = 2.6;

        let dotColor = palette.primary;
        if (pt.colorType === 1) dotColor = palette.secondary;
        else if (pt.colorType === 2) dotColor = palette.highlight;
        if (pt.type === 'eye') dotColor = '#FFFFFF';

        projectedList.push({
          x2d,
          y2d,
          z: z2,
          size: dotSize,
          alpha,
          color: dotColor
        });
      }

      // Sort back-to-front
      projectedList.sort((a, b) => a.z - b.z);

      // Draw Projected Dots
      for (let i = 0; i < projectedList.length; i++) {
        const p = projectedList[i];
        ctx.beginPath();
        ctx.arc(p.x2d, p.y2d, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      }

      ctx.globalAlpha = 1.0;
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [size]);

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer select-none active:scale-95 transition-transform duration-200"
      style={{ width: size, height: size }}
      title="Tap to interact with Zuzu AI"
    >
      <canvas ref={canvasRef} className="block pointer-events-none" />
    </div>
  );
};
