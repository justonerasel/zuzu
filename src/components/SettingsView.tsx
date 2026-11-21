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
  Code2,
  Heart,
  Bot,
  Search,
  Zap,
  Disc,
  Sparkle,
  Radio,
  MapPin,
  GraduationCap,
  Github,
  RefreshCw,
  Sliders,
  Eye,
  EyeOff,
  VolumeX,
  Moon,
  ClipboardPaste,
  Square
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
  GfIntensity,
  ActiveTab
} from '../types';
import {
  PERSONALITIES,
  VOICE_IDENTITIES,
  GEMINI_VOICE_OPTIONS,
  GeminiVoiceOption,
  getDefaultGeminiVoiceForIdentity,
  resolveGeminiVoiceForSettings
} from '../constants/personalities';

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
import { 
  validateGeminiApiKey, 
  APP_VERSION 
} from '../utils/apiConfig';
import { 
  PERMISSION_DEFINITIONS, 
  PermissionCategoryId,
  PermissionDefinition, 
  PermissionStatusState, 
  checkAllPermissions, 
  handlePermissionAction, 
  requestAllRuntimePermissions,
  openAndroidSettings,
  openAndroidAppSettingsGuide, 
  checkMicrophonePermission, 
  requestMicrophonePermission, 
  MicrophonePermissionState 
} from '../utils/permission';
import { ParticleOrb, OrbState } from './ParticleOrb';
import { THEME_PRESETS, isValidHexColor, getThemeDetails } from '../utils/theme';
import { 
  registerZuAccount, 
  loginZuAccount, 
  syncZuCloudNow, 
  logoutZuAccount 
} from '../utils/zuAccount';
import { 
  syncBackgroundServicesWithSettings, 
  isForegroundServiceActive,
  setMicBusyForActiveSession
} from '../utils/backgroundService';
import { recordCustomAudioTrigger } from '../utils/audioTriggers';
import type { CustomAudioTrigger, CustomAudioTriggerKind } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onNavigateTab?: (tab: ActiveTab) => void;
}

