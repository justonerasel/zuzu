import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Square, 
  Minimize2, 
  Sparkles, 
  Volume2, 
  Repeat, 
  Radio, 
  AlertCircle,
  HelpCircle,
  ChevronDown,
  X,
  History,
  Send
} from 'lucide-react';
import { AppSettings, VoiceIdentity, VoiceMessage, VoiceSession } from '../types';
import {
  PERSONALITIES,
  VOICE_IDENTITIES,
  getDefaultGeminiVoiceForIdentity,
  resolveGeminiVoiceForSettings
} from '../constants/personalities';
import { detectVoiceSwitchIntent, detectVoiceActionIntent } from '../utils/intentDetector';
import { playHapticSound, speakText, stopSpeaking } from '../utils/audio';
import { saveVoiceSession, getMemories, saveMemory } from '../utils/storage';
import { checkMicrophonePermission } from '../utils/permission';
import { MicrophonePermissionModal } from './MicrophonePermissionModal';
import { executeConfirmedMessageIntent } from './NotesRemindersModal';
import { streamUnifiedAiChat } from '../utils/apiConfig';
import { startVoiceCapture, VoiceCaptureController } from '../utils/speech';
import { ParticleOrb, OrbState } from './ParticleOrb';
import { setMicBusyForActiveSession } from '../utils/backgroundService';

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
  const [transcript, setTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('Tap microphone to start voice session');
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [pendingMessageDraft, setPendingMessageDraft] = useState<{
    recipient: string;
    text: string;
    app: 'messenger' | 'whatsapp' | 'sms';
  } | null>(null);

  const captureControllerRef = useRef<VoiceCaptureController | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const isContinuousRef = useRef(settings.continuousListening);
  const activeIdentityRef = useRef(settings.activeIdentity);
  const settingsRef = useRef(settings);
  const sessionRef = useRef(currentSession);
  const isCancelledRef = useRef(false);
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

  const currentIdentityConfig = VOICE_IDENTITIES[settings.activeIdentity];
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

  // Start Speech Recognition via unified native Android + Web Speech controller
  const startListening = async () => {
    setErrorNotice(null);
    isCancelledRef.current = false;
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
      setMicBusyForActiveSession(true);
      const controller = await startVoiceCapture({
        language: latestSettings.recognitionLanguage || 'auto',
        onStart: () => {
          setIsListening(true);
          setTranscript('');
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
          setTranscript('');
          if (!isCancelledRef.current) {
            setStatusMessage('No speech detected. Tap orb to speak again.');
          }
        },
        onPermissionDenied: () => {
          captureControllerRef.current = null;
          setMicBusyForActiveSession(false);
          setIsListening(false);
          setShowPermissionModal(true);
          setErrorNotice('Microphone permission is required for voice conversation.');
        },
        onError: (msg) => {
          captureControllerRef.current = null;
          setMicBusyForActiveSession(false);
          setIsListening(false);
          setErrorNotice(msg);
          setStatusMessage('Tap microphone to try again');
        }
      });

      captureControllerRef.current = controller;
    } catch (err: any) {
      setMicBusyForActiveSession(false);
      setIsListening(false);
      setErrorNotice(err?.message || 'Microphone activation failed');
    }
  };

  // Verify microphone permission and immediately open microphone listening (no automatic greeting speech)
  const ensurePermissionAndStart = async () => {
    try {
      const perm = await checkMicrophonePermission();
      if (perm.state !== 'granted') {
        setShowPermissionModal(true);
        return;
      }
    } catch {}

    await startListening();
  };

  // Listen for wake-word auto-start and orb toggle events
  useEffect(() => {
    const onAutoStartVoice = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const cmd = typeof detail.remainingCommand === 'string' ? detail.remainingCommand.trim() : '';
      setIsSpeaking(false);
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

  // Stop listening
  const stopListening = () => {
    if (captureControllerRef.current) {
      captureControllerRef.current.stop();
    }
    setMicBusyForActiveSession(false);
    setIsListening(false);
    playHapticSound('listen_stop');
  };

  // Interrupt active AI speaking immediately and start listening for the user's next turn
  const interruptSpeechAndListen = () => {
    stopSpeaking();
    setIsSpeaking(false);
    ensurePermissionAndStart();
  };

  // Cancel action: stops everything immediately
  const handleCancel = () => {
    isCancelledRef.current = true;
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

        // Continuous listening: restart listening after speaking finishes
        if (isContinuousRef.current && !isCancelledRef.current) {
          setTimeout(() => {
            if (!isCancelledRef.current) {
              startListening();
            }
          }, 350);
        }
      },
      onError: (err) => {
        console.warn('Speech playback error:', err);
        setIsSpeaking(false);
        if (isContinuousRef.current && !isCancelledRef.current) {
          setTimeout(() => startListening(), 350);
        }
      }
    });
  };

  // Core Voice Input Processing & Identity Switching Logic
  const handleUserVoiceInput = async (spokenText: string) => {
    if (!spokenText.trim()) return;

    setIsProcessing(true);
    setStatusMessage('Processing speech intent...');

    const currentId = activeIdentityRef.current;

    // 1. Check for Voice Switch Command in English or Bengali
    const switchIntent = detectVoiceSwitchIntent(spokenText, currentId);

    // Case A: Unambiguous Switch Command Detected
    if (switchIntent.isSwitchCommand && switchIntent.targetIdentity) {
      const newIdentity = switchIntent.targetIdentity;
      const newVoice = getDefaultGeminiVoiceForIdentity(newIdentity).id;
      playHapticSound('switch');

      // Update active identity & matching Gemini voice in state and storage
      onUpdateSettings({ activeIdentity: newIdentity, geminiVoiceName: newVoice });
      activeIdentityRef.current = newIdentity;

      // Save user switch command to Voice History
      appendVoiceMessage({
        sender: 'user',
        text: spokenText,
        timestamp: Date.now(),
        voiceIdentity: currentId,
        isSwitchCommand: true
      });

      // Confirmation response to be spoken by NEW identity
      const confirmationText = switchIntent.confirmationSpoken;

      // Save assistant confirmation to Voice History
      appendVoiceMessage({
        sender: 'assistant',
        text: confirmationText,
        timestamp: Date.now() + 100,
        voiceIdentity: newIdentity,
        audioDuration: 3
      });

      setIsProcessing(false);

      // Speak using the NEW identity's Gemini neural voice
      speakZuzuResponse(confirmationText, newIdentity);
      return;
    }

    // Case B: Ambiguous command detected (ask confirmation)
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

    // 1.2 Natural Language Voice Command Action Intents
    const actionIntent = detectVoiceActionIntent(spokenText);
    if (actionIntent.hasActionIntent) {
      playHapticSound('message_sent');
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
      speakZuzuResponse(actionIntent.spokenConfirmation, currentId);
      return;
    }

    // Case C: Standard Voice Query / Conversation
    const latestSettings = settingsRef.current;
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
        text: m.text
      }));

      const activeMemories = latestSettings.memoryEnabled ? getMemories() : [];

      // Auto-extract voice memory instruction if spoken
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

      // Call fast unified Gemini streaming pipeline
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
        signal: controller.signal
      });

      if (controller.signal.aborted || isCancelledRef.current) {
        setIsProcessing(false);
        return;
      }

      if (aiResult.isError) {
        setIsProcessing(false);
        setErrorNotice(aiResult.reply);
        setStatusMessage('Gemini API error');
        if (/API Key/i.test(aiResult.reply) && onRequestApiKeyModal) {
          onRequestApiKeyModal('Voice Studio');
        }
        return;
      }

      const aiReply = aiResult.reply;

      // Save AI voice response to Voice History
      appendVoiceMessage({
        sender: 'assistant',
        text: aiReply,
        timestamp: Date.now() + 100,
        voiceIdentity: currentId
      });

      setIsProcessing(false);
      setTranscript('');

      // Speak the response using the active identity's Gemini voice
      speakZuzuResponse(aiReply, currentId);
    } catch (err: any) {
      if (err?.name === 'AbortError' || isCancelledRef.current) {
        setIsProcessing(false);
        return;
      }
      setIsProcessing(false);
      setErrorNotice(err?.message || 'Failed to get AI voice response.');
    } finally {
      aiAbortControllerRef.current = null;
    }
  };

  handleUserVoiceInputRef.current = handleUserVoiceInput;
  ensurePermissionAndStartRef.current = ensurePermissionAndStart;
  toggleOrbStateRef.current = () => {
    if (isListening) stopListening();
    else if (isSpeaking) interruptSpeechAndListen();
    else if (isProcessing) handleCancel();
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

  // Dynamic visualizer bars
  const currentOrbState: OrbState = isSpeaking ? 'speaking' : isProcessing ? 'thinking' : isListening ? 'listening' : 'idle';

  return (
    <div className="flex-1 flex flex-col h-full bg-gradient-to-b from-[#eef0fc] via-[#f5f3ff] to-[#faf8ff] text-slate-800 relative overflow-hidden select-none">
      {/* Top Controls bar within Voice View */}
      <div className="px-5 py-3.5 flex items-center justify-between z-20 border-b border-white/60 bg-white/40 backdrop-blur-md">
        {/* Identity Selector Pill */}
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
          {/* Continuous Listening Toggle */}
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

          {/* Minimize Button */}
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
        {/* Subtle Ambient Radial Glow */}
        <div className="absolute w-80 h-80 rounded-full blur-3xl opacity-35 bg-gradient-to-tr from-purple-200 via-indigo-200 to-pink-200 pointer-events-none -z-0"></div>

        {/* 3D Interactive Dot/Particle Orb */}
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
              isListening
                ? stopListening()
                : isSpeaking
                ? interruptSpeechAndListen()
                : isProcessing
                ? handleCancel()
                : ensurePermissionAndStart()
            }
          />

          {/* Status Pill below Orb */}
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 border border-white shadow-sm text-xs font-semibold text-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                isListening
                  ? 'bg-emerald-500 animate-ping'
                  : isSpeaking
                  ? 'bg-purple-600 animate-pulse'
                  : isProcessing
                  ? 'bg-amber-500 animate-spin'
                  : 'bg-slate-400'
              }`}
            />
            <span className="tracking-wide">
              {isListening
                ? 'LISTENING... • TAP TO STOP'
                : isSpeaking
                ? 'SPEAKING... • TAP TO INTERRUPT'
                : isProcessing
                ? 'THINKING...'
                : 'ZUZU AI ACTIVE • TAP ORB TO SPEAK'}
            </span>
          </div>

          {/* Personality & Voice Tag */}
          <div className="mt-2 text-center">
            <p className="text-[11px] text-slate-500">
              Personality: <span className="font-semibold text-slate-700">{currentPersonality.name}</span>
            </p>
          </div>
        </div>

        {/* Live Transcript Box */}
        {(transcript || sessionRef.current?.messages.slice(-1)[0]) && (
          <div className="w-full max-w-sm mt-3 p-3.5 bg-white/80 backdrop-blur-md rounded-2xl border border-white/80 shadow-sm text-xs animate-fade-in">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Live Transcript</span>
              <span className="text-purple-600 font-medium text-[10px]">Active Session</span>
            </div>
            <p className="text-slate-700 italic line-clamp-3">
              "{transcript || sessionRef.current?.messages.slice(-1)[0]?.text || ''}"
            </p>
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

        {/* Error notification if mic blocked */}
        {errorNotice && (
          <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 max-w-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
            <span>{errorNotice}</span>
          </div>
        )}

        {/* Floating Voice Assistant Controls Dock (Cancel FAB & Quick Controls) */}
        <div className="w-full max-w-xs mt-3 flex items-center justify-center gap-2.5 z-20 pb-2">
          {/* Main Voice Toggle */}
          <button
            onClick={() =>
              isListening
                ? stopListening()
                : isSpeaking
                ? interruptSpeechAndListen()
                : isProcessing
                ? handleCancel()
                : ensurePermissionAndStart()
            }
            className={`flex-1 py-2.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all ${
              isListening
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-95'
            }`}
          >
            {isListening ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Listening</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>Tap to Speak</span>
              </>
            )}
          </button>

          {/* Hold or Tap-to-Cancel FAB */}
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

          {/* Quick Minimize */}
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
        onClose={() => setShowPermissionModal(false)}
        onPermissionGranted={() => {
          setShowPermissionModal(false);
          ensurePermissionAndStart();
        }}
      />
    </div>
  );
};
