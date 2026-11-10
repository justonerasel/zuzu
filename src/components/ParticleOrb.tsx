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
  theta: number;
  phi: number;
  phase: number;
  colorType: number;
  type?: 'ribbon' | 'shell' | 'matrix' | 'mesh' | 'spiral_dot' | 'orbit_ring';
}

export const ParticleOrb: React.FC<ParticleOrbProps> = ({
  state = 'idle',
  style = 'purple_spiral_globe',
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

  // Map any legacy or alternative ID to the 4 canonical custom styles
  const resolveStyle = (s?: string): OrbStyleId => {
    if (!s) return 'purple_spiral_globe';
    if (s === 'purple_spiral_globe' || s === 'glowing_globe' || s === 'crystal' || s === 'quantum') return 'purple_spiral_globe';
    if (s === 'aura_glass' || s === 'glass_iridescent_wave') return 'glass_iridescent_wave';
    if (s === 'particle_blue_violet' || s === 'blue_violet_matrix' || s === 'dot_matrix' || s === 'galaxy' || s === 'human') return 'blue_violet_matrix';
    if (s === 'particle_magenta_cyan' || s === 'magenta_cyan_mesh' || s === 'particle_sphere' || s === 'neon') return 'magenta_cyan_mesh';
    return 'purple_spiral_globe';
  };

  useEffect(() => {
    stateRef.current = state;
    styleRef.current = resolveStyle(style);
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

    // Particle density count
    let count = 1250;
    if (densityRef.current === 'eco') count = 800;
    else if (densityRef.current === 'ultra') count = 2100;

    const baseRadius = size * 0.36;
    const currentStyle = resolveStyle(styleRef.current);
    const points: Point3D[] = [];

    // =========================================================================
    // STYLE 1: Glass Iridescent Wave (da5d185d5fef16008ef717a105376508.jpg)
    // Multi-layered glowing translucent orb with fluid internal light waves
    // =========================================================================
    if (currentStyle === 'glass_iridescent_wave') {
      const ribbonCount = Math.round(count * 0.72);
      for (let i = 0; i < ribbonCount; i++) {
        const u = Math.random() * Math.PI * 2;
        const v = (Math.random() - 0.5) * Math.PI;
        const rNorm = Math.pow(Math.random(), 0.55) * 0.85;
        const r = baseRadius * rNorm;

        points.push({
          x: r * Math.cos(v) * Math.cos(u),
          y: r * Math.sin(v),
          z: r * Math.cos(v) * Math.sin(u),
          baseRadius: r,
          theta: u,
          phi: v,
          phase: Math.random() * Math.PI * 2,
          colorType: i % 4, // 0: Cyan, 1: Magenta, 2: Amber/Gold, 3: Soft Green
          type: 'ribbon'
        });
      }

      // Translucent glass sphere outer boundary points
      const shellCount = count - ribbonCount;
      for (let i = 0; i < shellCount; i++) {
        const u = Math.random() * Math.PI * 2;
        const v = Math.acos(2 * Math.random() - 1);
        const r = baseRadius * 0.98;
        points.push({
          x: r * Math.sin(v) * Math.cos(u),
          y: r * Math.cos(v),
          z: r * Math.sin(v) * Math.sin(u),
          baseRadius: r,
          theta: u,
          phi: v,
          phase: u + v,
          colorType: 4, // Glass specular highlight
          type: 'shell'
        });
      }
    }
    // =========================================================================
    // STYLE 2: Blue-Violet Particle Matrix (66ba3e1d2797e5926917697d2432f77f.jpg)
    // Dynamic 3D sphere formed by dense glowing blue-to-violet matrix dots with fluid wave motion
    // =========================================================================
    else if (currentStyle === 'blue_violet_matrix') {
      const phiGolden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const yNorm = 1 - (i / (count - 1)) * 2; // -1 to 1
        const radiusAtY = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
        const theta = phiGolden * i;
        const phi = Math.acos(Math.max(-1, Math.min(1, yNorm)));

        // Fluid undulating folded ribbon wave
        const wave = Math.sin(theta * 4) * Math.cos(phi * 3) * 0.18 + Math.sin(phi * 6) * 0.08;
        const r = baseRadius * (0.88 + wave);

        points.push({
          x: Math.cos(theta) * radiusAtY * r,
          y: yNorm * r,
          z: Math.sin(theta) * radiusAtY * r,
          baseRadius: r,
          theta,
          phi,
          phase: theta * 2 + phi * 3,
          colorType: i % 2 === 0 ? 0 : 1, // 0: Electric Blue/Sky, 1: Vivid Violet
          type: 'matrix'
        });
      }
    }
    // =========================================================================
    // STYLE 3: Magenta-Cyan Glowing Mesh (bd8d2f99f2effa5519a7639c3864e791.jpg)
    // Intricate particle mesh sphere with vibrant magenta, cyan & blue neon glowing gradients
    // =========================================================================
    else if (currentStyle === 'magenta_cyan_mesh') {
      const phiGolden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const yNorm = 1 - (i / (count - 1)) * 2; // +1 (top: cyan) to -1 (bottom: magenta)
        const radiusAtY = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
        const theta = phiGolden * i;
        const phi = Math.acos(Math.max(-1, Math.min(1, yNorm)));

        // Surface ripple turbulence matching the image
        const wave = Math.sin(theta * 5) * Math.sin(phi * 4) * 0.16 + Math.cos(theta * 3 + phi * 5) * 0.09;
        const r = baseRadius * (0.86 + wave);

        // Color mapping by vertical elevation
        let cType = 1; // Purple
        if (yNorm > 0.25) cType = 0; // Top Cyan
        else if (yNorm < -0.2) cType = 2; // Bottom Magenta

        points.push({
          x: Math.cos(theta) * radiusAtY * r,
          y: yNorm * r,
          z: Math.sin(theta) * radiusAtY * r,
          baseRadius: r,
          theta,
          phi,
          phase: theta * 3,
          colorType: cType,
          type: 'mesh'
        });
      }
    }
    // =========================================================================
    // STYLE 4: Purple Spiral Dot Globe (Screenshot_2026-11-09-08-30-53-451.jpg)
    // Precise spherical grid formed by concentric purple and white glowing dot lines with orbit rings
    // =========================================================================
    else {
      // 1. Concentric diagonal spiral dot rings forming the sphere
      const rings = 26;
      const dotsPerRing = Math.round((count * 0.8) / rings);
      const spiralTilt = 0.52; // ~30 deg diagonal spiral alignment like in screenshot

      for (let r = 0; r < rings; r++) {
        const ringFraction = r / (rings - 1);
        const phi = ringFraction * Math.PI; // 0 to PI
        const ringRadius = baseRadius * 0.94 * Math.sin(phi);
        const y = baseRadius * 0.94 * Math.cos(phi);

        for (let j = 0; j < dotsPerRing; j++) {
          const theta = (j / dotsPerRing) * Math.PI * 2 + r * 0.22; // Spiral twist offset

          // Rotate coordinate by spiral tilt
          const px = ringRadius * Math.cos(theta);
          const pz = ringRadius * Math.sin(theta);
          const py = y;

          // Tilted coordinate transform
          const xTilted = px * Math.cos(spiralTilt) - py * Math.sin(spiralTilt);
          const yTilted = px * Math.sin(spiralTilt) + py * Math.cos(spiralTilt);
          const zTilted = pz;

          // Color alternating between purple and white dots
          const isWhiteDot = (r + j) % 3 === 0;

          points.push({
            x: xTilted,
            y: yTilted,
            z: zTilted,
            baseRadius: baseRadius * 0.94,
            theta,
            phi,
            phase: theta + r,
            colorType: isWhiteDot ? 0 : 1, // 0: White glow, 1: Deep purple dot
            type: 'spiral_dot'
          });
        }
      }

      // 2. Surrounding Planetary Orbit Rings (Visible in screenshot)
      const orbitRingPoints = Math.round(count * 0.2);
      const orbitRadiusA = baseRadius * 1.28;
      const orbitRadiusB = baseRadius * 1.34;
      const orbitTilt = 0.35;

      for (let i = 0; i < orbitRingPoints; i++) {
        const angle = (i / orbitRingPoints) * Math.PI * 2;
        const rOrbit = i % 2 === 0 ? orbitRadiusA : orbitRadiusB;
        const ox = Math.cos(angle) * rOrbit;
        const oy = Math.sin(angle) * (rOrbit * 0.32); // Elliptical projection
        const oz = Math.sin(angle) * (rOrbit * 0.6);

        // Tilt orbit
        const xOrb = ox;
        const yOrb = oy * Math.cos(orbitTilt) - oz * Math.sin(orbitTilt);
        const zOrb = oy * Math.sin(orbitTilt) + oz * Math.cos(orbitTilt);

        points.push({
          x: xOrb,
          y: yOrb,
          z: zOrb,
          baseRadius: rOrbit,
          theta: angle,
          phi: Math.PI / 2,
          phase: angle * 2,
          colorType: 2, // Orbit ring purple aura
          type: 'orbit_ring'
        });
      }
    }

    let angleX = 0.15;
    let angleY = 0;
    let time = 0;

    const render = () => {
      ctx.clearRect(0, 0, size, size);

      const st = stateRef.current;
      const sp = speedRef.current;
      const gl = glowRef.current;
      const curStyle = resolveStyle(styleRef.current);

      let baseSpeed = 0.008;
      if (sp === 'slow') baseSpeed = 0.004;
      else if (sp === 'fast') baseSpeed = 0.015;

      let rotationMult = 1.0;
      let waveFreq = 1.0;
      let waveAmp = 1.0;

      if (st === 'listening') {
        rotationMult = 1.35;
        waveFreq = 2.0;
        waveAmp = 1.5;
      } else if (st === 'thinking') {
        rotationMult = 2.2;
        waveFreq = 3.2;
        waveAmp = 1.3;
      } else if (st === 'speaking') {
        rotationMult = 1.45;
        waveFreq = 4.0;
        waveAmp = 2.2;
      }

      time += 0.02 * waveFreq;

      if (curStyle === 'purple_spiral_globe') {
        // Spiral globe rotates primarily along its axis
        angleY += baseSpeed * 0.85 * rotationMult;
        angleX = 0.18;
      } else {
        angleY += baseSpeed * rotationMult;
        angleX += baseSpeed * 0.45 * rotationMult;
      }

      const centerX = size / 2;
      const centerY = size / 2;
      const fov = size * 1.25;

      // -----------------------------------------------------------------------
      // AMBIENT CORE GLOW
      // -----------------------------------------------------------------------
      let glowR = baseRadius * 1.25;
      if (gl === 'soft') glowR = baseRadius * 1.05;
      else if (gl === 'intense') glowR = baseRadius * 1.45;

      if (curStyle === 'glass_iridescent_wave') {
        const auraGrad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.2, centerX, centerY, glowR);
        auraGrad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        auraGrad.addColorStop(0.3, 'rgba(56, 189, 248, 0.25)'); // Cyan
        auraGrad.addColorStop(0.6, 'rgba(217, 70, 239, 0.18)'); // Magenta
        auraGrad.addColorStop(0.85, 'rgba(168, 85, 247, 0.08)'); // Purple
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
        ctx.fill();
      } else if (curStyle === 'blue_violet_matrix') {
        const blueGrad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.1, centerX, centerY, glowR);
        blueGrad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
        blueGrad.addColorStop(0.5, 'rgba(124, 58, 237, 0.2)');
        blueGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = blueGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
        ctx.fill();
      } else if (curStyle === 'magenta_cyan_mesh') {
        const grad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.1, centerX, centerY, glowR);
        grad.addColorStop(0, 'rgba(236, 72, 153, 0.32)');
        grad.addColorStop(0.5, 'rgba(6, 182, 212, 0.22)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
        ctx.fill();
      } else if (curStyle === 'purple_spiral_globe') {
        // Soft luminous lavender-purple ambient aura matching screenshot
        const purpleGrad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.2, centerX, centerY, glowR * 1.15);
        purpleGrad.addColorStop(0, 'rgba(192, 132, 252, 0.3)');
        purpleGrad.addColorStop(0.55, 'rgba(147, 51, 234, 0.18)');
        purpleGrad.addColorStop(0.85, 'rgba(126, 34, 206, 0.06)');
        purpleGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = purpleGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR * 1.15, 0, Math.PI * 2);
        ctx.fill();
      }

      // -----------------------------------------------------------------------
      // 3D TRANSFORM & PROJECTION
      // -----------------------------------------------------------------------
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      const projectedList: Array<{
        x2d: number;
        y2d: number;
        z: number;
        radius: number;
        alpha: number;
        color: string;
        haloColor: string;
        isOrbit?: boolean;
      }> = [];

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];

        let x = pt.x;
        let y = pt.y;
        let z = pt.z;

        // Dynamic State Modulation
        if (curStyle === 'glass_iridescent_wave') {
          if (pt.type === 'ribbon') {
            const wave = Math.sin(time * 2 + pt.phase) * (baseRadius * 0.12 * waveAmp);
            x += Math.cos(pt.theta + time) * wave;
            y += Math.sin(pt.phi + time * 1.5) * wave;
          }
        } else if (curStyle === 'blue_violet_matrix' || curStyle === 'magenta_cyan_mesh') {
          const wavePulse = Math.sin(time * 3 + pt.phase) * (3.5 * waveAmp);
          const normR = pt.baseRadius || 1;
          x += (pt.x / normR) * wavePulse;
          y += (pt.y / normR) * wavePulse;
          z += (pt.z / normR) * wavePulse;
        } else if (curStyle === 'purple_spiral_globe') {
          if (pt.type === 'spiral_dot') {
            // Harmonic wave along spiral lines
            const pulse = 1 + Math.sin(time * 3 + pt.phase) * 0.03 * waveAmp;
            x *= pulse;
            y *= pulse;
            z *= pulse;
          } else if (pt.type === 'orbit_ring') {
            // Orbit gentle rotation
            const orbPulse = 1 + Math.sin(time * 2 + pt.phase) * 0.02;
            x *= orbPulse;
            y *= orbPulse;
            z *= orbPulse;
          }
        }

        // Rotate Y
        const rx1 = x * cosY + z * sinY;
        const ry1 = y;
        const rz1 = -x * sinY + z * cosY;

        // Rotate X
        const rx2 = rx1;
        const ry2 = ry1 * cosX - rz1 * sinX;
        const rz2 = ry1 * sinX + rz1 * cosX;

        // Perspective
        const scale = fov / (fov + rz2);
        const x2d = centerX + rx2 * scale;
        const y2d = centerY + ry2 * scale;

        const depthNorm = (rz2 + baseRadius) / (baseRadius * 2);
        const alpha = Math.max(0.15, Math.min(1.0, 0.25 + depthNorm * 0.75));
        const ptRadius = Math.max(0.8, (1.2 + depthNorm * 1.8) * scale);

        // Color selection
        let color = '#38bdf8';
        let haloColor = 'rgba(56, 189, 248, 0.4)';
        let isOrbit = false;

        if (curStyle === 'glass_iridescent_wave') {
          if (pt.colorType === 0) {
            color = '#38bdf8'; // Cyan
            haloColor = 'rgba(56, 189, 248, 0.5)';
          } else if (pt.colorType === 1) {
            color = '#ec4899'; // Magenta
            haloColor = 'rgba(236, 72, 153, 0.5)';
          } else if (pt.colorType === 2) {
            color = '#fde047'; // Gold
            haloColor = 'rgba(253, 224, 71, 0.45)';
          } else if (pt.colorType === 3) {
            color = '#34d399'; // Emerald
            haloColor = 'rgba(52, 211, 153, 0.45)';
          } else {
            color = '#ffffff'; // White shell
            haloColor = 'rgba(255, 255, 255, 0.7)';
          }
        } else if (curStyle === 'blue_violet_matrix') {
          if (pt.colorType === 0) {
            color = '#38bdf8'; // Electric Sky Blue
            haloColor = 'rgba(56, 189, 248, 0.5)';
          } else {
            color = '#a855f7'; // Bright Violet
            haloColor = 'rgba(168, 85, 247, 0.5)';
          }
        } else if (curStyle === 'magenta_cyan_mesh') {
          if (pt.colorType === 0) {
            color = '#06b6d4'; // Electric Cyan
            haloColor = 'rgba(6, 182, 212, 0.5)';
          } else if (pt.colorType === 1) {
            color = '#a855f7'; // Purple Transition
            haloColor = 'rgba(168, 85, 247, 0.5)';
          } else {
            color = '#ec4899'; // Hot Magenta
            haloColor = 'rgba(236, 72, 153, 0.5)';
          }
        } else if (curStyle === 'purple_spiral_globe') {
          if (pt.type === 'orbit_ring') {
            color = '#c084fc'; // Light purple orbital line
            haloColor = 'rgba(192, 132, 252, 0.4)';
            isOrbit = true;
          } else if (pt.colorType === 0) {
            color = '#ffffff'; // Crisp white glowing dot
            haloColor = 'rgba(255, 255, 255, 0.75)';
          } else {
            color = '#9333ea'; // Rich purple dot
            haloColor = 'rgba(147, 51, 234, 0.6)';
          }
        }

        projectedList.push({
          x2d,
          y2d,
          z: rz2,
          radius: ptRadius,
          alpha,
          color,
          haloColor,
          isOrbit
        });
      }

      // Depth sort
      projectedList.sort((a, b) => a.z - b.z);

      // Render dots
      for (let i = 0; i < projectedList.length; i++) {
        const p = projectedList[i];

        ctx.save();
        ctx.globalAlpha = p.alpha;

        // Draw radiant halo first if dot is in front hemisphere
        if (p.z > 0) {
          ctx.fillStyle = p.haloColor;
          ctx.beginPath();
          ctx.arc(p.x2d, p.y2d, p.radius * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Crisp solid core dot
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x2d, p.y2d, p.isOrbit ? p.radius * 0.75 : p.radius, 0, Math.PI * 2);
        ctx.fill();

        // White glowing dots: crisp specular highlight
        if (p.color === '#ffffff' && p.z > -10) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(p.x2d, p.y2d, p.radius * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      // Post-Processing Glass Highlight for Style 1
      if (curStyle === 'glass_iridescent_wave') {
        ctx.save();
        const coreGrad = ctx.createRadialGradient(
          centerX, 
          centerY, 
          0, 
          centerX, 
          centerY, 
          baseRadius * 0.55 * (1 + Math.sin(time * 3) * 0.1 * waveAmp)
        );
        coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
        coreGrad.addColorStop(0.3, 'rgba(224, 242, 254, 0.5)');
        coreGrad.addColorStop(0.7, 'rgba(192, 132, 252, 0.25)');
        coreGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // Rim
        const rimGrad = ctx.createRadialGradient(
          centerX - baseRadius * 0.25, 
          centerY - baseRadius * 0.28, 
          baseRadius * 0.1, 
          centerX, 
          centerY, 
          baseRadius
        );
        rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        rimGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.05)');
        rimGrad.addColorStop(0.92, 'rgba(56, 189, 248, 0.35)');
        rimGrad.addColorStop(0.98, 'rgba(217, 70, 239, 0.55)');
        rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0.7)');

        ctx.strokeStyle = rimGrad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 0.98, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
        ctx.beginPath();
        ctx.ellipse(
          centerX - baseRadius * 0.32, 
          centerY - baseRadius * 0.35, 
          baseRadius * 0.26, 
          baseRadius * 0.12, 
          -Math.PI / 4, 
          0, 
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }

      // Post-Processing for Style 4 Purple Spiral Globe: Concentric planetary orbit rings
      if (curStyle === 'purple_spiral_globe') {
        ctx.save();
        // Inner luminous orbit ring
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.5)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, baseRadius * 1.24, baseRadius * 0.42, 0.36, 0, Math.PI * 2);
        ctx.stroke();

        // Outer subtle planetary orbit ring
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.32)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, baseRadius * 1.35, baseRadius * 0.46, 0.36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

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
      className="relative flex items-center justify-center cursor-pointer select-none"
      onClick={onClick}
      style={{ width: size, height: size }}
    >
      <canvas 
        ref={canvasRef} 
        className="block transition-transform duration-300 hover:scale-105 active:scale-95"
      />
    </div>
  );
};
