/**
 * Deterministic real-time Google Search & breaking-news intent classifier.
 * Shared across Express backend (server.ts) and frontend client (apiConfig.ts).
 * Distinguishes normal conversational turns from queries needing live Google Internet Search
 * across both English and Bengali (বাংলা).
 */

export interface RealtimeSearchClassification {
  needsSearch: boolean;
  isNewsQuery: boolean;
  isBengali: boolean;
  regionHint: 'BD' | 'GLOBAL';
  timeWindowMinutes: number | null;
  searchQuery: string;
}

const CONVERSATIONAL_EXCLUSIONS = [
  /^(?:hi|hello|hey|good morning|good afternoon|good evening|good night|assalamu alaikum|salam|nomoshkar|how are you|how are you doing|how are you now|who are you|who made you|who created you|who is rasel|what is my name|what's my name|do you remember me|thank you|thanks|ok|okay|bye|goodbye|tell me a joke|tell me a story|sing a song|write a poem|what time is it(?: now)?|what is the time(?: now)?)\b[?!.\s]*$/i,
  /^(?:কেমন আছো|এখন কেমন আছো|তুমি কে|তোমাকে কে বানিয়েছে|তোমাকে কে বানিয়েছে|তোমাকে কে তৈরি করেছে|আমার নাম কি|আমার নাম কী|হ্যালো|হাই|ধন্যবাদ|ঠিক আছে|একটা জোকস বলো|গল্প শোনাও|কবিতা লেখো|বাই|গুড নাইট|এখন কয়টা বাজে|এখন সময় কত)[?!.\s]*$/i
];

const NEWS_AND_RECENCY_PATTERNS = [
  /\b(?:news|headlines|breaking|latest|update|updates|recent|happening|happened|development|developments)\b/i,
  /\b(?:today|today's|right now|at the moment|this hour|this morning|tonight|yesterday's|last \d+\s*(?:min|mins|minute|minutes|hour|hours|hr|hrs)|past \d+\s*(?:min|mins|minute|minutes|hour|hours)|minutes? ago|hours? ago)\b/i,
  /\bnow\b(?:\s+(?:in|on|at|for|about|weather|price|rate|score|match|news|update|happening)|\s*$)/i,
  /\b(?:earthquake|cyclone|flood|protest|election|match score|live score|cricket score|football score|gold price|silver price|dollar rate|exchange rate|usd to bdt|stock price|share market|bitcoin price|crypto price|weather forecast|temperature in|war|ceasefire|summit|verdict|scandal|incident)\b/i,
  /(?:ব্রেকিং|খবর|সংবাদ|নিউজ|হেডলাইন|সর্বশেষ|আজকের|আজকে|এখনকার|সাম্প্রতিক|আপডেট|তাজা|কী ঘটেছে|কি ঘটেছে|কী হচ্ছে|কি হচ্ছে|কী হলো|কি হলো|গত\s*[০-৯0-9]+\s*(?:মিনিট|ঘণ্টা|ঘন্টা)|ক্রিকেট|ফুটবল|লাইভ স্কোর|আবহাওয়া|আবহাওয়া|ডলারের দাম|ডলার রেট|সোনার দাম|শেয়ার বাজার|ভূমিকম্প|ঘূর্ণিঝড়|ঘূর্ণিঝড়|নির্বাচন)/i
];

const GENERAL_WEB_SEARCH_PATTERNS = [
  /\b(?:google search|search google|search online|search the web|look up|check online|find online|internet search|live status|latest version|release date|schedule today|open today|price in bangladesh|price today|stock market)\b/i,
  /\b(?:who is the current|who is now|current president|current prime minister|current chief adviser|current ceo|who won|latest winner|new law|new policy|recent announcement)\b/i,
  /\b(?:2025|2026|2027)\b.*\b(?:news|event|happened|update|winner|score|champion|price|launch|released|announced|war|summit|match|election)\b/i,
  /(?:গুগল(?:ে)?\s*(?:সার্চ|খুঁজে|দেখো)|অনলাইনে দেখো|ইন্টারনেটে দেখো|সার্চ করে বলো|খুঁজে বলো|বর্তমান প্রধানমন্ত্রী|বর্তমান রাষ্ট্রপতি|বর্তমান প্রধান উপদেষ্টা|সর্বশেষ ভার্সন|কবে মুক্তি|এখন দাম কত|কে জিতল|কোন দল জিতল|আজকের দাম)/i
];

const FOLLOW_UP_PATTERNS = [
  /^(?:any newer|any more|anything newer|tell me more|more details|elaborate|what about|who was|when did it|where did it|source|sources|links?|original link|are there more|update me more|latest one)\b/i,
  /^(?:আরও বলো|আরও বিস্তারিত|নতুন কোনো আপডেট|আর কোনো খবর|লিংক দাও|সূত্র কী|সোর্স দাও|এখন কি অবস্থা|তারপর কী হলো)/i
];

const BANGLADESH_PATTERNS = [
  /\b(?:bangladesh|dhaka|chattogram|chittagong|sylhet|rajshahi|khulna|barishal|rangpur|mymensingh|bd|bdt|taka)\b/i,
  /(?:বাংলাদেশ|ঢাকা|চট্টগ্রাম|সিলেট|রাজশাহী|খুলনা|বরিশাল|রংপুর|ময়মনসিংহ|ময়মনসিংহ)/i
];

function extractTimeWindowMinutes(text: string): number | null {
  const bnToEn = text.replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
  const minMatch = bnToEn.match(/(?:last|past|within|গত)?\s*(\d+)\s*(?:min|mins|minute|minutes|মিনিট)/i);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    if (!Number.isNaN(mins) && mins > 0) return mins;
  }
  const hourMatch = bnToEn.match(/(?:last|past|within|গত)?\s*(\d+)\s*(?:hr|hrs|hour|hours|ঘণ্টা|ঘন্টা)/i);
  if (hourMatch) {
    const hrs = parseInt(hourMatch[1], 10);
    if (!Number.isNaN(hrs) && hrs > 0) return hrs * 60;
  }
  if (/\b(?:right now|just now|breaking)\b|এখনই|তাজা|ব্রেকিং/i.test(text)) {
    return 60;
  }
  if (/\btoday\b|আজকের|আজকে/i.test(text)) {
    return 1440;
  }
  return null;
}

