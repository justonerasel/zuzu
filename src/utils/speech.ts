import { getNativeZuzuPlugin } from './permission';
import { transcribeAudioWithGemini } from './apiConfig';
import { releaseBackgroundMicForActiveSession } from './backgroundService';

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

let activeCaptureCancelFn: (() => void) | null = null;
let globalSpeechSeq = 0;

function resolveRecognitionLanguage(lang: 'auto' | 'en-US' | 'bn-BD'): string {
  if (lang === 'bn-BD') return 'bn-BD';
  if (lang === 'en-US') return 'en-US';
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('bn')) {
    return 'bn-BD';
  }
  return 'en-US';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = String(reader.result || '');
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => reject(new Error('Failed to encode audio clip.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Automatic Audio-Capture + Gemini Cloud Transcription Fallback.
 * Triggered seamlessly whenever Android SpeechRecognizer fails with Error 12 / 13
 * (ERROR_LANGUAGE_NOT_SUPPORTED / ERROR_LANGUAGE_UNAVAILABLE) or Web Speech API is missing.
 */
async function startCloudAudioRecordingFallback(params: {
  language: 'auto' | 'en-US' | 'bn-BD';
  onListeningStarted?: () => void;
  onPartial?: (text: string) => void;
  onFinish: (text: string) => void;
  onPermissionDenied?: () => void;
  onError?: (message: string) => void;
  isCancelled: () => boolean;
}): Promise<VoiceCaptureController> {
  const {
    language,
    onListeningStarted,
    onPartial,
    onFinish,
    onPermissionDenied,
    onError,
    isCancelled
  } = params;
  const nativePlugin = getNativeZuzuPlugin();

  // Path A: Browser / WebView MediaRecorder with AudioContext silence auto-stop
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (isCancelled()) {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        return { stop: () => {}, cancel: () => {} };
      }

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ];
      const mimeType = preferredTypes.find((t) => {
        try {
          return MediaRecorder.isTypeSupported(t);
        } catch {
          return false;
        }
      }) || '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const chunks: BlobPart[] = [];
      let stopped = false;
      let maxTimer: ReturnType<typeof setTimeout> | null = null;
      let vadTimer: ReturnType<typeof setInterval> | null = null;
      let audioCtx: AudioContext | null = null;

      const cleanupAudio = () => {
        if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
        if (vadTimer) { clearInterval(vadTimer); vadTimer = null; }
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      };

      const stopRecording = () => {
        if (stopped) return;
        stopped = true;
        cleanupAudio();
        try {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        } catch {}
      };

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = async () => {
        cleanupAudio();
        if (isCancelled()) return;
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: finalMime });
        if (blob.size < 400) {
          onFinish('');
          return;
        }
        onPartial?.('Transcribing via Gemini Speech...');
        try {
          const b64 = await blobToBase64(blob);
          const tx = await transcribeAudioWithGemini({
            audioBase64: b64,
            mimeType: finalMime.split(';')[0] || 'audio/webm',
            language
          });
          if (isCancelled()) return;
          if (tx.success) {
            onFinish(tx.text || '');
          } else {
            onError?.(tx.error || 'Cloud speech transcription failed.');
          }
        } catch (err: any) {
          if (!isCancelled()) {
            onError?.(err?.message || 'Cloud speech transcription failed.');
          }
        }
      };

      // RMS silence detection to auto-stop once user finishes speaking
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioCtx = new AudioCtx();
          const src = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          src.connect(analyser);
          const buf = new Uint8Array(analyser.fftSize);
          let heardSpeech = false;
          let silentTicks = 0;

          vadTimer = setInterval(() => {
            if (stopped || isCancelled()) return;
            analyser.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = (buf[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / buf.length);
            if (rms > 0.025) {
              heardSpeech = true;
              silentTicks = 0;
            } else if (heardSpeech) {
              silentTicks++;
              if (silentTicks >= 11) {
                stopRecording();
              }
            }
          }, 120);
        }
      } catch {}

      recorder.start(250);
      onListeningStarted?.();
      onPartial?.('Listening (Cloud Speech mode)...');
      maxTimer = setTimeout(() => stopRecording(), 8500);

      return {
        stop: () => stopRecording(),
        cancel: () => {
          stopped = true;
          cleanupAudio();
          try {
            if (recorder.state !== 'inactive') recorder.stop();
          } catch {}
        }
      };
    } catch (recErr: any) {
      const name = recErr?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        onPermissionDenied?.();
        return { stop: () => {}, cancel: () => {} };
      }
      // Fall through to native PCM capture if MediaRecorder failed
    }
  }

  // Path B: Native Android AudioRecord WAV capture -> Gemini transcribe
  if (nativePlugin?.startNativeAudioCapture && nativePlugin?.stopNativeAudioCapture) {
    let stopped = false;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    const finishNativeCapture = async () => {
      if (stopped) return;
      stopped = true;
      if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
      try {
        const res = await nativePlugin.stopNativeAudioCapture();
        if (isCancelled()) return;
        const b64 = String(res?.audioBase64 || '');
        if (!b64) {
          onFinish('');
          return;
        }
        onPartial?.('Transcribing via Gemini Speech...');
        const tx = await transcribeAudioWithGemini({
          audioBase64: b64,
          mimeType: String(res?.mimeType || 'audio/wav'),
          language
        });
        if (isCancelled()) return;
        if (tx.success) {
          onFinish(tx.text || '');
        } else {
          onError?.(tx.error || 'Cloud speech transcription failed.');
        }
      } catch (err: any) {
        if (!isCancelled()) {
          onError?.(err?.message || 'Native audio capture failed.');
        }
      }
    };

    try {
      await nativePlugin.startNativeAudioCapture();
      if (isCancelled()) {
        nativePlugin.stopNativeAudioCapture().catch(() => {});
        return { stop: () => {}, cancel: () => {} };
      }
      onListeningStarted?.();
      onPartial?.('Listening (Cloud Speech mode)...');
      maxTimer = setTimeout(() => {
        finishNativeCapture();
      }, 6500);
      return {
        stop: () => {
          finishNativeCapture();
        },
        cancel: () => {
          stopped = true;
          if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
          nativePlugin.stopNativeAudioCapture().catch(() => {});
        }
      };
    } catch (err: any) {
      onError?.(err?.message || 'Could not capture audio for cloud transcription.');
      return { stop: () => {}, cancel: () => {} };
    }
  }

  onError?.('Speech recognition language unavailable on this device and cloud audio capture is unavailable.');
  return { stop: () => {}, cancel: () => {} };
}

