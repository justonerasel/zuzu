import type { RealtimeSearchClassification } from '../src/utils/searchIntent.ts';
import type { SearchSourceItem } from '../src/types/index.ts';
import {
  MAX_NEWS_RSS_RESULTS,
  buildGoogleNewsRssUrl,
  buildStrictNewsRssSystemInstruction,
  extractNewsSearchTopic,
  filterAndScoreNewsRssItems,
  parseGoogleNewsRssXml,
  type ParsedNewsRssItem
} from '../src/utils/newsRss.ts';

function getHostnameLabel(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'Web Source';
  }
}

function resolveGroundingSourceName(uri: string, title?: string): string {
  const host = getHostnameLabel(uri);
  const cleanTitle = typeof title === 'string' ? title.trim() : '';

  if (
    host.includes('vertexaisearch.cloud.google.com') ||
    host === 'google.com' ||
    host === 'news.google.com'
  ) {
    if (cleanTitle) {
      const dashParts = cleanTitle.split(/\s+[-|—]\s+/);
      if (dashParts.length > 1) {
        return dashParts[dashParts.length - 1].trim().slice(0, 48);
      }
      return cleanTitle.replace(/^www\./, '').slice(0, 48);
    }
    return 'Google Web Source';
  }

  return host;
}

async function fetchWithAbort(url: string, timeoutMs = 7000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNewsRssServer(params: {
  query: string;
  isBengali: boolean;
  regionHint?: 'BD' | 'GLOBAL';
  asksAboutSports?: boolean;
}): Promise<{
  ok: boolean;
  items: ParsedNewsRssItem[];
  feedUrl: string;
  noMatchingNews?: boolean;
  topicQuery: string;
  error?: string;
}> {
  const regionHint = params.regionHint || (params.isBengali ? 'BD' : 'GLOBAL');
  const extracted = extractNewsSearchTopic(params.query, regionHint);
  const feedUrl = buildGoogleNewsRssUrl(extracted.query, params.isBengali, regionHint);

  try {
    const res = await fetchWithAbort(feedUrl, 6000);
    if (!res.ok) {
      return {
        ok: false,
        items: [],
        feedUrl,
        topicQuery: extracted.query,
        error: `Google News RSS returned HTTP ${res.status}`
      };
    }

    const xml = await res.text();
    const parsed = parseGoogleNewsRssXml(xml, Date.now(), { maxResults: 24 });
    const filtered = filterAndScoreNewsRssItems(parsed, {
      keywords: extracted.keywords,
      hasSpecificTopic: extracted.hasSpecificTopic,
      asksAboutSports: Boolean(params.asksAboutSports)
    });

    return {
      ok: true,
      items: filtered.items.slice(0, MAX_NEWS_RSS_RESULTS),
      feedUrl,
      noMatchingNews: filtered.noMatchingNews,
      topicQuery: extracted.query
    };
  } catch (err: any) {
    return {
      ok: false,
      items: [],
      feedUrl,
      topicQuery: extracted.query,
      error: err?.name === 'AbortError' ? 'RSS request timed out' : err?.message || 'RSS fetch failed'
    };
  }
}

export interface RealtimeRetrievalBundle {
  feedSources: SearchSourceItem[];
  systemAugmentation: string;
  hasRecentMatchInWindow: boolean;
  recent20MinCount: number;
  feedLoadFailed: boolean;
  noMatchingNews?: boolean;
  matchedTopic?: string;
  feedError?: string;
  strictRssOnly: boolean;
}

export async function gatherRealtimeIntelligence(
  classification: RealtimeSearchClassification
): Promise<RealtimeRetrievalBundle> {
  const now = new Date();
  const nowMs = now.getTime();
  const utcNow = now.toISOString();
  const dhakaNow = now.toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (classification.isNewsQuery) {
    const rssRes = await fetchNewsRssServer({
      query: classification.searchQuery,
      isBengali: classification.isBengali,
      regionHint: classification.regionHint,
      asksAboutSports: classification.asksAboutSports
    });

    if (!rssRes.ok) {
      return {
        feedSources: [],
        systemAugmentation: '',
        hasRecentMatchInWindow: false,
        recent20MinCount: 0,
        feedLoadFailed: true,
        feedError: rssRes.error || 'Could not load Google News RSS feed.',
        strictRssOnly: true
      };
    }

    const items = rssRes.items.slice(0, MAX_NEWS_RSS_RESULTS);
    const windowMin = classification.timeWindowMinutes;
    const inWindowItems = windowMin
      ? items.filter(r => r.publishedMs > 0 && nowMs - r.publishedMs <= windowMin * 60000)
      : items;
    const recent20MinCount = items.filter(r => r.isWithin20Min).length;
    const cleanFeedSources: SearchSourceItem[] = items.map(({ publishedMs: _p, ...rest }) => rest);

    if (rssRes.noMatchingNews || cleanFeedSources.length === 0) {
      return {
        feedSources: [],
        systemAugmentation: '',
        hasRecentMatchInWindow: false,
        recent20MinCount: 0,
        feedLoadFailed: false,
        noMatchingNews: true,
        matchedTopic: rssRes.topicQuery,
        strictRssOnly: true
      };
    }

    let aug = buildStrictNewsRssSystemInstruction(
      cleanFeedSources,
      classification.isBengali,
      classification.asksAboutSports
    );
    if (windowMin && inWindowItems.length === 0) {
      aug += `\n- Note: None of the ${cleanFeedSources.length} retrieved RSS items fall within the exact last ${windowMin} minutes. Mention that honestly and summarize the newest matching headlines from the RSS list above with their real publish times.`;
    }

    return {
      feedSources: cleanFeedSources,
      systemAugmentation: aug,
      hasRecentMatchInWindow: inWindowItems.length > 0,
      recent20MinCount,
      feedLoadFailed: false,
      noMatchingNews: false,
      matchedTopic: rssRes.topicQuery,
      strictRssOnly: true
    };
  }

  // Non-news real-time Google Search grounding context (weather, prices, current officeholders)
  const aug = `\n\nREAL-TIME GOOGLE SEARCH GROUNDING CONTEXT:
- Current Date & Time: ${dhakaNow} (UTC: ${utcNow})
- Use Google Search grounding to answer the user's exact question accurately in their language without fabricating dates or URLs.
${!classification.asksAboutSports ? '- Do NOT bring up sports news or unrelated topics.' : ''}`;

  return {
    feedSources: [],
    systemAugmentation: aug,
    hasRecentMatchInWindow: false,
    recent20MinCount: 0,
    feedLoadFailed: false,
    strictRssOnly: false
  };
}

export function extractGroundingSourcesFromResponse(response: any): SearchSourceItem[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const out: SearchSourceItem[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    const rawTitle = chunk?.web?.title;
    if (typeof uri === 'string' && /^https?:\/\//i.test(uri)) {
      const sourceName = resolveGroundingSourceName(uri, rawTitle);
      const title =
        typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : sourceName;
      out.push({
        title,
        url: uri,
        sourceName
      });
    }
  }
  return out;
}

export function mergeSearchSources(
  groundingSources: SearchSourceItem[],
  feedSources: SearchSourceItem[]
): SearchSourceItem[] {
  const seen = new Set<string>();
  const merged: SearchSourceItem[] = [];

  for (const item of feedSources) {
    if (!item?.url || !/^https?:\/\//i.test(item.url)) continue;
    const key = item.url.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= MAX_NEWS_RSS_RESULTS) break;
  }

  if (merged.length < MAX_NEWS_RSS_RESULTS) {
    for (const item of groundingSources) {
      if (!item?.url || !/^https?:\/\//i.test(item.url)) continue;
      const key = item.url.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= MAX_NEWS_RSS_RESULTS) break;
    }
  }

  return merged;
}
