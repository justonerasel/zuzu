import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { generateIntelligentAnswer } from './src/utils/aiEngine.ts';
import { classifyRealtimeSearchIntent } from './src/utils/searchIntent.ts';
import {
  extractGroundingSourcesFromResponse,
  fetchNewsRssServer,
  gatherRealtimeIntelligence,
  mergeSearchSources
} from './server/realtimeSearch.ts';
import {
  MAX_NEWS_RSS_RESULTS,
  buildNewsFeedErrorMessage,
  buildNoMatchingNewsMessage,
  buildStrictNewsRssSystemInstruction
} from './src/utils/newsRss.ts';
import type { SearchSourceItem } from './src/types/index.ts';
import { getLatestChangelogRelease, getSortedChangelog } from './src/data/changelog.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '15mb' }));

// Enable CORS for Android APK (Capacitor/WebView) and remote clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Custom-Gemini-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const latestChangelog = getLatestChangelogRelease();
const LATEST_APP_VERSION = latestChangelog?.version || '3.8.0';
const LATEST_VERSION_CODE = latestChangelog?.versionCode || 380;
const MIN_SUPPORTED_VERSION = process.env.ZUZU_MIN_SUPPORTED_VERSION || '3.7.0';

// Centralized free Gemini model configuration (never exposed to users; zero paid or deprecated models)
const GEMINI_MODELS = {
  chatPrimary: 'gemini-3.8-flash',
  chatFallbacks: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
  textPrimary: 'gemini-3.5-flash-lite',
  textFallbacks: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
  ttsPrimary: 'gemini-3.8-flash-lite-tts',
  ttsFallbacks: ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'],
  transcribePrimary: 'gemini-3.5-transcribe',
  transcribeFallbacks: ['gemini-3.5-transcribe', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
  imagePrimary: 'gemini-3.1-flash-lite-image',
} as const;

const HIGH_DEMAND_RETRY_DELAYS_MS = [2000, 4000] as const;

function isTransientHighDemandError(rawMessage: string, status?: number): boolean {
  if (status === 503 || status === 429) return true;
  return /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|Service Unavailable|quota|rate limit/i.test(rawMessage);
}

function isFatalAuthError(rawMessage: string, status?: number): boolean {
  if (status === 401 || status === 403) return true;
  return /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(rawMessage);
}

function isModelUnavailableError(rawMessage: string, status?: number): boolean {
  if (isFatalAuthError(rawMessage, status)) return false;
  if (status === 404) return true;
  return /404|NOT_FOUND|not found for API version|is not found|not supported for generateContent|unknown model|invalid model|model.*not available|thinking/i.test(rawMessage);
}

function sleepWithCancel(ms: number, shouldStop: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (shouldStop()) return resolve(false);
    const timer = setTimeout(() => resolve(!shouldStop()), ms);
    const poll = setInterval(() => {
      if (shouldStop()) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve(false);
      }
    }, 100);
    setTimeout(() => clearInterval(poll), ms + 25);
  });
}

const ALLOWED_GEMINI_VOICES = new Set([
  'Aoede', 'Kore', 'Zephyr', 'Leda', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Sulafat',
  'Puck', 'Charon', 'Fenrir', 'Orus', 'Iapetus', 'Umbriel', 'Algieba', 'Enceladus'
]);

function resolveVoiceName(requestedVoice?: string, voiceIdentity: 'male' | 'female' = 'male'): string {
  if (requestedVoice && typeof requestedVoice === 'string') {
    const match = Array.from(ALLOWED_GEMINI_VOICES).find(
      v => v.toLowerCase() === requestedVoice.trim().toLowerCase()
    );
    if (match) return match;
  }
  return voiceIdentity === 'female' ? 'Kore' : 'Orus';
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
}

function getEffectiveGeminiKey(explicitKey?: string): string {
  const cleanExplicit = typeof explicitKey === 'string' ? explicitKey.trim() : '';
  if (cleanExplicit && cleanExplicit !== 'MY_GEMINI_API_KEY') return cleanExplicit;
  const envKey = typeof process.env.GEMINI_API_KEY === 'string' ? process.env.GEMINI_API_KEY.trim() : '';
  if (envKey && envKey !== 'MY_GEMINI_API_KEY') return envKey;
  return '';
}

function sanitizeErrorMessage(raw: string): string {
  return String(raw || 'Request failed.')
    .replace(/AIza[0-9A-Za-z-_]{20,}/g, '[REDACTED_KEY]')
    .replace(/key=[^&\s]+/gi, 'key=[REDACTED]');
}

function unwrapGeminiMessage(raw: string): string {
  const sanitized = sanitizeErrorMessage(raw || 'Google Gemini request failed.');
  if (sanitized.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(sanitized);
      const inner = parsed?.error?.message || parsed?.message;
      if (typeof inner === 'string') {
        return unwrapGeminiMessage(inner);
      }
    } catch {}
  }
  return sanitized;
}

function mapGeminiError(err: any): { status: number; message: string } {
  const raw = unwrapGeminiMessage(err?.message || 'Google Gemini request failed.');
  if (/API_KEY_INVALID|API key not valid/i.test(raw)) {
    return { status: 401, message: 'Invalid Gemini API Key. Please check your key in Settings > Gemini API & Connection.' };
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(raw)) {
    return { status: 429, message: 'Gemini API rate limit or quota exceeded. Please try again shortly.' };
  }
  if (/PERMISSION_DENIED|403/i.test(raw)) {
    return { status: 403, message: 'Gemini API access denied (403). Enable the Generative Language API for this key.' };
  }
  if (/503|UNAVAILABLE|high demand|overloaded|Service Unavailable/i.test(raw)) {
    return { status: 503, message: 'Google Gemini is experiencing temporary high demand. Please try again in a moment.' };
  }
  if (/timed out|timeout|aborted|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(raw)) {
    return { status: 504, message: 'Network timeout reaching Google Gemini. Please check your internet connection.' };
  }
  return { status: 502, message: raw };
}

