import { VoiceIdentity } from '../types';
import { getNativeZuzuPlugin } from './permission';

export interface SwitchIntentResult {
  isSwitchCommand: boolean;
  targetIdentity?: VoiceIdentity;
  detectedLanguage: 'en' | 'bn';
  confirmationSpoken: string;
  isAmbiguous?: boolean;
  ambiguousQuestion?: string;
}

export function detectVoiceSwitchIntent(
  rawTranscript: string,
  currentIdentity: VoiceIdentity
): SwitchIntentResult {
  if (!rawTranscript || typeof rawTranscript !== 'string') {
    return {
      isSwitchCommand: false,
      detectedLanguage: 'en',
      confirmationSpoken: ''
    };
  }

  const text = rawTranscript.trim().toLowerCase();

  // Detect Bengali characters
  const isBengali = /[\u0980-\u09FF]/.test(rawTranscript);
  const detectedLang: 'en' | 'bn' = isBengali ? 'bn' : 'en';

  // 1. Female Switch Triggers (Bengali & English, supporting Zuzu & Stonic)
  const femalePatterns = [
    // Direct commands
    /convert to female/i,
    /switch to female/i,
    /change to female/i,
    /turn into female/i,
    /become female/i,
    /make voice female/i,
    /female voice/i,
    /female zuzu/i,
    /female stonic/i,
    // Targeted commands
    /male\s+(zuzu|stonic)?.*(?:convert|switch|change|turn).*female/i,
    /(?:convert|switch|change|turn).*(?:female\s+)?(zuzu|stonic)/i,
    /want you to be(?:come)? female/i,
    /be(?:come)? a female/i,
    // Bengali variations
    /female\s*(?:zuzu|stonic)?\s*(?:হয়ে|হয়ে)\s*যাও/i,
    /female\s*(?:zuzu|stonic)?\s*(?:হয়ে|হয়ে)\s*যেতে/i,
    /আমি চাই তুমি\s*female\s*(?:zuzu|stonic)?\s*(?:হয়ে|হয়ে)\s*যাও/i,
    /আমি চাই তুমি ফিমেল\s*(?:জুজু|স্টনিক)?\s*(?:হয়ে|হয়ে)\s*যাও/i,
    /ফিমেল\s*(?:জুজু|স্টনিক)?\s*(?:হয়ে|হয়ে)\s*যাও/i,
    /ফিমেল\s*ভয়েস/i,
    /ফিমেল\s*ভয়েস/i,
    /ফিমেল\s*কণ্ঠ/i,
    /মেয়ে\s*কণ্ঠ/i,
    /মেয়ের\s*কণ্ঠে\s*কথা\s*বলো/i,
    /মেয়ে\s*কণ্ঠে\s*কথা\s*বলো/i,
    /ফিমেল\s*এ\s*সুইচ\s*করো/i,
    /ফিমেল\s*হও/i
  ];

  // 2. Male Switch Triggers (Bengali & English, supporting Zuzu & Stonic)
  const malePatterns = [
    // Direct commands
    /convert to male/i,
    /switch to male/i,
    /change to male/i,
    /turn into male/i,
    /become male/i,
    /make voice male/i,
    /male voice/i,
    /male zuzu/i,
    /male stonic/i,
    // Targeted commands
    /female\s+(zuzu|stonic)?.*(?:convert|switch|change|turn).*male/i,
    /(?:convert|switch|change|turn).*(?:male\s+)?(zuzu|stonic)/i,
    /want you to be(?:come)? male/i,
    /be(?:come)? a male/i,
    // Bengali variations
    /male\s*(?:zuzu|stonic)?\s*(?:হয়ে|হয়ে)\s*যাও/i,
    /male\s*(?:zuzu|stonic)?\s*(?:হয়ে|হয়ে)\s*যেতে/i,
    /আমি চাই তুমি\s*male\s*(?:zuzu|stonic)?\s*(?:হয়ে|হয়ে)\s*যাও/i,
    /আমি চাই তুমি মেল\s*(?:জুজু|স্টনিক)?\s*(?:হয়ে|হয়ে)\s*যাও/i,
    /মেল\s*(?:জুজু|স্টনিক)?\s*(?:হয়ে|হয়ে)\s*যাও/i,
    /মেল\s*ভয়েস/i,
    /মেল\s*ভয়েস/i,
    /মেল\s*কণ্ঠ/i,
    /ছেলে\s*কণ্ঠ/i,
    /ছেলের\s*কণ্ঠে\s*কথা\s*বলো/i,
    /ছেলে\s*কণ্ঠে\s*কথা\s*বলো/i,
    /মেল\s*এ\s*সুইচ\s*করো/i,
    /মেল\s*হও/i
  ];

  // Ambiguity check: phrases like "what is female zuzu?" or "who is male stonic?"
  const isQuestionAboutIdentity = 
    /(what is|who is|tell me about|explain)\s+(male|female)\s+(zuzu|stonic)/i.test(text) ||
    /(মেল|ফিমেল)\s+(জুজু|স্টনিক)\s*(কী|কি|কে)/i.test(text);

  if (isQuestionAboutIdentity) {
    return {
      isSwitchCommand: false,
      detectedLanguage: detectedLang,
      confirmationSpoken: ''
    };
  }

  // Check Female Match
  const wantsFemale = femalePatterns.some(pattern => pattern.test(text));
  // Check Male Match
  const wantsMale = malePatterns.some(pattern => pattern.test(text));

  // If both match or unclear
  if (wantsFemale && wantsMale) {
    return {
      isSwitchCommand: false,
      isAmbiguous: true,
      detectedLanguage: detectedLang,
      confirmationSpoken: '',
      ambiguousQuestion: detectedLang === 'bn' 
        ? "আপনি কি মেল নাকি ফিমেল জুজুতে পরিবর্তন করতে চান? অনুগ্রহ করে স্পষ্ট করে বলুন।"
        : "Did you want to switch to Male Zuzu or Female Zuzu? Please specify."
    };
  }

  if (wantsFemale) {
    if (currentIdentity === 'female') {
      return {
        isSwitchCommand: false,
        detectedLanguage: detectedLang,
        confirmationSpoken: detectedLang === 'bn'
          ? "আমি ইতিমধ্যেই ফিমেল জুজু হিসেবে সক্রিয় আছি।"
          : "I am already operating as Female Zuzu!"
      };
    }

    const confirmation = detectedLang === 'bn'
      ? "অবশ্যই! আমি এখন ফিমেল জুজু হয়ে গেলাম। আপনার কি সেবা করতে পারি বলুন?"
      : "Switching to Female Zuzu. I am now your female assistant, ready to help you!";

    return {
      isSwitchCommand: true,
      targetIdentity: 'female',
      detectedLanguage: detectedLang,
      confirmationSpoken: confirmation
    };
  }

  if (wantsMale) {
    if (currentIdentity === 'male') {
      return {
        isSwitchCommand: false,
        detectedLanguage: detectedLang,
        confirmationSpoken: detectedLang === 'bn'
          ? "আমি ইতিমধ্যেই মেল জুজু হিসেবে সক্রিয় আছি।"
          : "I am already operating as Male Zuzu!"
      };
    }

    const confirmation = detectedLang === 'bn'
      ? "অবশ্যই! আমি এখন মেল জুজু হয়ে গেলাম। বলুন কীভাবে সাহায্য করব?"
      : "Switching to Male Zuzu. I am now your male assistant, ready to assist you!";

    return {
      isSwitchCommand: true,
      targetIdentity: 'male',
      detectedLanguage: detectedLang,
      confirmationSpoken: confirmation
    };
  }

  // Check for vague switch intent: e.g. "change your voice" or "switch identity"
  const isVagueSwitch = /(change your voice|switch voice|switch identity|change identity|ভয়েস পরিবর্তন করো|ভয়েস চেঞ্জ করো)/i.test(text);
  if (isVagueSwitch) {
    const nextTarget = currentIdentity === 'male' ? 'Female Zuzu' : 'Male Zuzu';
    const nextTargetBn = currentIdentity === 'male' ? 'ফিমেল জুজু' : 'মেল জুজু';
    return {
      isSwitchCommand: false,
      isAmbiguous: true,
      detectedLanguage: detectedLang,
      confirmationSpoken: '',
      ambiguousQuestion: detectedLang === 'bn'
        ? `আপনি কি ${nextTargetBn}-তে পরিবর্তন করতে চান? 'হ্যাঁ' বলুন বা বলুন 'সুইচ টু ${nextTargetBn}'।`
        : `Would you like to switch to ${nextTarget}? You can say 'Switch to ${nextTarget}'.`
    };
  }

  return {
    isSwitchCommand: false,
    detectedLanguage: detectedLang,
    confirmationSpoken: ''
  };
}

