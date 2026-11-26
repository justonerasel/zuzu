import { AppSettings, SearchSourceItem, UserMemory } from '../types';
import { generateIntelligentAnswer } from './aiEngine';
import { classifyRealtimeSearchIntent } from './searchIntent';
import { getAppSettings } from './storage';
import {
  MAX_NEWS_RSS_RESULTS,
  buildNewsFeedErrorMessage,
  buildNoMatchingNewsMessage,
  buildStrictNewsRssSystemInstruction
} from './newsRss';
import { fetchGoogleNewsRssClient } from './newsRssClient';
import { getNativeZuzuPlugin } from './permission';

/**
 * Centralized Google Gemini API client, streaming SSE pipeline, real-time search grounding,
 * timeout safety, and Android APK routing for Zuzu AI.
 */

// Current Application Build Version (Keep synchronized across Gradle, Server, UI & CI)
export const APP_VERSION = '3.8.0';
export const APP_VERSION_CODE = 380;

// Centralized free Gemini Model Configuration (never hardcoded in UI components; zero paid or deprecated models)
const GEMINI_CHAT_CANDIDATES = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen'
] as const;
const GEMINI_TEXT_CANDIDATES = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen'
] as const;
const GEMINI_TTS_CANDIDATES = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'] as const;
const GEMINI_TRANSCRIBE_CANDIDATES = ['gemini-3.5-transcribe', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
const GEMINI_IMAGE_CANDIDATES = ['gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1'] as const;
const HIGH_DEMAND_RETRY_DELAYS_MS = [2000, 4000] as const;

function isRetryableHighDemand(rawMsg: string, status?: number): boolean {
  if (status === 503 || status === 429) return true;
  return /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|Service Unavailable|quota|rate limit/i.test(rawMsg);
}

function isModelMissingError(rawMsg: string, status?: number): boolean {
  if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(rawMsg)) return false;
  if (status === 404) return true;
  return /404|NOT_FOUND|not found|not supported|unknown model|invalid model|model.*not available|thinking/i.test(rawMsg);
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Request cancelled', 'AbortError'));
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Request cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// Deployed Cloud Run Production Backend URL for Android APK
export const DEFAULT_REMOTE_BACKEND_URL = 'https://ais-pre-requvmmuycwborvooarj55-817905745905.asia-east1.run.app';

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const customUrl = localStorage.getItem('zuzu_custom_server_url')?.trim();
  if (customUrl && customUrl.startsWith('http')) {
    return customUrl.replace(/\/+$/, '');
  }

  const cap = (window as any).Capacitor;
  const isCapacitor =
    Boolean(cap?.isNativePlatform?.()) ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'ionic:' ||
    (window.location.hostname === 'localhost' && window.location.port !== '3000' && window.location.port !== '5173');

  if (isCapacitor) {
    return DEFAULT_REMOTE_BACKEND_URL;
  }

  return '';
}

function sanitizeErrorText(raw: string): string {
  return String(raw || '')
    .replace(/AIza[0-9A-Za-z-_]{20,}/g, '[REDACTED_KEY]')
    .replace(/key=[^&\s]+/gi, 'key=[REDACTED]');
}

