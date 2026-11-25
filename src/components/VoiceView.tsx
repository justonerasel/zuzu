import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Minimize2,
  Repeat,
  Radio,
  AlertCircle,
  X,
  History,
  Send,
  Globe2,
  ExternalLink
} from 'lucide-react';
import { AppSettings, SearchSourceItem, VoiceIdentity, VoiceMessage, VoiceSession } from '../types';
import {
  PERSONALITIES,
  VOICE_IDENTITIES,
  getDefaultGeminiVoiceForIdentity,
  resolveGeminiVoiceForSettings
} from '../constants/personalities';
import {
  detectSleepStopIntent,
  detectVoiceSwitchIntent,
  detectVoiceActionIntent,
  PendingReminderClarification,
  resolvePendingReminderClarification
} from '../utils/intentDetector';
import { playHapticSound, speakText, stopSpeaking } from '../utils/audio';
import { saveVoiceSession, getMemories, saveMemory } from '../utils/storage';
import {
  checkMicrophonePermission,
  requestMicrophonePermission,
  getNativeZuzuPlugin,
  MicrophonePermissionState,
  openAndroidAppSettingsGuide
} from '../utils/permission';
import { MicrophonePermissionModal } from './MicrophonePermissionModal';
import { executeConfirmedMessageIntent } from './NotesRemindersModal';
import { streamUnifiedAiChat } from '../utils/apiConfig';
import { startVoiceCapture, VoiceCaptureController } from '../utils/speech';
import { ParticleOrb, OrbState } from './ParticleOrb';
import { setMicBusyForActiveSession } from '../utils/backgroundService';
import { formatSourcePublicationTime } from '../utils/sourceFormat';

interface VoiceViewProps {
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onMinimize: () => void;
  onOpenHistory?: () => void;
  currentSession: VoiceSession | null;
  setCurrentSession: React.Dispatch<React.SetStateAction<VoiceSession | null>>;
  onRequestApiKeyModal?: (actionName: string, onResume?: () => void) => void;
}