export type SettingsCategoryId = 
  | 'profile'
  | 'zuzu_ai'
  | 'voice_speech'
  | 'personality'
  | 'orb_animation'
  | 'theme'
  | 'permissions'
  | 'background_wake'
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
    title: 'Gemini API & Connection',
    subtitle: 'One Google Gemini API key for both text & voice',
    icon: Key,
    badge: 'Gemini AI',
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
    title: 'Voice Identity & Speech',
    subtitle: 'Curated Gemini neural voices, preview & playback speed',
    icon: Volume2,
    badge: 'Gemini Voices',
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
    subtitle: 'All 30 Android audio, Bluetooth, network, background & device permissions',
    icon: ShieldCheck,
    badge: '30 Permissions',
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
    id: 'background_wake',
    title: 'Background Service & Wake Word',
    subtitle: 'Silent foreground service & Always-On "Wake up Zuzu" listener',
    icon: Radio,
    badge: 'Wake Word',
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
    id: 'about_developer',
    title: 'About & Developer',
    subtitle: `MD RASEL HOSSEN • Zuzu AI v${APP_VERSION} build info`,
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

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onUpdateSettings, onNavigateTab }) => {
  // Navigation State
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Profile state
  const [userNickname, setUserNickname] = useState(settings.userNickname || 'Rasel');
  const [assistantNickname, setAssistantNickname] = useState(settings.assistantNickname || 'Zuzu');
  const [isEditingAssistantNick, setIsEditingAssistantNick] = useState(false);
  const [greetingStyle, setGreetingStyle] = useState<'friendly' | 'formal' | 'cheerful'>('friendly');
  const [timeBasedGreetings, setTimeBasedGreetings] = useState(true);

  // Unified Google Gemini API & Connection State
  const [geminiKeyInput, setGeminiKeyInput] = useState(settings.customGeminiApiKey || '');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestStatus, setGeminiTestStatus] = useState<string | null>(null);
  const [geminiLatencyMs, setGeminiLatencyMs] = useState<number | null>(null);
  const [geminiValidation, setGeminiValidation] = useState<'idle' | 'validating' | 'valid' | 'failed'>('idle');

  useEffect(() => {
    setGeminiKeyInput(settings.customGeminiApiKey || '');
  }, [settings.customGeminiApiKey]);

  // Voice Preview & Filter State
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<'all' | 'female' | 'male'>('all');

  // Orb Live Preview State
  const [previewOrbState, setPreviewOrbState] = useState<OrbState>('idle');

  // Reset Confirmation Modal State
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [resetApiKeysToggle, setResetApiKeysToggle] = useState(false);

  // Custom Theme Input state
  const [customHexInput, setCustomHexInput] = useState(settings.customBgColor || '#FAF5FF');
  const [customHexError, setCustomHexError] = useState<string | null>(null);

  // Profile image error fallback state
  const [profileImgError, setProfileImgError] = useState(false);

  // Audio & Mic state
  const [micState, setMicState] = useState<MicrophonePermissionState>('prompt');
  const [isTestingMic, setIsTestingMic] = useState(false);

  // Permissions Center State (30 Comprehensive Android Permissions)
  const [permissionStatuses, setPermissionStatuses] = useState<Record<string, PermissionStatusState>>({});
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);
  const [isGrantingAllPerms, setIsGrantingAllPerms] = useState(false);
  const [permCategoryFilter, setPermCategoryFilter] = useState<PermissionCategoryId>('all');
  const [permActionLoadingId, setPermActionLoadingId] = useState<string | null>(null);
  const [permNotice, setPermNotice] = useState<string | null>(null);

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

  // ZU-ID Account State (Custom Username + Firebase Firestore)
  const [zuMode, setZuMode] = useState<'login' | 'register'>('login');
  const [zuUsernameInput, setZuUsernameInput] = useState(settings.zuUsername || settings.zuAccountId || '');
  const [zuFullNameInput, setZuFullNameInput] = useState(settings.zuFullName || settings.userNickname || '');
  const [zuPhoneInput, setZuPhoneInput] = useState(settings.zuPhone || '');
  const [zuPasswordInput, setZuPasswordInput] = useState('');
  const [zuConfirmPasswordInput, setZuConfirmPasswordInput] = useState('');
  const [showZuPassword, setShowZuPassword] = useState(false);
  const [newlyCreatedZuId, setNewlyCreatedZuId] = useState<string | null>(null);
  const [zuLoading, setZuLoading] = useState(false);
  const [zuStatusMsg, setZuStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings.userNickname) {
      setUserNickname(settings.userNickname);
    }
  }, [settings.userNickname]);

  // Background Service & Wake Word & Custom Audio Triggers State
  const [wakeWordDraft, setWakeWordDraft] = useState(settings.wakeWordPhrase || 'wake up zuzu');
  const [bgServiceStatus, setBgServiceStatus] = useState<string | null>(null);
  const [recordingTriggerKind, setRecordingTriggerKind] = useState<CustomAudioTriggerKind | null>(null);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [customTriggerLabel, setCustomTriggerLabel] = useState('');

  const handleRecordAudioTrigger = async (kind: CustomAudioTriggerKind) => {
    if (recordingTriggerKind) return;
    setRecordingTriggerKind(kind);
    setRecordingProgress(0);
    setBgServiceStatus(
      kind === 'whistle'
        ? 'Listening (2.2s)... Please whistle clearly into your mic!'
        : kind === 'snap'
        ? 'Listening (2.2s)... Snap your fingers sharply near the mic!'
        : 'Listening (2.2s)... Make your custom trigger sound now!'
    );
    playHapticSound('listen_start');
    setMicBusyForActiveSession(true);

    try {
      const trigger = await recordCustomAudioTrigger(kind, customTriggerLabel, (pct) => {
        setRecordingProgress(pct);
      });
      const existing = Array.isArray(settings.customAudioTriggers) ? settings.customAudioTriggers : [];
      const nextTriggers: CustomAudioTrigger[] = [trigger, ...existing].slice(0, 8);
      const updated = {
        ...settings,
        customTriggersEnabled: true,
        customAudioTriggers: nextTriggers
      };
      onUpdateSettings({
        customTriggersEnabled: true,
        customAudioTriggers: nextTriggers
      });
      setCustomTriggerLabel('');
      setBgServiceStatus(`Saved "${trigger.label}" (${trigger.peakHz} Hz) — active for silent background wake-up!`);
      playHapticSound('message_sent');
      await syncBackgroundServicesWithSettings(updated);
    } catch (err: any) {
      setBgServiceStatus(err?.message || 'Could not record audio trigger.');
      playHapticSound('listen_stop');
    } finally {
      setRecordingTriggerKind(null);
      setRecordingProgress(0);
      setMicBusyForActiveSession(false);
    }
  };

  const handleDeleteAudioTrigger = async (id: string) => {
    const existing = Array.isArray(settings.customAudioTriggers) ? settings.customAudioTriggers : [];
    const nextTriggers = existing.filter(t => t.id !== id);
    const updated = { ...settings, customAudioTriggers: nextTriggers };
    onUpdateSettings({ customAudioTriggers: nextTriggers });
    setBgServiceStatus('Custom audio trigger removed.');
    playHapticSound('listen_stop');
    await syncBackgroundServicesWithSettings(updated);
  };

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
    refreshAllPermissions();
    updateCounts();
  }, []);

  const updateCounts = () => {
    setChatCount(getChatMessages().length);
    setVoiceCount(getVoiceSessions().length);
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

  const handlePasteGeminiKey = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && clip.trim()) {
        setGeminiKeyInput(clip.trim());
        setGeminiValidation('idle');
        setGeminiLatencyMs(null);
        setGeminiTestStatus('Pasted key from clipboard. Tap Save & Apply or Test Connection.');
        playHapticSound('message_sent');
      } else {
        setGeminiTestStatus('Clipboard is empty.');
        playHapticSound('listen_stop');
      }
    } catch {
      setGeminiTestStatus('Clipboard access denied. Paste directly into the input field.');
      playHapticSound('listen_stop');
    }
  };

  const handleClearGeminiKey = () => {
    setGeminiKeyInput('');
    onUpdateSettings({
      customGeminiApiKey: '',
      geminiEnabled: true
    });
    setGeminiValidation('idle');
    setGeminiLatencyMs(null);
    setGeminiTestStatus('Gemini API key cleared.');
    playHapticSound('listen_stop');
  };

  const handleSaveAndApplyGemini = async () => {
    const keyToSave = geminiKeyInput.trim();
    onUpdateSettings({
      customGeminiApiKey: keyToSave,
      geminiEnabled: true
    });
    playHapticSound('message_sent');

    if (!keyToSave) {
      setGeminiValidation('idle');
      setGeminiLatencyMs(null);
      setGeminiTestStatus('Gemini API key cleared.');
      return;
    }

    setTestingGemini(true);
    setGeminiValidation('validating');
    setGeminiLatencyMs(null);
    setGeminiTestStatus('Applying configuration & verifying connection...');
    try {
      const result = await validateGeminiApiKey(keyToSave);
      if (result.success) {
        setGeminiValidation('valid');
        setGeminiLatencyMs(result.latencyMs || null);
        setGeminiTestStatus('Saved & connected for both Text & Voice conversations.');
        playHapticSound('listen_start');
      } else {
        setGeminiValidation('failed');
        setGeminiLatencyMs(null);
        setGeminiTestStatus(result.message || 'Saved, but connection check failed.');
        playHapticSound('listen_stop');
      }
    } catch (err: any) {
      setGeminiValidation('failed');
      setGeminiLatencyMs(null);
      setGeminiTestStatus(err?.message || 'Saved, but network unreachable.');
      playHapticSound('listen_stop');
    } finally {
      setTestingGemini(false);
    }
  };

  const handleTestGemini = async () => {
    const keyToTest = geminiKeyInput.trim() || settings.customGeminiApiKey.trim();
    if (!keyToTest) {
      setGeminiValidation('idle');
      setGeminiLatencyMs(null);
      setGeminiTestStatus('Please enter a Gemini API key first.');
      playHapticSound('listen_stop');
      return;
    }

    setTestingGemini(true);
    setGeminiValidation('validating');
    setGeminiLatencyMs(null);
    setGeminiTestStatus('Testing Google Gemini connection...');
    playHapticSound('message_sent');
    try {
      const result = await validateGeminiApiKey(keyToTest);
      if (result.success) {
        setGeminiValidation('valid');
        setGeminiLatencyMs(result.latencyMs || null);
        setGeminiTestStatus(result.message || 'Connected to Google Gemini.');
        playHapticSound('listen_start');
      } else {
        setGeminiValidation('failed');
        setGeminiLatencyMs(null);
        setGeminiTestStatus(result.message || 'Connection failed: Invalid API key.');
        playHapticSound('listen_stop');
      }
    } catch (err: any) {
      setGeminiValidation('failed');
      setGeminiLatencyMs(null);
      setGeminiTestStatus(err?.message || 'Network error verifying Gemini API.');
      playHapticSound('listen_stop');
    } finally {
      setTestingGemini(false);
    }
  };

  const handlePreviewGeminiVoice = (voice: GeminiVoiceOption) => {
    if (previewingVoiceId === voice.id) {
      stopSpeaking();
      setPreviewingVoiceId(null);
      return;
    }

    stopSpeaking();
    setPreviewingVoiceId(voice.id);
    playHapticSound('switch');

    speakText({
      text: voice.previewSample,
      voiceIdentity: voice.gender,
      voiceName: voice.id,
      volume: settings.volume ?? 1.0,
      customGeminiKey: settings.customGeminiApiKey,
      speechRate: settings.speechRate || 1.0,
      onStart: () => setPreviewingVoiceId(voice.id),
      onEnd: () => setPreviewingVoiceId(null),
      onError: () => setPreviewingVoiceId(null)
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
    // Reset general configuration while preserving Gemini API key (unless opted out), ZU-ID session, memories & chat history
    const newSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      customGeminiApiKey: resetApiKeysToggle ? '' : (settings.customGeminiApiKey || ''),
      userNickname: settings.userNickname,
      assistantNickname: settings.assistantNickname,
      zuAccountId: settings.zuAccountId,
      zuUsername: settings.zuUsername,
      zuFullName: settings.zuFullName,
      zuPhone: settings.zuPhone,
      zuToken: settings.zuToken,
      zuVaultKey: settings.zuVaultKey,
      zuLastSyncedAt: settings.zuLastSyncedAt
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
                      Zuzu AI v{APP_VERSION} • Personalize your assistant
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

            {/* Branding Banner */}
            <div className="p-3.5 bg-gradient-to-r from-purple-100/90 via-indigo-50 to-blue-50 border border-purple-200/80 rounded-2xl shadow-xs flex items-center justify-between text-slate-800">
              <div className="flex items-center gap-3">
                <img
                  src="/zuzu-logo.png"
                  alt="Zuzu AI"
                  className="w-16 h-16 rounded-2xl object-cover shadow-md border border-purple-200 flex-shrink-0"
                />
                <div>
                  <div className="text-sm font-extrabold flex items-center gap-1.5">
                    <span>Zuzu AI</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Voice Identity &amp; Expression • Intelligent Android Assistant
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-purple-700 font-bold bg-white/80 px-2 py-0.5 rounded-md border border-purple-200">
                  v{APP_VERSION}
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
                {onNavigateTab ? (
                  <button
                    type="button"
                    onClick={() => {
                      playHapticSound('switch');
                      onNavigateTab('history');
                    }}
                    className="text-[10px] font-mono text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-0.5 rounded-full border border-purple-200 font-bold flex items-center gap-1 transition-colors"
                  >
                    <span>Open History</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                ) : (
                  <span className="text-[10px] font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200 font-bold">
                    Active
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    playHapticSound('switch');
                    onNavigateTab?.('chat');
                  }}
                  className="p-2 bg-purple-50/50 hover:bg-purple-100/60 border border-purple-100/60 rounded-xl transition-colors"
                >
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Chat Messages</div>
                  <div className="text-base font-extrabold text-purple-700">{chatCount}</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playHapticSound('switch');
                    onNavigateTab?.('history');
                  }}
                  className="p-2 bg-blue-50/50 hover:bg-blue-100/60 border border-blue-100/60 rounded-xl transition-colors"
                >
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Voice Sessions</div>
                  <div className="text-base font-extrabold text-blue-700">{voiceCount}</div>
                </button>
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
                Category {CATEGORIES.findIndex(c => c.id === activeCategory) + 1} of {CATEGORIES.length}
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

                {/* Custom Username & ZU-ID Account Login + Firebase Cloud Persistent Memory Card */}
                <div className="p-4 bg-white/95 border border-indigo-200 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <img
                        src="/zuzu-logo.png"
                        alt="Zuzu AI ZU-ID"
                        className="w-12 h-12 rounded-xl object-cover border border-indigo-200 shadow-xs flex-shrink-0"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>ZU-ID Cloud Account</span>
                          <span className="text-[9px] font-mono font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded">
                            ZU-ID
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Firebase Firestore backup • Custom Username login
                        </div>
                      </div>
                    </div>
                    {settings.zuAccountId && settings.zuVaultKey && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        ZU-{settings.zuUsername || settings.zuAccountId}
                      </span>
                    )}
                  </div>

                  {settings.zuAccountId && settings.zuVaultKey ? (
                    <div className="space-y-2.5 pt-1 border-t border-slate-100">
                      {newlyCreatedZuId && (
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-950 space-y-0.5">
                          <div className="font-extrabold">Account Ready: <span className="font-mono text-emerald-700">{newlyCreatedZuId}</span></div>
                          <div className="text-[10px] text-emerald-800">Log in anytime using your custom Username and password to restore all chats &amp; memories.</div>
                        </div>
                      )}

                      <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 text-[11px] flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-indigo-900 truncate">
                            {settings.zuFullName || settings.userNickname || 'Zuzu User'} • <span className="font-mono">ZU-{settings.zuUsername || settings.zuAccountId}</span>
                          </div>
                          {settings.zuPhone && (
                            <div className="text-[10px] text-slate-600 truncate">Identifier: {settings.zuPhone}</div>
                          )}
                          <div className="text-[10px] text-slate-500">
                            Last synced: {settings.zuLastSyncedAt ? new Date(settings.zuLastSyncedAt).toLocaleString() : 'Just now'}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex-shrink-0">
                          Firebase ✓
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={zuLoading}
                          onClick={async () => {
                            setZuLoading(true);
                            setZuStatusMsg(null);
                            try {
                              const res = await syncZuCloudNow(settings);
                              setZuStatusMsg(res.message);
                              if (res.success && res.lastSyncedAt) {
                                onUpdateSettings({ zuLastSyncedAt: res.lastSyncedAt });
                                playHapticSound('message_sent');
                              }
                            } finally {
                              setZuLoading(false);
                            }
                          }}
                          className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1 shadow-xs disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${zuLoading ? 'animate-spin' : ''}`} />
                          <span>{zuLoading ? 'Syncing...' : 'Sync Now'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const next = logoutZuAccount();
                            onUpdateSettings(next);
                            setNewlyCreatedZuId(null);
                            setZuPasswordInput('');
                            setZuConfirmPasswordInput('');
                            setZuStatusMsg('Signed out of ZU-ID Account.');
                            playHapticSound('listen_stop');
                          }}
                          className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 pt-1 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => { setZuMode('login'); setZuStatusMsg(null); }}
                          className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                            zuMode === 'login' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'
                          }`}
                        >
                          Login (ZU-ID)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setZuMode('register'); setZuStatusMsg(null); }}
                          className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                            zuMode === 'register' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'
                          }`}
                        >
                          Register Custom ZU-ID
                        </button>
                      </div>

                      {zuMode === 'login' ? (
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-500 px-0.5">
                            Username or ZU-ID
                          </label>
                          <input
                            type="text"
                            value={zuUsernameInput}
                            onChange={(e) => setZuUsernameInput(e.target.value)}
                            placeholder="Enter your Username (e.g. rasel008 or ZU-rasel008)"
                            className="w-full bg-slate-50 text-xs font-mono text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-400"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-500 px-0.5">
                              Choose Custom Username / ZU-ID (Letters &amp; Numbers)
                            </label>
                            <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 focus-within:border-indigo-400 overflow-hidden">
                              <span className="px-2.5 py-2 text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 border-r border-slate-200">
                                ZU-
                              </span>
                              <input
                                type="text"
                                value={zuUsernameInput.replace(/^(zu|su)-/i, '')}
                                onChange={(e) => setZuUsernameInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                                placeholder="e.g. Rasel008"
                                className="flex-1 bg-transparent text-xs font-mono text-slate-800 px-2.5 py-2 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-500 px-0.5">
                              Full Name (Display Name)
                            </label>
                            <input
                              type="text"
                              value={zuFullNameInput}
                              onChange={(e) => setZuFullNameInput(e.target.value)}
                              placeholder="e.g. MD Rasel Hossen"
                              className="w-full bg-slate-50 text-xs text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-400"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-500 px-0.5">
                              Phone Number / Recovery Identifier (Optional)
                            </label>
                            <input
                              type="text"
                              value={zuPhoneInput}
                              onChange={(e) => setZuPhoneInput(e.target.value)}
                              placeholder="e.g. +88017XXXXXXXX or email"
                              className="w-full bg-slate-50 text-xs text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-400"
                            />
                          </div>
                        </>
                      )}

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-500 px-0.5">
                          {zuMode === 'register' ? 'Secure Password (min 6 chars)' : 'Password'}
                        </label>
                        <div className="relative">
                          <input
                            type={showZuPassword ? 'text' : 'password'}
                            value={zuPasswordInput}
                            onChange={(e) => setZuPasswordInput(e.target.value)}
                            placeholder={zuMode === 'register' ? 'Create secure password (min 6 chars)' : 'Enter your ZU-ID password'}
                            className="w-full bg-slate-50 text-xs text-slate-800 pl-3 pr-9 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowZuPassword(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            title={showZuPassword ? 'Hide password' : 'Show password'}
                          >
                            {showZuPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {zuMode === 'register' && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-500 px-0.5">
                            Confirm Password
                          </label>
                          <input
                            type={showZuPassword ? 'text' : 'password'}
                            value={zuConfirmPasswordInput}
                            onChange={(e) => setZuConfirmPasswordInput(e.target.value)}
                            placeholder="Re-enter password to confirm"
                            className="w-full bg-slate-50 text-xs text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-400"
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={zuLoading}
                        onClick={async () => {
                          setZuLoading(true);
                          setZuStatusMsg(null);
                          try {
                            if (zuMode === 'register') {
                              const res = await registerZuAccount({
                                username: zuUsernameInput,
                                fullName: zuFullNameInput,
                                phone: zuPhoneInput,
                                password: zuPasswordInput,
                                confirmPassword: zuConfirmPasswordInput
                              });
                              setZuStatusMsg(res.message);
                              if (res.success && res.username) {
                                setZuUsernameInput(res.username);
                                setNewlyCreatedZuId(`ZU-${res.username}`);
                                setZuPasswordInput('');
                                setZuConfirmPasswordInput('');
                                if (res.fullName) {
                                  setUserNickname(res.fullName);
                                }
                                if (res.restoredSettings) {
                                  onUpdateSettings(res.restoredSettings);
                                }
                                playHapticSound('message_sent');
                              } else {
                                playHapticSound('listen_stop');
                              }
                            } else {
                              const res = await loginZuAccount(zuUsernameInput, zuPasswordInput);
                              setZuStatusMsg(res.message);
                              if (res.success) {
                                setZuPasswordInput('');
                                setNewlyCreatedZuId(null);
                                if (res.restoredSettings) {
                                  onUpdateSettings(res.restoredSettings);
                                  if (res.restoredSettings.userNickname) {
                                    setUserNickname(res.restoredSettings.userNickname);
                                  }
                                }
                                setMemories(getMemories());
                                updateCounts();
                                playHapticSound('switch');
                              } else {
                                playHapticSound('listen_stop');
                              }
                            }
                          } catch (err: any) {
                            setZuStatusMsg(err?.message || 'Firebase ZU-ID connection failed.');
                          } finally {
                            setZuLoading(false);
                          }
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs disabled:opacity-50"
                      >
                        {zuLoading
                          ? 'Connecting to Firebase Cloud...'
                          : zuMode === 'register'
                          ? 'Create ZU-ID & Sign In'
                          : 'Sign In & Restore All Memory'}
                      </button>
                    </div>
                  )}

                  {zuStatusMsg && (
                    <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900 font-medium">
                      {zuStatusMsg}
                    </div>
                  )}
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
            {/* 2. UNIFIED GEMINI API & CONNECTION SUB-PAGE                 */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'zuzu_ai' && (
              <div className="space-y-3.5 animate-fade-in text-slate-800">
                <div className="p-4 bg-white/95 border border-blue-200 rounded-2xl shadow-xs space-y-3.5">
                  {/* Header & Connection Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                        <Key className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-slate-800">
                          Gemini API &amp; Connection
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Powers both Text &amp; Voice conversations
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                          geminiValidation === 'valid'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : geminiValidation === 'failed'
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            geminiValidation === 'valid'
                              ? 'bg-emerald-500'
                              : geminiValidation === 'failed'
                              ? 'bg-rose-500'
                              : geminiValidation === 'validating'
                              ? 'bg-blue-500 animate-pulse'
                              : 'bg-slate-400'
                          }`}
                        />
                        <span>
                          {geminiValidation === 'valid'
                            ? 'Connected'
                            : geminiValidation === 'failed'
                            ? 'Error'
                            : geminiValidation === 'validating'
                            ? 'Checking...'
                            : 'Disconnected'}
                        </span>
                      </span>
                      {geminiValidation === 'valid' && geminiLatencyMs !== null && (
                        <span className="text-[9px] font-mono text-emerald-700 font-semibold">
                          Latency: {geminiLatencyMs}ms
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Single Key Input + Show/Hide */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                      <span>Google Gemini API Key</span>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 flex items-center gap-0.5 font-semibold"
                      >
                        <span>Get free key</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>

                    <div className="relative">
                      <input
                        type={showGeminiKey ? 'text' : 'password'}
                        value={geminiKeyInput}
                        onChange={(e) => {
                          setGeminiKeyInput(e.target.value);
                          setGeminiValidation('idle');
                          setGeminiLatencyMs(null);
                          setGeminiTestStatus(null);
                        }}
                        placeholder="AIzaSy..."
                        className="w-full bg-slate-50 text-xs font-mono text-slate-800 px-3 py-2.5 pr-9 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                        title={showGeminiKey ? 'Hide API Key' : 'Show API Key'}
                      >
                        {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Paste Clipboard & Clear */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handlePasteGeminiKey}
                        className="py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
                        <span>Paste Clipboard</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClearGeminiKey}
                        disabled={!geminiKeyInput && !settings.customGeminiApiKey}
                        className="py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-rose-50 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-slate-600 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear</span>
                      </button>
                    </div>

                    {/* Test Connection & Save & Apply Configuration */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleTestGemini}
                        disabled={testingGemini}
                        className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${testingGemini ? 'animate-spin' : ''}`} />
                        <span>{testingGemini ? 'Testing...' : 'Test Connection'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveAndApplyGemini}
                        disabled={testingGemini}
                        className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save &amp; Apply</span>
                      </button>
                    </div>
                  </div>

                  {/* Status / Diagnostic Message */}
                  {geminiTestStatus && (
                    <div
                      className={`p-2.5 rounded-xl border text-[11px] font-medium flex items-start gap-2 ${
                        geminiValidation === 'valid'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : geminiValidation === 'failed'
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-blue-50 border-blue-200 text-blue-900'
                      }`}
                    >
                      {geminiValidation === 'valid' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : geminiValidation === 'failed' ? (
                        <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      )}
                      <span>{geminiTestStatus}</span>
                    </div>
                  )}
                </div>

                {/* API Key Security Notice */}
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-start gap-2.5 text-slate-600">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="text-[10px] leading-relaxed">
                    <strong className="text-slate-800">Local Key Storage:</strong> Your Google Gemini API key is saved privately on this device and used for both text chat and voice conversations.
                  </div>
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------- */}
            {/* 3. VOICE & SPEECH SUB-PAGE — CURATED GEMINI VOICES          */}
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
                      {resolveGeminiVoiceForSettings(settings.geminiVoiceName, settings.activeIdentity).name}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => {
                        const curr = resolveGeminiVoiceForSettings(settings.geminiVoiceName, 'male');
                        const nextVoice = curr.gender === 'male' ? curr.id : getDefaultGeminiVoiceForIdentity('male').id;
                        onUpdateSettings({ activeIdentity: 'male', geminiVoiceName: nextVoice });
                        playHapticSound('switch');
                      }}
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
                      <p className="text-[10px] text-slate-500">Articulate, warm &amp; grounded</p>
                    </button>

                    <button
                      onClick={() => {
                        const curr = resolveGeminiVoiceForSettings(settings.geminiVoiceName, 'female');
                        const nextVoice = curr.gender === 'female' ? curr.id : getDefaultGeminiVoiceForIdentity('female').id;
                        onUpdateSettings({ activeIdentity: 'female', geminiVoiceName: nextVoice });
                        playHapticSound('switch');
                      }}
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
                      <p className="text-[10px] text-slate-500">Warm, natural &amp; melodic</p>
                    </button>
                  </div>
                </div>

                {/* Gemini Prebuilt Voices Selector */}
                <div className="p-4 bg-white/95 border border-emerald-100 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Gemini Neural Voices</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                      {GEMINI_VOICE_OPTIONS.length} Voices
                    </span>
                  </div>

                  {/* Gender Filter Tabs */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'all', label: `All (${GEMINI_VOICE_OPTIONS.length})` },
                      { id: 'female', label: `♀ Female (${GEMINI_VOICE_OPTIONS.filter(v => v.gender === 'female').length})` },
                      { id: 'male', label: `♂ Male (${GEMINI_VOICE_OPTIONS.filter(v => v.gender === 'male').length})` }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setVoiceGenderFilter(tab.id as any)}
                        className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all ${
                          voiceGenderFilter === tab.id
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {GEMINI_VOICE_OPTIONS.filter(v => voiceGenderFilter === 'all' || v.gender === voiceGenderFilter).map((voice) => {
                      const activeVoice = resolveGeminiVoiceForSettings(settings.geminiVoiceName, settings.activeIdentity);
                      const isSelected = activeVoice.id === voice.id;
                      const isPreviewing = previewingVoiceId === voice.id;
                      return (
                        <div
                          key={voice.id}
                          className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-emerald-50/90 border-emerald-400 shadow-xs ring-1 ring-emerald-300/40'
                              : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/60'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800">{voice.name}</span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                  voice.gender === 'female'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                              >
                                {voice.gender === 'female' ? '♀ Female' : '♂ Male'}
                              </span>
                              <span className="text-[9px] font-mono bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-600">
                                {voice.toneTag}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{voice.description}</div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handlePreviewGeminiVoice(voice)}
                              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors ${
                                isPreviewing
                                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                              }`}
                              title="Preview this voice"
                            >
                              {isPreviewing ? (
                                <Square className="w-2.5 h-2.5 fill-current" />
                              ) : (
                                <Play className="w-2.5 h-2.5 fill-current" />
                              )}
                              <span>{isPreviewing ? 'Stop' : 'Preview'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onUpdateSettings({
                                  geminiVoiceName: voice.id,
                                  activeIdentity: voice.gender
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
            {/* 7. PERMISSIONS SUB-PAGE (30 Comprehensive Android Access)   */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'permissions' && (() => {
              const grantedCount = PERMISSION_DEFINITIONS.filter(
                p => permissionStatuses[p.id] === 'granted'
              ).length;
              const filteredPerms = PERMISSION_DEFINITIONS.filter(
                p => permCategoryFilter === 'all' || p.category === permCategoryFilter
              );

              return (
                <div className="space-y-3.5 animate-fade-in text-slate-800">
                  {/* Assistant Permissions Explanation Card */}
                  <div className="p-4 bg-gradient-to-r from-teal-50 via-cyan-50 to-blue-50 border border-teal-200/80 rounded-2xl shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-teal-600" />
                        <span>Android Permissions Center</span>
                      </span>
                      <span className="text-[9px] font-mono font-bold bg-white text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
                        {grantedCount} / {PERMISSION_DEFINITIONS.length} Active
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Full 30-permission native Android suite covering live audio &amp; Bluetooth routing, network sync, silent foreground wake lock, overlays, GPS weather, calls, contacts, storage, and vision.
                    </p>
                  </div>

                  {/* Permissions Toolbar: Quick actions */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={isGrantingAllPerms}
                      onClick={async () => {
                        setIsGrantingAllPerms(true);
                        setPermNotice(null);
                        playHapticSound('message_sent');
                        try {
                          const res = await requestAllRuntimePermissions();
                          setPermissionStatuses(res.statuses);
                          if (res.statuses.microphone) {
                            setMicState(res.statuses.microphone as MicrophonePermissionState);
                          }
                          setPermNotice(res.message);
                          playHapticSound('listen_start');
                        } finally {
                          setIsGrantingAllPerms(false);
                        }
                      }}
                      className="py-2 px-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-[11px] font-bold shadow-xs flex items-center justify-center gap-1 transition-colors"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isGrantingAllPerms ? 'animate-spin' : ''}`} />
                      <span>{isGrantingAllPerms ? 'Granting...' : 'Grant Runtime'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={refreshAllPermissions}
                      disabled={isCheckingPermissions}
                      className="py-2 px-2 rounded-xl bg-white/90 hover:bg-white text-slate-700 text-[11px] font-bold border border-teal-200/80 shadow-xs flex items-center justify-center gap-1 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-teal-600 ${isCheckingPermissions ? 'animate-spin' : ''}`} />
                      <span>{isCheckingPermissions ? 'Checking...' : 'Re-check All'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={openAndroidAppSettingsGuide}
                      className="py-2 px-2 rounded-xl bg-teal-100/90 hover:bg-teal-200 text-teal-900 text-[11px] font-bold border border-teal-300 shadow-xs flex items-center justify-center gap-1 transition-colors"
                      title="Open Android App Settings directly"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-teal-700" />
                      <span>App Settings</span>
                    </button>
                  </div>

                  {/* Category Filter Pills */}
                  <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl">
                    {[
                      { id: 'all' as PermissionCategoryId, label: 'All (30)' },
                      { id: 'audio' as PermissionCategoryId, label: 'Audio & BT (6)' },
                      { id: 'system' as PermissionCategoryId, label: 'System (16)' },
                      { id: 'device' as PermissionCategoryId, label: 'Device (8)' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setPermCategoryFilter(tab.id);
                          playHapticSound('switch');
                        }}
                        className={`py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all ${
                          permCategoryFilter === tab.id
                            ? 'bg-white text-teal-800 shadow-xs'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
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

                  {/* Comprehensive Permission Cards */}
                  <div className="space-y-2">
                    {filteredPerms.map(def => {
                      const status = permissionStatuses[def.id] || (def.permissionType === 'manifest' ? 'granted' : def.isSpecialSystemSetting ? 'system_required' : 'prompt');
                      const isLoading = permActionLoadingId === def.id;
                      const Icon = def.category === 'audio' ? (def.id === 'microphone' ? Mic : Volume2) : def.category === 'device' ? MapPin : Radio;

                      return (
                        <div
                          key={def.id}
                          className="p-3 bg-white/95 border border-teal-100 rounded-2xl shadow-xs flex items-center justify-between gap-2.5 text-slate-800"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200/60 text-teal-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 truncate">
                                {def.name}
                              </div>
                              <div className="text-[9px] font-mono text-teal-700/80 truncate">
                                {def.androidManifestName}
                              </div>
                              <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                                {def.whyNeeded}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 font-bold border ${
                              status === 'granted'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : status === 'system_required'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}>
                              {status === 'granted' ? (
                                <>
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>GRANTED</span>
                                </>
                              ) : status === 'system_required' ? (
                                <>
                                  <Sliders className="w-2.5 h-2.5 text-amber-700" />
                                  <span>SYSTEM REQ</span>
                                </>
                              ) : (
                                <>
                                  <ShieldAlert className="w-2.5 h-2.5 text-rose-600" />
                                  <span>NEEDED</span>
                                </>
                              )}
                            </span>

                            <button
                              onClick={() => handlePermAction(def.id)}
                              disabled={isLoading}
                              className={`py-1 px-2.5 rounded-xl text-[10px] font-bold flex items-center gap-1 transition-all shadow-xs ${
                                status === 'granted'
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : status === 'system_required'
                                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                  : 'bg-teal-600 hover:bg-teal-700 text-white'
                              }`}
                            >
                              {isLoading ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : status === 'granted' ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              <span>
                                {isLoading
                                  ? '...'
                                  : status === 'granted'
                                  ? 'Active ✓'
                                  : def.isSpecialSystemSetting
                                  ? 'Configure'
                                  : 'Grant'}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Transparent Permissions & Assistant Sandbox Card */}
                  <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-md space-y-2.5 mt-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-teal-400" />
                      <span className="text-xs font-bold text-teal-300 uppercase tracking-wide">
                        Full 30-Permission Assistant Suite
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Every Android capability—from silent background Wake Word and Bluetooth headset routing to GPS weather, hands-free calling, contacts, storage, overlays, and camera vision—is transparently controlled right here on your device.
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* ----------------------------------------------------------- */}
            {/* 8. BACKGROUND SERVICE & WAKE WORD SUB-PAGE                  */}
            {/* ----------------------------------------------------------- */}
            {activeCategory === 'background_wake' && (
              <div className="space-y-3.5 animate-fade-in text-slate-800">
                {/* 1. Silent Foreground Service & Battery Exemption */}
                <div className="p-4 bg-white/95 border border-indigo-200 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">Android Foreground Service</div>
                        <div className="text-[10px] text-slate-500">100% silent persistent notification + WakeLock reliability</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const nextVal = !settings.foregroundServiceEnabled;
                        const updated = { ...settings, foregroundServiceEnabled: nextVal };
                        onUpdateSettings({ foregroundServiceEnabled: nextVal });
                        await syncBackgroundServicesWithSettings(updated);
                        setBgServiceStatus(nextVal ? 'Silent background service active.' : 'Background service paused.');
                        playHapticSound('switch');
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                        settings.foregroundServiceEnabled
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {settings.foregroundServiceEnabled ? 'Active' : 'Off'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100 text-[11px]">
                    <span className="text-slate-700 font-medium">
                      Service Status: <strong className="text-indigo-800">{isForegroundServiceActive() ? 'Running Silently' : 'Standby'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        openAndroidSettings('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
                        setBgServiceStatus('Opening Android Battery Optimization settings...');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 font-bold text-[10px] hover:bg-indigo-100"
                    >
                      Ignore Battery Opt
                    </button>
                  </div>
                </div>

                {/* 2. Always-On Wake Word Listener */}
                <div className="p-4 bg-white/95 border border-purple-200 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                        <Mic className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">Always-On Wake Word</div>
                        <div className="text-[10px] text-slate-500">Hands-free silent trigger even while using other tabs</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const nextVal = !settings.wakeWordEnabled;
                        const updated = { ...settings, wakeWordEnabled: nextVal };
                        onUpdateSettings({ wakeWordEnabled: nextVal });
                        await syncBackgroundServicesWithSettings(updated);
                        setBgServiceStatus(nextVal ? 'Wake word listener started silently.' : 'Wake word listener stopped.');
                        playHapticSound('switch');
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                        settings.wakeWordEnabled
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {settings.wakeWordEnabled ? 'Listening' : 'Off'}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={wakeWordDraft}
                      onChange={(e) => setWakeWordDraft(e.target.value)}
                      placeholder="Wake up Zuzu"
                      className="flex-1 bg-slate-50 text-xs text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-purple-400"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const clean = wakeWordDraft.trim() || 'wake up zuzu';
                        setWakeWordDraft(clean);
                        const updated = { ...settings, wakeWordPhrase: clean };
                        onUpdateSettings({ wakeWordPhrase: clean });
                        await syncBackgroundServicesWithSettings(updated);
                        setBgServiceStatus(`Wake phrase updated to "${clean}"`);
                        playHapticSound('message_sent');
                      }}
                      className="px-3 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700"
                    >
                      Save
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('zuzu-wake-word-triggered', {
                          detail: { triggerType: 'voice', transcript: settings.wakeWordPhrase || 'Wake up Zuzu', remainingCommand: '' }
                        })
                      );
                    }}
                    className="w-full py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-[11px] font-bold"
                  >
                    Test Wake Word Trigger ("{settings.wakeWordPhrase || 'Wake up Zuzu'}")
                  </button>
                </div>

                {/* 3. Custom Audio Triggers (Mouth Whistle & Finger Snap Detection) */}
                <div className="p-4 bg-white/95 border border-indigo-200 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                        <Volume2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">Custom Audio Triggers (Whistle / Snap)</div>
                        <div className="text-[10px] text-slate-500">Wake Zuzu silently with a mouth whistle (শিস) or finger snap</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const nextVal = !(settings.customTriggersEnabled !== false);
                        const updated = { ...settings, customTriggersEnabled: nextVal };
                        onUpdateSettings({ customTriggersEnabled: nextVal });
                        await syncBackgroundServicesWithSettings(updated);
                        setBgServiceStatus(nextVal ? 'Custom whistle & snap detection active.' : 'Custom audio triggers paused.');
                        playHapticSound('switch');
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                        settings.customTriggersEnabled !== false
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {settings.customTriggersEnabled !== false ? 'Active' : 'Off'}
                    </button>
                  </div>

                  <input
                    type="text"
                    value={customTriggerLabel}
                    onChange={(e) => setCustomTriggerLabel(e.target.value)}
                    placeholder="Optional trigger name (e.g. My Whistle, Double Snap)"
                    className="w-full bg-slate-50 text-xs text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-400"
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={Boolean(recordingTriggerKind)}
                      onClick={() => handleRecordAudioTrigger('whistle')}
                      className="py-2 px-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-900 border border-indigo-200 text-[11px] font-bold flex flex-col items-center gap-1 transition-colors"
                    >
                      <Mic className={`w-3.5 h-3.5 text-indigo-600 ${recordingTriggerKind === 'whistle' ? 'animate-ping' : ''}`} />
                      <span>Whistle (শিস)</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(recordingTriggerKind)}
                      onClick={() => handleRecordAudioTrigger('snap')}
                      className="py-2 px-2 rounded-xl bg-purple-50 hover:bg-purple-100 disabled:opacity-50 text-purple-900 border border-purple-200 text-[11px] font-bold flex flex-col items-center gap-1 transition-colors"
                    >
                      <Zap className={`w-3.5 h-3.5 text-purple-600 ${recordingTriggerKind === 'snap' ? 'animate-ping' : ''}`} />
                      <span>Finger Snap</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(recordingTriggerKind)}
                      onClick={() => handleRecordAudioTrigger('custom')}
                      className="py-2 px-2 rounded-xl bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-800 border border-slate-200 text-[11px] font-bold flex flex-col items-center gap-1 transition-colors"
                    >
                      <Plus className={`w-3.5 h-3.5 text-slate-600 ${recordingTriggerKind === 'custom' ? 'animate-spin' : ''}`} />
                      <span>Custom Sound</span>
                    </button>
                  </div>

                  {recordingTriggerKind && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-indigo-700">
                        <span>Recording {recordingTriggerKind} acoustic signature...</span>
                        <span>{recordingProgress}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-indigo-100 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-100"
                          style={{ width: `${recordingProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {Array.isArray(settings.customAudioTriggers) && settings.customAudioTriggers.length > 0 ? (
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Saved Audio Triggers ({settings.customAudioTriggers.length})
                      </div>
                      {settings.customAudioTriggers.map(trig => (
                        <div
                          key={trig.id}
                          className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                              <span>{trig.label}</span>
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 uppercase">
                                {trig.kind}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Peak {trig.peakHz} Hz • Crest {trig.crestFactor}x
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                window.dispatchEvent(
                                  new CustomEvent('zuzu-wake-word-triggered', {
                                    detail: { triggerType: trig.kind, triggerLabel: trig.label, transcript: trig.label, remainingCommand: '' }
                                  })
                                );
                              }}
                              className="p-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 transition-colors"
                              title="Test Trigger Response"
                            >
                              <Play className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAudioTrigger(trig.id)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                              title="Delete Trigger"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-[11px] text-slate-500 text-center">
                      No custom sound triggers saved yet. Tap Whistle (শিস) or Finger Snap above to record yours!
                    </div>
                  )}

                  {bgServiceStatus && (
                    <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900 font-medium">
                      {bgServiceStatus}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ----------------------------------------------------------- */}
            {/* 9. ABOUT & DEVELOPER SUB-PAGE (Requirement 11)              */}
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
                <div className="p-4 bg-white/90 border border-slate-200/80 rounded-2xl shadow-xs space-y-2.5 text-center flex flex-col items-center">
                  <img
                    src="/zuzu-logo.png"
                    alt="Zuzu AI"
                    className="w-20 h-20 rounded-2xl object-cover shadow-md border border-purple-200"
                  />
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold border border-purple-200">
                    <span>Zuzu AI</span>
                    <span className="text-[10px] font-mono opacity-60">• v{APP_VERSION}-android</span>
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

