import { AppSettings, ChatMessage, VoiceSession, VoiceMessage, VoiceIdentity, PersonalityId, UserMemory, NotebookNote, UserReminder } from '../types';
import { getGeminiVoiceByName, getDefaultGeminiVoiceForIdentity } from '../constants/personalities';
import { getNotesList, setNotesList, getRemindersList, setRemindersList } from './assistantStore';

const STORAGE_KEYS = {
  CHAT_HISTORY: 'zuzu_chat_history_v2',
  VOICE_SESSIONS: 'zuzu_voice_sessions_v2',
  SETTINGS: 'zuzu_settings_v2',
  MEMORIES: 'zuzu_memories_v2',
  LEGACY_ARCHIVE: 'zuzu_unclassified_archive_v2'
};

function notifyZuDataChanged(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('zuzu-zu-data-changed'));
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeIdentity: 'male',
  activePersonality: 'Normal',
  customPersonalityPrompt: '',
  continuousListening: true,
  memoryEnabled: true, // Long-term memory active by default

  // Unified Google Gemini AI Configuration (powers both Text & Voice)
  geminiEnabled: true,
  customGeminiApiKey: '',
  geminiVoiceName: 'Orus',

  // Voice Calibration & Speech Preferences
  speechRate: 1.0,
  soundEffects: true,
  recognitionLanguage: 'auto',
  viewMode: 'android_frame',

  // 4-Style Custom Dot/Particle Orb Defaults
  orbStyle: 'purple_spiral_globe',
  orbColor: 'purple',
  orbRotationSpeed: 'normal',
  orbGlowIntensity: 'medium',
  orbParticleDensity: 'standard',

  // Theme & Appearance Defaults
  themePreset: 'lavender',
  customBgColor: '#FAF5FF',
  customCardColor: '#FFFFFF',
  customAccentColor: '#8B5CF6',

  // Profile & Identity
  userNickname: 'Rasel',
  assistantNickname: 'Zuzu', // Can be customized (e.g. Maya)
  aiNickname: 'Zuzu AI',
  greetingStyle: 'friendly',
  timeBasedGreetings: true,

  // GF Mode Defaults
  gfIntensity: 'sweet',
  gfGreetingEnabled: false,

  // Audio volume
  volume: 1.0,

  // Weather Persistence Defaults
  lastWeatherCity: 'Dhaka',
  lastWeatherCountry: 'Bangladesh',
  lastWeatherLat: 23.8103,
  lastWeatherLon: 90.4125,
  lastWeatherIsGPS: false,

  // Background Service & Always-On Wake Word & Custom Audio Triggers
  foregroundServiceEnabled: true,
  wakeWordEnabled: true,
  wakeWordPhrase: 'wake up zuzu',
  customTriggersEnabled: true,
  customAudioTriggers: [],

  // ZU-ID Account Persistence
  zuAccountId: undefined,
  zuUsername: undefined,
  zuFullName: undefined,
  zuPhone: undefined,
  zuToken: undefined,
  zuVaultKey: undefined,
  zuLastSyncedAt: undefined
};


// Initial Seed Data for first run
const SEED_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'seed-chat-1',
    conversation_type: 'text',
    sender: 'assistant',
    text: 'Welcome to Zuzu AI. This is your dedicated Text Chat section. Only manually typed messages and their text replies are stored here.',
    timestamp: Date.now() - 3600000,
    voiceIdentity: 'male',
    personality: 'Normal'
  }
];

const SEED_VOICE_SESSIONS: VoiceSession[] = [
  {
    id: 'seed-voice-session-1',
    conversation_type: 'voice',
    title: 'Voice Session: Welcome to Zuzu Voice',
    startTime: Date.now() - 7200000,
    endTime: Date.now() - 7140000,
    voiceIdentity: 'male',
    personality: 'Normal',
    messages: [
      {
        id: 'seed-voice-msg-1',
        conversation_type: 'voice',
        sessionId: 'seed-voice-session-1',
        sender: 'user',
        text: 'Switch to Female Zuzu.',
        timestamp: Date.now() - 7180000,
        voiceIdentity: 'male',
        isSwitchCommand: true
      },
      {
        id: 'seed-voice-msg-2',
        conversation_type: 'voice',
        sessionId: 'seed-voice-session-1',
        sender: 'assistant',
        text: 'Switching to Female Zuzu. I am now your female assistant, ready to help you!',
        timestamp: Date.now() - 7175000,
        voiceIdentity: 'female',
        audioDuration: 3
      }
    ]
  }
];

