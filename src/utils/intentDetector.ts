import { VoiceIdentity } from '../types';

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

/**
 * Natural language intent parser for device actions (Requirement 3)
 */
export function detectVoiceActionIntent(rawTranscript: string): VoiceActionIntentResult {
  if (!rawTranscript || typeof rawTranscript !== 'string') {
    return { hasActionIntent: false, intentType: 'none', spokenConfirmation: '' };
  }

  const text = rawTranscript.trim();
  const lower = text.toLowerCase();
  const isBengali = /[\u0980-\u09FF]/.test(text);

  // 1. Open App Intent
  // e.g. "Open YouTube", "Launch WhatsApp", "Open Camera", "ফেসবুক ওপেন করো"
  const openAppMatch = lower.match(/(?:open|launch|start|run)\s+(youtube|whatsapp|facebook|messenger|chrome|browser|camera|settings|calculator|spotify|maps|calendar)/i) ||
    (isBengali && text.match(/(ইউটিউব|হোয়াটসঅ্যাপ|ফেসবুক|মেসেঞ্জার|ক্রোম|ক্যামেরা|সেটিংস|ক্যালকুলেটর|ম্যাপ)\s*(?:ওপেন|চালু|খুলো)/i));

  if (openAppMatch) {
    const rawApp = (openAppMatch[1] || '').toLowerCase();
    let appName = 'App';
    let url = '';

    if (rawApp.includes('youtube') || rawApp.includes('ইউটিউব')) {
      appName = 'YouTube';
      url = 'https://www.youtube.com';
    } else if (rawApp.includes('whatsapp') || rawApp.includes('হোয়াটসঅ্যাপ')) {
      appName = 'WhatsApp';
      url = 'https://web.whatsapp.com';
    } else if (rawApp.includes('facebook') || rawApp.includes('ফেসবুক')) {
      appName = 'Facebook';
      url = 'https://www.facebook.com';
    } else if (rawApp.includes('messenger') || rawApp.includes('মেসেঞ্জার')) {
      appName = 'Messenger';
      url = 'https://www.messenger.com';
    } else if (rawApp.includes('camera') || rawApp.includes('ক্যামেরা')) {
      appName = 'Camera';
      url = '#camera';
    } else if (rawApp.includes('settings') || rawApp.includes('সেটিংস')) {
      appName = 'Settings';
      url = '#settings';
    } else {
      appName = rawApp.charAt(0).toUpperCase() + rawApp.slice(1);
      url = `https://www.google.com/search?q=${encodeURIComponent(appName)}`;
    }

    const spoken = isBengali
      ? `ঠিক আছে, আমি ${appName} ওপেন করছি।`
      : `Opening ${appName} for you right away.`;

    // Attempt native intent or web launch
    if (typeof window !== 'undefined' && url && !url.startsWith('#')) {
      try {
        window.open(url, '_blank');
      } catch {}
    }

    return {
      hasActionIntent: true,
      intentType: 'open_app',
      appTarget: appName,
      url,
      spokenConfirmation: spoken
    };
  }

  // 2. Web Search Intent
  // e.g. "Search for Bangladesh cricket", "Google quantum computing", "গুগলে সার্চ করো..."
  const searchMatch = lower.match(/(?:search for|search|google|find online|look up)\s+(.+)/i) ||
    (isBengali && text.match(/(.+)\s*(?:সার্চ করো|খুঁজে বের করো)/i));

  if (searchMatch && searchMatch[1]) {
    const query = searchMatch[1].replace(/^(for|online|in google)\s*/i, '').trim();
    if (query.length > 1) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      const spoken = isBengali
        ? `আমি গুগলে "${query}" অনুসন্ধান করছি।`
        : `Searching Google for "${query}". Here is what I found.`;

      if (typeof window !== 'undefined') {
        try {
          window.open(searchUrl, '_blank');
        } catch {}
      }

      return {
        hasActionIntent: true,
        intentType: 'web_search',
        url: searchUrl,
        spokenConfirmation: spoken
      };
    }
  }

  // 3. Save Note Intent
  // e.g. "Note down buy milk", "Save note: meeting at 4pm", "নোট করো কাল পরীক্ষা"
  const noteMatch = lower.match(/(?:note down|save note|write down|take a note|create note)\s*:?\s*(.+)/i) ||
    (isBengali && text.match(/(?:নোট করো|লিখে রাখো|একটি নোট রাখো)\s*:?\s*(.+)/i));

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
      } catch {}

      const spoken = isBengali
        ? `অবশ্যই, আমি আপনার নোটবুকে সংরক্ষণ করে রেখেছি: "${noteText}"।`
        : `Saved to your Notebook: "${noteText}". You can access it anytime.`;

      return {
        hasActionIntent: true,
        intentType: 'save_note',
        noteContent: noteText,
        spokenConfirmation: spoken
      };
    }
  }

  // 4. Manage Reminder Intent
  // e.g. "Remind me to call Mom", "Set a reminder for gym", "মনে করিয়ে দিও মিটিং আছে"
  const reminderMatch = lower.match(/(?:remind me to|set a reminder for|reminder to)\s*:?\s*(.+)/i) ||
    (isBengali && text.match(/(?:মনে করিয়ে দিও|মনে করাও|রিমাইন্ডার দাও)\s*:?\s*(.+)/i));

  if (reminderMatch && reminderMatch[1]) {
    const reminderText = reminderMatch[1].trim();
    if (reminderText) {
      try {
        const stored = JSON.parse(localStorage.getItem('zuzu_user_reminders') || '[]');
        stored.unshift({
          id: `rem-${Date.now()}`,
          title: reminderText,
          time: Date.now() + 3600000,
          completed: false
        });
        localStorage.setItem('zuzu_user_reminders', JSON.stringify(stored));
      } catch {}

      const spoken = isBengali
        ? `ঠিক আছে, আমি রিমাইন্ডার সেট করে দিলাম: "${reminderText}"।`
        : `Got it! I have scheduled a reminder for: "${reminderText}".`;

      return {
        hasActionIntent: true,
        intentType: 'manage_reminder',
        reminderContent: reminderText,
        spokenConfirmation: spoken
      };
    }
  }

  // 5. Send Message / Messenger Intent with Confirmation
  // e.g. "Send a message to Alex saying I will be late", "Message Sarah on Messenger"
  const msgMatch = lower.match(/(?:send a message to|message|send message to|text)\s+([a-zA-Z\u0980-\u09FF\s]+?)\s+(?:saying|that|with text)\s+(.+)/i) ||
    (isBengali && text.match(/(.+)-কে\s*(?:মেসেজ|বার্তা)\s*পাঠাও\s*(?:যে|বলে)\s*(.+)/i));

  if (msgMatch && msgMatch[1] && msgMatch[2]) {
    const recipient = msgMatch[1].trim();
    const content = msgMatch[2].trim();
    const spoken = isBengali
      ? `আমি ${recipient}-কে "${content}" মেসেজটি পাঠাতে ড্রাফট প্রস্তুত করেছি। আপনি কি কনফার্ম করছেন?`
      : `I have prepared a message for ${recipient}: "${content}". Please confirm to send.`;

    return {
      hasActionIntent: true,
      intentType: 'send_message',
      requiresConfirmation: true,
      messageDraft: {
        recipient,
        text: content,
        app: 'messenger'
      },
      spokenConfirmation: spoken
    };
  }

  return { hasActionIntent: false, intentType: 'none', spokenConfirmation: '' };
}