function buildConfigForModel(
  modelId: string,
  systemInstruction?: string,
  enableGoogleSearch = false
): Record<string, any> {
  const cfg: Record<string, any> = {};
  if (systemInstruction) {
    cfg.systemInstruction = systemInstruction;
  }
  if (enableGoogleSearch) {
    cfg.tools = [{ googleSearch: {} }];
  }
  // Enforce LOW thinking level on Gemini 4 Hydrogen for snappy, low-latency responses
  if (modelId.startsWith('gemini-4')) {
    cfg.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  }
  return cfg;
}

function formatGeminiHistory(
  messages: any[],
  fallbackPrompt = 'Hello'
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  // Cap conversation context sent to Gemini at the last 10 messages for speed & token efficiency
  const validMessages = messages
    .filter((m: any) => m && typeof m.text === 'string' && m.text.trim().length > 0)
    .slice(-10);
  const formatted: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const msg of validMessages) {
    const role: 'user' | 'model' = msg.sender === 'assistant' || msg.sender === 'model' ? 'model' : 'user';
    if (formatted.length > 0 && formatted[formatted.length - 1].role === role) {
      formatted[formatted.length - 1].parts[0].text += `\n${msg.text.trim()}`;
    } else {
      formatted.push({ role, parts: [{ text: msg.text.trim() }] });
    }
  }

  while (formatted.length > 1 && formatted[0].role !== 'user') {
    formatted.shift();
  }
  if (formatted.length > 0 && formatted[0].role !== 'user') {
    formatted.unshift({ role: 'user', parts: [{ text: fallbackPrompt || 'Hello' }] });
  }

  return formatted.length > 0 ? formatted : [{ role: 'user', parts: [{ text: fallbackPrompt }] }];
}

function buildZuzuSystemInstruction(params: {
  personality?: string;
  voiceIdentity?: string;
  customPersonalityPrompt?: string;
  isVoiceMode?: boolean;
  memories?: any[];
  memoryEnabled?: boolean;
  assistantNickname?: string;
  userNickname?: string;
  gfIntensity?: string;
}): string {
  const {
    personality = 'Normal',
    voiceIdentity = 'male',
    customPersonalityPrompt = '',
    isVoiceMode = false,
    memories = [],
    memoryEnabled = true,
    assistantNickname = 'Zuzu',
    userNickname = 'Friend',
    gfIntensity = 'sweet'
  } = params;

  const identityName = voiceIdentity === 'female' ? 'Female Zuzu' : 'Male Zuzu';
  const pronoun = voiceIdentity === 'female' ? 'female companion & assistant' : 'male companion & assistant';
  const liveNowDhaka = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  let sys = `You are ${identityName} (${assistantNickname || 'Zuzu'}), a natural, intelligent, emotionally perceptive AI companion running on Android.
Your voice persona is ${pronoun}. The user's name is "${userNickname || 'Friend'}".
Today's Date & Current Time (Asia/Dhaka): ${liveNowDhaka} | UTC: ${new Date().toISOString()}

CREATOR KNOWLEDGE:
- Your creator and lead developer is Rasel (MD. Rasel Hossen), a Computer Science student and full-stack Android & AI developer from Bangladesh (GitHub & TikTok: @justonerasel).
- Only mention this when asked who created, built, or developed you, or who Rasel is — answer proudly in the user's language.

HOW TO CONVERSE NATURALLY:
- Reply in the same language as the user. Be short and direct. Answer only what was asked. If the user asks several questions, answer each in 1-2 lines. Give long or detailed answers only when the user asks for details.
- Respond like a genuine, attentive human conversational partner — warm, clear, adaptive, and lightly witty when appropriate.
- Answer directly without echoing or repeating back the user's question (never begin with "You asked...", "Regarding your question:", or canned repetitive greetings).
- Do NOT use repetitive stock catchphrases or overused templates across turns. Keep your phrasing fresh and varied.`;

  if (isVoiceMode) {
    sys += `\n\nVOICE RESPONSE STYLE:
- This reply will be spoken aloud. Keep it crisp, natural, conversational, and concise.
- Avoid markdown asterisks (**), bullet symbols, code blocks, or awkward symbols that sound unnatural when read aloud.`;
  } else {
    sys += `\n\nCHAT FOCUS & ACCURACY RULES:
- Answer the user's actual question first and directly. Stay on the topic of the user's last message and the earlier conversation. Never switch to an unrelated topic, and never bring up news or sports unless asked. If the question is unclear, ask one short clarifying question. Use the previous messages for context. Be accurate. If you do not know, say so.

TEXT FORMATTING STYLE:
- Format structured replies cleanly with Markdown headings, bullet points, numbered steps, and fenced code blocks where helpful.
- Use Markdown tables for comparisons, calculations, and plans.
- Do NOT include URLs or a separate list of source links unless the user explicitly asks for links.`;
  }

  const gfIntensityGuide: Record<string, string> = {
    sweet: 'Gentle, affectionate, genuinely caring, relaxed emotional warmth.',
    romantic: 'Heartfelt, expressive, poetic affection with warm emotional closeness.',
    playful: 'Lighthearted teasing, cute humor, smiling banter.',
    flirty: 'Charming, confident, playfully romantic and attentive while staying respectful and natural.'
  };

  const personalityInstructions: Record<string, string> = {
    Normal: 'Balanced, helpful, perceptive, and natural.',
    Friendly: 'Upbeat, approachable, encouraging, like a supportive close friend.',
    Professional: 'Crisp, structured, composed, and executive-ready.',
    Funny: 'Sharp wit, playful observations, clever lightness.',
    Companion: 'Deeply empathetic, steady, thoughtful listener who offers calm perspective.',
    'GF Mode': `You are the user's warm, affectionate girlfriend companion (${gfIntensityGuide[gfIntensity] || gfIntensityGuide.sweet}). Speak naturally without stiff titles like "Sir", vary how you express affection so it never sounds scripted, and stay emotionally engaged.`,
    'BF Mode': 'You are the user\'s caring, grounded, charming boyfriend companion — supportive, attentive, with easy playful warmth.',
    Teacher: 'Patient educator using crystal-clear everyday analogies and clean step-by-step clarity.',
    Developer: 'Senior engineer: direct, idiomatic code, pragmatic debugging, and clean architecture.',
    Hungry: 'Playfully enthusiastic about great food and cooking metaphors while staying helpful.',
    Custom: customPersonalityPrompt || 'Follow the user\'s custom personality instructions.'
  };

  sys += `\n\nACTIVE PERSONALITY (${personality}): ${personalityInstructions[personality] || personalityInstructions.Normal}`;

  if (memoryEnabled && Array.isArray(memories) && memories.length > 0) {
    const formattedMemories = memories
      .filter((m: any) => m && m.key && m.value)
      .map((m: any) => `- ${m.key}: ${m.value}`)
      .join('\n');
    if (formattedMemories) {
      sys += `\n\nUSER PERSONAL MEMORIES:\n${formattedMemories}\nApply these naturally when relevant.`;
    }
  }

  return sys;
}

