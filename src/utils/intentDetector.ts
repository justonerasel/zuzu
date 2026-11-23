import { ReminderRecurrence, VoiceIdentity } from '../types';
import { getNativeZuzuPlugin } from './permission';
import {
  addNoteVerified,
  addReminderVerified,
  completeReminderByQuery,
  deleteNoteByIdOrQuery,
  deleteReminderByQuery,
  getNotesList,
  getRemindersList,
  parseNaturalReminderSchedule,
  searchNotesByQuery,
  updateNoteByIdOrQuery,
  updateReminderByQuery
} from './assistantStore';

export interface SwitchIntentResult {
  isSwitchCommand: boolean;
  targetIdentity?: VoiceIdentity;
  detectedLanguage: 'en' | 'bn';
  confirmationSpoken: string;
  isAmbiguous?: boolean;
  ambiguousQuestion?: string;
}

export interface SleepStopIntentResult {
  isSleepCommand: boolean;
  detectedLanguage: 'en' | 'bn';
  confirmationSpoken: string;
}

export interface PendingReminderClarification {
  taskText: string;
  reason: 'missing_time' | 'ambiguous_ampm';
  ambiguityHour?: number;
  ambiguityMinute?: number;
  ambiguityDayOffset?: number;
  recurrence?: ReminderRecurrence;
  recurrenceWeekday?: number;
  createdAt: number;
}

