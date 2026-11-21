import { VoiceIdentity } from '../types';
import { apiFetch, directGeminiSpeechGenerate } from './apiConfig';
import { getNativeZuzuPlugin } from './permission';
import { resolveGeminiVoiceForSettings } from '../constants/personalities';
import { getAppSettings } from './storage';

let currentAudio: HTMLAudioElement | null = null;
let currentAudioObjectUrl: string | null = null;
let currentTtsAbortController: AbortController | null = null;
let nativeTtsHandles: Array<{ remove: () => Promise<void> | void }> = [];
let browserSpeechFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let speechGenerationSeq = 0;

// Audio context for subtle UI sound effects
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playHapticSound(type: 'switch' | 'listen_start' | 'listen_stop' | 'message_sent'): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'switch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'listen_start') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.1);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'listen_stop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(329.63, now + 0.12);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === 'message_sent') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(860, now + 0.07);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'switch') navigator.vibrate([25, 40, 30]);
      else navigator.vibrate(20);
    }
  } catch {
    // Non-fatal if audio context not permitted
  }
}

export interface SpeakOptions {
  text: string;
  voiceIdentity: VoiceIdentity;
  voiceName?: string;
  customGeminiKey?: string;
  speechRate?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

function clearNativeTtsListeners(): void {
  nativeTtsHandles.forEach((h) => {
    try {
      h?.remove?.();
    } catch {}
  });
  nativeTtsHandles = [];
}

function releaseCurrentAudioElement(): void {
  if (currentAudio) {
    try {
      currentAudio.onplay = null;
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}
    currentAudio = null;
  }
  if (currentAudioObjectUrl) {
    try {
      URL.revokeObjectURL(currentAudioObjectUrl);
    } catch {}
    currentAudioObjectUrl = null;
  }
}

export function stopSpeaking(): void {
  speechGenerationSeq += 1;

  if (currentTtsAbortController) {
    try {
      currentTtsAbortController.abort();
    } catch {}
    currentTtsAbortController = null;
  }

  if (browserSpeechFallbackTimer) {
    clearTimeout(browserSpeechFallbackTimer);
    browserSpeechFallbackTimer = null;
  }

  clearNativeTtsListeners();
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.stopNativeSpeak) {
    try {
      nativePlugin.stopNativeSpeak().catch(() => {});
    } catch {}
  }

  releaseCurrentAudioElement();

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_#~]/g, '')
    .trim();
}

async function playAudioBlob(
  blob: Blob,
  seq: number,
  safeRate: number,
  safeVolume: number,
  callbacks: { onStart?: () => void; onEnd?: () => void; onFallback: () => void }
): Promise<boolean> {
  if (seq !== speechGenerationSeq) return false;
  releaseCurrentAudioElement();

  const audioUrl = URL.createObjectURL(blob);
  currentAudioObjectUrl = audioUrl;
  const audio = new Audio(audioUrl);
  currentAudio = audio;

  audio.playbackRate = safeRate;
  audio.volume = safeVolume;
  audio.onplay = () => {
    if (seq === speechGenerationSeq) callbacks.onStart?.();
  };
  audio.onended = () => {
    releaseCurrentAudioElement();
    if (seq === speechGenerationSeq) callbacks.onEnd?.();
  };
  audio.onerror = () => {
    releaseCurrentAudioElement();
    if (seq === speechGenerationSeq) callbacks.onFallback();
  };

  try {
    await audio.play();
    return true;
  } catch {
    releaseCurrentAudioElement();
    return false;
  }
}

