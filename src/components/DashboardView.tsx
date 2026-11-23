import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Monitor,
  Globe2,
  Mic,
  X,
  ChevronRight,
  ExternalLink,
  StickyNote,
  Bell,
  Send
} from 'lucide-react';
import { ActiveTab, AppSettings, SearchSourceItem, VoiceIdentity, VoiceMessage, VoiceSession } from '../types';
import {
  VOICE_IDENTITIES,
  getDefaultGeminiVoiceForIdentity,
  resolveGeminiVoiceForSettings
} from '../constants/personalities';
import { ParticleOrb, OrbState } from './ParticleOrb';
import { BengaliMarqueeWidget } from './BengaliMarqueeWidget';
import { WeatherCard } from './WeatherCard';
import { playHapticSound, speakText, stopSpeaking } from '../utils/audio';
import { checkMicrophonePermission, getNativeZuzuPlugin } from '../utils/permission';
import { MicrophonePermissionModal } from './MicrophonePermissionModal';
import {
  detectSleepStopIntent,
  detectVoiceSwitchIntent,
  detectVoiceActionIntent,
  PendingReminderClarification,
  resolvePendingReminderClarification
} from '../utils/intentDetector';
import { saveVoiceSession, getMemories, saveMemory } from '../utils/storage';
import { getPersonalizedGreeting } from '../utils/greetingHelper';
import { ScreenAssistantModal } from './ScreenAssistantModal';
import { NotesRemindersModal, getNotes, getReminders, executeConfirmedMessageIntent } from './NotesRemindersModal';
import { getReminderCategory } from '../utils/assistantStore';
import { streamUnifiedAiChat } from '../utils/apiConfig';
import { startVoiceCapture, VoiceCaptureController } from '../utils/speech';
import { setMicBusyForActiveSession } from '../utils/backgroundService';
import { formatSourcePublicationTime } from '../utils/sourceFormat';

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
  const [lastSources, setLastSources] = useState<SearchSourceItem[]>([]);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);

  // 3. Quick Action Modals
  const [showScreenModal, setShowScreenModal] = useState<boolean>(false);
  const [screenStreamActive, setScreenStreamActive] = useState<boolean>(false);
  const [showNotesModal, setShowNotesModal] = useState<boolean>(false);
  const [notesModalTab, setNotesModalTab] = useState<'notes' | 'reminders'>('notes');
  const [notesCount, setNotesCount] = useState<number>(() => getNotes().length);
  const [remindersCount, setRemindersCount] = useState<number>(() =>
    getReminders().filter((r) => getReminderCategory(r) === 'upcoming').length
  );
  const [overdueCount, setOverdueCount] = useState<number>(() =>
    getReminders().filter((r) => getReminderCategory(r) === 'overdue').length
  );
  const [pendingMessageDraft, setPendingMessageDraft] = useState<{
    recipient: string;
    text: string;
    app: 'messenger' | 'whatsapp' | 'sms';
  } | null>(null);

  // Audio & Speech Recognition Refs
  const captureControllerRef = useRef<VoiceCaptureController | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const pendingClarificationRef = useRef<PendingReminderClarification | null>(null);
  const suppressContinuousOnceRef = useRef<boolean>(false);
  const currentSessionRef = useRef<VoiceSession | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const settingsRef = useRef<AppSettings>(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const syncCounts = () => {
      const now = Date.now();
      const all = getReminders();
      setNotesCount(getNotes().length);
      setRemindersCount(all.filter((r) => getReminderCategory(r, now) === 'upcoming').length);
      setOverdueCount(all.filter((r) => getReminderCategory(r, now) === 'overdue').length);
    };
    window.addEventListener('zuzu-notes-reminders-changed', syncCounts);
    window.addEventListener('zuzu-workspace-switched', syncCounts);
    const tick = setInterval(syncCounts, 20000);
    return () => {
      clearInterval(tick);
      window.removeEventListener('zuzu-notes-reminders-changed', syncCounts);
      window.removeEventListener('zuzu-workspace-switched', syncCounts);
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

      setGreeting(getPersonalizedGreeting(settings, now));

      const rawHour = hour % 12 || 12;
      const formattedHour = String(rawHour).padStart(2, '0');
      const formattedMin = String(now.getMinutes()).padStart(2, '0');
      setTimeString(`${formattedHour}:${formattedMin}`);
      setAmPmString(hour >= 12 ? 'PM' : 'AM');

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

  // Begin live microphone speech capture cleanly
  const beginMicCapture = async () => {
    if (isCancelledRef.current) return;
    suppressContinuousOnceRef.current = false;

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

  // Immediately verify microphone permission and start listening
  const startVoiceInteraction = async () => {
    isCancelledRef.current = false;
    suppressContinuousOnceRef.current = false;
    setTranscriptText('');
    setLastAiResponse(null);
    setLastSources([]);
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
    suppressContinuousOnceRef.current = true;
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
    setLastSources([]);
    playHapticSound('message_sent');

    const currentId = latestSettings.activeIdentity;
    const nickname = (latestSettings.assistantNickname || 'Zuzu').trim();

    // 0. Check "Bye Zuzu" / "Sleep Zuzu" standby command
    const sleepIntent = detectSleepStopIntent(spoken, nickname);
    if (sleepIntent.isSleepCommand) {
      suppressContinuousOnceRef.current = true;
      setLastAiResponse(sleepIntent.confirmationSpoken);
      speakSpokenReply(sleepIntent.confirmationSpoken, currentId);
      return;
    }

    // 0.1 Resolve pending reminder clarification if open
    if (
      pendingClarificationRef.current &&
      Date.now() - pendingClarificationRef.current.createdAt < 3 * 60 * 1000
    ) {
      const resolved = resolvePendingReminderClarification(
        spoken,
        pendingClarificationRef.current
      );
      pendingClarificationRef.current = resolved.pendingClarification || null;
      setLastAiResponse(resolved.spokenConfirmation);
      speakSpokenReply(resolved.spokenConfirmation, currentId);
      return;
    }
    pendingClarificationRef.current = null;

    // 0.2 Handle Custom Assistant Nickname wake-words
    let cleanedSpoken = spoken.trim();
    const escapedNick = nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wakeRegex = new RegExp(`^(hey|hi|hello)?\\s*(${escapedNick}|zuzu|stonic)\\b[,:\\s]*`, 'i');
    if (wakeRegex.test(cleanedSpoken)) {
      const stripped = cleanedSpoken.replace(wakeRegex, '').trim();
      if (stripped.length > 0) {
        cleanedSpoken = stripped;
      }
    }

    const lowerSpoken = cleanedSpoken.toLowerCase();

    // 0.3 Check Image Creator Intent
    if (
      /create\s+(?:an?\s+)?image|generate\s+(?:an?\s+)?image|image\s+creator|draw\s+|ছবি\s*(?:বানাও|তৈরি)/i.test(lowerSpoken)
    ) {
      onNavigateTab('image_creator');
      const imgReply = 'Opening Zuzu AI Image Creator!';
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

    // 1.1 Check Natural Language Voice Action Intents (Apps, Notes CRUD, Reminders Lifecycle, Messages)
    const actionIntent = detectVoiceActionIntent(cleanedSpoken);
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
        text: m.text,
        usedRealtimeSearch: m.usedRealtimeSearch
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
      const sources = Array.isArray(aiResult.sources) ? aiResult.sources : [];
      setLastAiResponse(reply);
      setLastSources(sources);

      const aiVoiceMsg: VoiceMessage = {
        id: `vox-ai-${Date.now()}`,
        conversation_type: 'voice',
        sessionId: currentSessionRef.current?.id || 'vox',
        sender: 'assistant',
        text: reply,
        timestamp: Date.now() + 100,
        voiceIdentity: currentId,
        audioDuration: 3,
        usedRealtimeSearch: Boolean(aiResult.usedRealtimeSearch),
        sources: sources.length > 0 ? sources : undefined
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
        if (
          settingsRef.current.continuousListening &&
          !isCancelledRef.current &&
          !suppressContinuousOnceRef.current
        ) {
          setStatusText('VOICE SESSION ACTIVE');
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
      } catch {
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

  const handleOpenSourceLink = (e: React.MouseEvent, url: string) => {
    const nativePlugin = getNativeZuzuPlugin();
    if (nativePlugin?.openExternalUrl) {
      e.preventDefault();
      nativePlugin.openExternalUrl({ url }).catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5 pb-4 select-none custom-scrollbar">
      {/* 1. Greeting & Large Digital Clock */}
      <div className="text-center pt-0.5 pb-0.5">
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-100/90 text-purple-800 text-xs font-bold tracking-wide mb-1.5 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
          <span>{greeting}</span>
        </div>

        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-4xl sm:text-5xl font-black text-slate-800 tracking-tight font-sans">
            {timeString}
          </span>
          <span className="text-xs sm:text-sm font-extrabold text-purple-700 font-mono">
            {amPmString}
          </span>
        </div>

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

      {/* Single-Layer Scrolling LED Marquee */}
      <BengaliMarqueeWidget />

      {/* Spoken Transcript & AI Reply Card */}
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
                  setLastSources([]);
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
            <div className="text-xs text-slate-800 font-semibold leading-relaxed pt-1 whitespace-pre-wrap">
              {lastAiResponse}
            </div>
          )}

          {lastSources.length > 0 && (
            <div className="pt-2 border-t border-purple-100 space-y-1.5">
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
                    className="block p-2 rounded-xl bg-purple-50/80 hover:bg-purple-100/80 border border-purple-200/80 transition-colors"
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

      {/* 4. Large Rounded Weather Card */}
      <WeatherCard />

      {/* 5. Three Compact Quick Action Cards */}
      <div className="grid grid-cols-3 gap-2.5">
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
            <div className="text-left min-w-0">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>Reminders</span>
                {overdueCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 text-[9px] font-extrabold uppercase">
                    {overdueCount} Overdue
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {remindersCount} upcoming{overdueCount > 0 ? ` • ${overdueCount} overdue` : ''}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <NotesRemindersModal
        isOpen={showNotesModal}
        onClose={() => setShowNotesModal(false)}
        initialTab={notesModalTab}
      />

      <ScreenAssistantModal
        isOpen={showScreenModal}
        onClose={() => {
          setShowScreenModal(false);
          setScreenStreamActive(false);
        }}
        settings={settings}
      />

      <MicrophonePermissionModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        onPermissionGranted={() => {
          setShowPermissionModal(false);
          startVoiceInteraction();
        }}
      />
    </div>
  );
};