// Perform safe migration without deleting unknown records
export function performHistoryMigration(): void {
  try {
    const legacyKeys = [
      'stonic_history',
      'stonic_chat_history',
      'chat_history',
      'voice_history',
      'stonic_ai_messages'
    ];

    let hasMigrated = false;

    legacyKeys.forEach(key => {
      const raw = localStorage.getItem(key);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: any) => {
            // Reliably identified as voice
            if (item.conversation_type === 'voice' || item.source === 'voice' || item.isVoice === true) {
              const currentVoice = getVoiceSessions();
              const existingSession = currentVoice.find(s => s.id === item.sessionId);
              if (!existingSession) {
                const newSession: VoiceSession = {
                  id: item.sessionId || `session-migrated-${Date.now()}`,
                  conversation_type: 'voice',
                  title: item.title || 'Migrated Voice Session',
                  startTime: item.timestamp || Date.now(),
                  voiceIdentity: item.voiceIdentity === 'female' ? 'female' : 'male',
                  personality: item.personality || 'Normal',
                  messages: [
                    {
                      id: item.id || `msg-${Date.now()}`,
                      conversation_type: 'voice',
                      sessionId: item.sessionId || 'migrated',
                      sender: item.sender || 'assistant',
                      text: item.text || '',
                      timestamp: item.timestamp || Date.now(),
                      voiceIdentity: item.voiceIdentity === 'female' ? 'female' : 'male'
                    }
                  ]
                };
                saveVoiceSession(newSession);
              }
            }
            // Reliably identified as text
            else if (item.conversation_type === 'text' || item.source === 'chat' || item.isTyped === true) {
              const currentChat = getChatMessages();
              if (!currentChat.some(m => m.id === item.id)) {
                saveChatMessage({
                  id: item.id || `migrated-chat-${Date.now()}`,
                  conversation_type: 'text',
                  sender: item.sender || 'assistant',
                  text: item.text || '',
                  timestamp: item.timestamp || Date.now(),
                  voiceIdentity: item.voiceIdentity === 'female' ? 'female' : 'male',
                  personality: item.personality || 'Normal'
                });
              }
            }
            // If source is unknown, DO NOT GUESS! Preserve in archive
            else {
              const archive = getLegacyArchive();
              archive.push({ originalKey: key, item, migratedAt: Date.now() });
              localStorage.setItem(STORAGE_KEYS.LEGACY_ARCHIVE, JSON.stringify(archive));
            }
          });
        }
        hasMigrated = true;
      } catch (e) {
        console.warn('Migration parse warning for key:', key, e);
      }
    });

    if (hasMigrated) {
      console.log('[Zuzu Storage] Safe migration completed without data loss.');
    }
  } catch (err) {
    console.error('[Zuzu Storage] Migration error:', err);
  }
}

export function getLegacyArchive(): any[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LEGACY_ARCHIVE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ----------------- TEXT CHAT STORE (STRICT) -----------------
export function getChatMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
    if (!raw) {
      const cloned = SEED_CHAT_MESSAGES.map(m => ({ ...m }));
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(cloned));
      return cloned;
    }
    const parsed: ChatMessage[] = JSON.parse(raw);
    // Strict filter to ensure no voice conversations sneak in
    return parsed.filter(m => m.conversation_type === 'text');
  } catch {
    return SEED_CHAT_MESSAGES.map(m => ({ ...m }));
  }
}

export function saveChatMessage(message: ChatMessage): void {
  if (message.conversation_type !== 'text') {
    console.error('Violation: Cannot save non-text message to Chat History');
    return;
  }
  const current = getChatMessages();
  current.push(message);
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(current));
  notifyZuDataChanged();
}

export function clearChatHistory(): void {
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify([]));
  notifyZuDataChanged();
}

// ----------------- UPLOADED FILE METADATA STORE -----------------
const UPLOADED_FILES_KEY = 'zuzu_uploaded_files_v1';

export function getUploadedFilesMeta(): import('../types').UploadedFileMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(UPLOADED_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setUploadedFilesMeta(files: import('../types').UploadedFileMeta[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(files.slice(0, 100)));
    notifyZuDataChanged();
  } catch {}
}

