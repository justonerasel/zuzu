import { AppSettings } from '../types';
import { playHapticSound } from './audio';

/**
 * Zuzu AI Background Foreground Service & Always-On Wake Word Engine
 * - Bridges to Android ZuzuForegroundService (WakeLock + persistent notification + boot persistence)
 * - Uses browser WakeLock & silent AudioContext keep-alive on web/WebView
 * - Runs continuous wake-word speech recognition ("Wake up Zuzu") when mic isn't busy in active turn
 */

let foregroundActive = false;
let wakeLockSentinel: any = null;
let keepAliveAudioCtx: AudioContext | null = null;
let keepAliveOsc: OscillatorNode | null = null;

let wakeRecognition: any = null;
let wakeListenerShouldRun = false;
let micBusyInActiveSession = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityHooked = false;
let currentWakeConfig: { phrase: string; lang: string } = {
  phrase: 'wake up zuzu',
  lang: 'en-US'
};

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
      if (wakeListenerShouldRun && !micBusyInActiveSession && !wakeRecognition) {
        scheduleWakeRestart(400);
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
  foregroundActive = true;
  const nativePlugin = getZuzuNativePlugin();

  if (nativePlugin?.startForegroundService) {
    try {
      await nativePlugin.startForegroundService({ wakeWord: wakeWordPhrase });
      return { success: true, native: true };
    } catch (err) {
      console.warn('[ForegroundService] Native start notice:', err);
    }
  }

  // Web/WebView WakeLock + ultra-silent keep-alive oscillator (zero audible output)
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).wakeLock?.request) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen').catch(() => null);
    }
  } catch {}

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx && !keepAliveAudioCtx) {
      keepAliveAudioCtx = new AudioCtx();
      const osc = keepAliveAudioCtx.createOscillator();
      const gain = keepAliveAudioCtx.createGain();
      gain.gain.value = 0.00001; // inaudible keep-alive signal
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
    if (wakeRecognition) {
      try {
        wakeRecognition.abort();
      } catch {}
      wakeRecognition = null;
    }
  } else if (wakeListenerShouldRun) {
    scheduleWakeRestart(600);
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

function scheduleWakeRestart(delayMs = 900): void {
  if (!wakeListenerShouldRun || micBusyInActiveSession) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (wakeListenerShouldRun && !micBusyInActiveSession) {
      bootWakeRecognitionCycle();
    }
  }, delayMs);
}

function bootWakeRecognitionCycle(): void {
  if (typeof window === 'undefined' || !wakeListenerShouldRun || micBusyInActiveSession) return;

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognitionClass) return;

  // Only start silently if mic permission is already granted so we don't spam OS dialogs
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
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = currentWakeConfig.lang === 'bn-BD' ? 'bn-BD' : 'en-US';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i]?.[0]?.transcript || '';
        if (!text) continue;
        const hit = matchesWakePhrase(text, currentWakeConfig.phrase);
        if (hit.matched) {
          // Avoid re-triggering on same result before handoff
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
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        // Stop retrying if user explicitly revoked microphone access
        return;
      }
      scheduleWakeRestart(1400);
    };

    recognition.onend = () => {
      wakeRecognition = null;
      scheduleWakeRestart(800);
    };

    recognition.start();
  } catch {
    scheduleWakeRestart(2000);
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
    if (!micBusyInActiveSession && !wakeRecognition) {
      bootWakeRecognitionCycle();
    }
  } else {
    wakeListenerShouldRun = false;
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
