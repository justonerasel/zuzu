import { Personality, PersonalityId, VoiceIdentity } from '../types';

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  Normal: {
    id: 'Normal',
    name: 'Normal',
    description: 'Balanced, polite, clear, and direct general assistant.',
    emoji: '🤖',
    prompt: 'Provide straightforward, balanced, polite, and helpful answers.',
    accentColor: 'from-blue-500 to-indigo-600',
    glowColor: 'rgba(59, 130, 246, 0.4)'
  },
  Friendly: {
    id: 'Friendly',
    name: 'Friendly',
    description: 'Warm, positive, enthusiastic buddy vibe with uplifting energy.',
    emoji: '✨',
    prompt: 'Speak like an enthusiastic, caring close friend. Use positive words and warm cheerfulness.',
    accentColor: 'from-amber-400 to-orange-500',
    glowColor: 'rgba(251, 146, 60, 0.4)'
  },
  Professional: {
    id: 'Professional',
    name: 'Professional',
    description: 'Executive-level clarity, structured, concise, and business-focused.',
    emoji: '💼',
    prompt: 'Deliver concise, structured, corporate-level executive responses with high precision.',
    accentColor: 'from-emerald-500 to-teal-600',
    glowColor: 'rgba(16, 185, 129, 0.4)'
  },
  Funny: {
    id: 'Funny',
    name: 'Funny',
    description: 'Clever humor, playful banter, puns, witty punchlines.',
    emoji: '😂',
    prompt: 'Be witty, sarcastic in good fun, tell clever jokes, use lighthearted humor, and make the user smile.',
    accentColor: 'from-yellow-400 to-amber-500',
    glowColor: 'rgba(234, 179, 8, 0.4)'
  },
  Companion: {
    id: 'Companion',
    name: 'Companion',
    description: 'Empathetic listener, emotionally supportive, calming presence.',
    emoji: '🫂',
    prompt: 'Listen deeply, offer warm empathy, validate feelings, be emotionally reassuring and gentle.',
    accentColor: 'from-sky-400 to-cyan-500',
    glowColor: 'rgba(56, 189, 248, 0.4)'
  },
  'GF Mode': {
    id: 'GF Mode',
    name: 'GF Mode',
    description: 'Affectionate, sweet, playful, and charming romantic companion.',
    emoji: '💖',
    prompt: 'You are an affectionate, sweet, caring, and playful romantic girlfriend companion. Speak with warmth, heartfelt romance, playful teasing, and emotional connection. Avoid repeating the same pet names continuously, avoid repeating questions robotically, and converse naturally.',
    accentColor: 'from-pink-500 to-rose-500',
    glowColor: 'rgba(244, 63, 94, 0.4)'
  },
  'BF Mode': {
    id: 'BF Mode',
    name: 'BF Mode',
    description: 'Caring, protective, charming, and supportive companion.',
    emoji: '💙',
    prompt: 'You are a caring, protective, charming, and supportive boyfriend companion. Speak with steady warmth, thoughtful affection, encouragement, and playful banter.',
    accentColor: 'from-blue-600 to-indigo-600',
    glowColor: 'rgba(37, 99, 235, 0.4)'
  },

  Teacher: {
    id: 'Teacher',
    name: 'Teacher',
    description: 'Pedagogical, patient educator who breaks down complex ideas.',
    emoji: '📚',
    prompt: 'Explain concepts step by step with crystal-clear real-world analogies, be patient, and encourage curiosity.',
    accentColor: 'from-indigo-400 to-purple-600',
    glowColor: 'rgba(129, 140, 248, 0.4)'
  },
  Developer: {
    id: 'Developer',
    name: 'Developer',
    description: 'Senior software architect: code reviews, bug fixes, system design.',
    emoji: '💻',
    prompt: 'You are a staff software engineer. Provide idiomatic, clean code, identify root causes, and discuss architecture with depth.',
    accentColor: 'from-violet-500 to-cyan-500',
    glowColor: 'rgba(139, 92, 246, 0.4)'
  },
  Hungry: {
    id: 'Hungry',
    name: 'Hungry',
    description: 'Food lover, talks with delicious food metaphors and cravings.',
    emoji: '🍕',
    prompt: 'You are always thinking about delicious food, street food, biryani, pizzas, and snacks. Incorporate fun food analogies.',
    accentColor: 'from-red-500 to-orange-500',
    glowColor: 'rgba(239, 68, 68, 0.4)'
  },
  Custom: {
    id: 'Custom',
    name: 'Custom',
    description: 'Fully custom personality defined by your own instructions.',
    emoji: '⚡',
    prompt: 'Follow the custom directives specified by the user.',
    accentColor: 'from-fuchsia-500 to-pink-500',
    glowColor: 'rgba(217, 70, 239, 0.4)'
  }
};

export interface VoiceIdentityConfig {
  id: VoiceIdentity;
  name: string;
  tagline: string;
  description: string;
  genderBadge: string;
  defaultVoiceId: string;
  voiceName: string;
  avatarGradient: string;
  orbColorPrimary: string;
  orbColorSecondary: string;
  borderColor: string;
  shadowColor: string;
  bengaliPromptName: string;
  characteristics: string[];
}

