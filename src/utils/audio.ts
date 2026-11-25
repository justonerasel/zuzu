import { VoiceIdentity } from '../types';
import { getNativeZuzuPlugin } from './permission';

let nativeTtsHandles: Array<{ remove: () => Promise<void> | void }> = [];
let browserSpeechFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let nativeTtsWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
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

export function stopSpeaking(): void {
  speechGenerationSeq += 1;

  if (browserSpeechFallbackTimer) {
    clearTimeout(browserSpeechFallbackTimer);
    browserSpeechFallbackTimer = null;
  }

  if (nativeTtsWatchdogTimer) {
    clearTimeout(nativeTtsWatchdogTimer);
    nativeTtsWatchdogTimer = null;
  }

  clearNativeTtsListeners();
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.stopNativeSpeak) {
    try {
      nativePlugin.stopNativeSpeak().catch(() => {});
    } catch {}
  }

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
        if (nativeTtsWatchdogTimer) {
          clearTimeout(nativeTtsWatchdogTimer);
          nativeTtsWatchdogTimer = null;
        }
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
      const watchdogMs = Math.max(5000, Math.min(35000, cleanText.length * 140));
      nativeTtsWatchdogTimer = setTimeout(() => done(), watchdogMs);

      await nativePlugin.speakNative({
        text: cleanText,
        language: isBengali ? 'bn-BD' : 'en-US',
        rate: safeRate,
        pitch
      });
      return;
    } catch (nativeErr) {
      if (nativeTtsWatchdogTimer) {
        clearTimeout(nativeTtsWatchdogTimer);
        nativeTtsWatchdogTimer = null;
      }
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
 * Primary free voice output using Android's built-in TextToSpeech (ZuzuNative.speakNative)
 * and browser SpeechSynthesis on web. Zero paid external TTS API calls.
 */
export async function speakText(options: SpeakOptions): Promise<void> {
  const {
    text,
    voiceIdentity,
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

  const safeRate = Math.max(0.75, Math.min(1.5, speechRate));
  const safeVolume = Math.max(0, Math.min(1, volume));

  await speakWithDeviceFallback({
    text: cleanText,
    voiceIdentity,
    speechRate: safeRate,
    volume: safeVolume,
    seq,
    onStart,
    onEnd,
    onError
  });
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
