import { AppSettings, CustomAudioTrigger } from '../types';
import { extractAcousticFrameFeatures, matchAcousticFrame } from './audioTriggers';

/**
 * Zuzu AI Background Foreground Service, Always-On Wake Word & Custom Audio Triggers
 * - Bridges to Android ZuzuForegroundService (Silent NotificationChannel + WakeLock + Android 14+ FGS compliance)
 * - Uses silent Web Audio Voice Activity Detection (VAD) + Acoustic Trigger Matching (mouth whistle / finger snap)
 * - On Native Android APK: supports BOTH native SpeechRecognizer wake matching ("Wake up Zuzu" / "Hey Zuzu")
 *   when vocal onset is detected AND native AudioRecord trigger monitoring.
 */

let foregroundActive = false;
let foregroundRestrictionReason: string | null = null;
let activeNativeWakeWord = '';
let wakeLockSentinel: any = null;
let keepAliveAudioCtx: AudioContext | null = null;
let keepAliveOsc: OscillatorNode | null = null;

let wakeRecognition: any = null;
let nativeWakeActive = false;
let nativeWakeHandles: Array<{ remove: () => Promise<void> | void }> = [];
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
let lastNativeWakeCheckAt = 0;
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

function cleanupNativeWakeListeners(): void {
  nativeWakeHandles.forEach((h) => {
    try { h?.remove?.(); } catch {}
  });
  nativeWakeHandles = [];
  nativeWakeActive = false;
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
      if (shouldRunAnyBackgroundMic() && !micBusyInActiveSession && !wakeRecognition && !nativeWakeActive && !vadCheckTimer) {
        scheduleWakeMonitor(500);
      }
    }
  });
}

export function isForegroundServiceActive(): boolean {
  return foregroundActive;
}

export function getForegroundServiceRestrictionReason(): string | null {
  return foregroundRestrictionReason;
}