export function detectSleepStopIntent(
  rawTranscript: string,
  assistantNickname = 'Zuzu'
): SleepStopIntentResult {
  if (!rawTranscript || typeof rawTranscript !== 'string') {
    return { isSleepCommand: false, detectedLanguage: 'en', confirmationSpoken: '' };
  }

  const trimmed = rawTranscript.trim();
  const isBengali = /[\u0980-\u09FF]/.test(trimmed);
  const lang: 'en' | 'bn' = isBengali ? 'bn' : 'en';
  const nick = (assistantNickname || 'Zuzu').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const sleepPatterns = [
    new RegExp(`^(?:ok(?:ay)?\\s+)?(?:bye|goodbye|good\\s+bye|see\\s+you|sleep|go\\s+to\\s+sleep)\\s+(?:${nick}|zuzu|stonic)[.!?\\s]*$`, 'i'),
    new RegExp(`^(?:${nick}|zuzu|stonic)[,\\s]+(?:bye|goodbye|sleep|go\\s+to\\s+sleep|stop\\s+listening|standby)[.!?\\s]*$`, 'i'),
    /^(?:stop\s+listening|go\s+to\s+sleep|enter\s+standby|that(?:'s|\s+is)\s+all\s+for\s+now)[.!?\\s]*$/i,
    /^(?:bye\s+bye|good\s*bye)[.!?\\s]*$/i,
    /^(?:বাই|গুড\s*বাই|বিদায়|বিদায়)\s*(?:জুজু)?[.!?।\s]*$/i,
    /^(?:ঘুমাও|শোনা\s*বন্ধ\s*করো|থামো)\s*(?:জুজু)?[.!?।\s]*$/i,
    /^(?:জুজু)\s*(?:ঘুমাও|বাই|থামো|শোনা\s*বন্ধ\s*করো)[.!?।\s]*$/i
  ];

  const matched = sleepPatterns.some(p => p.test(trimmed));
  if (!matched) {
    return { isSleepCommand: false, detectedLanguage: lang, confirmationSpoken: '' };
  }

  return {
    isSleepCommand: true,
    detectedLanguage: lang,
    confirmationSpoken: isBengali
      ? 'ঠিক আছে, আমি এখন স্ট্যান্ডবাইয়ে যাচ্ছি। ডাকলেই আবার সাড়া দেব।'
      : 'Alright, entering standby mode. Say "Wake up Zuzu" anytime you need me.'
  };
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
  const isBengali = /[\u0980-\u09FF]/.test(rawTranscript);
  const detectedLang: 'en' | 'bn' = isBengali ? 'bn' : 'en';

  const femalePatterns = [
    /convert to female/i,
    /switch to female/i,
    /change to female/i,
    /turn into female/i,
    /become female/i,
    /make voice female/i,
    /female voice/i,
    /female zuzu/i,
    /female stonic/i,
    /male\s+(zuzu|stonic)?.*(?:convert|switch|change|turn).*female/i,
    /(?:convert|switch|change|turn).*(?:female\s+)?(zuzu|stonic)/i,
    /want you to be(?:come)? female/i,
    /be(?:come)? a female/i,
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

  const malePatterns = [
    /convert to male/i,
    /switch to male/i,
    /change to male/i,
    /turn into male/i,
    /become male/i,
    /make voice male/i,
    /male voice/i,
    /male zuzu/i,
    /male stonic/i,
    /female\s+(zuzu|stonic)?.*(?:convert|switch|change|turn).*male/i,
    /(?:convert|switch|change|turn).*(?:male\s+)?(zuzu|stonic)/i,
    /want you to be(?:come)? male/i,
    /be(?:come)? a male/i,
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

  const wantsFemale = femalePatterns.some(pattern => pattern.test(text));
  const wantsMale = malePatterns.some(pattern => pattern.test(text));

  if (wantsFemale && wantsMale) {
    return {
      isSwitchCommand: false,
      isAmbiguous: true,
      detectedLanguage: detectedLang,
      confirmationSpoken: '',
      ambiguousQuestion:
        detectedLang === 'bn'
          ? 'আপনি কি মেল নাকি ফিমেল জুজুতে পরিবর্তন করতে চান? অনুগ্রহ করে স্পষ্ট করে বলুন।'
          : 'Did you want to switch to Male Zuzu or Female Zuzu? Please specify.'
    };
  }

  if (wantsFemale) {
    if (currentIdentity === 'female') {
      return {
        isSwitchCommand: false,
        detectedLanguage: detectedLang,
        confirmationSpoken:
          detectedLang === 'bn'
            ? 'আমি ইতিমধ্যেই ফিমেল জুজু হিসেবে সক্রিয় আছি।'
            : 'I am already operating as Female Zuzu!'
      };
    }

    return {
      isSwitchCommand: true,
      targetIdentity: 'female',
      detectedLanguage: detectedLang,
      confirmationSpoken:
        detectedLang === 'bn'
          ? 'অবশ্যই! আমি এখন ফিমেল জুজু হয়ে গেলাম। আপনার কি সেবা করতে পারি বলুন?'
          : 'Switching to Female Zuzu. I am now your female assistant, ready to help you!'
    };
  }

  if (wantsMale) {
    if (currentIdentity === 'male') {
      return {
        isSwitchCommand: false,
        detectedLanguage: detectedLang,
        confirmationSpoken:
          detectedLang === 'bn'
            ? 'আমি ইতিমধ্যেই মেল জুজু হিসেবে সক্রিয় আছি।'
            : 'I am already operating as Male Zuzu!'
      };
    }

    return {
      isSwitchCommand: true,
      targetIdentity: 'male',
      detectedLanguage: detectedLang,
      confirmationSpoken:
        detectedLang === 'bn'
          ? 'অবশ্যই! আমি এখন মেল জুজু হয়ে গেলাম। বলুন কীভাবে সাহায্য করব?'
          : 'Switching to Male Zuzu. I am now your male assistant, ready to assist you!'
    };
  }

  const isVagueSwitch = /(change your voice|switch voice|switch identity|change identity|ভয়েস পরিবর্তন করো|ভয়েস চেঞ্জ করো)/i.test(text);
  if (isVagueSwitch) {
    const nextTarget = currentIdentity === 'male' ? 'Female Zuzu' : 'Male Zuzu';
    const nextTargetBn = currentIdentity === 'male' ? 'ফিমেল জুজু' : 'মেল জুজু';
    return {
      isSwitchCommand: false,
      isAmbiguous: true,
      detectedLanguage: detectedLang,
      confirmationSpoken: '',
      ambiguousQuestion:
        detectedLang === 'bn'
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
  | 'manage_note'
  | 'manage_reminder'
  | 'clarify_reminder'
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
  pendingClarification?: PendingReminderClarification;
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

function formatReminderWhen(
  triggerAtMs: number,
  recurrence: ReminderRecurrence = 'none',
  isBengali = false,
  recurrenceWeekday?: number
): string {
  const dt = new Date(triggerAtMs);
  const now = new Date();
  const isToday = dt.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000);
  const isTomorrow = dt.toDateString() === tomorrow.toDateString();
  const timePart = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let datePart = '';
  if (isToday) {
    datePart = isBengali ? 'আজ' : 'today';
  } else if (isTomorrow) {
    datePart = isBengali ? 'আগামীকাল' : 'tomorrow';
  } else {
    datePart = dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayNamesBn = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

  const recLabel =
    recurrence === 'daily'
      ? isBengali
        ? ' (প্রতিদিন)'
        : ' (repeating daily)'
      : recurrence === 'weekly'
      ? typeof recurrenceWeekday === 'number'
        ? isBengali
          ? ` (প্রতি ${weekdayNamesBn[recurrenceWeekday]})`
          : ` (every ${weekdayNames[recurrenceWeekday]})`
        : isBengali
        ? ' (প্রতি সপ্তাহে)'
        : ' (repeating weekly)'
      : recurrence === 'weekday'
      ? isBengali
        ? ' (প্রতি কর্মদিবসে)'
        : ' (every weekday)'
      : '';

  return `${datePart} at ${timePart}${recLabel}`;
}

/**
 * Resolves a follow-up clarification response for a pending reminder (e.g., "8 PM" or "tomorrow morning").
 */
export function resolvePendingReminderClarification(
  rawReply: string,
  pending: PendingReminderClarification
): VoiceActionIntentResult {
  const text = rawReply.trim();
  const lower = text.toLowerCase();
  const isBengali = /[\u0980-\u09FF]/.test(text);

  if (/^(cancel|never\s*mind|stop|skip|no|বাদ দাও|দরকার নেই|না)\b/i.test(lower)) {
    return {
      hasActionIntent: true,
      intentType: 'clarify_reminder',
      spokenConfirmation: isBengali
        ? 'ঠিক আছে, রিমাইন্ডার তৈরি বাতিল করা হলো।'
        : 'Okay, I cancelled creating that reminder.'
    };
  }

  if (pending.reason === 'ambiguous_ampm' && pending.ambiguityHour !== undefined) {
    const wantsPm = /\b(pm|p\.m\.|evening|night|tonight|afternoon)\b|রাত|সন্ধ্যা|বিকাল|বিকেল|দুপুর/i.test(lower);
    const wantsAm = /\b(am|a\.m\.|morning)\b|সকাল|ভোর/i.test(lower);

    if (wantsPm || wantsAm) {
      const now = new Date();
      let h24 = pending.ambiguityHour;
      if (wantsPm && h24 < 12) h24 += 12;
      if (wantsAm && h24 === 12) h24 = 0;

      const target = new Date(now.getTime());
      target.setSeconds(0, 0);
      target.setDate(target.getDate() + (pending.ambiguityDayOffset || 0));
      target.setHours(h24, pending.ambiguityMinute || 0, 0, 0);
      if ((pending.ambiguityDayOffset || 0) === 0 && target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }

      const saveRes = addReminderVerified({
        title: pending.taskText,
        triggerAtMs: target.getTime(),
        recurrence: pending.recurrence || 'none',
        recurrenceWeekday: pending.recurrenceWeekday
      });

      if (!saveRes.success || !saveRes.reminder) {
        return {
          hasActionIntent: true,
          intentType: 'manage_reminder',
          spokenConfirmation: saveRes.error || 'Failed to save reminder to local storage.'
        };
      }

      const whenLabel = formatReminderWhen(
        saveRes.reminder.time,
        saveRes.reminder.recurrence,
        isBengali,
        saveRes.reminder.recurrenceWeekday
      );
      return {
        hasActionIntent: true,
        intentType: 'manage_reminder',
        reminderContent: saveRes.reminder.title,
        spokenConfirmation: isBengali
          ? `নিশ্চিত করা হয়েছে! আমি ${whenLabel}-এর জন্য "${saveRes.reminder.title}" রিমাইন্ডার সেট করেছি।`
          : `Scheduled! Reminder set for ${whenLabel}: "${saveRes.reminder.title}".`
      };
    }
  }

  // Re-parse combined text (handles answers like "tomorrow at 9 AM" or "in 20 minutes" or "at 8 PM")
  const parsed = parseNaturalReminderSchedule(`${pending.taskText} ${text}`);
  if (parsed.needsClarification) {
    return {
      hasActionIntent: true,
      intentType: 'clarify_reminder',
      pendingClarification: {
        taskText: pending.taskText,
        reason: parsed.clarificationReason || 'missing_time',
        ambiguityHour: parsed.ambiguityHour,
        ambiguityMinute: parsed.ambiguityMinute,
        ambiguityDayOffset: parsed.ambiguityDayOffset,
        recurrence: parsed.recurrence,
        recurrenceWeekday: parsed.recurrenceWeekday,
        createdAt: Date.now()
      },
      spokenConfirmation:
        parsed.clarificationQuestion ||
        (isBengali ? 'দয়া করে নির্দিষ্ট সময় বা তারিখটি বলুন।' : 'Please tell me a specific time or date for this reminder.')
    };
  }

  const saveRes = addReminderVerified({
    title: pending.taskText,
    triggerAtMs: parsed.triggerAtMs!,
    recurrence: parsed.recurrence !== 'none' ? parsed.recurrence : pending.recurrence || 'none',
    recurrenceWeekday: parsed.recurrenceWeekday ?? pending.recurrenceWeekday
  });

  if (!saveRes.success || !saveRes.reminder) {
    return {
      hasActionIntent: true,
      intentType: 'manage_reminder',
      spokenConfirmation: saveRes.error || 'Could not verify reminder save in storage.'
    };
  }

  const whenLabel = formatReminderWhen(
    saveRes.reminder.time,
    saveRes.reminder.recurrence,
    isBengali,
    saveRes.reminder.recurrenceWeekday
  );
  return {
    hasActionIntent: true,
    intentType: 'manage_reminder',
    reminderContent: saveRes.reminder.title,
    spokenConfirmation: isBengali
      ? `ঠিক আছে! ${whenLabel}-এর জন্য "${saveRes.reminder.title}" রিমাইন্ডার সংরক্ষণ করা হয়েছে।`
      : `Got it! I have scheduled your reminder for ${whenLabel}: "${saveRes.reminder.title}".`
  };
}

/**
 * Natural language intent parser for device actions, Smart Notebook, Smart Reminders & Messaging.
 * Works consistently across Voice Mode and Text Chat Mode without hijacking live news/search questions.
 */
export function detectVoiceActionIntent(rawTranscript: string): VoiceActionIntentResult {
  if (!rawTranscript || typeof rawTranscript !== 'string') {
    return { hasActionIntent: false, intentType: 'none', spokenConfirmation: '' };
  }

  const text = rawTranscript
    .trim()
    .replace(/^(?:hey\s+|hi\s+)?(?:zuzu|জুজু)[,:\s]+/i, '')
    .trim();
  const lower = text.toLowerCase();
  const isBengali = /[\u0980-\u09FF]/.test(text);

  // =========================================================================
  // 1. Open App / Device Settings Intent
  // =========================================================================
  const openAppMatch =
    lower.match(
      /^(?:please\s+)?(?:open|launch|start)\s+(whatsapp|messenger|chrome|browser|camera|settings|wifi|wi-fi|bluetooth|calculator|spotify|google maps|maps|calendar|gmail|instagram|telegram|phone|dialer|photos|gallery|play store|tiktok)\b/i
    ) ||
    (isBengali &&
      text.match(
        /(হোয়াটসঅ্যাপ|হোয়াটসঅ্যাপ|মেসেঞ্জার|ক্রোম|ক্যামেরা|সেটিংস|ওয়াইফাই|ব্লুটুথ|ক্যালকুলেটর|ম্যাপ|ইনস্টাগ্রাম|টেলিগ্রাম|জিমেইল)\s*(?:ওপেন|চালু|খুলো|খোলো)/i
      ));

  if (openAppMatch) {
    const rawApp = (openAppMatch[1] || '').toLowerCase();
    let appName = 'App';
    let url = '';
    let special: string | undefined;

    if (rawApp.includes('whatsapp') || rawApp.includes('হোয়াটসঅ্যাপ') || rawApp.includes('হোয়াটসঅ্যাপ')) {
      appName = 'WhatsApp';
      url = 'https://wa.me';
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

  // =========================================================================
  // 2. Explicit External Google Browser Launch Only (never hijack live AI Search Grounding Q&A)
  // =========================================================================
  const explicitBrowserSearch =
    lower.match(/^(?:open\s+google\s+(?:and|to)\s+search(?:\s+for)?|open\s+browser\s+(?:and|to)\s+search(?:\s+for)?)\s+(.+)/i) ||
    (isBengali && text.match(/^(.+)\s*গুগল\s*ব্রাউজারে\s*খোলো$/i));

  if (explicitBrowserSearch && explicitBrowserSearch[1]) {
    const query = explicitBrowserSearch[1].trim();
    if (query.length > 1) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      triggerExternalUrl(searchUrl);
      return {
        hasActionIntent: true,
        intentType: 'web_search',
        url: searchUrl,
        spokenConfirmation: isBengali
          ? `ব্রাউজারে গুগলে "${query}" খোলা হচ্ছে।`
          : `Opening Google in your browser for "${query}".`
      };
    }
  }

  // =========================================================================
  // 3. SMART NOTEBOOK FULL CRUD (Create, List, Search, Edit, Delete)
  // =========================================================================
  // 3A. Edit Note
  const editLastNoteMatch = text.match(
    /(?:edit|update|change)\s+(?:my\s+)?(?:last|latest|previous|recent)\s+note\s+(?:to|with|as|saying)\s+(.+)/i
  );
  const editQueryNoteMatch = text.match(
    /(?:edit|update|change)\s+(?:the\s+|my\s+)?note\s+(?:about|on|for)\s+(.+?)\s+(?:to|with|as)\s+(.+)/i
  );
  const editNoteBn = isBengali
    ? text.match(/(?:আমার\s*)?(?:শেষ|আগের)\s*নোট(?:টি|টা)?\s*(?:এডিট|পরিবর্তন|আপডেট)\s*(?:করে)?\s*(.+?)\s*(?:করো|লেখো|লিখো)$/i)
    : null;

  if (editLastNoteMatch && editLastNoteMatch[1]) {
    const res = updateNoteByIdOrQuery('', editLastNoteMatch[1], true);
    return {
      hasActionIntent: true,
      intentType: 'manage_note',
      noteContent: res.note?.text,
      spokenConfirmation: res.success && res.note
        ? `Updated your last note to: "${res.note.text}".`
        : res.error || 'Could not update your last note.'
    };
  }
  if (editQueryNoteMatch && editQueryNoteMatch[1] && editQueryNoteMatch[2]) {
    const res = updateNoteByIdOrQuery(editQueryNoteMatch[1], editQueryNoteMatch[2], false);
    return {
      hasActionIntent: true,
      intentType: 'manage_note',
      noteContent: res.note?.text,
      spokenConfirmation: res.success && res.note
        ? `Updated the note about "${editQueryNoteMatch[1]}" to: "${res.note.text}".`
        : res.error || 'Could not find a matching note to update.'
    };
  }
  if (editNoteBn && editNoteBn[1]) {
    const res = updateNoteByIdOrQuery('', editNoteBn[1], true);
    return {
      hasActionIntent: true,
      intentType: 'manage_note',
      noteContent: res.note?.text,
      spokenConfirmation: res.success && res.note
        ? `আপনার শেষ নোটটি আপডেট করা হয়েছে: "${res.note.text}"।`
        : res.error || 'নোটটি আপডেট করা যায়নি।'
    };
  }

  // 3B. Delete Note
  const deleteLastNoteMatch = /(?:delete|remove|clear)\s+(?:my\s+)?(?:last|latest|previous)\s+note\b/i.test(lower);
  const deleteNoteQueryMatch = text.match(
    /(?:delete|remove)\s+(?:the\s+|my\s+)?note(?:s)?\s+(?:about|on|for|containing)\s+(.+)/i
  );
  const deleteNoteBn = isBengali
    ? text.match(/(?:আমার\s*)?(.+?)\s*(?:সম্পর্কিত\s*|বিষয়ের\s*)?নোট(?:টি|টা)?\s*(?:ডিলিট|মুছে\s*ফেলো|বাদ\s*দাও)/i)
    : null;

  if (deleteLastNoteMatch) {
    const res = deleteNoteByIdOrQuery('', true);
    return {
      hasActionIntent: true,
      intentType: 'manage_note',
      spokenConfirmation: res.success && res.deletedNote
        ? isBengali
          ? `আপনার শেষ নোট "${res.deletedNote.text}" মুছে ফেলা হয়েছে।`
          : `Deleted your last note: "${res.deletedNote.text}".`
        : res.error || 'Your notebook is empty.'
    };
  }
  if (deleteNoteQueryMatch && deleteNoteQueryMatch[1]) {
    const res = deleteNoteByIdOrQuery(deleteNoteQueryMatch[1], false);
    return {
      hasActionIntent: true,
      intentType: 'manage_note',
      spokenConfirmation: res.success && res.deletedNote
        ? `Deleted the note: "${res.deletedNote.text}".`
        : res.error || `No note found matching "${deleteNoteQueryMatch[1]}".`
    };
  }
  if (deleteNoteBn && deleteNoteBn[1]) {
    const q = deleteNoteBn[1].replace(/^(?:শেষ|আগের)\s*/i, '').trim();
    const isLast = /শেষ|আগের/.test(deleteNoteBn[1]);
    const res = deleteNoteByIdOrQuery(q, isLast);
    return {
      hasActionIntent: true,
      intentType: 'manage_note',
      spokenConfirmation: res.success && res.deletedNote
        ? `নোট "${res.deletedNote.text}" মুছে ফেলা হয়েছে।`
        : 'মিল থাকা কোনো নোট পাওয়া যায়নি।'
    };
  }

  // 3C. Search / Show Notes
  const searchNoteMatch =
    text.match(/(?:find|search|show|list|get)\s+(?:all\s+)?(?:my\s+)?(.+?)(?:-|\s+)(?:related\s+)?notes\b/i) ||
    text.match(/(?:find|search|show|list|read)\s+(?:my\s+)?notes\s+(?:about|for|on|with|containing|related\s+to)\s+(.+)/i) ||
    (isBengali && text.match(/(.+?)\s*(?:সম্পর্কিত|বিষয়ের|নিয়ে)\s*নোট(?:গুলো|গুলা)?\s*(?:দেখাও|খুঁজে\s*দাও|বলো)/i));

  const showAllNotesMatch =
    /^(?:please\s+)?(?:show|list|read|open|what\s+are)\s+(?:all\s+)?(?:my\s+)?notes\b/i.test(lower) ||
    /^(?:আমার\s*)?নোট(?:গুলো|গুলা)?\s*(?:দেখাও|পড়ে\s*শোনাও|বলো)/i.test(text);

  if (searchNoteMatch && searchNoteMatch[1]) {
    const rawQuery = searchNoteMatch[1]
      .replace(/^(?:all|my|the|saved)\s+/i, '')
      .replace(/\s*-?related$/i, '')
      .trim();
    if (rawQuery && !/^(all|my|saved|any)$/i.test(rawQuery)) {
      const matches = searchNotesByQuery(rawQuery);
      if (matches.length === 0) {
        return {
          hasActionIntent: true,
          intentType: 'manage_note',
          spokenConfirmation: isBengali
            ? `"${rawQuery}" সম্পর্কিত কোনো নোট আপনার নোটবুকে পাওয়া যায়নি।`
            : `I checked your Notebook, but found no notes matching "${rawQuery}".`
        };
      }
      const listPreview = matches
        .slice(0, 5)
        .map((n, idx) => `${idx + 1}. ${n.text}`)
        .join('\n');
      return {
        hasActionIntent: true,
        intentType: 'manage_note',
        spokenConfirmation: isBengali
          ? `"${rawQuery}" সম্পর্কিত ${matches.length}টি নোট পাওয়া গেছে:\n${listPreview}`
          : `Found ${matches.length} note${matches.length > 1 ? 's' : ''} related to "${rawQuery}":\n${listPreview}`
      };
    }
  }

  if (showAllNotesMatch) {
    const notes = getNotesList();
    if (notes.length === 0) {
      return {
        hasActionIntent: true,
        intentType: 'manage_note',
        spokenConfirmation: isBengali
          ? 'আপনার নোটবুক এখন খালি আছে। নতুন নোট যোগ করতে বলুন "নোট করো..."।'
          : 'Your Notebook is currently empty. Say "Save a note..." anytime to add one.'
      };
    }
    const listPreview = notes
      .slice(0, 5)
      .map((n, idx) => `${idx + 1}. ${n.text}`)
      .join('\n');
    return {
      hasActionIntent: true,
      intentType: 'manage_note',
      spokenConfirmation: isBengali
        ? `আপনার মোট ${notes.length}টি নোট সংরক্ষিত আছে:\n${listPreview}`
        : `You have ${notes.length} saved note${notes.length > 1 ? 's' : ''}:\n${listPreview}`
    };
  }

  // 3D. Create Note
  const noteMatch =
    text.match(/^(?:please\s+)?(?:note\s+down|save\s+(?:a\s+)?note|write\s+down|take\s+(?:a\s+)?note|create\s+(?:a\s+)?note|add\s+(?:a\s+)?note)(?:\s+(?:that|this|for\s+me))?\s*:?\s*(.+)/i) ||
    (isBengali && text.match(/(?:নোট\s*করো|লিখে\s*রাখো|একটি\s*নোট\s*রাখো|নোট\s*সেভ\s*করো)\s*:?\s*(.+)/i));

  if (noteMatch && noteMatch[1]) {
    const noteText = noteMatch[1].trim();
    if (noteText) {
      const saveRes = addNoteVerified(noteText);
      if (!saveRes.success || !saveRes.note) {
        return {
          hasActionIntent: true,
          intentType: 'save_note',
          spokenConfirmation: saveRes.error || 'Failed to persist note to storage.'
        };
      }
      return {
        hasActionIntent: true,
        intentType: 'save_note',
        noteContent: saveRes.note.text,
        spokenConfirmation: isBengali
          ? `অবশ্যই, আমি আপনার নোটবুকে সংরক্ষণ করে রেখেছি: "${saveRes.note.text}"।`
          : `Saved to your Notebook: "${saveRes.note.text}".`
      };
    }
  }

  // =========================================================================
  // 4. SMART REMINDER FULL LIFECYCLE (List, Complete, Cancel, Edit, Create)
  // =========================================================================
  // 4A. List / Show Reminders
  const listRemindersMatch =
    /^(?:please\s+)?(?:show|list|read|check|what\s+are)\s+(?:all\s+)?(?:my\s+)?(?:upcoming\s+|pending\s+|active\s+)?reminders\b/i.test(lower) ||
    /^(?:আমার\s*)?রিমাইন্ডার(?:গুলো|গুলা)?\s*(?:দেখাও|বলো|কী\s*কী)/i.test(text);

  if (listRemindersMatch) {
    const pending = getRemindersList().filter(r => !r.completed);
    if (pending.length === 0) {
      return {
        hasActionIntent: true,
        intentType: 'manage_reminder',
        spokenConfirmation: isBengali
          ? 'আপনার কোনো আসন্ন রিমাইন্ডার নেই।'
          : 'You have no upcoming reminders right now.'
      };
    }
    const summary = pending
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.title} (${formatReminderWhen(r.time, r.recurrence || 'none', isBengali)})`)
      .join('\n');
    return {
      hasActionIntent: true,
      intentType: 'manage_reminder',
      spokenConfirmation: isBengali
        ? `আপনার ${pending.length}টি আসন্ন রিমাইন্ডার রয়েছে:\n${summary}`
        : `You have ${pending.length} upcoming reminder${pending.length > 1 ? 's' : ''}:\n${summary}`
    };
  }

  // 4B. Complete Reminder
  const completeReminderMatch =
    text.match(/(?:mark|set)\s+(?:my\s+|the\s+)?(.+?)\s+reminder\s+(?:as\s+)?(?:completed|done|finished)/i) ||
    text.match(/(?:complete|finish|check\s+off)\s+(?:my\s+|the\s+)?(?:(.+?)\s+)?reminder\b(?:\s+(?:for|about)\s+(.+))?/i) ||
    (isBengali && text.match(/(.+?)\s*রিমাইন্ডার(?:টি|টা)?\s*(?:কমপ্লিট|সম্পন্ন|শেষ)\s*(?:করো|মার্ক\s*করো)/i));

  if (completeReminderMatch) {
    const rawTarget = (completeReminderMatch[1] || completeReminderMatch[2] || '').trim();
    const isLatest = !rawTarget || /^(last|latest|previous|recent|শেষ|আগের)$/i.test(rawTarget);
    const res = completeReminderByQuery(isLatest ? '' : rawTarget, true);
    return {
      hasActionIntent: true,
      intentType: 'manage_reminder',
      spokenConfirmation: res.success && res.reminder
        ? isBengali
          ? `"${res.reminder.title}" রিমাইন্ডারটি সম্পন্ন হিসেবে চিহ্নিত করা হয়েছে।`
          : `Marked your "${res.reminder.title}" reminder as completed.`
        : res.error || 'Could not find a pending reminder to mark completed.'
    };
  }

  // 4C. Cancel / Delete Reminder
  const cancelReminderMatch =
    text.match(/(?:cancel|delete|remove)\s+(?:my\s+|the\s+)?(?:(previous|last|latest)\s+)?reminder(?:\s+(?:for|about|to)\s+(.+))?/i) ||
    text.match(/(?:cancel|delete|remove)\s+(?:my\s+|the\s+)?(.+?)\s+reminder\b/i) ||
    (isBengali && text.match(/(.+?)\s*রিমাইন্ডার(?:টি|টা)?\s*(?:বাতিল|ডিলিট|মুছে\s*ফেলো)/i));

  if (cancelReminderMatch) {
    const p1 = (cancelReminderMatch[1] || '').trim();
    const p2 = (cancelReminderMatch[2] || '').trim();
    const query = p2 || (/^(previous|last|latest|আগের|শেষ)$/i.test(p1) ? '' : p1);
    const res = deleteReminderByQuery(query, true);
    return {
      hasActionIntent: true,
      intentType: 'manage_reminder',
      spokenConfirmation: res.success && res.reminder
        ? isBengali
          ? `"${res.reminder.title}" রিমাইন্ডারটি বাতিল করা হয়েছে।`
          : `Cancelled and removed the reminder: "${res.reminder.title}".`
        : res.error || 'Could not find a reminder to cancel.'
    };
  }

  // 4D. Edit / Reschedule Reminder
  const editReminderMatch = text.match(
    /(?:edit|update|change|reschedule|move)\s+(?:my\s+|the\s+)?(.+?)\s+reminder\s+to\s+(.+)/i
  );
  if (editReminderMatch && editReminderMatch[1] && editReminderMatch[2]) {
    const query = /^(last|latest|previous)$/i.test(editReminderMatch[1].trim()) ? '' : editReminderMatch[1].trim();
    const newExpr = editReminderMatch[2].trim();
    const parsed = parseNaturalReminderSchedule(newExpr);
    if (!parsed.needsClarification && parsed.triggerAtMs) {
      const res = updateReminderByQuery(query, {
        time: parsed.triggerAtMs,
        recurrence: parsed.recurrence,
        recurrenceWeekday: parsed.recurrenceWeekday
      });
      return {
        hasActionIntent: true,
        intentType: 'manage_reminder',
        spokenConfirmation: res.success && res.reminder
          ? `Rescheduled "${res.reminder.title}" to ${formatReminderWhen(res.reminder.time, res.reminder.recurrence, isBengali, res.reminder.recurrenceWeekday)}.`
          : res.error || 'Could not find a matching reminder to reschedule.'
      };
    }
    const titleRes = updateReminderByQuery(query, { title: newExpr });
    return {
      hasActionIntent: true,
      intentType: 'manage_reminder',
      spokenConfirmation: titleRes.success && titleRes.reminder
        ? `Updated your reminder to: "${titleRes.reminder.title}".`
        : titleRes.error || 'Could not find a matching reminder to update.'
    };
  }

  // 4E. Create Reminder
  const reminderEnMatch = text.match(
    /^(?:please\s+)?(?:remind\s+me(?:\s+to|\s+that|\s+about)?|set\s+(?:a\s+)?reminder(?:\s+for|\s+to|\s+about)?|create\s+(?:a\s+)?reminder(?:\s+for|\s+to|\s+about)?|add\s+(?:a\s+)?reminder(?:\s+for|\s+to|\s+about)?)\s*:?\s*(.+)/i
  );
  const reminderBnMatched =
    isBengali &&
    /(?:মনে\s*করিয়ে\s*দিও|মনে\s*করিয়ে\s*দিও|মনে\s*করাও|রিমাইন্ডার\s*দাও|রিমাইন্ডার\s*সেট\s*করো)/i.test(text);

  if ((reminderEnMatch && reminderEnMatch[1]) || reminderBnMatched) {
    const rawReminderText = reminderEnMatch?.[1] ? reminderEnMatch[1].trim() : text;
    const parsed = parseNaturalReminderSchedule(rawReminderText);

    if (parsed.needsClarification) {
      return {
        hasActionIntent: true,
        intentType: 'clarify_reminder',
        pendingClarification: {
          taskText: parsed.pendingTaskText || parsed.cleanedTitle,
          reason: parsed.clarificationReason || 'missing_time',
          ambiguityHour: parsed.ambiguityHour,
          ambiguityMinute: parsed.ambiguityMinute,
          ambiguityDayOffset: parsed.ambiguityDayOffset,
          recurrence: parsed.recurrence,
          recurrenceWeekday: parsed.recurrenceWeekday,
          createdAt: Date.now()
        },
        spokenConfirmation:
          parsed.clarificationQuestion ||
          `What time or date should I set "${parsed.cleanedTitle}" for?`
      };
    }

    if (parsed.cleanedTitle && parsed.triggerAtMs) {
      const saveRes = addReminderVerified({
        title: parsed.cleanedTitle,
        triggerAtMs: parsed.triggerAtMs,
        recurrence: parsed.recurrence,
        recurrenceWeekday: parsed.recurrenceWeekday
      });

      if (!saveRes.success || !saveRes.reminder) {
        return {
          hasActionIntent: true,
          intentType: 'manage_reminder',
          spokenConfirmation: saveRes.error || 'Could not verify reminder persistence.'
        };
      }

      const whenLabel = formatReminderWhen(
        saveRes.reminder.time,
        saveRes.reminder.recurrence,
        isBengali,
        saveRes.reminder.recurrenceWeekday
      );
      return {
        hasActionIntent: true,
        intentType: 'manage_reminder',
        reminderContent: saveRes.reminder.title,
        spokenConfirmation: isBengali
          ? `ঠিক আছে, আমি ${whenLabel}-এর জন্য রিমাইন্ডার সেট করে দিলাম: "${saveRes.reminder.title}"।`
          : `Got it! I have scheduled a reminder for ${whenLabel}: "${saveRes.reminder.title}".`
      };
    }
  }

  // =========================================================================
  // 5. Send Message Intent with Interactive Confirmation
  // =========================================================================
  const msgMatch =
    text.match(
      /(?:send a message to|message|send message to|text|whatsapp)\s+([a-zA-Z\u0980-\u09FF\s]+?)\s+(?:on\s+(whatsapp|messenger|sms)\s+)?(?:saying|that|with text)\s+(.+)/i
    ) ||
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

      return {
        hasActionIntent: true,
        intentType: 'send_message',
        requiresConfirmation: true,
        messageDraft: {
          recipient,
          text: content,
          app
        },
        spokenConfirmation: isBengali
          ? `আমি ${recipient}-কে "${content}" মেসেজটি পাঠাতে ড্রাফট প্রস্তুত করেছি। পাঠাতে Confirm চাপুন।`
          : `I have prepared a ${app} message for ${recipient}: "${content}". Tap Confirm & Send below.`
      };
    }
  }

  return { hasActionIntent: false, intentType: 'none', spokenConfirmation: '' };
}
