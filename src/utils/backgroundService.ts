import { AppSettings } from '../types';
import { playHapticSound } from './audio';

/**
 * Zuzu AI Background Foreground Service & Always-On Wake Word Engine
 * - Bridges to Android ZuzuForegroundService (Silent NotificationChannel + WakeLock + boot persistence)
 * - Uses silent Web Audio Voice Activity Detection (VAD) gating before waking SpeechRecognition
 *   so Android's recognizer does NOT play a continuous "tun-tun-tun" chime loop during silence.
 */

let foregroundActive = false;
let activeNativeWakeWord = '';
let wakeLockSentinel: any = null;
let keepAliveAudioCtx: AudioContext | null = null;
let keepAliveOsc: OscillatorNode | null = null;

let wakeRecognition: any = null;
let wakeListenerShouldRun = false;
let micBusyInActiveSession = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityHooked = false;

// Silent VAD gate state (prevents SpeechRecognition start/stop "tun-tun-tun" chime loops)
let vadAudioCtx: AudioContext | null = null;
let vadStream: MediaStream | null = null;
let vadRafId: number | null = null;
let vadCheckTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveNoSpeechCount = 0;

let currentWakeConfig: { phrase: string; lang: string } = {
  phrase: 'wake up zuzu',
  lang: 'en-US'
};

function isNativeAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

function ensureVisibilityHook(): void {
  if (visibilityHooked || typeof document === 'undefined') return;
  visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (foregroundActive) {
        if (!wakeLockSentinel && typeof navigator !== 'undefined' && (navigator as any).wakeLock?.request) {
          (navigator as any).wakeLock.request('screen')
            .then((s: any) => { wakeLockSentinel = s; })
            .catch(() => {});
        }
        if (keepAliveAudioCtx && keepAliveAudioCtx.state === 'suspended') {
          keepAliveAudioCtx.resume().catch(() => {});
        }
      }
      if (wakeListenerShouldRun && !micBusyInActiveSession && !wakeRecognition && !vadCheckTimer) {
        scheduleWakeMonitor(500);
      }
    }
  });
}

function getZuzuNativePlugin(): any | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.() && cap?.Plugins?.ZuzuNative) {
    return cap.Plugins.ZuzuNative;
  }
  return null;
}

export function isForegroundServiceActive(): boolean {
  return foregroundActive;
}

export async function startZuzuForegroundService(wakeWordPhrase = 'Wake up Zuzu'): Promise<{
  success: boolean;
  native: boolean;
}> {
  const cleanPhrase = wakeWordPhrase.trim() || 'Wake up Zuzu';
  const alreadySyncedSame = foregroundActive && activeNativeWakeWord === cleanPhrase;

  foregroundActive = true;
  activeNativeWakeWord = cleanPhrase;
  const nativePlugin = getZuzuNativePlugin();

  if (nativePlugin?.startForegroundService) {
    if (alreadySyncedSame) {
      return { success: true, native: true };
    }
    try {
      await nativePlugin.startForegroundService({ wakeWord: cleanPhrase });
      return { success: true, native: true };
    } catch (err) {
      console.warn('[ForegroundService] Native start notice:', err);
    }
  }

  // Web/WebView WakeLock (strictly zero audible output)
  try {
    if (!wakeLockSentinel && typeof navigator !== 'undefined' && (navigator as any).wakeLock?.request) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen').catch(() => null);
    }
  } catch {}

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx && !keepAliveAudioCtx) {
      keepAliveAudioCtx = new AudioCtx();
      const osc = keepAliveAudioCtx.createOscillator();
      const gain = keepAliveAudioCtx.createGain();
      gain.gain.value = 0; // Zero gain: 100% silent keep-alive
      osc.connect(gain);
      gain.connect(keepAliveAudioCtx.destination);
      osc.start();
      keepAliveOsc = osc;
    }
  } catch {}

  return { success: true, native: false };
}