/**
 * Fetch wrapper enforcing strict AbortController timeouts and optional caller cancellation.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000,
  externalSignal?: AbortSignal
): Promise<Response> {
  if (externalSignal?.aborted) {
    throw new DOMException('Request cancelled', 'AbortError');
  }

  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      if (timedOut) {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Please check your internet connection.`);
      }
      throw err;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs = 15000,
  externalSignal?: AbortSignal
): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = baseUrl ? `${baseUrl}${cleanEndpoint}` : cleanEndpoint;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  return fetchWithTimeout(
    fullUrl,
    {
      ...options,
      headers
    },
    timeoutMs,
    externalSignal
  );
}

export function formatGeminiFriendlyError(rawMessage: string, status?: number): string {
  let msg = sanitizeErrorText(rawMessage || '');
  if (msg.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(msg);
      const inner = parsed?.error?.message || parsed?.message;
      if (typeof inner === 'string') msg = sanitizeErrorText(inner);
    } catch {}
  }
  if (/API_KEY_INVALID|API key not valid/i.test(msg) || status === 401) {
    return 'Invalid Gemini API Key. Please double-check your key in Settings > Zuzu AI.';
  }
  if (/RESOURCE_EXHAUSTED|quota/i.test(msg) || status === 429) {
    return 'Gemini API quota exceeded (429). Please wait a moment or check Google AI Studio limits.';
  }
  if (/PERMISSION_DENIED/i.test(msg) || status === 403) {
    return 'Gemini API access denied (403). Enable the Generative Language API for this key.';
  }
  if (/503|UNAVAILABLE|high demand|overloaded|Service Unavailable/i.test(msg) || status === 503) {
    return 'Google Gemini is experiencing temporary high demand. Please try again in a moment.';
  }
  if (/Failed to fetch|NetworkError|timed out|timeout|ENOTFOUND/i.test(msg)) {
    return 'Network timeout or offline: Unable to reach Google Gemini servers.';
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
    // Perform real lightweight generation check first, falling back across free Flash/Flash-Lite models or /models list
    const testModel = GEMINI_TEXT_CANDIDATES[GEMINI_TEXT_CANDIDATES.length - 1];
    const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent?key=${encodeURIComponent(trimmed)}`;
    const genBody: any = {
      contents: [{ role: 'user', parts: [{ text: 'OK' }] }]
    };
    if (testModel.startsWith('gemini-4')) {
      genBody.generationConfig = { thinkingConfig: { thinkingLevel: 'LOW' } };
    }
    const genRes = await fetchWithTimeout(
      genUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genBody)
      },
      10000
    );

    const latencyMs = Date.now() - startTime;
    if (genRes.ok) {
      return {
        success: true,
        latencyMs,
        message: `Connected (${latencyMs}ms)`
      };
    }

    const genErr = await genRes.json().catch(() => ({}));
    const rawMsg = genErr?.error?.message || '';

    // Auth/Quota failures must fail immediately — never mask invalid keys
    if (
      genRes.status === 400 ||
      genRes.status === 401 ||
      genRes.status === 403 ||
      genRes.status === 429 ||
      /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(rawMsg)
    ) {
      // Only retry /models if 400 wasn't API_KEY_INVALID
      if (!/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(rawMsg) && genRes.status !== 401 && genRes.status !== 403 && genRes.status !== 429) {
        const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}`;
        const modelsRes = await fetchWithTimeout(modelsUrl, { method: 'GET' }, 8000);
        if (modelsRes.ok) {
          const totalMs = Date.now() - startTime;
          return { success: true, latencyMs: totalMs, message: `Connected (${totalMs}ms)` };
        }
      }
      return { success: false, message: formatGeminiFriendlyError(rawMsg || `HTTP ${genRes.status}`, genRes.status) };
    }

    // Fallback models list verification for non-auth 404/transient
    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}`;
    const modelsRes = await fetchWithTimeout(modelsUrl, { method: 'GET' }, 8000);
    if (modelsRes.ok) {
      const totalMs = Date.now() - startTime;
      return { success: true, latencyMs: totalMs, message: `Connected (${totalMs}ms)` };
    }

    return {
      success: false,
      message: formatGeminiFriendlyError(rawMsg || `Google API error ${modelsRes.status}`, modelsRes.status)
    };
  } catch (netErr: any) {
    return {
      success: false,
      message: formatGeminiFriendlyError(netErr?.message || 'Network unreachable')
    };
  }
}

export async function validateGeminiApiKey(apiKey: string): Promise<{
  success: boolean;
  latencyMs?: number;
  message: string;
  error?: string;
}> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { success: false, message: 'Gemini API key is required.' };
  }

  // Try backend test endpoint first (keeps proxy parity on Cloud Run)
  try {
    const res = await apiFetch(
      '/api/test-provider',
      {
        method: 'POST',
        body: JSON.stringify({ apiKey: trimmed, customGeminiKey: trimmed })
      },
      10000
    );

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success) {
        return {
          success: true,
          latencyMs: data.latencyMs,
          message: data.message || `Connected (${data.latencyMs || 120}ms)`
        };
      }
      if (data?.error && res.status >= 400 && res.status < 500) {
        return {
          success: false,
          message: formatGeminiFriendlyError(String(data.error), res.status)
        };
      }
    }
  } catch {
    // Backend unreachable; fall through to direct Google Gemini validation
  }

  return validateGeminiKeyDirectly(trimmed);
}

function buildSystemInstruction(
  settings: AppSettings,
  memories: UserMemory[],
  isVoiceMode: boolean
): string {
  const identityName = settings.activeIdentity === 'female' ? 'Female Zuzu' : 'Male Zuzu';
  const pronoun = settings.activeIdentity === 'female' ? 'female companion & assistant' : 'male companion & assistant';
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

  let sys = `You are ${identityName} (${assistantNick}), a natural, intelligent, emotionally perceptive AI companion running on Android.
Voice persona: ${pronoun}. User's name: ${userNick}.
Today's Date & Current Time: ${liveClock} (UTC: ${now.toISOString()}).

CREATOR KNOWLEDGE:
- Your creator and lead developer is Rasel (MD. Rasel Hossen), a Computer Science student and full-stack Android & AI developer from Bangladesh (GitHub & TikTok: @justonerasel).
- Mention this warmly and proudly only when asked who built/created/developed you or who Rasel is.

CONVERSATION PRINCIPLES:
- Reply in the same language as the user. Be short and direct. Answer only what was asked. If the user asks several questions, answer each in 1-2 lines. Give long or detailed answers only when the user asks for details.
- Speak naturally, warmly, and empathetically like an attentive human partner.
- Answer directly without parroting or repeating back the user's question.
- Never repeat repetitive stock fillers or canned catchphrases across turns.
- Active Personality: ${settings.activePersonality}. ${settings.customPersonalityPrompt || ''}`;

  if (isVoiceMode) {
    sys += `\nVoice Mode: Keep spoken responses crisp, natural dialog, and free of markdown asterisks, raw tables, or code fences.`;
  } else {
    sys += `\n\nCHAT FOCUS & ACCURACY RULES:
- Answer the user's actual question first and directly. Stay on the topic of the user's last message and the earlier conversation. Never switch to an unrelated topic, and never bring up news or sports unless asked. If the question is unclear, ask one short clarifying question. Use the previous messages for context. Be accurate. If you do not know, say so.
- Text Formatting: Use clean Markdown headings, bullet lists, numbered steps, and fenced code blocks where helpful. Use Markdown tables for comparisons, calculations, and plans. Do NOT include URLs or a list of source links unless the user explicitly asks for links.`;
  }

  if (settings.memoryEnabled && memories.length > 0) {
    const memLines = memories.filter(m => m.key && m.value).map(m => `- ${m.key}: ${m.value}`).join('\n');
    if (memLines) {
      sys += `\nUser Memories:\n${memLines}`;
    }
  }

  return sys;
}

function formatMessagesForGeminiRest(
  messages: Array<{ sender: 'user' | 'assistant' | 'model'; text: string }>
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  // Cap conversation context at the last 10 messages for speed
  const recentMessages = messages
    .filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
    .slice(-10);
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const msg of recentMessages) {
    const text = (msg?.text || '').trim();
    if (!text) continue;
    const role: 'user' | 'model' = msg.sender === 'assistant' || msg.sender === 'model' ? 'model' : 'user';
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += `\n${text}`;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  while (contents.length > 1 && contents[0].role !== 'user') {
    contents.shift();
  }
  if (contents.length > 0 && contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
  }
  return contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: 'Hello' }] }];
}

function extractSourcesFromRestCandidate(parsed: any): SearchSourceItem[] {
  const chunks = parsed?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const out: SearchSourceItem[] = [];
  for (const ch of chunks) {
    const uri = ch?.web?.uri;
    const rawTitle = ch?.web?.title;
    if (typeof uri === 'string' && /^https?:\/\//i.test(uri)) {
      let host = 'Web Source';
      try {
        host = new URL(uri).hostname.replace(/^www\./, '');
      } catch {}
      const cleanTitle = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : host;
      let sourceName = host;
      if (
        host.includes('vertexaisearch.cloud.google.com') ||
        host === 'google.com' ||
        host === 'news.google.com'
      ) {
        const dashParts = cleanTitle.split(/\s+[-|—]\s+/);
        sourceName =
          dashParts.length > 1
            ? dashParts[dashParts.length - 1].trim().slice(0, 48)
            : cleanTitle.replace(/^www\./, '').slice(0, 48);
      }
      out.push({
        title: cleanTitle,
        url: uri,
        sourceName
      });
    }
  }
  return out;
}

function dedupeSources(sources: SearchSourceItem[]): SearchSourceItem[] {
  const seen = new Set<string>();
  const out: SearchSourceItem[] = [];
  for (const s of sources) {
    if (!s?.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Direct Multi-Turn Gemini REST SSE Streaming call (critical for standalone Android APK & fast progressive UI)
 */