export type VoiceActionIntentType = 
  | 'open_app' 
  | 'web_search' 
  | 'save_note' 
  | 'manage_reminder' 
  | 'send_message' 
  | 'none';

export interface VoiceActionIntentResult {
  hasActionIntent: boolean;
  intentType: VoiceActionIntentType;
  spokenConfirmation: string;
  appTarget?: string;
  url?: string;
  noteContent?: string;
  reminderContent?: string;
  messageDraft?: { recipient: string; text: string; app: 'messenger' | 'whatsapp' | 'sms' };
  requiresConfirmation?: boolean;
}

function triggerExternalUrl(url: string): void {
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.openExternalUrl) {
    nativePlugin.openExternalUrl({ url }).catch(() => {
      if (typeof window !== 'undefined') {
        try {
          window.open(url, '_blank');
        } catch {}
      }
    });
    return;
  }
  if (typeof window !== 'undefined') {
    try {
      window.open(url, '_blank');
    } catch {}
  }
}

function triggerAppLaunch(appName: string, fallbackUrl: string, specialAction?: string): void {
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin) {
    if (specialAction === 'camera' && nativePlugin.openSystemCamera) {
      nativePlugin.openSystemCamera().catch(() => {});
      return;
    }
    if (specialAction === 'settings' && nativePlugin.openDeviceSettingsSection) {
      nativePlugin.openDeviceSettingsSection({ target: appName.toLowerCase() }).catch(() => {});
      return;
    }
    if (nativePlugin.launchApp) {
      nativePlugin.launchApp({ appName, fallbackUrl }).catch(() => {
        if (fallbackUrl) triggerExternalUrl(fallbackUrl);
      });
      return;
    }
  }
  if (fallbackUrl && !fallbackUrl.startsWith('#')) {
    triggerExternalUrl(fallbackUrl);
  }
}