async function generateWithGeminiResilience(
  clientAi: GoogleGenAI,
  params: {
    contents: any;
    systemInstruction?: string;
    timeoutMs?: number;
    enableGoogleSearch?: boolean;
    modelCandidates?: readonly string[];
  }
): Promise<{ response: any; usedModel: string }> {
  let lastErr: any = null;
  const candidates = params.modelCandidates && params.modelCandidates.length > 0
    ? params.modelCandidates
    : GEMINI_MODELS.textFallbacks;

  for (let i = 0; i < candidates.length; i++) {
    const modelId = candidates[i];
    const hasMore = i < candidates.length - 1;
    const maxRetriesForModel = i === 0 ? HIGH_DEMAND_RETRY_DELAYS_MS.length : 0;

    for (let attempt = 0; attempt <= maxRetriesForModel; attempt++) {
      let timeoutHandle: NodeJS.Timeout | null = null;
      try {
        const config = buildConfigForModel(modelId, params.systemInstruction, Boolean(params.enableGoogleSearch));
        const requestPromise = clientAi.models.generateContent({
          model: modelId,
          contents: params.contents,
          ...(Object.keys(config).length > 0 ? { config } : {})
        });

        const baseTimeout = params.enableGoogleSearch ? 18000 : 12000;
        const timeoutMs = params.timeoutMs ?? (hasMore ? baseTimeout : baseTimeout + 6000);
        const response = await Promise.race([
          requestPromise,
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s.`)),
              timeoutMs
            );
          })
        ]);

        if (timeoutHandle) clearTimeout(timeoutHandle);
        return { response, usedModel: modelId };
      } catch (err: any) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        lastErr = err;
        const msg = err?.message || '';
        const status = err?.status;

        if (isFatalAuthError(msg, status)) {
          throw err;
        }
        if (isModelUnavailableError(msg, status)) {
          // Immediately fall back to next model
          break;
        }
        if (attempt < maxRetriesForModel && isTransientHighDemandError(msg, status)) {
          await sleepWithCancel(HIGH_DEMAND_RETRY_DELAYS_MS[attempt], () => false);
          continue;
        }
        if (hasMore && (isTransientHighDemandError(msg, status) || /timed out|timeout/i.test(msg))) {
          break;
        }
        throw err;
      }
    }
  }

  throw lastErr || new Error('Google Gemini model request failed.');
}

// Wrap raw 24kHz 16-bit mono PCM in a WAV header only if upstream returned raw L16 PCM instead of WAV
function wrapPcm16MonoAsWav(pcmBuffer: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

// Endpoint: Configuration check (never leaks secrets)
app.get('/api/config', (_req, res) => {
  res.json({
    appName: 'Zuzu AI',
    provider: 'gemini',
    hasGeminiKey: Boolean(getEffectiveGeminiKey()),
    searchEnabled: true,
    googleSearchGrounding: true,
    version: `v${LATEST_APP_VERSION} (Latest Release)`,
    versionCode: LATEST_VERSION_CODE,
    targetCompatibility: 'Android 9.0 (Pie) through Android 16'
  });
});

// Endpoint: Free Google News RSS Proxy (CORS-free XML/JSON feed for web browsers)
app.get('/api/news-rss', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q : 'world news';
  const isBengali = req.query.bn === '1' || req.query.bn === 'true' || /[\u0980-\u09FF]/.test(query);
  const regionHint = req.query.region === 'BD' || isBengali ? 'BD' : 'GLOBAL';
  const asksAboutSports = req.query.sports === '1' || req.query.sports === 'true';
  const rssRes = await fetchNewsRssServer({ query, isBengali, regionHint, asksAboutSports });
  return res.status(rssRes.ok ? 200 : 502).json({
    ok: rssRes.ok,
    feedUrl: rssRes.feedUrl,
    noMatchingNews: Boolean(rssRes.noMatchingNews),
    topicQuery: rssRes.topicQuery,
    items: rssRes.items.slice(0, MAX_NEWS_RSS_RESULTS).map(({ publishedMs: _ms, ...rest }) => rest),
    error: rssRes.error
  });
});

// Endpoint: Dynamic Live Changelog & Release History (sorted newest-first)
app.get('/api/system/updates', (_req, res) => {
  const history = getSortedChangelog();
  const latest = history[0];
  res.json({
    appName: 'Zuzu AI',
    currentVersion: `v${latest?.version || LATEST_APP_VERSION}`,
    currentVersionCode: latest?.versionCode || LATEST_VERSION_CODE,
    latest,
    history,
    totalReleases: history.length
  });
});

// Endpoint: System update & In-App OTA checking
app.get('/api/system/check-update', (req, res) => {
  const latest = getLatestChangelogRelease();
  const latestVer = latest?.version || LATEST_APP_VERSION;
  const latestCode = latest?.versionCode || LATEST_VERSION_CODE;
  const installedVersion = typeof req.query.installedVersion === 'string' ? req.query.installedVersion : latestVer;
  const installedCode = req.query.versionCode ? parseInt(String(req.query.versionCode), 10) : latestCode;
  const forceRequiredByMin = compareSemver(installedVersion, MIN_SUPPORTED_VERSION) < 0 || (!Number.isNaN(installedCode) && installedCode < 360);
  const hasNewerVersion = compareSemver(installedVersion, latestVer) < 0 || (!Number.isNaN(installedCode) && installedCode < latestCode);
  const forceFlag = process.env.ZUZU_FORCE_UPDATE === 'true' || forceRequiredByMin;

  const summaryItems = [
    ...(latest?.newFeatures || []),
    ...(latest?.bugFixes || []),
    ...(latest?.improvements || [])
  ].slice(0, 5);

  res.json({
    appName: 'Zuzu AI',
    currentVersion: `v${latestVer}`,
    latestVersion: `v${latestVer}`,
    versionCode: latestCode,
    minSupportedVersion: `v${MIN_SUPPORTED_VERSION}`,
    buildTag: latest?.buildTag || `Build ${latestCode}-Production`,
    releaseDate: latest?.date || '2026-11-24',
    latestTitle: latest?.title || `Zuzu AI v${latestVer}`,
    status: hasNewerVersion ? 'update_available' : 'up_to_date',
    updateRequired: hasNewerVersion,
    forceUpdate: forceFlag,
    otaAvailable: true,
    otaMethod: 'in_app_delta',
    targetCompatibility: 'Android 9.0 (Pie) through Android 16',
    websiteUrl: 'https://ais-pre-requvmmuycwborvooarj55-817905745905.asia-east1.run.app',
    message: forceFlag
      ? `OTA update required (v${latestVer}). Syncing Zuzu AI ${latest?.title || 'latest release'}.`
      : `Zuzu AI is up to date on v${latestVer} (OTA Verified) — ${latest?.title || 'Latest Release'}.`,
    changelogSummary: summaryItems,
    latestRelease: latest
  });
});

// Canonical ZU-ID notice
const FIREBASE_ZU_MIGRATION_NOTICE = {
  success: false,
  canonicalStore: 'firebase_firestore',
  collection: 'zu_accounts',
  error: 'ZU-ID account sync is handled canonically via Firebase Firestore (`zu_accounts`).'
};

app.post('/api/zu/register', (_req, res) => res.status(410).json(FIREBASE_ZU_MIGRATION_NOTICE));
app.post('/api/zu/login', (_req, res) => res.status(410).json(FIREBASE_ZU_MIGRATION_NOTICE));
app.post('/api/zu/sync', (_req, res) => res.status(410).json(FIREBASE_ZU_MIGRATION_NOTICE));
app.get('/api/zu/status/:accountId', (_req, res) => res.status(410).json(FIREBASE_ZU_MIGRATION_NOTICE));

// Endpoint: Test Gemini API Key (Unified Connection Verification)
const handleTestGeminiKey = async (req: express.Request, res: express.Response) => {
  const rawKey = req.body.apiKey || req.body.customGeminiKey || req.body.key;

  if (!rawKey || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Gemini API key is required for testing.' });
  }

  const trimmedKey = rawKey.trim();
  const startTime = Date.now();
  const client = createGeminiClient(trimmedKey);

  try {
    await generateWithGeminiResilience(client, {
      contents: 'Reply with "OK".',
      timeoutMs: 10000
    });
    const latency = Date.now() - startTime;
    return res.json({
      success: true,
      provider: 'gemini',
      latencyMs: latency,
      message: `Connected to Google Gemini (${latency}ms)`
    });
  } catch (errPrimary: any) {
    const rawErr = sanitizeErrorMessage(errPrimary?.message || '');

    // Only verify via /models endpoint if failure was NOT an explicit auth/quota error
    if (!/API_KEY_INVALID|API key not valid|PERMISSION_DENIED|403|401/i.test(rawErr)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const restRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmedKey)}`, {
          signal: controller.signal
        });
        clearTimeout(timer);
        if (restRes.ok) {
          const latency = Date.now() - startTime;
          return res.json({
            success: true,
            provider: 'gemini',
            latencyMs: latency,
            message: `Connected to Google Gemini (${latency}ms)`
          });
        }
      } catch {
        clearTimeout(timer);
      }
    }

    const mapped = mapGeminiError(errPrimary);
    return res.status(mapped.status >= 400 && mapped.status < 500 ? mapped.status : 400).json({
      success: false,
      provider: 'gemini',
      error: mapped.message
    });
  }
};

app.post('/api/test-provider', handleTestGeminiKey);
app.post('/api/test-ai-key', handleTestGeminiKey);

// Endpoint: Streaming Chat / Voice Response (SSE for low-latency first-token rendering)
app.post('/api/chat/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let clientClosed = false;
  let activeAbortController: AbortController | null = null;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
      activeAbortController?.abort();
    }
  });

  const sendEvent = (payload: Record<string, any>) => {
    if (clientClosed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const {
      messages,
      personality = 'Normal',
      voiceIdentity = 'male',
      customPersonalityPrompt = '',
      customGeminiKey = '',
      isVoiceMode = false,
      memories = [],
      memoryEnabled = true,
      assistantNickname = 'Zuzu',
      userNickname = 'Friend',
      gfIntensity = 'sweet',
      prefetchedRssItems,
      prefetchedRssError
    } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      sendEvent({ error: 'Messages array is required.', status: 400 });
      return res.end();
    }

    const latestUserMsg = [...messages].reverse().find((m: any) => m.sender === 'user')?.text || '';
    const effectiveGeminiKey = getEffectiveGeminiKey(customGeminiKey);
    const searchClass = classifyRealtimeSearchIntent(latestUserMsg, messages);

    if (searchClass.isNewsQuery && typeof prefetchedRssError === 'string' && prefetchedRssError.trim()) {
      const feedFailMsg = buildNewsFeedErrorMessage(searchClass.isBengali, prefetchedRssError.trim());
      sendEvent({ delta: feedFailMsg });
      sendEvent({ done: true, isCloudAI: false, usedRealtimeSearch: false, sources: [] });
      return res.end();
    }

    if (!effectiveGeminiKey) {
      if (searchClass.needsSearch) {
        const missingSearchNotice = searchClass.isBengali
          ? 'লাইভ গুগল নিউজ এবং সর্বশেষ খবর দেখার জন্য Google Gemini API Key প্রয়োজন। অনুগ্রহ করে Settings → Gemini API & Connection-এ আপনার Gemini API Key যুক্ত করুন। আমি ভুয়া বা অনুমাননির্ভর রিয়েল-টাইম তথ্য দিই না।'
          : 'Live news summaries require a configured Google Gemini API key. Please add your Gemini API key in Settings → Gemini API & Connection. I never fabricate unverified news headlines.';
        sendEvent({ delta: missingSearchNotice });
        sendEvent({ done: true, isCloudAI: false, requiresKey: true, usedRealtimeSearch: false, sources: [] });
        return res.end();
      }

      const localAnswer = generateIntelligentAnswer({
        userQuestion: latestUserMsg,
        conversationHistory: messages,
        personality,
        voiceIdentity,
        customPersonalityPrompt,
        isVoiceMode,
        memories,
        memoryEnabled
      });
      sendEvent({ delta: localAnswer });
      sendEvent({ done: true, isCloudAI: false, requiresKey: true });
      return res.end();
    }

    let systemInstruction = buildZuzuSystemInstruction({
      personality,
      voiceIdentity,
      customPersonalityPrompt,
      isVoiceMode,
      memories,
      memoryEnabled,
      assistantNickname,
      userNickname,
      gfIntensity
    });

    let feedSources: SearchSourceItem[] = [];
    let enableGoogleSearchTool = false;
    if (searchClass.needsSearch) {
      if (Array.isArray(prefetchedRssItems) && prefetchedRssItems.length > 0 && searchClass.isNewsQuery) {
        feedSources = prefetchedRssItems.slice(0, MAX_NEWS_RSS_RESULTS);
        systemInstruction += buildStrictNewsRssSystemInstruction(
          feedSources,
          searchClass.isBengali,
          searchClass.asksAboutSports
        );
        enableGoogleSearchTool = false;
      } else {
        const intel = await gatherRealtimeIntelligence(searchClass);
        if (intel.feedLoadFailed) {
          const feedFailMsg = buildNewsFeedErrorMessage(searchClass.isBengali, intel.feedError);
          sendEvent({ delta: feedFailMsg });
          sendEvent({ done: true, isCloudAI: false, usedRealtimeSearch: false, sources: [] });
          return res.end();
        }
        if (intel.noMatchingNews) {
          const noMatchMsg = buildNoMatchingNewsMessage(
            searchClass.isBengali,
            intel.matchedTopic || searchClass.searchQuery
          );
          sendEvent({ delta: noMatchMsg });
          sendEvent({ done: true, isCloudAI: false, usedRealtimeSearch: false, sources: [] });
          return res.end();
        }
        feedSources = intel.feedSources;
        systemInstruction += intel.systemAugmentation;
        enableGoogleSearchTool = !intel.strictRssOnly;
      }
    }

    const clientAi = createGeminiClient(effectiveGeminiKey);
    const contents = formatGeminiHistory(messages, latestUserMsg || 'Hello');
    const modelCandidates = isVoiceMode ? GEMINI_MODELS.textFallbacks : GEMINI_MODELS.chatFallbacks;

    let lastErr: any = null;
    for (let i = 0; i < modelCandidates.length; i++) {
      const modelId = modelCandidates[i];
      const hasMore = i < modelCandidates.length - 1;
      const maxRetriesForModel = i === 0 ? HIGH_DEMAND_RETRY_DELAYS_MS.length : 0;

      for (let attempt = 0; attempt <= maxRetriesForModel; attempt++) {
        if (clientClosed) return res.end();

        let timeoutHandle: NodeJS.Timeout | null = null;
        const timeoutController = new AbortController();
        activeAbortController = timeoutController;
        const idleTimeoutMs = searchClass.needsSearch ? 22000 : 14000;
        const resetTimeout = () => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          timeoutHandle = setTimeout(() => timeoutController.abort(), idleTimeoutMs);
        };

        let streamedAny = false;
        const groundingSources: SearchSourceItem[] = [];
        try {
          resetTimeout();
          const config = buildConfigForModel(modelId, systemInstruction, enableGoogleSearchTool);
          const stream = await clientAi.models.generateContentStream({
            model: modelId,
            contents,
            config: {
              ...config,
              abortSignal: timeoutController.signal
            }
          });

          for await (const chunk of stream) {
            if (clientClosed) break;
            resetTimeout();
            const delta = chunk?.text || '';
            if (delta) {
              streamedAny = true;
              sendEvent({ delta });
            }
            if (enableGoogleSearchTool) {
              const chunkSources = extractGroundingSourcesFromResponse(chunk);
              if (chunkSources.length > 0) {
                groundingSources.push(...chunkSources);
              }
            }
          }

          if (timeoutHandle) clearTimeout(timeoutHandle);

          if (clientClosed) return res.end();

          if (streamedAny) {
            const sources = isVoiceMode && searchClass.needsSearch
              ? enableGoogleSearchTool
                ? mergeSearchSources(groundingSources, feedSources)
                : feedSources.slice(0, MAX_NEWS_RSS_RESULTS)
              : [];
            sendEvent({
              done: true,
              isCloudAI: true,
              usedRealtimeSearch: searchClass.needsSearch,
              sources
            });
            return res.end();
          }
          lastErr = new Error('Gemini returned an empty response. Please try again.');
          break;
        } catch (err: any) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          lastErr = err;
          if (clientClosed) return res.end();

          const raw = err?.message || '';
          const status = err?.status;

          if (streamedAny || isFatalAuthError(raw, status)) {
            const mapped = mapGeminiError(lastErr);
            sendEvent({ error: mapped.message, status: mapped.status });
            return res.end();
          }

          // Unsupported/not-found model: immediately advance to next fallback model without retry wait
          if (isModelUnavailableError(raw, status)) {
            break;
          }

          // 503 / 429 / "high demand": retry primary model automatically (2s, then 4s) before falling back
          if (attempt < maxRetriesForModel && isTransientHighDemandError(raw, status)) {
            const keptAlive = await sleepWithCancel(HIGH_DEMAND_RETRY_DELAYS_MS[attempt], () => clientClosed);
            if (!keptAlive) return res.end();
            continue;
          }

          // Move on to next fallback model if available
          if (hasMore && (isTransientHighDemandError(raw, status) || /abort|timeout/i.test(raw))) {
            break;
          }

          const mapped = mapGeminiError(lastErr);
          sendEvent({ error: mapped.message, status: mapped.status });
          return res.end();
        }
      }
    }

    const mapped = mapGeminiError(lastErr);
    sendEvent({ error: mapped.message, status: mapped.status });
    return res.end();
  } catch (err: any) {
    const mapped = mapGeminiError(err);
    sendEvent({ error: mapped.message, status: mapped.status });
    return res.end();
  }
});

