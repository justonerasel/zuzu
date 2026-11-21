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
  Image as ImageIcon,
  StickyNote,
  Bell,
  Send
} from 'lucide-react';
import { ActiveTab, AppSettings, VoiceIdentity, VoiceMessage, VoiceSession } from '../types';
import {
  PERSONALITIES,
  VOICE_IDENTITIES,
  getDefaultGeminiVoiceForIdentity,
  resolveGeminiVoiceForSettings
} from '../constants/personalities';
import { ParticleOrb, OrbState } from './ParticleOrb';
import { BengaliMarqueeWidget } from './BengaliMarqueeWidget';
import { WeatherCard } from './WeatherCard';
import { playHapticSound, speakText, stopSpeaking } from '../utils/audio';
import { checkMicrophonePermission } from '../utils/permission';
import { MicrophonePermissionModal } from './MicrophonePermissionModal';
import { detectVoiceSwitchIntent, detectVoiceActionIntent } from '../utils/intentDetector';
import { saveVoiceSession, getMemories, saveMemory } from '../utils/storage';
import { getPersonalizedGreeting } from '../utils/greetingHelper';
import { FacebookAutomationModal, FacebookTaskType } from './FacebookAutomationModal';
import { ScreenAssistantModal } from './ScreenAssistantModal';
import { NotesRemindersModal, getNotes, getReminders, executeConfirmedMessageIntent } from './NotesRemindersModal';
import { streamUnifiedAiChat } from '../utils/apiConfig';
import { startVoiceCapture, VoiceCaptureController } from '../utils/speech';
import { setMicBusyForActiveSession } from '../utils/backgroundService';

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
  const [showNotesModal, setShowNotesModal] = useState<boolean>(false);
  const [notesModalTab, setNotesModalTab] = useState<'notes' | 'reminders'>('notes');
  const [notesCount, setNotesCount] = useState<number>(() => getNotes().length);
  const [remindersCount, setRemindersCount] = useState<number>(() => getReminders().filter(r => !r.completed).length);
  const [pendingMessageDraft, setPendingMessageDraft] = useState<{
    recipient: string;
    text: string;
    app: 'messenger' | 'whatsapp' | 'sms';
  } | null>(null);

  // 4. Facebook & Gallery Automation State
  const [showFacebookModal, setShowFacebookModal] = useState<boolean>(false);
  const [fbModalTask, setFbModalTask] = useState<FacebookTaskType>('search');
  const [fbModalQuery, setFbModalQuery] = useState<string>('');

  // Audio & Speech Recognition Refs
  const captureControllerRef = useRef<VoiceCaptureController | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const currentSessionRef = useRef<VoiceSession | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const settingsRef = useRef<AppSettings>(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const syncCounts = () => {
      setNotesCount(getNotes().length);
      setRemindersCount(getReminders().filter(r => !r.completed).length);
    };
    window.addEventListener('zuzu-notes-reminders-changed', syncCounts);
    return () => {
      window.removeEventListener('zuzu-notes-reminders-changed', syncCounts);
      aiAbortControllerRef.current?.abort();
      aiAbortControllerRef.current = null;
      captureControllerRef.current?.cancel();
      captureControllerRef.current = null;
      setMicBusyForActiveSession(false);
    };
  }, []);

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
  }, [
    settings.activePersonality,
    settings.gfGreetingEnabled,
    settings.gfIntensity,
    settings.userNickname,
    settings.assistantNickname,
    settings.greetingStyle,
    settings.timeBasedGreetings,
    settings.recognitionLanguage
  ]);

  // Begin live microphone speech capture cleanly (shared by post-greeting & continuous turns)
  const beginMicCapture = async () => {
    if (isCancelledRef.current) return;

    const latestSettings = settingsRef.current;
    if (!currentSessionRef.current) {
      currentSessionRef.current = {
        id: `vox-session-${Date.now()}`,
        conversation_type: 'voice',
        title: `Voice Session: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        startTime: Date.now(),
        voiceIdentity: latestSettings.activeIdentity,
        personality: latestSettings.activePersonality,
        messages: []
      };
    }

    try {
      setMicBusyForActiveSession(true);
      const controller = await startVoiceCapture({
        language: latestSettings.recognitionLanguage || 'auto',
        onStart: () => {
          setOrbState('listening');
          setStatusText('LISTENING...');
          setIsVoiceActive(true);
        },
        onPartial: (partial) => {
          setTranscriptText(partial);
        },
        onResult: (finalText) => {
          captureControllerRef.current = null;
          setMicBusyForActiveSession(false);
          setTranscriptText(finalText);
          if (!isCancelledRef.current && finalText.trim().length > 0) {
            handleProcessSpeech(finalText.trim());
          }
        },
        onEmptyEnd: () => {
          captureControllerRef.current = null;
          setMicBusyForActiveSession(false);
          setOrbState('idle');
          setStatusText('ZUZU AI OFF • TAP TO START');
          setIsVoiceActive(false);
        },
        onPermissionDenied: () => {
          captureControllerRef.current = null;
          setMicBusyForActiveSession(false);
          setShowPermissionModal(true);
          setOrbState('idle');
          setStatusText('ZUZU AI OFF • TAP TO START');
          setIsVoiceActive(false);
        },
        onError: (msg) => {
          captureControllerRef.current = null;
          setMicBusyForActiveSession(false);
          setOrbState('idle');
          setStatusText('TAP TO RETRY VOICE');
          setLastAiResponse(msg);
          setIsVoiceActive(false);
        }
      });
      captureControllerRef.current = controller;
    } catch (err: any) {
      setMicBusyForActiveSession(false);
      setIsVoiceActive(false);
      console.warn('Recognition start error:', err);
    }
  };

  // Immediately verify microphone permission and start listening (no automatic greeting speech)
  const startVoiceInteraction = async () => {
    isCancelledRef.current = false;
    setTranscriptText('');
    setLastAiResponse(null);
    stopSpeaking();

    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
      aiAbortControllerRef.current = null;
    }

    if (captureControllerRef.current) {
      captureControllerRef.current.cancel();
      captureControllerRef.current = null;
    }

    try {
      const perm = await checkMicrophonePermission();
      if (perm.state !== 'granted') {
        setShowPermissionModal(true);
        return;
      }
    } catch {}

    await beginMicCapture();
  };

  // Stop / Cancel voice interaction
  const stopVoiceInteraction = () => {
    isCancelledRef.current = true;
    setMicBusyForActiveSession(false);
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
      aiAbortControllerRef.current = null;
    }
    if (captureControllerRef.current) {
      captureControllerRef.current.cancel();
      captureControllerRef.current = null;
    }
    stopSpeaking();
    setOrbState('idle');
    setStatusText('ZUZU AI OFF • TAP TO START');
    setIsVoiceActive(false);
    playHapticSound('listen_stop');
  };

  // Handle Orb / Status button clicks with instant speech interruption
  const handleOrbTap = () => {
    if (orbState === 'speaking') {
      stopSpeaking();
      beginMicCapture();
      return;
    }
    if (isVoiceActive) {
      stopVoiceInteraction();
      return;
    }
    startVoiceInteraction();
  };

  // Process User Speech
  const handleProcessSpeech = async (spoken: string) => {
    const latestSettings = settingsRef.current;
    setOrbState('thinking');
    setStatusText('THINKING...');
    playHapticSound('message_sent');

    const currentId = latestSettings.activeIdentity;
    const nickname = (latestSettings.assistantNickname || 'Zuzu').trim();

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
      onUpdateSettings({
        activeIdentity: newIdentity,
        geminiVoiceName: getDefaultGeminiVoiceForIdentity(newIdentity).id
      });
      playHapticSound('switch');

      const confirmation = switchIntent.confirmationSpoken;
      setLastAiResponse(confirmation);
      speakSpokenReply(confirmation, newIdentity);
      return;
    }

    // 1.1 Check Natural Language Voice Action Intents
    const actionIntent = detectVoiceActionIntent(cleanedSpoken);
    if (actionIntent.hasActionIntent) {
      playHapticSound('message_sent');
      if (actionIntent.requiresConfirmation && actionIntent.messageDraft) {
        setPendingMessageDraft(actionIntent.messageDraft);
      } else {
        setPendingMessageDraft(null);
      }
      setLastAiResponse(actionIntent.spokenConfirmation);
      speakSpokenReply(actionIntent.spokenConfirmation, currentId);
      setStatusText(actionIntent.requiresConfirmation ? 'CONFIRM ACTION' : 'COMMAND EXECUTED');
      return;
    }

    // 2. Auto-extract memory intent if enabled
    const activeMemories = latestSettings.memoryEnabled ? getMemories() : [];
    if (latestSettings.memoryEnabled) {
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

    // 3. Request AI Response via fast unified Gemini streaming pipeline
    try {
      const historyContext = (currentSessionRef.current?.messages || []).map(m => ({
        sender: m.sender,
        text: m.text
      }));

      if (aiAbortControllerRef.current) {
        aiAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      aiAbortControllerRef.current = controller;

      const aiResult = await streamUnifiedAiChat({
        messages: historyContext.length > 0 ? historyContext : [{ sender: 'user', text: cleanedSpoken }],
        settings: latestSettings,
        memories: activeMemories,
        isVoiceMode: true,
        signal: controller.signal
      });

      if (controller.signal.aborted || isCancelledRef.current) {
        return;
      }

      if (aiResult.isError) {
        setLastAiResponse(aiResult.reply);
        setOrbState('idle');
        setStatusText('GEMINI API ERROR');
        setIsVoiceActive(false);
        if (/API Key/i.test(aiResult.reply) && onRequestApiKeyModal) {
          onRequestApiKeyModal('Voice Assistant');
        }
        return;
      }

      const reply = aiResult.reply;
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
      if (err?.name === 'AbortError' || isCancelledRef.current) {
        return;
      }
      setOrbState('idle');
      setStatusText('ZUZU AI OFF • TAP TO START');
      setLastAiResponse(err?.message || 'Could not reach Gemini service.');
      setIsVoiceActive(false);
    } finally {
      aiAbortControllerRef.current = null;
    }
  };

  // Speak response using configured Gemini prebuilt neural voice
  const speakSpokenReply = (textToSpeak: string, identity: VoiceIdentity) => {
    const latestSettings = settingsRef.current;
    const resolved = resolveGeminiVoiceForSettings(latestSettings.geminiVoiceName, identity);
    const voiceName =
      resolved.gender === identity ? resolved.id : getDefaultGeminiVoiceForIdentity(identity).id;

    setOrbState('speaking');
    setStatusText('SPEAKING... • TAP TO INTERRUPT');
    setIsVoiceActive(true);

    speakText({
      text: textToSpeak,
      voiceIdentity: identity,
      voiceName,
      customGeminiKey: latestSettings.customGeminiApiKey,
      speechRate: latestSettings.speechRate,
      volume: latestSettings.volume ?? 1.0,
      onStart: () => {
        setOrbState('speaking');
        setStatusText('SPEAKING... • TAP TO INTERRUPT');
      },
      onEnd: () => {
        setOrbState('idle');
        setStatusText('VOICE SESSION ACTIVE');
        if (settingsRef.current.continuousListening && !isCancelledRef.current) {
          setTimeout(() => beginMicCapture(), 350);
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

      {/* 2. 3D Particle Orb Centerpiece */}
      <div className="flex flex-col items-center justify-center relative my-1">
        <ParticleOrb
          state={orbState}
          style={settings.orbStyle}
          colorScheme={settings.orbColor}
          rotationSpeed={settings.orbRotationSpeed}
          glowIntensity={settings.orbGlowIntensity}
          particleDensity={settings.orbParticleDensity}
          onClick={handleOrbTap}
          size={255}
        />

        {/* 3. Compact Voice Status Pill */}
        <div className="mt-1 flex items-center justify-center">
          <button
            onClick={handleOrbTap}
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

          {pendingMessageDraft && (
            <div className="mt-2 p-2.5 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between gap-2">
              <div className="text-[11px] text-purple-900 min-w-0">
                <div className="font-bold uppercase text-[9px] text-purple-600">{pendingMessageDraft.app} Draft to {pendingMessageDraft.recipient}</div>
                <div className="truncate font-medium">"{pendingMessageDraft.text}"</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => {
                    executeConfirmedMessageIntent(pendingMessageDraft);
                    setPendingMessageDraft(null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold flex items-center gap-1"
                >
                  <Send className="w-3 h-3" />
                  <span>Confirm</span>
                </button>
                <button
                  onClick={() => setPendingMessageDraft(null)}
                  className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 text-[10px] font-bold"
                >
                  Cancel
                </button>
              </div>
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

      {/* 6. Notes & Reminders Access Strip */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => {
            setNotesModalTab('notes');
            setShowNotesModal(true);
          }}
          className="px-3.5 py-2.5 rounded-2xl bg-white/75 hover:bg-white/95 backdrop-blur-xl border border-white/85 shadow-xs transition-all active:scale-[0.98] flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <StickyNote className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-slate-800">Notebook</div>
              <div className="text-[10px] text-slate-500">{notesCount} saved notes</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={() => {
            setNotesModalTab('reminders');
            setShowNotesModal(true);
          }}
          className="px-3.5 py-2.5 rounded-2xl bg-white/75 hover:bg-white/95 backdrop-blur-xl border border-white/85 shadow-xs transition-all active:scale-[0.98] flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Bell className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-slate-800">Reminders</div>
              <div className="text-[10px] text-slate-500">{remindersCount} upcoming</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Notes & Reminders Modal */}
      <NotesRemindersModal
        isOpen={showNotesModal}
        onClose={() => setShowNotesModal(false)}
        initialTab={notesModalTab}
      />

      {/* Multimodal Screen Assistant Modal */}
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

      {/* Facebook & Gallery Automation Modal */}
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