export function recordUploadedFileMeta(
  file: Omit<import('../types').UploadedFileMeta, 'id' | 'uploadedAt'>
): void {
  const entry: import('../types').UploadedFileMeta = {
    ...file,
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    uploadedAt: Date.now()
  };
  const next = [entry, ...getUploadedFilesMeta()].slice(0, 100);
  setUploadedFilesMeta(next);
}

// ----------------- VOICE HISTORY STORE (STRICT) -----------------
export function getVoiceSessions(): VoiceSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VOICE_SESSIONS);
    if (!raw) {
      const cloned = SEED_VOICE_SESSIONS.map(s => ({ ...s, messages: s.messages.map(m => ({ ...m })) }));
      localStorage.setItem(STORAGE_KEYS.VOICE_SESSIONS, JSON.stringify(cloned));
      return cloned;
    }
    const parsed: VoiceSession[] = JSON.parse(raw);
    // Strict filter to ensure only voice conversations
    return parsed.filter(s => s.conversation_type === 'voice');
  } catch {
    return SEED_VOICE_SESSIONS.map(s => ({ ...s, messages: s.messages.map(m => ({ ...m })) }));
  }
}

export function saveVoiceSession(session: VoiceSession): void {
  if (session.conversation_type !== 'voice') {
    console.error('Violation: Cannot save non-voice session to Voice History');
    return;
  }
  const sessions = getVoiceSessions();
  const index = sessions.findIndex(s => s.id === session.id);
  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.unshift(session);
  }
  localStorage.setItem(STORAGE_KEYS.VOICE_SESSIONS, JSON.stringify(sessions));
  notifyZuDataChanged();
}

export function deleteVoiceSession(sessionId: string): void {
  const sessions = getVoiceSessions().filter(s => s.id !== sessionId);
  localStorage.setItem(STORAGE_KEYS.VOICE_SESSIONS, JSON.stringify(sessions));
  notifyZuDataChanged();
}

export function clearVoiceHistory(): void {
  localStorage.setItem(STORAGE_KEYS.VOICE_SESSIONS, JSON.stringify([]));
  notifyZuDataChanged();
}

// ----------------- SETTINGS STORE -----------------
export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    const combined: AppSettings = { ...DEFAULT_SETTINGS, ...parsed };

    // Migrate legacy voice styles / ElevenLabs IDs cleanly to Gemini prebuilt voices
    let needsResave = false;
    const legacyStyleId = parsed.selectedVoiceStyleId || parsed.selectedVoiceOptionId;
    if (!parsed.geminiVoiceName && legacyStyleId) {
      const legacyMap: Record<string, string> = {
        kore_firm: 'Kore',
        sarah_soft: 'Aoede',
        aria_expressive: 'Zephyr',
        brian_deep: 'Orus',
        george_warm: 'Charon'
      };
      combined.geminiVoiceName = legacyMap[legacyStyleId] || getDefaultGeminiVoiceForIdentity(combined.activeIdentity).id;
      needsResave = true;
    }

    const matchedVoice = getGeminiVoiceByName(combined.geminiVoiceName);
    if (!matchedVoice) {
      combined.geminiVoiceName = getDefaultGeminiVoiceForIdentity(combined.activeIdentity).id;
      needsResave = true;
    } else if (!parsed.geminiVoiceName || parsed.activeIdentity !== matchedVoice.gender) {
      // Keep activeIdentity aligned with the active Gemini voice gender
      combined.geminiVoiceName = matchedVoice.id;
      combined.activeIdentity = matchedVoice.gender;
      needsResave = true;
    }

    // Strip retired multi-provider, Grok, ElevenLabs, and hardcoded model fields
    const retiredKeys = [
      'elevenLabsMaleVoiceId',
      'elevenLabsFemaleVoiceId',
      'customElevenLabsApiKey',
      'grokEnabled',
      'customGrokApiKey',
      'defaultAiProvider',
      'aiFallbackEnabled',
      'selectedVoiceOptionId',
      'selectedVoiceStyleId',
      'selectedVoiceModelId',
      'aiModel',
      'stability',
      'similarityBoost'
    ];
    for (const k of retiredKeys) {
      if (k in (combined as any)) {
        delete (combined as any)[k];
        needsResave = true;
      }
    }

    if (parsed.suAccountId && !combined.zuAccountId) {
      combined.zuAccountId = parsed.suAccountId;
      needsResave = true;
    }
    if (parsed.suUsername && !combined.zuUsername) {
      combined.zuUsername = parsed.suUsername;
      needsResave = true;
    }
    if (parsed.suFullName && !combined.zuFullName) {
      combined.zuFullName = parsed.suFullName;
      needsResave = true;
    }
    if (parsed.suPhone && !combined.zuPhone) {
      combined.zuPhone = parsed.suPhone;
      needsResave = true;
    }
    if (parsed.suToken && !combined.zuToken) {
      combined.zuToken = parsed.suToken;
      needsResave = true;
    }
    if (parsed.suVaultKey && !combined.zuVaultKey) {
      combined.zuVaultKey = parsed.suVaultKey;
      needsResave = true;
    }
    if (parsed.suLastSyncedAt && !combined.zuLastSyncedAt) {
      combined.zuLastSyncedAt = parsed.suLastSyncedAt;
      needsResave = true;
    }

    if (needsResave) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(combined));
    }

    return combined;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAppSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const updated: AppSettings = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
  notifyZuDataChanged();
  return updated;
}