// Endpoint: Standard Unary Chat / Voice AI Response (Gemini Only)
app.post('/api/chat', async (req, res) => {
  try {
    const {
      messages,
      personality = 'Normal',
      voiceIdentity = 'male',
      customPersonalityPrompt = '',
      customGeminiKey = '',
      isVoiceMode = false,
      memories = [],
      memoryEnabled = true,
      assistantNickname = 'Zuzu',
      userNickname = 'Friend',
      gfIntensity = 'sweet'
    } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const latestUserMsg = [...messages].reverse().find((m: any) => m.sender === 'user')?.text || '';
    const effectiveGeminiKey = getEffectiveGeminiKey(customGeminiKey);
    const searchClass = classifyRealtimeSearchIntent(latestUserMsg, messages);

    if (!effectiveGeminiKey) {
      if (searchClass.needsSearch) {
        const missingSearchNotice = searchClass.isBengali
          ? 'লাইভ গুগল ইন্টারনেট সার্চ এবং সর্বশেষ খবর দেখার জন্য Google Gemini API Key প্রয়োজন। অনুগ্রহ করে Settings → Gemini API & Connection-এ আপনার Gemini API Key যুক্ত করুন। আমি ভুয়া বা অনুমাননির্ভর রিয়েল-টাইম তথ্য দিই না।'
          : 'Live Google Internet Search requires a configured Google Gemini API key. Please add your Gemini API key in Settings → Gemini API & Connection to search live websites and breaking news. I cannot fabricate real-time web results offline.';
        return res.json({
          reply: missingSearchNotice,
          isCloudAI: false,
          requiresKey: true,
          hasGeminiKey: false,
          usedRealtimeSearch: false,
          sources: []
        });
      }

      const answer = generateIntelligentAnswer({
        userQuestion: latestUserMsg,
        conversationHistory: messages,
        personality,
        voiceIdentity,
        customPersonalityPrompt,
        isVoiceMode,
        memories,
        memoryEnabled
      });

      return res.json({
        reply: answer,
        isCloudAI: false,
        requiresKey: true,
        hasGeminiKey: false
      });
    }

    let systemInstruction = buildZuzuSystemInstruction({
      personality,
      voiceIdentity,
      customPersonalityPrompt,
      isVoiceMode,
      memories,
      memoryEnabled,
      assistantNickname,
      userNickname,
      gfIntensity
    });

    let feedSources: SearchSourceItem[] = [];
    let enableGoogleSearchTool = false;
    if (searchClass.needsSearch) {
      const intel = await gatherRealtimeIntelligence(searchClass);
      if (intel.feedLoadFailed) {
        return res.json({
          reply: buildNewsFeedErrorMessage(searchClass.isBengali, intel.feedError),
          isCloudAI: false,
          usedRealtimeSearch: false,
          sources: []
        });
      }
      if (intel.noMatchingNews) {
        return res.json({
          reply: buildNoMatchingNewsMessage(
            searchClass.isBengali,
            intel.matchedTopic || searchClass.searchQuery
          ),
          isCloudAI: false,
          usedRealtimeSearch: false,
          sources: []
        });
      }
      feedSources = intel.feedSources;
      systemInstruction += intel.systemAugmentation;
      enableGoogleSearchTool = !intel.strictRssOnly;
    }

    const clientAi = createGeminiClient(effectiveGeminiKey);
    const contents = formatGeminiHistory(messages, latestUserMsg || 'Hello');
    const modelCandidates = isVoiceMode ? GEMINI_MODELS.textFallbacks : GEMINI_MODELS.chatFallbacks;

    try {
      const { response } = await generateWithGeminiResilience(clientAi, {
        contents,
        systemInstruction,
        enableGoogleSearch: enableGoogleSearchTool,
        modelCandidates,
        timeoutMs: searchClass.needsSearch ? 22000 : 16000
      });

      const replyText = response?.text?.trim();
      const groundingSources =
        isVoiceMode && searchClass.needsSearch && enableGoogleSearchTool
          ? extractGroundingSourcesFromResponse(response)
          : [];
      const sources = isVoiceMode && searchClass.needsSearch
        ? enableGoogleSearchTool
          ? mergeSearchSources(groundingSources, feedSources)
          : feedSources.slice(0, MAX_NEWS_RSS_RESULTS)
        : [];

      if (replyText && replyText.length > 0) {
        return res.json({
          reply: replyText,
          isCloudAI: true,
          provider: 'google_gemini',
          usedRealtimeSearch: searchClass.needsSearch,
          sources
        });
      }

      return res.status(502).json({
        success: false,
        error: 'Gemini returned an empty response. Please try rephrasing your question.',
        isCloudAI: false,
        provider: 'google_gemini'
      });
    } catch (geminiError: any) {
      const mapped = mapGeminiError(geminiError);
      console.warn('[Zuzu AI] Gemini chat error:', sanitizeErrorMessage(geminiError?.message || ''));
      return res.status(mapped.status).json({
        success: false,
        error: mapped.message,
        isCloudAI: false,
        provider: 'google_gemini'
      });
    }
  } catch (error: any) {
    console.error('Chat API Error:', sanitizeErrorMessage(error?.message || ''));
    return res.status(500).json({
      success: false,
      error: 'Chat service error.',
      isCloudAI: false
    });
  }
});

