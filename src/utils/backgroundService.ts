import { AppSettings, CustomAudioTrigger } from '../types';
import { extractAcousticFrameFeatures, matchAcousticFrame } from './audioTriggers';

/**
 * Zuzu AI Background Foreground Service, Always-On Wake Word & Custom Audio Triggers
 * - Bridges to Android ZuzuForegroundService (Silent NotificationChannel + WakeLock + boot persistence)
 * - Uses silent Web Audio Voice Activity Detection (VAD) + Acoustic Trigger Matching (mouth whistle / finger snap)
 *   before waking SpeechRecognition so Android's recognizer does NOT play a continuous "tun-tun-tun" chime loop.
 * - On Native Android APK, also bridges to lightweight AudioRecord monitor when custom triggers are active.
 */

let foregroundActive = false;
let activeNativeWakeWord = '';
let wakeLockSentinel: any = null;
let keepAliveAudioCtx: AudioContext | null = null;
let keepAliveOsc: OscillatorNode | null = null;

let wakeRecognition: any = null;
let wakeListenerShouldRun = false;
let customTriggersActive = false;
let activeCustomTriggers: CustomAudioTrigger[] = [];
let micBusyInActiveSession = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityHooked = false;

// Silent VAD & Acoustic Trigger Gate state
let vadAudioCtx: AudioContext | null = null;
let vadStream: MediaStream | null = null;
let vadCheckTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveNoSpeechCount = 0;
let lastAcousticTriggerAt = 0;
const whistleStreakMap = new Map<string, number>();

// Native Android AudioRecord trigger listener handle
let nativeTriggerHandle: { remove: () => Promise<void> | void } | null = null;
let nativeMonitorRunning = false;

let currentWakeConfig: { phrase: string; lang: string } = {
  phrase: 'wake up zuzu',
  lang: 'en-US'
};

function isNativeAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

function getZuzuNativePlugin(): any | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.() && cap?.Plugins?.ZuzuNative) {
    return cap.Plugins.ZuzuNative;
  }
  return null;
}

function shouldRunAnyBackgroundMic(): boolean {
  return wakeListenerShouldRun || (customTriggersActive && activeCustomTriggers.length > 0);
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
      if (shouldRunAnyBackgroundMic() && !micBusyInActiveSession && !wakeRecognition && !vadCheckTimer) {
        scheduleWakeMonitor(500);
      }
    }
  });
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

function stopNativeTriggerMonitor(): void {
  const nativePlugin = getZuzuNativePlugin();
  if (nativeTriggerHandle) {
    try {
      nativeTriggerHandle.remove();
    } catch {}
    nativeTriggerHandle = null;
  }
  if (nativeMonitorRunning && nativePlugin?.stopAudioTriggerMonitor) {
    nativePlugin.stopAudioTriggerMonitor().catch(() => {});
  }
  nativeMonitorRunning = false;
}

async function startNativeTriggerMonitor(): Promise<boolean> {
  const nativePlugin = getZuzuNativePlugin();
  if (!nativePlugin?.startAudioTriggerMonitor || !customTriggersActive || activeCustomTriggers.length === 0) {
    return false;
  }

  const cachedMic = localStorage.getItem('zuzu_mic_permission_status');
  if (cachedMic !== 'granted') return false;

  try {
    if (!nativeTriggerHandle && nativePlugin.addListener) {
      nativeTriggerHandle = await nativePlugin.addListener('nativeAudioTriggerDetected', (data: any) => {
        if (micBusyInActiveSession || !shouldRunAnyBackgroundMic()) return;
        const now = Date.now();
        if (now - lastAcousticTriggerAt < 2500) return;
        lastAcousticTriggerAt = now;
        nativeMonitorRunning = false;
        stopSilentVadGate();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([20, 30, 20]);
        }
        window.dispatchEvent(
          new CustomEvent('zuzu-wake-word-triggered', {
            detail: {
              triggerType: data?.kind || 'custom',
              triggerLabel: data?.label || 'Custom Sound',
              transcript: data?.label || 'Custom Sound Trigger',
              remainingCommand: '',
              triggeredAt: now
            }
          })
        );
      });
    }

    await nativePlugin.startAudioTriggerMonitor({
      triggers: activeCustomTriggers.map(t => ({
        id: t.id,
        label: t.label,
        kind: t.kind,
        peakHz: t.peakHz,
        crestFactor: t.crestFactor,
        rmsThreshold: t.rmsThreshold,
        sensitivity: t.sensitivity
      }))
    });
    nativeMonitorRunning = true;
    return true;
  } catch {
    return false;
  }
}

function stopSilentVadGate(): void {
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
  whistleStreakMap.clear();
}

/**
 * Pause always-on wake-word & custom audio trigger mic while active voice/recording session is busy,
 * then auto-resume seamlessly when the active session ends.
 */