function parseReminderDelayMs(text: string): number {
  const minMatch = text.match(/\bin\s+(\d+)\s*(?:min|mins|minute|minutes)\b/i);
  if (minMatch) return Math.max(1, parseInt(minMatch[1], 10)) * 60000;
  const hourMatch = text.match(/\bin\s+(\d+)\s*(?:hr|hrs|hour|hours)\b/i);
  if (hourMatch) return Math.max(1, parseInt(hourMatch[1], 10)) * 3600000;
  return 3600000;
}

/**
 * Natural language intent parser for device actions
 */
export function detectVoiceActionIntent(rawTranscript: string): VoiceActionIntentResult {
  if (!rawTranscript || typeof rawTranscript !== 'string') {
    return { hasActionIntent: false, intentType: 'none', spokenConfirmation: '' };
  }

  const text = rawTranscript.trim();
  const lower = text.toLowerCase();
  const isBengali = /[\u0980-\u09FF]/.test(text);

  // 1. Open App / Device Settings Intent
  const openAppMatch =
    lower.match(/(?:open|launch|start|run)\s+(youtube|whatsapp|facebook|messenger|chrome|browser|camera|settings|wifi|wi-fi|bluetooth|calculator|spotify|google maps|maps|calendar|gmail|instagram|telegram|phone|dialer|photos|gallery|play store|tiktok)/i) ||
    (isBengali && text.match(/(ইউটিউব|হোয়াটসঅ্যাপ|হোয়াটসঅ্যাপ|ফেসবুক|মেসেঞ্জার|ক্রোম|ক্যামেরা|সেটিংস|ওয়াইফাই|ব্লুটুথ|ক্যালকুলেটর|ম্যাপ|ইনস্টাগ্রাম|টেলিগ্রাম|জিমেইল)\s*(?:ওপেন|চালু|খুলো|খোলো)/i));

  if (openAppMatch) {
    const rawApp = (openAppMatch[1] || '').toLowerCase();
    let appName = 'App';
    let url = '';
    let special: string | undefined;

    if (rawApp.includes('youtube') || rawApp.includes('ইউটিউব')) {
      appName = 'YouTube';
      url = 'https://www.youtube.com';
    } else if (rawApp.includes('whatsapp') || rawApp.includes('হোয়াটসঅ্যাপ') || rawApp.includes('হোয়াটসঅ্যাপ')) {
      appName = 'WhatsApp';
      url = 'https://wa.me';
    } else if (rawApp.includes('facebook') || rawApp.includes('ফেসবুক')) {
      appName = 'Facebook';
      url = 'https://www.facebook.com';
    } else if (rawApp.includes('messenger') || rawApp.includes('মেসেঞ্জার')) {
      appName = 'Messenger';
      url = 'https://www.messenger.com';
    } else if (rawApp.includes('instagram') || rawApp.includes('ইনস্টাগ্রাম')) {
      appName = 'Instagram';
      url = 'https://www.instagram.com';
    } else if (rawApp.includes('telegram') || rawApp.includes('টেলিগ্রাম')) {
      appName = 'Telegram';
      url = 'https://t.me';
    } else if (rawApp.includes('gmail') || rawApp.includes('জিমেইল')) {
      appName = 'Gmail';
      url = 'https://mail.google.com';
    } else if (rawApp.includes('camera') || rawApp.includes('ক্যামেরা')) {
      appName = 'Camera';
      special = 'camera';
    } else if (rawApp.includes('wifi') || rawApp.includes('wi-fi') || rawApp.includes('ওয়াইফাই')) {
      appName = 'WiFi';
      special = 'settings';
    } else if (rawApp.includes('bluetooth') || rawApp.includes('ব্লুটুথ')) {
      appName = 'Bluetooth';
      special = 'settings';
    } else if (rawApp.includes('settings') || rawApp.includes('সেটিংস')) {
      appName = 'main';
      special = 'settings';
    } else if (rawApp.includes('maps') || rawApp.includes('ম্যাপ')) {
      appName = 'Google Maps';
      url = 'https://maps.google.com';
    } else if (rawApp.includes('phone') || rawApp.includes('dialer')) {
      appName = 'Phone';
      url = 'tel:';
    } else {
      appName = rawApp.charAt(0).toUpperCase() + rawApp.slice(1);
      url = `https://www.google.com/search?q=${encodeURIComponent(appName)}`;
    }

    const displayApp = appName === 'main' ? 'Settings' : appName;
    const spoken = isBengali
      ? `ঠিক আছে, আমি ${displayApp} ওপেন করছি।`
      : `Opening ${displayApp} for you right away.`;

    triggerAppLaunch(appName, url, special);

    return {
      hasActionIntent: true,
      intentType: 'open_app',
      appTarget: displayApp,
      url,
      spokenConfirmation: spoken
    };
  }

  // 2. Web / YouTube Search Intent
  const ytSearchMatch = lower.match(/(?:search\s+youtube\s+for|youtube\s+search)\s+(.+)/i);
  if (ytSearchMatch && ytSearchMatch[1]) {
    const query = ytSearchMatch[1].trim();
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    triggerExternalUrl(ytUrl);
    return {
      hasActionIntent: true,
      intentType: 'web_search',
      url: ytUrl,
      spokenConfirmation: isBengali
        ? `ইউটিউবে "${query}" অনুসন্ধান করছি।`
        : `Searching YouTube for "${query}".`
    };
  }

  const searchMatch =
    lower.match(/(?:search for|search on google for|search|google|find online|look up)\s+(.+)/i) ||
    (isBengali && text.match(/(.+)\s*(?:সার্চ করো|খুঁজে বের করো)/i));

  if (searchMatch && searchMatch[1]) {
    const query = searchMatch[1].replace(/^(for|online|in google|on google)\s*/i, '').trim();
    if (query.length > 1) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      const spoken = isBengali
        ? `আমি গুগলে "${query}" অনুসন্ধান করছি।`
        : `Searching Google for "${query}".`;

      triggerExternalUrl(searchUrl);

      return {
        hasActionIntent: true,
        intentType: 'web_search',
        url: searchUrl,
        spokenConfirmation: spoken
      };
    }
  }

  // 3. Save Note Intent
  const noteMatch =
    lower.match(/(?:note down|save note|save a note|write down|take a note|create note|create a note|add note)\s*:?\s*(.+)/i) ||
    (isBengali && text.match(/(?:নোট করো|লিখে রাখো|একটি নোট রাখো|নোট সেভ করো)\s*:?\s*(.+)/i));

  if (noteMatch && noteMatch[1]) {
    const noteText = noteMatch[1].trim();
    if (noteText) {
      try {
        const stored = JSON.parse(localStorage.getItem('zuzu_notebook_notes') || '[]');
        stored.unshift({
          id: `note-${Date.now()}`,
          text: noteText,
          timestamp: Date.now()
        });
        localStorage.setItem('zuzu_notebook_notes', JSON.stringify(stored));
        window.dispatchEvent(new CustomEvent('zuzu-notes-reminders-changed'));
      } catch {}

      const spoken = isBengali
        ? `অবশ্যই, আমি আপনার নোটবুকে সংরক্ষণ করে রেখেছি: "${noteText}"।`
        : `Saved to your Notebook: "${noteText}". Open Notes & Reminders anytime to view or edit it.`;

      return {
        hasActionIntent: true,
        intentType: 'save_note',
        noteContent: noteText,
        spokenConfirmation: spoken
      };
    }
  }

  // 4. Manage Reminder Intent
  const reminderMatch =
    lower.match(/(?:remind me to|set a reminder(?: for| to)?|create reminder(?: for| to)?|reminder to)\s*:?\s*(.+)/i) ||
    (isBengali && text.match(/(?:মনে করিয়ে দিও|মনে করিয়ে দিও|মনে করাও|রিমাইন্ডার দাও)\s*:?\s*(.+)/i));

  if (reminderMatch && reminderMatch[1]) {
    const rawReminderText = reminderMatch[1].trim();
    const delayMs = parseReminderDelayMs(rawReminderText);
    const cleanTitle = rawReminderText.replace(/\bin\s+\d+\s*(?:min|mins|minute|minutes|hr|hrs|hour|hours)\b/i, '').trim() || rawReminderText;
    const triggerAtMs = Date.now() + delayMs;
    const remId = `rem-${Date.now()}`;

    if (cleanTitle) {
      try {
        const stored = JSON.parse(localStorage.getItem('zuzu_user_reminders') || '[]');
        stored.unshift({
          id: remId,
          title: cleanTitle,
          time: triggerAtMs,
          completed: false,
          notified: false
        });
        localStorage.setItem('zuzu_user_reminders', JSON.stringify(stored));
        window.dispatchEvent(new CustomEvent('zuzu-notes-reminders-changed'));
      } catch {}

      const nativePlugin = getNativeZuzuPlugin();
      if (nativePlugin?.scheduleReminderNotification) {
        nativePlugin
          .scheduleReminderNotification({
            id: remId,
            title: 'Zuzu AI Reminder',
            body: cleanTitle,
            triggerAtMs
          })
          .catch(() => {});
      }

      const whenLabel = new Date(triggerAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const spoken = isBengali
        ? `ঠিক আছে, আমি ${whenLabel}-এর জন্য রিমাইন্ডার সেট করে দিলাম: "${cleanTitle}"।`
        : `Got it! I have scheduled a reminder for ${whenLabel}: "${cleanTitle}".`;

      return {
        hasActionIntent: true,
        intentType: 'manage_reminder',
        reminderContent: cleanTitle,
        spokenConfirmation: spoken
      };
    }
  }

  // 5. Send Message Intent with Interactive Confirmation
  const msgMatch =
    lower.match(/(?:send a message to|message|send message to|text|whatsapp)\s+([a-zA-Z\u0980-\u09FF\s]+?)\s+(?:on\s+(whatsapp|messenger|sms)\s+)?(?:saying|that|with text)\s+(.+)/i) ||
    (isBengali && text.match(/(.+)-কে\s*(?:মেসেজ|বার্তা)\s*পাঠাও\s*(?:যে|বলে)\s*(.+)/i));

  if (msgMatch) {
    const isEnShape = msgMatch.length >= 4 && !isBengali;
    const recipient = (msgMatch[1] || '').trim();
    const explicitApp = isEnShape ? (msgMatch[2] || '').toLowerCase() : '';
    const content = (isEnShape ? msgMatch[3] : msgMatch[2] || '').trim();
    if (recipient && content) {
      const app: 'messenger' | 'whatsapp' | 'sms' =
        explicitApp === 'whatsapp' || lower.includes('whatsapp')
          ? 'whatsapp'
          : explicitApp === 'sms' || lower.includes('sms') || lower.startsWith('text ')
          ? 'sms'
          : 'messenger';

      const spoken = isBengali
        ? `আমি ${recipient}-কে "${content}" মেসেজটি পাঠাতে ড্রাফট প্রস্তুত করেছি। পাঠাতে Confirm চাপুন।`
        : `I have prepared a ${app} message for ${recipient}: "${content}". Tap Confirm & Send below.`;

      return {
        hasActionIntent: true,
        intentType: 'send_message',
        requiresConfirmation: true,
        messageDraft: {
          recipient,
          text: content,
          app
        },
        spokenConfirmation: spoken
      };
    }
  }

  return { hasActionIntent: false, intentType: 'none', spokenConfirmation: '' };
}