// Endpoint: Audio Transcription Fallback (solves Android SpeechRecognizer Error 12 / missing Bangla packs)
app.post('/api/transcribe', async (req, res) => {
  try {
    const {
      audioBase64,
      mimeType = 'audio/webm',
      language = 'auto',
      customGeminiKey = ''
    } = req.body;

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Audio data is required.' });
    }

    const effectiveKey = getEffectiveGeminiKey(customGeminiKey);
    if (!effectiveKey) {
      return res.status(401).json({
        success: false,
        requiresKey: true,
        error: 'Gemini API key is required for cloud speech transcription.'
      });
    }

    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9.+_-]+;base64,/, '').trim();
    const langHint =
      language === 'bn-BD'
        ? 'The speaker is speaking Bengali (বাংলা) or mixed Bengali-English. Transcribe accurately in Bengali script where spoken in Bengali.'
        : language === 'en-US'
        ? 'The speaker is speaking English. Transcribe accurately in English.'
        : 'Auto-detect Bengali (বাংলা) or English and transcribe accurately in the spoken language.';

    const clientAi = createGeminiClient(effectiveKey);
    let lastErr: any = null;

    for (const modelId of GEMINI_MODELS.transcribeFallbacks) {
      let timeoutHandle: NodeJS.Timeout | null = null;
      try {
        const config = buildConfigForModel(
          modelId,
          `You are a precise speech-to-text transcriber. ${langHint} Return ONLY the exact spoken transcript text with zero commentary, quotes, or filler. If silence or unintelligible noise only, return an empty string.`
        );
        const response = await Promise.race([
          clientAi.models.generateContent({
            model: modelId,
            contents: [
              {
                role: 'user',
                parts: [
                  { inlineData: { data: cleanBase64, mimeType } },
                  { text: 'Transcribe this voice recording verbatim.' }
                ]
              }
            ],
            ...(Object.keys(config).length > 0 ? { config } : {})
          }),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('Transcription timed out.')), 14000);
          })
        ]);

        if (timeoutHandle) clearTimeout(timeoutHandle);
        const transcript = (response?.text || '').trim();
        return res.json({ success: true, text: transcript, model: modelId });
      } catch (err: any) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        lastErr = err;
        const msg = err?.message || '';
        if (/404|NOT_FOUND|not found|not supported|503|UNAVAILABLE|timeout/i.test(msg)) {
          continue;
        }
        break;
      }
    }

    const mapped = mapGeminiError(lastErr);
    return res.status(mapped.status).json({ success: false, error: mapped.message });
  } catch (err: any) {
    const mapped = mapGeminiError(err);
    return res.status(mapped.status).json({ success: false, error: mapped.message });
  }
});