/**
 * Starts multi-tier Speech-to-Text capture:
 * 1. Releases any active background wake/VAD mic cleanly first.
 * 2. On Capacitor Android APK: uses native android.speech.SpeechRecognizer with locale fallback chain
 *    and fires onStart strictly when onReadyForSpeech (nativeSpeechReady) signals mic active.
 * 3. Automatic Error 12/13 fallback: switches cleanly to audio capture + Gemini Cloud Transcription.
 * 4. On Web / Desktop Chrome/Edge: uses Web SpeechRecognition or Cloud Transcription fallback.
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

  // Cancel any prior lingering capture session cleanly before starting a new one
  if (activeCaptureCancelFn) {
    try {
      activeCaptureCancelFn();
    } catch {}
    activeCaptureCancelFn = null;
  }

  const seq = ++globalSpeechSeq;
  const resolvedLang = resolveRecognitionLanguage(language);
  const nativePlugin = getNativeZuzuPlugin();

  let cancelled = false;
  let completed = false;
  let started = false;
  let switchedToFallback = false;
  let latestTranscript = '';
  let fallbackController: VoiceCaptureController | null = null;

  const isStale = () => cancelled || seq !== globalSpeechSeq;

  const notifyStartedOnce = () => {
    if (started || isStale()) return;
    started = true;
    onStart?.();
  };

  const finishOnce = (text: string) => {
    if (completed || isStale()) return;
    completed = true;
    if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
    const clean = text.trim();
    if (clean.length > 0) {
      onResult(clean);
    } else {
      onEmptyEnd?.();
    }
  };

  // Ensure background wake word / trigger AudioRecord is cleanly released before capturing mic
  await releaseBackgroundMicForActiveSession();
  if (isStale()) {
    return { stop: () => {}, cancel: () => {} };
  }

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

    const controller: VoiceCaptureController = {
      stop: () => {
        if (fallbackController) {
          fallbackController.stop();
        } else {
          nativePlugin.stopNativeSpeech?.().catch(() => {});
        }
      },
      cancel: () => {
        cancelled = true;
        if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
        cleanupNativeListeners();
        if (fallbackController) {
          fallbackController.cancel();
        } else {
          nativePlugin.cancelNativeSpeech?.().catch(() => {});
        }
      }
    };
    activeCaptureCancelFn = controller.cancel;

    try {
      if (nativePlugin.addListener) {
        handles.push(
          await nativePlugin.addListener('nativeSpeechReady', () => {
            if (isStale() || switchedToFallback) return;
            notifyStartedOnce();
          })
        );
        handles.push(
          await nativePlugin.addListener('nativeSpeechPartial', (data: any) => {
            if (isStale() || switchedToFallback) return;
            notifyStartedOnce();
            const txt = String(data?.text || '');
            if (txt) {
              latestTranscript = txt;
              onPartial?.(txt);
            }
          })
        );
        handles.push(
          await nativePlugin.addListener('nativeSpeechResult', (data: any) => {
            if (isStale() || switchedToFallback) return;
            cleanupNativeListeners();
            const txt = String(data?.text || latestTranscript || '');
            finishOnce(txt);
          })
        );
        handles.push(
          await nativePlugin.addListener('nativeSpeechEnd', () => {
            if (isStale() || switchedToFallback) return;
            setTimeout(() => {
              if (!completed && !isStale() && !switchedToFallback) {
                cleanupNativeListeners();
                finishOnce(latestTranscript);
              }
            }, 900);
          })
        );
        handles.push(
          await nativePlugin.addListener('nativeSpeechError', async (err: any) => {
            cleanupNativeListeners();
            if (isStale() || completed || switchedToFallback) return;
            const msg = String(err?.message || 'Speech recognition error');
            const errCode = Number(err?.code || 0);
            const shouldCloudFallback =
              Boolean(err?.fallbackSuggested) ||
              errCode === 12 ||
              errCode === 13 ||
              /error\s*\(?1[23]\)?|language.*not\s+supported|language.*unavailable/i.test(msg);

            if (/permission/i.test(msg) || errCode === 9) {
              completed = true;
              if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
              onPermissionDenied?.();
              return;
            }
            if (latestTranscript.trim().length > 0) {
              finishOnce(latestTranscript);
              return;
            }
            if (shouldCloudFallback) {
              switchedToFallback = true;
              fallbackController = await startCloudAudioRecordingFallback({
                language,
                onListeningStarted: notifyStartedOnce,
                onPartial,
                onFinish: (txText) => finishOnce(txText),
                onPermissionDenied: () => {
                  completed = true;
                  if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
                  onPermissionDenied?.();
                },
                onError: (fbErr) => {
                  completed = true;
                  if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
                  onError?.(fbErr);
                },
                isCancelled: isStale
              });
              return;
            }

            completed = true;
            if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
            if (msg === 'no-speech' || msg === 'no-match') {
              onEmptyEnd?.();
            } else {
              onError?.(msg);
            }
          })
        );
      }

      await nativePlugin.startNativeSpeech({ language: resolvedLang });
      return controller;
    } catch (nativeErr: any) {
      cleanupNativeListeners();
      const errCode = String(nativeErr?.code || nativeErr?.message || '');
      if (/PERMISSION_DENIED/i.test(errCode)) {
        if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
        onPermissionDenied?.();
        return { stop: () => {}, cancel: () => {} };
      }
      if (/UNAVAILABLE/i.test(errCode)) {
        fallbackController = await startCloudAudioRecordingFallback({
          language,
          onListeningStarted: notifyStartedOnce,
          onPartial,
          onFinish: (txText) => finishOnce(txText),
          onPermissionDenied: () => {
            completed = true;
            if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
            onPermissionDenied?.();
          },
          onError: (fbErr) => {
            completed = true;
            if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
            onError?.(fbErr);
          },
          isCancelled: isStale
        });
        activeCaptureCancelFn = () => {
          cancelled = true;
          fallbackController?.cancel();
        };
        return fallbackController;
      }
      console.warn('[Speech] Native recognizer unavailable, trying Web Speech API:', nativeErr);
    }
  }

  // 2. Web / Browser SpeechRecognition path
  const SpeechRecognitionClass =
    typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  if (!SpeechRecognitionClass) {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      fallbackController = await startCloudAudioRecordingFallback({
        language,
        onListeningStarted: notifyStartedOnce,
        onPartial,
        onFinish: (txText) => finishOnce(txText),
        onPermissionDenied: () => {
          completed = true;
          if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
          onPermissionDenied?.();
        },
        onError: (fbErr) => {
          completed = true;
          if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
          onError?.(fbErr);
        },
        isCancelled: isStale
      });
      activeCaptureCancelFn = () => {
        cancelled = true;
        fallbackController?.cancel();
      };
      return fallbackController;
    }
    if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
    onError?.('Speech recognition is not supported on this device/browser.');
    return { stop: () => {}, cancel: () => {} };
  }

  const recognition = new SpeechRecognitionClass();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = resolvedLang;

  const webController: VoiceCaptureController = {
    stop: () => {
      if (fallbackController) {
        fallbackController.stop();
        return;
      }
      try {
        recognition.stop();
      } catch {}
    },
    cancel: () => {
      cancelled = true;
      if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
      if (fallbackController) {
        fallbackController.cancel();
        return;
      }
      try {
        recognition.abort();
      } catch {}
    }
  };
  activeCaptureCancelFn = webController.cancel;

  recognition.onstart = () => {
    notifyStartedOnce();
  };

  recognition.onresult = (event: any) => {
    if (isStale()) return;
    notifyStartedOnce();
    let combined = '';
    for (let i = 0; i < event.results.length; i++) {
      combined += event.results[i]?.[0]?.transcript || '';
    }
    latestTranscript = combined;
    if (combined) {
      onPartial?.(combined);
    }
  };

  recognition.onerror = async (event: any) => {
    if (isStale() || completed || switchedToFallback) return;
    const err = event?.error || '';
    if (err === 'not-allowed' || err === 'service-not-allowed') {
      completed = true;
      if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
      onPermissionDenied?.();
      return;
    }
    if (latestTranscript.trim().length > 0) {
      finishOnce(latestTranscript);
      return;
    }
    if (err === 'language-not-supported' || err === 'network') {
      switchedToFallback = true;
      fallbackController = await startCloudAudioRecordingFallback({
        language,
        onListeningStarted: notifyStartedOnce,
        onPartial,
        onFinish: (txText) => finishOnce(txText),
        onPermissionDenied: () => {
          completed = true;
          if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
          onPermissionDenied?.();
        },
        onError: (fbErr) => {
          completed = true;
          if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
          onError?.(fbErr);
        },
        isCancelled: isStale
      });
      return;
    }
    completed = true;
    if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
    if (err === 'no-speech' || err === 'aborted') {
      onEmptyEnd?.();
    } else if (err === 'audio-capture') {
      onError?.('No active microphone device detected or audio input is busy.');
    } else {
      onError?.(`Microphone error: ${err || 'recognition failed'}`);
    }
  };

  recognition.onend = () => {
    if (!switchedToFallback) {
      finishOnce(latestTranscript);
    }
  };

  try {
    recognition.start();
  } catch (startErr: any) {
    if (seq === globalSpeechSeq) activeCaptureCancelFn = null;
    onError?.(startErr?.message || 'Failed to start microphone recognition.');
  }

  return webController;
}

