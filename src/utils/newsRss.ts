import type { SearchSourceItem } from '../types/index.ts';

export const MAX_NEWS_RSS_RESULTS = 8;

export interface ParsedNewsRssItem extends SearchSourceItem {
  publishedMs: number;
}

export function decodeXmlEntities(str: string): string {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .trim();
}

export function formatNewsAgeLabel(publishedMs: number, nowMs = Date.now()): string {
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
    return 'News Source';
  }
}

export function cleanTopicForRssQuery(rawQuery: string, regionHint: 'BD' | 'GLOBAL'): string {
  const cleaned = (rawQuery || '')
    .replace(
      /\b(?:tell me|what is|what's|can you|please|give me|show me|latest|breaking|news|headlines|any updates?|updates?|today|right now|now|in the last \d+ minutes?|last \d+ minutes?|past \d+ minutes?)\b/gi,
      ' '
    )
    .replace(
      /(?:গত\s*[০-৯0-9]+\s*(?:মিনিট|মিনিটের|ঘণ্টা|ঘণ্টার)|সর্বশেষ|তাজা|ব্রেকিং|খবর|সংবাদ|নিউজ|হেডলাইন|আপডেট|আজকের|আজকে|এখনকার|এখন|বলো|দাও|দেখাও|কী|কি)/g,
      ' '
    )
    .replace(/[?!।,.;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length >= 2) {
    return cleaned;
  }
  return regionHint === 'BD' ? 'Bangladesh' : 'world news';
}

export function buildGoogleNewsRssUrl(
  topicQuery: string,
  isBengali: boolean,
  regionHint: 'BD' | 'GLOBAL' = isBengali ? 'BD' : 'GLOBAL'
): string {
  const cleanQ = (topicQuery || '').trim() || (regionHint === 'BD' ? 'Bangladesh' : 'world news');
  if (isBengali) {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQ)}&hl=bn&gl=BD&ceid=BD:bn`;
  }
  return `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQ)}&hl=en-US&gl=US&ceid=US:en`;
}

export function parseGoogleNewsRssXml(xml: string, nowMs = Date.now()): ParsedNewsRssItem[] {
  if (!xml || typeof xml !== 'string') return [];
  const items: ParsedNewsRssItem[] = [];
  const itemMatches = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];

  for (const block of itemMatches.slice(0, 24)) {
    const titleMatch = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
    const pubDateMatch = block.match(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i);
    const sourceMatch = block.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);

    let rawTitle = decodeXmlEntities(titleMatch?.[1] || '');
    const url = decodeXmlEntities(linkMatch?.[1] || '');
    const pubStr = decodeXmlEntities(pubDateMatch?.[1] || '');
    let sourceName = decodeXmlEntities(sourceMatch?.[1] || '');

    if (!rawTitle || !url || !/^https?:\/\//i.test(url)) continue;

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
      ageLabel: publishedMs > 0 ? formatNewsAgeLabel(publishedMs, nowMs) : undefined,
      isWithin20Min,
      publishedMs
    });
  }

  // Deduplicate and sort newest-first, capped at top 8
  const seen = new Set<string>();
  const deduped: ParsedNewsRssItem[] = [];
  items.sort((a, b) => (b.publishedMs || 0) - (a.publishedMs || 0));

  for (const item of items) {
    const key = `${item.sourceName.toLowerCase()}::${item.title.toLowerCase().slice(0, 60)}`;
    if (seen.has(item.url) || seen.has(key)) continue;
    seen.add(item.url);
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= MAX_NEWS_RSS_RESULTS) break;
  }

  return deduped;
}

export function buildStrictNewsRssSystemInstruction(
  items: SearchSourceItem[],
  isBengali: boolean
): string {
  const now = new Date();
  const formattedList = items
    .slice(0, MAX_NEWS_RSS_RESULTS)
    .map((item, idx) => {
      const timeInfo = item.publishedAt
        ? `${new Date(item.publishedAt).toUTCString()} (${item.ageLabel || 'recent'})`
        : item.ageLabel || 'Publish time not specified';
      return `[${idx + 1}] Title: ${item.title} | Source: ${item.sourceName} | Published: ${timeInfo} | Link: ${item.url}`;
    })
    .join('\n');

  return `\n\nGOOGLE NEWS RSS CONTEXT (TOP ${Math.min(items.length, MAX_NEWS_RSS_RESULTS)} LATEST HEADLINES):
Current Date & Time: ${now.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })} (UTC: ${now.toISOString()})

STRICT NEWS GROUNDING RULES:
- Write your answer using ONLY the ${Math.min(items.length, MAX_NEWS_RSS_RESULTS)} Google News RSS headlines provided below.
- Do NOT add facts, claims, dates, names, or headlines from outside these ${Math.min(items.length, MAX_NEWS_RSS_RESULTS)} results.
- ${isBengali ? 'Answer clearly in natural Bengali (বাংলা).' : 'Answer clearly in the user’s language.'}
- Include a concise Markdown heading, clean bullet points or a Markdown comparison/summary table where helpful, and mention the source name & publish time naturally.

RSS HEADLINES:
${formattedList}`;
}

export function buildNewsFeedErrorMessage(isBengali: boolean, detail?: string): string {
  const reason = detail ? ` (${detail})` : '';
  if (isBengali) {
    return `দুঃখিত, এই মুহূর্তে গুগল নিউজ RSS ফিড লোড করা যায়নি${reason}। অনুগ্রহ করে আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।`;
  }
  return `I could not load the Google News RSS feed right now${reason}. Please check your internet connection and try again.`;
}

