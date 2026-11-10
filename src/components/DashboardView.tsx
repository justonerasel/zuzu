import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  MessageSquare, 
  Settings, 
  Monitor, 
  Brain, 
  Globe2, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  X, 
  Minimize2, 
  ShieldCheck, 
  Check, 
  ChevronRight,
  ExternalLink,
  Share2,
  Image as ImageIcon
} from 'lucide-react';
import { ActiveTab, AppSettings, VoiceIdentity, VoiceMessage, VoiceSession } from '../types';
import { PERSONALITIES, VOICE_IDENTITIES } from '../constants/personalities';
import { ParticleOrb, OrbState } from './ParticleOrb';
import { BengaliMarqueeWidget } from './BengaliMarqueeWidget';
import { WeatherCard } from './WeatherCard';
import { playHapticSound, speakText, stopSpeaking } from '../utils/audio';
import { checkMicrophonePermission } from '../utils/permission';
import { MicrophonePermissionModal } from './MicrophonePermissionModal';
import { detectVoiceSwitchIntent, detectVoiceActionIntent } from '../utils/intentDetector';
import { saveVoiceSession, getVoiceSessions, getMemories, saveMemory } from '../utils/storage';
import { generateIntelligentAnswer } from '../utils/aiEngine';
import { getPersonalizedGreeting } from '../utils/greetingHelper';
import { FacebookAutomationModal, FacebookTaskType } from './FacebookAutomationModal';
import { ScreenAssistantModal } from './ScreenAssistantModal';

