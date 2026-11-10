export interface DailyEventItem {
  id: string;
  title: string;
  category: 'National' | 'International' | 'Science & Tech' | 'Observance' | 'Culture';
  description: string;
  badgeColor: string;
  emoji: string;
}

export interface TodayHighlightData {
  fullDateString: string;
  dayOfWeek: string;
  bengaliDateString: string;
  bengaliDayString: string;
  bengaliFullDateString: string;
  events: DailyEventItem[];
  marqueeBengaliText: string;
}

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliDigits(n: number | string): string {
  return n
    .toString()
    .split('')
    .map(c => {
      const idx = parseInt(c, 10);
      return isNaN(idx) ? c : BENGALI_DIGITS[idx];
    })
    .join('');
}

const BENGALI_WEEKDAYS = [
  'রবিবার',
  'সোমবার',
  'মঙ্গলবার',
  'বুধবার',
  'বৃহস্পতিবার',
  'শুক্রবার',
  'শনিবার'
];

const GREGORIAN_MONTHS_BN = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর'
];

/**
 * Returns Bengali date string (বঙ্গাব্দ) for a given Gregorian date
 */
export function getBengaliDateString(d: Date): string {
  const month = d.getMonth(); // 0-11
  const day = d.getDate();
  const year = d.getFullYear();
  const bYear = year - 593; // Bengali era approximation

  let bMonthName = 'কার্তিক';
  let bDay = day + 15;

  if (month === 10) {
    // November
    if (day <= 15) {
      bMonthName = 'কার্তিক';
      bDay = day + 15;
    } else {
      bMonthName = 'অগ্রহায়ণ';
      bDay = day - 15;
    }
  } else if (month === 2) {
    // March
    bMonthName = 'ফাল্গুন';
    bDay = day + 15;
  } else if (month === 3) {
    // April
    if (day < 14) {
      bMonthName = 'চৈত্র';
      bDay = day + 17;
    } else {
      bMonthName = 'বৈশাখ';
      bDay = day - 13;
    }
  } else if (month === 11) {
    // December
    bMonthName = 'পৌষ';
    bDay = day;
  }

  return `${toBengaliDigits(bDay)} ${bMonthName} ${toBengaliDigits(bYear)} বঙ্গাব্দ`;
}

/**
 * Curated calendar of notable days, national observances, and global events in Bengali
 */
const CALENDAR_EVENTS_BN: Record<string, DailyEventItem[]> = {
  // November 10 (Current day)
  '11-10': [
    {
      id: 'nov-10-1',
      title: 'বিশ্ব শান্তি ও উন্নয়ন বিজ্ঞান দিবস',
      category: 'International',
      description: 'ইউনেস্কোর উদ্যোগে সমাজ ও মানবজাতির টেকসই উন্নয়নে বিজ্ঞানের ইতিবাচক ভূমিকা উদযাপনের দিন।',
      badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
      emoji: '🔬'
    },
    {
      id: 'nov-10-2',
      title: 'শহীদ নূর হোসেন দিবস (গণতন্ত্র মুক্তি দিবস)',
      category: 'National',
      description: '১৯৮৭ সালের ১০ নভেম্বর গণতন্ত্র পুনরুদ্ধারের সংগ্রামে আত্মাহুতি দেয়া বীর শহীদ নূর হোসেন স্মরণে।',
      badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
      emoji: '🇧🇩'
    },
    {
      id: 'nov-10-3',
      title: 'বিশ্ব টিকাদান ও সার্বজনীন স্বাস্থ্য দিবস',
      category: 'Observance',
      description: 'রোগ প্রতিরোধ ক্ষমতা বাড়ানো ও আধুনিক চিকিৎসা প্রযুক্তির সচেতনতা বৃদ্ধির আন্তর্জাতিক দিবস।',
      badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      emoji: '🌱'
    }
  ],
  // February 21
  '2-21': [
    {
      id: 'feb-21-1',
      title: 'মহান শহীদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস',
      category: 'National',
      description: '১৯৫২ সালের ভাষা আন্দোলনের অমর শহীদদের প্রতি শ্রদ্ধা ও ইউনেস্কো স্বীকৃত বৈশ্বিক মাতৃভাষা দিবস।',
      badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
      emoji: '🌺'
    }
  ],
  // March 26
  '3-26': [
    {
      id: 'mar-26-1',
      title: 'মহান স্বাধীনতা ও জাতীয় দিবস (বাংলাদেশ)',
      category: 'National',
      description: '১৯৭১ সালের এই দিনে বাংলাদেশের স্বাধীনতা ঘোষিত হয়। বীর মুক্তিযোদ্ধাদের অসীম ত্যাগের স্মারক।',
      badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      emoji: '🇧🇩'
    }
  ],
  // December 16
  '12-16': [
    {
      id: 'dec-16-1',
      title: 'মহান বিজয় দিবস (বাংলাদেশ)',
      category: 'National',
      description: 'নয় মাসের রক্তক্ষয়ী মুক্তিযুদ্ধের পর চূড়ান্ত বিজয়ের গৌরবোজ্জ্বল ঐতিহাসিক দিন।',
      badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      emoji: '🏆'
    }
  ],
  // April 14
  '4-14': [
    {
      id: 'apr-14-1',
      title: 'শুভ পহেলা বৈশাখ (বাংলা নববর্ষ)',
      category: 'Culture',
      description: 'বাঙালির প্রাণের উৎসব ও বাংলা সনের প্রথম দিন, মঙ্গল শোভাযাত্রা ও লোকজ ঐতিহ্যের মহাসমারোহ।',
      badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
      emoji: '🎭'
    }
  ],
  // May 1
  '5-1': [
    {
      id: 'may-1-1',
      title: 'মহান আন্তর্জাতিক মে দিবস (শ্রমিক অধিকার দিবস)',
      category: 'International',
      description: 'বিশ্বজুড়ে মেহনতী মানুষের অধিকার ও ঐতিহাসিক শ্রম আন্দোলনের স্মারক।',
      badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
      emoji: '⚙️'
    }
  ],
  // June 5
  '6-5': [
    {
      id: 'jun-5-1',
      title: 'বিশ্ব পরিবেশ দিবস',
      category: 'International',
      description: 'প্রকৃতি সংরক্ষণ, জীববৈচিত্র্য রক্ষা ও দূষণমুক্ত পৃথিবী গড়ার বৈশ্বিক অঙ্গীকার।',
      badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      emoji: '🌿'
    }
  ]
};

