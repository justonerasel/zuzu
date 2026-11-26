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
  asksAboutSports: boolean;
}

const CONVERSATIONAL_AND_NON_NEWS_EXCLUSIONS = [
  // Greetings & casual small talk (including phrases with "today" or "now")
  /^(?:hi|hello|hey|yo|sup|good morning|good afternoon|good evening|good night|assalamu ?alaikum|salam|nomoshkar|how are you(?: doing)?(?:\s+today|\s+now)?|how's it going|what's up|wassup|who are you|who made you|who created you|who is rasel|what is my name|what's my name|do you remember me|thank you|thanks|thx|ok|okay|cool|nice|great|bye|goodbye|see you)(?:[\s,!?.]+(?:zuzu|bro|friend|bhai|apu|sir|today|now))?[?!.\s]*$/i,
  // Casual Bengali greetings (note: "তোমার কী খবর" / "কী খবর" is casual greeting, NOT news!)
  /^(?:কেমন আছো|এখন কেমন আছো|তুমি কেমন আছো|তুমি কে|তোমাকে কে বানিয়েছে|তোমাকে কে বানিয়েছে|তোমাকে কে তৈরি করেছে|আমার নাম কি|আমার নাম কী|হ্যালো|হাই|সালাম|আসসালামু আলাইকুম|নমস্কার|ধন্যবাদ|ঠিক আছে|বাই|গুড নাইট|এখন কয়টা বাজে|এখন সময় কত|তোমার কী খবর|তোর কী খবর|আপনার কী খবর|তোমার কি খবর|তোর কি খবর|আপনার কি খবর|কী খবর|কি খবর)(?:[\s,!?.]+(?:জুজু|বন্ধু|ভাই|আপু|কেমন আছো))?[?!.\s]*$/i,
  // Jokes, stories, poems, advice, recipes, general chat unless explicitly asking for news
  /^(?:tell me a joke|make me laugh|tell me a story|sing a song|write a poem|give me advice|what should i do|how can i|help me with|একটা জোকস বলো|জোকস বলো|গল্প শোনাও|কবিতা লেখো|পরামর্শ দাও|উপদেশ দাও)\b/i
];

// Explicit news or very recent current-event request patterns ONLY
const EXPLICIT_NEWS_PATTERNS = [
  /\b(?:news|headlines?|breaking\s+news|top\s+stories|current\s+events?|news\s+update|daily\s+briefing)\b/i,
  /\bbreaking\b(?:\s+(?:news|updates?|reports?|headlines?|stories|now))?(?!\s+(?:down|bad|the|a|an|in|into|up|out|my|your|code|habits?|rules?|bones?|glass))/i,
  /\blatest\b(?!\s+(?:version|release|update\s+of|iphone|samsung|phone|laptop|model|movie|song|album|game|fashion|trend))/i,
  /\b(?:update|updates)\s+(?:on|about|from)\b/i,
  /\b(?:what(?:'s|\s+is|\s+are)\s+(?:the\s+)?(?:latest\s+(?:news|updates?|headlines?|on|about|in|happening)|news|headlines?|happening\s+(?:in|with|today|right now|around))|what(?:'s|\s+is)\s+the\s+latest\s*$|any\s+(?:latest\s+)?(?:news|updates?)|what\s+happened\s+(?:today|yesterday|recently|last\s+night|just\s+now|in\s+[a-z\u0980-\u09FF])|recent\s+(?:news|events?|developments?|incidents?))\b/i,
  // Real-world breaking event categories ONLY when paired with recency/news context (not definitions/history)
  /(?:\b(?:latest|today(?:'s)?|current|recent|live|ongoing|any|new)\b.{0,28}\b(?:earthquake|cyclone|flood|protest|election|war|ceasefire|airstrike|strike|attack|summit|verdict|scandal|crash|disaster)\b|\b(?:earthquake|cyclone|flood|protest|election|war|ceasefire|airstrike|strike|attack|summit|verdict|scandal)\b.{0,28}\b(?:today|now|right now|latest|update|updates|happening|happened|news|in\s+[A-Z][a-z]+)\b)/i,
  // Bengali explicit news & current events
  /(?:ব্রেকিং(?:\s*নিউজ)?|সংবাদ|নিউজ|হেডলাইন|শিরোনাম|সর্বশেষ|তাজা\s*(?:খবর|সংবাদ|আপডেট)|আজকের\s*(?:আপডেট|খবর|সংবাদ|নিউজ|হেডলাইন|ঘটনা)|এখনকার\s*(?:খবর|আপডেট|সংবাদ|অবস্থা)|সাম্প্রতিক\s*(?:খবর|সংবাদ|ঘটনা|পরিস্থিতি|আপডেট)|নতুন\s*(?:খবর|সংবাদ|আপডেট)|(?:কী|কি)\s*(?:ঘটেছে|ঘটল|হয়েছে|হয়েছে)\s*(?:আজ|আজকে|এখন|ওখানে|সেখানে|দেশে|বিশ্বে)?)/i,
  // Bengali "খবর" when combined with a topic or news verb (e.g. "বাংলাদেশের খবর", "ইরানের খবর", "খবর বলো", "খবর দাও")
  /(?:[০-৯\u0980-\u09FFa-zA-Z]{2,}\s*(?:এর|র)?\s*খবর|খবর\s*(?:বলো|বলেন|দাও|দিন|দেখাও|জানাও|কী|কি|নিয়ে|নিয়ে|সম্পর্কে))/i
];

// Explicit non-news real-time lookup patterns (weather, live score, live currency/gold prices, current officeholders)
const GENERAL_WEB_SEARCH_PATTERNS = [
  /\b(?:google\s+search|search\s+google|search\s+online|search\s+the\s+web|look\s+up\s+online|internet\s+search)\b/i,
  /\b(?:live\s+score|match\s+score\s+today|cricket\s+score|football\s+score|weather\s+(?:today|forecast|in\s+[a-z])|temperature\s+in\s+[a-z]|gold\s+price\s+today|silver\s+price\s+today|dollar\s+rate\s+today|usd\s+to\s+bdt|bitcoin\s+price\s+(?:today|now)|share\s+market\s+today)\b/i,
  /\bwho\s+is\s+(?:the\s+)?current\s+(?:president|prime\s+minister|chief\s+adviser|ceo|pm|king|chancellor)\b/i,
  /(?:গুগল(?:ে)?\s*(?:সার্চ|খুঁজে|দেখো)|অনলাইনে দেখো|ইন্টারনেটে দেখো|বর্তমান প্রধানমন্ত্রী|বর্তমান রাষ্ট্রপতি|বর্তমান প্রধান উপদেষ্টা|আজকের আবহাওয়া|আজকের আবহাওয়া|ডলারের দাম কত|সোনার দাম কত|লাইভ স্কোর)/i
];

const NEWS_FOLLOW_UP_PATTERNS = [
  /^(?:any\s+newer\s+(?:news|update)|any\s+more\s+(?:news|updates?)|anything\s+newer|more\s+news|latest\s+update)\b/i,
  /^(?:আরও\s*(?:খবর|আপডেট)|নতুন\s*কোনো\s*(?:খবর|আপডেট)|আর\s*কোনো\s*খবর|এখন\s*(?:কী|কি)\s*অবস্থা)/i
];

const SPORTS_INTENT_PATTERNS = [
  /\b(?:sport|sports|cricket|football|soccer|tennis|badminton|hockey|basketball|nba|ipl|bpl|psl|bbl|cpl|fifa|uefa|champions\s+league|premier\s+league|la\s+liga|world\s+cup|t20|odi|test\s+match|wicket|innings|goal|tournament|olympics|match\s+score|live\s+score|shakib|sakib|tamim|liton|messi|ronaldo|kohli|virat)\b/i,
  /(?:খেলা|খেলাধুলা|ক্রিকেট|ফুটবল|টেনিস|ব্যাডমিন্টন|হকি|বিপিএল|আইপিএল|ফিফা|বিশ্বকাপ|ম্যাচ|স্কোর|গোল|উইকেট|টুর্নামেন্ট|অলিম্পিক|সাকিব|তামিম|লিটন|মেসি|রোনালদো|কোহলি)/i
];

const NON_NEWS_EDUCATIONAL_OR_ADVICE_PATTERNS = [
  /\b(?:what\s+is\s+(?:a|an|the)\s+(?:meaning|definition)\s+of|define\s+|explain\s+|how\s+to\s+|write\s+(?:a|an|some|the)?\s*code|fix\s+(?:my|the|this)?\s*code|debug\s+|study\s+plan|workout\s+plan|diet\s+plan|meal\s+plan|travel\s+plan|itinerary|budget\s+plan|recipe\s+for|essay\s+on|paragraph\s+on|translate\s+|summarize\s+this)\b/i
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
  const asksAboutSports = SPORTS_INTENT_PATTERNS.some(rx => rx.test(query));

  if (!query || query.length < 3) {
    return {
      needsSearch: false,
      isNewsQuery: false,
      isBengali,
      regionHint: 'GLOBAL',
      timeWindowMinutes: null,
      searchQuery: query,
      asksAboutSports
    };
  }

  const hasExplicitNewsWord = /\b(?:news|headlines?|breaking\s+news)\b|(?:তাজা\s*খবর|ব্রেকিং\s*নিউজ|সংবাদ|নিউজ|হেডলাইন|সর্বশেষ|আজকের\s*(?:আপডেট|খবর|সংবাদ))/i.test(query);

  if (!hasExplicitNewsWord && CONVERSATIONAL_AND_NON_NEWS_EXCLUSIONS.some(rx => rx.test(query))) {
    return {
      needsSearch: false,
      isNewsQuery: false,
      isBengali,
      regionHint: BANGLADESH_PATTERNS.some(rx => rx.test(query)) || isBengali ? 'BD' : 'GLOBAL',
      timeWindowMinutes: null,
      searchQuery: query,
      asksAboutSports
    };
  }

  const isEducationalOrCoding =
    !hasExplicitNewsWord && NON_NEWS_EDUCATIONAL_OR_ADVICE_PATTERNS.some(rx => rx.test(query));

  const isNewsDirect = !isEducationalOrCoding && EXPLICIT_NEWS_PATTERNS.some(rx => rx.test(query));
  const isGeneralSearchDirect = !isEducationalOrCoding && GENERAL_WEB_SEARCH_PATTERNS.some(rx => rx.test(query));

  // Preserve news context ONLY when the previous assistant turn actually fetched realtime news
  const lastAssistantMsg = [...recentMessages]
    .reverse()
    .find(m => m?.sender === 'assistant' || m?.sender === 'model');
  const prevTurnUsedSearch = Boolean(lastAssistantMsg?.usedRealtimeSearch);

  const isFollowUp = prevTurnUsedSearch && NEWS_FOLLOW_UP_PATTERNS.some(rx => rx.test(query));
  const needsSearch = isNewsDirect || isGeneralSearchDirect || isFollowUp;

  let searchQuery = query;
  let combinedSports = asksAboutSports;
  if (isFollowUp && query.length < 55) {
    const lastUserTopic = [...recentMessages]
      .reverse()
      .find(m => m?.sender === 'user' && m?.text && m.text.trim() !== query && m.text.trim().length > 6)?.text;
    if (lastUserTopic) {
      searchQuery = `${lastUserTopic.trim()} ${query}`;
      combinedSports = combinedSports || SPORTS_INTENT_PATTERNS.some(rx => rx.test(lastUserTopic));
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
    searchQuery,
    asksAboutSports: combinedSports
  };
}