// ----------------- LONG-TERM MEMORY STORE (STRICT PRIVACY) -----------------

// Initial default memories to demonstrate capability
export const SEED_MEMORIES: UserMemory[] = [
  {
    id: 'seed-mem-1',
    key: 'Preferred Assistant Name',
    value: 'Zuzu AI (Dual Voice Assistant)',
    category: 'preference',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    source: 'explicit'
  },
  {
    id: 'seed-mem-2',
    key: 'Primary Languages',
    value: 'Bengali (বাংলা) and English',
    category: 'preference',
    createdAt: Date.now() - 82000000,
    updatedAt: Date.now() - 82000000,
    source: 'explicit'
  },
  {
    id: 'seed-mem-3',
    key: 'Operating Environment',
    value: 'Android Phone via Capacitor & Web',
    category: 'personal',
    createdAt: Date.now() - 40000000,
    updatedAt: Date.now() - 40000000,
    source: 'explicit'
  }
];

/**
 * Strict Security Guard: Enforce Requirement 11
 * Prevent saving passwords, API keys, bearer tokens, credit cards, or sensitive secrets.
 */
export function isSensitiveMemory(key: string, value: string): { isSensitive: boolean; reason?: string } {
  const combined = `${key} ${value}`.toLowerCase();

  // Pattern checks for passwords, pins, credentials
  if (
    /password|passcode|secret\s*key|api\s*key|bearer\s+|auth\s*token|access\s*token|private\s*key/i.test(combined)
  ) {
    return {
      isSensitive: true,
      reason: 'Security violation: Passwords, tokens, and API credentials cannot be stored in Memory.'
    };
  }

  // Credit card number pattern (13 to 19 digits)
  if (/\b(?:\d[ -]*?){13,19}\b/.test(value) && /card|cvv|visa|mastercard|amex/i.test(combined)) {
    return {
      isSensitive: true,
      reason: 'Security violation: Financial payment data and card numbers cannot be saved in Memory.'
    };
  }

  // Common API key patterns (Google AIza, OpenAI sk-, etc.)
  if (/AIza[0-9A-Za-z-_]{35}/.test(value) || /sk-[0-9a-zA-Z]{20,}/.test(value)) {
    return {
      isSensitive: true,
      reason: 'Security violation: Real API secret keys detected and blocked.'
    };
  }

  return { isSensitive: false };
}

/**
 * Retrieve all stored memories
 */
export function getMemories(): UserMemory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MEMORIES);
    if (!raw) {
      const cloned = SEED_MEMORIES.map(m => ({ ...m }));
      localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(cloned));
      return cloned;
    }
    const parsed: UserMemory[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_MEMORIES.map(m => ({ ...m }));
  } catch {
    return SEED_MEMORIES.map(m => ({ ...m }));
  }
}

/**
 * Save a new memory or update if matching key exists
 */