interface DashboardViewProps {
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onNavigateTab: (tab: ActiveTab) => void;
  textMessageCount: number;
  voiceSessionCount: number;
  isBackendConnected: boolean;
  onRequestApiKeyModal?: (actionName: string, onResume?: () => void) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  settings,
  onUpdateSettings,
  onNavigateTab,
  textMessageCount,
  voiceSessionCount,
  isBackendConnected,
  onRequestApiKeyModal
}) => {
  // 1. Clock and Greeting State
  const [greeting, setGreeting] = useState<string>(() => getPersonalizedGreeting(settings));
  const [timeString, setTimeString] = useState<string>('09:41');
  const [amPmString, setAmPmString] = useState<string>('AM');
  const [dayString, setDayString] = useState<string>('Wednesday');
  const [dateString, setDateString] = useState<string>('November 5');

  // 2. Voice Assistant & Particle Orb State
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [statusText, setStatusText] = useState<string>('ZUZU AI OFF • TAP TO START');
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [lastAiResponse, setLastAiResponse] = useState<string | null>(null);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);

  // 3. Quick Action Modals
  const [showScreenModal, setShowScreenModal] = useState<boolean>(false);
  const [screenStreamActive, setScreenStreamActive] = useState<boolean>(false);

  // 4. Facebook & Gallery Automation State
  const [showFacebookModal, setShowFacebookModal] = useState<boolean>(false);
  const [fbModalTask, setFbModalTask] = useState<FacebookTaskType>('search');
  const [fbModalQuery, setFbModalQuery] = useState<string>('');

  // Audio & Speech Recognition Refs
  const recognitionRef = useRef<any>(null);
  const currentSessionRef = useRef<VoiceSession | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const memoryCount = getMemories().length;

  // Real-time Clock & Greeting Effect
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hour = now.getHours();

      // Dynamic Personalized Greeting (Supports GF Mode, Intensity & Local Time)
      setGreeting(getPersonalizedGreeting(settings, now));

      // Time strings
      const rawHour = hour % 12 || 12;
      const formattedHour = String(rawHour).padStart(2, '0');
      const formattedMin = String(now.getMinutes()).padStart(2, '0');
      setTimeString(`${formattedHour}:${formattedMin}`);
      setAmPmString(hour >= 12 ? 'PM' : 'AM');

      // Date strings
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      setDayString(days[now.getDay()]);
      setDateString(`${months[now.getMonth()]} ${now.getDate()}`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [settings.activePersonality, settings.gfGreetingEnabled, settings.gfIntensity, settings.userNickname, settings.recognitionLanguage]);

  // Initialize Speech Recognition
  const initSpeechRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatusText('Speech Recognition unavailable on this browser.');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;

    // Language setting
    if (settings.recognitionLanguage === 'bn-BD') {
      recognition.lang = 'bn-BD';
    } else if (settings.recognitionLanguage === 'en-US') {
      recognition.lang = 'en-US';
    } else {
      recognition.lang = 'en-US';
    }

    recognition.onstart = () => {
      setOrbState('listening');
      setStatusText('LISTENING...');
      setIsVoiceActive(true);
      playHapticSound('listen_start');
    };

    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript;
      setTranscriptText(transcript);
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech Recognition error event:', event.error);
      if (event.error === 'not-allowed') {
        setShowPermissionModal(true);
      }
      setOrbState('idle');
      setStatusText('ZUZU AI OFF • TAP TO START');
      setIsVoiceActive(false);
      playHapticSound('listen_stop');
    };

    recognition.onend = () => {
      if (isCancelledRef.current) {
        setOrbState('idle');
        setStatusText('ZUZU AI OFF • TAP TO START');
        setIsVoiceActive(false);
        return;
      }

      // If user spoke something, process intent
      const spoken = transcriptText.trim();
      if (spoken) {
        handleProcessSpeech(spoken);
      } else {
        setOrbState('idle');
        setStatusText('ZUZU AI OFF • TAP TO START');
        setIsVoiceActive(false);
      }
    };

    return recognition;
  };

  // Start voice interaction
  const startVoiceInteraction = async () => {
    isCancelledRef.current = false;
    setTranscriptText('');
    setLastAiResponse(null);

    // Check if API key is configured (Requirement 5)
    if (!settings.customGeminiApiKey && onRequestApiKeyModal) {
      onRequestApiKeyModal('Voice Assistant', () => {
        startVoiceInteraction();
      });
      return;
    }

    // Check mic permission first
    try {
      const perm = await checkMicrophonePermission();
      if (perm.state !== 'granted') {
        setShowPermissionModal(true);
        return;
      }
    } catch {}

    // Create session container if none
    if (!currentSessionRef.current) {
      currentSessionRef.current = {
        id: `vox-session-${Date.now()}`,
        conversation_type: 'voice',
        title: `Voice Session: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        startTime: Date.now(),
        voiceIdentity: settings.activeIdentity,
        personality: settings.activePersonality,
        messages: []
      };
    }

    try {
      const rec = initSpeechRecognition();
      if (rec) {
        recognitionRef.current = rec;
        rec.start();
      }
    } catch (err: any) {
      console.warn('Recognition start error:', err);
    }
  };

  // Stop / Cancel voice interaction
  const stopVoiceInteraction = () => {
    isCancelledRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    stopSpeaking();
    setOrbState('idle');
    setStatusText('ZUZU AI OFF • TAP TO START');
    setIsVoiceActive(false);
    playHapticSound('listen_stop');
  };

  // Process User Speech
  const handleProcessSpeech = async (spoken: string) => {
    setOrbState('thinking');
    setStatusText('THINKING...');
    playHapticSound('message_sent');

    const currentId = settings.activeIdentity;
    const nickname = (settings.assistantNickname || 'Zuzu').trim();

    // 0. Handle Custom Assistant Nickname wake-words (e.g. "Hey Maya", "Maya open weather")
    let cleanedSpoken = spoken.trim();
    const escapedNick = nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wakeRegex = new RegExp(`^(hey|hi|hello)?\\s*(${escapedNick}|zuzu|stonic)\\b[,:\\s]*`, 'i');
    if (wakeRegex.test(cleanedSpoken)) {
      const stripped = cleanedSpoken.replace(wakeRegex, '').trim();
      if (stripped.length > 0) {
        cleanedSpoken = stripped;
      }
    }

    // 0.1 Check Facebook Automation Commands (Requirement 10)
    const lowerSpoken = cleanedSpoken.toLowerCase();
    if (/facebook|fb/i.test(lowerSpoken)) {
      // Check search
      if (/search|খোঁজো|খোজ/i.test(lowerSpoken)) {
        const queryMatch = cleanedSpoken.match(/(?:search\s+(?:for\s+)?|খোঁজো\s+|খোজ\s+)(.+?)(?:\s+(?:on|in)?\s+facebook|$)/i);
        const query = queryMatch ? queryMatch[1].replace(/facebook/i, '').trim() : '';
        setFbModalTask('search');
        setFbModalQuery(query);
        setShowFacebookModal(true);
        const fbReply = `Opening Facebook search for ${query || 'this person'}.`;
        setLastAiResponse(fbReply);
        speakSpokenReply(fbReply, currentId);
        return;
      }

      // Check gallery photo upload
      if (/upload|photo|gallery|ছবি|আপলোড/i.test(lowerSpoken)) {
        setFbModalTask('upload_photo');
        setShowFacebookModal(true);
        const fbReply = "Opening Gallery photo selection for your Facebook post.";
        setLastAiResponse(fbReply);
        speakSpokenReply(fbReply, currentId);
        return;
      }

      // Check comment
      if (/comment|মন্তব্য/i.test(lowerSpoken)) {
        setFbModalTask('comment');
        setShowFacebookModal(true);
        const fbReply = "Preparing your Facebook comment workflow.";
        setLastAiResponse(fbReply);
        speakSpokenReply(fbReply, currentId);
        return;
      }

      // Check like
      if (/like|লাইক/i.test(lowerSpoken)) {
        setFbModalTask('like');
        setShowFacebookModal(true);
        const fbReply = "Preparing to like post on Facebook.";
        setLastAiResponse(fbReply);
        speakSpokenReply(fbReply, currentId);
        return;
      }

      // Generic Facebook open
      setFbModalTask('search');
      setShowFacebookModal(true);
      const fbReply = "Opening Facebook Assistant.";
      setLastAiResponse(fbReply);
      speakSpokenReply(fbReply, currentId);
      return;
    }

    // 0.2 Check Image Creator Intent (Requirement 2)
    if (
      /create\s+(?:an?\s+)?image|generate\s+(?:an?\s+)?image|image\s+creator|draw\s+|ছবি\s*(?:বানাও|তৈরি)/i.test(lowerSpoken)
    ) {
      onNavigateTab('image_creator');
      const imgReply = "Opening Zuzu AI Image Creator!";
      setLastAiResponse(imgReply);
      speakSpokenReply(imgReply, currentId);
      return;
    }

    // 1. Check Voice Switch Intent
    const switchIntent = detectVoiceSwitchIntent(cleanedSpoken, currentId);
    if (switchIntent.isSwitchCommand && switchIntent.targetIdentity) {
      const newIdentity = switchIntent.targetIdentity;
      onUpdateSettings({ activeIdentity: newIdentity });
      playHapticSound('switch');

      const confirmation = switchIntent.confirmationSpoken;
      setLastAiResponse(confirmation);
      speakSpokenReply(confirmation, newIdentity);
      return;
    }

    // 1.1 Check Natural Language Voice Action Intents (Requirement 4)
    const actionIntent = detectVoiceActionIntent(cleanedSpoken);
    if (actionIntent.hasActionIntent) {
      playHapticSound('message_sent');
      setLastAiResponse(actionIntent.spokenConfirmation);
      speakSpokenReply(actionIntent.spokenConfirmation, currentId);
      setStatusText('COMMAND EXECUTED');
      return;
    }

    // 2. Auto-extract memory intent if enabled
    const activeMemories = settings.memoryEnabled ? getMemories() : [];
    if (settings.memoryEnabled) {
      const lower = cleanedSpoken.toLowerCase().trim();
      if (
        lower.startsWith('remember that') ||
        lower.startsWith('remember this') ||
        lower.startsWith('remember:') ||
        lower.startsWith('please remember') ||
        /মনে রেখো/i.test(cleanedSpoken)
      ) {
        const fact = cleanedSpoken.replace(/^(remember that|remember this|remember:|please remember|মনে রেখো)\s*:?/i, '').trim();
        if (fact) {
          saveMemory({
            key: fact.length > 35 ? fact.slice(0, 32) + '...' : fact,
            value: fact,
            category: 'personal',
            source: 'learned'
          });
        }
      }
    }

    // Record user message in Voice Session
    const userVoiceMsg: VoiceMessage = {
      id: `vox-${Date.now()}`,
      conversation_type: 'voice',
      sessionId: currentSessionRef.current?.id || 'vox',
      sender: 'user',
      text: spoken,
      timestamp: Date.now(),
      voiceIdentity: currentId
    };
    if (currentSessionRef.current) {
      currentSessionRef.current.messages.push(userVoiceMsg);
      saveVoiceSession(currentSessionRef.current);
    }

    // 3. Request AI Response from /api/chat
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ sender: 'user', text: cleanedSpoken }],
          personality: settings.activePersonality,
          voiceIdentity: currentId,
          customPersonalityPrompt: settings.customPersonalityPrompt,
          customGeminiKey: settings.customGeminiApiKey,
          customGrokApiKey: settings.customGrokApiKey,
          defaultProvider: settings.defaultAiProvider,
          aiFallbackEnabled: settings.aiFallbackEnabled,
          isVoiceMode: true,
          memories: activeMemories,
          memoryEnabled: settings.memoryEnabled,
          assistantNickname: settings.assistantNickname || 'Zuzu',
          userNickname: settings.userNickname || 'Rasel',
          gfIntensity: settings.gfIntensity || 'sweet'
        })
      });

      const data = await res.json();
      let reply = data.reply;

      if (!reply || reply.trim().length === 0) {

        reply = generateIntelligentAnswer({
          userQuestion: spoken,
          conversationHistory: [],
          personality: settings.activePersonality,
          voiceIdentity: currentId,
          customPersonalityPrompt: settings.customPersonalityPrompt,
          isVoiceMode: true,
          memories: activeMemories,
          memoryEnabled: settings.memoryEnabled
        });
      }

      setLastAiResponse(reply);

      // Record assistant voice message
      const aiVoiceMsg: VoiceMessage = {
        id: `vox-ai-${Date.now()}`,
        conversation_type: 'voice',
        sessionId: currentSessionRef.current?.id || 'vox',
        sender: 'assistant',
        text: reply,
        timestamp: Date.now() + 100,
        voiceIdentity: currentId,
        audioDuration: 3
      };
      if (currentSessionRef.current) {
        currentSessionRef.current.messages.push(aiVoiceMsg);
        saveVoiceSession(currentSessionRef.current);
      }

      speakSpokenReply(reply, currentId);
    } catch (err: any) {
      console.warn('Voice query fallback:', err);
      const fallback = generateIntelligentAnswer({
        userQuestion: spoken,
        conversationHistory: [],
        personality: settings.activePersonality,
        voiceIdentity: currentId,
        customPersonalityPrompt: settings.customPersonalityPrompt,
        isVoiceMode: true,
        memories: activeMemories,
        memoryEnabled: settings.memoryEnabled
      });
      setLastAiResponse(fallback);
      speakSpokenReply(fallback, currentId);
    }
  };

  // Speak response
  const speakSpokenReply = (textToSpeak: string, identity: VoiceIdentity) => {
    setOrbState('speaking');
    setStatusText('SPEAKING...');
    setIsVoiceActive(true);

    const voiceId =
      identity === 'female'
        ? settings.elevenLabsFemaleVoiceId
        : settings.elevenLabsMaleVoiceId;

    speakText({
      text: textToSpeak,
      voiceIdentity: identity,
      customVoiceId: voiceId,
      customApiKey: settings.customElevenLabsApiKey,
      stability: settings.stability,
      similarityBoost: settings.similarityBoost,
      speechRate: settings.speechRate,
      volume: settings.volume ?? 1.0,
      voiceStyleId: settings.selectedVoiceStyleId || settings.selectedVoiceOptionId,
      onStart: () => {
        setOrbState('speaking');
        setStatusText('SPEAKING...');
      },
      onEnd: () => {
        setOrbState('idle');
        setStatusText('VOICE SESSION ACTIVE');
        if (settings.continuousListening && !isCancelledRef.current) {
          setTimeout(() => startVoiceInteraction(), 500);
        } else {
          setIsVoiceActive(false);
          setStatusText('ZUZU AI OFF • TAP TO START');
        }
      },
      onError: () => {
        setOrbState('idle');
        setStatusText('ZUZU AI OFF • TAP TO START');
        setIsVoiceActive(false);
      }
    });
  };

  // Screen sharing / assistant handler
  const handleToggleScreenShare = async () => {
    if (screenStreamActive) {
      setScreenStreamActive(false);
      setShowScreenModal(false);
      return;
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStreamActive(true);
        setShowScreenModal(true);

        stream.getVideoTracks()[0].onended = () => {
          setScreenStreamActive(false);
        };
      } catch (err) {
        setShowScreenModal(true);
      }
    } else {
      setShowScreenModal(true);
    }
  };

  // Toggle Language between English and Bengali
  const handleToggleLanguage = () => {
    const nextLang = settings.recognitionLanguage === 'bn-BD' ? 'en-US' : 'bn-BD';
    playHapticSound('switch');
    onUpdateSettings({ recognitionLanguage: nextLang });
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5 pb-4 select-none custom-scrollbar">
      {/* 1. Greeting & Large Digital Clock */}
      <div className="text-center pt-0.5 pb-0.5">
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-100/90 text-purple-800 text-xs font-bold tracking-wide mb-1.5 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
          <span>{greeting}</span>
        </div>

        {/* Large Digital Clock */}
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-4xl sm:text-5xl font-black text-slate-800 tracking-tight font-sans">
            {timeString}
          </span>
          <span className="text-xs sm:text-sm font-extrabold text-purple-700 font-mono">
            {amPmString}
          </span>
        </div>

        {/* Day & Date */}
        <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
          <span>{dayString}</span>
          <span className="mx-1.5 opacity-40">•</span>
          <span>{dateString}</span>
        </div>
      </div>

      {/* 2. Brand-New 4-Style 3D Particle Orb Centerpiece (Requirement 1 & 2) */}
      <div className="flex flex-col items-center justify-center relative my-1">
        <ParticleOrb
          state={orbState}
          style={settings.orbStyle}
          colorScheme={settings.orbColor}
          rotationSpeed={settings.orbRotationSpeed}
          glowIntensity={settings.orbGlowIntensity}
          particleDensity={settings.orbParticleDensity}
          onClick={isVoiceActive ? stopVoiceInteraction : startVoiceInteraction}
          size={215}
        />

        {/* 3. Compact Voice Status Pill */}
        <div className="mt-1 flex items-center justify-center">
          <button
            onClick={isVoiceActive ? stopVoiceInteraction : startVoiceInteraction}
            className={`px-4 py-1.5 rounded-full text-[11px] font-bold font-mono tracking-wider transition-all duration-300 flex items-center gap-2 shadow-sm border ${
              orbState === 'listening'
                ? 'bg-cyan-50 border-cyan-300 text-cyan-800 shadow-cyan-200/50 scale-105'
                : orbState === 'speaking'
                ? 'bg-pink-50 border-pink-300 text-pink-800 shadow-pink-200/50 scale-105'
                : orbState === 'thinking'
                ? 'bg-purple-100 border-purple-300 text-purple-800 shadow-purple-200/50 scale-105'
                : 'bg-white/80 hover:bg-white border-purple-200/80 text-purple-900 shadow-purple-900/5'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                orbState === 'listening'
                  ? 'bg-cyan-500 animate-ping'
                  : orbState === 'speaking'
                  ? 'bg-pink-500 animate-pulse'
                  : orbState === 'thinking'
                  ? 'bg-purple-600 animate-spin'
                  : 'bg-purple-400'
              }`}
            />
            <span>{statusText}</span>
          </button>
        </div>
      </div>

      {/* Single-Layer Scrolling LED Marquee for Today's Date & Special Events in Bengali */}
      <BengaliMarqueeWidget />

      {/* Spoken Transcript & AI Reply Card (when active or recently spoken) */}
      {(transcriptText || lastAiResponse) && (
        <div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-white/90 p-3.5 shadow-md shadow-purple-900/5 space-y-2 animate-fade-in relative">
          <div className="flex items-center justify-between border-b border-purple-100/60 pb-1.5">
            <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider flex items-center gap-1">
              <Mic className="w-3 h-3 text-purple-600" />
              <span>Voice Interaction</span>
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => onNavigateTab('voice')}
                className="text-[10px] text-purple-700 hover:text-purple-900 font-bold px-1.5 py-0.5 rounded hover:bg-purple-50"
                title="Expand Voice Studio"
              >
                Expand
              </button>
              <button
                onClick={() => {
                  setTranscriptText('');
                  setLastAiResponse(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {transcriptText && (
            <div className="text-xs text-slate-600 font-medium italic">
              "{transcriptText}"
            </div>
          )}

          {lastAiResponse && (
            <div className="text-xs text-slate-800 font-semibold leading-relaxed pt-1">
              {lastAiResponse}
            </div>
          )}
        </div>
      )}

      {/* 4. Large Rounded Weather Card (Requirement 6) */}
      <WeatherCard />

      {/* 5. Three Compact Quick Action Cards (Requirement 7) */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* A. Screen Card */}
        <button
          onClick={handleToggleScreenShare}
          className={`p-2.5 rounded-2xl bg-white/70 hover:bg-white/90 backdrop-blur-xl border border-white/80 shadow-xs transition-all active:scale-95 text-left flex flex-col justify-between h-20 group ${
            screenStreamActive ? 'ring-2 ring-purple-500 bg-purple-50/80' : ''
          }`}
        >
          <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
            <Monitor className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">Screen</div>
            <div className="text-[10px] text-slate-500 font-medium truncate">
              {screenStreamActive ? 'Active Stream' : 'Assistant'}
            </div>
          </div>
        </button>

        {/* B. Image Creator Card */}
        <button
          onClick={() => {
            playHapticSound('switch');
            onNavigateTab('image_creator');
          }}
          className="p-2.5 rounded-2xl bg-white/70 hover:bg-white/90 backdrop-blur-xl border border-white/80 shadow-xs transition-all active:scale-95 text-left flex flex-col justify-between h-20 group"
          title="Open AI Image Creator"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">Image Creator</div>
            <div className="text-[10px] text-pink-600 font-semibold truncate">
              Gemini Vision
            </div>
          </div>
        </button>

        {/* C. Language Card */}
        <button
          onClick={handleToggleLanguage}
          className="p-2.5 rounded-2xl bg-white/70 hover:bg-white/90 backdrop-blur-xl border border-white/80 shadow-xs transition-all active:scale-95 text-left flex flex-col justify-between h-20 group"
          title="Tap to toggle language"
        >
          <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
            <Globe2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">Language</div>
            <div className="text-[10px] text-sky-700 font-semibold truncate">
              {settings.recognitionLanguage === 'bn-BD' ? 'বাংলা (BN)' : 'English (US)'}
            </div>
          </div>
        </button>
      </div>

      {/* Multimodal Screen Assistant Modal (Requirement 7) */}
      <ScreenAssistantModal
        isOpen={showScreenModal}
        onClose={() => {
          setShowScreenModal(false);
          setScreenStreamActive(false);
        }}
        settings={settings}
      />

      {/* Microphone Permission Modal */}
      <MicrophonePermissionModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        onPermissionGranted={() => {
          setShowPermissionModal(false);
          startVoiceInteraction();
        }}
      />

      {/* Facebook & Gallery Automation Modal (Requirement 10) */}
      <FacebookAutomationModal
        isOpen={showFacebookModal}
        onClose={() => setShowFacebookModal(false)}
        initialTask={fbModalTask}
        initialQuery={fbModalQuery}
        settings={settings}
      />
    </div>
  );
};

