import { OwnerFaceProfile, SecurityRecoveryHint } from '../types';

/**
 * Zuzu AI Anti-Theft Smart Face Recognition & Security Recovery Guard
 * - Uses @mediapipe/tasks-vision FaceLandmarker (478 3D facial landmarks -> haircut/shave-invariant biometric ratios)
 *   with automatic offline fallback to native Chromium/Android FaceDetector + spatial patch & edge gradient descriptor
 * - Supports up to 5 reference owner photos (live front-camera captures and multi-photo gallery uploads)
 * - Supports live visual verification AND silent background checks
 * - Protects Master PIN recovery with configurable Security Recovery Hints
 */

const SECURITY_LOCK_KEY = 'zuzu_security_locked';
const SECURITY_ATTEMPTS_KEY = 'zuzu_security_failed_attempts';
const SECURITY_LAST_EVENT_KEY = 'zuzu_security_last_event';

export const MAX_OWNER_FACE_PROFILES = 5;

export const SECURITY_HINT_QUESTIONS = [
  'What is your favorite nickname?',
  'What is your favorite food?',
  'What is your favorite school?',
  'What is your favorite animal?'
] as const;

// ----------------- MASTER PIN & RECOVERY HINTS -----------------

export function hashMasterPin(pin: string): string {
  const clean = pin.trim();
  if (!clean) return '';
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const salted = `zuzu_nusu_pin::${clean}::v361`;
  for (let i = 0; i < salted.length; i++) {
    const ch = salted.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `pin_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
}

export function verifyMasterPin(pin: string, storedHash: string): boolean {
  if (!storedHash) return false;
  return hashMasterPin(pin) === storedHash;
}

export function hashSecurityAnswer(answer: string): string {
  const clean = answer.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!clean) return '';
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const salted = `zuzu_sec_hint::${clean}::v363`;
  for (let i = 0; i < salted.length; i++) {
    const ch = salted.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch * 17 + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `hint_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
}

export function verifySecurityHints(
  hints: SecurityRecoveryHint[] | undefined,
  userAnswers: string[]
): boolean {
  if (!hints || hints.length === 0) return false;
  if (userAnswers.length < hints.length) return false;
  return hints.every((hint, idx) => {
    const candidate = hashSecurityAnswer(userAnswers[idx] || '');
    return candidate.length > 0 && candidate === hint.answerHash;
  });
}

// ----------------- LOCK STATE HELPERS -----------------

export function isSecurityLocked(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SECURITY_LOCK_KEY) === 'true';
}

export function getFailedSecurityAttempts(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(SECURITY_ATTEMPTS_KEY) || '0', 10) || 0;
}

export function resetFailedSecurityAttempts(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SECURITY_ATTEMPTS_KEY, '0');
}

export function setSecurityLocked(locked: boolean, reason?: string): void {
  if (typeof window === 'undefined') return;
  if (locked) {
    localStorage.setItem(SECURITY_LOCK_KEY, 'true');
    if (reason) {
      localStorage.setItem(SECURITY_LAST_EVENT_KEY, reason);
    }
    window.dispatchEvent(new CustomEvent('zuzu-security-lock-changed', { detail: { locked: true, reason } }));
  } else {
    localStorage.removeItem(SECURITY_LOCK_KEY);
    localStorage.setItem(SECURITY_ATTEMPTS_KEY, '0');
    localStorage.removeItem(SECURITY_LAST_EVENT_KEY);
    window.dispatchEvent(new CustomEvent('zuzu-security-lock-changed', { detail: { locked: false } }));
  }
}

export function getLastSecurityLockReason(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SECURITY_LAST_EVENT_KEY) || 'Unrecognized user detected on front camera.';
}

// ----------------- MEDIAPIPE FACE LANDMARKER ENGINE -----------------

let mediaPipeLandmarkerPromise: Promise<any | null> | null = null;

