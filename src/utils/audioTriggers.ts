import { CustomAudioTrigger, CustomAudioTriggerKind } from '../types';

export interface AcousticFrameFeatures {
  rms: number;
  crestFactor: number;
  peakHz: number;
  centroidHz: number;
  tonalityRatio: number;
  bandProfile: number[];
}

const BAND_EDGES_HZ = [
  250, 350, 480, 650, 880, 1150, 1450, 1800,
  2200, 2650, 3150, 3700, 4350, 5100, 6000, 7200, 8600
];

export function extractAcousticFrameFeatures(
  timeDomain: Uint8Array,
  freqData: Uint8Array,
  sampleRate: number
): AcousticFrameFeatures {
  let sumSq = 0;
  let peakAbs = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    const sample = (timeDomain[i] - 128) / 128;
    const abs = Math.abs(sample);
    if (abs > peakAbs) peakAbs = abs;
    sumSq += sample * sample;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, timeDomain.length));
  const crestFactor = peakAbs / Math.max(rms, 0.0001);

  const nyquist = sampleRate / 2;
  const binHz = nyquist / Math.max(1, freqData.length);

  const minBin = Math.max(1, Math.floor(250 / binHz));
  const maxBin = Math.min(freqData.length - 1, Math.ceil(7500 / binHz));

  let peakBin = minBin;
  let peakVal = 0;
  let sumMag = 0;
  let weightedFreqSum = 0;

  for (let b = minBin; b <= maxBin; b++) {
    const val = freqData[b];
    const hz = b * binHz;
    sumMag += val;
    weightedFreqSum += val * hz;
    if (val > peakVal) {
      peakVal = val;
      peakBin = b;
    }
  }

  const binCount = Math.max(1, maxBin - minBin + 1);
  const meanMag = sumMag / binCount;
  const tonalityRatio = peakVal / Math.max(1, meanMag);
  const peakHz = peakBin * binHz;
  const centroidHz = sumMag > 0 ? weightedFreqSum / sumMag : peakHz;

  const bandProfile = new Array<number>(16).fill(0);
  for (let band = 0; band < 16; band++) {
    const startHz = BAND_EDGES_HZ[band];
    const endHz = BAND_EDGES_HZ[band + 1];
    const bStart = Math.max(1, Math.floor(startHz / binHz));
    const bEnd = Math.min(freqData.length - 1, Math.ceil(endHz / binHz));
    let bandSum = 0;
    let bandBins = 0;
    for (let b = bStart; b <= bEnd; b++) {
      bandSum += freqData[b];
      bandBins++;
    }
    bandProfile[band] = bandBins > 0 ? bandSum / bandBins : 0;
  }

  return {
    rms,
    crestFactor,
    peakHz,
    centroidHz,
    tonalityRatio,
    bandProfile: normalizeVector(bandProfile)
  };
}

export function normalizeVector(vec: number[]): number[] {
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq);
  if (norm < 1e-6) return vec.map(() => 0);
  return vec.map(v => Number((v / norm).toFixed(4)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 1e-6 ? dot / denom : 0;
}

export interface TriggerMatchResult {
  trigger: CustomAudioTrigger;
  score: number;
}

export function matchAcousticFrame(
  features: AcousticFrameFeatures,
  triggers: CustomAudioTrigger[],
  whistleStreaks: Map<string, number>
): TriggerMatchResult | null {
  if (!triggers || triggers.length === 0) return null;

  let bestMatch: TriggerMatchResult | null = null;

  for (const trigger of triggers) {
    const sens = Math.max(0.5, Math.min(0.92, trigger.sensitivity ?? 0.72));
    const simRelax = (sens - 0.72) * 0.14; // Gentle sensitivity offset without opening up to ambient speech

    const sim = cosineSimilarity(features.bandProfile, trigger.bandProfile || []);

    if (trigger.kind === 'whistle') {
      // Mouth whistles exhibit sharp narrowband energy >= 750 Hz with high spectral tonality (>= 4.0)
      const minRms = Math.max(0.026, (trigger.rmsThreshold || 0.045) * (0.55 - simRelax));
      const minTonality = Math.max(4.0, Math.min(6.2, (trigger.tonalityRatio || 5.0) * 0.68));
      const hzDiff = Math.abs(features.peakHz - trigger.peakHz);
      const maxHzDiff = 240 + (sens - 0.72) * 140;

      const isFrameHit =
        features.peakHz >= 750 &&
        features.rms >= minRms &&
        features.tonalityRatio >= minTonality &&
        hzDiff <= maxHzDiff &&
        sim >= (0.80 - simRelax);

      const prevStreak = whistleStreaks.get(trigger.id) || 0;
      if (isFrameHit) {
        const nextStreak = prevStreak + 1;
        whistleStreaks.set(trigger.id, nextStreak);
        if (nextStreak >= 3) {
          const score = sim * 0.7 + Math.max(0, 1 - hzDiff / 360) * 0.3;
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { trigger, score };
          }
        }
      } else {
        whistleStreaks.set(trigger.id, Math.max(0, prevStreak - 1));
      }
      continue;
    }

    if (trigger.kind === 'snap') {
      // Finger snaps exhibit sharp broadband impulse (high crest factor + high spectral centroid >= 1550 Hz)
      const minRms = Math.max(0.042, (trigger.rmsThreshold || 0.065) * (0.58 - simRelax));
      const minCrest = Math.max(3.35, Math.min(4.8, (trigger.crestFactor || 4.0) * 0.72));
      const isSnapHit =
        features.rms >= minRms &&
        features.crestFactor >= minCrest &&
        features.centroidHz >= 1550 &&
        features.peakHz >= 1050 &&
        sim >= (0.76 - simRelax);

      if (isSnapHit) {
        const score = sim * 0.65 + Math.min(1, features.crestFactor / 6) * 0.35;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { trigger, score };
        }
      }
      continue;
    }

    // Custom short acoustic trigger: require 2 consecutive matching frames to avoid casual spoken words
    const minRms = Math.max(0.040, (trigger.rmsThreshold || 0.06) * (0.58 - simRelax));
    const isCustomHit = features.rms >= minRms && sim >= (0.84 - simRelax);
    const prevStreak = whistleStreaks.get(trigger.id) || 0;
    if (isCustomHit) {
      const nextStreak = prevStreak + 1;
      whistleStreaks.set(trigger.id, nextStreak);
      if (nextStreak >= 2 && (!bestMatch || sim > bestMatch.score)) {
        bestMatch = { trigger, score: sim };
      }
    } else {
      whistleStreaks.set(trigger.id, 0);
    }
  }

  return bestMatch;
}

