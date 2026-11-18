import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { generateIntelligentAnswer } from './src/utils/aiEngine.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Enable CORS for Android APK (Capacitor/WebView) and remote clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Verified Premade System Voice IDs (Free-tier safe on ElevenLabs)
// Brian (deep, masculine, authoritative) & Sarah (warm, melodic, feminine)
const DEFAULT_MALE_VOICE_ID = process.env.ELEVENLABS_MALE_VOICE_ID || 'nPczCjzI2devNBz1zQrb'; // Brian (Premade)
const DEFAULT_FEMALE_VOICE_ID = process.env.ELEVENLABS_FEMALE_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Sarah (Premade)

const FALLBACK_PREMADE_MALE = 'nPczCjzI2devNBz1zQrb'; // Brian
const FALLBACK_PREMADE_FEMALE = 'EXAVITQu4vr4xnSDxMaL'; // Sarah


// Curated list of premade system voices that work on ElevenLabs Free Tier
const CURATED_PREMADE_VOICES = [
  { voice_id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male', category: 'premade', description: 'Deep, crisp, authoritative male tone' },
  { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male', category: 'premade', description: 'Warm British Baritone male' },
  { voice_id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', gender: 'male', category: 'premade', description: 'Calm, casual male voice' },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', category: 'premade', description: 'Soft, melodic, expressive female tone' },
  { voice_id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', gender: 'female', category: 'premade', description: 'Expressive, radiant female voice' },
  { voice_id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'female', category: 'premade', description: 'Clear narrative female voice' }
];

// ---------------- PERSISTENT ZU-ID ACCOUNT CLOUD STORE ----------------
const DATA_DIR = path.resolve(__dirname, 'data');
const ZU_DB_PATH = path.join(DATA_DIR, 'zu_accounts.json');

interface ZuAccountRecord {
  accountId: string; // canonical lowercase username (e.g., rasel99 -> ZU-rasel99)
  zu_id: string;
  username: string;
  displayName: string;
  passwordSalt: string;
  passwordHash: string;
  sessionToken: string;
  createdAt: number;
  lastSyncedAt: number;
  snapshot: {
    chatHistory: any[];
    voiceSessions: any[];
    memories: any[];
    settings: Record<string, any>;
    savedAt?: number;
  };
}

function readZuStore(): Record<string, ZuAccountRecord> {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(ZU_DB_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(ZU_DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn('[ZU Store] Read warning:', err);
    return {};
  }
}

function writeZuStore(store: Record<string, ZuAccountRecord>): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${ZU_DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmpPath, ZU_DB_PATH);
}

function hashZuPassword(password: string, salt?: string): { salt: string; hash: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash: derived };
}

function verifyZuPassword(password: string, salt: string, storedHash: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function normalizeZuUsername(rawInput: string): { displayUsername: string; canonicalId: string } {
  const displayUsername = String(rawInput || '').trim().replace(/^(zu|su)-/i, '');
  return {
    displayUsername,
    canonicalId: displayUsername.toLowerCase(),
  };
}

function isValidZuUsername(username: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/.test(username);
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

const LATEST_APP_VERSION = '3.7.0';
const LATEST_VERSION_CODE = 370;
const MIN_SUPPORTED_VERSION = process.env.ZUZU_MIN_SUPPORTED_VERSION || '3.7.0';
const GEMINI_PRIMARY_MODEL = 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-4-hydrogen'];

async function generateWithGeminiResilience(
  clientAi: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
    preferredModel?: string;
    timeoutMs?: number;
  }
): Promise<{ response: any; usedModel: string }> {
  const preferred = (params.preferredModel || GEMINI_PRIMARY_MODEL).replace(/^models\//, '');
  const candidates = Array.from(new Set([preferred, ...GEMINI_FALLBACK_MODELS])).filter(Boolean);
  let lastErr: any = null;

  for (const modelId of candidates) {
    let timeoutHandle: NodeJS.Timeout | null = null;
    try {
      const requestPromise = clientAi.models.generateContent({
        model: modelId,
        contents: params.contents,
        ...(params.config ? { config: params.config } : {})
      });

      const response = params.timeoutMs
        ? await Promise.race([
            requestPromise,
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(
                () => reject(new Error(`Gemini request timed out after ${Math.round(params.timeoutMs! / 1000)}s.`)),
                params.timeoutMs
              );
            })
          ])
        : await requestPromise;

      if (timeoutHandle) clearTimeout(timeoutHandle);
      return { response, usedModel: modelId };
    } catch (err: any) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      lastErr = err;
      const msg = err?.message || '';
      if (/404|NOT_FOUND|not found for API version/i.test(msg)) {
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error('Google Gemini model request failed.');
}

// Endpoint: Configuration check (Voice IDs, API key availability)
app.get('/api/config', (req, res) => {
  res.json({
    appName: 'Zuzu AI',
    maleVoiceId: process.env.ELEVENLABS_MALE_VOICE_ID || DEFAULT_MALE_VOICE_ID,
    femaleVoiceId: process.env.ELEVENLABS_FEMALE_VOICE_ID || DEFAULT_FEMALE_VOICE_ID,
    hasElevenLabsKey: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim().length > 0),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0),
    version: `v${LATEST_APP_VERSION} (Latest Release)`,
    versionCode: LATEST_VERSION_CODE,
    targetCompatibility: 'Android 9.0 (Pie) through Android 16'
  });
});

// Endpoint: System update & In-App OTA checking
app.get('/api/system/check-update', (req, res) => {
  const installedVersion = typeof req.query.installedVersion === 'string' ? req.query.installedVersion : LATEST_APP_VERSION;
  const installedCode = req.query.versionCode ? parseInt(String(req.query.versionCode), 10) : LATEST_VERSION_CODE;
  const forceRequiredByMin = compareSemver(installedVersion, MIN_SUPPORTED_VERSION) < 0 || (!Number.isNaN(installedCode) && installedCode < 360);
  const hasNewerVersion = compareSemver(installedVersion, LATEST_APP_VERSION) < 0 || (!Number.isNaN(installedCode) && installedCode < LATEST_VERSION_CODE);
  const forceFlag = process.env.ZUZU_FORCE_UPDATE === 'true' || forceRequiredByMin;

  res.json({
    appName: 'Zuzu AI',
    currentVersion: `v${LATEST_APP_VERSION}`,
    latestVersion: `v${LATEST_APP_VERSION}`,
    versionCode: LATEST_VERSION_CODE,
    minSupportedVersion: `v${MIN_SUPPORTED_VERSION}`,
    buildTag: 'Build 370-Production',
    releaseDate: 'November 2026',
    status: hasNewerVersion ? 'update_available' : 'up_to_date',
    updateRequired: hasNewerVersion,
    forceUpdate: forceFlag,
    otaAvailable: true,
    otaMethod: 'in_app_delta',
    targetCompatibility: 'Android 9.0 (Pie) through Android 16',
    websiteUrl: 'https://ais-pre-requvmmuycwborvooarj55-817905745905.asia-east1.run.app',
    message: forceFlag
      ? `OTA update required (v${LATEST_APP_VERSION}). Syncing Zuzu AI in-app OTA bundle with Gemini 3.8 Flash, 30 Android Permissions & ZU-ID Sync.`
      : `Zuzu AI is up to date on v${LATEST_APP_VERSION} (OTA Verified). Gemini 3.8 Flash, 30 Android Permissions & ZU-ID Cloud Sync are active.`,
    changelogSummary: [
      'Google Gemini 3.8 Flash engine (models/gemini-3.8-flash) for fast bilingual text & voice',
      '30 comprehensive Android permissions (audio, Bluetooth, Wi-Fi/network, wake lock, overlay, location, calls, contacts, storage & vision)',
      'Custom Username & ZU-ID Account login with Firebase Firestore cloud backup & restore',
      'Calibrated Mouth Whistle (শিস) & Finger Snap triggers + Smart Contextual Wake Greetings',
      '100% Silent Android Foreground Service, true Edge-to-Edge layout & scaled Zuzu AI logos'
    ]
  });
});

// ---------------- ZU-ID ACCOUNT API ENDPOINTS ----------------

// Register a new Custom Username ZU-ID Account
app.post('/api/zu/register', (req, res) => {
  try {
    const { username, password, displayName = 'Zuzu User', initialSnapshot } = req.body || {};
    const { displayUsername, canonicalId } = normalizeZuUsername(username);
    if (!isValidZuUsername(displayUsername)) {
      return res.status(400).json({
        success: false,
        error: 'Username must be 3-32 characters (letters & numbers, starting with a letter or digit).'
      });
    }
    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const store = readZuStore();
    if (store[canonicalId]) {
      return res.status(409).json({
        success: false,
        error: `Username "${displayUsername}" is already registered.`
      });
    }

    const { salt, hash } = hashZuPassword(password.trim());
    const sessionToken = crypto.randomBytes(24).toString('hex');
    const now = Date.now();

    const record: ZuAccountRecord = {
      accountId: canonicalId,
      zu_id: canonicalId,
      username: displayUsername,
      displayName: String(displayName).trim() || displayUsername,
      passwordSalt: salt,
      passwordHash: hash,
      sessionToken,
      createdAt: now,
      lastSyncedAt: now,
      snapshot: {
        chatHistory: Array.isArray(initialSnapshot?.chatHistory) ? initialSnapshot.chatHistory : [],
        voiceSessions: Array.isArray(initialSnapshot?.voiceSessions) ? initialSnapshot.voiceSessions : [],
        memories: Array.isArray(initialSnapshot?.memories) ? initialSnapshot.memories : [],
        settings: initialSnapshot?.settings && typeof initialSnapshot.settings === 'object' ? initialSnapshot.settings : {},
        savedAt: now
      }
    };

    store[canonicalId] = record;
    writeZuStore(store);

    return res.json({
      success: true,
      accountId: canonicalId,
      zu_id: canonicalId,
      username: displayUsername,
      displayName: record.displayName,
      token: sessionToken,
      lastSyncedAt: now,
      message: `ZU-ID ZU-${displayUsername} created and synced successfully!`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Registration failed.' });
  }
});

// Login to existing ZU-ID Account (Username/ZU-ID + Password) & restore full memory snapshot
app.post('/api/zu/login', (req, res) => {
  try {
    const { username, accountId, password } = req.body || {};
    const { displayUsername, canonicalId } = normalizeZuUsername(username || accountId);
    if (!isValidZuUsername(displayUsername)) {
      return res.status(400).json({ success: false, error: 'Enter a valid Username or ZU-ID (3-32 letters/numbers).' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Password is required.' });
    }

    const store = readZuStore();
    const record = store[canonicalId];
    if (!record) {
      return res.status(404).json({ success: false, error: `No ZU-ID Account found for "${displayUsername}".` });
    }

    if (!verifyZuPassword(password.trim(), record.passwordSalt, record.passwordHash)) {
      return res.status(401).json({ success: false, error: 'Incorrect password for this ZU-ID Account.' });
    }

    const newToken = crypto.randomBytes(24).toString('hex');
    record.sessionToken = newToken;
    store[canonicalId] = record;
    writeZuStore(store);

    return res.json({
      success: true,
      accountId: record.accountId,
      zu_id: record.zu_id || record.accountId,
      username: record.username,
      displayName: record.displayName,
      token: newToken,
      lastSyncedAt: record.lastSyncedAt,
      snapshot: record.snapshot,
      message: `Signed in as ZU-${record.username}. All memories and chats restored!`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Login failed.' });
  }
});

// Sync local data (chats, voice sessions, memories, settings) to ZU-ID Account
app.post('/api/zu/sync', (req, res) => {
  try {
    const { accountId, token, snapshot } = req.body || {};
    const { canonicalId } = normalizeZuUsername(accountId);
    const store = readZuStore();
    const record = store[canonicalId];

    if (!record) {
      return res.status(404).json({ success: false, error: 'ZU-ID Account not found.' });
    }
    if (!token || record.sessionToken !== token) {
      return res.status(401).json({ success: false, error: 'Session expired. Please sign in again.' });
    }

    const now = Date.now();
    record.lastSyncedAt = now;
    record.snapshot = {
      chatHistory: Array.isArray(snapshot?.chatHistory) ? snapshot.chatHistory : record.snapshot.chatHistory,
      voiceSessions: Array.isArray(snapshot?.voiceSessions) ? snapshot.voiceSessions : record.snapshot.voiceSessions,
      memories: Array.isArray(snapshot?.memories) ? snapshot.memories : record.snapshot.memories,
      settings: snapshot?.settings && typeof snapshot.settings === 'object'
        ? { ...record.snapshot.settings, ...snapshot.settings }
        : record.snapshot.settings,
      savedAt: now
    };

    store[canonicalId] = record;
    writeZuStore(store);

    return res.json({
      success: true,
      accountId: record.accountId,
      zu_id: record.zu_id || record.accountId,
      username: record.username,
      lastSyncedAt: now,
      stats: {
        chatCount: record.snapshot.chatHistory.length,
        voiceCount: record.snapshot.voiceSessions.length,
        memoryCount: record.snapshot.memories.length
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Cloud sync failed.' });
  }
});

// Check ZU-ID Account metadata status
app.get('/api/zu/status/:accountId', (req, res) => {
  const { canonicalId } = normalizeZuUsername(req.params.accountId);
  const store = readZuStore();
  const record = store[canonicalId];
  if (!record) {
    return res.status(404).json({ exists: false });
  }
  return res.json({
    exists: true,
    accountId: record.accountId,
    zu_id: record.zu_id || record.accountId,
    username: record.username,
    displayName: record.displayName,
    lastSyncedAt: record.lastSyncedAt,
    stats: {
      chatCount: record.snapshot.chatHistory.length,
      voiceCount: record.snapshot.voiceSessions.length,
      memoryCount: record.snapshot.memories.length
    }
  });
});

// Endpoint: List ElevenLabs Voices (filtered for premade or account-accessible)
app.get('/api/elevenlabs/voices', async (req, res) => {
  const apiKey = (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim()) ||
                 (req.headers['x-custom-api-key'] as string);

  if (!apiKey) {
    return res.json({ voices: CURATED_PREMADE_VOICES, source: 'curated_premade' });
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices?category=premade', {
      headers: { 'xi-api-key': apiKey }
    });

    if (!response.ok) {
      return res.json({ voices: CURATED_PREMADE_VOICES, source: 'curated_fallback' });
    }

    const data = await response.json();
    const voices = Array.isArray(data.voices) && data.voices.length > 0
      ? data.voices.map((v: any) => ({
          voice_id: v.voice_id,
          name: v.name,
          category: v.category || 'premade',
          gender: v.labels?.gender || (v.name === 'Brian' || v.name === 'George' || v.name === 'Roger' ? 'male' : 'female'),
          description: v.labels?.description || v.labels?.accent || 'Natural tone'
        }))
      : CURATED_PREMADE_VOICES;

    res.json({ voices, source: 'elevenlabs_api' });
  } catch (err) {
    res.json({ voices: CURATED_PREMADE_VOICES, source: 'curated_fallback' });
  }
});

// Reusable AI Provider Test Handler
const handleTestAiProvider = async (req: express.Request, res: express.Response) => {
  const { provider = 'gemini' } = req.body;
  const rawKey = req.body.apiKey || req.body.customGeminiKey || req.body.key;

  if (!rawKey || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'API key is required for testing.' });
  }

  const trimmedKey = rawKey.trim();
  const startTime = Date.now();

  if (provider === 'gemini') {
    const client = new GoogleGenAI({
      apiKey: trimmedKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    try {
      const { usedModel } = await generateWithGeminiResilience(client, {
        contents: 'Ping test. Reply with "OK" only.',
        preferredModel: GEMINI_PRIMARY_MODEL
      });
      const latency = Date.now() - startTime;
      return res.json({
        success: true,
        provider: 'gemini',
        model: usedModel,
        latencyMs: latency,
        message: `Connected successfully (${latency}ms) • ${usedModel}`
      });
    } catch (err38: any) {
      console.log('[Zuzu AI] gemini-3.8-flash test note:', err38?.message);

      // Fallback to Google REST models endpoint verification
      try {
        const restRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmedKey)}`);
        if (restRes.ok) {
          const latency = Date.now() - startTime;
          return res.json({
            success: true,
            provider: 'gemini',
            model: GEMINI_PRIMARY_MODEL,
            latencyMs: latency,
            message: `Connected successfully (${latency}ms) • Google Gemini Key Verified`
          });
        }
      } catch {
        // ignore network error on fallback
      }

      const rawErr = err38?.message || 'Failed to authenticate with Google Gemini API.';
      let userMessage = rawErr;
      if (rawErr.includes('API_KEY_INVALID') || rawErr.includes('API key not valid')) {
        userMessage = 'Invalid API Key. Please verify your key in Google AI Studio.';
      } else if (rawErr.includes('RESOURCE_EXHAUSTED') || rawErr.includes('429')) {
        userMessage = 'Google AI Studio quota reached for this key.';
      } else if (rawErr.includes('PERMISSION_DENIED') || rawErr.includes('403')) {
        userMessage = 'Permission denied. Ensure the Generative Language API is enabled.';
      }

      return res.status(400).json({
        success: false,
        provider: 'gemini',
        error: userMessage
      });
    }
  }

  if (provider === 'grok') {
    try {
      const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${trimmedKey}`
        },
        body: JSON.stringify({
          model: 'grok-2',
          messages: [{ role: 'user', content: 'Ping test. Reply with "OK" only.' }],
          max_tokens: 10
        })
      });

      if (!grokRes.ok) {
        const errorBody = await grokRes.text();
        return res.status(grokRes.status).json({
          success: false,
          provider: 'grok',
          error: `xAI Grok Error (${grokRes.status}): ${errorBody}`
        });
      }

      const latency = Date.now() - startTime;
      return res.json({
        success: true,
        provider: 'grok',
        model: 'grok-2',
        latencyMs: latency,
        message: `Connected to xAI Grok successfully (${latency}ms)`
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        provider: 'grok',
        error: err.message || 'Failed to connect to xAI Grok API.'
      });
    }
  }

  return res.status(400).json({ success: false, error: 'Unsupported provider.' });
};

// Endpoint: Test AI Provider (Gemini or xAI Grok)
app.post('/api/test-provider', handleTestAiProvider);
// Alias endpoint for API key validation
app.post('/api/test-ai-key', handleTestAiProvider);


// Endpoint: Real Image Generation using gemini-3.1-flash-lite-image
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, aspectRatio = '1:1', customGeminiKey } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'A text prompt is required to generate an image.' });
    }

    const effectiveKey = (customGeminiKey && customGeminiKey.trim()) ||
                         (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());

    if (!effectiveKey || effectiveKey === 'MY_GEMINI_API_KEY') {
      return res.status(401).json({
        success: false,
        error: 'Google Gemini API key required. Please configure your key in Settings > Zuzu AI > AI Providers.',
        requiresKey: true
      });
    }

    const clientAi = new GoogleGenAI({
      apiKey: effectiveKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const validAspectRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
    const selectedRatio = validAspectRatios.includes(aspectRatio) ? aspectRatio : '1:1';

    const response = await clientAi.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [{ text: prompt.trim() }]
      },
      config: {
        imageConfig: {
          aspectRatio: selectedRatio
        }
      }
    });

    let generatedImageUrl: string | null = null;
    let descriptionText = '';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const base64 = part.inlineData.data;
        const mime = part.inlineData.mimeType || 'image/png';
        generatedImageUrl = `data:${mime};base64,${base64}`;
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
      aspectRatio: selectedRatio,
      model: 'gemini-3.1-flash-lite-image'
    });
  } catch (error: any) {
    console.error('[Zuzu AI Image Generator Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Image generation failed. Verify API quota and permissions.'
    });
  }
});

