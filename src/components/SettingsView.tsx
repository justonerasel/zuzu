import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Volume2, 
  ShieldCheck, 
  Key, 
  Sparkles, 
  Check, 
  RotateCcw, 
  Play, 
  Globe2, 
  Smartphone, 
  FileText,
  UserCheck,
  CheckCircle2,
  Mic,
  Cpu,
  Trash2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  Gauge,
  Brain,
  Plus,
  Edit2,
  X,
  Bookmark,
  User,
  ChevronRight,
  ChevronLeft,
  Smile,
  Activity,
  Palette,
  Lock,
  Code2,
  Heart,
  Bot,
  Search,
  Zap,
  Disc,
  Layers,
  Sparkle,
  Radio,
  MapPin,
  GraduationCap,
  Github,
  Camera,
  Phone,
  RefreshCw,
  Sliders,
  Eye,
  EyeOff,
  VolumeX,
  Moon
} from 'lucide-react';
import { 
  AppSettings, 
  PersonalityId, 
  VoiceIdentity, 
  UserMemory, 
  MemoryCategory,
  OrbStyleId,
  OrbColorScheme,
  OrbRotationSpeed,
  OrbGlowIntensity,
  OrbParticleDensity,
  ThemePresetId,
  GfIntensity
} from '../types';
import { PERSONALITIES, VOICE_IDENTITIES, VOICE_STYLE_OPTIONS, VOICE_MODELS } from '../constants/personalities';

import { 
  DEFAULT_SETTINGS, 
  clearChatHistory, 
  clearVoiceHistory, 
  getChatMessages, 
  getVoiceSessions,
  getMemories,
  saveMemory,
  updateMemory,
  deleteMemory,
  clearAllMemories
} from '../utils/storage';
import { speakText, stopSpeaking, playHapticSound } from '../utils/audio';
import { apiFetch, validateAiKey } from '../utils/apiConfig';
import { 
  PERMISSION_DEFINITIONS, 
  PermissionDefinition, 
  PermissionStatusState, 
  PermissionCategoryId,
  checkAllPermissions, 
  handlePermissionAction, 
  openAndroidSettings,
  openAndroidAppSettingsGuide, 
  checkMicrophonePermission, 
  requestMicrophonePermission, 
  MicrophonePermissionState 
} from '../utils/permission';
import { ParticleOrb, OrbState } from './ParticleOrb';
import { THEME_PRESETS, isValidHexColor, getThemeDetails } from '../utils/theme';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
}

export type SettingsCategoryId = 
  | 'profile'
  | 'zuzu_ai'
  | 'voice_speech'
  | 'personality'
  | 'orb_animation'
  | 'theme'
  | 'permissions'
  | 'about_developer';

interface CategoryCardInfo {
  id: SettingsCategoryId;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  badge?: string;
  colorTheme: {
    bg: string;
    border: string;
    iconBg: string;
    iconColor: string;
    pillBg: string;
    pillColor: string;
  };
}

const CATEGORIES: CategoryCardInfo[] = [
  {
    id: 'profile',
    title: 'Profile & Identity',
    subtitle: 'User profile, assistant nickname & language preferences',
    icon: User,
    badge: 'User',
    colorTheme: {
      bg: 'bg-purple-50/70 hover:bg-purple-50',
      border: 'border-purple-200/80',
      iconBg: 'bg-purple-100 text-purple-700',
      iconColor: 'text-purple-600',
      pillBg: 'bg-purple-100/80',
      pillColor: 'text-purple-700'
    }
  },
  {
    id: 'zuzu_ai',
    title: 'Zuzu AI',
    subtitle: 'Google Gemini, xAI Grok & persistent memory',
    icon: Brain,
    badge: 'Core AI',
    colorTheme: {
      bg: 'bg-blue-50/70 hover:bg-blue-50',
      border: 'border-blue-200/80',
      iconBg: 'bg-blue-100 text-blue-700',
      iconColor: 'text-blue-600',
      pillBg: 'bg-blue-100/80',
      pillColor: 'text-blue-700'
    }
  },
  {
    id: 'voice_speech',
    title: 'Voice Identity & Expression',
    subtitle: 'Personalize how Zuzu sounds and speaks.',
    icon: Volume2,
    badge: 'Audio & Live',
    colorTheme: {
      bg: 'bg-emerald-50/70 hover:bg-emerald-50',
      border: 'border-emerald-200/80',
      iconBg: 'bg-emerald-100 text-emerald-700',
      iconColor: 'text-emerald-600',
      pillBg: 'bg-emerald-100/80',
      pillColor: 'text-emerald-700'
    }
  },
  {
    id: 'personality',
    title: 'Personality & Mode',
    subtitle: '10 AI personalities, greeting style, timing & GF Mode',
    icon: Smile,
    badge: '10 Modes',
    colorTheme: {
      bg: 'bg-fuchsia-50/70 hover:bg-fuchsia-50',
      border: 'border-fuchsia-200/80',
      iconBg: 'bg-fuchsia-100 text-fuchsia-700',
      iconColor: 'text-fuchsia-600',
      pillBg: 'bg-fuchsia-100/80',
      pillColor: 'text-fuchsia-700'
    }
  },
  {
    id: 'orb_animation',
    title: '3D Dot & Particle Orb',
    subtitle: '4 Advanced Holographic Dot & Particle Orb Styles',
    icon: Disc,
    badge: '4 Orb Styles',
    colorTheme: {
      bg: 'bg-indigo-50/70 hover:bg-indigo-50',
      border: 'border-indigo-200/80',
      iconBg: 'bg-indigo-100 text-indigo-700',
      iconColor: 'text-indigo-600',
      pillBg: 'bg-indigo-100/80',
      pillColor: 'text-indigo-700'
    }
  },
  {
    id: 'theme',
    title: 'Theme & Appearance',
    subtitle: 'Cool color styles, Hex color input & display shell',
    icon: Palette,
    badge: 'Cool Colors',
    colorTheme: {
      bg: 'bg-violet-50/70 hover:bg-violet-50',
      border: 'border-violet-200/80',
      iconBg: 'bg-violet-100 text-violet-700',
      iconColor: 'text-violet-600',
      pillBg: 'bg-violet-100/80',
      pillColor: 'text-violet-700'
    }
  },
  {
    id: 'permissions',
    title: 'Permissions Center',
    subtitle: '17 Android permissions • Core, System, Media & Hardware access status',
    icon: ShieldCheck,
    badge: '17 Permissions',
    colorTheme: {
      bg: 'bg-teal-50/70 hover:bg-teal-50',
      border: 'border-teal-200/80',
      iconBg: 'bg-teal-100 text-teal-700',
      iconColor: 'text-teal-600',
      pillBg: 'bg-teal-100/80',
      pillColor: 'text-teal-700'
    }
  },
  {
    id: 'about_developer',
    title: 'About & Developer',
    subtitle: 'MD RASEL HOSSEN • Zuzu AI v3.5.4 build info',
    icon: Code2,
    badge: 'Author',
    colorTheme: {
      bg: 'bg-rose-50/70 hover:bg-rose-50',
      border: 'border-rose-200/80',
      iconBg: 'bg-rose-100 text-rose-700',
      iconColor: 'text-rose-600',
      pillBg: 'bg-rose-100/80',
      pillColor: 'text-rose-700'
    }
  }
];

const PREMADE_MALE_PRESETS = [
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian (Deep & Crisp)', badge: 'Free Premade' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (Baritone)', badge: 'Free Premade' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (Laid-back)', badge: 'Free Premade' },
];

const PREMADE_FEMALE_PRESETS = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Soft & Warm)', badge: 'Free Premade' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria (Expressive)', badge: 'Free Premade' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (Narrator)', badge: 'Free Premade' },
];