async function getMediaPipeFaceLandmarker(): Promise<any | null> {
  if (typeof window === 'undefined') return null;
  if (mediaPipeLandmarkerPromise) return mediaPipeLandmarkerPromise;

  mediaPipeLandmarkerPromise = (async () => {
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const { FilesetResolver, FaceLandmarker } = vision;
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
      );
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'IMAGE',
        numFaces: 2,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      });
      return landmarker;
    } catch (err) {
      console.warn('[FaceGuard] MediaPipe model offline/unavailable, using on-device local detector:', err);
      mediaPipeLandmarkerPromise = null;
      return null;
    }
  })();

  return mediaPipeLandmarkerPromise;
}

export interface DetectedFaceResult {
  box: { x: number; y: number; w: number; h: number };
  landmarks?: Array<{ x: number; y: number; z?: number }>;
  engine: 'mediapipe' | 'native' | 'local';
}

/**
 * Extracts 32 structural facial landmark ratios that stay invariant across haircuts, shaves, beards & lighting
 */
function extractMediaPipeGeometryVector(
  landmarks: Array<{ x: number; y: number; z?: number }>
): number[] {
  if (!landmarks || landmarks.length < 400) return [];

  // Key stable anatomical landmarks (eyes, nose bridge, nose tip, cheekbones, mouth corners, chin, brow)
  const indices = [
    33, 133, 362, 263, // eye corners (left/right inner & outer)
    159, 145, 386, 374, // upper/lower eyelids
    1, 2, 6, 168, // nose tip, subnasale, bridge, glabella
    61, 291, 0, 17, // mouth corners, upper/lower lip
    234, 454, 10, 152, // left/right cheek, forehead center, chin
    70, 105, 300, 334, // eyebrows
    50, 280 // zygomatic cheeks
  ];

  const leftEyeCenter = {
    x: (landmarks[33].x + landmarks[133].x) / 2,
    y: (landmarks[33].y + landmarks[133].y) / 2
  };
  const rightEyeCenter = {
    x: (landmarks[362].x + landmarks[263].x) / 2,
    y: (landmarks[362].y + landmarks[263].y) / 2
  };
  const interOcular = Math.hypot(
    rightEyeCenter.x - leftEyeCenter.x,
    rightEyeCenter.y - leftEyeCenter.y
  ) || 0.1;

  const anchor = landmarks[168]; // glabella between eyes
  const raw: number[] = [];

  for (const idx of indices) {
    const pt = landmarks[idx];
    const dist = Math.hypot(pt.x - anchor.x, pt.y - anchor.y) / interOcular;
    raw.push(dist);
  }

  // Pairwise biometric ratios (eye width vs mouth width, nose length vs face width, jaw vs brow)
  const leftEyeW = Math.hypot(landmarks[133].x - landmarks[33].x, landmarks[133].y - landmarks[33].y) / interOcular;
  const rightEyeW = Math.hypot(landmarks[263].x - landmarks[362].x, landmarks[263].y - landmarks[362].y) / interOcular;
  const mouthW = Math.hypot(landmarks[291].x - landmarks[61].x, landmarks[291].y - landmarks[61].y) / interOcular;
  const noseLen = Math.hypot(landmarks[1].x - landmarks[168].x, landmarks[1].y - landmarks[168].y) / interOcular;
  const faceW = Math.hypot(landmarks[454].x - landmarks[234].x, landmarks[454].y - landmarks[234].y) / interOcular;
  const cheekRatio = Math.hypot(landmarks[280].x - landmarks[50].x, landmarks[280].y - landmarks[50].y) / interOcular;
  raw.push(leftEyeW, rightEyeW, mouthW, noseLen, faceW, cheekRatio);

  const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
  const std = Math.sqrt(raw.reduce((s, v) => s + (v - mean) ** 2, 0) / raw.length) || 1;
  const norm = raw.map(v => (v - mean) / std);
  const mag = Math.sqrt(norm.reduce((s, v) => s + v * v, 0)) || 1;
  return norm.map(v => Number((v / mag).toFixed(4)));
}