async function directGeminiStreamContent(params: {
  apiKey: string;
  messages: Array<{ sender: 'user' | 'assistant' | 'model'; text: string }>;
  systemInstruction: string;
  enableGoogleSearch?: boolean;
  strictNewsItems?: SearchSourceItem[];
  isBengali?: boolean;
  isVoiceMode?: boolean;
  asksAboutSports?: boolean;
  signal?: AbortSignal;
  onDelta?: (accumulatedText: string, delta: string) => void;
}): Promise<{ text: string; isCloudAI: boolean; sources?: SearchSourceItem[] }> {
  const cleanKey = params.apiKey.trim();
  const contents = formatMessagesForGeminiRest(params.messages);
  let lastErrorMsg = 'Google Gemini request failed.';

  const hasStrictNews = Array.isArray(params.strictNewsItems) && params.strictNewsItems.length > 0;
  const strictTop8 = hasStrictNews ? params.strictNewsItems!.slice(0, MAX_NEWS_RSS_RESULTS) : [];
  const enableSearchTool = Boolean(params.enableGoogleSearch && !hasStrictNews);

  let sysInst = params.systemInstruction;
  if (hasStrictNews) {
    sysInst += buildStrictNewsRssSystemInstruction(
      strictTop8,
      Boolean(params.isBengali),
      Boolean(params.asksAboutSports)
    );
  } else if (enableSearchTool) {
    sysInst += `\n\nREAL-TIME GOOGLE SEARCH GROUNDING ENABLED:\n- Use verified live Google Search results (supporting both English and Bengali queries) to answer the user's exact question accurately.\n- Mention source names naturally in the text when relevant, without outputting URLs or link lists.\n- Never fabricate publication timestamps, headlines, or URLs.`;
  }

  const modelCandidates = params.isVoiceMode ? GEMINI_TEXT_CANDIDATES : GEMINI_CHAT_CANDIDATES;

  for (let i = 0; i < modelCandidates.length; i++) {
    const modelId = modelCandidates[i];
    const hasMore = i < modelCandidates.length - 1;
    const maxRetriesForModel = i === 0 ? HIGH_DEMAND_RETRY_DELAYS_MS.length : 0;

    for (let attempt = 0; attempt <= maxRetriesForModel; attempt++) {
      if (params.signal?.aborted) {
        throw new DOMException('Request cancelled', 'AbortError');
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cleanKey)}`;
      const body: any = {
        contents,
        systemInstruction: { parts: [{ text: sysInst }] }
      };
      if (enableSearchTool) {
        body.tools = [{ googleSearch: {} }];
      }
      if (modelId.startsWith('gemini-4')) {
        body.generationConfig = {
          thinkingConfig: { thinkingLevel: 'LOW' }
        };
      }

      let res: Response;
      try {
        res = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          },
          params.enableGoogleSearch ? 22000 : 14000,
          params.signal
        );
      } catch (netErr: any) {
        if (netErr?.name === 'AbortError' && params.signal?.aborted) {
          throw netErr;
        }
        lastErrorMsg = formatGeminiFriendlyError(netErr?.message || 'Network timeout reaching Google Gemini');
        if (attempt < maxRetriesForModel) {
          await sleepWithAbort(HIGH_DEMAND_RETRY_DELAYS_MS[attempt], params.signal);
          continue;
        }
        if (hasMore) break;
        throw new Error(lastErrorMsg);
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const rawMsg = errJson?.error?.message || `Google Gemini API error (${res.status})`;
        lastErrorMsg = formatGeminiFriendlyError(rawMsg, res.status);

        if (isModelMissingError(rawMsg, res.status)) {
          break;
        }
        if (attempt < maxRetriesForModel && isRetryableHighDemand(rawMsg, res.status)) {
          await sleepWithAbort(HIGH_DEMAND_RETRY_DELAYS_MS[attempt], params.signal);
          continue;
        }
        if (hasMore && isRetryableHighDemand(rawMsg, res.status)) {
          break;
        }
        throw new Error(lastErrorMsg);
      }

      const collectedSources: SearchSourceItem[] = [];
      const reader = res.body?.getReader();
      if (!reader) {
        const jsonText = await res.text();
        let assembled = '';
        for (const line of jsonText.split('\n')) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data:')) continue;
          const jsonPart = trimmedLine.slice(5).trim();
          if (!jsonPart || jsonPart === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonPart);
            const chunkText = (parsed?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('');
            if (chunkText) {
              assembled += chunkText;
              params.onDelta?.(assembled, chunkText);
            }
            collectedSources.push(...extractSourcesFromRestCandidate(parsed));
          } catch {}
        }
        if (assembled.trim()) {
          return {
            text: assembled.trim(),
            isCloudAI: true,
            sources: hasStrictNews ? strictTop8 : dedupeSources(collectedSources)
          };
        }
        lastErrorMsg = 'Gemini returned an empty response. Please try again.';
        break;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data:')) continue;
          const payload = trimmedLine.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            const chunkText = (parsed?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('');
            if (chunkText) {
              accumulated += chunkText;
              params.onDelta?.(accumulated, chunkText);
            }
            if (enableSearchTool) {
              collectedSources.push(...extractSourcesFromRestCandidate(parsed));
            }
          } catch {}
        }
      }

      if (accumulated.trim()) {
        return {
          text: accumulated.trim(),
          isCloudAI: true,
          sources: hasStrictNews ? strictTop8 : dedupeSources(collectedSources)
        };
      }
      lastErrorMsg = 'Gemini returned an empty response. Please try again.';
      break;
    }
  }

  throw new Error(lastErrorMsg);
}

/**
 * Direct Gemini Vision REST call for Screen Assistant & Photo Captioning in standalone APK
 */
export async function directGeminiVisionAnalyze(
  apiKey: string,
  imageBase64: string,
  prompt: string,
  mimeType = 'image/jpeg'
): Promise<{ text: string }> {
  const cleanKey = apiKey.trim();
  const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

  let lastErr = 'Gemini vision analysis failed.';
  for (const modelId of GEMINI_TEXT_CANDIDATES) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(cleanKey)}`;
    const body: any = {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt }
          ]
        }
      ]
    };
    if (modelId.startsWith('gemini-4')) {
      body.generationConfig = { thinkingConfig: { thinkingLevel: 'LOW' } };
    }

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      15000
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const rawMsg = errJson?.error?.message || `Google Gemini API error (${res.status})`;
      lastErr = formatGeminiFriendlyError(rawMsg, res.status);
      if (
        res.status === 404 ||
        res.status === 503 ||
        /NOT_FOUND|not found|thinking|UNAVAILABLE|high demand|overloaded/i.test(rawMsg)
      ) {
        continue;
      }
      throw new Error(lastErr);
    }

    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('').trim();
    if (text) {
      return { text };
    }
  }
  throw new Error(lastErr);
}