async function speakWithDeviceFallback(params: {
  text: string;
  voiceIdentity: VoiceIdentity;
  speechRate: number;
  volume: number;
  seq: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}): Promise<void> {
  if (params.seq !== speechGenerationSeq) return;

  const cleanText = cleanTextForSpeech(params.text);
  if (!cleanText) {
    params.onEnd?.();
    return;
  }

  const isBengali = /[\u0980-\u09FF]/.test(cleanText);
  const safeRate = Math.max(0.75, Math.min(1.5, params.speechRate));
  const pitch = params.voiceIdentity === 'male' ? 0.92 : 1.12;

  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.speakNative) {
    try {
      clearNativeTtsListeners();
      let doneCalled = false;
      const done = () => {
        if (doneCalled) return;
        doneCalled = true;
        clearNativeTtsListeners();
        if (params.seq === speechGenerationSeq) {
          params.onEnd?.();
        }
      };

      if (nativePlugin.addListener) {
        nativeTtsHandles.push(
          await nativePlugin.addListener('nativeTtsStart', () => {
            if (params.seq === speechGenerationSeq) params.onStart?.();
          })
        );
        nativeTtsHandles.push(
          await nativePlugin.addListener('nativeTtsEnd', () => done())
        );
        nativeTtsHandles.push(
          await nativePlugin.addListener('nativeTtsError', () => done())
        );
      }

      if (params.seq !== speechGenerationSeq) return;
      params.onStart?.();
      await nativePlugin.speakNative({
        text: cleanText,
        language: isBengali ? 'bn-BD' : 'en-US',
        rate: safeRate,
        pitch
      });
      return;
    } catch (nativeErr) {
      clearNativeTtsListeners();
      console.warn('[Zuzu Audio] Native Android TTS unavailable, using browser speech:', nativeErr);
    }
  }

  speakWithBrowserSpeech({
    text: cleanText,
    voiceIdentity: params.voiceIdentity,
    speechRate: safeRate,
    volume: params.volume,
    seq: params.seq,
    onStart: params.onStart,
    onEnd: params.onEnd,
    onError: params.onError
  });
}

/**
 * Primary TTS entrypoint powered by Google Gemini Prebuilt Neural Voices.
 * Falls back cleanly to native Android/Browser speech only when Gemini TTS is offline or unconfigured.
 */
export async function speakText(options: SpeakOptions): Promise<void> {
  const {
    text,
    voiceIdentity,
    voiceName,
    customGeminiKey,
    speechRate = 1.0,
    volume = 1.0,
    onStart,
    onEnd,
    onError
  } = options;

  stopSpeaking();
  const seq = speechGenerationSeq;

  const cleanText = cleanTextForSpeech(text);
  if (!cleanText) {
    onEnd?.();
    return;
  }

  const latestSettings = getAppSettings();
  const effectiveGeminiKey = (customGeminiKey ?? latestSettings.customGeminiApiKey ?? '').trim();
  const resolvedVoice = resolveGeminiVoiceForSettings(voiceName || latestSettings.geminiVoiceName, voiceIdentity);

  const safeRate = Math.max(0.75, Math.min(1.5, speechRate));
  const safeVolume = Math.max(0, Math.min(1, volume));

  const controller = new AbortController();
  currentTtsAbortController = controller;

  const runFallback = () => {
    if (seq !== speechGenerationSeq) return;
    speakWithDeviceFallback({
      text: cleanText,
      voiceIdentity: resolvedVoice.gender,
      speechRate: safeRate,
      volume: safeVolume,
      seq,
      onStart,
      onEnd,
      onError
    });
  };

  try {
    // 1. Request Gemini TTS via backend /api/tts proxy
    const response = await apiFetch(
      '/api/tts',
      {
        method: 'POST',
        body: JSON.stringify({
          text: cleanText,
          voiceIdentity: resolvedVoice.gender,
          voiceName: resolvedVoice.id,
          customGeminiKey: effectiveGeminiKey
        })
      },
      12000,
      controller.signal
    );

    if (seq !== speechGenerationSeq) return;

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('audio/')) {
      const blob = await response.blob();
      const played = await playAudioBlob(blob, seq, safeRate, safeVolume, {
        onStart,
        onEnd,
        onFallback: runFallback
      });
      if (played) return;
    } else {
      await response.json().catch(() => null);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && seq !== speechGenerationSeq) return;
    // Backend unavailable; proceed to direct Gemini TTS REST call
  }

  // 2. Direct Gemini TTS REST fallback (for standalone Android APK)
  if (effectiveGeminiKey && seq === speechGenerationSeq) {
    try {
      const directBlob = await directGeminiSpeechGenerate({
        apiKey: effectiveGeminiKey,
        text: cleanText,
        voiceName: resolvedVoice.id,
        signal: controller.signal
      });
      if (directBlob && seq === speechGenerationSeq) {
        const played = await playAudioBlob(directBlob, seq, safeRate, safeVolume, {
          onStart,
          onEnd,
          onFallback: runFallback
        });
        if (played) return;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' && seq !== speechGenerationSeq) return;
    }
  }

  if (seq === speechGenerationSeq) {
    runFallback();
  }
}