export async function startZuzuForegroundService(wakeWordPhrase = 'Wake up Zuzu'): Promise<{
  success: boolean;
  native: boolean;
  reason?: string;
}> {
  const cleanPhrase = wakeWordPhrase.trim() || 'Wake up Zuzu';
  const alreadySyncedSame = foregroundActive && activeNativeWakeWord === cleanPhrase;
  const nativePlugin = getZuzuNativePlugin();

  if (nativePlugin?.startForegroundService) {
    if (alreadySyncedSame) {
      return { success: true, native: true };
    }
    try {
      const res = await nativePlugin.startForegroundService({ wakeWord: cleanPhrase });
      if (res && res.started === false) {
        foregroundActive = false;
        foregroundRestrictionReason = String(res.reason || 'Foreground service blocked by Android OS.');
        return { success: false, native: true, reason: foregroundRestrictionReason };
      }
      foregroundActive = true;
      foregroundRestrictionReason = null;
      activeNativeWakeWord = cleanPhrase;
      return { success: true, native: true };
    } catch (err: any) {
      foregroundActive = false;
      foregroundRestrictionReason = err?.message || 'Grant Microphone permission & disable Battery Optimization for background listening.';
      console.warn('[ForegroundService] Native start notice:', err);
      return { success: false, native: true, reason: foregroundRestrictionReason };
    }
  }

  foregroundActive = true;
  foregroundRestrictionReason = null;
  activeNativeWakeWord = cleanPhrase;

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
  foregroundRestrictionReason = null;
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
    if (nativeWakeActive) {
      cleanupNativeWakeListeners();
      getZuzuNativePlugin()?.cancelNativeSpeech?.().catch(() => {});
    }
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
    'okay zuzu',
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
 * matching both custom audio triggers (whistle / snap) AND vocal onset before opening SpeechRecognizer.
 */
async function startSilentVadOrRecognition(): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !shouldRunAnyBackgroundMic() ||
    micBusyInActiveSession ||
    wakeRecognition ||
    nativeWakeActive
  ) {
    return;
  }

  const cachedMic = localStorage.getItem('zuzu_mic_permission_status');
  if (cachedMic !== 'granted') return;

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

          // 2. Check Human Vocal Onset for Wake Word ("Wake up Zuzu" / "Hey Zuzu")
          if (wakeListenerShouldRun) {
            if (features.rms > 0.068 && features.tonalityRatio < 4.5) {
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

  if (isNativeAndroid() && hasTriggers) {
    await startNativeTriggerMonitor();
    return;
  }

  if (wakeListenerShouldRun) {
    bootWakeRecognitionCycle();
  }
}

async function bootNativeAndroidWakeCycle(): Promise<void> {
  const nativePlugin = getZuzuNativePlugin();
  if (!nativePlugin?.startNativeSpeech || !wakeListenerShouldRun || micBusyInActiveSession || nativeWakeActive) {
    return;
  }

  const now = Date.now();
  if (now - lastNativeWakeCheckAt < 3500) {
    scheduleWakeMonitor(3500 - (now - lastNativeWakeCheckAt));
    return;
  }
  lastNativeWakeCheckAt = now;
  nativeWakeActive = true;

  const fireWakeIfMatched = (text: string): boolean => {
    const hit = matchesWakePhrase(text, currentWakeConfig.phrase);
    if (!hit.matched) return false;
    cleanupNativeWakeListeners();
    nativePlugin.cancelNativeSpeech?.().catch(() => {});
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
    return true;
  };

  try {
    if (nativePlugin.addListener) {
      nativeWakeHandles.push(
        await nativePlugin.addListener('nativeSpeechPartial', (data: any) => {
          if (!nativeWakeActive || micBusyInActiveSession) return;
          const txt = String(data?.text || '');
          if (txt) fireWakeIfMatched(txt);
        })
      );
      nativeWakeHandles.push(
        await nativePlugin.addListener('nativeSpeechResult', (data: any) => {
          if (!nativeWakeActive) return;
          const txt = String(data?.text || '');
          const matched = txt ? fireWakeIfMatched(txt) : false;
          if (!matched) {
            cleanupNativeWakeListeners();
            consecutiveNoSpeechCount = 0;
            scheduleWakeMonitor(1500);
          }
        })
      );
      nativeWakeHandles.push(
        await nativePlugin.addListener('nativeSpeechError', () => {
          if (!nativeWakeActive) return;
          cleanupNativeWakeListeners();
          consecutiveNoSpeechCount++;
          const backoffMs = Math.min(14000, 3200 + consecutiveNoSpeechCount * 1500);
          scheduleWakeMonitor(backoffMs);
        })
      );
      nativeWakeHandles.push(
        await nativePlugin.addListener('nativeSpeechEnd', () => {
          setTimeout(() => {
            if (nativeWakeActive) {
              cleanupNativeWakeListeners();
              scheduleWakeMonitor(1800);
            }
          }, 900);
        })
      );
    }

    const wakeLang = currentWakeConfig.lang === 'bn-BD' ? 'bn-BD' : 'en-US';
    await nativePlugin.startNativeSpeech({ language: wakeLang });
  } catch {
    cleanupNativeWakeListeners();
    scheduleWakeMonitor(4000);
  }
}

function bootWakeRecognitionCycle(): void {
  if (typeof window === 'undefined' || !wakeListenerShouldRun || micBusyInActiveSession) return;

  const cachedMic = localStorage.getItem('zuzu_mic_permission_status');
  if (cachedMic !== 'granted') return;

  if (isNativeAndroid()) {
    bootNativeAndroidWakeCycle().catch(() => {});
    return;
  }

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognitionClass) return;

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
      scheduleWakeMonitor(1500);
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
    } else if (!micBusyInActiveSession && !wakeRecognition && !nativeWakeActive && !vadCheckTimer) {
      startSilentVadOrRecognition();
    }
  } else {
    stopSilentVadGate();
    stopNativeTriggerMonitor();
    if (nativeWakeActive) {
      cleanupNativeWakeListeners();
      getZuzuNativePlugin()?.cancelNativeSpeech?.().catch(() => {});
    }
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
  if (nativeWakeActive) {
    cleanupNativeWakeListeners();
    getZuzuNativePlugin()?.cancelNativeSpeech?.().catch(() => {});
  }
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