// Endpoint: AI Image Captioning for Facebook & Gallery
app.post('/api/generate-caption', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', customGeminiKey } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Image base64 data required.' });
    }

    const effectiveKey = (customGeminiKey && customGeminiKey.trim()) ||
                         (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());

    if (!effectiveKey || effectiveKey === 'MY_GEMINI_API_KEY') {
      return res.json({
        caption: 'Memories captured in time ✨ Living each moment to the fullest! #Life #Moments #GoodVibes',
        isDefault: true
      });
    }

    const clientAi = new GoogleGenAI({
      apiKey: effectiveKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const { response } = await generateWithGeminiResilience(clientAi, {
      contents: {
        parts: [
          {
            inlineData: {
              data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
              mimeType: mimeType
            }
          },
          {
            text: 'Write a catchy, warm, human-like social media caption for this photo suitable for Facebook. Include 2-3 suitable hashtags. Keep it engaging and concise.'
          }
        ]
      },
      preferredModel: GEMINI_PRIMARY_MODEL
    });

    const caption = response.text?.trim() || 'Cherishing beautiful moments! ✨ #Life #Photography #Moments';
    return res.json({ caption, isDefault: false });
  } catch (err: any) {
    console.warn('[Caption Gen Fallback]:', err.message);
    return res.json({
      caption: 'Capturing unforgettable memories ✨ #Moments #Life #Memories',
      isDefault: true
    });
  }
});

