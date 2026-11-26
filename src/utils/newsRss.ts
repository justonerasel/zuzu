import type { SearchSourceItem } from '../types/index.ts';

export const MAX_NEWS_RSS_RESULTS = 8;

export interface ParsedNewsRssItem extends SearchSourceItem {
  publishedMs: number;
}

export function decodeXmlEntities(str: string): string {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
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

export const SPORTS_CONTENT_REGEX =
  /\b(?:sport|sports|cricket|football|soccer|tennis|badminton|hockey|basketball|nba|ipl|bpl|psl|bbl|cpl|fifa|uefa|champions\s+league|premier\s+league|la\s+liga|world\s+cup|t20|odi|test\s+match|wicket|innings|batsman|bowler|striker|goalkeeper|tournament|olympics|match\s+score|live\s+score|espn|cricinfo|espncricinfo|cricbuzz|goal\.com|sportskeeda|t\s*sports|shakib|tamim|liton|mushfiq|messi|ronaldo|kohli|rohit|bumrah)\b|(?:খেলা|খেলাধুলা|ক্রিকেট|ফুটবল|টেনিস|ব্যাডমিন্টন|হকি|বিপিএল|আইপিএল|ফিফা|বিশ্বকাপ|ম্যাচ|স্কোর|গোল|উইকেট|টুর্নামেন্ট|অলিম্পিক|ব্যাটসম্যান|বোলার|সাকিব|তামিম|লিটন|মুশফিক|মেসি|রোনালদো|কোহলি)/i;

const EN_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'about', 'that', 'this', 'what', 'which', 'where',
  'when', 'who', 'whom', 'whose', 'how', 'why', 'are', 'was', 'were', 'been', 'have', 'has', 'had',
  'will', 'would', 'could', 'should', 'can', 'may', 'might', 'did', 'does', 'not', 'any', 'some',
  'all', 'more', 'most', 'only', 'just', 'very', 'now', 'today', 'yesterday', 'recent', 'latest',
  'breaking', 'news', 'headline', 'headlines', 'update', 'updates', 'report', 'reports', 'story',
  'stories', 'tell', 'give', 'show', 'please', 'happened', 'happening', 'around', 'current', 'events',
  'world', 'new', 'top', 'live'
]);

const BN_STOP_WORDS = new Set([
  'আজ', 'আজকের', 'আজকে', 'এখন', 'এখনকার', 'সর্বশেষ', 'সবশেষ', 'তাজা', 'ব্রেকিং', 'খবর', 'সংবাদ',
  'নিউজ', 'হেডলাইন', 'শিরোনাম', 'আপডেট', 'সাম্প্রতিক', 'ঘটনা', 'নতুন', 'বলো', 'বলেন', 'দাও', 'দিন',
  'দেখাও', 'জানাও', 'কী', 'কি', 'কেমন', 'কোথায়', 'কখন', 'কেন', 'সম্পর্কে', 'নিয়ে', 'নিয়ে', 'বিষয়ে',
  'বিষয়ে', 'এবং', 'আর', 'আরও', 'কোনো', 'কোন', 'থেকে', 'হয়েছে', 'হয়েছে', 'ঘটেছে', 'চলছে', 'হলো', 'হল',
  'এই', 'সেই', 'তার', 'তাদের', 'জন্য'
]);

function stripBengaliSuffix(word: string): string {
  const suffixes = ['গুলোর', 'গুলির', 'সমূহের', 'গুলো', 'গুলি', 'সমূহ', 'দের', 'য়ের', 'এর', 'তে', 'কে', 'য়ে', 'র', 'য়', 'ে'];
  for (const sfx of suffixes) {
    if (word.length > sfx.length + 2 && word.endsWith(sfx)) {
      return word.slice(0, -sfx.length);
    }
  }
  return word;
}

export interface ExtractedNewsTopic {
  query: string;
  hasSpecificTopic: boolean;
  keywords: string[];
}