function speakWithBrowserSpeech({
  text,
  voiceIdentity,
  speechRate = 1.0,
  volume = 1.0,
  seq,
  onStart,
  onEnd,
  onError
}: {
  text: string;
  voiceIdentity: VoiceIdentity;
  speechRate?: number;
  volume?: number;
  seq: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}): void {
  if (typeof window === 'undefined' || !window.speechSynthesis || seq !== speechGenerationSeq) {
    if (seq === speechGenerationSeq) onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();

  const cleanText = cleanTextForSpeech(text);
  const utterance = new SpeechSynthesisUtterance(cleanText);

  const isBengali = /[\u0980-\u09FF]/.test(cleanText);
  const voices = window.speechSynthesis.getVoices();

  const safeRate = Math.max(0.75, Math.min(1.5, speechRate));
  const safeVolume = Math.max(0, Math.min(1, volume));

  utterance.rate = safeRate;
  utterance.volume = safeVolume;

  if (voiceIdentity === 'male') {
    utterance.pitch = 0.92;
    if (isBengali) {
      const bnVoice = voices.find(v => v.lang.startsWith('bn') && (v.name.includes('Male') || v.name.includes('David') || v.name.includes('Natural')));
      if (bnVoice) utterance.voice = bnVoice;
      utterance.lang = 'bn-BD';
    } else {
      const maleVoice = voices.find(v =>
        (v.name.includes('Male') || v.name.includes('David') || v.name.includes('Guy') || v.name.includes('George') || v.name.includes('Daniel') || v.name.includes('Natural')) &&
        v.lang.startsWith('en')
      ) || voices.find(v => v.lang.startsWith('en'));
      if (maleVoice) utterance.voice = maleVoice;
    }
  } else {
    utterance.pitch = 1.12;
    if (isBengali) {
      const bnVoice = voices.find(v => v.lang.startsWith('bn') && (v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Natural')));
      if (bnVoice) utterance.voice = bnVoice;
      utterance.lang = 'bn-BD';
    } else {
      const femaleVoice = voices.find(v =>
        (v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Samantha') || v.name.includes('Jenny') || v.name.includes('Victoria') || v.name.includes('Google US English')) &&
        v.lang.startsWith('en')
      ) || voices.find(v => v.lang.startsWith('en'));
      if (femaleVoice) utterance.voice = femaleVoice;
    }
  }

  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    if (browserSpeechFallbackTimer) {
      clearTimeout(browserSpeechFallbackTimer);
      browserSpeechFallbackTimer = null;
    }
    if (seq === speechGenerationSeq) onEnd?.();
  };

  utterance.onstart = () => {
    if (seq === speechGenerationSeq) onStart?.();
  };
  utterance.onend = () => finish();
  utterance.onerror = (e) => {
    if (ended) return;
    ended = true;
    if (browserSpeechFallbackTimer) {
      clearTimeout(browserSpeechFallbackTimer);
      browserSpeechFallbackTimer = null;
    }
    if (seq === speechGenerationSeq) onError?.(e);
  };

  const estMs = Math.max(4000, Math.min(25000, cleanText.length * 85));
  browserSpeechFallbackTimer = setTimeout(() => finish(), estMs);

  window.speechSynthesis.speak(utterance);
}