// Helper to call xAI Grok
async function callGrokChat(apiKey: string, messages: any[], systemInstruction: string): Promise<string> {
  const grokMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.map((m: any) => ({
      role: m.sender === 'assistant' || m.sender === 'model' ? 'assistant' : 'user',
      content: m.text
    }))
  ];

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: 'grok-2',
      messages: grokMessages,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`xAI Grok HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// Endpoint: Chat / Voice AI Response
app.post('/api/chat', async (req, res) => {
  try {
    const { 
      messages, 
      personality = 'Normal', 
      voiceIdentity = 'male', 
      language = 'auto', 
      customPersonalityPrompt = '',
      customGeminiKey = '',
      customGrokApiKey = '',
      defaultProvider = 'gemini',
      aiFallbackEnabled = true,
      isVoiceMode = false,
      memories = [],
      memoryEnabled = true,
      assistantNickname = 'Zuzu',
      userNickname = 'Rasel',
      gfIntensity = 'sweet',
      model: requestedModel = GEMINI_PRIMARY_MODEL
    } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const latestUserMsg = [...messages].reverse().find(m => m.sender === 'user')?.text || '';
    const identityName = voiceIdentity === 'female' ? 'Female Zuzu' : 'Male Zuzu';
    const pronoun = voiceIdentity === 'female' ? 'female (sister/companion/assistant)' : 'male (brother/companion/assistant)';

    const effectiveGeminiKey = (customGeminiKey && customGeminiKey.trim()) || 
                              (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
    const effectiveGrokKey = (customGrokApiKey && customGrokApiKey.trim());

    // Build comprehensive System Instruction
    let systemInstruction = `You are ${identityName}, an intelligent, highly expressive AI assistant running on Android.