/**
 * Direct Gemini Image Generation REST call (for standalone Android APK)
 */
export async function directGeminiGenerateImage(
  apiKey: string,
  prompt: string,
  aspectRatio = '1:1'
): Promise<{ imageUrl: string }> {
  const cleanKey = apiKey.trim();
  const validRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
  const selectedRatio = validRatios.includes(aspectRatio) ? aspectRatio : '1:1';
  let lastError = 'Image generation failed.';

  for (const modelId of GEMINI_IMAGE_CANDIDATES) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(cleanKey)}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt.trim() }] }],
          generationConfig: {
            imageConfig: { aspectRatio: selectedRatio }
          }
        })
      },
      25000
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const rawMsg = errJson?.error?.message || `Google Gemini Image API error (${res.status})`;
      lastError = formatGeminiFriendlyError(rawMsg, res.status);
      if (res.status === 404 || /NOT_FOUND|not found/i.test(rawMsg)) {
        continue;
      }
      throw new Error(lastError);
    }

    const data = await res.json();
    for (const part of data?.candidates?.[0]?.content?.parts || []) {
      if (part?.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        return { imageUrl: `data:${mime};base64,${part.inlineData.data}` };
      }
    }
    lastError = 'Model completed request without image data. Try refining your prompt.';
  }

  throw new Error(lastError);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function wrapPcm16MonoAsWavBytes(pcmBytes: Uint8Array, sampleRate = 24000): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcmBytes.length, true);

  const out = new Uint8Array(44 + pcmBytes.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcmBytes, 44);
  return out;
}