// Endpoint: Real Image Generation
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, aspectRatio = '1:1', customGeminiKey } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'A text prompt is required to generate an image.' });
    }

    const effectiveKey = getEffectiveGeminiKey(customGeminiKey);
    if (!effectiveKey) {
      return res.status(401).json({
        success: false,
        error: 'Google Gemini API key required. Please configure your key in Settings > Zuzu AI.',
        requiresKey: true
      });
    }

    const clientAi = createGeminiClient(effectiveKey);
    const validAspectRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
    const selectedRatio = validAspectRatios.includes(aspectRatio) ? aspectRatio : '1:1';

    let timeoutHandle: NodeJS.Timeout | null = null;
    const response = await Promise.race([
      clientAi.models.generateContent({
        model: GEMINI_MODELS.imagePrimary,
        contents: { parts: [{ text: prompt.trim() }] },
        config: { imageConfig: { aspectRatio: selectedRatio } }
      }),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Image generation timed out after 25s.')), 25000);
      })
    ]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    let generatedImageUrl: string | null = null;
    let descriptionText = '';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        generatedImageUrl = `data:${mime};base64,${part.inlineData.data}`;
        break;
      } else if (part.text) {
        descriptionText += part.text;
      }
    }

    if (!generatedImageUrl) {
      return res.status(502).json({
        success: false,
        error: descriptionText || 'Model completed request without generating image data. Please refine your prompt.'
      });
    }

    return res.json({
      success: true,
      imageUrl: generatedImageUrl,
      prompt: prompt.trim(),
      aspectRatio: selectedRatio
    });
  } catch (error: any) {
    const mapped = mapGeminiError(error);
    console.error('[Zuzu AI Image Generator Error]:', sanitizeErrorMessage(error?.message || ''));
    return res.status(mapped.status).json({
      success: false,
      error: mapped.message
    });
  }
});