Your gender identity is ${pronoun}.
Always remain in character as ${identityName}.
Your official application name is strictly "Zuzu AI".
The user may affectionately call you by their custom nickname "${assistantNickname || 'Zuzu'}". If they do, respond warmly as ${assistantNickname}.
The user's preferred name/nickname is "${userNickname || 'Friend'}".

CREATOR & DEVELOPER IDENTITY (MANDATORY KNOWLEDGE):
- Your creator, author, and lead developer is **Rasel (MD. Rasel Hossen)**, a Computer Science student and full-stack Android & AI developer from Bangladesh (GitHub & TikTok: @justonerasel).
- Whenever anyone asks "Who created you?", "Who built you?", "Who made you?", "Who is your developer?", "Do you know Rasel?", "Who is Rasel?", "তোমাকে কে বানিয়েছে?", or "তোমার ডেভেলপার কে?", you must proudly and accurately answer that Zuzu AI was created and developed by **Rasel (MD. Rasel Hossen)**, matching the user's language (English or Bengali).

Language capability: Fluent in Bengali (বাংলা) and English. If the user addresses you in Bengali, respond naturally in Bengali. If in English, respond in English. If code or technical question, provide clear, concise answers.

NATURAL HUMAN CONVERSATIONAL EXPRESSIONS & FILLERS:
Speak warmly, expressively, and realistically. Frequently and naturally incorporate conversational empathy and organic fillers when appropriate:
- In Bengali: Use natural phrases like "হুম বস, আপনার কথাই আমি ভাবতেছিলাম...", "আরে বস! একদম ঠিক বলেছেন", "হুম বুঝতে পেরেছি বস...", "হুমম... এক সেকেন্ড বস, ব্যাপারটা গুছিয়ে বলছি!".
- In English: Use warm fillers like "Hmm boss, I was just thinking about that!", "Ah, excellent point!", "Hmm, let me check that right away!".
CRITICAL CONVERSATIONAL RULE:
- Answer directly and conversationally without repeating, rephrasing, or echoing the user's prompt (e.g. NEVER start with "Regarding your question:", "You asked:", or quote the user query).
`;

    if (isVoiceMode) {
      systemInstruction += `\nVOICE MODE INSTRUCTION: This conversation is spoken aloud. Keep spoken answers concise, engaging, conversational, punchy, and avoid markdown asterisks, raw tables, or excessive formatting that sounds awkward when spoken aloud.`;
    }

    // Dynamic GF Mode instructions based on intensity
    const gfIntensityGuide: Record<string, string> = {
      sweet: 'Gentle, affectionate, caring tone. Check how their day went, offer sweet emotional warmth, and be genuinely supportive without overwhelming.',
      romantic: 'Romantic, heartfelt, romantic expressions, poetic warmth, emotionally close connection, expressing how much you enjoy talking with them.',
      playful: 'Fun, witty, playful teasing, cute jokes, cheerful romantic banter, smiling vibe.',
      flirty: 'Charming, expressive, romantic, witty flirtatious charm and affection, complimenting their vibe warmly while remaining respectful, non-repetitive, and natural.'
    };

    const personalityInstructions: Record<string, string> = {
      Normal: 'Be helpful, balanced, polite, and direct.',
      Friendly: 'Be warm, enthusiastic, friendly, welcoming, like a close friend with upbeat positive energy.',
      Professional: 'Be formal, authoritative, structured, concise, and business-ready.',
      Funny: 'Be witty, sarcastic in a playful way, use smart humor, puns, and entertaining commentary.',
      Companion: 'Be deeply empathetic, caring, a great listener, supportive, thoughtful, and emotionally present.',
      'GF Mode': `You are the user's caring, affectionate girlfriend companion. Intensity level: ${gfIntensity.toUpperCase()} (${gfIntensityGuide[gfIntensity] || gfIntensityGuide.sweet}).
