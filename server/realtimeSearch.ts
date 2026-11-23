import type { RealtimeSearchClassification } from '../src/utils/searchIntent.ts';
import type { SearchSourceItem } from '../src/types/index.ts';

function decodeXmlEntities(str: string): string {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

export function formatAgeLabel(publishedMs: number, nowMs = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((nowMs - publishedMs) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

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

  // Gemini Google Search grounding chunks often wrap redirect URLs via vertexaisearch.cloud.google.com
  // while putting the real website domain or publisher in `chunk.web.title`.
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

async function fetchWithAbort(url: string, timeoutMs = 4500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ZuzuAI-GoogleSearchBot/3.7 (+https://ais-pre-requvmmuycwborvooarj55-817905745905.asia-east1.run.app)'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseGoogleNewsRssXml(
  xml: string,
  nowMs: number
): Array<SearchSourceItem & { publishedMs: number }> {
  const items: Array<SearchSourceItem & { publishedMs: number }> = [];
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  for (const block of itemMatches.slice(0, 18)) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

    let rawTitle = decodeXmlEntities(titleMatch?.[1] || '');
    const url = decodeXmlEntities(linkMatch?.[1] || '');
    const pubStr = decodeXmlEntities(pubDateMatch?.[1] || '');
    let sourceName = decodeXmlEntities(sourceMatch?.[1] || '');

    if (!rawTitle || !url || !/^https?:\/\//i.test(url)) continue;

    // Google News RSS titles typically end with " - Publisher"
    if (!sourceName && /\s+-\s+[^-]+$/.test(rawTitle)) {
      const lastDash = rawTitle.lastIndexOf(' - ');
      if (lastDash > 10) {
        sourceName = rawTitle.slice(lastDash + 3).trim();
        rawTitle = rawTitle.slice(0, lastDash).trim();
      }
    } else if (sourceName && rawTitle.endsWith(` - ${sourceName}`)) {
      rawTitle = rawTitle.slice(0, -(` - ${sourceName}`).length).trim();
    }

    if (!sourceName) {
      sourceName = getHostnameLabel(url);
    }

    const parsedDate = pubStr ? Date.parse(pubStr) : NaN;
    const publishedMs = Number.isNaN(parsedDate) ? 0 : parsedDate;
    const isWithin20Min = publishedMs > 0 && nowMs - publishedMs <= 20 * 60 * 1000;

    items.push({
      title: rawTitle,
      url,
      sourceName,
      publishedAt: publishedMs > 0 ? new Date(publishedMs).toISOString() : undefined,
      ageLabel: publishedMs > 0 ? formatAgeLabel(publishedMs, nowMs) : undefined,
      isWithin20Min,
      publishedMs
    });
  }

  return items;
}

/**
 * Fetches publicly indexed Google News RSS articles sorted newest-first with real publication timestamps,
 * prioritizing articles published within the last 20 minutes when available.
 */
async function fetchGoogleNewsRss(
  query: string,
  classification: RealtimeSearchClassification
): Promise<Array<SearchSourceItem & { publishedMs: number }>> {
  try {
    const cleanQuery = query
      .replace(
        /\b(?:tell me|what is|what's|can you|please|latest|breaking|news|any updates?|in the last \d+ minutes?|last \d+ minutes?|past \d+ minutes?|right now)\b/gi,
        ' '
      )
      .replace(/(?:গত\s*[০-৯0-9]+\s*(?:মিনিট|মিনিটের|ঘণ্টা|ঘণ্টার)|সর্বশেষ|তাজা|ব্রেকিং|খবর|আপডেট|বলো|দাও)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const baseQ =
      cleanQuery.length >= 2
        ? cleanQuery
        : classification.regionHint === 'BD'
        ? 'Bangladesh'
        : 'world news';

    const hl = classification.isBengali ? 'bn' : 'en-US';
    const gl = classification.regionHint === 'BD' ? 'BD' : 'US';
    const ceid = `${gl}:${classification.isBengali ? 'bn' : 'en'}`;

    const queries = [baseQ];
    if (
      classification.timeWindowMinutes !== null &&
      classification.timeWindowMinutes <= 120 &&
      !/\bwhen:/i.test(baseQ)
    ) {
      queries.unshift(`${baseQ} when:1h`);
    }

    const nowMs = Date.now();
    const responses = await Promise.allSettled(
      queries.map(async (qItem) => {
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(qItem)}&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`;
        const res = await fetchWithAbort(rssUrl, 4500);
        if (!res.ok) return [];
        const xml = await res.text();
        return parseGoogleNewsRssXml(xml, nowMs);
      })
    );

    const seen = new Set<string>();
    const combined: Array<SearchSourceItem & { publishedMs: number }> = [];
    for (const r of responses) {
      if (r.status !== 'fulfilled') continue;
      for (const item of r.value) {
        const dedupeKey = `${item.sourceName.toLowerCase()}::${item.title.toLowerCase().slice(0, 60)}`;
        if (seen.has(item.url) || seen.has(dedupeKey)) continue;
        seen.add(item.url);
        seen.add(dedupeKey);
        combined.push(item);
      }
    }

    combined.sort((a, b) => (b.publishedMs || 0) - (a.publishedMs || 0));
    return combined.slice(0, 10);
  } catch {
    return [];
  }
}

export interface RealtimeRetrievalBundle {
  feedSources: SearchSourceItem[];
  systemAugmentation: string;
  hasRecentMatchInWindow: boolean;
  recent20MinCount: number;
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

  const shouldQueryNewsIndex =
    classification.isNewsQuery ||
    (classification.timeWindowMinutes !== null && classification.timeWindowMinutes <= 1440);

  const results = shouldQueryNewsIndex
    ? await fetchGoogleNewsRss(classification.searchQuery, classification)
    : [];

  results.sort((a, b) => (b.publishedMs || 0) - (a.publishedMs || 0));

  const windowMin = classification.timeWindowMinutes;
  const inWindowItems = windowMin
    ? results.filter(r => r.publishedMs > 0 && nowMs - r.publishedMs <= windowMin * 60000)
    : results;

  const recent20MinCount = results.filter(r => r.isWithin20Min).length;
  const hasRecentMatchInWindow = inWindowItems.length > 0;
  const cleanFeedSources: SearchSourceItem[] = results
    .slice(0, 6)
    .map(({ publishedMs: _p, ...rest }) => rest);

  let aug = `\n\nREAL-TIME GOOGLE SEARCH & NEWS GROUNDING CONTEXT:
- Current Verified Server Time (UTC): ${utcNow}
- Current Local Time (Asia/Dhaka, Bangladesh): ${dhakaNow}
- Official Gemini Google Search Grounding (googleSearch tool) is ENABLED for this turn. Always ground current events, breaking news, prices, scores, weather, and recent facts in verified live Google Search results rather than static memory.
- Prioritize the newest published web articles and news reports—especially items published within the last 20 minutes when available.
- Support both English and Bengali (বাংলা) queries fluently and respond in the user's language.
- Include the publisher/source name and real publication timestamp/age when citing news or live updates.
- STRICT ACCURACY & ANTI-FABRICATION RULES:
  1. Never invent headlines, dates, timestamps, or URLs.
  2. State exact publication times (or relative age like "8m ago") ONLY when confirmed by verified search results or the live feed below.
  3. Never claim an event was published in the last 20 minutes unless the verified timestamp proves it occurred within the last 20 minutes.`;

  if (windowMin) {
    aug += `\n  4. The user asked specifically about the last ${windowMin} minutes. If no verified reports exist inside that exact ${windowMin}-minute window, clearly state that no verified reports were published in that exact window, and then provide the newest verified reports with their exact real publication timestamps.`;
  }

  if (cleanFeedSources.length > 0) {
    const feedLines = cleanFeedSources
      .map((item, idx) => {
        const freshnessTag = item.isWithin20Min ? '[WITHIN LAST 20 MIN] ' : '';
        const timePart = item.publishedAt
          ? `${item.publishedAt} (${item.ageLabel || 'recent'})`
          : 'Timestamp unknown';
        return `[${idx + 1}] ${freshnessTag}${item.title} — ${item.sourceName} | Published: ${timePart} | URL: ${item.url}`;
      })
      .join('\n');
    aug += `\n\nLIVE GOOGLE NEWS PUBLIC INDEX FEED (sorted newest-first):\n${feedLines}`;
  }

  return {
    feedSources: cleanFeedSources,
    systemAugmentation: aug,
    hasRecentMatchInWindow,
    recent20MinCount
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

  // Prioritize ultra-fresh (<20m) & timestamped news items first (up to 4),
  // then Gemini Google Search Grounding direct web chunks (up to 4), capped at 8 total.
  const orderedFeed = [...feedSources].sort((a, b) => {
    const a20 = a.isWithin20Min ? 1 : 0;
    const b20 = b.isWithin20Min ? 1 : 0;
    if (a20 !== b20) return b20 - a20;
    const ta = a.publishedAt ? Date.parse(a.publishedAt) || 0 : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) || 0 : 0;
    return tb - ta;
  });

  for (const item of orderedFeed.slice(0, 4)) {
    if (!item?.url || !/^https?:\/\//i.test(item.url)) continue;
    const key = item.url.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  for (const item of groundingSources) {
    if (!item?.url || !/^https?:\/\//i.test(item.url)) continue;
    const key = item.url.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= 8) break;
  }

  if (merged.length < 8) {
    for (const item of orderedFeed.slice(4)) {
      if (!item?.url || !/^https?:\/\//i.test(item.url)) continue;
      const key = item.url.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= 8) break;
    }
  }

  return merged;
}
