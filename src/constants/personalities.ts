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
    tagline: 'Firm, articulate, balanced & warm',
    description: 'Natural male resonance powered by Gemini neural voice with crisp clarity.',
    genderBadge: '♂ MALE',
    defaultVoiceId: 'Orus',
    voiceName: 'Orus (Gemini Voice)',
    avatarGradient: 'from-cyan-500 via-blue-600 to-indigo-900',
    orbColorPrimary: '#00f2fe',
    orbColorSecondary: '#4facfe',
    borderColor: 'border-cyan-500/40',
    shadowColor: 'shadow-cyan-500/30',
    bengaliPromptName: 'মেল জুজু',
    characteristics: ['Firm clarity', 'Balanced tone', 'Natural cadence', 'Conversational']
  },
  female: {
    id: 'female',
    name: 'Female Zuzu',
    tagline: 'Warm, melodic, expressive & empathetic',
    description: 'Natural female tone powered by Gemini neural voice with rich warmth and gentle presence.',
    genderBadge: '♀ FEMALE',
    defaultVoiceId: 'Kore',
    voiceName: 'Kore (Gemini Voice)',
    avatarGradient: 'from-fuchsia-500 via-rose-500 to-purple-900',
    orbColorPrimary: '#f43f5e',
    orbColorSecondary: '#d946ef',
    borderColor: 'border-rose-500/40',
    shadowColor: 'shadow-rose-500/30',
    bengaliPromptName: 'ফিমেল জুজু',
    characteristics: ['Melodic warmth', 'Natural inflection', 'Expressive tone', 'Gentle clarity']
  }
};

export interface GeminiVoiceOption {
  id: string;
  name: string;
  gender: VoiceIdentity;
  toneTag: string;
  description: string;
  previewSample: string;
  featured?: boolean;
}