/**
 * Direct Gemini TTS REST call (used in standalone Android APK when backend proxy isn't available)
 */
export async function directGeminiSpeechGenerate(params: {
  apiKey: string;
  text: string;
  voiceName: string;
  signal?: AbortSignal;
}): Promise<Blob | null> {
  const cleanKey = params.apiKey.trim();
  if (!cleanKey || !params.text.trim()) return null;

  for (const ttsModel of GEMINI_TTS_CANDIDATES) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ttsModel)}:generateContent?key=${encodeURIComponent(cleanKey)}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: params.text.trim().slice(0, 1200) }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: params.voiceName
                }
              }
            }
          }
        })
      },
      12000,
      params.signal
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const rawMsg = errJson?.error?.message || '';
      if (res.status === 404 || /NOT_FOUND|not found/i.test(rawMsg)) {
        continue;
      }
      return null;
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p: any) => p?.inlineData?.data);
    if (!audioPart?.inlineData?.data) continue;

    const bytes = base64ToUint8Array(audioPart.inlineData.data);
    const mimeType = String(audioPart.inlineData.mimeType || 'audio/wav').toLowerCase();
    const isRiffWav =
      bytes.length >= 4 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46;

    if (mimeType.includes('wav') || isRiffWav) {
      return new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' });
    }
    if (mimeType.includes('pcm') || mimeType.includes('l16')) {
      const wavBytes = wrapPcm16MonoAsWavBytes(bytes, 24000);
      return new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
    }
    return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType.startsWith('audio/') ? mimeType : 'audio/wav' });
  }

  return null;
}

