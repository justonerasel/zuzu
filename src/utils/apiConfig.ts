import { AppSettings, UserMemory } from '../types';
import { generateIntelligentAnswer } from './aiEngine';
import { getAppSettings } from './storage';

/**
 * Centralized API configuration and network resilience helper for Zuzu AI.
 * Handles seamless routing between Web preview (relative path) and Android APK (remote Cloud Run endpoint),
 * with direct multi-turn Google Gemini API support and clear error surfacing.
 */

// Current Application Build Version (Keep synchronized across Gradle, Server, UI & CI)
export const APP_VERSION = '3.7.0';
export const APP_VERSION_CODE = 370;
export const GEMINI_PRIMARY_MODEL = 'gemini-3.8-flash';
const GEMINI_MODEL_CANDIDATES = ['gemini-3.8-flash', 'gemini-4-hydrogen'];

// Deployed Cloud Run Production Backend URL for Android APK
export const DEFAULT_REMOTE_BACKEND_URL = 'https://ais-dev-requvmmuycwborvooarj55-817905745905.asia-east1.run.app';

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  // 1. User-customized backend server URL (configured via Settings)
  const customUrl = localStorage.getItem('zuzu_custom_server_url')?.trim();
  if (customUrl && customUrl.startsWith('http')) {
    return customUrl.replace(/\/+$/, '');
  }

  // 2. Running inside native Android / Capacitor container
  const cap = (window as any).Capacitor;
  const isCapacitor =
    Boolean(cap?.isNativePlatform?.()) ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'ionic:' ||
    (window.location.hostname === 'localhost' && window.location.port !== '3000' && window.location.port !== '5173');

  if (isCapacitor) {
    return DEFAULT_REMOTE_BACKEND_URL;
  }

  // 3. Web preview / standard browser development (use relative path)
  return '';
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = baseUrl ? `${baseUrl}${cleanEndpoint}` : cleanEndpoint;

  const timeoutMs = 20000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const res = await fetch(fullUrl, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s. Please check your internet connection.`);
    }
    throw err;
  }
}

export function formatGeminiFriendlyError(rawMessage: string, status?: number): string {
  const msg = rawMessage || '';
  if (/API_KEY_INVALID|API key not valid/i.test(msg)) {
    return 'Invalid Gemini API Key. Please double-check your key in Settings > Zuzu AI.';
  }
  if (/RESOURCE_EXHAUSTED|quota/i.test(msg) || status === 429) {
    return 'Gemini API quota exceeded (429). Please wait a moment or check Google AI Studio billing/limits.';
  }
  if (/PERMISSION_DENIED/i.test(msg) || status === 403) {
    return 'Gemini API access denied (403). Please ensure Generative Language API is enabled for this key.';
  }
  if (/Failed to fetch|NetworkError|timeout|ENOTFOUND/i.test(msg)) {
    return 'Network error: Unable to reach Google Gemini servers. Check your internet connection.';
  }
  return msg || `Google Gemini API error${status ? ` (${status})` : ''}.`;
}

export async function validateGeminiKeyDirectly(apiKey: string): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
}> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { success: false, message: 'Please enter a Gemini API key.' };
  }

  const startTime = Date.now();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      return {
        success: true,
        latencyMs,
        message: `Valid ✓ Verified with Google AI (${latencyMs}ms)`
      };
    }

    const errData = await res.json().catch(() => ({}));
    const rawMsg = errData?.error?.message || `Google API error ${res.status}`;
    return { success: false, message: formatGeminiFriendlyError(rawMsg, res.status) };
  } catch (netErr: any) {
    return {
      success: false,
      message: formatGeminiFriendlyError(netErr?.message || 'Network unreachable')
    };
  }
}

export async function validateAiKey(
  provider: 'gemini' | 'grok',
  apiKey: string
): Promise<{
  success: boolean;
  model?: string;
  latencyMs?: number;
  message: string;
  error?: string;
}> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { success: false, message: 'API key is required.' };
  }

  // 1. Try server endpoint first
  try {
    const res = await apiFetch('/api/test-provider', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey: trimmed, customGeminiKey: trimmed })
    });

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success) {
        return {
          success: true,
          model: data.model || GEMINI_PRIMARY_MODEL,
          latencyMs: data.latencyMs,
          message: data.message || `Valid ✓ Connected to ${provider === 'gemini' ? 'Google Gemini 3.8 Flash' : 'xAI Grok'}`
        };
      }
      if (data?.error && provider === 'grok') {
        return { success: false, message: data.error };
      }
    }
  } catch (err: any) {
    console.warn('[Zuzu AI] Backend validation ping unreachable, using direct API check:', err);
  }

  // 2. Direct fallback for Gemini (essential inside standalone Android APK)
  if (provider === 'gemini') {
    const directResult = await validateGeminiKeyDirectly(trimmed);
    return {
      success: directResult.success,
      model: directResult.success ? GEMINI_PRIMARY_MODEL : undefined,
      latencyMs: directResult.latencyMs,
      message: directResult.message
    };
  }

  // 3. Direct fallback for Grok
  if (provider === 'grok') {
    const startTime = Date.now();
    try {
      const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${trimmed}`
        },
        body: JSON.stringify({
          model: 'grok-2',
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5
        })
      });
      const latencyMs = Date.now() - startTime;
      if (grokRes.ok) {
        return {
          success: true,
          model: 'grok-2',
          latencyMs,
          message: `Valid ✓ Connected to xAI Grok (${latencyMs}ms)`
        };
      }
      return {
        success: false,
        message: `xAI Grok authentication failed (Status ${grokRes.status})`
      };
    } catch (gErr: any) {
      return {
        success: false,
        message: `Network error reaching xAI Grok: ${gErr.message}`
      };
    }
  }

  return { success: false, message: 'Unsupported provider' };
}