export const GEMINI_VOICE_OPTIONS: GeminiVoiceOption[] = [
  // Female Gemini Prebuilt Voices
  {
    id: 'Kore',
    name: 'Kore',
    gender: 'female',
    toneTag: 'Firm & Melodic',
    description: 'Confident, poised feminine voice with warm clarity and natural rhythm.',
    previewSample: "Hi there! I'm Kore. Whenever you're ready, just ask and we'll figure it out together.",
    featured: true
  },
  {
    id: 'Aoede',
    name: 'Aoede',
    gender: 'female',
    toneTag: 'Breezy & Warm',
    description: 'Light, effortless conversational warmth suited for everyday chat.',
    previewSample: "Hey! I'm Aoede. Nice to talk with you — what's on your mind right now?"
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'female',
    toneTag: 'Bright & Vibrant',
    description: 'Energetic, upbeat tone that feels lively and encouraging.',
    previewSample: "Hey! I'm Zephyr, bright and ready to help with whatever you're working on today!"
  },
  {
    id: 'Leda',
    name: 'Leda',
    gender: 'female',
    toneTag: 'Youthful & Natural',
    description: 'Fresh, approachable feminine timbre with smooth pacing.',
    previewSample: "Hi! I'm Leda. Let's keep things easy and get straight to what you need."
  },
  {
    id: 'Callirrhoe',
    name: 'Callirrhoe',
    gender: 'female',
    toneTag: 'Easy-going',
    description: 'Relaxed, calm presence for gentle late-night or study conversations.',
    previewSample: "Hello there, I'm Callirrhoe. Take your time — I'm right here listening."
  },
  {
    id: 'Autonoe',
    name: 'Autonoe',
    gender: 'female',
    toneTag: 'Bright & Clear',
    description: 'Crisp, articulate delivery great for quick explanations and facts.',
    previewSample: "Hi, I'm Autonoe. Ask me anything and I'll walk you through it clearly."
  },
  {
    id: 'Despina',
    name: 'Despina',
    gender: 'female',
    toneTag: 'Smooth & Poised',
    description: 'Velvety, reassuring tone with expressive emotional nuance.',
    previewSample: "Hello! I'm Despina. Let's make today feel a little smoother together."
  },
  {
    id: 'Erinome',
    name: 'Erinome',
    gender: 'female',
    toneTag: 'Clear & Expressive',
    description: 'Dynamic, story-friendly voice with balanced vocal warmth.',
    previewSample: "Hey there, I'm Erinome. Tell me what you're curious about today!"
  },
  {
    id: 'Sulafat',
    name: 'Sulafat',
    gender: 'female',
    toneTag: 'Warm & Caring',
    description: 'Gentle, supportive companion voice with comforting warmth.',
    previewSample: "হ্যালো! আমি সুলাফাত। আপনার যেকোনো কথায় আমি পাশে আছি।"
  },

  // Male Gemini Prebuilt Voices
  {
    id: 'Orus',
    name: 'Orus',
    gender: 'male',
    toneTag: 'Firm & Crisp',
    description: 'Grounded, crisp male voice built for clear everyday assistance.',
    previewSample: "Hey there, I'm Orus. Everything is ready whenever you want to dive in.",
    featured: true
  },
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'male',
    toneTag: 'Upbeat & Friendly',
    description: 'Cheerful, conversational male voice with quick witty energy.',
    previewSample: "Hey! I'm Puck. Got an idea or a tough question? Let's tackle it!"
  },
  {
    id: 'Charon',
    name: 'Charon',
    gender: 'male',
    toneTag: 'Informative & Deep',
    description: 'Rich, calm baritone well-suited for deep explanations and focus.',
    previewSample: "Good to hear from you. I'm Charon — let's explore whatever you need."
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    gender: 'male',
    toneTag: 'Energetic',
    description: 'Expressive, bold tone with lively conversational momentum.',
    previewSample: "Hey! I'm Fenrir. Ready when you are — let's get things moving!"
  },
  {
    id: 'Iapetus',
    name: 'Iapetus',
    gender: 'male',
    toneTag: 'Clear & Steady',
    description: 'Clean, composed male voice with crisp pronunciation.',
    previewSample: "Hello, I'm Iapetus. Ask away and I'll give you a clear answer."
  },
  {
    id: 'Umbriel',
    name: 'Umbriel',
    gender: 'male',
    toneTag: 'Easy-going',
    description: 'Laid-back, natural friend-like male tone without stiffness.',
    previewSample: "Hey, I'm Umbriel. Just tell me what you're thinking and we'll sort it out."
  },
  {
    id: 'Algieba',
    name: 'Algieba',
    gender: 'male',
    toneTag: 'Smooth & Warm',
    description: 'Warm, even-toned male companion voice with pleasant resonance.',
    previewSample: "Hi there, I'm Algieba. Let me know how I can help out today."
  },
  {
    id: 'Enceladus',
    name: 'Enceladus',
    gender: 'male',
    toneTag: 'Soft & Calm',
    description: 'Gentle, low-key breathy voice ideal for quiet conversations.',
    previewSample: "হ্যালো! আমি এন্সেলাডাস। একদম শান্তভাবে বলুন, কী নিয়ে কথা বলব?"
  }
];

export function getGeminiVoiceByName(voiceName?: string): GeminiVoiceOption | undefined {
  if (!voiceName) return undefined;
  const clean = voiceName.trim().toLowerCase();
  return GEMINI_VOICE_OPTIONS.find(v => v.id.toLowerCase() === clean);
}

export function getDefaultGeminiVoiceForIdentity(identity: VoiceIdentity): GeminiVoiceOption {
  return identity === 'female'
    ? GEMINI_VOICE_OPTIONS.find(v => v.id === 'Kore')!
    : GEMINI_VOICE_OPTIONS.find(v => v.id === 'Orus')!;
}

export function resolveGeminiVoiceForSettings(voiceName: string | undefined, identity: VoiceIdentity): GeminiVoiceOption {
  const matched = getGeminiVoiceByName(voiceName);
  if (matched) return matched;
  return getDefaultGeminiVoiceForIdentity(identity);
}