export interface UnifiedChatResult {
  reply: string;
  isCloudAI: boolean;
  isError?: boolean;
  requiresKey?: boolean;
  usedRealtimeSearch?: boolean;
  sources?: SearchSourceItem[];
}

/**
 * Low-latency Streaming Unified Gemini AI Pipeline for Text Chat & Voice Conversations.
 * Uses a single Google Gemini credential (`customGeminiApiKey`) and cancels cleanly via AbortSignal.
 */
export async function streamUnifiedAiChat(params: {
  messages: Array<{ sender: 'user' | 'assistant'; text: string; usedRealtimeSearch?: boolean }>;
  settings: AppSettings;
  memories: UserMemory[];
  isVoiceMode: boolean;
  signal?: AbortSignal;
  onDelta?: (accumulatedText: string, delta: string) => void;
}): Promise<UnifiedChatResult> {
  const latestStored = getAppSettings();
  const settings: AppSettings = {
    ...latestStored,
    ...params.settings,
    customGeminiApiKey: (params.settings.customGeminiApiKey || latestStored.customGeminiApiKey || '').trim()
  };

  const recentMessages = params.messages.slice(-10);
  const latestUserMsg = [...recentMessages].reverse().find(m => m.sender === 'user')?.text || '';
  const hasUserGeminiKey = settings.customGeminiApiKey.length > 0 && settings.geminiEnabled !== false;
  const searchClassification = classifyRealtimeSearchIntent(latestUserMsg, recentMessages);

  const nativePlugin = getNativeZuzuPlugin();
  const hasNativeHttpPlugin = Boolean(nativePlugin?.fetchUrlText);

  let prefetchedRssItems: SearchSourceItem[] | undefined;
  let prefetchedRssError: string | undefined;

  // Inside Android APK: fetch Google News RSS directly via Capacitor native HttpURLConnection (CORS-free, zero server)
  if (searchClassification.isNewsQuery && hasNativeHttpPlugin) {
    const rssRes = await fetchGoogleNewsRssClient(searchClassification);
    if (!rssRes.ok) {
      const failText = buildNewsFeedErrorMessage(
        searchClassification.isBengali,
        rssRes.error || 'Could not load feed'
      );
      params.onDelta?.(failText, failText);
      return {
        reply: failText,
        isCloudAI: false,
        usedRealtimeSearch: false,
        sources: []
      };
    }
    if (rssRes.noMatchingNews || rssRes.items.length === 0) {
      const noMatchText = buildNoMatchingNewsMessage(
        searchClassification.isBengali,
        rssRes.topicQuery || searchClassification.searchQuery
      );
      params.onDelta?.(noMatchText, noMatchText);
      return {
        reply: noMatchText,
        isCloudAI: false,
        usedRealtimeSearch: false,
        sources: []
      };
    }
    prefetchedRssItems = rssRes.items.slice(0, MAX_NEWS_RSS_RESULTS);

    // Standalone APK with local Gemini key: stream directly to Gemini with matching native RSS results (zero server needed!)
    if (hasUserGeminiKey) {
      const sysPrompt = buildSystemInstruction(settings, params.memories, params.isVoiceMode);
      try {
        const directRes = await directGeminiStreamContent({
          apiKey: settings.customGeminiApiKey,
          messages: recentMessages,
          systemInstruction: sysPrompt,
          strictNewsItems: prefetchedRssItems,
          isBengali: searchClassification.isBengali,
          isVoiceMode: params.isVoiceMode,
          asksAboutSports: searchClassification.asksAboutSports,
          signal: params.signal,
          onDelta: params.onDelta
        });
        return {
          reply: directRes.text,
          isCloudAI: true,
          usedRealtimeSearch: true,
          sources: []
        };
      } catch (directErr: any) {
        if (directErr?.name === 'AbortError' && params.signal?.aborted) {
          throw directErr;
        }
        return {
          reply: directErr?.message || 'Google Gemini request failed.',
          isCloudAI: false,
          isError: true
        };
      }
    }
  }

  // 1. Try Backend SSE Stream first (/api/chat/stream) — timeout allows full 2s+4s retries and model fallbacks
  let backendExplicitError: string | null = null;
  let backendExhaustedFullChain = false;
  try {
    const res = await apiFetch(
      '/api/chat/stream',
      {
        method: 'POST',
        body: JSON.stringify({
          messages: recentMessages,
          personality: settings.activePersonality,
          voiceIdentity: settings.activeIdentity,
          customPersonalityPrompt: settings.customPersonalityPrompt,
          customGeminiKey: hasUserGeminiKey ? settings.customGeminiApiKey : '',
          isVoiceMode: params.isVoiceMode,
          memories: params.memories,
          memoryEnabled: settings.memoryEnabled,
          assistantNickname: settings.assistantNickname || 'Zuzu',
          userNickname: settings.userNickname || 'Friend',
          gfIntensity: settings.gfIntensity || 'sweet',
          ...(prefetchedRssItems ? { prefetchedRssItems } : {}),
          ...(prefetchedRssError ? { prefetchedRssError } : {})
        })
      },
      searchClassification.needsSearch ? 50000 : 45000,
      params.signal
    );

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('text/event-stream') && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let doneMeta: {
        isCloudAI?: boolean;
        requiresKey?: boolean;
        usedRealtimeSearch?: boolean;
        sources?: SearchSourceItem[];
      } = {};

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          try {
            const payload = JSON.parse(trimmed.slice(5).trim());
            if (payload.error) {
              backendExplicitError = String(payload.error);
              backendExhaustedFullChain = true;
              break;
            }
            if (typeof payload.delta === 'string' && payload.delta.length > 0) {
              accumulated += payload.delta;
              params.onDelta?.(accumulated, payload.delta);
            }
            if (payload.done) {
              doneMeta = payload;
            }
          } catch {}
        }

        if (backendExplicitError) break;
      }

      if (!backendExplicitError && accumulated.trim().length > 0) {
        if (!hasUserGeminiKey || doneMeta.isCloudAI || !doneMeta.requiresKey) {
          return {
            reply: accumulated.trim(),
            isCloudAI: Boolean(doneMeta.isCloudAI),
            requiresKey: Boolean(doneMeta.requiresKey),
            usedRealtimeSearch: Boolean(doneMeta.usedRealtimeSearch),
            sources: params.isVoiceMode && Array.isArray(doneMeta.sources) ? doneMeta.sources : []
          };
        }
      }
    } else if (!res.ok) {
      const errData = await res.json().catch(() => null);
      if (errData?.error) {
        backendExplicitError = String(errData.error);
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && params.signal?.aborted) {
      throw err;
    }
    // Backend unreachable; fall through to direct Gemini REST stream (essential on standalone APK)
  }

  // If backend already ran the full retry & fallback chain with the same user key and still failed, return that error
  if (backendExhaustedFullChain && backendExplicitError) {
    return {
      reply: backendExplicitError,
      isCloudAI: false,
      isError: true
    };
  }

  // 2. Direct Gemini REST SSE Stream fallback (for standalone APK or unreachable backend)
  if (hasUserGeminiKey) {
    let strictNewsItems: SearchSourceItem[] | undefined = prefetchedRssItems;
    if (searchClassification.isNewsQuery && !strictNewsItems) {
      const rssFallback = await fetchGoogleNewsRssClient(searchClassification);
      if (!rssFallback.ok) {
        const failText = buildNewsFeedErrorMessage(
          searchClassification.isBengali,
          rssFallback.error || 'Could not load feed'
        );
        params.onDelta?.(failText, failText);
        return {
          reply: failText,
          isCloudAI: false,
          usedRealtimeSearch: false,
          sources: []
        };
      }
      if (rssFallback.noMatchingNews || rssFallback.items.length === 0) {
        const noMatchText = buildNoMatchingNewsMessage(
          searchClassification.isBengali,
          rssFallback.topicQuery || searchClassification.searchQuery
        );
        params.onDelta?.(noMatchText, noMatchText);
        return {
          reply: noMatchText,
          isCloudAI: false,
          usedRealtimeSearch: false,
          sources: []
        };
      }
      strictNewsItems = rssFallback.items.slice(0, MAX_NEWS_RSS_RESULTS);
    }

    const sysPrompt = buildSystemInstruction(settings, params.memories, params.isVoiceMode);
    try {
      const directRes = await directGeminiStreamContent({
        apiKey: settings.customGeminiApiKey,
        messages: recentMessages,
        systemInstruction: sysPrompt,
        enableGoogleSearch: searchClassification.needsSearch && !searchClassification.isNewsQuery,
        strictNewsItems,
        isBengali: searchClassification.isBengali,
        isVoiceMode: params.isVoiceMode,
        asksAboutSports: searchClassification.asksAboutSports,
        signal: params.signal,
        onDelta: params.onDelta
      });
      return {
        reply: directRes.text,
        isCloudAI: true,
        usedRealtimeSearch: searchClassification.needsSearch,
        sources: []
      };
    } catch (directErr: any) {
      if (directErr?.name === 'AbortError' && params.signal?.aborted) {
        throw directErr;
      }
      return {
        reply: directErr?.message || backendExplicitError || 'Google Gemini request failed.',
        isCloudAI: false,
        isError: true
      };
    }
  }

  if (backendExplicitError) {
    return {
      reply: backendExplicitError,
      isCloudAI: false,
      isError: true
    };
  }

  // 3. Offline / Unconfigured fallback when no API key exists
  if (searchClassification.needsSearch) {
    const honestNotice = searchClassification.isBengali
      ? 'লাইভ গুগল ইন্টারনেট সার্চ এখন চালানো যাচ্ছে না কারণ ডিভাইসে বা সার্ভারে কোনো Gemini API Key যুক্ত নেই অথবা ইন্টারনেট/সার্ভার সংযোগ পাওয়া যাচ্ছে না। অনুগ্রহ করে Settings → Gemini API & Connection থেকে আপনার Google Gemini API Key যুক্ত করুন।'
      : 'Live Google Internet Search is currently unavailable because no Google Gemini API key is configured (or the search service is unreachable). Please add your Gemini API key in Settings → Gemini API & Connection to search live websites and breaking news.';
    params.onDelta?.(honestNotice, honestNotice);
    return {
      reply: honestNotice,
      isCloudAI: false,
      requiresKey: !hasUserGeminiKey,
      usedRealtimeSearch: false,
      sources: []
    };
  }

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
  params.onDelta?.(localReply, localReply);

  return {
    reply: localReply,
    isCloudAI: false,
    requiresKey: !hasUserGeminiKey
  };
}