export function extractNewsSearchTopic(
  rawQuery: string,
  regionHint: 'BD' | 'GLOBAL'
): ExtractedNewsTopic {
  const cleaned = (rawQuery || '')
    .replace(
      /\b(?:tell me|what is the|what's the|what is|what's|what are|what happened|can you|could you|please|give me|show me|any newer|any more|latest|breaking|news|top stories|headlines?|any updates?|updates?|today's|today|right now|at the moment|recently|recent|current events?|events?|in the last \d+ minutes?|last \d+ minutes?|past \d+ minutes?|in the last \d+ hours?|last \d+ hours?)\b/gi,
      ' '
    )
    .replace(
      /(?:গত\s*[০-৯0-9]+\s*(?:মিনিট|মিনিটের|ঘণ্টা|ঘণ্টার|ঘন্টা|ঘণ্টার)|সর্বশেষ|সবশেষ|তাজা|ব্রেকিং|খবর|সংবাদ|নিউজ|হেডলাইন|শিরোনাম|আপডেট|আজকের|আজকে|এখনকার|সাম্প্রতিক|সম্পর্কে|নিয়ে|নিয়ে|বিষয়ে|বিষয়ে|বলো|বলেন|দাও|দিন|দেখাও|জানাও|ঘটেছে|হয়েছে|হয়েছে|কী|কি|আরও)/g,
      ' '
    )
    .replace(/[?!।,.;:"'()[\]{}]+/g, ' ')
    .replace(/\b(?:on|about|from|regarding|in|of|for|the|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rawTokens = cleaned
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2);

  const keywords: string[] = [];
  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    const isBn = /[\u0980-\u09FF]/.test(token);
    if (isBn) {
      if (BN_STOP_WORDS.has(token)) continue;
      keywords.push(token);
      const stem = stripBengaliSuffix(token);
      if (stem !== token && stem.length >= 2 && !BN_STOP_WORDS.has(stem)) {
        keywords.push(stem);
      }
    } else {
      if (EN_STOP_WORDS.has(lower)) continue;
      keywords.push(lower);
    }
  }

  const dedupedKeywords = Array.from(new Set(keywords));
  const hasSpecificTopic = cleaned.length >= 2 && dedupedKeywords.length > 0;

  return {
    query: hasSpecificTopic ? cleaned : regionHint === 'BD' ? 'Bangladesh' : 'world news',
    hasSpecificTopic,
    keywords: dedupedKeywords
  };
}

export function cleanTopicForRssQuery(rawQuery: string, regionHint: 'BD' | 'GLOBAL'): string {
  return extractNewsSearchTopic(rawQuery, regionHint).query;
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatchesText(keyword: string, lowerTitle: string, rawTitle: string): boolean {
  if (/[\u0980-\u09FF]/.test(keyword)) {
    const stem = stripBengaliSuffix(keyword);
    return rawTitle.includes(keyword) || (stem.length >= 2 && rawTitle.includes(stem));
  }
  const kw = keyword.toLowerCase();
  if (kw.length <= 2) {
    return new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i').test(lowerTitle);
  }
  if (kw.length <= 4) {
    return new RegExp(`\\b${escapeRegExp(kw)}`, 'i').test(lowerTitle);
  }
  // Allow morphological variants (e.g., economy / economic / economies, iran / iranian, elect / election)
  const prefix = kw.slice(0, Math.max(4, Math.min(kw.length - 1, 6)));
  return lowerTitle.includes(kw) || new RegExp(`\\b${escapeRegExp(prefix)}`, 'i').test(lowerTitle);
}

export function filterAndScoreNewsRssItems<T extends SearchSourceItem>(
  items: T[],
  options: {
    keywords: string[];
    hasSpecificTopic: boolean;
    asksAboutSports: boolean;
  }
): { items: T[]; noMatchingNews: boolean } {
  const withoutUnwantedSports = options.asksAboutSports
    ? items
    : items.filter(
        item =>
          !SPORTS_CONTENT_REGEX.test(item.title || '') &&
          !SPORTS_CONTENT_REGEX.test(item.sourceName || '')
      );

  if (!options.hasSpecificTopic || options.keywords.length === 0) {
    return {
      items: withoutUnwantedSports.slice(0, MAX_NEWS_RSS_RESULTS),
      noMatchingNews: withoutUnwantedSports.length === 0
    };
  }

  const scored: Array<{ item: T; score: number }> = [];
  for (const item of withoutUnwantedSports) {
    const rawTitle = item.title || '';
    const lowerTitle = rawTitle.toLowerCase();
    let score = 0;
    for (const kw of options.keywords) {
      if (keywordMatchesText(kw, lowerTitle, rawTitle)) {
        score += 1;
      }
    }
    if (score > 0) {
      scored.push({ item, score });
    }
  }

  if (scored.length === 0) {
    return { items: [], noMatchingNews: true };
  }

  // Sort primarily by keyword match score while preserving newest-first tie-breaking
  scored.sort((a, b) => b.score - a.score);
  return {
    items: scored.slice(0, MAX_NEWS_RSS_RESULTS).map(s => s.item),
    noMatchingNews: false
  };
}

export function parseGoogleNewsRssXml(
  xml: string,
  nowMs = Date.now(),
  optionsOrSource?:
    | string
    | {
        defaultSourceName?: string;
        maxResults?: number;
        preserveFeedOrder?: boolean;
      }
): ParsedNewsRssItem[] {
  if (!xml || typeof xml !== 'string') return [];
  const opts =
    typeof optionsOrSource === 'string'
      ? { defaultSourceName: optionsOrSource }
      : optionsOrSource || {};
  const defaultSourceName = opts.defaultSourceName;
  const maxResults = typeof opts.maxResults === 'number' && opts.maxResults > 0 ? opts.maxResults : MAX_NEWS_RSS_RESULTS;
  const preserveFeedOrder = Boolean(opts.preserveFeedOrder);

  const items: ParsedNewsRssItem[] = [];
  const itemMatches = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];

  for (const block of itemMatches.slice(0, 36)) {
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
      sourceName = defaultSourceName || getHostnameLabel(url);
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

  // Deduplicate and cap results (preserving feed top-story order when requested, otherwise newest-first)
  const seen = new Set<string>();
  const deduped: ParsedNewsRssItem[] = [];
  if (!preserveFeedOrder) {
    items.sort((a, b) => (b.publishedMs || 0) - (a.publishedMs || 0));
  }

  for (const item of items) {
    const key = `${item.sourceName.toLowerCase()}::${item.title.toLowerCase().slice(0, 60)}`;
    if (seen.has(item.url) || seen.has(key)) continue;
    seen.add(item.url);
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= maxResults) break;
  }

  return deduped;
}

export function buildStrictNewsRssSystemInstruction(
  items: SearchSourceItem[],
  isBengali: boolean,
  asksAboutSports = false
): string {
  const now = new Date();
  const formattedList = items
    .slice(0, MAX_NEWS_RSS_RESULTS)
    .map((item, idx) => {
      const timeInfo = item.publishedAt
        ? `${new Date(item.publishedAt).toUTCString()} (${item.ageLabel || 'recent'})`
        : item.ageLabel || 'Publish time not specified';
      return `[${idx + 1}] Title: ${item.title} | Source: ${item.sourceName} | Published: ${timeInfo}`;
    })
    .join('\n');

  return `\n\nGOOGLE NEWS RSS CONTEXT (TOP ${Math.min(items.length, MAX_NEWS_RSS_RESULTS)} MATCHING HEADLINES):
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
- Write your answer using ONLY the ${Math.min(items.length, MAX_NEWS_RSS_RESULTS)} retrieved Google News RSS headlines below that directly match the user's requested topic.
- Do NOT add facts, claims, dates, names, or headlines from outside these retrieved results.
- ${isBengali ? 'Answer clearly in natural Bengali (বাংলা).' : 'Answer clearly in the user’s language.'}
- Mention the news channel or source name naturally inside the answer text (for example, "according to BBC Bangla" or "প্রথম আলো অনুযায়ী").
- Do NOT include URLs, hyperlinks, or a link list at the end of your reply.
${!asksAboutSports ? '- Do NOT mention or add any sports news.' : ''}
- If none of these headlines actually answer the user's specific topic, say honestly that no matching news was found.

RSS HEADLINES:
${formattedList}`;
}

export function buildNoMatchingNewsMessage(isBengali: boolean, topicQuery?: string): string {
  const cleanTopic = (topicQuery || '').trim();
  if (isBengali) {
    return cleanTopic
      ? `"${cleanTopic}" বিষয়ে সাম্প্রতিক কোনো মিল থাকা খবর পাওয়া যায়নি।`
      : 'আপনার উল্লেখিত বিষয়ে সাম্প্রতিক কোনো মিল থাকা খবর পাওয়া যায়নি।';
  }
  return cleanTopic
    ? `No matching recent news was found for "${cleanTopic}".`
    : 'No matching recent news was found for that topic.';
}

export function buildNewsFeedErrorMessage(isBengali: boolean, detail?: string): string {
  const reason = detail ? ` (${detail})` : '';
  if (isBengali) {
    return `দুঃখিত, এই মুহূর্তে গুগল নিউজ RSS ফিড লোড করা যায়নি${reason}। অনুগ্রহ করে আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।`;
  }
  return `I could not load the Google News RSS feed right now${reason}. Please check your internet connection and try again.`;
}