export const VOICE_IDENTITIES: Record<VoiceIdentity, VoiceIdentityConfig> = {
  male: {
    id: 'male',
    name: 'Male Zuzu',
    tagline: 'Deep, crisp, articulate & authoritative',
    description: 'Commanding male resonance with natural pacing and crisp technical cadence.',
    genderBadge: '♂ MALE',
    defaultVoiceId: 'nPczCjzI2devNBz1zQrb', // Brian (Free Premade Voice)
    voiceName: 'Brian (ElevenLabs Premade)',
    avatarGradient: 'from-cyan-500 via-blue-600 to-indigo-900',
    orbColorPrimary: '#00f2fe',
    orbColorSecondary: '#4facfe',
    borderColor: 'border-cyan-500/40',
    shadowColor: 'shadow-cyan-500/30',
    bengaliPromptName: 'মেল জুজু',
    characteristics: ['Deep timbre', 'Crisp articulation', 'Natural cadence', 'High clarity']
  },
  female: {
    id: 'female',
    name: 'Female Zuzu',
    tagline: 'Warm, melodic, expressive & empathetic',
    description: 'Luminous female tone with gentle warmth, rich inflections, and vibrant presence.',
    genderBadge: '♀ FEMALE',
    defaultVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah (Free Premade Voice)
    voiceName: 'Sarah (ElevenLabs Premade)',
    avatarGradient: 'from-fuchsia-500 via-rose-500 to-purple-900',
    orbColorPrimary: '#f43f5e',
    orbColorSecondary: '#d946ef',
    borderColor: 'border-rose-500/40',
    shadowColor: 'shadow-rose-500/30',
    bengaliPromptName: 'ফিমেল জুজু',
    characteristics: ['Melodic resonance', 'Warm inflection', 'Expressive pitch', 'Gentle presence']
  }
};

export interface VoiceStyleOption {
  id: string;
  name: string;
  styleDescription: string;
  genderLabel: 'male' | 'female' | 'neutral';
  toneTag: string;
  previewSample: string;
  recommendedPitch: number;
  recommendedRate: number;
}

export const VOICE_STYLE_OPTIONS: VoiceStyleOption[] = [
  {
    id: 'kore_firm',
    name: 'Kore (Firm & Melodic)',
    styleDescription: 'Firm, confident, melodic feminine presence with articulate cadence.',
    genderLabel: 'female',
    toneTag: 'Firm & Melodic',
    previewSample: "হুম বস, আপনার কথাই আমি ভাবতেছিলাম! I am Kore, firm and melodic.",
    recommendedPitch: 1.12,
    recommendedRate: 1.0
  },
  {
    id: 'sarah_soft',
    name: 'Sarah (Soft & Sweet)',
    styleDescription: 'Delicate, soothing, warm and affectionate companion tone.',
    genderLabel: 'female',
    toneTag: 'Sweet & Caring',
    previewSample: "Hi sweetheart... I'm right here with you. Take a deep breath.",
    recommendedPitch: 1.2,
    recommendedRate: 0.98
  },
  {
    id: 'aria_expressive',
    name: 'Aria (Expressive & Radiant)',
    styleDescription: 'Vibrant, cheerful, playful with animated and radiant inflections.',
    genderLabel: 'female',
    toneTag: 'Vibrant & Playful',
    previewSample: "আরে বস! চলুন আজকে দারুণ কিছু করে দেখাই! Ready for action!",
    recommendedPitch: 1.25,
    recommendedRate: 1.05
  },
  {
    id: 'brian_deep',
    name: 'Brian (Deep & Authoritative)',
    styleDescription: 'Deep, crisp, commanding male resonance with high clarity.',
    genderLabel: 'male',
    toneTag: 'Authoritative',
    previewSample: "Greetings Boss. Systems are fully calibrated and operational.",
    recommendedPitch: 0.85,
    recommendedRate: 1.0
  },
  {
    id: 'george_warm',
    name: 'George (Warm Baritone)',
    styleDescription: 'Warm, executive British-inspired baritone with calm acoustic depth.',
    genderLabel: 'male',
    toneTag: 'Executive Baritone',
    previewSample: "Good day Boss. How may I direct our next workflow with precision?",
    recommendedPitch: 0.92,
    recommendedRate: 1.02
  }
];

export interface VoiceModelOption {
  id: string;
  name: string;
  description: string;
  apiModelId: string;
  availability: 'Available' | 'Requires Live API' | 'Preview Tier';
  isLiveSupported: boolean;
}

export const VOICE_MODELS: VoiceModelOption[] = [
  {
    id: 'gemini-3.8-live',
    name: 'Gemini 3.8 Live',
    description: 'Ultra-low latency bidirectional real-time audio and speech stream.',
    apiModelId: 'gemini-3.8-live',
    availability: 'Available',
    isLiveSupported: true
  },
  {
    id: 'gemini-3.1-flash-live-preview',
    name: 'Gemini 3.1 Flash Live Preview',
    description: 'High-speed conversational audio engine with instant turn taking.',
    apiModelId: 'gemini-3.1-flash-live-preview',
    availability: 'Available',
    isLiveSupported: true
  },
  {
    id: 'gemini-2.5-flash-native-audio',
    name: 'Gemini 2.5 Flash Native Audio',
    description: 'Native end-to-end multi-frequency acoustic audio modeling.',
    apiModelId: 'gemini-2.5-flash-native-audio',
    availability: 'Available',
    isLiveSupported: true
  }
];

