import { AppSettings, ChatMessage, VoiceSession, VoiceMessage, VoiceIdentity, PersonalityId, UserMemory } from '../types';

const STORAGE_KEYS = {
  CHAT_HISTORY: 'zuzu_chat_history_v2',
  VOICE_SESSIONS: 'zuzu_voice_sessions_v2',
  SETTINGS: 'zuzu_settings_v2',
  MEMORIES: 'zuzu_memories_v2',
  LEGACY_ARCHIVE: 'zuzu_unclassified_archive_v2'
};

export const DEFAULT_SETTINGS: AppSettings = {
  activeIdentity: 'male',
  activePersonality: 'Normal',
  customPersonalityPrompt: '',
  continuousListening: true,
  memoryEnabled: true, // Long-term memory active by default
  elevenLabsMaleVoiceId: 'nPczCjzI2devNBz1zQrb', // Brian (Free Premade Voice)
  elevenLabsFemaleVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah (Free Premade Voice)
  customElevenLabsApiKey: '',
  
  // AI Providers Defaults
  geminiEnabled: true,
  customGeminiApiKey: '',
  grokEnabled: false,
  customGrokApiKey: '',
  defaultAiProvider: 'gemini',
  aiFallbackEnabled: true,

  // Voice Options & Live Models Defaults
  selectedVoiceOptionId: 'warm_friendly',
  selectedVoiceModelId: 'gemini-3.8-live',
  aiModel: 'gemini-3.8-flash',
  stability: 0.5,
  similarityBoost: 0.75,
  speechRate: 1.0,
  soundEffects: true,
  recognitionLanguage: 'auto',
  viewMode: 'android_frame',

  // Orb Customization Defaults
  orbStyle: 'particle',
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
  lastWeatherIsGPS: false
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
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(SEED_CHAT_MESSAGES));
      return SEED_CHAT_MESSAGES;
    }
    const parsed: ChatMessage[] = JSON.parse(raw);
    // Strict filter to ensure no voice conversations sneak in
    return parsed.filter(m => m.conversation_type === 'text');
  } catch {
    return SEED_CHAT_MESSAGES;
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
}

export function clearChatHistory(): void {
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify([]));
}

// ----------------- VOICE HISTORY STORE (STRICT) -----------------
export function getVoiceSessions(): VoiceSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VOICE_SESSIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.VOICE_SESSIONS, JSON.stringify(SEED_VOICE_SESSIONS));
      return SEED_VOICE_SESSIONS;
    }
    const parsed: VoiceSession[] = JSON.parse(raw);
    // Strict filter to ensure only voice conversations
    return parsed.filter(s => s.conversation_type === 'voice');
  } catch {
    return SEED_VOICE_SESSIONS;
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
}

export function deleteVoiceSession(sessionId: string): void {
  const sessions = getVoiceSessions().filter(s => s.id !== sessionId);
  localStorage.setItem(STORAGE_KEYS.VOICE_SESSIONS, JSON.stringify(sessions));
}

export function clearVoiceHistory(): void {
  localStorage.setItem(STORAGE_KEYS.VOICE_SESSIONS, JSON.stringify([]));
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
    const combined = { ...DEFAULT_SETTINGS, ...parsed };

    // Auto-migrate legacy library voice IDs that trigger 402 paid_plan_required on ElevenLabs free tier
    let needsResave = false;
    if (combined.elevenLabsMaleVoiceId === 'pNInz6obpgDQGcFmaJgB') {
      combined.elevenLabsMaleVoiceId = 'nPczCjzI2devNBz1zQrb'; // Migrate to Brian (Free Premade)
      needsResave = true;
    }
    if (combined.elevenLabsFemaleVoiceId === '21m00Tcm4TlvDq8ikWAM') {
      combined.elevenLabsFemaleVoiceId = 'EXAVITQu4vr4xnSDxMaL'; // Migrate to Sarah (Free Premade)
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
      localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(SEED_MEMORIES));
      return SEED_MEMORIES;
    }
    const parsed: UserMemory[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_MEMORIES;
  } catch {
    return SEED_MEMORIES;
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
  return { success: true };
}

/**
 * Delete a specific memory item by ID
 */
export function deleteMemory(id: string): void {
  const memories = getMemories().filter(m => m.id !== id);
  localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
}

/**
 * Clear all memories
 */
export function clearAllMemories(): void {
  localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify([]));
}

