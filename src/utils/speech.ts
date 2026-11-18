import { getNativeZuzuPlugin } from './permission';

export interface VoiceCaptureOptions {
  language: 'auto' | 'en-US' | 'bn-BD';
  onStart?: () => void;
  onPartial?: (text: string) => void;
  onResult: (finalText: string) => void;
  onEmptyEnd?: () => void;
  onPermissionDenied?: () => void;
  onError?: (message: string) => void;
}

export interface VoiceCaptureController {
  stop: () => void;
  cancel: () => void;
}

function resolveRecognitionLanguage(lang: 'auto' | 'en-US' | 'bn-BD'): string {
  if (lang === 'bn-BD') return 'bn-BD';
  if (lang === 'en-US') return 'en-US';
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('bn')) {
    return 'bn-BD';
  }
  return 'en-US';
}

/**
 * Starts dual-mode Speech-to-Text capture:
 * - On Capacitor Android APK: uses native android.speech.SpeechRecognizer via ZuzuNative bridge.
 * - On Web / Desktop Chrome/Edge: uses Web SpeechRecognition without React stale closure bugs.
 */
export async function startVoiceCapture(options: VoiceCaptureOptions): Promise<VoiceCaptureController> {
  const {
    language,
    onStart,
    onPartial,
    onResult,
    onEmptyEnd,
    onPermissionDenied,
    onError
  } = options;

  const resolvedLang = resolveRecognitionLanguage(language);
  const nativePlugin = getNativeZuzuPlugin();

  let cancelled = false;
  let completed = false;
  let latestTranscript = '';

  const finishOnce = (text: string) => {
    if (completed || cancelled) return;
    completed = true;
    const clean = text.trim();
    if (clean.length > 0) {
      onResult(clean);
    } else {
      onEmptyEnd?.();
    }
  };

  // 1. Native Android Capacitor SpeechRecognizer path
  if (nativePlugin?.startNativeSpeech) {
    const handles: Array<{ remove: () => Promise<void> | void }> = [];
    const cleanupNativeListeners = () => {
      handles.forEach((h) => {
        try {
          h?.remove?.();
        } catch {}
      });
      handles.length = 0;
    };

    try {
      if (nativePlugin.addListener) {
        handles.push(
          await nativePlugin.addListener('nativeSpeechPartial', (data: any) => {
            if (cancelled) return;
            const txt = String(data?.text || '');
            if (txt) {
              latestTranscript = txt;
              onPartial?.(txt);
            }
          })
        );
        handles.push(
          await nativePlugin.addListener('nativeSpeechResult', (data: any) => {
            cleanupNativeListeners();
            const txt = String(data?.text || latestTranscript || '');
            finishOnce(txt);
          })
        );
        handles.push(
          await nativePlugin.addListener('nativeSpeechEnd', () => {
            // Delay briefly so nativeSpeechResult (fired immediately after onEndOfSpeech) arrives first
            setTimeout(() => {
              if (!completed && !cancelled) {
                cleanupNativeListeners();
                finishOnce(latestTranscript);
              }
            }, 900);
          })
        );
        handles.push(
          await nativePlugin.addListener('nativeSpeechError', (err: any) => {
            cleanupNativeListeners();
            if (cancelled || completed) return;
            const msg = String(err?.message || 'Speech recognition error');
            if (/permission/i.test(msg)) {
              completed = true;
              onPermissionDenied?.();
              return;
            }
            if (latestTranscript.trim().length > 0) {
              finishOnce(latestTranscript);
              return;
            }
            completed = true;
            if (msg === 'no-speech' || msg === 'no-match') {
              onEmptyEnd?.();
            } else {
              onError?.(msg);
            }
          })
        );
      }

      onStart?.();
      await nativePlugin.startNativeSpeech({ language: resolvedLang });

      return {
        stop: () => {
          nativePlugin.stopNativeSpeech?.().catch(() => {});
        },
        cancel: () => {
          cancelled = true;
          cleanupNativeListeners();
          nativePlugin.cancelNativeSpeech?.().catch(() => {});
        }
      };
    } catch (nativeErr: any) {
      cleanupNativeListeners();
      const errCode = String(nativeErr?.code || nativeErr?.message || '');
      if (/PERMISSION_DENIED/i.test(errCode)) {
        onPermissionDenied?.();
        return { stop: () => {}, cancel: () => {} };
      }
      console.warn('[Speech] Native recognizer unavailable, trying Web Speech API:', nativeErr);
    }
  }

  // 2. Web / Browser SpeechRecognition path
  const SpeechRecognitionClass =
    typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  if (!SpeechRecognitionClass) {
    onError?.('Speech recognition is not supported on this device/browser.');
    return { stop: () => {}, cancel: () => {} };
  }

  const recognition = new SpeechRecognitionClass();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = resolvedLang;

  recognition.onstart = () => {
    if (!cancelled) onStart?.();
  };

  recognition.onresult = (event: any) => {
    let combined = '';
    for (let i = 0; i < event.results.length; i++) {
      combined += event.results[i]?.[0]?.transcript || '';
    }
    latestTranscript = combined;
    if (!cancelled && combined) {
      onPartial?.(combined);
    }
  };

  recognition.onerror = (event: any) => {
    if (cancelled || completed) return;
    const err = event?.error || '';
    if (err === 'not-allowed' || err === 'service-not-allowed') {
      completed = true;
      onPermissionDenied?.();
      return;
    }
    if (latestTranscript.trim().length > 0) {
      finishOnce(latestTranscript);
      return;
    }
    completed = true;
    if (err === 'no-speech' || err === 'aborted') {
      onEmptyEnd?.();
    } else {
      onError?.(`Microphone error: ${err}`);
    }
  };

  recognition.onend = () => {
    finishOnce(latestTranscript);
  };

  try {
    recognition.start();
  } catch (startErr: any) {
    onError?.(startErr?.message || 'Failed to start microphone recognition.');
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {}
    },
    cancel: () => {
      cancelled = true;
      try {
        recognition.abort();
      } catch {}
    }
  };
}