export async function detectFaceInCanvas(canvas: HTMLCanvasElement): Promise<DetectedFaceResult | null> {
  // 1. Try MediaPipe FaceLandmarker first (highest accuracy, 478 landmarks)
  try {
    const landmarker = await getMediaPipeFaceLandmarker();
    if (landmarker) {
      const result = landmarker.detect(canvas);
      const faceLandmarks = result?.faceLandmarks?.[0];
      if (Array.isArray(faceLandmarks) && faceLandmarks.length > 0) {
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of faceLandmarks) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        const x = Math.max(0, Math.floor(minX * canvas.width));
        const y = Math.max(0, Math.floor(minY * canvas.height));
        const w = Math.max(32, Math.floor((maxX - minX) * canvas.width));
        const h = Math.max(32, Math.floor((maxY - minY) * canvas.height));
        return {
          box: { x, y, w, h },
          landmarks: faceLandmarks,
          engine: 'mediapipe'
        };
      }
      return null;
    }
  } catch {
    // Fall through cleanly if MediaPipe throws on a frame
  }

  // 2. Fallback: Native Chromium / Android WebView FaceDetector API
  const FaceDetectorCtor = (window as any).FaceDetector;
  if (typeof FaceDetectorCtor === 'function') {
    try {
      const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 2 });
      const faces = await detector.detect(canvas);
      if (Array.isArray(faces) && faces.length > 0) {
        const bb = faces[0].boundingBox;
        return {
          box: {
            x: Math.max(0, Math.floor(bb.x)),
            y: Math.max(0, Math.floor(bb.y)),
            w: Math.max(32, Math.floor(bb.width)),
            h: Math.max(32, Math.floor(bb.height))
          },
          engine: 'native'
        };
      }
      return null;
    } catch {
      // Fallback below
    }
  }

  // 3. Offline heuristic facial presence check (portrait center ROI)
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const cx = Math.floor(canvas.width * 0.25);
  const cy = Math.floor(canvas.height * 0.15);
  const cw = Math.floor(canvas.width * 0.5);
  const ch = Math.floor(canvas.height * 0.7);
  if (cw <= 0 || ch <= 0) return null;

  const data = ctx.getImageData(cx, cy, cw, ch).data;
  let lumSum = 0;
  let lumSqSum = 0;
  let skinLikePixels = 0;
  const totalPixels = cw * ch;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    lumSum += lum;
    lumSqSum += lum * lum;
    if (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 10) {
      skinLikePixels++;
    }
  }

  const mean = lumSum / totalPixels;
  const variance = Math.max(0, lumSqSum / totalPixels - mean * mean);
  const skinRatio = skinLikePixels / totalPixels;

  if (mean < 18 || variance < 110 || skinRatio < 0.08) {
    return null;
  }

  return {
    box: { x: cx, y: cy, w: cw, h: ch },
    engine: 'local'
  };
}

/**
 * Extracts illumination-normalized 64-dim facial appearance patch + optional 32-dim MediaPipe geometry
 * Tightly crops the inner facial core (eye-nose-mouth region) so hairstyles/backgrounds affect it minimally.
 */
function extractDescriptorFromDetection(
  canvas: HTMLCanvasElement,
  detection: DetectedFaceResult
): number[] {
  const { box, landmarks } = detection;
  // Focus tightly on inner facial core (15% inset horizontally, 18% top inset for forehead/hair invariance)
  const coreX = Math.max(0, Math.floor(box.x + box.w * 0.14));
  const coreY = Math.max(0, Math.floor(box.y + box.h * 0.18));
  const coreW = Math.max(24, Math.floor(box.w * 0.72));
  const coreH = Math.max(24, Math.floor(box.h * 0.68));

  const grid = 8;
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = grid;
  tmpCanvas.height = grid;
  const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });
  if (!tmpCtx) return [];

  tmpCtx.drawImage(canvas, coreX, coreY, coreW, coreH, 0, 0, grid, grid);
  const img = tmpCtx.getImageData(0, 0, grid, grid).data;

  const rawPatch: number[] = [];
  for (let i = 0; i < img.length; i += 4) {
    rawPatch.push(0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]);
  }

  const mean = rawPatch.reduce((s, v) => s + v, 0) / rawPatch.length;
  const std = Math.sqrt(rawPatch.reduce((s, v) => s + (v - mean) ** 2, 0) / rawPatch.length) || 1;
  const normPatch = rawPatch.map(v => (v - mean) / std);
  const magPatch = Math.sqrt(normPatch.reduce((s, v) => s + v * v, 0)) || 1;
  const patchVec = normPatch.map(v => Number((v / magPatch).toFixed(4)));

  if (landmarks && landmarks.length >= 400) {
    const geomVec = extractMediaPipeGeometryVector(landmarks);
    if (geomVec.length === 32) {
      return [...patchVec, ...geomVec]; // 96-dim combined descriptor
    }
  }

  return patchVec; // 64-dim offline descriptor
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length) return 0;
  // If both contain 96-dim MediaPipe landmark geometry, weight landmarks 55% + facial core 45%
  if (a.length === 96 && b.length === 96) {
    const patchSim = rawCosine(a.slice(0, 64), b.slice(0, 64));
    const geomSim = rawCosine(a.slice(64, 96), b.slice(64, 96));
    return patchSim * 0.45 + geomSim * 0.55;
  }
  const len = Math.min(a.length, b.length, 64);
  return rawCosine(a.slice(0, len), b.slice(0, len));
}

function rawCosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function makeCompactThumbnail(canvas: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }): string {
  const thumb = document.createElement('canvas');
  thumb.width = 96;
  thumb.height = 96;
  const ctx = thumb.getContext('2d');
  if (!ctx) return '';
  const padX = Math.floor(box.w * 0.15);
  const padY = Math.floor(box.h * 0.15);
  const sx = Math.max(0, box.x - padX);
  const sy = Math.max(0, box.y - padY);
  const sw = Math.min(canvas.width - sx, box.w + padX * 2);
  const sh = Math.min(canvas.height - sy, box.h + padY * 2);
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, 96, 96);
  return thumb.toDataURL('image/jpeg', 0.6);
}

/**
 * Draw any HTMLVideoElement / HTMLImageElement / HTMLCanvasElement onto a normalized work canvas
 */
function sourceToWorkCanvas(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const rawW =
    source instanceof HTMLVideoElement
      ? source.videoWidth || 320
      : source instanceof HTMLImageElement
      ? source.naturalWidth || source.width || 320
      : source.width || 320;
  const rawH =
    source instanceof HTMLVideoElement
      ? source.videoHeight || 240
      : source instanceof HTMLImageElement
      ? source.naturalHeight || source.height || 240
      : source.height || 240;

  const maxSide = 480;
  const scale = Math.min(1, maxSide / Math.max(rawW, rawH));
  const w = Math.max(64, Math.round(rawW * scale));
  const h = Math.max(64, Math.round(rawH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(source, 0, 0, w, h);
  }
  return canvas;
}

/**
 * Enrolls a single OwnerFaceProfile from a live camera video element or uploaded image
 */
export async function extractFaceProfileFromSource(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  label: string,
  origin: 'camera' | 'upload'
): Promise<{
  success: boolean;
  profile?: OwnerFaceProfile;
  detection?: DetectedFaceResult;
  message: string;
}> {
  const canvas = sourceToWorkCanvas(source);
  const detection = await detectFaceInCanvas(canvas);
  if (!detection) {
    return {
      success: false,
      message: 'No clear face found. Ensure the face is well-lit and facing forward.'
    };
  }

  const descriptor = extractDescriptorFromDetection(canvas, detection);
  if (descriptor.length < 64) {
    return {
      success: false,
      message: 'Could not extract facial descriptor from image.'
    };
  }

  const thumbnail = makeCompactThumbnail(canvas, detection.box);
  const profile: OwnerFaceProfile = {
    id: `face_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label,
    thumbnail,
    descriptor,
    createdAt: Date.now(),
    source: origin
  };

  return {
    success: true,
    profile,
    detection,
    message: `Enrolled "${label}" via ${detection.engine === 'mediapipe' ? 'MediaPipe Face Guard' : 'On-Device Guard'}.`
  };
}

/**
 * Batch processes up to MAX_OWNER_FACE_PROFILES (5) uploaded reference photos
 */
export async function extractFaceProfilesFromFiles(
  files: FileList | File[],
  existingCount: number,
  maxTotal = MAX_OWNER_FACE_PROFILES
): Promise<{
  added: OwnerFaceProfile[];
  failedCount: number;
  message: string;
}> {
  const remainingSlots = Math.max(0, maxTotal - existingCount);
  if (remainingSlots <= 0) {
    return {
      added: [],
      failedCount: 0,
      message: `Maximum ${maxTotal} reference photos enrolled. Remove a photo to add a new one.`
    };
  }

  const fileArray = Array.from(files).slice(0, remainingSlots);
  const added: OwnerFaceProfile[] = [];
  let failedCount = 0;

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const el = new Image();
        el.onload = () => {
          URL.revokeObjectURL(url);
          resolve(el);
        };
        el.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Image load error'));
        };
        el.src = url;
      });

      const label = `Photo ${existingCount + added.length + 1}`;
      const res = await extractFaceProfileFromSource(img, label, 'upload');
      if (res.success && res.profile) {
        added.push(res.profile);
      } else {
        failedCount++;
      }
    } catch {
      failedCount++;
    }
  }

  const summary =
    added.length > 0
      ? `Enrolled ${added.length} reference photo${added.length > 1 ? 's' : ''}${failedCount > 0 ? ` (${failedCount} skipped — no clear face)` : ''}.`
      : 'Could not detect a clear face in the selected photos.';

  return { added, failedCount, message: summary };
}

export interface LiveVerifyResult {
  status: 'owner_verified' | 'unrecognized' | 'no_face' | 'error';
  similarity: number;
  matchedLabel?: string;
  detection?: DetectedFaceResult | null;
  canvasWidth?: number;
  canvasHeight?: number;
  detail: string;
}

/**
 * Compares a live video frame (from real-time FaceScannerModal) against all enrolled reference photos
 */
export async function verifyLiveFrameAgainstProfiles(
  source: HTMLVideoElement | HTMLCanvasElement,
  profiles: OwnerFaceProfile[] | undefined,
  legacyDescriptor?: number[]
): Promise<LiveVerifyResult> {
  const candidates: Array<{ label: string; descriptor: number[] }> = [];
  if (Array.isArray(profiles)) {
    for (const p of profiles) {
      if (Array.isArray(p?.descriptor) && p.descriptor.length >= 64) {
        candidates.push({ label: p.label || 'Owner', descriptor: p.descriptor });
      }
    }
  }
  if (Array.isArray(legacyDescriptor) && legacyDescriptor.length >= 64) {
    candidates.push({ label: 'Primary', descriptor: legacyDescriptor });
  }

  if (candidates.length === 0) {
    return {
      status: 'error',
      similarity: 0,
      detail: 'No owner face enrolled yet.'
    };
  }

  const canvas = sourceToWorkCanvas(source);
  const detection = await detectFaceInCanvas(canvas);
  if (!detection) {
    return {
      status: 'no_face',
      similarity: 0,
      detection: null,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      detail: 'Align your face inside the frame...'
    };
  }

  const liveVec = extractDescriptorFromDetection(canvas, detection);
  let bestSim = 0;
  let bestLabel = 'Owner';

  for (const cand of candidates) {
    const sim = cosineSimilarity(cand.descriptor, liveVec);
    if (sim > bestSim) {
      bestSim = sim;
      bestLabel = cand.label;
    }
  }

  const MATCH_THRESHOLD = 0.78;
  if (bestSim >= MATCH_THRESHOLD) {
    resetFailedSecurityAttempts();
    return {
      status: 'owner_verified',
      similarity: bestSim,
      matchedLabel: bestLabel,
      detection,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      detail: `Owner Verified (${Math.round(bestSim * 100)}% match • ${bestLabel})`
    };
  }

  return {
    status: 'unrecognized',
    similarity: bestSim,
    detection,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    detail: `Unrecognized face (${Math.round(bestSim * 100)}% match)`
  };
}

// ----------------- SILENT BACKGROUND CAPTURE & CHECK -----------------

async function captureFrontCameraFrame(): Promise<{
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Front camera is unavailable on this device.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 320 },
      height: { ideal: 240 }
    },
    audio: false
  });

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Camera frame timeout')), 3500);
      video.onloadedmetadata = () => {
        video.play().then(() => {
          setTimeout(() => {
            clearTimeout(timeout);
            resolve();
          }, 220);
        }).catch(err => {
          clearTimeout(timeout);
          reject(err);
        });
      };
    });

    const width = video.videoWidth || 320;
    const height = video.videoHeight || 240;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(video, 0, 0, width, height);
    return { canvas, ctx };
  } finally {
    stream.getTracks().forEach(track => {
      try { track.stop(); } catch {}
    });
  }
}

export async function enrollOwnerFace(): Promise<{
  success: boolean;
  descriptor?: number[];
  profile?: OwnerFaceProfile;
  usedNativeDetector?: boolean;
  message: string;
}> {
  try {
    const { canvas } = await captureFrontCameraFrame();
    const res = await extractFaceProfileFromSource(canvas, 'Camera Pose', 'camera');
    if (!res.success || !res.profile) {
      return { success: false, message: res.message };
    }
    localStorage.setItem(SECURITY_ATTEMPTS_KEY, '0');
    return {
      success: true,
      descriptor: res.profile.descriptor,
      profile: res.profile,
      usedNativeDetector: res.detection?.engine !== 'local',
      message: res.message
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Camera access failed during face enrollment.'
    };
  }
}

export type FaceCheckOutcome = {
  status: 'owner_verified' | 'unrecognized' | 'no_face' | 'error';
  similarity: number;
  failedAttempts: number;
  lockedTriggered: boolean;
  detail: string;
};

/**
 * Runs a silent front-camera security check against all enrolled face profiles.
 * Locks the device with Master PIN after `maxAttempts` consecutive unrecognized face sightings.
 */
export async function runSilentFaceSecurityCheck(
  ownerDescriptor: number[] | undefined,
  maxAttempts = 3,
  ownerProfiles?: OwnerFaceProfile[]
): Promise<FaceCheckOutcome> {
  const hasProfiles = Array.isArray(ownerProfiles) && ownerProfiles.length > 0;
  const hasLegacy = Array.isArray(ownerDescriptor) && ownerDescriptor.length >= 64;

  if (!hasProfiles && !hasLegacy) {
    return {
      status: 'error',
      similarity: 0,
      failedAttempts: getFailedSecurityAttempts(),
      lockedTriggered: false,
      detail: 'Owner face is not enrolled yet.'
    };
  }

  try {
    const { canvas } = await captureFrontCameraFrame();
    const res = await verifyLiveFrameAgainstProfiles(canvas, ownerProfiles, ownerDescriptor);

    if (res.status === 'no_face') {
      return {
        status: 'no_face',
        similarity: 0,
        failedAttempts: getFailedSecurityAttempts(),
        lockedTriggered: false,
        detail: 'No active face in front camera view.'
      };
    }

    if (res.status === 'owner_verified') {
      return {
        status: 'owner_verified',
        similarity: res.similarity,
        failedAttempts: 0,
        lockedTriggered: false,
        detail: res.detail
      };
    }

    const nextFailures = getFailedSecurityAttempts() + 1;
    localStorage.setItem(SECURITY_ATTEMPTS_KEY, String(nextFailures));
    const shouldLock = nextFailures >= maxAttempts;

    if (shouldLock) {
      setSecurityLocked(
        true,
        `Anti-Theft Triggered: ${nextFailures} unrecognized face attempts detected (${Math.round(res.similarity * 100)}% match).`
      );
    }

    return {
      status: 'unrecognized',
      similarity: res.similarity,
      failedAttempts: nextFailures,
      lockedTriggered: shouldLock,
      detail: `Unrecognized face (${Math.round(res.similarity * 100)}% match) • Attempt ${nextFailures}/${maxAttempts}`
    };
  } catch (err: any) {
    return {
      status: 'error',
      similarity: 0,
      failedAttempts: getFailedSecurityAttempts(),
      lockedTriggered: false,
      detail: err?.message || 'Camera check skipped.'
    };
  }
}
