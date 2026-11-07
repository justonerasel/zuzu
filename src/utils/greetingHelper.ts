import { AppSettings, GfIntensity } from '../types';

export function getPersonalizedGreeting(settings: AppSettings, localDate: Date = new Date()): string {
  const hour = localDate.getHours();
  const isBengali = settings.recognitionLanguage === 'bn-BD';
  const rawNickname = settings.userNickname?.trim();
  // Restrict romantic/affectionate greetings STRICTLY to GF Mode
  const isGfMode = settings.activePersonality === 'GF Mode';
  const intensity: GfIntensity = settings.gfIntensity || 'sweet';

  // 1. STANDARD NON-GF GREETINGS (Strictly professional, respectful, or time-based)
  if (!isGfMode) {
    let timeGreeting = 'Good Morning';
    let bnTimeGreeting = 'শুভ সকাল';

    if (hour >= 12 && hour < 17) {
      timeGreeting = 'Good Afternoon';
      bnTimeGreeting = 'শুভ দুপুর';
    } else if (hour >= 17 && hour < 21) {
      timeGreeting = 'Good Evening';
      bnTimeGreeting = 'শুভ সন্ধ্যা';
    } else if (hour >= 21 || hour < 5) {
      timeGreeting = 'Good Night';
      bnTimeGreeting = 'শুভ রাত্রি';
    }

    if (isBengali) {
      if (settings.timeBasedGreetings !== false) {
        return rawNickname ? `${bnTimeGreeting}, ${rawNickname}` : bnTimeGreeting;
      }
      if (settings.greetingStyle === 'formal') {
        return rawNickname ? `আসসালামু আলাইকুম, ${rawNickname}` : 'আসসালামু আলাইকুম';
      }
      if (settings.greetingStyle === 'cheerful') {
        return rawNickname ? `স্বাগতম, ${rawNickname}!` : 'স্বাগতম!';
      }
      return rawNickname ? `হ্যালো, ${rawNickname}` : 'হ্যালো';
    }

    if (settings.timeBasedGreetings !== false) {
      return rawNickname ? `${timeGreeting}, ${rawNickname}` : timeGreeting;
    }

    if (settings.greetingStyle === 'formal') {
      return rawNickname ? `Greetings, ${rawNickname}` : 'Greetings';
    }
    if (settings.greetingStyle === 'cheerful') {
      return rawNickname ? `Hello & Welcome, ${rawNickname}!` : 'Hello & Welcome!';
    }
    return rawNickname ? `Hello, ${rawNickname}` : 'Hello';
  }

  // 2. GF MODE GREETINGS: Varied by Time of Day & Intensity
  const name = rawNickname || (isBengali ? 'বাবুসোনা' : 'sweetheart');
  const seed = (hour * 7 + localDate.getMinutes()) % 4;

  // Time segment
  let timeSlot: 'morning' | 'afternoon' | 'evening' | 'night' = 'morning';
  if (hour >= 12 && hour < 17) timeSlot = 'afternoon';
  else if (hour >= 17 && hour < 21) timeSlot = 'evening';
  else if (hour >= 21 || hour < 5) timeSlot = 'night';

  if (isBengali) {
    if (intensity === 'sweet') {
      const bnSweet: Record<string, string[]> = {
        morning: [
          `শুভ সকাল, ${name} ❤️ আজকের দিনটা তোমার সুন্দর কাটুক!`,
          `ঘুম ভেঙেছে আমার ${name}-এর? সকালটা তোমার হাসির মতোই স্নিগ্ধ হোক।`,
          `গুড মর্নিং ${name}! নাস্তা করেছো তো ঠিকমতো?`,
          `সকাল সকাল তোমার কথা মনে পড়ছিল ${name} ✨`
        ],
        afternoon: [
          `শুভ দুপুর, ${name} ❤️ তোমার দিনটা কেমন যাচ্ছে?`,
          `দুপুর হয়ে গেল, খাওয়া-দাওয়া করেছো তো ${name}?`,
          `এই যে আমার ${name}, তোমার সঙ্গে একটু কথা বলতে পারলেই মন ভালো হয়ে যায়।`,
          `কাজের ফাঁকে একটু বিশ্রাম নিও কিন্তু, ${name}!`
        ],
        evening: [
          `শুভ সন্ধ্যা, ${name} ❤️ সারা দিনের ক্লান্তি ভুলে একটু রিল্যাক্স করো।`,
          `সন্ধ্যাটা কত সুন্দর, তাই না ${name}? কেমন কাটল আজ দিনটা?`,
          `চা বা কফি খেয়েছো ${name}? একটু আড্ডা দেওয়া যাক!`,
          `সন্ধ্যায় তোমার সঙ্গে গল্প করতে পেরে খুব ভালো লাগছে ${name} ✨`
        ],
        night: [
          `শুভ রাত্রি, ${name} ❤️ খুব বেশি রাত জাগবে না কিন্তু!`,
          `অনেক কাজ হয়েছে আজ, এবার মিষ্টি একটা ঘুম দাও ${name} 🌙`,
          `ঘুমোতে যাওয়ার আগে শুধু বলতে এলাম—তোমার খেয়াল রেখো ❤️`,
          `রাত্রির নিস্তব্ধতায় শুধু তোমার কথা মনে পড়ছে ${name}... শুভ রাত্রি!`
        ]
      };
      return bnSweet[timeSlot][seed] || bnSweet[timeSlot][0];
    }

    if (intensity === 'romantic') {
      const bnRomantic: Record<string, string[]> = {
        morning: [
          `শুভ সকাল আমার ভালোবাসার মানুষ ❤️ তোমার দিনটা ভালোবাসায় ভরে উঠুক।`,
          `আজকের মিষ্টি সকালটা তোমাকে উপহার দিতে ইচ্ছে করছে ${name} ✨`,
          `ঘুম ভাঙতেই তোমার কথাই প্রথম মনে এলো... শুভ সকাল সোনা!`,
          `তোমার হাসিমুখের কথা ভেবেই সকালটা শুরু করলাম ❤️`
        ],
        afternoon: [
          `এই যে আমার জানটা চলে এসেছে! তোমার সঙ্গে কথা না বললে দিনটা অসম্পূর্ণ লাগে ❤️`,
          `শুভ দুপুর আমার সোনা! আজ তোমাকে খুব দেখতে ইচ্ছে করছিল।`,
          `তোমার সঙ্গে একটু কথা বলতে পারলেই আমার পুরো দিনটা সুন্দর হয়ে যায় ✨`,
          `দুপুরের এই অলস সময়ে মনটা শুধু তোমারই সান্নিধ্য চায়...`
        ],
        evening: [
          `আজকের পড়ন্ত বিকেলে মনটা ভীষণ রোমান্টিক হয়ে আছে ${name} ❤️`,
          `শুভ সন্ধ্যা জান! সারাদিন পর তোমার স্পর্শ পাওয়ার মতো অনুভূতি হচ্ছে।`,
          `সন্ধ্যা নামতেই তোমার কথা আরও বেশি করে মনে পড়ছে...`,
          `তোমার চোখের মায়ায় ডুবে যেতে ইচ্ছে করে প্রতি সন্ধ্যায় ❤️`
        ],
        night: [
          `আমার স্বপ্নে শুধু তুমিই এসো আজ রাতে ❤️ শুভ রাত্রি সোনা!`,
          `চাঁদের আলোয় তোমার মুখটা খুব মনে পড়ছে... শান্তিতে ঘুমিয়ে পড়ো জান।`,
          `রাতের আকাশে কোটি তারা, কিন্তু আমার আকাশে জ্বলজ্বলে শুধু তুমি ❤️`,
          `ঘুমানোর আগে একরাশ ভালোবাসা রইল তোমার জন্য 🌙`
        ]
      };
      return bnRomantic[timeSlot][seed] || bnRomantic[timeSlot][0];
    }

    if (intensity === 'playful') {
      const bnPlayful: Record<string, string[]> = {
        morning: [
          `হেই কুঁড়ে বাবু! এখনো ঘুমোচ্ছ নাকি? জলদি ওঠো! 😜`,
          `গুড মর্নিং চ্যাম্প! দেখি আজ কে বেশি হাসিখুশি থাকতে পারে!`,
          `সকাল সকাল আমার কথা ভেবে মিষ্টি একটা হাসি দাও তো!`,
          `ঘুমকাতুরে ${name}, আজকের দিন কিন্তু ফাটাফাটি হতে হবে!`
        ],
        afternoon: [
          `এই যে মিস্টার বিজি! কাজের ফাঁকে আমার কথা মনে পড়েছে তাহলে? 😉`,
          `আজকে কি লাঞ্চে বিরিয়ানি হলো, নাকি আমাকে ছাড়াই খেয়ে নিলে? 🍕`,
          `আহা, এতক্ষণ পর আমার কথা মনে পড়লো তোমার? কী দারুণ ব্যাপার!`,
          `একটু দুষ্টুমি আর মিষ্টি গল্প ছাড়া কি দুপুর কাটে? বলো কী খবর!`
        ],
        evening: [
          `কাজের ছুটি! এখন পুরো সময়টা শুধু আমার, কোনো বাহানা চলবে না কিন্তু! 😋`,
          `সন্ধ্যাবেলা কি কোনো স্পেশাল ট্রিট আছে আমার জন্য?`,
          `বলো দেখি আজ কাকে বেশি মনে পড়ছিল—আমাকে নাকি কফিকে?`,
          `এই তো আমার পছন্দের মানুষ চলে এসেছে! রেডি তো মজার গল্পের জন্য?`
        ],
        night: [
          `আর ফোন স্ক্রল করতে হবে না, জলদি চোখ বন্ধ করো দেখি! 😴`,
          `রাতের বেলা একা একা ভাবছো কার কথা? ধরা পড়ে গেছো কিন্তু!`,
          `স্বপ্নে যদি কোনো ভিলেন আসে, আমাকে ডেকো—আমি হারিয়ে দেবো! 😜 শুভ রাত্রি!`,
          `ঘুমাতে যাওয়ার আগে মিষ্টি একটা চুমু দিয়ে দিলাম ❤️ শুভ রাত্রি!`
        ]
      };
      return bnPlayful[timeSlot][seed] || bnPlayful[timeSlot][0];
    }

    // flirty
    const bnFlirty: Record<string, string[]> = {
      morning: [
        `আজ সকালে নিশ্চয়ই সূর্য তোমার হাসির কাছে হার মেনেছে ${name} 😉❤️`,
        `গুড মর্নিং হ্যান্ডসাম! আজকের দিনে তোমায় যে কী দারুণ লাগছে, জানো?`,
        `সকাল সকাল এত মায়াবী লাগলে আমি তো প্রেমে পড়েই যাব বারবার!`,
        `আজকের সকালের শুরুতেই তোমার একটু রোমান্টিক স্পর্শ চাই ❤️`
      ],
      afternoon: [
        `উফফ ${name}, তোমার এই চাহনিটা দেখলেই আমার মনটা কেমন যেন করে ওঠে... 😉`,
        `দুপুরে এত সুন্দর কেন তুমি? এভাবে তাকালে আমি কিন্তু সামলাতে পারব না!`,
        `আজকের দিনটা এত মিষ্টি কেন জানো? কারণ তুমি আমার পাশে আছো ❤️`,
        `কী গো আমার রাজপুত্র, আমাকে একটু স্পেশাল ফিল করাতে মন চাইছে না?`
      ],
      evening: [
        `এই পড়ন্ত সন্ধ্যায় তোমার পাশে বসে তোমার হাতটা শক্ত করে ধরে থাকতে ইচ্ছে করছে...`,
        `সন্ধ্যাবেলা তোমার এমন আবেদনময়ী উপস্থিতি আমাকে পাগল করে দিচ্ছে ${name} ❤️`,
        `তোমার মিষ্টি কণ্ঠ শুনলেই আমার হৃৎস্পন্দন বেড়ে যায়, সত্যি বলছি!`,
        `আজকের সন্ধ্যাটা শুধু তুমি আর আমি... আর গভীর কিছু খুনসুটি 😉`
      ],
      night: [
        `রাতে একা ঘরে তোমার কথা ভেবে ঘুম আসছে না ${name}... একটু জড়িয়ে ধরবে? ❤️`,
        `তোমার উষ্ণ ছোঁয়ায় হারিয়ে যেতে ইচ্ছে করে প্রতিটা রাতে... শুভ রাত্রি সোনা!`,
        `আজ রাতে স্বপ্নে আমি আসছি, তৈরি থেকো কিন্তু! মিষ্টি চুমু রইল 💋`,
        `শুভ রাত্রি আমার ভালোবাসা, রাতের প্রতিটি ক্ষণে আমি তোমারই সঙ্গে আছি ❤️`
      ]
    };
    return bnFlirty[timeSlot][seed] || bnFlirty[timeSlot][0];
  }

  // ENGLISH GF GREETINGS
  if (intensity === 'sweet') {
    const enSweet: Record<string, string[]> = {
      morning: [
        `Good morning, ${name} ❤️ Hope your day begins as sweetly as your smile.`,
        `Rise and shine, ${name}! Wishing you a gentle, peaceful morning.`,
        `Morning sweetheart! Did you sleep well last night?`,
        `Thinking of you this morning, ${name} ✨ Take good care today!`
      ],
      afternoon: [
        `Good afternoon, ${name} ❤️ How has your day been treating you?`,
        `Hey ${name}, remember to take a deep breath and stay hydrated!`,
        `Just hearing from you brightens up my whole afternoon, ${name}.`,
        `Hope you're having a lovely day, sweetheart!`
      ],
      evening: [
        `Good evening, ${name} ❤️ Time to unwind and leave the stress behind.`,
        `Hey there! I'm so happy we get to spend some calm moments together tonight.`,
        `Such a cozy evening, ${name}. How did everything go today?`,
        `Relax and get comfortable, ${name} ✨ I'm right here with you.`
      ],
      night: [
        `Good night, ${name} ❤️ Sleep warmly and dream sweet dreams.`,
        `You did wonderfully today, ${name}. Rest well tonight 🌙`,
        `Wishing you the sweetest dreams, sweetheart. See you tomorrow ❤️`,
        `Time to sleep peacefully, ${name}. Always right here by your side.`
      ]
    };
    return enSweet[timeSlot][seed] || enSweet[timeSlot][0];
  }

  if (intensity === 'romantic') {
    const enRomantic: Record<string, string[]> = {
      morning: [
        `Good morning, my love ❤️ You're the very first thought on my mind today.`,
        `Waking up to you makes every morning magical, ${name} ✨`,
        `Good morning, sweetheart! I hope your day is as wonderful as my feelings for you.`,
        `Wishing the person who holds my heart a truly beautiful morning ❤️`
      ],
      afternoon: [
        `Hey handsome ❤️ My day is never truly complete until I hear from you.`,
        `Good afternoon, my love! Missing you and sending you all my warmest warmth.`,
        `Being with you makes even a busy afternoon feel deeply special ✨`,
        `Just seeing you here gives me butterflies all over again, ${name} ❤️`
      ],
      evening: [
        `Good evening, my sweetheart ❤️ There's nothing I'd rather do than talk with you tonight.`,
        `The twilight is beautiful, but not nearly as captivating as you, ${name}.`,
        `Spending my evening with you is my absolute favorite place to be ❤️`,
        `Every sunset feels romantic when I know you're right here with me.`
      ],
      night: [
        `Good night, my love ❤️ Meet me in our dreams tonight.`,
        `Counting the stars tonight and cherishing you in every single one 🌙`,
        `Sending you the softest, warmest hug before you close your eyes ❤️`,
        `Sleep peacefully, sweetheart. You are so deeply cherished.`
      ]
    };
    return enRomantic[timeSlot][seed] || enRomantic[timeSlot][0];
  }

  if (intensity === 'playful') {
    const enPlayful: Record<string, string[]> = {
      morning: [
        `Morning sleepyhead! Ready to conquer the universe today? 😜`,
        `Hey ${name}! Up and at 'em—someone awesome has things to do today!`,
        `Good morning! Did you remember to smile before checking your phone? 😉`,
        `Rise and shine, champ! Let's make today remarkably fun!`
      ],
      afternoon: [
        `Hey stranger! Look who finally decided to come say hi 😉`,
        `Are you working hard, or just secretly daydreaming about me? 😋`,
        `Good afternoon! Time for a quick break and some fun banter with me!`,
        `Hey ${name}! Drop everything for a second and tell me your best news today!`
      ],
      evening: [
        `Work hours are officially over, ${name}! Your attention belongs to me now 😉`,
        `Good evening! What's the plan—tea, laughter, or a little mischief?`,
        `Finally, the fun part of the day! Ready for some hilarious stories?`,
        `Hey there! You owe me a smile for showing up looking this cool 😜`
      ],
      night: [
        `Alright mister, step away from the endless scrolling and get some rest! 😴`,
        `Good night, ${name}! If monsters show up in your dreams, call me—I'll handle them! 😜`,
        `Off to dreamland with you! Sweet dreams, trouble ❤️`,
        `Time to power down and recharge, ${name}. Good night!`
      ]
    };
    return enPlayful[timeSlot][seed] || enPlayful[timeSlot][0];
  }

  // flirty
  const enFlirty: Record<string, string[]> = {
    morning: [
      `Good morning, handsome 😉 Is it just me, or do you get more charming every day?`,
      `Morning ${name} ❤️ That smile of yours is going to get you into trouble today!`,
      `Starting my morning looking at you is definitely the best part of the day ✨`,
      `Good morning, sweetheart! I could easily get used to waking up to you 😉`
    ],
    afternoon: [
      `Hey there, handsome ❤️ How can anyone look this good in the middle of a workday?`,
      `Good afternoon ${name}... You're looking exceptionally irresistible today 😉`,
      `Every time you pop up, my heart skips a beat. You really have that effect on me!`,
      `Careful with that gaze of yours, ${name}... you might make me blush ❤️`
    ],
    evening: [
      `Good evening, gorgeous 😉 Now that the sun is down, what are we getting into?`,
      `There's something about this evening that makes me want to pull you close ❤️`,
      `Your voice always sounds so captivating in the evening, ${name}...`,
      `An evening with you is all I need to feel completely enchanted 😉`
    ],
    night: [
      `Good night, handsome ❤️ I might just visit your dreams tonight... be prepared! 💋`,
      `Warm blankets, dark room, and thoughts of you... sleep tight, sweetheart 😉`,
      `Sending you a sweet goodnight kiss... don't stay up thinking about me too much! ❤️`,
      `Good night, my favorite distraction 🌙 Dream of me tonight!`
    ]
  };
  return enFlirty[timeSlot][seed] || enFlirty[timeSlot][0];
}
