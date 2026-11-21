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

export type OrbStyleId = 
  | 'glass_iridescent_wave' // Style 1: Glass Iridescent Wave (Translucent glowing orb with fluid internal light waves)
  | 'blue_violet_matrix'     // Style 2: Blue-Violet Particle Matrix (Dense glowing blue-to-violet matrix dots with fluid wave motion)
  | 'magenta_cyan_mesh'      // Style 3: Magenta-Cyan Glowing Mesh (Intricate particle mesh with vibrant magenta, cyan, and blue neon glowing dot gradients)
  | 'purple_spiral_globe';   // Style 4: Purple Spiral Dot Globe (Precise spherical grid with concentric purple and white glowing dot lines & orbit rings)

export type OrbColorScheme = 'purple' | 'cyan' | 'rose' | 'mint' | 'amber';
export type OrbRotationSpeed = 'slow' | 'normal' | 'fast';
export type OrbGlowIntensity = 'soft' | 'medium' | 'intense';
export type OrbParticleDensity = 'eco' | 'standard' | 'ultra';

export type ThemePresetId = 
  | 'lavender'   // Lavender Dream
  | 'cool_blue'  // Cool Sky
  | 'mint'       // Mint Crystal
  | 'soft_pink'  // Soft Rose Pastel
  | 'emerald'    // Emerald Oasis
  | 'amber'      // Sunset Amber
  | 'custom';

export interface AppSettings {
  activeIdentity: VoiceIdentity;
  activePersonality: PersonalityId;
  customPersonalityPrompt: string;
  continuousListening: boolean;
  memoryEnabled: boolean; // Long-Term Memory toggle
  // Unified Google Gemini AI Configuration (powers both Text & Voice)
  geminiEnabled: boolean;
  customGeminiApiKey: string;
  geminiVoiceName: string;

  // Voice Calibration & Speech Preferences
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

  // Background Service & Always-On Wake Word & Custom Audio Triggers
  foregroundServiceEnabled: boolean;
  wakeWordEnabled: boolean;
  wakeWordPhrase: string;
  customTriggersEnabled: boolean;
  customAudioTriggers: CustomAudioTrigger[];

  // Custom ZU-ID Account Persistence (Custom Username + Firebase Firestore)
  zuAccountId?: string;
  zuUsername?: string;
  zuFullName?: string;
  zuPhone?: string;
  zuToken?: string;
  zuVaultKey?: string;
  zuLastSyncedAt?: number;
}

export type CustomAudioTriggerKind = 'whistle' | 'snap' | 'custom';

export interface CustomAudioTrigger {
  id: string;
  label: string;
  kind: CustomAudioTriggerKind;
  peakHz: number;
  centroidHz: number;
  tonalityRatio: number;
  crestFactor: number;
  rmsThreshold: number;
  bandProfile: number[];
  sensitivity: number;
  createdAt: number;
}

export type ActiveTab = 'dashboard' | 'chat' | 'voice' | 'history' | 'settings' | 'updates' | 'image_creator';