export function saveMemory(
  memoryInput: Omit<UserMemory, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): { success: boolean; memory?: UserMemory; error?: string } {
  const key = memoryInput.key.trim();
  const value = memoryInput.value.trim();

  if (!key || !value) {
    return { success: false, error: 'Memory title and content cannot be empty.' };
  }

  // Check sensitive data guard
  const sensitivityCheck = isSensitiveMemory(key, value);
  if (sensitivityCheck.isSensitive) {
    return { success: false, error: sensitivityCheck.reason };
  }

  const memories = getMemories();
  const now = Date.now();

  // Check if updating existing by ID
  if (memoryInput.id) {
    const existingIndex = memories.findIndex(m => m.id === memoryInput.id);
    if (existingIndex >= 0) {
      memories[existingIndex] = {
        ...memories[existingIndex],
        key,
        value,
        category: memoryInput.category || 'custom',
        source: memoryInput.source || memories[existingIndex].source,
        updatedAt: now
      };
      localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
      notifyZuDataChanged();
      return { success: true, memory: memories[existingIndex] };
    }
  }

  // Check if a memory with exact same key exists
  const existingKeyIndex = memories.findIndex(m => m.key.toLowerCase() === key.toLowerCase());
  if (existingKeyIndex >= 0) {
    memories[existingKeyIndex] = {
      ...memories[existingKeyIndex],
      value,
      category: memoryInput.category || memories[existingKeyIndex].category,
      updatedAt: now
    };
    localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
    notifyZuDataChanged();
    return { success: true, memory: memories[existingKeyIndex] };
  }

  // Create new memory item
  const newMemory: UserMemory = {
    id: `mem-${now}-${Math.random().toString(36).substr(2, 6)}`,
    key,
    value,
    category: memoryInput.category || 'personal',
    createdAt: now,
    updatedAt: now,
    source: memoryInput.source || 'explicit'
  };

  memories.unshift(newMemory);
  localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
  notifyZuDataChanged();
  return { success: true, memory: newMemory };
}

/**
 * Update an existing memory
 */
export function updateMemory(id: string, updates: Partial<UserMemory>): { success: boolean; error?: string } {
  const memories = getMemories();
  const index = memories.findIndex(m => m.id === id);
  if (index === -1) {
    return { success: false, error: 'Memory not found.' };
  }

  const newKey = updates.key !== undefined ? updates.key.trim() : memories[index].key;
  const newValue = updates.value !== undefined ? updates.value.trim() : memories[index].value;

  const sensitivityCheck = isSensitiveMemory(newKey, newValue);
  if (sensitivityCheck.isSensitive) {
    return { success: false, error: sensitivityCheck.reason };
  }

  memories[index] = {
    ...memories[index],
    ...updates,
    key: newKey,
    value: newValue,
    updatedAt: Date.now()
  };

  localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
  notifyZuDataChanged();
  return { success: true };
}

/**
 * Delete a specific memory item by ID
 */
export function deleteMemory(id: string): void {
  const memories = getMemories().filter(m => m.id !== id);
  localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
  notifyZuDataChanged();
}

/**
 * Clear all memories
 */
export function clearAllMemories(): void {
  localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify([]));
  notifyZuDataChanged();
}

export interface ZuzuBackupSnapshot {
  chatHistory: ChatMessage[];
  voiceSessions: VoiceSession[];
  memories: UserMemory[];
  notes?: NotebookNote[];
  reminders?: UserReminder[];
  uploadedFiles?: import('../types').UploadedFileMeta[];
  settings: Partial<AppSettings>;
  savedAt: number;
}

/**
 * Exports all isolated stores for persistent Firebase UID cloud backup
 */
export function getAllBackupPayload(): ZuzuBackupSnapshot {
  const settings = getAppSettings();
  const {
    zuToken: _omitToken,
    zuVaultKey: _omitVaultKey,
    ...syncableSettings
  } = settings;
  return {
    chatHistory: getChatMessages(),
    voiceSessions: getVoiceSessions(),
    memories: getMemories(),
    notes: getNotesList(),
    reminders: getRemindersList(),
    uploadedFiles: getUploadedFilesMeta(),
    settings: syncableSettings,
    savedAt: Date.now()
  };
}

/**
 * Restores full chat history, voice sessions, long-term memories, notes, reminders, uploaded files & settings
 */