export function classifyRealtimeSearchIntent(
  rawQuery: string,
  recentMessages: Array<{ sender?: string; text?: string; usedRealtimeSearch?: boolean }> = []
): RealtimeSearchClassification {
  const query = (rawQuery || '').trim();
  const isBengali = /[\u0980-\u09FF]/.test(query);

  if (!query || query.length < 3) {
    return {
      needsSearch: false,
      isNewsQuery: false,
      isBengali,
      regionHint: 'GLOBAL',
      timeWindowMinutes: null,
      searchQuery: query
    };
  }

  if (CONVERSATIONAL_EXCLUSIONS.some(rx => rx.test(query))) {
    return {
      needsSearch: false,
      isNewsQuery: false,
      isBengali,
      regionHint: BANGLADESH_PATTERNS.some(rx => rx.test(query)) || isBengali ? 'BD' : 'GLOBAL',
      timeWindowMinutes: null,
      searchQuery: query
    };
  }

  // Avoid triggering news search on coding/plan prompts containing "update my code" or "today's plan"
  const isPlanningOrCodingPrompt =
    /\b(?:write code|fix code|update code|update the code|update my|study plan|workout plan|diet plan|meal plan|travel plan|itinerary|budget plan)\b/i.test(
      query
    ) && !/\b(?:news|headlines|breaking|rss|article)\b/i.test(query);

  const isNewsDirect = !isPlanningOrCodingPrompt && NEWS_AND_RECENCY_PATTERNS.some(rx => rx.test(query));
  const isGeneralSearchDirect = !isPlanningOrCodingPrompt && GENERAL_WEB_SEARCH_PATTERNS.some(rx => rx.test(query));

  // Preserve search context on follow-up questions if recent turn used news/search
  const prevTurnUsedSearch = recentMessages
    .slice(-4)
    .some(
      m =>
        m?.usedRealtimeSearch ||
        (typeof m?.text === 'string' &&
          (NEWS_AND_RECENCY_PATTERNS.some(rx => rx.test(m.text!)) ||
            /https?:\/\//i.test(m.text)))
    );

  const isFollowUp = prevTurnUsedSearch && FOLLOW_UP_PATTERNS.some(rx => rx.test(query));
  const needsSearch = isNewsDirect || isGeneralSearchDirect || isFollowUp;

  // Build contextual search query if this is a short follow-up
  let searchQuery = query;
  if (isFollowUp && query.length < 55) {
    const lastUserTopic = [...recentMessages]
      .reverse()
      .find(m => m?.sender === 'user' && m?.text && m.text.trim() !== query && m.text.trim().length > 6)?.text;
    if (lastUserTopic) {
      searchQuery = `${lastUserTopic.trim()} ${query}`;
    }
  }

  const regionHint: 'BD' | 'GLOBAL' =
    BANGLADESH_PATTERNS.some(rx => rx.test(searchQuery)) || isBengali ? 'BD' : 'GLOBAL';

  return {
    needsSearch,
    isNewsQuery: isNewsDirect || isFollowUp,
    isBengali,
    regionHint,
    timeWindowMinutes: extractTimeWindowMinutes(query),
    searchQuery
  };
}