const ORB_STYLES: Array<{
  id: OrbStyleId;
  name: string;
  desc: string;
  icon: string;
  badge: string;
}> = [
  { 
    id: 'purple_spiral_globe', 
    name: 'Purple Spiral Dot Globe (Signature)', 
    desc: 'Signature 3D dot-matrix sphere with concentric purple & white glowing dots, fluid rotation & subtle orbiting rings', 
    icon: '🪐',
    badge: 'Signature Style'
  },
  { 
    id: 'glass_iridescent_wave', 
    name: 'Orb 2 — Glass Iridescent Wave', 
    desc: 'Multi-layered glowing translucent orb with fluid internal light waves & iridescent core', 
    icon: '🔮',
    badge: 'Iridescent Glass'
  },
  { 
    id: 'blue_violet_matrix', 
    name: 'Orb 3 — Blue-Violet Particle Matrix', 
    desc: 'Dynamic 3D sphere formed by dense glowing blue-to-violet matrix dots with fluid wave motion', 
    icon: '🌊',
    badge: 'Fluid Wave'
  },
  { 
    id: 'magenta_cyan_mesh', 
    name: 'Orb 4 — Magenta-Cyan Glowing Mesh', 
    desc: 'Intricate particle mesh sphere featuring vibrant magenta, cyan, and blue neon glowing dot gradients', 
    icon: '✨',
    badge: 'High-Density Mesh'
  }
];

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onUpdateSettings }) => {
  // Navigation State
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Profile state
  const [userNickname, setUserNickname] = useState(settings.userNickname || 'Rasel');
  const [assistantNickname, setAssistantNickname] = useState(settings.assistantNickname || 'Zuzu');
  const [isEditingAssistantNick, setIsEditingAssistantNick] = useState(false);
  const [greetingStyle, setGreetingStyle] = useState<'friendly' | 'formal' | 'cheerful'>('friendly');
  const [timeBasedGreetings, setTimeBasedGreetings] = useState(true);

  // AI Providers state (Google Gemini & xAI Grok)
  const [geminiKeyInput, setGeminiKeyInput] = useState(settings.customGeminiApiKey || '');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestStatus, setGeminiTestStatus] = useState<string | null>(null);
  const [geminiValidation, setGeminiValidation] = useState<'idle' | 'validating' | 'valid' | 'failed'>('idle');

  const [grokKeyInput, setGrokKeyInput] = useState(settings.customGrokApiKey || '');
  const [showGrokKey, setShowGrokKey] = useState(false);
  const [testingGrok, setTestingGrok] = useState(false);
  const [grokTestStatus, setGrokTestStatus] = useState<string | null>(null);
  const [grokValidation, setGrokValidation] = useState<'idle' | 'validating' | 'valid' | 'failed'>('idle');

  // Voice Preview State for Selected Style
  const [previewingStyleId, setPreviewingStyleId] = useState<string | null>(null);

  // Orb Live Preview State
  const [previewOrbState, setPreviewOrbState] = useState<OrbState>('idle');

  // Reset Confirmation Modal State (Requirement 5)
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [resetApiKeysToggle, setResetApiKeysToggle] = useState(false);

  // Custom Theme Input state
  const [customHexInput, setCustomHexInput] = useState(settings.customBgColor || '#FAF5FF');
  const [customHexError, setCustomHexError] = useState<string | null>(null);

  // Profile image error fallback state
  const [profileImgError, setProfileImgError] = useState(false);


  // Audio & Mic state
  const [testingVoice, setTestingVoice] = useState<VoiceIdentity | null>(null);
  const [micState, setMicState] = useState<MicrophonePermissionState>('prompt');
  const [isTestingMic, setIsTestingMic] = useState(false);

  // Permissions Center State (14 Android Permissions)
  const [permissionStatuses, setPermissionStatuses] = useState<Record<string, PermissionStatusState>>({});
  const [permCategoryFilter, setPermCategoryFilter] = useState<PermissionCategoryId>('all');
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);
  const [permActionLoadingId, setPermActionLoadingId] = useState<string | null>(null);
  const [permNotice, setPermNotice] = useState<string | null>(null);

  // Backend state
  const [backendConfig, setBackendConfig] = useState<{
    hasElevenLabsKey: boolean;
    hasGeminiKey: boolean;
    maleVoiceId: string;
    femaleVoiceId: string;
    version: string;
  } | null>(null);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<string | null>(null);

  // History & Storage state
  const [confirmClearType, setConfirmClearType] = useState<'text' | 'voice' | null>(null);
  const [chatCount, setChatCount] = useState(0);
  const [voiceCount, setVoiceCount] = useState(0);

  // Long-Term Memory State
  const [memories, setMemories] = useState<UserMemory[]>(() => getMemories());
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [newMemKey, setNewMemKey] = useState('');
  const [newMemVal, setNewMemVal] = useState('');
  const [newMemCategory, setNewMemCategory] = useState<MemoryCategory>('personal');
  const [memError, setMemError] = useState<string | null>(null);

  const refreshAllPermissions = async () => {
    setIsCheckingPermissions(true);
    try {
      const statuses = await checkAllPermissions();
      setPermissionStatuses(statuses);
      if (statuses.microphone) {
        setMicState(statuses.microphone as MicrophonePermissionState);
      }
    } finally {
      setIsCheckingPermissions(false);
    }
  };

  const handlePermAction = async (id: string) => {
    setPermActionLoadingId(id);
    setPermNotice(null);
    playHapticSound('message_sent');
    try {
      const res = await handlePermissionAction(id);
      if (res.message) {
        setPermNotice(res.message);
      }
      const updated = await checkAllPermissions();
      setPermissionStatuses(updated);
      if (updated.microphone) {
        setMicState(updated.microphone as MicrophonePermissionState);
      }
      if (res.success) {
        playHapticSound('listen_start');
      } else {
        playHapticSound('listen_stop');
      }
    } finally {
      setPermActionLoadingId(null);
    }
  };

  useEffect(() => {
    apiFetch('/api/config')
      .then(res => res.json())
      .then(data => setBackendConfig(data))
      .catch(err => console.warn('Could not fetch backend config:', err));

    refreshAllPermissions();
    updateCounts();
  }, []);

  const updateCounts = () => {
    setChatCount(getChatMessages().length);
    setVoiceCount(getVoiceSessions().length);
  };

  const handleTestVoice = (identity: VoiceIdentity) => {
    if (testingVoice === identity) {
      stopSpeaking();
      setTestingVoice(null);
      return;
    }

    stopSpeaking();
    setTestingVoice(identity);
    playHapticSound('switch');

    const testText =
      identity === 'female'
        ? "Hello! I am Female Zuzu. My voice is warm, expressive, and ready to assist you on Android."
        : "Hello! I am Male Zuzu. My voice is deep, articulate, and ready to assist you on Android.";

    const voiceId =
      identity === 'female'
        ? settings.elevenLabsFemaleVoiceId
        : settings.elevenLabsMaleVoiceId;

    speakText({
      text: testText,
      voiceIdentity: identity,
      customVoiceId: voiceId,
      customApiKey: settings.customElevenLabsApiKey,
      stability: settings.stability,
      similarityBoost: settings.similarityBoost,
      speechRate: settings.speechRate,
      onStart: () => setTestingVoice(identity),
      onEnd: () => setTestingVoice(null),
      onError: () => setTestingVoice(null)
    });
  };

  const handleRequestMicPermission = async () => {
    setIsTestingMic(true);
    playHapticSound('message_sent');
    try {
      const res = await requestMicrophonePermission();
      setMicState(res.state);
      if (res.success) {
        playHapticSound('listen_start');
      } else {
        playHapticSound('listen_stop');
      }
    } finally {
      setIsTestingMic(false);
    }
  };

  const handleTestAiConnection = async () => {
    setIsTestingAi(true);
    setAiTestResult(null);
    playHapticSound('message_sent');

    const startTime = Date.now();
    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ sender: 'user', text: 'Ping Zuzu AI' }],
          personality: settings.activePersonality,
          voiceIdentity: settings.activeIdentity,
          customGeminiKey: settings.customGeminiApiKey
        })
      });

      const data = await res.json();
      const latency = Date.now() - startTime;
      const model = data.model || 'gemini-3.8-flash';
      setAiTestResult(`Success (${latency}ms) • Engine: ${model}`);
      playHapticSound('listen_start');
    } catch (err: any) {
      setAiTestResult(`Connection offline • Local reasoning engine active`);
    } finally {
      setIsTestingAi(false);
    }
  };

  const handleSaveAndValidateGemini = async () => {
    const keyToTest = geminiKeyInput.trim();
    onUpdateSettings({ customGeminiApiKey: keyToTest });
    playHapticSound('message_sent');
    if (!keyToTest) {
      setGeminiTestStatus('Gemini API key cleared.');
      setGeminiValidation('idle');
      return;
    }
    setTestingGemini(true);
    setGeminiValidation('validating');
    setGeminiTestStatus('Validating with Google Gemini...');
    try {
      const result = await validateAiKey('gemini', keyToTest);
      if (result.success) {
        setGeminiValidation('valid');
        setGeminiTestStatus(result.message || `Valid ✓ Connected (${result.latencyMs || 120}ms)`);
        playHapticSound('listen_start');
      } else {
        setGeminiValidation('failed');
        setGeminiTestStatus(`Failed ✕ ${result.message || 'Invalid API Key'}`);
        playHapticSound('listen_stop');
      }
    } catch (err: any) {
      setGeminiValidation('failed');
      setGeminiTestStatus(`Failed ✕ Network error: ${err.message}`);
      playHapticSound('listen_stop');
    } finally {
      setTestingGemini(false);
    }
  };

  const handleTestGemini = async () => {
    const keyToTest = geminiKeyInput.trim() || settings.customGeminiApiKey.trim();
    if (!keyToTest) {
      setGeminiTestStatus('Please enter an API Key first.');
      setGeminiValidation('idle');
      return;
    }
    setTestingGemini(true);
    setGeminiValidation('validating');
    setGeminiTestStatus('Validating connection...');
    playHapticSound('message_sent');
    try {
      const result = await validateAiKey('gemini', keyToTest);
      if (result.success) {
        setGeminiValidation('valid');
        setGeminiTestStatus(result.message || `Valid ✓ Connected (${result.latencyMs || 120}ms)`);
        playHapticSound('listen_start');
      } else {
        setGeminiValidation('failed');
        setGeminiTestStatus(`Failed ✕ ${result.message || 'Invalid API Key'}`);
        playHapticSound('listen_stop');
      }
    } catch (err: any) {
      setGeminiValidation('failed');
      setGeminiTestStatus(`Failed ✕ ${err.message}`);
      playHapticSound('listen_stop');
    } finally {
      setTestingGemini(false);
    }
  };

  const handleSaveAndValidateGrok = async () => {
    const keyToTest = grokKeyInput.trim();
    onUpdateSettings({ customGrokApiKey: keyToTest });
    playHapticSound('message_sent');
    if (!keyToTest) {
      setGrokTestStatus('Grok API key cleared.');
      setGrokValidation('idle');
      return;
    }
    setTestingGrok(true);
    setGrokValidation('validating');
    setGrokTestStatus('Validating with xAI Grok...');
    try {
      const result = await validateAiKey('grok', keyToTest);
      if (result.success) {
        setGrokValidation('valid');
        setGrokTestStatus(result.message || `Valid ✓ Connected (${result.latencyMs || 120}ms)`);
        playHapticSound('listen_start');
      } else {
        setGrokValidation('failed');
        setGrokTestStatus(`Failed ✕ ${result.message || 'Invalid API Key'}`);
        playHapticSound('listen_stop');
      }
    } catch (err: any) {
      setGrokValidation('failed');
      setGrokTestStatus(`Failed ✕ Network error: ${err.message}`);
      playHapticSound('listen_stop');
    } finally {
      setTestingGrok(false);
    }
  };

  const handleTestGrok = async () => {
    const keyToTest = grokKeyInput.trim() || settings.customGrokApiKey.trim();
    if (!keyToTest) {
      setGrokTestStatus('Please enter an API Key first.');
      setGrokValidation('idle');
      return;
    }
    setTestingGrok(true);
    setGrokValidation('validating');
    setGrokTestStatus('Validating connection...');
    playHapticSound('message_sent');
    try {
      const result = await validateAiKey('grok', keyToTest);
      if (result.success) {
        setGrokValidation('valid');
        setGrokTestStatus(result.message || `Valid ✓ Connected (${result.latencyMs || 120}ms)`);
        playHapticSound('listen_start');
      } else {
        setGrokValidation('failed');
        setGrokTestStatus(`Failed ✕ ${result.message || 'Invalid API Key'}`);
        playHapticSound('listen_stop');
      }
    } catch (err: any) {
      setGrokValidation('failed');
      setGrokTestStatus(`Failed ✕ ${err.message}`);
      playHapticSound('listen_stop');
    } finally {
      setTestingGrok(false);
    }
  };

  const [testingFillerPhrase, setTestingFillerPhrase] = useState<string | null>(null);

  const handlePreviewVoiceStyle = (style: typeof VOICE_STYLE_OPTIONS[0]) => {
    if (previewingStyleId === style.id) {
      stopSpeaking();
      setPreviewingStyleId(null);
      return;
    }

    stopSpeaking();
    setPreviewingStyleId(style.id);
    playHapticSound('switch');

    speakText({
      text: style.previewSample,
      voiceIdentity: style.genderLabel === 'female' ? 'female' : 'male',
      voiceStyleId: style.id,
      volume: settings.volume ?? 1.0,
      customApiKey: settings.customElevenLabsApiKey,
      stability: settings.stability,
      similarityBoost: settings.similarityBoost,
      speechRate: settings.speechRate || style.recommendedRate,
      onStart: () => setPreviewingStyleId(style.id),
      onEnd: () => setPreviewingStyleId(null),
      onError: () => setPreviewingStyleId(null)
    });
  };

  const handleTestFillerPhrase = (phrase: string) => {
    if (testingFillerPhrase === phrase) {
      stopSpeaking();
      setTestingFillerPhrase(null);
      return;
    }
    stopSpeaking();
    setTestingFillerPhrase(phrase);
    playHapticSound('switch');

    speakText({
      text: phrase,
      voiceIdentity: settings.activeIdentity,
      voiceStyleId: settings.selectedVoiceStyleId || settings.selectedVoiceOptionId || 'kore_firm',
      volume: settings.volume ?? 1.0,
      speechRate: settings.speechRate || 1.0,
      customApiKey: settings.customElevenLabsApiKey,
      stability: settings.stability,
      similarityBoost: settings.similarityBoost,
      onEnd: () => setTestingFillerPhrase(null),
      onError: () => setTestingFillerPhrase(null)
    });
  };

  const handleAddMemory = (e: React.FormEvent) => {

    e.preventDefault();
    setMemError(null);
    const result = saveMemory({
      key: newMemKey,
      value: newMemVal,
      category: newMemCategory,
      source: 'explicit'
    });
    if (!result.success) {
      setMemError(result.error || 'Failed to save memory.');
      playHapticSound('listen_stop');
      return;
    }
    setMemories(getMemories());
    setNewMemKey('');
    setNewMemVal('');
    setIsAddingMemory(false);
    playHapticSound('message_sent');
  };

  const handleClearChat = () => {
    clearChatHistory();
    setConfirmClearType(null);
    updateCounts();
    playHapticSound('listen_stop');
  };

  const handleClearVoice = () => {
    clearVoiceHistory();
    setConfirmClearType(null);
    updateCounts();
    playHapticSound('listen_stop');
  };

  const handleOpenResetDialog = () => {
    setResetApiKeysToggle(false);
    setShowResetConfirmModal(true);
    playHapticSound('message_sent');
  };

  const handleConfirmReset = () => {
    // Reset general configuration while strictly preserving API keys, memories & chat history
    const newSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      customGeminiApiKey: resetApiKeysToggle ? '' : (settings.customGeminiApiKey || ''),
      customGrokApiKey: resetApiKeysToggle ? '' : (settings.customGrokApiKey || ''),
      customElevenLabsApiKey: resetApiKeysToggle ? '' : (settings.customElevenLabsApiKey || ''),
      userNickname: settings.userNickname,
      assistantNickname: settings.assistantNickname
    };
    onUpdateSettings(newSettings);
    setCustomHexInput('#FAF5FF');
    setShowResetConfirmModal(false);
    playHapticSound('listen_start');
  };

  const handleApplyCustomHex = () => {
    if (!isValidHexColor(customHexInput)) {
      setCustomHexError('Please enter a valid Hex code (e.g. #FAF5FF or #F0F7FF)');
      playHapticSound('listen_stop');
      return;
    }
    setCustomHexError(null);
    onUpdateSettings({
      themePreset: 'custom',
      customBgColor: customHexInput.trim().toUpperCase()
    });
    playHapticSound('message_sent');
  };

  const filteredCategories = CATEGORIES.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const themeDetails = getThemeDetails(settings);

  return (
    <div 
      className="flex-1 flex flex-col h-full relative overflow-hidden select-none transition-colors duration-300"
      style={themeDetails.containerStyle}
    >
      {/* Ambient Cool Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-purple-200/30 rounded-full blur-3xl pointer-events-none -z-0" />
      <div className="absolute bottom-10 left-0 w-80 h-80 bg-blue-200/25 rounded-full blur-3xl pointer-events-none -z-0" />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-12 z-10 custom-scrollbar">

        {/* ============================================================== */}
        {/* VIEW 1: MASTER CATEGORIES LIST (When activeCategory === null)    */}
        {/* ============================================================== */}
        {activeCategory === null ? (
          <div className="space-y-4 animate-fade-in">
            {/* Header with Title and Reset */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center shadow-xs">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold tracking-tight">
                      Settings &amp; Preferences
                    </h2>
                    <p className="text-[11px] opacity-70">
                      Zuzu AI v3.5 • Personalize your assistant
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleOpenResetDialog}
                className="px-2.5 py-1.5 rounded-xl bg-white/90 hover:bg-white text-slate-700 text-xs font-semibold flex items-center gap-1 border border-purple-100 shadow-xs transition-colors"
                title="Reset All Settings to Defaults"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Reset</span>
              </button>
            </div>

            {/* Permanent Branding Banner */}
            <div className="p-3.5 bg-gradient-to-r from-purple-100/90 via-indigo-50 to-blue-50 border border-purple-200/80 rounded-2xl shadow-xs flex items-center justify-between text-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
                  Z
                </div>
                <div>
                  <div className="text-xs font-extrabold flex items-center gap-1.5">
                    <span>Zuzu AI</span>
                    <span className="text-[9px] bg-purple-200/80 text-purple-800 font-mono px-1.5 py-0.2 rounded-full font-bold">
                      Permanent Name
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Voice Identity &amp; Expression • Intelligent Android Assistant
                  </div>

                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-purple-700 font-bold bg-white/80 px-2 py-0.5 rounded-md border border-purple-200">
                  v3.5.4
                </span>
              </div>
            </div>

            {/* Quick Search Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search settings categories..."
                className="w-full bg-white/90 text-xs text-slate-800 pl-9 pr-3 py-2.5 rounded-xl border border-purple-100/80 placeholder-slate-400 focus:outline-none focus:border-purple-300 shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 8 Category Cards (Notice: Single About & Developer entry, No duplicate) */}
            <div className="space-y-2.5">
              <div className="text-[11px] font-bold opacity-70 uppercase tracking-wider px-1 flex items-center justify-between">
                <span>Categories ({filteredCategories.length})</span>
                <span className="font-mono text-[10px] text-purple-600">Tap to open</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {filteredCategories.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        playHapticSound('switch');
                        setActiveCategory(cat.id);
                      }}
                      className={`w-full p-3.5 rounded-2xl border transition-all text-left flex items-center justify-between shadow-xs hover:shadow-sm ${cat.colorTheme.bg} ${cat.colorTheme.border} group`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${cat.colorTheme.iconBg} flex items-center justify-center flex-shrink-0 shadow-xs group-hover:scale-105 transition-transform`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800">
                              {cat.title}
                            </span>
                            {cat.badge && (
                              <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-md ${cat.colorTheme.pillBg} ${cat.colorTheme.pillColor}`}>
                                {cat.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 leading-normal">
                            {cat.subtitle}
                          </p>
                        </div>
                      </div>

                      <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/60 flex items-center justify-center text-slate-400 group-hover:text-purple-600 group-hover:border-purple-200 transition-colors flex-shrink-0">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* History Storage Summary Card */}
            <div className="p-3.5 bg-white/80 border border-purple-100 rounded-2xl shadow-xs space-y-2 text-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-purple-600" />
                  <span>Isolated Data Stores</span>
                </span>
                <span className="text-[10px] font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200 font-bold">
                  Active
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 bg-purple-50/50 border border-purple-100/60 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Chat Messages</div>
                  <div className="text-base font-extrabold text-purple-700">{chatCount}</div>
                </div>
                <div className="p-2 bg-blue-50/50 border border-blue-100/60 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Voice Sessions</div>
                  <div className="text-base font-extrabold text-blue-700">{voiceCount}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ============================================================== */
          /* VIEW 2: DEDICATED CATEGORY SUB-PAGE                            */
          /* ============================================================== */
          <div className="space-y-4 animate-fade-in">
            {/* Top Back Navigation Bar */}
            <div className="flex items-center justify-between pb-1 border-b border-purple-100/80">
              <button
                onClick={() => {
                  playHapticSound('switch');
                  setActiveCategory(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-purple-200 text-purple-700 text-xs font-bold shadow-xs hover:bg-purple-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to Settings</span>
              </button>

              <div className="text-[11px] font-mono opacity-60">
                Category {CATEGORIES.findIndex(c => c.id === activeCategory) + 1} of 8
              </div>
            </div>

            {/* Category Header Banner */}
            {(() => {
              const currentCat = CATEGORIES.find(c => c.id === activeCategory);
              if (!currentCat) return null;
              const Icon = currentCat.icon;
              return (
                <div className={`p-4 rounded-2xl border shadow-xs ${currentCat.colorTheme.bg} ${currentCat.colorTheme.border} flex items-center gap-3 text-slate-800`}>
                  <div className={`w-11 h-11 rounded-xl ${currentCat.colorTheme.iconBg} flex items-center justify-center shadow-xs flex-shrink-0`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800">
                      {currentCat.title}
                    </h3>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {currentCat.subtitle}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* ----------------------------------------------------------- */}
            {/* 1. PROFILE & IDENTITY SUB-PAGE                             */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'profile' && (
              <div className="space-y-3.5 animate-fade-in text-slate-800">
                <div className="p-4 bg-white/90 border border-purple-100 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-white flex items-center justify-center font-extrabold text-xl shadow-sm">
                      {userNickname ? userNickname.slice(0, 2).toUpperCase() : 'ME'}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">User Profile</div>
                      <div className="text-sm font-black text-purple-700">{userNickname || 'Personal User'}</div>
                      <div className="text-[10px] text-slate-400">Primary Android Device Account</div>
                    </div>
                  </div>

                  <div className="space-y-1 pt-2 border-t border-slate-100">
                    <label className="text-[11px] font-semibold text-slate-600">
                      User Nickname (What Zuzu calls you):
                    </label>
                    <input
                      type="text"
                      value={userNickname}
                      onChange={(e) => {
                        const val = e.target.value;
                        setUserNickname(val);
                        onUpdateSettings({ userNickname: val });
                      }}
                      placeholder="e.g. Rasel, Alex, Boss"
                      className="w-full bg-purple-50/50 text-xs text-slate-800 px-3 py-2 rounded-xl border border-purple-100 focus:outline-none focus:border-purple-300"
                    />
                  </div>
                </div>

                {/* Assistant Nickname Customization (Requirement 4) */}
                <div className="p-4 bg-white/90 border border-purple-100 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                        {assistantNickname.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">Assistant Nickname</div>
                        <div className="text-[10px] text-slate-500">What you personally call your assistant</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl border border-purple-200">
                      "{settings.assistantNickname || 'Zuzu'}"
                    </span>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-slate-100">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={assistantNickname}
                        onChange={(e) => setAssistantNickname(e.target.value)}
                        placeholder="e.g. Maya, Zuzu, Jarvis"
                        className="flex-1 bg-purple-50/50 text-xs text-slate-800 px-3 py-2 rounded-xl border border-purple-100 focus:outline-none focus:border-purple-300"
                      />
                      <button
                        onClick={() => {
                          const saved = assistantNickname.trim() || 'Zuzu';
                          setAssistantNickname(saved);
                          onUpdateSettings({ assistantNickname: saved });
                          playHapticSound('message_sent');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setAssistantNickname('Zuzu');
                          onUpdateSettings({ assistantNickname: 'Zuzu' });
                          playHapticSound('switch');
                        }}
                        className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors"
                        title="Reset Nickname to Zuzu"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="p-2.5 bg-purple-50/70 border border-purple-100 rounded-xl text-[10px] text-purple-900 space-y-1">
                      <div className="font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-purple-600" />
                        <span>Voice Wake-Word Customization:</span>
                      </div>
                      <p className="text-slate-600">
                        You can address your assistant directly in text and voice commands: <br />
                        <span className="font-semibold text-purple-800">"Hey {settings.assistantNickname || 'Maya'}"</span> or <span className="font-semibold text-purple-800">"{settings.assistantNickname || 'Maya'}, open weather."</span>
                      </p>
                    </div>
                  </div>
                </div>




                {/* Language Preference */}
                <div className="p-4 bg-white/90 border border-purple-100 rounded-2xl shadow-xs space-y-2.5">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 text-purple-600" />
                    <span>Language &amp; Speech Preference</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'auto', label: 'Auto (Bilingual)' },
                      { id: 'en-US', label: 'English (US)' },
                      { id: 'bn-BD', label: 'বাংলা (Bengali)' }
                    ].map(lang => (
                      <button
                        key={lang.id}
                        onClick={() => onUpdateSettings({ recognitionLanguage: lang.id as any })}
                        className={`py-2 px-1 text-[11px] font-semibold rounded-xl border text-center transition-all ${
                          settings.recognitionLanguage === lang.id
                            ? 'bg-purple-100/90 border-purple-300 text-purple-800 font-bold shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------- */}
            {/* 2. ZUZU AI SUB-PAGE — AI PROVIDERS (Requirement 6)         */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'zuzu_ai' && (
              <div className="space-y-3.5 animate-fade-in text-slate-800">

                {/* Google Gemini Card */}
                <div className="p-4 bg-white/95 border border-blue-200 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>Google Gemini</span>
                          <span className="text-[9px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">Primary</span>
                        </div>
                        <div className="text-[10px] text-slate-500">Gemini 3.8 Flash &amp; Image 3.1</div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const next = settings.geminiEnabled === false ? true : false;
                        onUpdateSettings({ geminiEnabled: next });
                        playHapticSound('switch');
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                        settings.geminiEnabled !== false
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {settings.geminiEnabled !== false ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Google Gemini powers high-speed bilingual reasoning, Bengali comprehension, and multimodal image creation.
                  </p>

                  {/* API Key Input */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] font-bold text-slate-600 flex items-center justify-between">
                      <span>Gemini API Key:</span>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 flex items-center gap-0.5 font-normal"
                      >
                        <span>Get key from Google AI Studio</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </label>

                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type={showGeminiKey ? 'text' : 'password'}
                          value={geminiKeyInput}
                          onChange={(e) => setGeminiKeyInput(e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full bg-slate-50 text-xs font-mono text-slate-800 px-3 py-2 pr-8 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowGeminiKey(!showGeminiKey)}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <button
                        onClick={handleSaveAndValidateGemini}
                        disabled={testingGemini}
                        className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs flex items-center gap-1"
                      >
                        <span>{testingGemini ? 'Validating...' : 'Save & Validate'}</span>
                      </button>

                      {settings.customGeminiApiKey && (
                        <button
                          onClick={() => {
                            setGeminiKeyInput('');
                            onUpdateSettings({ customGeminiApiKey: '' });
                            playHapticSound('listen_stop');
                            setGeminiTestStatus('Gemini key removed.');
                            setGeminiValidation('idle');
                          }}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors"
                          title="Remove Key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={handleTestGemini}
                        disabled={testingGemini}
                        className="py-1 px-2.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[10px] font-bold flex items-center gap-1 border border-blue-200 transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{testingGemini ? 'Testing...' : 'Test Connection'}</span>
                      </button>
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        {geminiValidation === 'valid' && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-0.5 flex-shrink-0">
                            <Check className="w-2.5 h-2.5" />
                            <span>Valid</span>
                          </span>
                        )}
                        {geminiValidation === 'failed' && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full border border-rose-300 flex-shrink-0">
                            Failed ✕
                          </span>
                        )}
                        {geminiTestStatus && (
                          <span className="text-[10px] text-blue-800 font-mono truncate max-w-[190px]">
                            {geminiTestStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* xAI Grok Card */}
                <div className="p-4 bg-white/95 border border-slate-200 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                        X
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>xAI Grok</span>
                          <span className="text-[9px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">Alternative</span>
                        </div>
                        <div className="text-[10px] text-slate-500">Grok 2 / Grok 3 Reasoning</div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const next = !settings.grokEnabled;
                        onUpdateSettings({ grokEnabled: next });
                        playHapticSound('switch');
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                        settings.grokEnabled
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {settings.grokEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Direct real-time reasoning with witty humor, conversational depth, and technical precision from xAI.
                  </p>

                  {/* API Key Input */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] font-bold text-slate-600 flex items-center justify-between">
                      <span>xAI Grok API Key:</span>
                      <a
                        href="https://console.x.ai/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-700 hover:text-black flex items-center gap-0.5 font-normal"
                      >
                        <span>Get key from xAI Console</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </label>

                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type={showGrokKey ? 'text' : 'password'}
                          value={grokKeyInput}
                          onChange={(e) => setGrokKeyInput(e.target.value)}
                          placeholder="xai-..."
                          className="w-full bg-slate-50 text-xs font-mono text-slate-800 px-3 py-2 pr-8 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowGrokKey(!showGrokKey)}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          {showGrokKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <button
                        onClick={handleSaveAndValidateGrok}
                        disabled={testingGrok}
                        className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-black transition-colors shadow-xs flex items-center gap-1"
                      >
                        <span>{testingGrok ? 'Validating...' : 'Save & Validate'}</span>
                      </button>

                      {settings.customGrokApiKey && (
                        <button
                          onClick={() => {
                            setGrokKeyInput('');
                            onUpdateSettings({ customGrokApiKey: '' });
                            playHapticSound('listen_stop');
                            setGrokTestStatus('Grok key removed.');
                            setGrokValidation('idle');
                          }}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors"
                          title="Remove Key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={handleTestGrok}
                        disabled={testingGrok}
                        className="py-1 px-2.5 rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200 text-[10px] font-bold flex items-center gap-1 border border-slate-300 transition-colors"
                      >
                        <Zap className="w-3 h-3" />
                        <span>{testingGrok ? 'Testing...' : 'Test Connection'}</span>
                      </button>
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        {grokValidation === 'valid' && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-0.5 flex-shrink-0">
                            <Check className="w-2.5 h-2.5" />
                            <span>Valid</span>
                          </span>
                        )}
                        {grokValidation === 'failed' && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full border border-rose-300 flex-shrink-0">
                            Failed ✕
                          </span>
                        )}
                        {grokTestStatus && (
                          <span className="text-[10px] text-slate-700 font-mono truncate max-w-[190px]">
                            {grokTestStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Provider Behavior & Routing */}
                <div className="p-4 bg-white/95 border border-purple-100 rounded-2xl shadow-xs space-y-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-purple-600" />
                    <span>Provider Behavior &amp; Routing</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500">Default AI Provider:</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'gemini', label: 'Gemini (Default)' },
                        { id: 'grok', label: 'xAI Grok' },
                        { id: 'hybrid', label: 'Auto (Smart Router)' }
                      ].map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            onUpdateSettings({ defaultAiProvider: p.id as any });
                            playHapticSound('switch');
                          }}
                          className={`py-2 px-1 text-[10px] font-bold rounded-xl border text-center transition-all ${
                            (settings.defaultAiProvider || 'gemini') === p.id
                              ? 'bg-purple-100 border-purple-300 text-purple-900 shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-700">Automatic Fallback</div>
                      <div className="text-[10px] text-slate-500">Fallback to alternative provider if primary experiences latency</div>
                    </div>
                    <button
                      onClick={() => {
                        const next = settings.aiFallbackEnabled !== false ? false : true;
                        onUpdateSettings({ aiFallbackEnabled: next });
                        playHapticSound('switch');
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                        settings.aiFallbackEnabled !== false
                          ? 'bg-purple-100 text-purple-800 border-purple-300'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {settings.aiFallbackEnabled !== false ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>

                {/* API Key Security Notice */}
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-start gap-2.5 text-slate-600">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="text-[10px] leading-relaxed">
                    <strong className="text-slate-800">API Key Privacy Notice:</strong> Your custom Gemini and Grok keys are stored strictly in private, sandboxed local storage on this device. They are sent directly through secure proxy headers and are never exposed in public repositories, telemetry, or client bundle code.
                  </div>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------- */}
            {/* 3. VOICE & SPEECH SUB-PAGE (Requirement 7)                 */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'voice_speech' && (
              <div className="space-y-3.5 animate-fade-in text-slate-800">
                {/* Primary Voice Identity Card */}
                <div className="p-4 bg-white/90 border border-emerald-100 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Primary Voice Identity</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                      Dual Engine
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => onUpdateSettings({ activeIdentity: 'male' })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        settings.activeIdentity === 'male'
                          ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">♂ Male Zuzu</span>
                        {settings.activeIdentity === 'male' && <Check className="w-3.5 h-3.5 text-blue-600 stroke-[3]" />}
                      </div>
                      <p className="text-[10px] text-slate-500">Authoritative, deep resonance</p>
                    </button>

                    <button
                      onClick={() => onUpdateSettings({ activeIdentity: 'female' })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        settings.activeIdentity === 'female'
                          ? 'bg-purple-50 border-purple-400 text-purple-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">♀ Female Zuzu</span>
                        {settings.activeIdentity === 'female' && <Check className="w-3.5 h-3.5 text-purple-600 stroke-[3]" />}
                      </div>
                      <p className="text-[10px] text-slate-500">Warm, melodic cadence</p>
                    </button>
                  </div>
                </div>

                {/* Selectable Voice Styles (3 Female & 2 Male) */}
                <div className="p-4 bg-white/95 border border-emerald-100 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Selectable Voice Styles (3 Female &amp; 2 Male)</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                      Featuring Kore
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Choose from 3 expressive female voices (including <strong>Kore</strong> - Firm &amp; Melodic) and 2 male vocal timbres with calibrated speed and pitch.
                  </p>

                  <div className="space-y-2">
                    {VOICE_STYLE_OPTIONS.map((style) => {
                      const isSelected = (settings.selectedVoiceStyleId || settings.selectedVoiceOptionId || 'kore_firm') === style.id;
                      const isPreviewing = previewingStyleId === style.id;
                      const isKore = style.id === 'kore_firm';
                      return (
                        <div
                          key={style.id}
                          className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-emerald-50/90 border-emerald-400 shadow-xs ring-1 ring-emerald-300/40'
                              : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/60'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-800">{style.name}</span>
                              {isKore && (
                                <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded border border-amber-200">
                                  ⭐ Featured Melodic
                                </span>
                              )}
                              <span className="text-[9px] font-mono uppercase bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-600">
                                {style.toneTag}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 truncate mt-0.5">{style.styleDescription}</div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handlePreviewVoiceStyle(style)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center gap-1 transition-colors"
                              title="Preview this voice"
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>{isPreviewing ? 'Stop' : 'Preview'}</span>
                            </button>

                            <button
                              onClick={() => {
                                onUpdateSettings({
                                  selectedVoiceOptionId: style.id,
                                  selectedVoiceStyleId: style.id,
                                  activeIdentity: style.genderLabel === 'female' ? 'female' : 'male'
                                });
                                playHapticSound('switch');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              {isSelected ? 'Active ✓' : 'Select'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Speech Speed & Volume Playback Calibration */}
                <div className="p-4 bg-white/90 border border-emerald-100 rounded-2xl shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Playback Calibration &amp; Dynamic Range</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Tuned Engine
                    </span>
                  </div>

                  {/* Speech Rate Slider & Presets */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <span>Speech Speed Rate:</span>
                      </span>
                      <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {settings.speechRate.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.75"
                      max="1.5"
                      step="0.05"
                      value={settings.speechRate}
                      onChange={(e) => onUpdateSettings({ speechRate: parseFloat(e.target.value) })}
                      className="w-full accent-emerald-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      {[
                        { rate: 0.75, label: '0.75x Calm' },
                        { rate: 1.0, label: '1.0x Normal' },
                        { rate: 1.25, label: '1.25x Dynamic' },
                        { rate: 1.5, label: '1.5x Fast' }
                      ].map((item) => (
                        <button
                          key={item.rate}
                          onClick={() => {
                            onUpdateSettings({ speechRate: item.rate });
                            playHapticSound('switch');
                          }}
                          className={`py-1 text-[10px] font-bold rounded-lg border transition-all ${
                            Math.abs(settings.speechRate - item.rate) < 0.04
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Volume Slider & Presets */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Speech Volume Level:</span>
                      </span>
                      <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {Math.round((settings.volume ?? 1.0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.volume ?? 1.0}
                      onChange={(e) => onUpdateSettings({ volume: parseFloat(e.target.value) })}
                      className="w-full accent-emerald-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      {[
                        { vol: 0.0, label: 'Mute (0%)' },
                        { vol: 0.5, label: 'Balanced (50%)' },
                        { vol: 1.0, label: 'Full (100%)' }
                      ].map((item) => (
                        <button
                          key={item.vol}
                          onClick={() => {
                            onUpdateSettings({ volume: item.vol });
                            playHapticSound('switch');
                          }}
                          className={`py-1 text-[10px] font-bold rounded-lg border transition-all ${
                            Math.abs((settings.volume ?? 1.0) - item.vol) < 0.04
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Natural Conversational Fillers & Empathy */}
                <div className="p-4 bg-white/95 border border-emerald-100 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Smile className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Natural Conversational Fillers &amp; Empathy</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                      Bengali &amp; English
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Zuzu AI uses natural human conversational fillers (e.g. <em>"হুম বস, আপনার কথাই আমি ভাবতেছিলাম..."</em> or <em>"Hmm boss, I was just thinking about that!"</em>) to sound warm, empathetic, and lifelike instead of mechanical.
                  </p>

                  <div className="space-y-2">
                    {[
                      {
                        lang: 'Bengali',
                        phrase: 'হুম বস, আপনার কথাই আমি ভাবতেছিলাম! বলুন কি সাহায্য করতে পারি?'
                      },
                      {
                        lang: 'Bengali',
                        phrase: 'আরে বস! দারুণ প্রশ্ন করেছেন। এক্ষুনি সুন্দর করে বুঝিয়ে দিচ্ছি।'
                      },
                      {
                        lang: 'English',
                        phrase: 'Hmm boss, I was just thinking about that! Let me break it down for you.'
                      },
                      {
                        lang: 'English',
                        phrase: 'Oh hey boss! That is such a great idea. Right on it!'
                      }
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[9px] font-mono font-bold uppercase bg-white px-1.5 py-0.2 rounded border border-slate-200 text-emerald-700">
                              {item.lang}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-700 font-medium italic truncate">
                            "{item.phrase}"
                          </p>
                        </div>
                        <button
                          onClick={() => handleTestFillerPhrase(item.phrase)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center gap-1 flex-shrink-0 transition-colors"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>{testingFillerPhrase === item.phrase ? 'Playing...' : 'Test'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Voice Model Selector (Requirement 7) */}
                <div className="p-4 bg-white/95 border border-emerald-100 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Live Voice Assistant Models</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Live Audio
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Select the underlying multimodal audio reasoning model for real-time live conversations.
                  </p>

                  <div className="space-y-2">
                    {VOICE_MODELS.map((model) => {
                      const isSelected = (settings.selectedVoiceModelId || 'gemini-3.8-live') === model.id;
                      return (
                        <button
                          key={model.id}
                          onClick={() => {
                            onUpdateSettings({ selectedVoiceModelId: model.id });
                            playHapticSound('switch');
                          }}
                          className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold shadow-xs'
                              : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold">{model.name}</span>
                              <span className="text-[9px] bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-600 font-normal">
                                {model.availability}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5 font-normal">{model.description}</div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-600 stroke-[3] flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------- */}
            {/* 4. PERSONALITY SUB-PAGE (Requirement 8)                    */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'personality' && (
              <div className="space-y-3.5 animate-fade-in text-slate-800">
                <div className="p-4 bg-white/90 border border-fuchsia-100 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Smile className="w-3.5 h-3.5 text-fuchsia-600" />
                      <span>10 Compatible Personalities</span>
                    </div>
                    <span className="text-[10px] text-fuchsia-700 font-mono bg-fuchsia-50 px-2 py-0.5 rounded-full border border-fuchsia-200">
                      Multi-Mode
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {Object.values(PERSONALITIES).map((p) => {
                      const isSelected = settings.activePersonality === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            onUpdateSettings({ activePersonality: p.id });
                            playHapticSound('switch');
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-fuchsia-50 border-fuchsia-400 text-fuchsia-900 font-bold shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-base">{p.emoji}</span>
                            <div className="text-xs truncate">{p.name}</div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-fuchsia-600 stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Greeting Style & Timing (Requirement 6) */}
                <div className="p-4 bg-white/90 border border-fuchsia-100 rounded-2xl shadow-xs space-y-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-fuchsia-600" />
                    <span>Greeting Style &amp; Timing</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500">Standard Greeting Style:</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'friendly', label: 'Friendly ✨' },
                        { id: 'formal', label: 'Formal 💼' },
                        { id: 'cheerful', label: 'Cheerful 🌟' }
                      ].map(g => (
                        <button
                          key={g.id}
                          onClick={() => {
                            setGreetingStyle(g.id as any);
                            onUpdateSettings({ greetingStyle: g.id as any });
                            playHapticSound('switch');
                          }}
                          className={`py-2 px-1 text-[11px] font-semibold rounded-xl border text-center transition-all ${
                            (settings.greetingStyle || greetingStyle) === g.id
                              ? 'bg-fuchsia-100/90 border-fuchsia-300 text-fuchsia-800 font-bold shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-700">Time-based Greetings</div>
                      <div className="text-[10px] text-slate-500">Good Morning / Afternoon / Evening</div>
                    </div>
                    <button
                      onClick={() => {
                        const next = !settings.timeBasedGreetings;
                        setTimeBasedGreetings(next);
                        onUpdateSettings({ timeBasedGreetings: next });
                        playHapticSound('switch');
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                        settings.timeBasedGreetings !== false
                          ? 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {settings.timeBasedGreetings !== false ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>

                {/* Advanced GF Mode Card (Requirement 8) */}
                {settings.activePersonality === 'GF Mode' && (
                  <div className="p-4 bg-gradient-to-br from-pink-50 via-rose-50 to-purple-50 border border-pink-200 rounded-2xl shadow-xs space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-pink-900 flex items-center gap-1.5">
                        <Heart className="w-4 h-4 text-pink-600 fill-current" />
                        <span>Girlfriend (GF) Mode Configuration</span>
                      </div>
                      <span className="text-[9px] font-mono text-pink-700 font-bold bg-white px-2 py-0.5 rounded-full border border-pink-200">
                        Active
                      </span>
                    </div>

                    <p className="text-[11px] text-pink-800 leading-relaxed">
                      Zuzu transforms into your sweet, caring girlfriend. Speaks warmly in Bengali and English, never calls you "Sir", and remembers your affectionate nickname.
                    </p>

                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-bold text-pink-900 uppercase">GF Mode Intensity Level:</div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'sweet', label: 'Gentle / Sweet 💕', desc: 'Soft, caring, gentle check-ins' },
                          { id: 'romantic', label: 'Romantic 🌹', desc: 'Heartfelt, loving, poetic warmth' },
                          { id: 'playful', label: 'Playful 🥰', desc: 'Cute banter, energetic teasing' },
                          { id: 'flirty', label: 'Advanced Flirty 🔥', desc: 'Confident charm, bold sweet romance' }
                        ].map(it => (
                          <button
                            key={it.id}
                            onClick={() => {
                              onUpdateSettings({ gfIntensity: it.id as any });
                              playHapticSound('switch');
                            }}
                            className={`p-2 rounded-xl text-left border transition-all ${
                              (settings.gfIntensity || 'sweet') === it.id
                                ? 'bg-pink-600 text-white border-pink-600 shadow-xs'
                                : 'bg-white text-pink-900 border-pink-200 hover:bg-pink-100/50'
                            }`}
                          >
                            <div className="text-[11px] font-bold">{it.label}</div>
                            <div className="text-[9px] opacity-80 mt-0.5">{it.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-2.5 bg-white/80 rounded-xl border border-pink-200/60 text-[11px] text-pink-900 space-y-1">
                      <div className="font-bold text-[10px] text-pink-700 uppercase">Sample GF Mode Response:</div>
                      <div className="italic">
                        "হাই {settings.userNickname || 'বাবুসোনা'}, তোমাকে খুব মিস করছিলাম! আজকের দিনটা কেমন কাটল গো? কোনো মন খারাপ থাকলে আমাকে বলো না ❤️"
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ----------------------------------------------------------- */}
            {/* 5. CHARACTER & ORB AVATAR SUB-PAGE                        */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'orb_animation' && (
              <div className="space-y-3.5 animate-fade-in text-slate-800">
                {/* Live Orb Canvas Preview */}
                <div className="p-4 bg-white/95 border border-indigo-100 rounded-2xl shadow-xs flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="text-[10px] font-mono uppercase font-bold text-indigo-600 tracking-wider mb-1 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    <span>3D Holographic Orb Live Preview</span>
                  </div>
                      <div className="text-[10px] font-mono uppercase font-bold text-indigo-600 tracking-wider mb-1 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        <span>Live Orb Canvas Preview</span>
                      </div>

                      <div className="my-2">
                        <ParticleOrb
                          state={previewOrbState}
                          style={settings.orbStyle}
                          colorScheme={settings.orbColor}
                          rotationSpeed={settings.orbRotationSpeed}
                          glowIntensity={settings.orbGlowIntensity}
                          particleDensity={settings.orbParticleDensity}
                          size={200}
                        />
                      </div>

                      {/* Animation State Test Pills */}
                      <div className="flex items-center gap-1 mt-2 bg-indigo-50/70 p-1 rounded-xl border border-indigo-100">
                        {(['idle', 'listening', 'thinking', 'speaking'] as OrbState[]).map(st => (
                          <button
                            key={st}
                            onClick={() => setPreviewOrbState(st)}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
                              previewOrbState === st
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-indigo-700 hover:bg-indigo-100/60'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 6 Orb Styles Selection Grid */}
                    <div className="p-4 bg-white/90 border border-indigo-100 rounded-2xl shadow-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Disc className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Select Orb Visual Style (4 Advanced Styles)</span>
                        </div>
                        <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 font-bold uppercase">
                          {settings.orbStyle}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {ORB_STYLES.map(style => {
                          const isSelected = settings.orbStyle === style.id;
                          return (
                            <button
                              key={style.id}
                              onClick={() => {
                                playHapticSound('switch');
                                onUpdateSettings({ orbStyle: style.id });
                              }}
                              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-indigo-100/90 border-indigo-500 text-indigo-900 ring-2 ring-indigo-400/30 shadow-xs'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xl">{style.icon}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                  isSelected ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-200 text-slate-600'
                                }`}>
                                  {style.badge}
                                </span>
                              </div>
                              <div className="mt-2">
                                <div className="text-xs font-bold flex items-center justify-between">
                                  <span>{style.name}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 stroke-[3]" />}
                                </div>
                                <div className="text-[10px] opacity-75 leading-snug mt-1">{style.desc}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Orb Color Scheme */}
                    <div className="p-4 bg-white/90 border border-indigo-100 rounded-2xl shadow-xs space-y-2.5">
                      <div className="text-xs font-bold text-slate-800">Orb Color Scheme</div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[
                          { id: 'purple', name: 'Purple', bg: 'bg-purple-500' },
                          { id: 'cyan', name: 'Cyan', bg: 'bg-cyan-500' },
                          { id: 'rose', name: 'Rose', bg: 'bg-rose-500' },
                          { id: 'mint', name: 'Mint', bg: 'bg-emerald-500' },
                          { id: 'amber', name: 'Amber', bg: 'bg-amber-500' }
                        ].map(c => (
                          <button
                            key={c.id}
                            onClick={() => {
                              playHapticSound('switch');
                              onUpdateSettings({ orbColor: c.id as any });
                            }}
                            className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1 transition-all ${
                              settings.orbColor === c.id
                                ? 'bg-indigo-100 border-indigo-400 shadow-xs'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full ${c.bg} shadow-xs`} />
                            <span className="text-[9px] font-bold text-slate-700 capitalize">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dynamics: Speed, Glow & Density */}
                    <div className="p-4 bg-white/90 border border-indigo-100 rounded-2xl shadow-xs space-y-3">
                      <div className="text-xs font-bold text-slate-800">Rotation Speed &amp; Dynamics</div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-500">Rotation Speed:</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'slow', label: 'Slow (0.5x)' },
                            { id: 'normal', label: 'Normal (1.0x)' },
                            { id: 'fast', label: 'Fast (1.8x)' }
                          ].map(s => (
                            <button
                              key={s.id}
                              onClick={() => onUpdateSettings({ orbRotationSpeed: s.id as any })}
                              className={`py-1.5 text-[10px] rounded-lg border font-semibold ${
                                settings.orbRotationSpeed === s.id
                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-semibold text-slate-500">Glow Intensity:</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'soft', label: 'Soft' },
                            { id: 'medium', label: 'Medium' },
                            { id: 'intense', label: 'Intense' }
                          ].map(g => (
                            <button
                              key={g.id}
                              onClick={() => onUpdateSettings({ orbGlowIntensity: g.id as any })}
                              className={`py-1.5 text-[10px] rounded-lg border font-semibold ${
                                settings.orbGlowIntensity === g.id
                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {g.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-semibold text-slate-500">Particle Density:</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'eco', label: 'Eco (750)' },
                            { id: 'standard', label: 'Standard (1400)' },
                            { id: 'ultra', label: 'Ultra (2200)' }
                          ].map(d => (
                            <button
                              key={d.id}
                              onClick={() => onUpdateSettings({ orbParticleDensity: d.id as any })}
                              className={`py-1.5 text-[10px] rounded-lg border font-semibold ${
                                settings.orbParticleDensity === d.id
                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
              </div>
            )}

            {/* ----------------------------------------------------------- */}
            {/* 6. THEME & APPEARANCE SUB-PAGE (Requirement PART 2)         */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'theme' && (
              <div className="space-y-3.5 animate-fade-in text-slate-800">
                {/* Preset Themes */}
                <div className="p-4 bg-white/90 border border-violet-100 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-violet-600" />
                      <span>Preset Theme Palettes ({THEME_PRESETS.length} Styles)</span>
                    </div>
                    <button
                      onClick={() => {
                        onUpdateSettings({
                          themePreset: 'lavender',
                          customBgColor: '#FAF5FF',
                          customCardColor: '#FFFFFF',
                          customAccentColor: '#8B5CF6'
                        });
                        setCustomHexInput('#FAF5FF');
                        playHapticSound('listen_stop');
                      }}
                      className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-lg flex items-center gap-1 hover:bg-violet-200 transition-colors"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Reset Theme</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {THEME_PRESETS.map(preset => {
                      const isSelected = settings.themePreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => {
                            playHapticSound('switch');
                            onUpdateSettings({
                              themePreset: preset.id,
                              customBgColor: preset.bgColor,
                              customCardColor: preset.cardColor,
                              customAccentColor: preset.accentColor
                            });
                            setCustomHexInput(preset.bgColor);
                          }}
                          className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-violet-100/90 border-violet-400 font-bold shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-7 h-7 rounded-lg border border-slate-300 shadow-xs flex-shrink-0"
                              style={{ backgroundColor: preset.bgColor }}
                            />
                            <div>
                              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <span>{preset.name}</span>
                                <span className="text-[10px] font-mono opacity-60 font-normal">({preset.bgColor})</span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">{preset.description}</div>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-violet-600 stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Hex Color Code Input & Live Preview */}
                <div className="p-4 bg-white/90 border border-violet-100 rounded-2xl shadow-xs space-y-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-violet-600" />
                    <span>Custom Hex Color Code Input</span>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Set a custom background color code (such as <code className="bg-purple-100 text-purple-800 px-1 py-0.5 rounded font-mono font-bold">#FAF5FF</code>).
                  </p>

                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={customHexInput}
                          onChange={(e) => {
                            setCustomHexInput(e.target.value);
                            setCustomHexError(null);
                          }}
                          placeholder="#FAF5FF"
                          className="w-full bg-slate-50 text-xs font-mono font-bold text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-violet-400"
                        />
                      </div>
                      <button
                        onClick={handleApplyCustomHex}
                        className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-xs transition-colors"
                      >
                        Apply Hex
                      </button>
                    </div>

                    {customHexError && (
                      <p className="text-[10px] text-rose-600 font-semibold">{customHexError}</p>
                    )}
                  </div>

                  {/* Live Palette Swatches Preview */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Live Palette Swatches:</span>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-xl border border-slate-200 flex flex-col items-center gap-1" style={{ backgroundColor: themeDetails.bgColor }}>
                        <span className="text-[9px] font-bold text-slate-700 bg-white/80 px-1.5 py-0.5 rounded">Background</span>
                        <span className="text-[10px] font-mono font-bold text-slate-800">{themeDetails.bgColor}</span>
                      </div>
                      <div className="p-2 rounded-xl border border-slate-200 flex flex-col items-center gap-1" style={{ backgroundColor: themeDetails.cardColor }}>
                        <span className="text-[9px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">Cards</span>
                        <span className="text-[10px] font-mono font-bold text-slate-800">{themeDetails.cardColor}</span>
                      </div>
                      <div className="p-2 rounded-xl border border-slate-200 flex flex-col items-center gap-1" style={{ backgroundColor: themeDetails.accentColor }}>
                        <span className="text-[9px] font-bold text-white bg-black/30 px-1.5 py-0.5 rounded">Accent</span>
                        <span className="text-[10px] font-mono font-bold text-white">{themeDetails.accentColor}</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* ----------------------------------------------------------- */}
            {/* 7. PERMISSIONS SUB-PAGE (Requirement 9)                     */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'permissions' && (
              <div className="space-y-3.5 animate-fade-in text-slate-800">
                {/* Security Sandbox Explanation Card */}
                <div className="p-4 bg-gradient-to-r from-teal-50 via-cyan-50 to-blue-50 border border-teal-200/80 rounded-2xl shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-teal-600" />
                      <span>Android Security &amp; Permissions Center</span>
                    </span>
                    <span className="text-[9px] font-mono font-bold bg-white text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
                      17 Permissions
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Android enforces a strict security sandbox. Runtime permissions (like Microphone, Camera, and Gallery) prompt in-app confirmation, while special system permissions (like Overlay and Accessibility) require authorization in Android Settings.
                  </p>
                </div>

                {/* Permissions Toolbar: Quick actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={refreshAllPermissions}
                    disabled={isCheckingPermissions}
                    className="flex-1 py-2 px-3 rounded-xl bg-white/90 hover:bg-white text-slate-700 text-xs font-bold border border-teal-200/80 shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-teal-600 ${isCheckingPermissions ? 'animate-spin' : ''}`} />
                    <span>{isCheckingPermissions ? 'Checking Status...' : 'Re-check All Permissions'}</span>
                  </button>

                  <button
                    onClick={openAndroidAppSettingsGuide}
                    className="py-2 px-3 rounded-xl bg-teal-100/90 hover:bg-teal-200 text-teal-900 text-xs font-bold border border-teal-300 shadow-xs flex items-center gap-1.5 transition-colors"
                    title="Open Android App Settings directly"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-teal-700" />
                    <span>App Settings</span>
                  </button>
                </div>

                {/* Status Notice Toast if any action returned message */}
                {permNotice && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center justify-between animate-fade-in shadow-xs">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span>{permNotice}</span>
                    </div>
                    <button
                      onClick={() => setPermNotice(null)}
                      className="text-blue-500 hover:text-blue-800 ml-2"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Category Filter Tabs (17 Permissions across 5 categories) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-semibold">
                  {[
                    { id: 'all', label: `All (17)` },
                    { id: 'core', label: `Core (4)` },
                    { id: 'system', label: `System (6)` },
                    { id: 'hardware', label: `Hardware (2)` },
                    { id: 'privacy', label: `Privacy (2)` },
                    { id: 'media', label: `Media (3)` }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        playHapticSound('switch');
                        setPermCategoryFilter(tab.id as any);
                      }}
                      className={`px-3 py-1.5 rounded-xl whitespace-nowrap border transition-all text-[11px] ${
                        permCategoryFilter === tab.id
                          ? 'bg-teal-600 text-white font-bold border-teal-600 shadow-xs'
                          : 'bg-white/80 text-slate-600 border-slate-200 hover:bg-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* 17 Permission Cards */}
                <div className="space-y-2.5">
                  {PERMISSION_DEFINITIONS
                    .filter(def => permCategoryFilter === 'all' || def.category === permCategoryFilter)
                    .map(def => {
                      const status = permissionStatuses[def.id] || (def.isSpecialSystemSetting ? 'system_required' : 'prompt');
                      const isLoading = permActionLoadingId === def.id;

                      const getPermIcon = () => {
                        switch (def.id) {
                          case 'microphone': return Mic;
                          case 'location': return MapPin;
                          case 'notifications': return Radio;
                          case 'overlay': return Layers;
                          case 'accessibility': return UserCheck;
                          case 'contacts': return User;
                          case 'phone': return Phone;
                          case 'camera': return Camera;
                          case 'photos_videos': return Layers;
                          case 'files': return FileText;
                          case 'bg_microphone': return Mic;
                          case 'flashlight': return Zap;
                          case 'bluetooth': return Radio;
                          case 'battery_opt': return Cpu;
                          case 'write_settings': return Settings;
                          case 'notification_listener': return ShieldAlert;
                          case 'screen_capture': return Smartphone;
                          default: return ShieldCheck;
                        }
                      };

                      const Icon = getPermIcon();

                      return (
                        <div
                          key={def.id}
                          className="p-3 bg-white/95 border border-teal-100 rounded-2xl shadow-xs flex items-center justify-between gap-3 text-slate-800"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200/60 text-teal-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 truncate">
                                {def.name}
                              </div>
                              <span className="text-[9px] font-mono font-semibold uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                                {def.category}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Live Status Badge - Strictly Granted or Denied */}
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 font-bold border ${
                              status === 'granted'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}>
                              {status === 'granted' ? (
                                <>
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>GRANTED</span>
                                </>
                              ) : (
                                <>
                                  <ShieldAlert className="w-2.5 h-2.5 text-rose-600" />
                                  <span>DENIED</span>
                                </>
                              )}
                            </span>

                            {/* Quick Action Button */}
                            <button
                              onClick={() => handlePermAction(def.id)}
                              disabled={isLoading}
                              className={`py-1 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all shadow-xs ${
                                def.isSpecialSystemSetting
                                  ? 'bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-200'
                                  : status === 'granted'
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-teal-600 hover:bg-teal-700 text-white'
                              }`}
                            >
                              {isLoading ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : def.isSpecialSystemSetting ? (
                                <ExternalLink className="w-3 h-3" />
                              ) : status === 'granted' ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              <span>
                                {isLoading
                                  ? '...'
                                  : def.isSpecialSystemSetting
                                  ? 'Settings'
                                  : status === 'granted'
                                  ? 'Verified'
                                  : 'Grant'}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Automation Capabilities & Platform Limits (Requirement 9 & 10) */}
                <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-md space-y-3 mt-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-400" />
                    <span className="text-xs font-bold text-teal-300 uppercase tracking-wide">
                      Automation Capabilities &amp; Platform Limits
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Android and platform security architectures impose clear boundaries on what assistants can execute silently:
                  </p>

                  <div className="space-y-2 text-[10px]">
                    <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/80">
                      <div className="font-bold text-emerald-400 mb-0.5">✓ Fully Supported In-App Automations</div>
                      <div className="text-slate-300">Live 64-district weather forecasts, AI image generation, bilingual Bengali reasoning, custom personality switching, and prompt drafting.</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/80">
                      <div className="font-bold text-amber-400 mb-0.5">⚠️ Special Android Settings Required</div>
                      <div className="text-slate-300">Floating over other apps (<code className="text-purple-300">SYSTEM_ALERT_WINDOW</code>) and reading active screen content (<code className="text-purple-300">BIND_ACCESSIBILITY_SERVICE</code>) require manual system authorization.</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/80">
                      <div className="font-bold text-blue-400 mb-0.5">🔒 Meta &amp; Social Media Platform Restrictions</div>
                      <div className="text-slate-300">Direct unattended posting or automated comment submission on Facebook/Instagram violates Meta platform terms and Android app sandboxing. Zuzu assists by drafting comments, generating visual captions, and opening direct app intents with user preview.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------- */}
            {/* 8. ABOUT & DEVELOPER SUB-PAGE (Requirement 11)              */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'about_developer' && (
              <div className="space-y-4 animate-fade-in text-slate-800">
                {/* Clean Centered Developer Profile Card */}
                <div className="p-6 bg-white/95 border border-rose-100 rounded-3xl shadow-xs text-center flex flex-col items-center">
                  {/* Centered Profile Photo from real uploaded asset */}
                  <div className="relative mb-3.5">
                    {!profileImgError ? (
                      <img
                        src="/developer_profile.jpg"
                        alt="MD RASEL HOSSEN"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          if (target.src.includes('.jpg')) {
                            target.src = '/developer_profile.png';
                          } else {
                            setProfileImgError(true);
                          }
                        }}
                        className="w-28 h-28 rounded-full object-cover object-[center_10%] border-4 border-white shadow-xl ring-4 ring-rose-200"
                      />
                    ) : (
                      <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-rose-500 via-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-2xl shadow-xl border-4 border-white ring-4 ring-rose-200">
                        RH
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-xs border-2 border-white">
                      <Heart className="w-4 h-4 fill-current" />
                    </div>
                  </div>

                  {/* Developer Name */}
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">
                    MD RASEL HOSSEN
                  </h3>

                  {/* Identity & Personal Background Cards */}
                  <div className="mt-4 space-y-2.5 w-full max-w-xs">
                    <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center gap-2.5 text-left">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Background</div>
                        <div className="text-xs font-bold text-slate-800">Student, Computer Science</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 flex items-center gap-2.5 text-left">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Location</div>
                        <div className="text-xs font-bold text-slate-800">Bangladesh</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-left">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center flex-shrink-0">
                          <Github className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">GitHub Profile</div>
                          <div className="text-xs font-bold text-slate-800 font-mono">@justonerasel</div>
                        </div>
                      </div>

                      <a
                        href="https://github.com/justonerasel"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold flex items-center gap-1 hover:bg-black transition-colors"
                        title="View GitHub profile"
                      >
                        <span>Visit</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* TikTok Profile Card (Requirement 7) */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-left">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-pink-50 border border-pink-200 text-pink-600 flex items-center justify-center flex-shrink-0 shadow-2xs">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.47 6.27 6.27 0 0 0 1.88-4.47V8.58a8.27 8.27 0 0 0 4.84 1.56V6.69h-.95z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">TikTok Profile</div>
                          <div className="text-xs font-bold text-slate-800 font-mono">@justonerasel</div>
                        </div>
                      </div>

                      <a
                        href="https://www.tiktok.com/@justonerasel"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-600 to-rose-600 text-white text-[11px] font-bold flex items-center gap-1 hover:opacity-95 transition-opacity"
                        title="View TikTok profile"
                      >
                        <span>Visit</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Official Application Info Card */}
                <div className="p-4 bg-white/90 border border-slate-200/80 rounded-2xl shadow-xs space-y-2 text-center">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold border border-purple-200">
                    <span>Zuzu AI</span>
                    <span className="text-[10px] font-mono opacity-60">• v3.5.4-android</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modals for Clear Storage */}
      {confirmClearType && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-purple-100 rounded-3xl p-5 max-w-xs w-full text-center shadow-xl">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">
              Clear {confirmClearType === 'text' ? 'Chat History' : 'Voice Sessions'}?
            </h4>
            <p className="text-xs text-slate-500 mt-1.5">
              {confirmClearType === 'text'
                ? 'This will delete typed conversations. Your Voice History remains untouched.'
                : 'This will delete voice recordings and transcripts. Your Text Chat History remains untouched.'}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmClearType(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 text-xs text-slate-600 font-semibold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearType === 'text' ? handleClearChat : handleClearVoice}
                className="flex-1 py-2 rounded-xl bg-rose-600 text-xs text-white font-bold hover:bg-rose-700 shadow-sm"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Settings Reset (Requirement 5) */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in select-none">
          <div className="bg-white border border-purple-200 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative overflow-hidden text-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3.5 border border-amber-200 shadow-xs">
              <RotateCcw className="w-6 h-6" />
            </div>

            <h4 className="font-black text-slate-900 text-base tracking-tight">
              Reset Zuzu AI Settings?
            </h4>

            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Are you sure you want to reset your settings? This action will restore default assistant personality, voice preferences, and theme styling.
            </p>

            <div className="mt-3 p-2.5 rounded-xl bg-purple-50/70 border border-purple-100 text-[11px] text-purple-900 text-left flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
              <span>Your API keys, chat history, and long-term memories are safely preserved.</span>
            </div>

            <label className="mt-3 flex items-center gap-2 text-left cursor-pointer text-xs text-slate-600 select-none">
              <input
                type="checkbox"
                checked={resetApiKeysToggle}
                onChange={(e) => setResetApiKeysToggle(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-400"
              />
              <span className="text-[11px]">Also clear saved API keys</span>
            </label>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="py-2.5 rounded-xl bg-slate-100 text-xs text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-xs text-white font-bold shadow-md shadow-purple-200 transition-all"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