/**
 * Convenience non-streaming wrapper backed by the same unified Gemini stream pipeline.
 */
export async function sendUnifiedAiChat(params: {
  messages: Array<{ sender: 'user' | 'assistant'; text: string; usedRealtimeSearch?: boolean }>;
  settings: AppSettings;
  memories: UserMemory[];
  isVoiceMode: boolean;
  signal?: AbortSignal;
}): Promise<UnifiedChatResult> {
  return streamUnifiedAiChat(params);
}

/**
 * Transcribes recorded audio via backend /api/transcribe or direct Gemini REST API.
 * Used automatically when Android SpeechRecognizer reports Error 12/13 (missing language pack).
 */
export async function transcribeAudioWithGemini(params: {
  audioBase64: string;
  mimeType: string;
  language: 'auto' | 'en-US' | 'bn-BD';
  signal?: AbortSignal;
}): Promise<{ success: boolean; text?: string; error?: string }> {
  const settings = getAppSettings();
  const customGeminiKey = (settings.customGeminiApiKey || '').trim();

  // 1. Try backend /api/transcribe first
  try {
    const res = await apiFetch(
      '/api/transcribe',
      {
        method: 'POST',
        body: JSON.stringify({
          audioBase64: params.audioBase64,
          mimeType: params.mimeType,
          language: params.language,
          customGeminiKey
        })
      },
      15000,
      params.signal
    );
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      return { success: true, text: String(data.text || '').trim() };
    }
    if (data?.error && !/requiresKey|API key/i.test(String(data.error))) {
      // fall through to direct if key exists, else return error
      if (!customGeminiKey) return { success: false, error: String(data.error) };
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
  }

  // 2. Direct Gemini REST fallback for standalone APK
  if (!customGeminiKey) {
    return {
      success: false,
      error: 'Voice language pack unavailable locally (Error 12). Add your Gemini API key in Settings for Cloud Bangla/English speech transcription.'
    };
  }

  const cleanBase64 = params.audioBase64.replace(/^data:audio\/[a-zA-Z0-9.+_-]+;base64,/, '').trim();
  const langHint =
    params.language === 'bn-BD'
      ? 'The speaker is speaking Bengali (বাংলা) or mixed Bengali-English. Transcribe accurately in Bengali script where spoken in Bengali.'
      : params.language === 'en-US'
      ? 'The speaker is speaking English. Transcribe accurately.'
      : 'Auto-detect Bengali (বাংলা) or English and transcribe accurately.';

  for (const modelId of GEMINI_TRANSCRIBE_CANDIDATES) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(customGeminiKey)}`;
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: `You are a precise speech-to-text transcriber. ${langHint} Return ONLY the verbatim spoken text.` }]
            },
            contents: [
              {
                role: 'user',
                parts: [
                  { inlineData: { mimeType: params.mimeType, data: cleanBase64 } },
                  { text: 'Transcribe this audio verbatim.' }
                ]
              }
            ]
          })
        },
        15000,
        params.signal
      );

      if (!res.ok) {
        if (res.status === 404 || res.status === 503) continue;
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: formatGeminiFriendlyError(errJson?.error?.message || '', res.status) };
      }

      const data = await res.json();
      const transcript = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('').trim();
      return { success: true, text: transcript };
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
    }
  }

  return { success: false, error: 'Cloud speech transcription failed. Check your internet connection or API key.' };
}