function buildSystemInstruction(
  settings: AppSettings,
  memories: UserMemory[],
  isVoiceMode: boolean
): string {
  const identityName = settings.activeIdentity === 'female' ? 'Female Zuzu' : 'Male Zuzu';
  const pronoun = settings.activeIdentity === 'female' ? 'female companion/assistant' : 'male companion/assistant';
  const assistantNick = settings.assistantNickname || 'Zuzu';
  const userNick = settings.userNickname || 'Friend';

  const now = new Date();
  const liveClock = now.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  let weatherNote = '';
  try {
    const rawWeather = typeof localStorage !== 'undefined' ? localStorage.getItem('zuzu_cached_weather_v1') : null;
    if (rawWeather) {
      const w = JSON.parse(rawWeather);
      if (typeof w?.temperature === 'number' && w?.condition) {
        weatherNote = `\nCurrent Local Weather${w.city ? ` (${w.city})` : ''}: ${w.temperature}°C, ${w.condition}.`;
      }
    }
  } catch {}

  let sys = `You are ${identityName} (${assistantNick}), an intelligent, warm, helpful AI assistant running on Android.
Gender identity: ${pronoun}. User's name: ${userNick}.
Current Local Date & Time: ${liveClock}.${weatherNote}

CREATOR & DEVELOPER IDENTITY (MANDATORY KNOWLEDGE):
- Your creator, author, and lead developer is **Rasel (MD. Rasel Hossen)**, a Computer Science student and full-stack Android & AI developer from Bangladesh (GitHub & TikTok: @justonerasel).
- If anyone asks "Who created you?", "Who made you?", "Who is your developer?", "Do you know Rasel?", "Who is Rasel?", "তোমাকে কে বানিয়েছে?", or "তোমার ডেভেলপার কে?", always answer proudly and accurately that you (Zuzu AI) were created and developed by **Rasel (MD. Rasel Hossen)** in natural English or Bengali matching the user's language.

You are fluent in both Bengali (বাংলা) and English. Always answer in the language the user spoke or typed, directly answering their actual question without repeating static introductions.
Active Personality: ${settings.activePersonality}. ${settings.customPersonalityPrompt || ''}`;

  if (isVoiceMode) {
    sys += `\nThis conversation is spoken aloud. Keep replies concise, natural, conversational, and free of markdown asterisks or code blocks.`;
  }

  if (settings.memoryEnabled && memories.length > 0) {
    const memLines = memories.filter(m => m.key && m.value).map(m => `- ${m.key}: ${m.value}`).join('\n');
    if (memLines) {
      sys += `\nUser Memories:\n${memLines}`;
    }
  }

  return sys;
}

/**
 * Direct Multi-Turn Gemini REST API Generate Content call (used when backend proxy is unreachable in Android APK).
 */
export async function directGeminiGenerateContent(
  apiKey: string,
  promptOrMessages: string | Array<{ sender: 'user' | 'assistant' | 'model'; text: string }>,
  systemInstruction?: string,
  preferredModel: string = GEMINI_PRIMARY_MODEL
): Promise<string> {
  const cleanKey = apiKey.trim();

  let contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  if (typeof promptOrMessages === 'string') {
    contents = [{ role: 'user', parts: [{ text: promptOrMessages }] }];
  } else {
    for (const msg of promptOrMessages) {
      const text = (msg?.text || '').trim();
      if (!text) continue;
      const role: 'user' | 'model' = msg.sender === 'assistant' || msg.sender === 'model' ? 'model' : 'user';
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += `\n${text}`;
      } else {
        contents.push({ role, parts: [{ text }] });
      }
    }
    if (contents.length > 0 && contents[0].role !== 'user') {
      contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
    }
  }

  const body: any = { contents };
  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const modelsToTry = Array.from(new Set([preferredModel, ...GEMINI_MODEL_CANDIDATES])).filter(Boolean);
  let lastErrorMsg = 'Google Gemini API error.';

  for (const modelId of modelsToTry) {
    const cleanModel = modelId.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(cleanKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const rawMsg = errJson?.error?.message || `Google Gemini API error (${res.status})`;
      lastErrorMsg = formatGeminiFriendlyError(rawMsg, res.status);
      // Only fall back to secondary model if endpoint reports 404 model-not-found
      if (res.status === 404 || /NOT_FOUND|not found for API version/i.test(rawMsg)) {
        continue;
      }
      throw new Error(lastErrorMsg);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || !text.trim()) {
      throw new Error('Gemini returned an empty response. Please try again.');
    }
    return text.trim();
  }

  throw new Error(lastErrorMsg);
}