/**
 * Returns complete today highlight data and formatted Bengali Marquee ticker text
 */
export function getTodayHighlights(): TodayHighlightData {
  const now = new Date();
  const dayIndex = now.getDay();
  const bengaliDayString = BENGALI_WEEKDAYS[dayIndex] || 'মঙ্গলবার';

  const dayNum = now.getDate();
  const monthIndex = now.getMonth();
  const yearNum = now.getFullYear();

  const bengaliFullDateString = `${toBengaliDigits(dayNum)} ${GREGORIAN_MONTHS_BN[monthIndex]} ${toBengaliDigits(yearNum)}`;
  const bengaliDateString = getBengaliDateString(now);

  const fullDateString = now.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  const dateKey = `${monthIndex + 1}-${dayNum}`;
  let events = CALENDAR_EVENTS_BN[dateKey];

  if (!events || events.length === 0) {
    events = [
      {
        id: 'gen-1',
        title: 'আন্তর্জাতিক বিজ্ঞান, প্রযুক্তি ও উদ্ভাবন দিবস',
        category: 'Science & Tech',
        description: 'কৃত্রিম বুদ্ধিমত্তা, নিউরাল কম্পিউটিং ও মহাকাশ গবেষণার নতুন দিগন্ত উদযাপনের দিন।',
        badgeColor: 'bg-purple-100 text-purple-700 border-purple-200',
        emoji: '⚡'
      },
      {
        id: 'gen-2',
        title: 'ডিজিটাল বাংলাদেশ ও স্মার্ট রূপান্তর উদ্যোগ',
        category: 'National',
        description: 'দেশের তথ্যপ্রযুক্তি খাতের অভাবনীয় অগ্রগতি ও স্মার্ট নাগরিক সেবা সম্প্রসারণ।',
        badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        emoji: '🇧🇩'
      },
      {
        id: 'gen-3',
        title: 'আন্তর্জাতিক শান্তি, সৌহার্দ্য ও মানবিক সংহতি দিবস',
        category: 'International',
        description: 'বিশ্বব্যাপী সাংস্কৃতিক বিনিময়, সৌহার্দ্য এবং টেকসই উন্নয়নের বৈশ্বিক অঙ্গীকার।',
        badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
        emoji: '🌍'
      }
    ];
  }

  // Construct pure Bengali scrolling single-line marquee string
  const eventsTitles = events.map(e => `${e.emoji} ${e.title}`).join('  ✦  ');
  const marqueeBengaliText = `আজ ${bengaliDayString}, ${bengaliFullDateString} (${bengaliDateString})  ✦  আজকের বিশেষ দিবস ও ঐতিহাসিক ঘটনাবলী: ${eventsTitles}  ✦  জুজু এআই: আপনার সার্বক্ষণিক বাংলা ও ইংরেজি ভয়েস সহকারী`;

  return {
    fullDateString,
    dayOfWeek,
    bengaliDateString,
    bengaliDayString,
    bengaliFullDateString,
    events,
    marqueeBengaliText
  };
}