// Endpoint: AI Image Captioning
app.post('/api/generate-caption', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', customGeminiKey } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Image base64 data required.' });
    }

    const effectiveKey = getEffectiveGeminiKey(customGeminiKey);
    if (!effectiveKey) {
      return res.json({
        caption: 'Memories captured in time ✨ Living each moment to the fullest! #Life #Moments',
        isDefault: true
      });
    }

    const clientAi = createGeminiClient(effectiveKey);
    const { response } = await generateWithGeminiResilience(clientAi, {
      contents: {
        parts: [
          {
            inlineData: {
              data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
              mimeType
            }
          },
          {
            text: 'Write a catchy, warm, human-like social media caption for this photo. Include 2-3 suitable hashtags. Keep it engaging and concise.'
          }
        ]
      },
      timeoutMs: 14000
    });

    const caption = response.text?.trim() || 'Cherishing beautiful moments! ✨ #Moments #Life';
    return res.json({ caption, isDefault: false });
  } catch (err: any) {
    console.warn('[Caption Gen Fallback]:', sanitizeErrorMessage(err?.message || ''));
    return res.json({
      caption: 'Capturing unforgettable memories ✨ #Moments #Life #Memories',
      isDefault: true
    });
  }
});

// Endpoint: Multimodal Screen Reading & Analysis
app.post('/api/analyze-screen', async (req, res) => {
  try {
    const { imageBase64, query, language = 'en-US' } = req.body;
    const effectiveGeminiKey = getEffectiveGeminiKey(req.headers['x-custom-gemini-key'] as string);

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Valid screen imageBase64 is required.' });
    }

    const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const userPrompt = query || (language === 'bn-BD'
      ? 'এই স্ক্রিনের দিকে তাকিয়ে বলুন কি দেখা যাচ্ছে, গুরুত্বপূর্ণ টেক্সট এবং ব্যবহারকারীকে কি পরামর্শ দিবেন।'
      : 'Analyze this full device screen. Read and summarize the on-screen contents, key buttons, and provide helpful guidance.');

    if (effectiveGeminiKey) {
      try {
        const client = createGeminiClient(effectiveGeminiKey);
        const systemPrompt = `You are Zuzu AI, an Android assistant with real-time Multimodal Screen Reading.
Analyze the user's screen screenshot and provide a clear, warm explanation of:
1. What app or content is visible.
2. Key text, buttons, and important details.
3. Helpful next steps.
Respond in ${language === 'bn-BD' ? 'warm natural Bengali' : 'warm conversational English'}.`;

        const { response } = await generateWithGeminiResilience(client, {
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                { text: `${systemPrompt}\n\nUser Question: ${userPrompt}` }
              ]
            }
          ],
          timeoutMs: 15000
        });

        const analysisText = response.text || 'Screen analysis complete.';
        return res.json({
          analysis: analysisText,
          success: true
        });
      } catch (geminiErr: any) {
        console.warn('[Zuzu AI] Screen analysis error:', sanitizeErrorMessage(geminiErr?.message || ''));
      }
    }

    const fallbackAnalysis = language === 'bn-BD'
      ? `স্ক্রিন স্ক্যান করা হয়েছে। ডিসপ্লেতে অ্যাপ ইন্টারফেস এবং সক্রিয় কন্টেন্ট সনাক্ত হয়েছে। বিস্তারিত বিশ্লেষণের জন্য Settings থেকে Gemini API Key সংযুক্ত করুন।`
      : `Screen snapshot scanned. Configure your Google Gemini API key in Settings for live multimodal screen analysis.`;

    res.json({
      analysis: fallbackAnalysis,
      success: true
    });
  } catch (error: any) {
    console.error('Screen analysis error:', sanitizeErrorMessage(error?.message || ''));
    res.status(500).json({ error: 'Failed to analyze screen.' });
  }
});