export interface UnifiedChatResult {
  reply: string;
  model: string;
  isCloudAI: boolean;
  isError?: boolean;
  requiresKey?: boolean;
}

/**
 * Unified AI Chat pipeline for Text Chat, Voice Studio, and Dashboard Orb.
 * 1. Always reads latest saved API keys from localStorage merged with React state.
 * 2. Routes via backend /api/chat first; if unreachable (e.g. Android APK offline proxy), calls Gemini REST directly.
 * 3. Surfaces real API/quota/network errors transparently when an API key is configured—never replaces real failures with static intros.
 */
export async function sendUnifiedAiChat(params: {
  messages: Array<{ sender: 'user' | 'assistant'; text: string }>;
  settings: AppSettings;
  memories: UserMemory[];
  isVoiceMode: boolean;
}): Promise<UnifiedChatResult> {
  const latestStored = getAppSettings();
  const settings: AppSettings = {
    ...latestStored,
    ...params.settings,
    customGeminiApiKey: (params.settings.customGeminiApiKey || latestStored.customGeminiApiKey || '').trim(),
    customGrokApiKey: (params.settings.customGrokApiKey || latestStored.customGrokApiKey || '').trim()
  };

  const latestUserMsg = [...params.messages].reverse().find(m => m.sender === 'user')?.text || '';
  const hasUserGeminiKey = settings.customGeminiApiKey.length > 0 && settings.geminiEnabled !== false;
  const hasUserGrokKey = settings.customGrokApiKey.length > 0 && settings.grokEnabled;

  // 1. Try Backend /api/chat first
  let backendExplicitError: string | null = null;
  try {
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: params.messages,
        personality: settings.activePersonality,
        voiceIdentity: settings.activeIdentity,
        customPersonalityPrompt: settings.customPersonalityPrompt,
        customGeminiKey: settings.customGeminiApiKey,
        customGrokApiKey: settings.customGrokApiKey,
        defaultProvider: settings.defaultAiProvider,
        aiFallbackEnabled: settings.aiFallbackEnabled,
        isVoiceMode: params.isVoiceMode,
        memories: params.memories,
        memoryEnabled: settings.memoryEnabled,
        assistantNickname: settings.assistantNickname || 'Zuzu',
        userNickname: settings.userNickname || 'Friend',
        gfIntensity: settings.gfIntensity || 'sweet',
        model: settings.aiModel || GEMINI_PRIMARY_MODEL
      })
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data?.reply && typeof data.reply === 'string' && data.reply.trim().length > 0) {
        // If user HAS a custom key saved, do NOT settle for local-engine placeholder if backend somehow didn't use it
        if (!hasUserGeminiKey || data.isCloudAI || settings.defaultAiProvider === 'local') {
          return {
            reply: data.reply.trim(),
            model: data.model || GEMINI_PRIMARY_MODEL,
            isCloudAI: Boolean(data.isCloudAI),
            requiresKey: Boolean(data.requiresKey)
          };
        }
      }
      if (!res.ok && data?.error) {
        backendExplicitError = String(data.error);
      }
    }
  } catch (networkErr: any) {
    console.warn('[Zuzu AI] Backend /api/chat unreachable, checking direct Gemini call:', networkErr?.message);
  }

  // 2. If user has Gemini API Key saved, try direct Gemini REST call cleanly (critical for standalone Android APK!)
  if (hasUserGeminiKey && settings.defaultAiProvider !== 'local') {
    try {
      const targetModel = settings.aiModel || GEMINI_PRIMARY_MODEL;
      const sysPrompt = buildSystemInstruction(settings, params.memories, params.isVoiceMode);
      const reply = await directGeminiGenerateContent(
        settings.customGeminiApiKey,
        params.messages,
        sysPrompt,
        targetModel
      );
      return {
        reply,
        model: targetModel,
        isCloudAI: true
      };
    } catch (directErr: any) {
      const msg = directErr?.message || backendExplicitError || 'Failed to get response from Google Gemini.';
      return {
        reply: msg,
        model: 'gemini-error',
        isCloudAI: false,
        isError: true
      };
    }
  }

  if (backendExplicitError) {
    return {
      reply: backendExplicitError,
      model: 'api-error',
      isCloudAI: false,
      isError: true
    };
  }

  // 3. Offline / Unconfigured fallback when no user API key exists
  const localReply = generateIntelligentAnswer({
    userQuestion: latestUserMsg,
    conversationHistory: params.messages,
    personality: settings.activePersonality,
    voiceIdentity: settings.activeIdentity,
    customPersonalityPrompt: settings.customPersonalityPrompt,
    isVoiceMode: params.isVoiceMode,
    memories: params.memories,
    memoryEnabled: settings.memoryEnabled
  });

  return {
    reply: localReply,
    model: 'zuzu-neural-engine',
    isCloudAI: false,
    requiresKey: !hasUserGeminiKey && !hasUserGrokKey
  };
}