export function setMicBusyForActiveSession(busy: boolean): void {
  micBusyInActiveSession = busy;
  if (busy) {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    stopSilentVadGate();
    stopNativeTriggerMonitor();
    if (wakeRecognition) {
      try {
        wakeRecognition.abort();
      } catch {}
      wakeRecognition = null;
    }
  } else if (shouldRunAnyBackgroundMic()) {
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
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = clean.match(new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)(.*)$`, 'i'));
    if (match) {
      return { matched: true, remainingCommand: (match[1] || '').trim() };
    }
  }
  return { matched: false, remainingCommand: '' };
}

function scheduleWakeMonitor(delayMs = 1200): void {
  if (!shouldRunAnyBackgroundMic() || micBusyInActiveSession) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (shouldRunAnyBackgroundMic() && !micBusyInActiveSession) {
      startSilentVadOrRecognition();
    }
  }, delayMs);
}

/**
 * Monitors ambient microphone quietly via Web Audio AnalyserNode (or native AudioRecord on APK)
 * matching both custom audio triggers (whistle / snap) AND vocal onset before opening OS SpeechRecognizer.
 */
async function startSilentVadOrRecognition(): Promise<void> {
  if (typeof window === 'undefined' || !shouldRunAnyBackgroundMic() || micBusyInActiveSession || wakeRecognition) {
    return;
  }

  const cachedMic = localStorage.getItem('zuzu_mic_permission_status');
  if (cachedMic !== 'granted') return;

  // On native Android APK, if custom triggers are active and wake-word speech isn't exclusively needed (or alongside),
  // prefer native AudioRecord monitor when WebView getUserMedia shouldn't conflict with hardware AudioRecord.
  const hasTriggers = customTriggersActive && activeCustomTriggers.length > 0;
  if (isNativeAndroid() && hasTriggers && !wakeListenerShouldRun) {
    await startNativeTriggerMonitor();
    return;
  }

  // Use Web Audio AnalyserNode for unified acoustic trigger matching (whistle/snap) + silent speech VAD gate
  if (navigator.mediaDevices?.getUserMedia && !vadCheckTimer) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: hasTriggers
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            },
        video: false
      });

      if (!shouldRunAnyBackgroundMic() || micBusyInActiveSession) {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        return;
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.2;
        source.connect(analyser);

        vadStream = stream;
        vadAudioCtx = ctx;
        const timeData = new Uint8Array(analyser.fftSize);
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        let speechHits = 0;

        vadCheckTimer = setInterval(() => {
          if (!shouldRunAnyBackgroundMic() || micBusyInActiveSession) {
            stopSilentVadGate();
            return;
          }

          analyser.getByteTimeDomainData(timeData);
          analyser.getByteFrequencyData(freqData);
          const features = extractAcousticFrameFeatures(timeData, freqData, ctx.sampleRate);

          // 1. Check Custom Audio Triggers (Mouth Whistle / Finger Snap / Custom Sound)
          if (customTriggersActive && activeCustomTriggers.length > 0) {
            const now = Date.now();
            if (now - lastAcousticTriggerAt > 2800) {
              const hit = matchAcousticFrame(features, activeCustomTriggers, whistleStreakMap);
              if (hit) {
                lastAcousticTriggerAt = now;
                stopSilentVadGate();
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                  navigator.vibrate([20, 30, 20]);
                }
                window.dispatchEvent(
                  new CustomEvent('zuzu-wake-word-triggered', {
                    detail: {
                      triggerType: hit.trigger.kind,
                      triggerLabel: hit.trigger.label,
                      transcript: hit.trigger.label,
                      remainingCommand: '',
                      triggeredAt: now
                    }
                  })
                );
                return;
              }
            }
          }

          // 2. Check Human Vocal Onset for Wake Word ("Wake up Zuzu") with ambient chatter rejection
          if (wakeListenerShouldRun) {
            if (features.rms > 0.072 && features.tonalityRatio < 4.2) {
              speechHits++;
              if (speechHits >= 3) {
                stopSilentVadGate();
                bootWakeRecognitionCycle();
              }
            } else {
              speechHits = Math.max(0, speechHits - 1);
            }
          }
        }, 120);
        return;
      } else {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      }
    } catch {
      stopSilentVadGate();
    }
  }

  // Native fallback when custom triggers are active and WebView mic was unavailable
  if (isNativeAndroid() && hasTriggers) {
    await startNativeTriggerMonitor();
    return;
  }

  // Browser fallback when Web Audio API unavailable
  if (!isNativeAndroid() && wakeListenerShouldRun) {
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
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([20, 30, 20]);
          }
          window.dispatchEvent(
            new CustomEvent('zuzu-wake-word-triggered', {
              detail: {
                triggerType: 'voice',
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
      const backoffMs = Math.min(15000, 3000 + consecutiveNoSpeechCount * 2000);
      scheduleWakeMonitor(backoffMs);
    };

    recognition.onend = () => {
      wakeRecognition = null;
      const delayMs = isNativeAndroid() ? 2200 : 1500;
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

  customTriggersActive = settings.customTriggersEnabled !== false;
  activeCustomTriggers = Array.isArray(settings.customAudioTriggers) ? settings.customAudioTriggers : [];

  if (settings.foregroundServiceEnabled) {
    await startZuzuForegroundService(currentWakeConfig.phrase);
  } else {
    await stopZuzuForegroundService();
  }

  wakeListenerShouldRun = Boolean(settings.wakeWordEnabled);

  if (shouldRunAnyBackgroundMic()) {
    if (nativeMonitorRunning) {
      await startNativeTriggerMonitor();
    } else if (!micBusyInActiveSession && !wakeRecognition && !vadCheckTimer) {
      startSilentVadOrRecognition();
    }
  } else {
    stopSilentVadGate();
    stopNativeTriggerMonitor();
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
  customTriggersActive = false;
  stopSilentVadGate();
  stopNativeTriggerMonitor();
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