// Endpoint: Unified Google Gemini Neural TTS (Replaces ElevenLabs)
app.post('/api/tts', async (req, res) => {
  try {
    const {
      text,
      voiceIdentity = 'male',
      voiceName,
      customGeminiKey,
      customApiKey
    } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text is required for TTS.' });
    }

    const effectiveKey = getEffectiveGeminiKey(customGeminiKey || customApiKey);
    const resolvedVoice = resolveVoiceName(voiceName, voiceIdentity === 'female' ? 'female' : 'male');

    if (!effectiveKey) {
      return res.json({
        fallback: true,
        reason: 'no_api_key',
        voiceName: resolvedVoice,
        message: 'Using device speech synthesis because no Gemini API key is configured.'
      });
    }

    const clientAi = createGeminiClient(effectiveKey);
    const spokenText = text.trim().slice(0, 1200);

    let lastErr: any = null;
    for (const ttsModel of GEMINI_MODELS.ttsFallbacks) {
      let timeoutHandle: NodeJS.Timeout | null = null;
      try {
        const ttsPromise = clientAi.models.generateContent({
          model: ttsModel,
          contents: [{ parts: [{ text: spokenText }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: resolvedVoice
                }
              }
            }
          }
        });

        const response = await Promise.race([
          ttsPromise,
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('Gemini TTS timed out after 12s.')), 12000);
          })
        ]);

        if (timeoutHandle) clearTimeout(timeoutHandle);

        const parts = response?.candidates?.[0]?.content?.parts || [];
        const audioPart = parts.find((p: any) => p?.inlineData?.data);
        if (audioPart?.inlineData?.data) {
          const rawBuf = Buffer.from(audioPart.inlineData.data, 'base64');
          const mimeType = String(audioPart.inlineData.mimeType || 'audio/wav').toLowerCase();
          const isRiffWav = rawBuf.length >= 4 && rawBuf.slice(0, 4).toString('ascii') === 'RIFF';

          if (mimeType.includes('wav') || isRiffWav) {
            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Cache-Control', 'public, max-age=1800');
            return res.send(rawBuf);
          }

          if (mimeType.includes('pcm') || mimeType.includes('l16')) {
            const wavBuf = wrapPcm16MonoAsWav(rawBuf, 24000);
            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Cache-Control', 'public, max-age=1800');
            return res.send(wavBuf);
          }

          res.setHeader('Content-Type', mimeType.startsWith('audio/') ? mimeType : 'audio/wav');
          res.setHeader('Cache-Control', 'public, max-age=1800');
          return res.send(rawBuf);
        }

        lastErr = new Error('Gemini TTS returned no audio data.');
      } catch (err: any) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        lastErr = err;
        const msg = err?.message || '';
        if (/404|NOT_FOUND|not found/i.test(msg)) {
          continue;
        }
        break;
      }
    }

    console.warn('[Zuzu TTS] Falling back to device speech:', sanitizeErrorMessage(lastErr?.message || ''));
    return res.json({
      fallback: true,
      reason: 'gemini_tts_unavailable',
      voiceName: resolvedVoice,
      message: 'Using device speech synthesis fallback.'
    });
  } catch (error: any) {
    console.warn('[Zuzu TTS] Exception:', sanitizeErrorMessage(error?.message || ''));
    return res.json({
      fallback: true,
      reason: 'exception',
      message: 'Using device speech synthesis fallback.'
    });
  }
});

// Setup Vite in Dev or Serve Static in Prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Zuzu AI Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
