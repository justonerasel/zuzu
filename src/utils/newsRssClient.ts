import type { SearchSourceItem } from '../types/index.ts';
import type { RealtimeSearchClassification } from './searchIntent.ts';
import { getNativeZuzuPlugin } from './permission';
import {
  MAX_NEWS_RSS_RESULTS,
  buildGoogleNewsRssUrl,
  cleanTopicForRssQuery,
  parseGoogleNewsRssXml
} from './newsRss';

export interface NewsRssFetchResult {
  ok: boolean;
  items: SearchSourceItem[];
  feedUrl: string;
  method: 'native_capacitor_http' | 'backend_rss_proxy';
  error?: string;
}

function getClientApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const customUrl = localStorage.getItem('zuzu_custom_server_url')?.trim();
  if (customUrl && customUrl.startsWith('http')) {
    return customUrl.replace(/\/+$/, '');
  }
  return '';
}

/**
 * Fetches Google News RSS feed free of CORS both inside Capacitor Android APK
 * (via native Java HttpURLConnection in ZuzuNative.fetchUrlText) and in Web browsers
 * (via Express /api/news-rss proxy). Returns up to 8 newest headlines.
 */
export async function fetchGoogleNewsRssClient(
  classification: RealtimeSearchClassification
): Promise<NewsRssFetchResult> {
  const topic = cleanTopicForRssQuery(classification.searchQuery, classification.regionHint);
  const feedUrl = buildGoogleNewsRssUrl(topic, classification.isBengali, classification.regionHint);

  const nativePlugin = getNativeZuzuPlugin();

  // 1. Inside Android APK: fetch directly from news.google.com via Java HttpURLConnection (zero CORS, no server needed)
  if (nativePlugin?.fetchUrlText) {
    try {
      const nativeRes = await nativePlugin.fetchUrlText({ url: feedUrl, timeoutMs: 7500 });
      if (!nativeRes?.ok || typeof nativeRes?.text !== 'string') {
        return {
          ok: false,
          items: [],
          feedUrl,
          method: 'native_capacitor_http',
          error: `HTTP ${nativeRes?.status || 'error'}`
        };
      }

      let parsed = parseGoogleNewsRssXml(nativeRes.text);
      let usedUrl = feedUrl;

      // If hyper-specific topic returned 0 RSS <item>s, broaden cleanly once to regional/world headline feed
      if (parsed.length === 0 && topic !== 'Bangladesh' && topic !== 'world news') {
        const fallbackTopic = classification.regionHint === 'BD' ? 'Bangladesh' : 'world news';
        const fallbackUrl = buildGoogleNewsRssUrl(fallbackTopic, classification.isBengali, classification.regionHint);
        const retryRes = await nativePlugin.fetchUrlText({ url: fallbackUrl, timeoutMs: 7000 }).catch(() => null);
        if (retryRes?.ok && typeof retryRes?.text === 'string') {
          const retryItems = parseGoogleNewsRssXml(retryRes.text);
          if (retryItems.length > 0) {
            parsed = retryItems;
            usedUrl = fallbackUrl;
          }
        }
      }

      return {
        ok: true,
        items: parsed.slice(0, MAX_NEWS_RSS_RESULTS).map(({ publishedMs: _ms, ...rest }) => rest),
        feedUrl: usedUrl,
        method: 'native_capacitor_http'
      };
    } catch (err: any) {
      return {
        ok: false,
        items: [],
        feedUrl,
        method: 'native_capacitor_http',
        error: err?.message || 'Native HTTP fetch failed'
      };
    }
  }

  // 2. Web / Dev browser fallback: fetch via Express /api/news-rss proxy (free, avoids browser CORS)
  try {
    const base = getClientApiBaseUrl();
    const proxyUrl = `${base}/api/news-rss?q=${encodeURIComponent(classification.searchQuery)}&bn=${classification.isBengali ? '1' : '0'}&region=${encodeURIComponent(classification.regionHint)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timer);

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        items: [],
        feedUrl: data?.feedUrl || feedUrl,
        method: 'backend_rss_proxy',
        error: data?.error || `HTTP ${res.status}`
      };
    }

    return {
      ok: true,
      items: Array.isArray(data.items) ? data.items.slice(0, MAX_NEWS_RSS_RESULTS) : [],
      feedUrl: data.feedUrl || feedUrl,
      method: 'backend_rss_proxy'
    };
  } catch (err: any) {
    return {
      ok: false,
      items: [],
      feedUrl,
      method: 'backend_rss_proxy',
      error: err?.name === 'AbortError' ? 'RSS request timed out' : err?.message || 'Network error'
    };
  }
}