export async function stopZuzuForegroundService(): Promise<void> {
  foregroundActive = false;
  activeNativeWakeWord = '';
  const nativePlugin = getZuzuNativePlugin();

  if (nativePlugin?.stopForegroundService) {
    try {
      await nativePlugin.stopForegroundService();
    } catch {}
  }

  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch {}

  try {
    if (keepAliveOsc) {
      keepAliveOsc.stop();
      keepAliveOsc.disconnect();
      keepAliveOsc = null;
    }
    if (keepAliveAudioCtx) {
      await keepAliveAudioCtx.close();
      keepAliveAudioCtx = null;
    }
  } catch {}
}

function stopSilentVadGate(): void {
  if (vadRafId !== null) {
    cancelAnimationFrame(vadRafId);
    vadRafId = null;
  }
  if (vadCheckTimer) {
    clearInterval(vadCheckTimer);
    vadCheckTimer = null;
  }
  if (vadStream) {
    vadStream.getTracks().forEach((track) => {
      try { track.stop(); } catch {}
    });
    vadStream = null;
  }
  if (vadAudioCtx) {
    try { vadAudioCtx.close(); } catch {}
    vadAudioCtx = null;
  }
}

/**
 * Pause always-on wake-word mic while Dashboard/Voice active turn is recording,
 * then auto-resume seamlessly when the active session stops.
 */
export function setMicBusyForActiveSession(busy: boolean): void {
  micBusyInActiveSession = busy;
  if (busy) {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    stopSilentVadGate();
    if (wakeRecognition) {
      try {
        wakeRecognition.abort();
      } catch {}
      wakeRecognition = null;
    }
  } else if (wakeListenerShouldRun) {
    scheduleWakeMonitor(700);
  }
}

function matchesWakePhrase(transcript: string, customPhrase: string): { matched: boolean; remainingCommand: string } {
  const clean = transcript.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedCustom = customPhrase.toLowerCase().trim();

  const candidates = [
    normalizedCustom,
    'wake up zuzu',
    'hey zuzu',
    'ok zuzu',
    'hello zuzu',
    'zuzu wake up',
    'ওঠো জুজু',
    'হ্যালো জুজু',
    'এই জুজু'
  ].filter(Boolean);

  for (const phrase of candidates) {
    const idx = clean.indexOf(phrase);
    if (idx !== -1) {
      const remaining = clean.slice(idx + phrase.length).trim();
      return { matched: true, remainingCommand: remaining };
    }
  }
  return { matched: false, remainingCommand: '' };
}

function scheduleWakeMonitor(delayMs = 1200): void {
  if (!wakeListenerShouldRun || micBusyInActiveSession) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (wakeListenerShouldRun && !micBusyInActiveSession) {
      startSilentVadOrRecognition();
    }
  }, delayMs);
}

/**
 * Monitors ambient speech quietly via Web Audio AnalyserNode without invoking OS SpeechRecognizer
 * until human voice energy is actually detected—preventing continuous Android "tun-tun-tun" chimes.
 */
async function startSilentVadOrRecognition(): Promise<void> {
  if (typeof window === 'undefined' || !wakeListenerShouldRun || micBusyInActiveSession || wakeRecognition) {
    return;
  }

  const cachedMic = localStorage.getItem('zuzu_mic_permission_status');
  if (cachedMic !== 'granted') return;

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognitionClass) return;

  // Use silent VAD gate on native Android or when Web Audio + getUserMedia are available
  if (navigator.mediaDevices?.getUserMedia && !vadCheckTimer) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      if (!wakeListenerShouldRun || micBusyInActiveSession) {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        return;
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        vadStream = stream;
        vadAudioCtx = ctx;
        const data = new Uint8Array(analyser.frequencyBinCount);
        let speechHits = 0;

        vadCheckTimer = setInterval(() => {
          if (!wakeListenerShouldRun || micBusyInActiveSession) {
            stopSilentVadGate();
            return;
          }
          analyser.getByteTimeDomainData(data);
          let sumSq = 0;
          for (let i = 0; i < data.length; i++) {
            const norm = (data[i] - 128) / 128;
            sumSq += norm * norm;
          }
          const rms = Math.sqrt(sumSq / data.length);
          if (rms > 0.032) {
            speechHits++;
            if (speechHits >= 2) {
              // Speech activity detected: release VAD stream briefly and verify wake phrase
              stopSilentVadGate();
              bootWakeRecognitionCycle();
            }
          } else {
            speechHits = Math.max(0, speechHits - 1);
          }
        }, 160);
        return;
      } else {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      }
    } catch {
      stopSilentVadGate();
    }
  }

  // Fallback for environments without AudioContext VAD (never tight-loop on Android)
  if (!isNativeAndroid()) {
    bootWakeRecognitionCycle();
  }
}

