import type { SearchSourceItem } from '../types/index.ts';
import type { RealtimeSearchClassification } from './searchIntent.ts';
import { getNativeZuzuPlugin } from './permission';
import {
  MAX_NEWS_RSS_RESULTS,
  buildGoogleNewsRssUrl,
  extractNewsSearchTopic,
  filterAndScoreNewsRssItems,
  parseGoogleNewsRssXml
} from './newsRss';

export interface NewsRssFetchResult {
  ok: boolean;
  items: SearchSourceItem[];
  feedUrl: string;
  method: 'native_capacitor_http' | 'backend_rss_proxy';
  noMatchingNews?: boolean;
  topicQuery?: string;
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
 * (via Express /api/news-rss proxy). Filters strictly by user's topic and excludes sports unless asked.
 */
export async function fetchGoogleNewsRssClient(
  classification: RealtimeSearchClassification
): Promise<NewsRssFetchResult> {
  const extracted = extractNewsSearchTopic(classification.searchQuery, classification.regionHint);
  const feedUrl = buildGoogleNewsRssUrl(extracted.query, classification.isBengali, classification.regionHint);

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
          topicQuery: extracted.query,
          error: `HTTP ${nativeRes?.status || 'error'}`
        };
      }

      const parsed = parseGoogleNewsRssXml(nativeRes.text, Date.now(), { maxResults: 24 });
      const filtered = filterAndScoreNewsRssItems(parsed, {
        keywords: extracted.keywords,
        hasSpecificTopic: extracted.hasSpecificTopic,
        asksAboutSports: classification.asksAboutSports
      });

      return {
        ok: true,
        items: filtered.items.slice(0, MAX_NEWS_RSS_RESULTS).map(({ publishedMs: _ms, ...rest }) => rest),
        feedUrl,
        method: 'native_capacitor_http',
        noMatchingNews: filtered.noMatchingNews,
        topicQuery: extracted.query
      };
    } catch (err: any) {
      return {
        ok: false,
        items: [],
        feedUrl,
        method: 'native_capacitor_http',
        topicQuery: extracted.query,
        error: err?.message || 'Native HTTP fetch failed'
      };
    }
  }

  // 2. Web / Dev browser fallback: fetch via Express /api/news-rss proxy (free, avoids browser CORS)
  try {
    const base = getClientApiBaseUrl();
    const proxyUrl = `${base}/api/news-rss?q=${encodeURIComponent(classification.searchQuery)}&bn=${classification.isBengali ? '1' : '0'}&region=${encodeURIComponent(classification.regionHint)}&sports=${classification.asksAboutSports ? '1' : '0'}`;
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
        topicQuery: extracted.query,
        error: data?.error || `HTTP ${res.status}`
      };
    }

    const items = Array.isArray(data.items) ? data.items.slice(0, MAX_NEWS_RSS_RESULTS) : [];
    return {
      ok: true,
      items,
      feedUrl: data.feedUrl || feedUrl,
      method: 'backend_rss_proxy',
      noMatchingNews: Boolean(data.noMatchingNews) || items.length === 0,
      topicQuery: data.topicQuery || extracted.query
    };
  } catch (err: any) {
    return {
      ok: false,
      items: [],
      feedUrl,
      method: 'backend_rss_proxy',
      topicQuery: extracted.query,
      error: err?.name === 'AbortError' ? 'RSS request timed out' : err?.message || 'Network error'
    };
  }
}
