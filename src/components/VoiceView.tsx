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
  X
} from 'lucide-react';
import { AppSettings, VoiceIdentity, VoiceMessage, VoiceSession } from '../types';
import { PERSONALITIES, VOICE_IDENTITIES } from '../constants/personalities';
import { detectVoiceSwitchIntent } from '../utils/intentDetector';
import { playHapticSound, speakText, stopSpeaking } from '../utils/audio';
import { saveVoiceSession, getVoiceSessions, getMemories, saveMemory } from '../utils/storage';
import { checkMicrophonePermission } from '../utils/permission';
import { MicrophonePermissionModal } from './MicrophonePermissionModal';
import { generateIntelligentAnswer } from '../utils/aiEngine';
import { ParticleOrb, OrbState } from './ParticleOrb';

interface VoiceViewProps {
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onMinimize: () => void;
  currentSession: VoiceSession | null;
  setCurrentSession: React.Dispatch<React.SetStateAction<VoiceSession | null>>;
}

export const VoiceView: React.FC<VoiceViewProps> = ({
  settings,
  onUpdateSettings,
  onMinimize,
  currentSession,
  setCurrentSession
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('Tap microphone to start voice session');
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  const recognitionRef = useRef<any>(null);
  const isContinuousRef = useRef(settings.continuousListening);
  const activeIdentityRef = useRef(settings.activeIdentity);
  const sessionRef = useRef(currentSession);
  const isCancelledRef = useRef(false);

  // Sync refs with latest props
  useEffect(() => {
    isContinuousRef.current = settings.continuousListening;
  }, [settings.continuousListening]);

  useEffect(() => {
    activeIdentityRef.current = settings.activeIdentity;
  }, [settings.activeIdentity]);

  useEffect(() => {
    sessionRef.current = currentSession;
  }, [currentSession]);

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

  // Start Speech Recognition
  const startListening = () => {
    setErrorNotice(null);
    isCancelledRef.current = false;
    stopSpeaking();

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setErrorNotice('Speech Recognition not supported in this browser. Please use Chrome/Edge or modern Android WebView.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognitionClass();
      recognitionRef.current = recognition;

      recognition.continuous = false; // We manage continuous turns ourselves
      recognition.interimResults = true;

      // Select language based on settings
      if (settings.recognitionLanguage === 'bn-BD') {
        recognition.lang = 'bn-BD';
      } else if (settings.recognitionLanguage === 'en-US') {
        recognition.lang = 'en-US';
      } else {
        // Auto / bilingual default
        recognition.lang = 'en-US';
      }

      recognition.onstart = () => {
        setIsListening(true);
        setStatusMessage(`Listening to your voice...`);
        playHapticSound('listen_start');
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition event error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setShowPermissionModal(true);
          setErrorNotice('Android microphone permission is required for voice conversation.');
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setErrorNotice(`Microphone error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (isCancelledRef.current) return;

        // Process final captured transcript
        if (transcript.trim().length > 0) {
          handleUserVoiceInput(transcript.trim());
          setTranscript('');
        } else if (isContinuousRef.current && !isSpeaking && !isProcessing) {
          // If no speech captured but continuous listening is active, restart gracefully
          setStatusMessage('Ready for next command...');
        }
      };

      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
      setErrorNotice(err.message || 'Microphone activation failed');
    }
  };

  // Check microphone permission before initiating speech recognition
  const ensurePermissionAndStart = async () => {
    try {
      const perm = await checkMicrophonePermission();
      if (perm.state !== 'granted') {
        setShowPermissionModal(true);
        return;
      }
      startListening();
    } catch {
      startListening();
    }
  };

  // Stop listening
  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
    playHapticSound('listen_stop');
  };

  // Cancel action: stops everything immediately
  const handleCancel = () => {
    isCancelledRef.current = true;
    stopListening();
    stopSpeaking();
    setIsSpeaking(false);
    setIsProcessing(false);
    setStatusMessage('Voice interaction cancelled.');
    playHapticSound('listen_stop');
  };

  // Speak with active or switched identity
  const speakZuzuResponse = (
    responseText: string,
    targetIdentity: VoiceIdentity,
    onFinishCallback?: () => void
  ) => {
    setIsSpeaking(true);
    setStatusMessage(`Speaking as ${VOICE_IDENTITIES[targetIdentity].name}...`);

    const voiceId =
      targetIdentity === 'female'
        ? settings.elevenLabsFemaleVoiceId
        : settings.elevenLabsMaleVoiceId;

    speakText({
      text: responseText,
      voiceIdentity: targetIdentity,
      customVoiceId: voiceId,
      customApiKey: settings.customElevenLabsApiKey,
      stability: settings.stability,
      similarityBoost: settings.similarityBoost,
      speechRate: settings.speechRate,
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
          }, 400);
        }
      },
      onError: (err) => {
        console.warn('Speech playback error:', err);
        setIsSpeaking(false);
        if (isContinuousRef.current && !isCancelledRef.current) {
          setTimeout(() => startListening(), 400);
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
      playHapticSound('switch');

      // Update active identity preference in state and storage
      onUpdateSettings({ activeIdentity: newIdentity });
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

      // Speak using the NEW identity's ElevenLabs voice!
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

    // Case C: Standard Voice Query / Conversation
    // Save user voice query strictly to Voice History
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

      const activeMemories = settings.memoryEnabled ? getMemories() : [];

      // Auto-extract voice memory instruction if spoken
      if (settings.memoryEnabled) {
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

      // Call Gemini AI backend
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...historyContext, { sender: 'user', text: spokenText }],
          personality: settings.activePersonality,
          voiceIdentity: currentId,
          customPersonalityPrompt: settings.customPersonalityPrompt,
          customGeminiKey: settings.customGeminiApiKey,
          isVoiceMode: true, // Spoken response optimization
          memories: activeMemories,
          memoryEnabled: settings.memoryEnabled
        })
      });

      const data = await res.json();
      let aiReply = data.reply;

      if (!aiReply || aiReply.trim().length === 0) {
        aiReply = generateIntelligentAnswer({
          userQuestion: spokenText,
          conversationHistory: historyContext,
          personality: settings.activePersonality,
          voiceIdentity: currentId,
          customPersonalityPrompt: settings.customPersonalityPrompt,
          isVoiceMode: true,
          memories: activeMemories,
          memoryEnabled: settings.memoryEnabled
        });
      }

      // Save AI voice response to Voice History
      appendVoiceMessage({
        sender: 'assistant',
        text: aiReply,
        timestamp: Date.now() + 100,
        voiceIdentity: currentId
      });

      setIsProcessing(false);

      // Speak the response using the active identity's voice
      speakZuzuResponse(aiReply, currentId);
    } catch (err: any) {
      console.warn('Voice Assistant Query Network Fallback:', err);
      setIsProcessing(false);
      const activeMemories = settings.memoryEnabled ? getMemories() : [];
      const fallbackReply = generateIntelligentAnswer({
        userQuestion: spokenText,
        conversationHistory: (sessionRef.current?.messages || []).map(m => ({ sender: m.sender, text: m.text })),
        personality: settings.activePersonality,
        voiceIdentity: currentId,
        customPersonalityPrompt: settings.customPersonalityPrompt,
        isVoiceMode: true,
        memories: activeMemories,
        memoryEnabled: settings.memoryEnabled
      });

      appendVoiceMessage({
        sender: 'assistant',
        text: fallbackReply,
        timestamp: Date.now() + 100,
        voiceIdentity: currentId
      });
      speakZuzuResponse(fallbackReply, currentId);
    }
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
    playHapticSound('switch');
    onUpdateSettings({ activeIdentity: target });
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

        {/* 3D Particle Orb */}
        <div className="relative my-auto flex flex-col items-center">
          <ParticleOrb
            state={currentOrbState}
            style={settings.orbStyle}
            colorScheme={settings.orbColor}
            rotationSpeed={settings.orbRotationSpeed}
            glowIntensity={settings.orbGlowIntensity}
            particleDensity={settings.orbParticleDensity}
            size={220}
            onClick={isListening ? stopListening : ensurePermissionAndStart}
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
                ? 'SPEAKING... • TAP TO PAUSE'
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
            onClick={isListening ? stopListening : ensurePermissionAndStart}
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
          startListening();
        }}
      />
    </div>
  );
};