function bootWakeRecognitionCycle(): void {
  if (typeof window === 'undefined' || !wakeListenerShouldRun || micBusyInActiveSession) return;

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognitionClass) return;

  const cachedMic = localStorage.getItem('zuzu_mic_permission_status');
  if (cachedMic !== 'granted') return;

  try {
    if (wakeRecognition) {
      try {
        wakeRecognition.abort();
      } catch {}
    }

    const recognition = new SpeechRecognitionClass();
    wakeRecognition = recognition;
    recognition.continuous = !isNativeAndroid();
    recognition.interimResults = true;
    recognition.lang = currentWakeConfig.lang === 'bn-BD' ? 'bn-BD' : 'en-US';

    recognition.onresult = (event: any) => {
      consecutiveNoSpeechCount = 0;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i]?.[0]?.transcript || '';
        if (!text) continue;
        const hit = matchesWakePhrase(text, currentWakeConfig.phrase);
        if (hit.matched) {
          try {
            recognition.abort();
          } catch {}
          wakeRecognition = null;
          playHapticSound('switch');
          window.dispatchEvent(
            new CustomEvent('zuzu-wake-word-triggered', {
              detail: {
                transcript: text.trim(),
                remainingCommand: hit.remainingCommand,
                triggeredAt: Date.now()
              }
            })
          );
          break;
        }
      }
    };

    recognition.onerror = (event: any) => {
      const err = event?.error || '';
      wakeRecognition = null;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        return;
      }
      consecutiveNoSpeechCount++;
      const backoffMs = Math.min(8000, 1500 + consecutiveNoSpeechCount * 1000);
      scheduleWakeMonitor(backoffMs);
    };

    recognition.onend = () => {
      wakeRecognition = null;
      const delayMs = isNativeAndroid() ? 900 : 1200;
      scheduleWakeMonitor(delayMs);
    };

    recognition.start();
  } catch {
    scheduleWakeMonitor(2500);
  }
}

export async function syncBackgroundServicesWithSettings(settings: AppSettings): Promise<void> {
  ensureVisibilityHook();
  currentWakeConfig = {
    phrase: settings.wakeWordPhrase || 'wake up zuzu',
    lang: settings.recognitionLanguage || 'en-US'
  };

  if (settings.foregroundServiceEnabled) {
    await startZuzuForegroundService(currentWakeConfig.phrase);
  } else {
    await stopZuzuForegroundService();
  }

  if (settings.wakeWordEnabled) {
    wakeListenerShouldRun = true;
    if (!micBusyInActiveSession && !wakeRecognition && !vadCheckTimer) {
      startSilentVadOrRecognition();
    }
  } else {
    wakeListenerShouldRun = false;
    stopSilentVadGate();
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (wakeRecognition) {
      try {
        wakeRecognition.abort();
      } catch {}
      wakeRecognition = null;
    }
  }
}

export function stopAllBackgroundServices(): void {
  wakeListenerShouldRun = false;
  stopSilentVadGate();
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (wakeRecognition) {
    try {
      wakeRecognition.abort();
    } catch {}
    wakeRecognition = null;
  }
  stopZuzuForegroundService();
}