export const VoiceView: React.FC<VoiceViewProps> = ({
  settings,
  onUpdateSettings,
  onMinimize,
  onOpenHistory,
  currentSession,
  setCurrentSession,
  onRequestApiKeyModal
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiReplyText, setAiReplyText] = useState('');
  const [statusMessage, setStatusMessage] = useState('Tap orb to start voice chat');
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [lastSources, setLastSources] = useState<SearchSourceItem[]>([]);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [micModalState, setMicModalState] = useState<MicrophonePermissionState>('prompt');
  const [pendingMessageDraft, setPendingMessageDraft] = useState<{
    recipient: string;
    text: string;
    app: 'messenger' | 'whatsapp' | 'sms';
  } | null>(null);

  const captureControllerRef = useRef<VoiceCaptureController | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const pendingClarificationRef = useRef<PendingReminderClarification | null>(null);
  const suppressContinuousOnceRef = useRef(false);
  const isContinuousRef = useRef(settings.continuousListening);
  const activeIdentityRef = useRef(settings.activeIdentity);
  const settingsRef = useRef(settings);
  const sessionRef = useRef(currentSession);
  const isCancelledRef = useRef(false);
  const isStartingRef = useRef(false);
  const handleUserVoiceInputRef = useRef<(spokenText: string) => void>(() => {});
  const ensurePermissionAndStartRef = useRef<() => void>(() => {});
  const toggleOrbStateRef = useRef<() => void>(() => {});

  // Sync refs with latest props
  useEffect(() => {
    settingsRef.current = settings;
    isContinuousRef.current = settings.continuousListening;
    activeIdentityRef.current = settings.activeIdentity;
  }, [settings]);

  useEffect(() => {
    sessionRef.current = currentSession;
  }, [currentSession]);

  // Cleanup active voice capture and in-flight requests on unmount
  useEffect(() => {
    return () => {
      aiAbortControllerRef.current?.abort();
      aiAbortControllerRef.current = null;
      captureControllerRef.current?.cancel();
      captureControllerRef.current = null;
      setMicBusyForActiveSession(false);
    };
  }, []);

  const currentPersonality = PERSONALITIES[settings.activePersonality] || PERSONALITIES.Normal;

  // Initialize or retrieve voice session
  const getOrCreateVoiceSession = (): VoiceSession => {
    if (sessionRef.current) return sessionRef.current;

    const newSession: VoiceSession = {
      id: `voice-session-${Date.now()}`,
      conversation_type: 'voice',
      title: `Voice Session: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      startTime: Date.now(),
      voiceIdentity: settings.activeIdentity,
      personality: settings.activePersonality,
      messages: []
    };

    sessionRef.current = newSession;
    setCurrentSession(newSession);
    saveVoiceSession(newSession);
    return newSession;
  };

  // Add voice message strictly to voice session
  const appendVoiceMessage = (msg: Omit<VoiceMessage, 'id' | 'conversation_type' | 'sessionId'>) => {
    const session = getOrCreateVoiceSession();
    const fullMsg: VoiceMessage = {
      ...msg,
      id: `vox-msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      conversation_type: 'voice',
      sessionId: session.id
    };

    const updatedSession: VoiceSession = {
      ...session,
      messages: [...session.messages, fullMsg],
      endTime: Date.now()
    };

    sessionRef.current = updatedSession;
    setCurrentSession(updatedSession);
    saveVoiceSession(updatedSession);
  };

  // Start Speech Recognition via unified native Android + Web Speech + Cloud Transcription fallback
  const startListening = async () => {
    setHasError(false);
    setErrorNotice(null);
    isCancelledRef.current = false;
    suppressContinuousOnceRef.current = false;
    stopSpeaking();
    setIsSpeaking(false);

    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
      aiAbortControllerRef.current = null;
      setIsProcessing(false);
    }

    if (captureControllerRef.current) {
      captureControllerRef.current.cancel();
      captureControllerRef.current = null;
    }

    const latestSettings = settingsRef.current;
    try {
      setStatusMessage('Preparing microphone...');
      setMicBusyForActiveSession(true);
      const controller = await startVoiceCapture({
        language: latestSettings.recognitionLanguage || 'auto',
        onStart: () => {
          setHasError(false);
          setErrorNotice(null);
          setIsListening(true);
          setTranscript('');
          setAiReplyText('');
          setStatusMessage('Listening to your voice...');
        },
        onPartial: (partialText) => {
          setTranscript(partialText);
        },
        onResult: (finalText) => {
          captureControllerRef.current = null;
          setMicBusyForActiveSession(false);
          setIsListening(false);
          setTranscript(finalText);
          if (!isCancelledRef.current && finalText.trim().length > 0) {
            handleUserVoiceInput(finalText.trim());
          }
        },
        onEmptyEnd: () => {
          captureControllerRef.current = null;
          setMicBusyForActiveSession(false);
          setIsListening(false);
          if (!isCancelledRef.current) {
            setHasError(true);
            setErrorNotice('No speech was recognized. Please speak clearly and tap the orb to try again.');
            setStatusMessage('No speech detected • Tap orb to retry');
          }
        },
        onPermissionDenied: async () => {
          captureControllerRef.current = null;
          setMicBusyForActiveSession(false);
          setIsListening(false);
          setHasError(true);
          try {
            const latestPerm = await checkMicrophonePermission();
            setMicModalState(latestPerm === 'granted' ? 'denied' : latestPerm);
          } catch {
            setMicModalState('denied');
          }
          setShowPermissionModal(true);
          setStatusMessage('Microphone permission required');
          setErrorNotice('Microphone permission is required for voice conversation.');
        },
        onError: (msg) => {
          captureControllerRef.current = null;
          setMicBusyForActiveSession(false);
          setIsListening(false);
          setHasError(true);
          setErrorNotice(msg || 'Speech recognition failed. Tap the orb to try again.');
          setStatusMessage('Recognition error • Tap orb to retry');
        }
      });

      captureControllerRef.current = controller;
    } catch (err: any) {
      setMicBusyForActiveSession(false);
      setIsListening(false);
      setHasError(true);
      setErrorNotice(err?.message || 'Microphone activation failed');
      setStatusMessage('Error • Tap orb to retry');
    }
  };

  // Check RECORD_AUDIO first; start immediately if granted, request directly if prompt (no intermediate Granted dialog)
  const ensurePermissionAndStart = async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    try {
      setHasError(false);
      setErrorNotice(null);
      try {
        const permState = await checkMicrophonePermission();
        if (permState === 'granted') {
          await startListening();
          return;
        }
        if (permState === 'prompt') {
          const reqResult = await requestMicrophonePermission();
          if (reqResult.success && reqResult.state === 'granted') {
            await startListening();
            return;
          }
          setMicModalState(reqResult.state);
          setShowPermissionModal(true);
          return;
        }
        setMicModalState(permState);
        setShowPermissionModal(true);
        return;
      } catch {}

      await startListening();
    } finally {
      isStartingRef.current = false;
    }
  };

  // Listen for wake-word auto-start and orb toggle events
  useEffect(() => {
    const onAutoStartVoice = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const cmd = typeof detail.remainingCommand === 'string' ? detail.remainingCommand.trim() : '';
      setIsSpeaking(false);
      suppressContinuousOnceRef.current = false;
      if (cmd) {
        handleUserVoiceInputRef.current(cmd);
      } else {
        ensurePermissionAndStartRef.current();
      }
    };

    const onOrbToggle = () => {
      toggleOrbStateRef.current();
    };

    window.addEventListener('zuzu-auto-start-voice', onAutoStartVoice);
    window.addEventListener('zuzu-voice-orb-toggle', onOrbToggle);
    return () => {
      window.removeEventListener('zuzu-auto-start-voice', onAutoStartVoice);
      window.removeEventListener('zuzu-voice-orb-toggle', onOrbToggle);
    };
  }, []);

  // Stop/Cancel action: stops listening, speaking, and pending AI streams immediately
  const handleCancel = () => {
    isCancelledRef.current = true;
    suppressContinuousOnceRef.current = true;
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
      aiAbortControllerRef.current = null;
    }
    if (captureControllerRef.current) {
      captureControllerRef.current.cancel();
      captureControllerRef.current = null;
    }
    setMicBusyForActiveSession(false);
    setIsListening(false);
    stopSpeaking();
    setIsSpeaking(false);
    setIsProcessing(false);
    setHasError(false);
    setErrorNotice(null);
    setStatusMessage('Voice interaction cancelled.');
    playHapticSound('listen_stop');
  };

  // Speak response using selected Gemini prebuilt voice
  const speakZuzuResponse = (
    responseText: string,
    targetIdentity: VoiceIdentity,
    onFinishCallback?: () => void
  ) => {
    const latestSettings = settingsRef.current;
    const resolved = resolveGeminiVoiceForSettings(latestSettings.geminiVoiceName, targetIdentity);
    const voiceName =
      resolved.gender === targetIdentity
        ? resolved.id
        : getDefaultGeminiVoiceForIdentity(targetIdentity).id;

    setIsSpeaking(true);
    setStatusMessage(`Speaking as ${VOICE_IDENTITIES[targetIdentity].name}...`);

    speakText({
      text: responseText,
      voiceIdentity: targetIdentity,
      voiceName,
      customGeminiKey: latestSettings.customGeminiApiKey,
      speechRate: latestSettings.speechRate,
      volume: latestSettings.volume ?? 1.0,
      onStart: () => {
        setIsSpeaking(true);
      },
      onEnd: () => {
        setIsSpeaking(false);
        setStatusMessage('Listening finished.');
        onFinishCallback?.();

        if (
          isContinuousRef.current &&
          !isCancelledRef.current &&
          !suppressContinuousOnceRef.current
        ) {
          setTimeout(() => {
            if (!isCancelledRef.current && !suppressContinuousOnceRef.current) {
              startListening();
            }
          }, 350);
        }
      },
      onError: (err) => {
        console.warn('Speech playback error:', err);
        setIsSpeaking(false);
        if (
          isContinuousRef.current &&
          !isCancelledRef.current &&
          !suppressContinuousOnceRef.current
        ) {
          setTimeout(() => {
            if (!isCancelledRef.current && !suppressContinuousOnceRef.current) {
              startListening();
            }
          }, 350);
        }
      }
    });
  };

  // Core Voice Input Processing
  const handleUserVoiceInput = async (spokenText: string) => {
    if (!spokenText.trim()) return;

    setHasError(false);
    setErrorNotice(null);
    setIsProcessing(true);
    setStatusMessage('Processing speech intent...');
    setLastSources([]);

    const currentId = activeIdentityRef.current;
    const latestSettings = settingsRef.current;

    // 0. Check "Bye Zuzu" / "Sleep Zuzu" Standby Command
    const sleepIntent = detectSleepStopIntent(spokenText, latestSettings.assistantNickname || 'Zuzu');
    if (sleepIntent.isSleepCommand) {
      suppressContinuousOnceRef.current = true;
      playHapticSound('listen_stop');
      appendVoiceMessage({
        sender: 'user',
        text: spokenText,
        timestamp: Date.now(),
        voiceIdentity: currentId
      });
      appendVoiceMessage({
        sender: 'assistant',
        text: sleepIntent.confirmationSpoken,
        timestamp: Date.now() + 80,
        voiceIdentity: currentId
      });
      setIsProcessing(false);
      setAiReplyText(sleepIntent.confirmationSpoken);
      speakZuzuResponse(sleepIntent.confirmationSpoken, currentId, () => {
        setStatusMessage('Standby mode • Say "Wake up Zuzu" anytime');
      });
      return;
    }

    // 0.5 Resolve pending reminder clarification if user answered a previous time/AM-PM prompt
    if (
      pendingClarificationRef.current &&
      Date.now() - pendingClarificationRef.current.createdAt < 3 * 60 * 1000
    ) {
      const resolved = resolvePendingReminderClarification(
        spokenText,
        pendingClarificationRef.current
      );
      pendingClarificationRef.current = resolved.pendingClarification || null;
      playHapticSound('message_sent');
      appendVoiceMessage({
        sender: 'user',
        text: spokenText,
        timestamp: Date.now(),
        voiceIdentity: currentId
      });
      appendVoiceMessage({
        sender: 'assistant',
        text: resolved.spokenConfirmation,
        timestamp: Date.now() + 80,
        voiceIdentity: currentId
      });
      setIsProcessing(false);
      setAiReplyText(resolved.spokenConfirmation);
      speakZuzuResponse(resolved.spokenConfirmation, currentId);
      return;
    }
    pendingClarificationRef.current = null;

    // 1. Check for Voice Switch Command in English or Bengali
    const switchIntent = detectVoiceSwitchIntent(spokenText, currentId);

    if (switchIntent.isSwitchCommand && switchIntent.targetIdentity) {
      const newIdentity = switchIntent.targetIdentity;
      const newVoice = getDefaultGeminiVoiceForIdentity(newIdentity).id;
      playHapticSound('switch');

      onUpdateSettings({ activeIdentity: newIdentity, geminiVoiceName: newVoice });
      activeIdentityRef.current = newIdentity;

      appendVoiceMessage({
        sender: 'user',
        text: spokenText,
        timestamp: Date.now(),
        voiceIdentity: currentId,
        isSwitchCommand: true
      });

      const confirmationText = switchIntent.confirmationSpoken;
      appendVoiceMessage({
        sender: 'assistant',
        text: confirmationText,
        timestamp: Date.now() + 100,
        voiceIdentity: newIdentity,
        audioDuration: 3
      });

      setIsProcessing(false);
      speakZuzuResponse(confirmationText, newIdentity);
      return;
    }

    if (switchIntent.isAmbiguous && switchIntent.ambiguousQuestion) {
      const clarifyText = switchIntent.ambiguousQuestion;
      appendVoiceMessage({
        sender: 'user',
        text: spokenText,
        timestamp: Date.now(),
        voiceIdentity: currentId
      });
      appendVoiceMessage({
        sender: 'assistant',
        text: clarifyText,
        timestamp: Date.now() + 100,
        voiceIdentity: currentId
      });
      setIsProcessing(false);
      speakZuzuResponse(clarifyText, currentId);
      return;
    }

    // 1.2 Natural Language Voice Command Action Intents (Apps, Notes CRUD, Reminders Lifecycle, Messages)
    const actionIntent = detectVoiceActionIntent(spokenText);
    if (actionIntent.hasActionIntent) {
      playHapticSound('message_sent');
      if (actionIntent.intentType === 'clarify_reminder' && actionIntent.pendingClarification) {
        pendingClarificationRef.current = actionIntent.pendingClarification;
      }
      if (actionIntent.requiresConfirmation && actionIntent.messageDraft) {
        setPendingMessageDraft(actionIntent.messageDraft);
      } else {
        setPendingMessageDraft(null);
      }

      appendVoiceMessage({
        sender: 'user',
        text: spokenText,
        timestamp: Date.now(),
        voiceIdentity: currentId
      });

      appendVoiceMessage({
        sender: 'assistant',
        text: actionIntent.spokenConfirmation,
        timestamp: Date.now() + 100,
        voiceIdentity: currentId,
        audioDuration: 3
      });

      setIsProcessing(false);
      setAiReplyText(actionIntent.spokenConfirmation);
      speakZuzuResponse(actionIntent.spokenConfirmation, currentId);
      return;
    }

    // Case C: Standard Voice Query / Conversation / Live Internet Search
    appendVoiceMessage({
      sender: 'user',
      text: spokenText,
      timestamp: Date.now(),
      voiceIdentity: currentId
    });

    try {
      const session = sessionRef.current;
      const historyContext = (session?.messages || []).map(m => ({
        sender: m.sender,
        text: m.text,
        usedRealtimeSearch: m.usedRealtimeSearch
      }));

      const activeMemories = latestSettings.memoryEnabled ? getMemories() : [];

      if (latestSettings.memoryEnabled) {
        const lowerVoice = spokenText.toLowerCase().trim();
        if (
          lowerVoice.startsWith('remember that') ||
          lowerVoice.startsWith('remember this') ||
          lowerVoice.startsWith('remember:') ||
          lowerVoice.startsWith('please remember') ||
          /মনে রেখো/i.test(spokenText) ||
          /মনে রাখবা/i.test(spokenText)
        ) {
          const memoryContent = spokenText
            .replace(/^(remember that|remember this|remember:|please remember|মনে রেখো|মনে রাখবা)\s*:?/i, '')
            .trim();
          if (memoryContent) {
            saveMemory({
              key: memoryContent.length > 35 ? memoryContent.slice(0, 32) + '...' : memoryContent,
              value: memoryContent,
              category: 'personal',
              source: 'learned'
            });
          }
        }
      }

      if (aiAbortControllerRef.current) {
        aiAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      aiAbortControllerRef.current = controller;

      const aiResult = await streamUnifiedAiChat({
        messages: [...historyContext, { sender: 'user', text: spokenText }],
        settings: latestSettings,
        memories: activeMemories,
        isVoiceMode: true,
        signal: controller.signal,
        onDelta: (accumulated) => {
          if (!controller.signal.aborted && !isCancelledRef.current) {
            setAiReplyText(accumulated);
          }
        }
      });

      if (controller.signal.aborted || isCancelledRef.current) {
        setIsProcessing(false);
        return;
      }

      if (aiResult.isError) {
        setIsProcessing(false);
        setHasError(true);
        setErrorNotice(aiResult.reply);
        setStatusMessage('Gemini API error • Tap orb to retry');
        if (/API Key/i.test(aiResult.reply) && onRequestApiKeyModal) {
          onRequestApiKeyModal('Voice Studio');
        }
        return;
      }

      const aiReply = aiResult.reply;
      const sources = Array.isArray(aiResult.sources) ? aiResult.sources : [];
      setLastSources(sources);

      appendVoiceMessage({
        sender: 'assistant',
        text: aiReply,
        timestamp: Date.now() + 100,
        voiceIdentity: currentId,
        usedRealtimeSearch: Boolean(aiResult.usedRealtimeSearch),
        sources: sources.length > 0 ? sources : undefined
      });

      setIsProcessing(false);
      setAiReplyText(aiReply);

      speakZuzuResponse(aiReply, currentId);
    } catch (err: any) {
      if (err?.name === 'AbortError' || isCancelledRef.current) {
        setIsProcessing(false);
        return;
      }
      setIsProcessing(false);
      setHasError(true);
      setErrorNotice(err?.message || 'Failed to get AI voice response.');
      setStatusMessage('Error • Tap orb to retry');
    } finally {
      aiAbortControllerRef.current = null;
    }
  };

  handleUserVoiceInputRef.current = handleUserVoiceInput;
  ensurePermissionAndStartRef.current = ensurePermissionAndStart;
  toggleOrbStateRef.current = () => {
    if (isListening || isSpeaking || isProcessing) handleCancel();
    else ensurePermissionAndStart();
  };

  // Toggle Continuous Listening
  const handleToggleContinuous = () => {
    const updated = !settings.continuousListening;
    onUpdateSettings({ continuousListening: updated });
    playHapticSound('message_sent');
  };

  // Manual Identity Switch Button
  const handleManualSwitch = () => {
    const target: VoiceIdentity = settings.activeIdentity === 'male' ? 'female' : 'male';
    const resolved = resolveGeminiVoiceForSettings(settings.geminiVoiceName, target);
    const nextVoice =
      resolved.gender === target ? resolved.id : getDefaultGeminiVoiceForIdentity(target).id;
    playHapticSound('switch');
    onUpdateSettings({ activeIdentity: target, geminiVoiceName: nextVoice });
    setStatusMessage(`Switched to ${VOICE_IDENTITIES[target].name}.`);
  };

  const handleOpenSourceLink = (e: React.MouseEvent, url: string) => {
    const nativePlugin = getNativeZuzuPlugin();
    if (nativePlugin?.openExternalUrl) {
      e.preventDefault();
      nativePlugin.openExternalUrl({ url }).catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    }
  };

  const currentOrbState: OrbState = isSpeaking
    ? 'speaking'
    : isProcessing
    ? 'thinking'
    : isListening
    ? 'listening'
    : hasError
    ? 'error'
    : 'idle';

  return (
    <div className="flex-1 flex flex-col h-full bg-gradient-to-b from-[#eef0fc] via-[#f5f3ff] to-[#faf8ff] text-slate-800 relative overflow-hidden select-none">
      {/* Top Controls bar within Voice View */}
      <div className="px-5 py-3.5 flex items-center justify-between z-20 border-b border-white/60 bg-white/40 backdrop-blur-md">
        <button
          onClick={handleManualSwitch}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            settings.activeIdentity === 'female'
              ? 'bg-purple-100/80 text-purple-700 border-purple-200 shadow-sm'
              : 'bg-indigo-100/80 text-indigo-700 border-indigo-200 shadow-sm'
          }`}
          title="Tap to switch identity"
        >
          <span>{settings.activeIdentity === 'female' ? '♀ Female Zuzu' : '♂ Male Zuzu'}</span>
          <Repeat className="w-3 h-3 ml-0.5 opacity-60" />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleContinuous}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 transition-all ${
              settings.continuousListening
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-sm'
                : 'bg-white/80 text-slate-600 border-slate-200'
            }`}
            title="Toggle Continuous Listening"
          >
            <Radio className={`w-3 h-3 ${settings.continuousListening ? 'animate-pulse text-emerald-600' : 'text-slate-400'}`} />
            <span>Continuous: {settings.continuousListening ? 'ON' : 'OFF'}</span>
          </button>

          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="p-1.5 rounded-full bg-white/80 hover:bg-white text-slate-600 border border-slate-200/80 shadow-sm transition-colors"
              title="Voice & Chat History"
            >
              <History className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onMinimize}
            className="p-1.5 rounded-full bg-white/80 hover:bg-white text-slate-600 border border-slate-200/80 shadow-sm transition-colors"
            title="Minimize to Floating Assistant"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Center Stage: 3D Holographic Particle Orb */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-2 relative z-10 overflow-y-auto">
        <div className="absolute w-80 h-80 rounded-full blur-3xl opacity-35 bg-gradient-to-tr from-purple-200 via-indigo-200 to-pink-200 pointer-events-none -z-0"></div>

        <div className="relative my-auto flex flex-col items-center">
          <ParticleOrb
            state={currentOrbState}
            style={settings.orbStyle}
            colorScheme={settings.orbColor}
            rotationSpeed={settings.orbRotationSpeed}
            glowIntensity={settings.orbGlowIntensity}
            particleDensity={settings.orbParticleDensity}
            size={265}
            onClick={() =>
              isListening || isSpeaking || isProcessing
                ? handleCancel()
                : ensurePermissionAndStart()
            }
          />

          <div className={`mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-sm text-xs font-semibold ${
            currentOrbState === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-white/80 border-white text-slate-700'
          }`}>
            <span
              className={`w-2 h-2 rounded-full ${
                isListening
                  ? 'bg-emerald-500 animate-ping'
                  : isSpeaking
                  ? 'bg-purple-600 animate-pulse'
                  : isProcessing
                  ? 'bg-amber-500 animate-spin'
                  : hasError
                  ? 'bg-rose-500 animate-pulse'
                  : 'bg-slate-400'
              }`}
            />
            <span className="tracking-wide">
              {isListening
                ? 'LISTENING... • TAP TO STOP'
                : isSpeaking
                ? 'SPEAKING... • TAP TO STOP'
                : isProcessing
                ? 'THINKING... • TAP TO STOP'
                : hasError
                ? 'ERROR • TAP ORB TO RETRY'
                : 'ZUZU AI ACTIVE • TAP ORB TO SPEAK'}
            </span>
          </div>

          <div className="mt-2 text-center">
            <p className="text-[11px] text-slate-500">
              Personality: <span className="font-semibold text-slate-700">{currentPersonality.name}</span>
            </p>
          </div>
        </div>

        {/* Live Transcript & Reply Box */}
        {(transcript || aiReplyText || sessionRef.current?.messages.slice(-1)[0]) && (
          <div className="w-full max-w-sm mt-3 p-3.5 bg-white/80 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm text-xs animate-fade-in space-y-1.5">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center justify-between">
              <span>Voice Conversation</span>
              <span className="text-purple-600 font-medium text-[10px]">{statusMessage}</span>
            </div>
            {transcript && (
              <p className="text-slate-600 italic line-clamp-3">
                <span className="font-bold not-italic text-purple-700">You: </span>
                "{transcript}"
              </p>
            )}
            {(aiReplyText || (!transcript && sessionRef.current?.messages.slice(-1)[0]?.text)) && (
              <p className="text-slate-800 font-medium line-clamp-5 whitespace-pre-wrap">
                {aiReplyText || sessionRef.current?.messages.slice(-1)[0]?.text || ''}
              </p>
            )}

            {lastSources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-purple-100 space-y-1.5">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-700">
                  <Globe2 className="w-3 h-3" />
                  <span>Google Search Sources</span>
                </div>
                <div className="space-y-1.5">
                  {lastSources.slice(0, 6).map((src, idx) => (
                    <a
                      key={`${src.url}-${idx}`}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => handleOpenSourceLink(e, src.url)}
                      className="block p-2 rounded-xl bg-purple-50/90 hover:bg-purple-100 border border-purple-200 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-800 line-clamp-1">
                          {src.title || src.sourceName}
                        </span>
                        <ExternalLink className="w-3 h-3 text-purple-600 flex-shrink-0 mt-0.5" />
                      </div>
                      <div className="mt-0.5 flex items-center flex-wrap gap-1.5 text-[10px]">
                        <span className="font-bold text-purple-800">{src.sourceName}</span>
                        <span className="text-slate-400">•</span>
                        <span className={src.isWithin20Min ? 'font-bold text-emerald-700' : 'text-slate-500'}>
                          {formatSourcePublicationTime(src)}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pending Message Confirmation Banner */}
        {pendingMessageDraft && (
          <div className="w-full max-w-sm mt-2.5 p-3 bg-purple-50 border border-purple-200 rounded-2xl shadow-sm flex items-center justify-between gap-2">
            <div className="min-w-0 text-xs text-purple-900">
              <div className="text-[10px] font-bold uppercase text-purple-600">
                {pendingMessageDraft.app} Draft to {pendingMessageDraft.recipient}
              </div>
              <div className="truncate font-medium">"{pendingMessageDraft.text}"</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => {
                  executeConfirmedMessageIntent(pendingMessageDraft);
                  setPendingMessageDraft(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
                <span>Send</span>
              </button>
              <button
                onClick={() => setPendingMessageDraft(null)}
                className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {errorNotice && (
          <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-2 max-w-sm w-full">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500 mt-0.5" />
              <span className="flex-1 leading-snug">{errorNotice}</span>
            </div>
            <div className="flex items-center gap-2 justify-end">
              {(/permission|denied|blocked/i.test(errorNotice) || micModalState === 'permanently_denied') && (
                <button
                  type="button"
                  onClick={() => openAndroidAppSettingsGuide()}
                  className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 text-[11px] font-bold hover:bg-rose-100 transition-colors"
                >
                  Open App Settings
                </button>
              )}
              <button
                type="button"
                onClick={() => ensurePermissionAndStart()}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors"
              >
                Retry Voice
              </button>
            </div>
          </div>
        )}

        {/* Floating Voice Assistant Controls Dock */}
        <div className="w-full max-w-xs mt-3 flex items-center justify-center gap-2.5 z-20 pb-2">
          <button
            onClick={() =>
              isListening || isSpeaking || isProcessing
                ? handleCancel()
                : ensurePermissionAndStart()
            }
            className={`flex-1 py-2.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all ${
              isListening || isSpeaking || isProcessing
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-95'
            }`}
          >
            {isListening || isSpeaking || isProcessing ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Voice Loop</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>Tap to Speak</span>
              </>
            )}
          </button>

          {(isListening || isSpeaking || isProcessing) && (
            <button
              onClick={handleCancel}
              onContextMenu={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              className="py-2.5 px-3 rounded-2xl bg-white/90 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
              title="Hold or tap to cancel assistant"
            >
              <X className="w-3.5 h-3.5 text-rose-500" />
              <span>Cancel</span>
            </button>
          )}

          <button
            onClick={onMinimize}
            className="p-2.5 rounded-2xl bg-white/90 hover:bg-white text-slate-600 border border-purple-100 shadow-xs transition-colors"
            title="Minimize to floating orb"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Android Microphone Permission Modal */}
      <MicrophonePermissionModal
        isOpen={showPermissionModal}
        initialState={micModalState}
        onClose={() => setShowPermissionModal(false)}
        onPermissionGranted={() => {
          setShowPermissionModal(false);
          startListening();
        }}
      />
    </div>
  );
};