export function restoreAllBackupPayload(
  snapshot: Partial<ZuzuBackupSnapshot>,
  sessionOverrides?: Partial<AppSettings>
): AppSettings {
  if (Array.isArray(snapshot.chatHistory)) {
    const validChats = snapshot.chatHistory.filter(m => m && m.conversation_type === 'text');
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(validChats));
  }
  if (Array.isArray(snapshot.voiceSessions)) {
    const validVoice = snapshot.voiceSessions.filter(s => s && s.conversation_type === 'voice');
    localStorage.setItem(STORAGE_KEYS.VOICE_SESSIONS, JSON.stringify(validVoice));
  }
  if (Array.isArray(snapshot.memories)) {
    localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(snapshot.memories));
  }
  if (Array.isArray(snapshot.notes)) {
    const validNotes = snapshot.notes.filter(n => n && typeof n.text === 'string' && n.text.trim().length > 0);
    setNotesList(validNotes);
  }
  if (Array.isArray(snapshot.reminders)) {
    const validReminders = snapshot.reminders.filter(r => r && typeof r.title === 'string' && typeof r.time === 'number');
    setRemindersList(validReminders);
  }
  if (Array.isArray(snapshot.uploadedFiles)) {
    setUploadedFilesMeta(snapshot.uploadedFiles);
  }
  if (snapshot.settings && typeof snapshot.settings === 'object') {
    const current = getAppSettings();
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...snapshot.settings,
      ...(sessionOverrides || {}),
      zuLastSyncedAt: Date.now()
    };
    if (!merged.userNickname && current.userNickname) {
      merged.userNickname = current.userNickname;
    }
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
    return merged;
  }
  if (sessionOverrides) {
    return saveAppSettings(sessionOverrides);
  }
  return getAppSettings();
}

const UID_VAULT_PREFIX = 'zuzu_uid_vault_v1_';
const ACTIVE_AUTH_UID_KEY = 'zuzu_active_auth_uid';

export function getStoredActiveAuthUid(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_AUTH_UID_KEY);
}

export function setStoredActiveAuthUid(uid: string | null): void {
  if (typeof window === 'undefined') return;
  if (uid) {
    localStorage.setItem(ACTIVE_AUTH_UID_KEY, uid);
  } else {
    localStorage.removeItem(ACTIVE_AUTH_UID_KEY);
  }
}

export function stashUserNamespaceSnapshot(uid: string): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    const snapshot = getAllBackupPayload();
    localStorage.setItem(`${UID_VAULT_PREFIX}${uid}`, JSON.stringify(snapshot));
  } catch {}
}

export function getUserNamespaceSnapshot(uid: string): ZuzuBackupSnapshot | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = localStorage.getItem(`${UID_VAULT_PREFIX}${uid}`);
    if (!raw) return null;
    return JSON.parse(raw) as ZuzuBackupSnapshot;
  } catch {
    return null;
  }
}

export function clearUserNamespaceSnapshot(uid: string): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    localStorage.removeItem(`${UID_VAULT_PREFIX}${uid}`);
  } catch {}
}

export function hasMeaningfulPreLoginUserData(): boolean {
  const chats = getChatMessages().filter(m => m.id !== 'seed-chat-1');
  const voice = getVoiceSessions().filter(s => s.id !== 'seed-voice-session-1');
  const memories = getMemories().filter(m => !m.id.startsWith('seed-mem-'));
  const notes = getNotesList();
  const reminders = getRemindersList();
  const files = getUploadedFilesMeta();
  const settings = getAppSettings();
  return (
    chats.length > 0 ||
    voice.length > 0 ||
    memories.length > 0 ||
    notes.length > 0 ||
    reminders.length > 0 ||
    files.length > 0 ||
    Boolean(settings.customGeminiApiKey?.trim())
  );
}

/**
 * Resets private user-scoped data stores cleanly when signing out so another user
 * signing into the same device never inherits the previous user's chats, notes, reminders,
 * memories, uploaded files, or personal API key.
 */
export function resetWorkspaceToCleanGuestState(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const prevSettings = getAppSettings();
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(SEED_CHAT_MESSAGES));
  localStorage.setItem(STORAGE_KEYS.VOICE_SESSIONS, JSON.stringify(SEED_VOICE_SESSIONS));
  localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(SEED_MEMORIES));
  setNotesList([]);
  setRemindersList([]);
  localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify([]));

  const cleanSettings: AppSettings = {
    ...DEFAULT_SETTINGS,
    themePreset: prevSettings.themePreset,
    viewMode: prevSettings.viewMode,
    recognitionLanguage: prevSettings.recognitionLanguage,
    orbStyle: prevSettings.orbStyle,
    userNickname: 'Friend',
    customGeminiApiKey: ''
  };
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(cleanSettings));
  setStoredActiveAuthUid(null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zuzu-workspace-switched'));
  }
  return cleanSettings;
}

