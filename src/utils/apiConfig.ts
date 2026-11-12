/**
 * Centralized API configuration and network resilience helper for Zuzu AI.
 * Handles seamless routing between Web preview (relative path) and Android APK (remote Cloud Run endpoint),
 * with intelligent direct-API fallback for custom Google Gemini and xAI Grok keys.
 */

// Deployed Cloud Run Production Backend URL for Android APK
export const DEFAULT_REMOTE_BACKEND_URL = 'https://ais-dev-requvmmuycwborvooarj55-817905745905.asia-east1.run.app';

/**
 * Returns the effective API Base URL depending on runtime environment (Android APK vs Web).
 */
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
  const isCapacitor = 
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'ionic:' ||
    (window.location.hostname === 'localhost' && window.location.port !== '3000' && window.location.port !== '5173');

  if (isCapacitor) {
    return DEFAULT_REMOTE_BACKEND_URL;
  }

  // 3. Web preview / standard browser development (use relative path)
  return '';
}

/**
 * Robust fetch wrapper that resolves endpoints, handles timeouts, and sets standard headers.
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = baseUrl ? `${baseUrl}${cleanEndpoint}` : cleanEndpoint;

  const timeoutMs = 15000;
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

/**
 * Direct Google Generative Language API key validation.
 * Bypasses intermediate proxies to directly confirm whether an API key is recognized and active at Google.
 */
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
    // Check Google's official models list endpoint
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

    if (rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('API key not valid')) {
      return { success: false, message: 'Invalid API Key. Please verify your key in Google AI Studio.' };
    }
    if (rawMsg.includes('RESOURCE_EXHAUSTED') || res.status === 429) {
      return { success: false, message: 'API Quota exceeded for this key in Google AI Studio.' };
    }
    if (res.status === 403) {
      return { success: false, message: 'Access forbidden. Please ensure Generative Language API is enabled for this key.' };
    }

    return { success: false, message: rawMsg };
  } catch (netErr: any) {
    return {
      success: false,
      message: `Network error: Could not reach Google Gemini servers (${netErr.message || 'Check connection'}).`
    };
  }
}

/**
 * Unified AI Provider Key Validator.
 * Tries server-side proxy first, and gracefully falls back to direct API verification if offline or in APK.
 */
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

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          success: true,
          model: data.model || 'Google Gemini',
          latencyMs: data.latencyMs,
          message: data.message || `Valid ✓ Connected to ${provider === 'gemini' ? 'Google Gemini' : 'xAI Grok'}`
        };
      } else {
        // If server responded with failure, check if direct validation can confirm
        if (provider === 'gemini') {
          const directCheck = await validateGeminiKeyDirectly(trimmed);
          if (directCheck.success) {
            return {
              success: true,
              model: 'gemini-verified',
              latencyMs: directCheck.latencyMs,
              message: directCheck.message
            };
          }
        }
        return {
          success: false,
          message: data.error || 'Failed to authenticate API Key.'
        };
      }
    }
  } catch (err: any) {
    console.warn('[Zuzu AI] Backend validation ping failed, falling back to direct API check:', err);
  }

  // 2. Direct fallback for Gemini if backend was unreachable
  if (provider === 'gemini') {
    const directResult = await validateGeminiKeyDirectly(trimmed);
    return {
      success: directResult.success,
      model: directResult.success ? 'Google Gemini (Direct Verified)' : undefined,
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

/**
 * Direct Gemini Generate Content client-side emergency fallback
 * when backend server is completely unreachable from Android APK.
 */
export async function directGeminiGenerateContent(
  apiKey: string,
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
  
  const body: any = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || `Google API error ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Google Gemini API');
  }
  return text.trim();
}
