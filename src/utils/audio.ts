import { VoiceIdentity } from '../types';
import { apiFetch } from './apiConfig';
import { getNativeZuzuPlugin } from './permission';

let currentAudio: HTMLAudioElement | null = null;
let nativeTtsHandles: Array<{ remove: () => Promise<void> | void }> = [];
let browserSpeechFallbackTimer: ReturnType<typeof setTimeout> | null = null;

// Audio context for sound effects and analysis
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

// Android assistant sound effects
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
  customVoiceId?: string;
  customApiKey?: string;
  stability?: number;
  similarityBoost?: number;
  speechRate?: number;
  volume?: number;
  voiceStyleId?: string;
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

  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
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
  voiceStyleId?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}): Promise<void> {
  const cleanText = cleanTextForSpeech(params.text);
  if (!cleanText) {
    params.onEnd?.();
    return;
  }

  const isBengali = /[\u0980-\u09FF]/.test(cleanText);
  const safeRate = Math.max(0.75, Math.min(1.5, params.speechRate));
  const pitch =
    params.voiceIdentity === 'male'
      ? params.voiceStyleId === 'george_warm'
        ? 0.92
        : 0.85
      : params.voiceStyleId === 'kore_firm'
      ? 1.12
      : params.voiceStyleId === 'aria_expressive'
      ? 1.25
      : 1.18;

  // 1. Try Native Android TextToSpeech on Capacitor APK (reliable even when WebView speechSynthesis is muted)
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.speakNative) {
    try {
      clearNativeTtsListeners();
      let doneCalled = false;
      const done = () => {
        if (doneCalled) return;
        doneCalled = true;
        clearNativeTtsListeners();
        params.onEnd?.();
      };

      if (nativePlugin.addListener) {
        nativeTtsHandles.push(
          await nativePlugin.addListener('nativeTtsStart', () => {
            params.onStart?.();
          })
        );
        nativeTtsHandles.push(
          await nativePlugin.addListener('nativeTtsEnd', () => {
            done();
          })
        );
        nativeTtsHandles.push(
          await nativePlugin.addListener('nativeTtsError', () => {
            done();
          })
        );
      }

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

  // 2. Web / Browser speechSynthesis fallback
  speakWithBrowserSpeech({
    ...params,
    text: cleanText
  });
}

// Speak via ElevenLabs backend TTS (when API key set), Native Android TTS, or Browser Speech fallback
export async function speakText(options: SpeakOptions): Promise<void> {
  const {
    text,
    voiceIdentity,
    customVoiceId,
    customApiKey,
    stability = 0.5,
    similarityBoost = 0.75,
    speechRate = 1.0,
    volume = 1.0,
    voiceStyleId,
    onStart,
    onEnd,
    onError
  } = options;

  stopSpeaking();

  const safeRate = Math.max(0.75, Math.min(1.5, speechRate));
  const safeVolume = Math.max(0, Math.min(1, volume));

  try {
    // Only hit /api/tts if custom ElevenLabs key exists OR backend has one configured
    const response = await apiFetch('/api/tts', {
      method: 'POST',
      body: JSON.stringify({
        text,
        voiceIdentity,
        customVoiceId,
        customApiKey,
        stability,
        similarityBoost
      })
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('audio/mpeg') || contentType.includes('audio/')) {
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      currentAudio = audio;

      audio.playbackRate = safeRate;
      audio.volume = safeVolume;
      audio.onplay = () => onStart?.();
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        onEnd?.();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        speakWithDeviceFallback({ text, voiceIdentity, speechRate: safeRate, volume: safeVolume, voiceStyleId, onStart, onEnd, onError });
      };

      await audio.play();
      return;
    }

    await response.json().catch(() => null);
    await speakWithDeviceFallback({ text, voiceIdentity, speechRate: safeRate, volume: safeVolume, voiceStyleId, onStart, onEnd, onError });
  } catch {
    await speakWithDeviceFallback({ text, voiceIdentity, speechRate: safeRate, volume: safeVolume, voiceStyleId, onStart, onEnd, onError });
  }
}

function speakWithBrowserSpeech({
  text,
  voiceIdentity,
  speechRate = 1.0,
  volume = 1.0,
  voiceStyleId,
  onStart,
  onEnd,
  onError
}: {
  text: string;
  voiceIdentity: VoiceIdentity;
  speechRate?: number;
  volume?: number;
  voiceStyleId?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.();
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
    utterance.pitch = voiceStyleId === 'george_warm' ? 0.92 : 0.85;
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
    utterance.pitch = voiceStyleId === 'kore_firm' ? 1.12 : voiceStyleId === 'aria_expressive' ? 1.28 : 1.2;
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
    onEnd?.();
  };

  utterance.onstart = () => onStart?.();
  utterance.onend = () => finish();
  utterance.onerror = (e) => {
    if (ended) return;
    ended = true;
    if (browserSpeechFallbackTimer) {
      clearTimeout(browserSpeechFallbackTimer);
      browserSpeechFallbackTimer = null;
    }
    onError?.(e);
  };

  // Safety guard if mobile WebView swallows onend
  const estMs = Math.max(4000, Math.min(25000, cleanText.length * 85));
  browserSpeechFallbackTimer = setTimeout(() => finish(), estMs);

  window.speechSynthesis.speak(utterance);
}