/**
 * Records ~2.2 seconds of microphone audio and extracts a compact spectral signature
 * for a mouth whistle (শিস), finger snap/click, or custom trigger sound.
 */
export async function recordCustomAudioTrigger(
  kind: CustomAudioTriggerKind,
  label: string,
  onProgress?: (percent: number) => void
): Promise<CustomAudioTrigger> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone recording is unavailable in this environment.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) {
    stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
    throw new Error('Web Audio API is not supported on this device.');
  }

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.15;
  source.connect(analyser);

  const timeDomain = new Uint8Array(analyser.fftSize);
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const collected: AcousticFrameFeatures[] = [];

  const durationMs = 2200;
  const intervalMs = 40;
  const totalSteps = Math.ceil(durationMs / intervalMs);

  try {
    await new Promise<void>((resolve) => {
      let step = 0;
      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(timeDomain);
        analyser.getByteFrequencyData(freqData);
        collected.push(extractAcousticFrameFeatures(timeDomain, freqData, ctx.sampleRate));
        step++;
        onProgress?.(Math.min(100, Math.round((step / totalSteps) * 100)));
        if (step >= totalSteps) {
          clearInterval(timer);
          resolve();
        }
      }, intervalMs);
    });
  } finally {
    stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
    try { await ctx.close(); } catch {}
  }

  // Pick salient frames representing the target sound rather than background room silence
  let activeFrames = collected.filter(f => f.rms >= 0.020);
  if (activeFrames.length === 0) {
    throw new Error(
      kind === 'whistle'
        ? 'No whistle sound detected. Try whistling clearly closer to the mic.'
        : kind === 'snap'
        ? 'No finger snap detected. Try snapping sharply near the mic.'
        : 'No clear sound detected. Please record a louder trigger sound.'
    );
  }

  if (kind === 'whistle') {
    const tonalFrames = activeFrames.filter(f => f.tonalityRatio >= 3.4 && f.peakHz >= 750 && f.peakHz <= 4200);
    if (tonalFrames.length >= 2) {
      tonalFrames.sort((a, b) => (b.rms * b.tonalityRatio) - (a.rms * a.tonalityRatio));
      activeFrames = tonalFrames.slice(0, Math.min(10, tonalFrames.length));
    } else {
      activeFrames.sort((a, b) => (b.rms * b.tonalityRatio) - (a.rms * a.tonalityRatio));
      activeFrames = activeFrames.slice(0, Math.min(6, activeFrames.length));
    }
  } else if (kind === 'snap') {
    const sharpFrames = activeFrames.filter(f => f.crestFactor >= 2.8 && f.centroidHz >= 1200);
    const pool = sharpFrames.length >= 1 ? sharpFrames : activeFrames;
    pool.sort((a, b) => (b.rms * b.crestFactor) - (a.rms * a.crestFactor));
    activeFrames = pool.slice(0, Math.min(4, pool.length));
  } else {
    activeFrames.sort((a, b) => b.rms - a.rms);
    activeFrames = activeFrames.slice(0, Math.min(8, activeFrames.length));
  }

  const count = activeFrames.length;
  const avgPeakHz = Math.round(activeFrames.reduce((s, f) => s + f.peakHz, 0) / count);
  const avgCentroidHz = Math.round(activeFrames.reduce((s, f) => s + f.centroidHz, 0) / count);
  const avgTonality = Number((activeFrames.reduce((s, f) => s + f.tonalityRatio, 0) / count).toFixed(2));
  const avgCrest = Number((activeFrames.reduce((s, f) => s + f.crestFactor, 0) / count).toFixed(2));
  const avgRms = Number((activeFrames.reduce((s, f) => s + f.rms, 0) / count).toFixed(4));

  const summedBands = new Array<number>(16).fill(0);
  for (const frame of activeFrames) {
    for (let i = 0; i < 16; i++) {
      summedBands[i] += frame.bandProfile[i] || 0;
    }
  }

  const defaultLabel =
    kind === 'whistle'
      ? 'Mouth Whistle (শিস)'
      : kind === 'snap'
      ? 'Finger Snap'
      : 'Custom Sound';

  return {
    id: `trig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: label.trim() || defaultLabel,
    kind,
    peakHz: avgPeakHz,
    centroidHz: avgCentroidHz,
    tonalityRatio: avgTonality,
    crestFactor: avgCrest,
    rmsThreshold: Math.max(0.025, avgRms),
    bandProfile: normalizeVector(summedBands),
    sensitivity: 0.72,
    createdAt: Date.now()
  };
}
