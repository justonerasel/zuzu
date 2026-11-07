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
  arm?: number;
}

export const ParticleOrb: React.FC<ParticleOrbProps> = ({
  state = 'idle',
  style = 'particle',
  colorScheme = 'purple',
  rotationSpeed = 'normal',
  glowIntensity = 'medium',
  particleDensity = 'standard',
  onClick,
  size = 280
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
    let count = 1400;
    if (densityRef.current === 'eco') count = 750;
    else if (densityRef.current === 'ultra') count = 2200;

    const points: Point3D[] = [];
    const baseSphereRadius = size * 0.32;
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

    // Generate Points according to Orb Style
    const currentStyle = styleRef.current;
    if (currentStyle === 'galaxy') {
      // 3 spiral galaxy arms
      const arms = 3;
      for (let i = 0; i < count; i++) {
        const armIndex = i % arms;
        const armAngle = (armIndex * 2 * Math.PI) / arms;
        const distNorm = Math.pow(Math.random(), 0.7);
        const radius = distNorm * baseSphereRadius * 1.35;
        const spiralAngle = armAngle + distNorm * Math.PI * 2.8;
        const spread = (Math.random() - 0.5) * (0.35 * baseSphereRadius * (1 - distNorm * 0.4));
        const zSpread = (Math.random() - 0.5) * (0.4 * baseSphereRadius * (1 - distNorm * 0.5));

        points.push({
          x: Math.cos(spiralAngle) * radius + spread,
          y: Math.sin(spiralAngle) * radius + spread,
          z: zSpread,
          baseRadius: Math.max(10, radius),
          phase: Math.random() * Math.PI * 2,
          colorType: i % 4,
          arm: armIndex
        });
      }
    } else if (currentStyle === 'pixel') {
      // Cubic matrix voxel distribution
      const gridSize = Math.round(Math.cbrt(count));
      const step = (baseSphereRadius * 1.8) / gridSize;
      for (let x = -gridSize / 2; x < gridSize / 2; x++) {
        for (let y = -gridSize / 2; y < gridSize / 2; y++) {
          for (let z = -gridSize / 2; z < gridSize / 2; z++) {
            const dist = Math.sqrt(x * x + y * y + z * z) * step;
            if (dist <= baseSphereRadius * 1.05 && dist >= baseSphereRadius * 0.3) {
              points.push({
                x: x * step,
                y: y * step,
                z: z * step,
                baseRadius: dist,
                phase: (x + y + z) * 0.5,
                colorType: (Math.abs(x + y) % 4)
              });
            }
          }
        }
      }
    } else {
      // Standard Fibonacci distribution for particle, crystal, neon, energy
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = phi * i;

        const x = Math.cos(theta) * radiusAtY;
        const z = Math.sin(theta) * radiusAtY;

        points.push({
          x: x * baseSphereRadius,
          y: y * baseSphereRadius,
          z: z * baseSphereRadius,
          baseRadius: baseSphereRadius,
          phase: Math.random() * Math.PI * 2,
          colorType: i % 4
        });
      }
    }

    let rotX = 0.2;
    let rotY = 0;
    let rotZ = 0;
    let time = 0;

    const render = () => {
      time += 0.02;
      const currentState = stateRef.current;
      const activeStyle = styleRef.current;
      const activeColor = colorRef.current;
      const activeSpeed = speedRef.current;
      const activeGlow = glowRef.current;

      // Speed multiplier
      let speedMult = 1.0;
      if (activeSpeed === 'slow') speedMult = 0.55;
      else if (activeSpeed === 'fast') speedMult = 1.85;

      // Glow multiplier
      let glowMult = 1.0;
      if (activeGlow === 'soft') glowMult = 0.55;
      else if (activeGlow === 'intense') glowMult = 1.7;

      // State dynamic speeds
      let speedY = 0.008 * speedMult;
      let speedX = 0.004 * speedMult;
      let pulseAmp = 0.04;
      let pulseFreq = 2.0;

      if (currentState === 'listening') {
        speedY = 0.016 * speedMult;
        speedX = 0.008 * speedMult;
        pulseAmp = 0.12;
        pulseFreq = 4.5;
      } else if (currentState === 'thinking') {
        speedY = 0.028 * speedMult;
        speedX = 0.014 * speedMult;
        pulseAmp = 0.08;
        pulseFreq = 6.0;
      } else if (currentState === 'speaking') {
        speedY = 0.020 * speedMult;
        speedX = 0.010 * speedMult;
        pulseAmp = 0.16;
        pulseFreq = 5.0;
      }

      rotY += speedY;
      rotX += speedX;
      rotZ += 0.002 * speedMult;

      ctx.clearRect(0, 0, size, size);

      const centerX = size / 2;
      const centerY = size / 2;

      // Color Palette Matrix
      const PALETTES = {
        purple: {
          core: 'rgba(147, 51, 234, ',
          accent1: 'rgba(168, 85, 247, ',
          accent2: 'rgba(192, 132, 252, ',
          accent3: 'rgba(126, 34, 206, ',
          ring: 'rgba(168, 85, 247, '
        },
        cyan: {
          core: 'rgba(6, 182, 212, ',
          accent1: 'rgba(56, 189, 248, ',
          accent2: 'rgba(14, 165, 233, ',
          accent3: 'rgba(2, 132, 199, ',
          ring: 'rgba(6, 182, 212, '
        },
        rose: {
          core: 'rgba(236, 72, 153, ',
          accent1: 'rgba(244, 114, 182, ',
          accent2: 'rgba(219, 39, 119, ',
          accent3: 'rgba(251, 113, 133, ',
          ring: 'rgba(236, 72, 153, '
        },
        mint: {
          core: 'rgba(16, 185, 129, ',
          accent1: 'rgba(52, 211, 153, ',
          accent2: 'rgba(5, 150, 105, ',
          accent3: 'rgba(110, 231, 183, ',
          ring: 'rgba(16, 185, 129, '
        },
        amber: {
          core: 'rgba(245, 158, 11, ',
          accent1: 'rgba(251, 191, 36, ',
          accent2: 'rgba(217, 119, 6, ',
          accent3: 'rgba(252, 211, 77, ',
          ring: 'rgba(245, 158, 11, '
        }
      };

      const pal = PALETTES[activeColor] || PALETTES.purple;

      // 1. Atmosphere Background Core Glow
      const bgGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        baseSphereRadius * 1.45
      );

      const baseAlpha = (currentState === 'speaking' ? 0.35 : currentState === 'listening' ? 0.3 : 0.2) * glowMult;
      bgGrad.addColorStop(0, `${pal.core}${baseAlpha})`);
      bgGrad.addColorStop(0.5, `${pal.accent1}${baseAlpha * 0.5})`);
      bgGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseSphereRadius * 1.45, 0, Math.PI * 2);
      ctx.fill();

      // 2. Style-Specific Structural Renderers
      if (activeStyle === 'neon') {
        // Neon rings revolving along multiple axes
        for (let r = 0; r < 3; r++) {
          ctx.save();
          ctx.translate(centerX, centerY);
          ctx.rotate(rotZ * (r + 1) + (r * Math.PI) / 3);
          ctx.beginPath();
          ctx.ellipse(0, 0, baseSphereRadius * (1.15 + r * 0.12), baseSphereRadius * (0.35 + r * 0.1), rotX * (r + 1), 0, Math.PI * 2);
          ctx.strokeStyle = `${pal.ring}${0.35 * glowMult})`;
          ctx.lineWidth = 2 + (currentState === 'speaking' ? 1.5 : 0);
          ctx.stroke();
          ctx.restore();
        }
      } else if (activeStyle === 'energy') {
        // Turbulent electric lightning plasma arcs
        ctx.save();
        ctx.translate(centerX, centerY);
        const arcCount = currentState === 'speaking' ? 6 : 4;
        for (let a = 0; a < arcCount; a++) {
          const startAngle = (a * Math.PI * 2) / arcCount + rotZ;
          const endAngle = startAngle + Math.PI * 0.7;
          ctx.beginPath();
          const r = baseSphereRadius * (0.85 + Math.sin(time * 6 + a) * 0.18);
          ctx.arc(0, 0, r, startAngle, endAngle);
          ctx.strokeStyle = `${pal.accent1}${0.45 * glowMult})`;
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // Standard atmospheric orbital ring
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(rotZ * 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, baseSphereRadius * 1.25, baseSphereRadius * 0.35, rotX * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `${pal.ring}${0.25 * glowMult})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // 3. 3D Rotation Matrix
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const pulse = 1 + Math.sin(time * pulseFreq) * pulseAmp;

      // Project points
      const projectedPoints: Array<{
        px: number;
        py: number;
        pz: number;
        radius: number;
        alpha: number;
        colorType: number;
      }> = [];

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];

        let currX = pt.x;
        let currY = pt.y;
        let currZ = pt.z;

        if (activeStyle === 'energy') {
          // Electric turbulence
          const jitter = (Math.sin(time * 12 + pt.phase) + Math.cos(time * 8 + pt.phase)) * 2.5;
          currX += jitter;
          currY += jitter;
        }

        // Apply pulse
        currX *= pulse;
        currY *= pulse;
        currZ *= pulse;

        // Rotate around Y
        const x1 = currX * cosY - currZ * sinY;
        const z1 = currX * sinY + currZ * cosY;

        // Rotate around X
        const y2 = currY * cosX - z1 * sinX;
        const z2 = currY * sinX + z1 * cosX;

        // Perspective depth projection
        const fov = 400;
        const scale = fov / (fov + z2);

        const px = centerX + x1 * scale;
        const py = centerY + y2 * scale;

        // Depth alpha (front particles are brighter)
        const depthNorm = (z2 + baseSphereRadius) / (baseSphereRadius * 2);
        const alpha = Math.max(0.12, Math.min(1.0, 0.2 + depthNorm * 0.8)) * glowMult;
        const pRadius = Math.max(0.7, (1.2 + depthNorm * 1.8) * scale);

        projectedPoints.push({
          px,
          py,
          pz: z2,
          radius: pRadius,
          alpha,
          colorType: pt.colorType
        });
      }

      // Sort points by Z (back to front) for depth rendering
      projectedPoints.sort((a, b) => a.pz - b.pz);

      // 4. Style-Specific Point Drawing
      if (activeStyle === 'crystal') {
        // Crystalline connections between nearby front-facing vertices
        ctx.lineWidth = 0.8;
        const step = Math.max(1, Math.floor(projectedPoints.length / 180));
        for (let i = 0; i < projectedPoints.length; i += step) {
          const p1 = projectedPoints[i];
          if (p1.pz > 0) {
            for (let j = i + step; j < Math.min(i + step * 4, projectedPoints.length); j += step) {
              const p2 = projectedPoints[j];
              const dx = p1.px - p2.px;
              const dy = p1.py - p2.py;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < baseSphereRadius * 0.35) {
                ctx.beginPath();
                ctx.moveTo(p1.px, p1.py);
                ctx.lineTo(p2.px, p2.py);
                ctx.strokeStyle = `${pal.accent2}${p1.alpha * 0.4})`;
                ctx.stroke();
              }
            }
          }
        }
      }

      // Draw Individual Particles / Voxels / Stars
      for (let i = 0; i < projectedPoints.length; i++) {
        const pt = projectedPoints[i];

        let colorStr = `${pal.accent1}${pt.alpha})`;
        if (pt.colorType === 1) colorStr = `${pal.accent2}${pt.alpha})`;
        else if (pt.colorType === 2) colorStr = `${pal.accent3}${pt.alpha})`;
        else if (pt.colorType === 3) colorStr = `rgba(255, 255, 255, ${pt.alpha * 0.95})`;

        ctx.fillStyle = colorStr;

        if (activeStyle === 'pixel') {
          // Retro Voxel Square Pixels
          const pSize = pt.radius * 2.2;
          ctx.fillRect(pt.px - pSize / 2, pt.py - pSize / 2, pSize, pSize);
        } else {
          // Round Particles, Stars, or Energy Spark
          ctx.beginPath();
          ctx.arc(pt.px, pt.py, pt.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 5. Central Holographic Core
      const coreGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        baseSphereRadius * 0.45
      );
      coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      coreGrad.addColorStop(0.4, `${pal.core}${0.28 * glowMult})`);
      coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseSphereRadius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [size]);

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer select-none group"
      style={{ width: `${size}px`, height: `${size}px` }}
      title="Tap Orb to toggle Voice Assistant"
    >
      <canvas
        ref={canvasRef}
        className="block transition-transform duration-500 group-hover:scale-102"
      />
    </div>
  );
};
