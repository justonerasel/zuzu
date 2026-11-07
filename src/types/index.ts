export type VoiceIdentity = 'male' | 'female';

export type PersonalityId =
  | 'Normal'
  | 'Friendly'
  | 'Professional'
  | 'Funny'
  | 'Companion'
  | 'GF Mode'
  | 'BF Mode'
  | 'Teacher'
  | 'Developer'
  | 'Hungry'
  | 'Custom';

export type GfIntensity = 'sweet' | 'romantic' | 'playful' | 'flirty';

export interface Personality {
  id: PersonalityId;
  name: string;
  description: string;
  emoji: string;
  prompt: string;
  accentColor: string;
  glowColor: string;
}

export type ConversationType = 'text' | 'voice';

// Strict separation: Text Chat message
export interface ChatMessage {
  id: string;
  conversation_type: 'text';
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  voiceIdentity: VoiceIdentity;
  personality: PersonalityId;
}

// Strict separation: Voice Conversation message
export interface VoiceMessage {
  id: string;
  conversation_type: 'voice';
  sessionId: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  voiceIdentity: VoiceIdentity;
  audioDuration?: number;
  isSwitchCommand?: boolean;
}

// Strict separation: Voice Session Container
export interface VoiceSession {
  id: string;
  conversation_type: 'voice';
  title: string;
  startTime: number;
  endTime?: number;
  voiceIdentity: VoiceIdentity;
  personality: PersonalityId;
  messages: VoiceMessage[];
}

export type MemoryCategory = 'personal' | 'preference' | 'work' | 'custom';

// Strict separation: Long-Term Memory System
export interface UserMemory {
  id: string;
  key: string; // e.g. "User's Name", "Favorite Food", "Profession"
  value: string; // e.g. "Rasel", "Biryani", "Full-Stack Developer"
  category: MemoryCategory;
  createdAt: number;
  updatedAt: number;
  source: 'explicit' | 'learned';
}

export type OrbStyleId = 'human' | 'galaxy' | 'neon' | 'crystal' | 'energy' | 'quantum' | 'particle' | 'pixel';
export type OrbColorScheme = 'purple' | 'cyan' | 'rose' | 'mint' | 'amber';
export type OrbRotationSpeed = 'slow' | 'normal' | 'fast';
export type OrbGlowIntensity = 'soft' | 'medium' | 'intense';
export type OrbParticleDensity = 'eco' | 'standard' | 'ultra';

export type ThemePresetId = 'lavender' | 'cool_blue' | 'mint' | 'soft_pink' | 'midnight' | 'emerald' | 'amber' | 'custom';

export interface AppSettings {
  activeIdentity: VoiceIdentity;
  activePersonality: PersonalityId;
  customPersonalityPrompt: string;
  continuousListening: boolean;
  memoryEnabled: boolean; // Long-Term Memory toggle
  elevenLabsMaleVoiceId: string;
  elevenLabsFemaleVoiceId: string;
  customElevenLabsApiKey: string;
  
  // AI Providers (Gemini & Grok)
  geminiEnabled: boolean;
  customGeminiApiKey: string;
  grokEnabled: boolean;
  customGrokApiKey: string;
  defaultAiProvider: 'gemini' | 'grok' | 'hybrid' | 'local';
  aiFallbackEnabled: boolean;

  // Voice Options & Live Models
  selectedVoiceOptionId: string;
  selectedVoiceModelId: string;
  aiModel: string;
  stability: number;
  similarityBoost: number;
  speechRate: number;
  soundEffects: boolean;
  recognitionLanguage: 'auto' | 'en-US' | 'bn-BD';
  viewMode: 'android_frame' | 'fullscreen';

  // Orb Customization
  orbStyle: OrbStyleId;
  orbColor: OrbColorScheme;
  orbRotationSpeed: OrbRotationSpeed;
  orbGlowIntensity: OrbGlowIntensity;
  orbParticleDensity: OrbParticleDensity;

  // Theme & Appearance
  themePreset: ThemePresetId;
  customBgColor: string;
  customCardColor: string;
  customAccentColor: string;

  // Profile & Identity
  userNickname: string;
  assistantNickname: string; // Custom nickname user calls their assistant (e.g. Maya)
  aiNickname: string;
  greetingStyle: 'friendly' | 'formal' | 'cheerful';
  timeBasedGreetings: boolean;

  // GF Mode Preferences
  gfIntensity: GfIntensity;
  gfGreetingEnabled: boolean;

  // Audio volume
  volume: number;

  // Weather Location Persistence
  lastWeatherCity?: string;
  lastWeatherCountry?: string;
  lastWeatherLat?: number;
  lastWeatherLon?: number;
  lastWeatherIsGPS?: boolean;
}

export type ActiveTab = 'dashboard' | 'chat' | 'voice' | 'history' | 'settings' | 'updates' | 'image_creator';