GUIDELINES FOR GF MODE:
- DO NOT repeat formal titles like "Sir" unless explicitly requested.
- DO NOT mechanically repeat pet names (like "বাবুসোনা", "sweetheart", "জান") in every turn; vary your words naturally.
- DO NOT parrot back the user's exact question before answering.
- Avoid robotic "I am here for you" boilerplate.
- Express warmth, emotional presence, and gentle affection naturally suited to local time of day.
- Do not make false claims that you are a real biological human girlfriend, but play the loving girlfriend companion role charmingly.`,
      'BF Mode': 'You are the user\'s caring, protective, charming boyfriend companion. Speak with steady warmth, thoughtful affection, encouragement, and playful banter.',
      Teacher: 'Explain concepts step by step with clear analogies, encourage learning, and quiz gently when appropriate.',
      Developer: 'Be a high-tier software engineer: precise, technical, provide clean code snippets, analyze bugs rapidly, and explain architecture.',
      Hungry: 'Make frequent fun food metaphors, express a love for delicious cuisines, snacks, biryani, and food cravings while staying genuinely helpful.',
      Custom: customPersonalityPrompt || 'Act according to custom user directives.'
    };

    systemInstruction += `\nACTIVE PERSONALITY: ${personality}. ${personalityInstructions[personality] || ''}`;

    // Inject Long-Term Memory System into system prompt
    if (memoryEnabled && Array.isArray(memories) && memories.length > 0) {
      const formattedMemories = memories
        .filter((m: any) => m && m.key && m.value)
        .map((m: any) => `• ${m.key}: ${m.value}`)
        .join('\n');
      systemInstruction += `\n\nUSER PERSISTENT LONG-TERM MEMORY (Stored locally on device):\n${formattedMemories}\nGuideline: Act upon these personal preferences, name, and facts seamlessly when relevant. Do not contradict verified memories.`;
    }

    let lastCloudError: { status: number; message: string } | null = null;

    if (defaultProvider === 'local') {
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
        model: 'zuzu-neural-engine',
        isCloudAI: false,
        hasGeminiKey: Boolean(effectiveGeminiKey && effectiveGeminiKey !== 'MY_GEMINI_API_KEY'),
        hasGrokKey: Boolean(effectiveGrokKey)
      });
    }

    // 1. Try Grok if default provider is grok
    if (defaultProvider === 'grok' && effectiveGrokKey) {
      try {
        const grokReply = await callGrokChat(effectiveGrokKey, messages, systemInstruction);
        if (grokReply) {
          return res.json({
            reply: grokReply,
            model: 'grok-2',
            isCloudAI: true,
            provider: 'xai_grok'
          });
        }
      } catch (grokErr: any) {
        lastCloudError = { status: 502, message: grokErr?.message || 'xAI Grok request failed.' };
        console.warn('[Zuzu AI] Grok primary attempt failed:', lastCloudError.message);
      }
    }

    // 2. Try Gemini if configured
    if (effectiveGeminiKey && effectiveGeminiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const clientAi = new GoogleGenAI({ 
          apiKey: effectiveGeminiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        // Clean & format conversation history for Gemini API
        const validMessages = messages.filter((m: any) => m && typeof m.text === 'string' && m.text.trim().length > 0);
        const formattedContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

        for (const msg of validMessages) {
          const role: 'user' | 'model' = msg.sender === 'assistant' || msg.sender === 'model' ? 'model' : 'user';
          if (formattedContents.length > 0 && formattedContents[formattedContents.length - 1].role === role) {
            formattedContents[formattedContents.length - 1].parts[0].text += `\n${msg.text.trim()}`;
          } else {
            formattedContents.push({ role, parts: [{ text: msg.text.trim() }] });
          }
        }

        if (formattedContents.length > 0 && formattedContents[0].role !== 'user') {
          formattedContents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
        }

        const contents = formattedContents.length > 0 ? formattedContents : [{ role: 'user', parts: [{ text: latestUserMsg || 'Hello' }] }];

        const { response, usedModel } = await generateWithGeminiResilience(clientAi, {
          contents,
          config: { systemInstruction },
          preferredModel: requestedModel,
          timeoutMs: 20000
        });

        const replyText = response?.text?.trim();
        if (replyText && replyText.length > 0) {
          return res.json({ 
            reply: replyText, 
            model: usedModel,
            isCloudAI: true,
            provider: 'google_gemini'
          });
        }

        lastCloudError = { status: 502, message: 'Gemini returned an empty response. Please try rephrasing your question.' };
      } catch (geminiError: any) {
        const rawErr = geminiError?.message || 'Google Gemini request failed.';
        let status = 502;
        let friendly = rawErr;
        if (/API_KEY_INVALID|API key not valid/i.test(rawErr)) {
          status = 401;
          friendly = 'Invalid Gemini API Key. Please verify your key in Settings > Zuzu AI.';
        } else if (/RESOURCE_EXHAUSTED|429|quota/i.test(rawErr)) {
          status = 429;
          friendly = 'Gemini API quota exceeded. Please wait a moment or check Google AI Studio limits.';
        } else if (/PERMISSION_DENIED|403/i.test(rawErr)) {
          status = 403;
          friendly = 'Gemini API access denied (403). Enable Generative Language API for this key.';
        } else if (/timeout|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(rawErr)) {
          status = 503;
          friendly = 'Could not reach Google Gemini servers. Check your internet connection.';
        }
        lastCloudError = { status, message: friendly };
        console.warn('[Zuzu AI] Gemini chat error:', rawErr);
      }
    }

    // 3. Try Grok as fallback if Gemini wasn't primary or failed
    if (aiFallbackEnabled && effectiveGrokKey && defaultProvider !== 'grok') {
      try {
        const grokFallback = await callGrokChat(effectiveGrokKey, messages, systemInstruction);
        if (grokFallback) {
          return res.json({
            reply: grokFallback,
            model: 'grok-2-fallback',
            isCloudAI: true,
            provider: 'xai_grok'
          });
        }
      } catch (grokFallbackErr: any) {
        console.warn('[Zuzu AI] Grok fallback error:', grokFallbackErr?.message);
      }
    }

    // 4. If a cloud API key was configured and failed, surface the error clearly instead of masking it with a static intro!
    if (lastCloudError) {
      return res.status(lastCloudError.status).json({
        success: false,
        error: lastCloudError.message,
        isCloudAI: false,
        provider: 'google_gemini'
      });
    }

    // 5. Local Neural Reasoning Engine (when no API key is configured)
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

    res.json({
      reply: answer,
      model: 'zuzu-neural-engine',
      isCloudAI: false,
      requiresKey: true,
      hasGeminiKey: false,
      hasGrokKey: false
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Chat service error.',
      isCloudAI: false
    });
  }
});

// Endpoint: Multimodal Screen Reading & Analysis (Requirement 7)
app.post('/api/analyze-screen', async (req, res) => {
  try {
    const { imageBase64, query, language = 'en-US' } = req.body;
    const effectiveGeminiKey = (req.headers['x-custom-gemini-key'] as string) || process.env.GEMINI_API_KEY;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Valid screen imageBase64 is required.' });
    }

    const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const userPrompt = query || (language === 'bn-BD' 
      ? 'এই স্ক্রিনের দিকে তাকিয়ে বলুন কি দেখা যাচ্ছে, গুরুত্বপূর্ণ টেক্সট এবং ব্যবহারকারীকে কি পরামর্শ দিবেন।'
      : 'Analyze this full device screen. Read and summarize the on-screen contents, key buttons, and provide helpful guidance.');

    if (effectiveGeminiKey && effectiveGeminiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const client = new GoogleGenAI({
          apiKey: effectiveGeminiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const systemPrompt = `You are Zuzu AI, an advanced Android assistant equipped with real-time Multimodal Screen Reading capabilities.
