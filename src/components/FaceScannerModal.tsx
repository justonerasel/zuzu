import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  X,
  ScanFace,
  Loader2,
  Lock
} from 'lucide-react';
import { OwnerFaceProfile } from '../types';
import {
  MAX_OWNER_FACE_PROFILES,
  detectFaceInCanvas,
  extractFaceProfileFromSource,
  setSecurityLocked,
  verifyLiveFrameAgainstProfiles
} from '../utils/faceGuard';
import { playHapticSound } from '../utils/audio';

interface FaceScannerModalProps {
  isOpen: boolean;
  mode: 'enroll' | 'verify';
  existingProfiles: OwnerFaceProfile[];
  legacyDescriptor?: number[];
  lockOnStranger?: boolean;
  onClose: () => void;
  onEnrolledProfile?: (profile: OwnerFaceProfile) => void;
  onVerifiedSuccess?: (detail: string) => void;
  onUnrecognizedLocked?: (detail: string) => void;
}

export const FaceScannerModal: React.FC<FaceScannerModalProps> = ({
  isOpen,
  mode,
  existingProfiles,
  legacyDescriptor,
  lockOnStranger = true,
  onClose,
  onEnrolledProfile,
  onVerifiedSuccess,
  onUnrecognizedLocked
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isBusyRef = useRef(false);
  const strangerStreakRef = useRef(0);
  const completedRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanState, setScanState] = useState<'scanning' | 'verified' | 'unrecognized' | 'no_face'>('scanning');
  const [similarityPct, setSimilarityPct] = useState<number>(0);
  const [engineLabel, setEngineLabel] = useState<string>('MediaPipe');
  const [statusMessage, setStatusMessage] = useState<string>(
    mode === 'enroll'
      ? 'Align your face in the frame and tap Capture Pose'
      : 'Scanning front camera in real-time...'
  );
  const [capturing, setCapturing] = useState(false);
  const [posesCapturedNow, setPosesCapturedNow] = useState(0);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    completedRef.current = false;
    strangerStreakRef.current = 0;
    setCameraReady(false);
    setCameraError(null);
    setScanState('scanning');
    setSimilarityPct(0);
    setPosesCapturedNow(0);
    setStatusMessage(
      mode === 'enroll'
        ? 'Center your face inside the ring, then tap Capture Pose'
        : 'Look at the front camera — verifying your identity...'
    );

    let cancelled = false;

    const startFrontCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Front camera API is not available on this device.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 480 },
            height: { ideal: 480 }
          },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setCameraReady(true);
        }
      } catch (err: any) {
        setCameraError(
          err?.message || 'Camera permission denied. Allow camera access in Permissions Center.'
        );
      }
    };

    startFrontCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, mode]);

  // Continuous live frame analysis loop
  useEffect(() => {
    if (!isOpen || !cameraReady || cameraError) return;

    const timer = setInterval(async () => {
      if (isBusyRef.current || completedRef.current) return;
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      if (!video || video.readyState < 2 || !canvas) return;

      isBusyRef.current = true;
      try {
        const vw = video.videoWidth || 320;
        const vh = video.videoHeight || 240;
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (mode === 'verify') {
          const res = await verifyLiveFrameAgainstProfiles(video, existingProfiles, legacyDescriptor);
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (res.detection?.engine) {
            setEngineLabel(res.detection.engine === 'mediapipe' ? 'MediaPipe 478' : 'Local Biometric');
          }

          if (res.detection?.box && res.canvasWidth && res.canvasHeight) {
            const scaleX = canvas.width / res.canvasWidth;
            const scaleY = canvas.height / res.canvasHeight;
            const bx = res.detection.box.x * scaleX;
            const by = res.detection.box.y * scaleY;
            const bw = res.detection.box.w * scaleX;
            const bh = res.detection.box.h * scaleY;

            ctx.strokeStyle =
              res.status === 'owner_verified'
                ? '#10b981'
                : res.status === 'unrecognized'
                ? '#f43f5e'
                : '#a855f7';
            ctx.lineWidth = 3;
            ctx.strokeRect(bx, by, bw, bh);

            // Draw key facial mesh dots cleanly when MediaPipe landmarks exist
            if (res.detection.landmarks?.length) {
              ctx.fillStyle = res.status === 'owner_verified' ? '#34d399' : '#fb7185';
              for (let i = 0; i < res.detection.landmarks.length; i += 8) {
                const pt = res.detection.landmarks[i];
                ctx.beginPath();
                ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 1.8, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }

          if (res.status === 'no_face') {
            setScanState('no_face');
            setSimilarityPct(0);
            setStatusMessage('Look directly at the front camera...');
          } else if (res.status === 'owner_verified') {
            strangerStreakRef.current = 0;
            completedRef.current = true;
            setScanState('verified');
            setSimilarityPct(Math.round(res.similarity * 100));
            setStatusMessage(res.detail);
            playHapticSound('listen_start');
            setTimeout(() => {
              stopCamera();
              onVerifiedSuccess?.(res.detail);
            }, 650);
          } else if (res.status === 'unrecognized') {
            strangerStreakRef.current += 1;
            const pct = Math.round(res.similarity * 100);
            setScanState('unrecognized');
            setSimilarityPct(pct);

            if (lockOnStranger && strangerStreakRef.current >= 2) {
              completedRef.current = true;
              const reason = `Anti-Theft Live Lock: Unrecognized face detected (${pct}% match).`;
              setStatusMessage('Unauthorized user detected — locking device!');
              playHapticSound('listen_stop');
              setSecurityLocked(true, reason);
              setTimeout(() => {
                stopCamera();
                onUnrecognizedLocked?.(reason);
              }, 550);
            } else {
              setStatusMessage(`Unrecognized face (${pct}%) — verifying frame ${strangerStreakRef.current}/2...`);
            }
          }
        } else {
          // Enroll mode: draw live face alignment box while user prepares to capture
          const workCanvas = document.createElement('canvas');
          workCanvas.width = vw;
          workCanvas.height = vh;
          const wctx = workCanvas.getContext('2d');
          if (wctx) {
            wctx.drawImage(video, 0, 0, vw, vh);
            const detection = await detectFaceInCanvas(workCanvas);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (detection) {
              setEngineLabel(detection.engine === 'mediapipe' ? 'MediaPipe 478' : 'Local Biometric');
              ctx.strokeStyle = '#34d399';
              ctx.lineWidth = 3;
              ctx.strokeRect(detection.box.x, detection.box.y, detection.box.w, detection.box.h);
              if (detection.landmarks?.length) {
                ctx.fillStyle = '#34d399';
                for (let i = 0; i < detection.landmarks.length; i += 10) {
                  const pt = detection.landmarks[i];
                  ctx.beginPath();
                  ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 1.6, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
              setScanState('scanning');
              setStatusMessage('Face aligned — tap Capture Pose to save!');
            } else {
              setScanState('no_face');
              setStatusMessage('Center your face inside the circle in good light');
            }
          }
        }
      } finally {
        isBusyRef.current = false;
      }
    }, 480);

    return () => clearInterval(timer);
  }, [isOpen, cameraReady, cameraError, mode, existingProfiles, legacyDescriptor, lockOnStranger]);

  if (!isOpen) return null;

  const handleCapturePose = async () => {
    if (!videoRef.current || capturing) return;
    if (existingProfiles.length >= MAX_OWNER_FACE_PROFILES) {
      setStatusMessage(`Maximum ${MAX_OWNER_FACE_PROFILES} poses reached. Delete one to add more.`);
      return;
    }

    setCapturing(true);
    playHapticSound('message_sent');
    try {
      const slotNum = existingProfiles.length + 1;
      const res = await extractFaceProfileFromSource(videoRef.current, `Camera Pose ${slotNum}`, 'camera');
      if (res.success && res.profile) {
        setPosesCapturedNow((c) => c + 1);
        setStatusMessage(`Pose ${slotNum} captured ✓ (${existingProfiles.length + 1}/${MAX_OWNER_FACE_PROFILES})`);
        playHapticSound('listen_start');
        onEnrolledProfile?.(res.profile);
      } else {
        setStatusMessage(res.message);
        playHapticSound('listen_stop');
      }
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-purple-400/30 p-5 text-white shadow-2xl space-y-3.5 relative">
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300"
          title="Close Camera"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 pr-8">
          <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-300">
            <ScanFace className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold tracking-tight">
              {mode === 'enroll' ? 'Enroll Owner Face (Live)' : 'Live Face Verification'}
            </h3>
            <p className="text-[10px] text-slate-400">
              {engineLabel} • {mode === 'enroll' ? `${existingProfiles.length}/${MAX_OWNER_FACE_PROFILES} poses saved` : 'Anti-Theft Real-Time Guard'}
            </p>
          </div>
        </div>

        {/* Live Mirrored Front Camera Feed */}
        <div className="relative w-full aspect-square max-h-64 mx-auto rounded-2xl overflow-hidden bg-slate-950 border border-slate-700">
          {cameraError ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-rose-300 text-xs space-y-2">
              <ShieldAlert className="w-8 h-8 text-rose-400" />
              <p>{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ transform: 'scaleX(-1)' }}
              />

              {/* Circular Scan Frame Overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`w-44 h-44 rounded-full border-2 transition-colors duration-300 ${
                    scanState === 'verified'
                      ? 'border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.5)]'
                      : scanState === 'unrecognized'
                      ? 'border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.5)]'
                      : 'border-purple-400/70'
                  }`}
                />
              </div>

              {!cameraReady && (
                <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center gap-2 text-xs text-slate-300">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <span>Starting front camera...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Live Match Status */}
        <div
          className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 ${
            scanState === 'verified'
              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
              : scanState === 'unrecognized'
              ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
              : 'bg-slate-800/80 border-slate-700 text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {scanState === 'verified' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : scanState === 'unrecognized' ? (
              <Lock className="w-4 h-4 text-rose-400 flex-shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-purple-400 flex-shrink-0" />
            )}
            <span className="truncate">{statusMessage}</span>
          </div>
          {mode === 'verify' && similarityPct > 0 && (
            <span className="font-mono font-bold text-[11px] flex-shrink-0">{similarityPct}%</span>
          )}
        </div>

        {/* Actions */}
        {mode === 'enroll' ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!cameraReady || capturing || existingProfiles.length >= MAX_OWNER_FACE_PROFILES}
              onClick={handleCapturePose}
              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span>{capturing ? 'Saving...' : 'Capture Pose'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
            >
              {posesCapturedNow > 0 ? 'Done' : 'Cancel'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
          >
            Close Scanner
          </button>
        )}
      </div>
    </div>
  );
};