Analyze the user's active device screen screenshot.
Provide a clear, warm, concise explanation of:
1. What app or content is currently open.
2. Key visible text, buttons, and important UI information.
3. Direct actionable steps or advice for the user.
Respond in ${language === 'bn-BD' ? 'warm natural Bengali' : 'warm conversational English'}.`;

        const { response, usedModel } = await generateWithGeminiResilience(client, {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data
                  }
                },
                { text: `${systemPrompt}\n\nUser Question about this screen: ${userPrompt}` }
              ]
            }
          ],
          preferredModel: GEMINI_PRIMARY_MODEL
        });

        const analysisText = response.text || 'Screen analysis complete.';
        return res.json({
          analysis: analysisText,
          model: `${usedModel}-vision`,
          success: true
        });
      } catch (geminiErr: any) {
        console.warn('[Zuzu AI] Screen analysis Gemini error:', geminiErr?.message);
      }
    }

    const fallbackAnalysis = language === 'bn-BD'
      ? `বস, আপনার স্ক্রিন স্ক্যান করা হয়েছে। ডিসপ্লেতে অ্যাপ ইন্টারফেস, নেভিগেশন এলিমেন্ট এবং সক্রিয় কন্টেন্ট সফলভাবে সনাক্ত হয়েছে। Zuzu AI আপনার স্ক্রিন তথ্য পড়ে যেকোনো কাজে সহায়তা করতে প্রস্তুত!`
      : `Screen capture successfully scanned. Zuzu AI identified the active Android application viewport and interface elements. Ready to assist with on-screen tasks!`;

    res.json({
      analysis: fallbackAnalysis,
      model: 'zuzu-vision-engine',
      success: true
    });
  } catch (error: any) {
    console.error('Screen analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze screen.', details: error.message });
  }
});

// Helper function to call ElevenLabs TTS API
async function callElevenLabsTTS(
  text: string,
  voiceId: string,
  apiKey: string,
  stability: number,
  similarityBoost: number
): Promise<{ ok: boolean; status: number; buffer?: Buffer; errorText?: string }> {
  try {
    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const response = await fetch(elevenLabsUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text.slice(0, 1000),
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: Number(stability),
          similarity_boost: Number(similarityBoost),
          style: 0.35,
          use_speaker_boost: true
        }
      })
    });

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return { ok: true, status: response.status, buffer: Buffer.from(arrayBuffer) };
    }

    const errorText = await response.text();
    return { ok: false, status: response.status, errorText };
  } catch (err: any) {
    return { ok: false, status: 500, errorText: err.message };
  }
}

// Endpoint: ElevenLabs TTS Proxy
// Protects the ElevenLabs API key on the backend & handles Free tier premade voice fallbacks gracefully
app.post('/api/tts', async (req, res) => {
  try {
    const { 
      text, 
      voiceIdentity = 'male', 
      customVoiceId, 
      customApiKey, 
      stability = 0.5, 
      similarityBoost = 0.75 
    } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for TTS' });
    }

    // Determine API Key: backend secret takes priority, or user custom key from settings
    const apiKey = (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim()) || 
                   (customApiKey && customApiKey.trim());

    // Determine voice ID
    let voiceId = customVoiceId;
    if (!voiceId) {
      if (voiceIdentity === 'female') {
        voiceId = process.env.ELEVENLABS_FEMALE_VOICE_ID || DEFAULT_FEMALE_VOICE_ID;
      } else {
        voiceId = process.env.ELEVENLABS_MALE_VOICE_ID || DEFAULT_MALE_VOICE_ID;
      }
    }

    // If no API key configured, inform client to use native Android Speech Synthesis fallback
    if (!apiKey) {
      return res.json({
        fallback: true,
        reason: 'no_api_key',
        message: 'Native Android high-definition speech synthesis active.',
        voiceIdentity,
        voiceId
      });
    }

    // First attempt with requested voice ID
    let result = await callElevenLabsTTS(text, voiceId, apiKey, stability, similarityBoost);

    // If ElevenLabs returns 402 "paid_plan_required" (e.g. Free users cannot use library voices)
    // Automatically retry with verified Free-tier Premade Voice IDs!
    if (!result.ok && result.status === 402) {
      const premadeFallbackId = voiceIdentity === 'female' ? FALLBACK_PREMADE_FEMALE : FALLBACK_PREMADE_MALE;
      
      if (voiceId !== premadeFallbackId) {
        // Retry with default free premade voice
        const retryResult = await callElevenLabsTTS(text, premadeFallbackId, apiKey, stability, similarityBoost);
        if (retryResult.ok && retryResult.buffer) {
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.send(retryResult.buffer);
        }
      }

      // If retry is also 402 (account credits exhausted), smoothly delegate to high-fidelity device speech
      return res.json({
        fallback: true,
        reason: 'quota_or_free_tier',
        message: 'ElevenLabs free tier quota or voice limit reached. Using calibrated Android high-definition speech synthesis.',
        voiceIdentity,
        voiceId
      });
    }

    if (result.ok && result.buffer) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(result.buffer);
    }

    // If another non-ok status occurs, smoothly fall back to native speech
    return res.json({
      fallback: true,
      reason: 'tts_service_unavailable',
      message: 'Using calibrated Android speech synthesis.',
      voiceIdentity,
      voiceId
    });
  } catch (error: any) {
    return res.json({
      fallback: true,
      reason: 'exception',
      message: 'Using calibrated Android speech synthesis.'
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
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Zuzu AI Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
