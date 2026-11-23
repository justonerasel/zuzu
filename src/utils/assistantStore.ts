import { NotebookNote, ReminderRecurrence, UserReminder } from '../types';
import { getNativeZuzuPlugin } from './permission';

export const NOTES_STORAGE_KEY = 'zuzu_notebook_notes';
export const REMINDERS_STORAGE_KEY = 'zuzu_user_reminders';

function emitNotesRemindersChanged(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('zuzu-notes-reminders-changed'));
    window.dispatchEvent(new CustomEvent('zuzu-zu-data-changed'));
  }
}

function normalizeText(val: string): string {
  return val
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function writeVerifiedArray<T>(key: string, next: T[]): { success: boolean; error?: string } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { success: false, error: 'Local storage unavailable.' };
  }
  try {
    const serialized = JSON.stringify(next);
    window.localStorage.setItem(key, serialized);
    const verifyRaw = window.localStorage.getItem(key);
    if (verifyRaw === null) {
      return { success: false, error: 'Storage verification read-back failed.' };
    }
    const parsed = JSON.parse(verifyRaw);
    if (!Array.isArray(parsed) || parsed.length !== next.length) {
      return { success: false, error: 'Storage length verification mismatch.' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Storage write failed.' };
  }
}

// ============================================================================
// SMART NOTEBOOK CRUD (With Verified Persistence)
// ============================================================================

export function getNotesList(): NotebookNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n: any) => n && typeof n.text === 'string' && n.text.trim().length > 0)
      .sort((a: NotebookNote, b: NotebookNote) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch {
    return [];
  }
}

export function setNotesList(notes: NotebookNote[]): { success: boolean; error?: string } {
  const res = writeVerifiedArray(NOTES_STORAGE_KEY, notes);
  if (res.success) {
    emitNotesRemindersChanged();
  }
  return res;
}

export function addNoteVerified(
  text: string,
  category = 'general'
): { success: boolean; note?: NotebookNote; error?: string } {
  const clean = text.trim();
  if (!clean) {
    return { success: false, error: 'Note text cannot be empty.' };
  }
  const existing = getNotesList();
  const now = Date.now();
  const note: NotebookNote = {
    id: `note-${now}-${Math.random().toString(36).slice(2, 6)}`,
    text: clean,
    category,
    timestamp: now,
    updatedAt: now
  };
  const next = [note, ...existing];
  const writeRes = setNotesList(next);
  if (!writeRes.success) {
    return { success: false, error: writeRes.error };
  }
  return { success: true, note };
}

export function searchNotesByQuery(query: string): NotebookNote[] {
  const notes = getNotesList();
  const q = normalizeText(query);
  if (!q) return notes;
  const words = q.split(' ').filter(w => w.length > 1);
  return notes.filter(n => {
    const hay = `${normalizeText(n.text)} ${normalizeText(n.category || '')}`;
    if (hay.includes(q)) return true;
    return words.length > 0 && words.every(w => hay.includes(w));
  });
}

export function updateNoteByIdOrQuery(
  idOrTarget: string,
  newText: string,
  useLastIfEmpty = false
): { success: boolean; note?: NotebookNote; error?: string } {
  const cleanNew = newText.trim();
  if (!cleanNew) {
    return { success: false, error: 'Updated note text cannot be empty.' };
  }
  const notes = getNotesList();
  if (notes.length === 0) {
    return { success: false, error: 'You have no saved notes to edit.' };
  }

  let idx = notes.findIndex(n => n.id === idOrTarget);
  if (idx === -1 && idOrTarget.trim()) {
    const matches = searchNotesByQuery(idOrTarget);
    if (matches.length > 0) {
      idx = notes.findIndex(n => n.id === matches[0].id);
    }
  }
  if (idx === -1 && useLastIfEmpty) {
    idx = 0; // Most recent note
  }
  if (idx === -1) {
    return { success: false, error: 'Could not find a matching note to update.' };
  }

  const updated: NotebookNote = {
    ...notes[idx],
    text: cleanNew,
    updatedAt: Date.now()
  };
  const next = [...notes];
  next[idx] = updated;
  const writeRes = setNotesList(next);
  if (!writeRes.success) {
    return { success: false, error: writeRes.error };
  }
  return { success: true, note: updated };
}

export function deleteNoteByIdOrQuery(
  idOrTarget: string,
  useLastIfEmpty = false
): { success: boolean; deletedNote?: NotebookNote; error?: string } {
  const notes = getNotesList();
  if (notes.length === 0) {
    return { success: false, error: 'Your notebook is already empty.' };
  }

  let idx = notes.findIndex(n => n.id === idOrTarget);
  if (idx === -1 && idOrTarget.trim()) {
    const matches = searchNotesByQuery(idOrTarget);
    if (matches.length > 0) {
      idx = notes.findIndex(n => n.id === matches[0].id);
    }
  }
  if (idx === -1 && useLastIfEmpty) {
    idx = 0;
  }
  if (idx === -1) {
    return { success: false, error: 'Could not find a matching note to delete.' };
  }

  const deletedNote = notes[idx];
  const next = notes.filter((_, i) => i !== idx);
  const writeRes = setNotesList(next);
  if (!writeRes.success) {
    return { success: false, error: writeRes.error };
  }
  return { success: true, deletedNote };
}

// ============================================================================
// SMART REMINDERS CRUD + NATIVE ANDROID ALARM SYNC
// ============================================================================

export function getRemindersList(): UserReminder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(REMINDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r: any) => r && typeof r.title === 'string' && typeof r.time === 'number')
      .sort((a: UserReminder, b: UserReminder) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.time - b.time;
      });
  } catch {
    return [];
  }
}

export function setRemindersList(reminders: UserReminder[]): { success: boolean; error?: string } {
  const res = writeVerifiedArray(REMINDERS_STORAGE_KEY, reminders);
  if (res.success) {
    emitNotesRemindersChanged();
    syncRemindersToNative(reminders).catch(() => {});
  }
  return res;
}

export function getReminderCategory(
  reminder: Pick<UserReminder, 'completed' | 'time'>,
  nowMs = Date.now()
): 'completed' | 'overdue' | 'upcoming' {
  if (reminder.completed) return 'completed';
  return reminder.time < nowMs ? 'overdue' : 'upcoming';
}

export async function syncSingleReminderToNative(reminder: UserReminder): Promise<{ exact?: boolean }> {
  const nativePlugin = getNativeZuzuPlugin();
  if (!nativePlugin) return {};
  if (reminder.completed) {
    if (nativePlugin.cancelReminderNotification) {
      await nativePlugin.cancelReminderNotification({ id: reminder.id }).catch(() => {});
    }
    return {};
  }
  if (nativePlugin.scheduleReminderNotification) {
    try {
      const bodyText = reminder.description?.trim()
        ? `${reminder.title} — ${reminder.description.trim()}`
        : reminder.title;
      const res = await nativePlugin.scheduleReminderNotification({
        id: reminder.id,
        title: 'Zuzu AI Reminder',
        body: bodyText,
        triggerAtMs: reminder.time,
        recurrence: reminder.recurrence || 'none',
        recurrenceWeekday:
          typeof reminder.recurrenceWeekday === 'number' ? reminder.recurrenceWeekday : -1
      });
      return { exact: Boolean(res?.exact) };
    } catch {}
  }
  return {};
}

export async function syncRemindersToNative(reminders?: UserReminder[]): Promise<void> {
  const list = reminders || getRemindersList();
  const nativePlugin = getNativeZuzuPlugin();
  if (!nativePlugin) return;

  if (nativePlugin.syncNativeReminders) {
    try {
      await nativePlugin.syncNativeReminders({
        reminders: list.map(r => ({
          id: r.id,
          title: 'Zuzu AI Reminder',
          body: r.description?.trim() ? `${r.title} — ${r.description.trim()}` : r.title,
          triggerAtMs: r.time,
          completed: Boolean(r.completed),
          recurrence: r.recurrence || 'none',
          recurrenceWeekday:
            typeof r.recurrenceWeekday === 'number' ? r.recurrenceWeekday : -1
        }))
      });
      return;
    } catch {}
  }

  for (const r of list) {
    if (!r.completed && r.time > Date.now() - 5000) {
      await syncSingleReminderToNative(r);
    }
  }
}

export function addReminderVerified(params: {
  title: string;
  description?: string;
  triggerAtMs: number;
  recurrence?: ReminderRecurrence;
  recurrenceWeekday?: number;
}): { success: boolean; reminder?: UserReminder; error?: string } {
  const cleanTitle = params.title.trim();
  if (!cleanTitle) {
    return { success: false, error: 'Reminder title cannot be empty.' };
  }
  if (!Number.isFinite(params.triggerAtMs)) {
    return { success: false, error: 'Invalid reminder date/time.' };
  }
  const cleanDesc = params.description?.trim() || undefined;
  const now = Date.now();
  const recurrence: ReminderRecurrence = params.recurrence || 'none';
  const recurrenceWeekday =
    recurrence === 'weekly' && typeof params.recurrenceWeekday === 'number'
      ? params.recurrenceWeekday
      : recurrence === 'weekly'
      ? new Date(params.triggerAtMs).getDay()
      : undefined;

  const reminder: UserReminder = {
    id: `rem-${now}-${Math.random().toString(36).slice(2, 6)}`,
    title: cleanTitle,
    ...(cleanDesc ? { description: cleanDesc } : {}),
    time: params.triggerAtMs,
    completed: false,
    notified: false,
    recurrence,
    ...(typeof recurrenceWeekday === 'number' ? { recurrenceWeekday } : {}),
    createdAt: now,
    updatedAt: now
  };
  const existing = getRemindersList();
  const next = [reminder, ...existing];
  const writeRes = setRemindersList(next);
  if (!writeRes.success) {
    return { success: false, error: writeRes.error };
  }
  return { success: true, reminder };
}

export function updateReminderById(
  id: string,
  updates: {
    title?: string;
    description?: string;
    triggerAtMs?: number;
    recurrence?: ReminderRecurrence;
    recurrenceWeekday?: number;
    completed?: boolean;
  }
): { success: boolean; reminder?: UserReminder; error?: string } {
  const list = getRemindersList();
  const target = list.find(r => r.id === id);
  if (!target) {
    return { success: false, error: 'Original reminder record not found.' };
  }

  const nextTitle = updates.title !== undefined ? updates.title.trim() : target.title;
  if (!nextTitle) {
    return { success: false, error: 'Reminder title cannot be empty.' };
  }

  const nextTime = updates.triggerAtMs !== undefined ? updates.triggerAtMs : target.time;
  if (!Number.isFinite(nextTime)) {
    return { success: false, error: 'Invalid reminder date/time.' };
  }

  const nextRecurrence: ReminderRecurrence =
    updates.recurrence !== undefined ? updates.recurrence : target.recurrence || 'none';

  let nextWeekday: number | undefined = target.recurrenceWeekday;
  if (nextRecurrence === 'weekly') {
    if (typeof updates.recurrenceWeekday === 'number') {
      nextWeekday = updates.recurrenceWeekday;
    } else if (typeof nextWeekday !== 'number' || updates.triggerAtMs !== undefined) {
      nextWeekday = new Date(nextTime).getDay();
    }
  } else {
    nextWeekday = undefined;
  }

  const nextDesc =
    updates.description !== undefined
      ? updates.description.trim() || undefined
      : target.description;

  const now = Date.now();
  const timeMovedToFuture = updates.triggerAtMs !== undefined && nextTime > now;
  const nextCompleted =
    updates.completed !== undefined
      ? updates.completed
      : timeMovedToFuture
      ? false
      : target.completed;

  const updated: UserReminder = {
    ...target,
    title: nextTitle,
    time: nextTime,
    recurrence: nextRecurrence,
    completed: nextCompleted,
    notified: timeMovedToFuture ? false : target.notified,
    completedAt: nextCompleted ? (target.completedAt || now) : undefined,
    updatedAt: now
  };

  if (nextDesc) {
    updated.description = nextDesc;
  } else {
    delete updated.description;
  }

  if (typeof nextWeekday === 'number') {
    updated.recurrenceWeekday = nextWeekday;
  } else {
    delete updated.recurrenceWeekday;
  }

  // Replace original record strictly in-place (zero duplicates)
  const nextList = list.map(r => (r.id === id ? updated : r));

  // Explicitly cancel previous Android AlarmManager alarm before rescheduling updated payload
  const nativePlugin = getNativeZuzuPlugin();
  nativePlugin?.cancelReminderNotification?.({ id: target.id }).catch(() => {});

  const writeRes = setRemindersList(nextList);
  if (!writeRes.success) {
    return { success: false, error: writeRes.error };
  }

  return { success: true, reminder: updated };
}

export function deleteReminderById(id: string): { success: boolean; reminder?: UserReminder; error?: string } {
  const list = getRemindersList();
  const target = list.find(r => r.id === id);
  if (!target) {
    return { success: false, error: 'Reminder not found.' };
  }
  const nativePlugin = getNativeZuzuPlugin();
  nativePlugin?.cancelReminderNotification?.({ id: target.id }).catch(() => {});

  const next = list.filter(r => r.id !== id);
  const writeRes = setRemindersList(next);
  if (!writeRes.success) {
    return { success: false, error: writeRes.error };
  }
  return { success: true, reminder: target };
}

export function toggleReminderCompletedById(
  id: string
): { success: boolean; reminder?: UserReminder; error?: string } {
  const list = getRemindersList();
  const target = list.find(r => r.id === id);
  if (!target) {
    return { success: false, error: 'Reminder not found.' };
  }
  return updateReminderById(id, { completed: !target.completed });
}

export function findMatchingReminder(query: string, onlyPending = false): UserReminder | null {
  const list = getRemindersList().filter(r => (!onlyPending ? true : !r.completed));
  if (list.length === 0) return null;

  const q = normalizeText(query);
  if (!q) {
    const sortedByCreate = [...list].sort((a, b) => (b.createdAt || b.time) - (a.createdAt || a.time));
    return sortedByCreate[0] || list[0];
  }

  const exactId = list.find(r => r.id === query);
  if (exactId) return exactId;

  const words = q.split(' ').filter(w => w.length > 1 && !['my', 'the', 'reminder', 'previous', 'last', 'রিমাইন্ডার'].includes(w));
  if (words.length === 0) {
    const sortedByCreate = [...list].sort((a, b) => (b.createdAt || b.time) - (a.createdAt || a.time));
    return sortedByCreate[0] || list[0];
  }

  let best: UserReminder | null = null;
  let bestScore = 0;
  for (const r of list) {
    const hay = `${normalizeText(r.title)} ${normalizeText(r.description || '')}`.trim();
    if (hay.includes(words.join(' '))) return r;
    const score = words.filter(w => hay.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return bestScore > 0 ? best : null;
}

export function completeReminderByQuery(
  query: string,
  useLatestIfEmpty = false
): { success: boolean; reminder?: UserReminder; error?: string } {
  const target = findMatchingReminder(query, true) || (useLatestIfEmpty ? findMatchingReminder('', true) : null);
  if (!target) {
    return { success: false, error: 'Could not find a matching pending reminder.' };
  }
  return updateReminderById(target.id, { completed: true });
}

export function deleteReminderByQuery(
  query: string,
  useLatestIfEmpty = false
): { success: boolean; reminder?: UserReminder; error?: string } {
  const target = findMatchingReminder(query, false) || (useLatestIfEmpty ? findMatchingReminder('', false) : null);
  if (!target) {
    return { success: false, error: 'Could not find a matching reminder to cancel.' };
  }
  return deleteReminderById(target.id);
}

export function updateReminderByQuery(
  query: string,
  updates: Partial<Pick<UserReminder, 'title' | 'description' | 'time' | 'recurrence' | 'recurrenceWeekday' | 'completed'>>
): { success: boolean; reminder?: UserReminder; error?: string } {
  const target = findMatchingReminder(query, false);
  if (!target) {
    return { success: false, error: 'Could not find a matching reminder to update.' };
  }

  return updateReminderById(target.id, {
    title: updates.title,
    description: updates.description,
    triggerAtMs: updates.time,
    recurrence: updates.recurrence,
    recurrenceWeekday: updates.recurrenceWeekday,
    completed: updates.completed
  });
}

export function computeNextRecurringTriggerMs(
  fromMs: number,
  recurrence: ReminderRecurrence,
  recurrenceWeekday?: number,
  nowMs = Date.now()
): number {
  if (recurrence === 'daily') {
    let candidate = fromMs + 86400000;
    while (candidate <= nowMs) candidate += 86400000;
    return candidate;
  }

  if (recurrence === 'weekly') {
    const targetDay = typeof recurrenceWeekday === 'number' ? recurrenceWeekday : new Date(fromMs).getDay();
    const dt = new Date(fromMs + 7 * 86400000);
    // Align day of week cleanly if targetDay is specified
    if (dt.getDay() !== targetDay) {
      const diff = (targetDay - dt.getDay() + 7) % 7;
      dt.setDate(dt.getDate() + diff);
    }
    while (dt.getTime() <= nowMs) {
      dt.setDate(dt.getDate() + 7);
    }
    return dt.getTime();
  }

  if (recurrence === 'weekday') {
    const dt = new Date(fromMs);
    do {
      dt.setDate(dt.getDate() + 1);
    } while (dt.getDay() === 0 || dt.getDay() === 6 || dt.getTime() <= nowMs);
    return dt.getTime();
  }

  return fromMs;
}

// ============================================================================
// NATURAL-LANGUAGE DATE / TIME / RECURRENCE PARSER (English & Bangla)
// ============================================================================

export interface ParsedReminderSchedule {
  triggerAtMs?: number;
  recurrence: ReminderRecurrence;
  recurrenceWeekday?: number;
  cleanedTitle: string;
  needsClarification: boolean;
  clarificationReason?: 'missing_time' | 'ambiguous_ampm';
  clarificationQuestion?: string;
  pendingTaskText?: string;
  ambiguityHour?: number;
  ambiguityMinute?: number;
  ambiguityDayOffset?: number;
}

function normalizeBengaliDigits(input: string): string {
  return input.replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
}

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0, রবিবার: 0,
  monday: 1, mon: 1, সোমবার: 1,
  tuesday: 2, tue: 2, মঙ্গলবার: 2,
  wednesday: 3, wed: 3, বুধবার: 3,
  thursday: 4, thu: 4, বৃহস্পতিবার: 4,
  friday: 5, fri: 5, শুক্রবার: 5,
  saturday: 6, sat: 6, শনিবার: 6
};

const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0, জানুয়ারি: 0, জানুয়ারি: 0,
  february: 1, feb: 1, ফেব্রুয়ারি: 1, ফেব্রুয়ারি: 1,
  march: 2, mar: 2, মার্চ: 2,
  april: 3, apr: 3, এপ্রিল: 3,
  may: 4, মে: 4,
  june: 5, jun: 5, জুন: 5,
  july: 6, jul: 6, জুলাই: 6,
  august: 7, aug: 7, আগস্ট: 7,
  september: 8, sep: 8, sept: 8, সেপ্টেম্বর: 8,
  october: 9, oct: 9, অক্টোবর: 9,
  november: 10, nov: 10, নভেম্বর: 10,
  december: 11, dec: 11, ডিসেম্বর: 11
};

export function parseNaturalReminderSchedule(rawInput: string, now = new Date()): ParsedReminderSchedule {
  const text = normalizeBengaliDigits(rawInput.trim());
  const isBengali = /[\u0980-\u09FF]/.test(rawInput);
  let working = text
    .replace(/^(?:hey\s+|hi\s+)?(?:zuzu|জুজু)[,:\s]+/i, '')
    .trim();

  // 1A. Compound relative offset: "after 2 hours and 45 minutes", "in 1 hr 30 mins", "২ ঘণ্টা ৪৫ মিনিট পর"
  const relCompoundEn = working.match(
    /\b(?:in|after)\s+(\d+)\s*(?:hr|hrs|hour|hours)\s*(?:and\s*)?(\d+)\s*(?:min|mins|minute|minutes)\b/i
  );
  const relCompoundBn = working.match(
    /(\d+)\s*(?:ঘণ্টা|ঘন্টা)\s*(\d+)\s*(?:মিনিট)\s*(?:পর|পরে)/i
  );
  const relCompoundMatch = relCompoundEn || relCompoundBn;
  if (relCompoundMatch) {
    const hrs = Math.max(0, parseInt(relCompoundMatch[1], 10));
    const mins = Math.max(0, parseInt(relCompoundMatch[2], 10));
    working = working.replace(relCompoundMatch[0], ' ').trim();
    const cleaned = stripReminderFillerWords(working) || rawInput.trim();
    return {
      triggerAtMs: now.getTime() + (hrs * 60 + mins) * 60000,
      recurrence: 'none',
      cleanedTitle: cleaned,
      needsClarification: false
    };
  }

  // 1B. Minutes relative offset: "after 7 minutes", "in 20 minutes", "২০ মিনিট পর"
  const relMinEn = working.match(/\b(?:in|after)\s+(\d+)\s*(?:min|mins|minute|minutes)\b/i);
  const relMinBn = working.match(/(\d+)\s*(?:মিনিট)\s*(?:পর|পরে)/i);
  const relMinMatch = relMinEn || relMinBn;
  if (relMinMatch) {
    const mins = Math.max(1, parseInt(relMinMatch[1], 10));
    working = working.replace(relMinMatch[0], ' ').trim();
    const cleaned = stripReminderFillerWords(working) || rawInput.trim();
    return {
      triggerAtMs: now.getTime() + mins * 60000,
      recurrence: 'none',
      cleanedTitle: cleaned,
      needsClarification: false
    };
  }

  // 1C. Hours relative offset: "in 2 hours", "২ ঘণ্টা পর"
  const relHourEn = working.match(/\b(?:in|after)\s+(\d+)\s*(?:hr|hrs|hour|hours)\b/i);
  const relHourBn = working.match(/(\d+)\s*(?:ঘণ্টা|ঘন্টা)\s*(?:পর|পরে)/i);
  const relHourMatch = relHourEn || relHourBn;
  if (relHourMatch) {
    const hrs = Math.max(1, parseInt(relHourMatch[1], 10));
    working = working.replace(relHourMatch[0], ' ').trim();
    const cleaned = stripReminderFillerWords(working) || rawInput.trim();
    return {
      triggerAtMs: now.getTime() + hrs * 3600000,
      recurrence: 'none',
      cleanedTitle: cleaned,
      needsClarification: false
    };
  }

  // 2. Detect Recurrence ("every day" / "daily" / "every weekday" / "every Friday" / "প্রতিদিন" / "প্রতি শুক্রবার")
  let recurrence: ReminderRecurrence = 'none';
  let targetWeekday: number | null = null;

  if (/\b(?:every\s*weekday|on\s*weekdays|weekdays)\b/i.test(working)) {
    recurrence = 'weekday';
    working = working.replace(/\b(?:every\s*weekday|on\s*weekdays|weekdays)\b/gi, ' ');
  } else if (/\b(?:every\s*day|daily|each\s*day)\b|প্রতিদিন/i.test(working)) {
    recurrence = 'daily';
    working = working.replace(/\b(?:every\s*day|daily|each\s*day)\b|প্রতিদিন/gi, ' ');
  }

  const everyWeekdayMatch = working.match(
    /(?:every|each|প্রতি)\s*(sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|রবিবার|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার)/i
  );
  if (everyWeekdayMatch) {
    recurrence = 'weekly';
    const dayKey = everyWeekdayMatch[1].toLowerCase();
    targetWeekday = WEEKDAY_MAP[dayKey] ?? null;
    working = working.replace(everyWeekdayMatch[0], ' ');
  } else {
    const onWeekdayMatch = working.match(
      /(?:on\s+|next\s+)?\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|(রবিবার|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার)/i
    );
    if (onWeekdayMatch) {
      const dayKey = (onWeekdayMatch[1] || onWeekdayMatch[2] || '').toLowerCase();
      if (dayKey in WEEKDAY_MAP) {
        targetWeekday = WEEKDAY_MAP[dayKey];
        working = working.replace(onWeekdayMatch[0], ' ');
      }
    }
  }

  // 3. Detect Explicit Calendar Date ("on December 15", "Dec 15, 2026", "15 December", "2026-12-15")
  let explicitDate: { year: number; month: number; day: number; hasExplicitYear: boolean } | null = null;

  const monthNamesRegex =
    '(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec|জানুয়ারি|জানুয়ারি|ফেব্রুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর)';

  const monthDayMatch = working.match(
    new RegExp(`(?:on\\s+)?\\b${monthNamesRegex}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?\\b`, 'i')
  );
  const dayMonthMatch = !monthDayMatch
    ? working.match(
        new RegExp(`(?:on\\s+)?\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthNamesRegex}(?:[,\\s]+(\\d{4}))?\\b`, 'i')
      )
    : null;
  const isoDateMatch =
    !monthDayMatch && !dayMonthMatch
      ? working.match(/(?:on\s+)?\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
      : null;

  if (monthDayMatch) {
    const mName = monthDayMatch[1].toLowerCase();
    const dNum = parseInt(monthDayMatch[2], 10);
    const yNum = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : now.getFullYear();
    if (mName in MONTH_MAP && dNum >= 1 && dNum <= 31) {
      explicitDate = { year: yNum, month: MONTH_MAP[mName], day: dNum, hasExplicitYear: Boolean(monthDayMatch[3]) };
      working = working.replace(monthDayMatch[0], ' ');
    }
  } else if (dayMonthMatch) {
    const dNum = parseInt(dayMonthMatch[1], 10);
    const mName = dayMonthMatch[2].toLowerCase();
    const yNum = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : now.getFullYear();
    if (mName in MONTH_MAP && dNum >= 1 && dNum <= 31) {
      explicitDate = { year: yNum, month: MONTH_MAP[mName], day: dNum, hasExplicitYear: Boolean(dayMonthMatch[3]) };
      working = working.replace(dayMonthMatch[0], ' ');
    }
  } else if (isoDateMatch) {
    const yNum = parseInt(isoDateMatch[1], 10);
    const mNum = parseInt(isoDateMatch[2], 10) - 1;
    const dNum = parseInt(isoDateMatch[3], 10);
    if (mNum >= 0 && mNum <= 11 && dNum >= 1 && dNum <= 31) {
      explicitDate = { year: yNum, month: mNum, day: dNum, hasExplicitYear: true };
      working = working.replace(isoDateMatch[0], ' ');
    }
  }

  // 4. Detect Relative Day Offset ("today", "tomorrow", "day after tomorrow", "আগামীকাল", "আজকে")
  let explicitDaySpecified = explicitDate !== null;
  let dayOffset = 0;

  if (!explicitDate) {
    if (/\bday\s+after\s+tomorrow\b|আগামী\s*পরশু|পরশু/i.test(working)) {
      dayOffset = 2;
      explicitDaySpecified = true;
      working = working.replace(/\bday\s+after\s+tomorrow\b|আগামী\s*পরশু|পরশু/gi, ' ');
    } else if (/\btomorrow\b|আগামীকাল|কালকে|কাল\b/i.test(working)) {
      dayOffset = 1;
      explicitDaySpecified = true;
      working = working.replace(/\btomorrow\b|আগামীকাল|কালকে|কাল\b/gi, ' ');
    } else if (/\btoday\b|\btonight\b|আজকে|আজ\b/i.test(working)) {
      dayOffset = 0;
      explicitDaySpecified = true;
      working = working.replace(/\btoday\b|আজকে|আজ\b/gi, ' ');
    }
  }

  // 5. Detect Clock Time
  let hour24: number | null = null;
  let minute = 0;
  let hasExplicitMeridiem = false;
  let ambiguousBareHour: number | null = null;
  let ambiguousMinute = 0;

  const bnClockMatch = working.match(
    /(সকাল|ভোর|দুপুর|বিকাল|বিকেল|সন্ধ্যা|রাত)?\s*(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?\s*(?:টা|টায়|টায়)(?:\s*(\d{1,2})\s*মিনিট)?/i
  );
  const enClockMatch = working.match(
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i
  );

  const enMatchValid =
    enClockMatch &&
    (Boolean(enClockMatch[3]) ||
      Boolean(enClockMatch[2]) ||
      /\bat\s+\d{1,2}\b/i.test(enClockMatch[0]) ||
      /\b(?:morning|evening|night|tonight|afternoon)\b/i.test(working));

  if (bnClockMatch) {
    const period = (bnClockMatch[1] || '').trim();
    const rawH = parseInt(bnClockMatch[2], 10);
    const rawM = parseInt(bnClockMatch[3] || bnClockMatch[4] || '0', 10);
    minute = Math.min(59, Math.max(0, rawM));

    if (period) {
      hasExplicitMeridiem = true;
      if (/রাত|সন্ধ্যা|বিকাল|বিকেল|দুপুর/.test(period)) {
        if (/দুপুর/.test(period) && rawH === 12) hour24 = 12;
        else if (rawH < 12) hour24 = rawH + 12;
        else hour24 = rawH;
      } else {
        hour24 = rawH === 12 ? 0 : rawH;
      }
    } else if (rawH >= 13 && rawH <= 23) {
      hasExplicitMeridiem = true;
      hour24 = rawH;
    } else if (rawH >= 1 && rawH <= 12) {
      ambiguousBareHour = rawH;
      ambiguousMinute = minute;
    }
    working = working.replace(bnClockMatch[0], ' ');
  } else if (enMatchValid && enClockMatch) {
    const rawH = parseInt(enClockMatch[1], 10);
    const rawM = parseInt(enClockMatch[2] || '0', 10);
    const mer = (enClockMatch[3] || '').toLowerCase().replace(/\./g, '');
    minute = Math.min(59, Math.max(0, rawM));

    if (mer === 'pm' || mer === 'p') {
      hasExplicitMeridiem = true;
      hour24 = rawH === 12 ? 12 : Math.min(23, rawH + 12);
    } else if (mer === 'am' || mer === 'a') {
      hasExplicitMeridiem = true;
      hour24 = rawH === 12 ? 0 : rawH;
    } else if (/\b(?:tonight|evening|night|afternoon)\b/i.test(working) && rawH <= 12) {
      hasExplicitMeridiem = true;
      hour24 = rawH === 12 ? 12 : rawH + 12;
    } else if (/\bmorning\b/i.test(working) && rawH <= 12) {
      hasExplicitMeridiem = true;
      hour24 = rawH === 12 ? 0 : rawH;
    } else if (rawH >= 13 && rawH <= 23) {
      hasExplicitMeridiem = true;
      hour24 = rawH;
    } else if (rawH >= 1 && rawH <= 12) {
      ambiguousBareHour = rawH;
      ambiguousMinute = minute;
    }
    working = working.replace(enClockMatch[0], ' ');
  }

  working = working.replace(/\b(?:tonight|this morning|this evening|in the morning|in the evening|at night)\b/gi, ' ');
  const cleanedTitle = stripReminderFillerWords(working) || rawInput.trim();

  if (ambiguousBareHour !== null && !hasExplicitMeridiem) {
    const minStr = String(ambiguousMinute).padStart(2, '0');
    return {
      recurrence,
      ...(targetWeekday !== null ? { recurrenceWeekday: targetWeekday } : {}),
      cleanedTitle,
      needsClarification: true,
      clarificationReason: 'ambiguous_ampm',
      ambiguityHour: ambiguousBareHour,
      ambiguityMinute: ambiguousMinute,
      ambiguityDayOffset: dayOffset,
      pendingTaskText: cleanedTitle,
      clarificationQuestion: isBengali
        ? `"${cleanedTitle}" রিমাইন্ডারটি কি সকাল ${ambiguousBareHour}:${minStr} নাকি রাত ${ambiguousBareHour}:${minStr}-এ সেট করব?`
        : `Should I set the reminder "${cleanedTitle}" for ${ambiguousBareHour}:${minStr} AM or ${ambiguousBareHour}:${minStr} PM?`
    };
  }

  if (hour24 === null) {
    if (!explicitDaySpecified && targetWeekday === null && recurrence === 'none') {
      return {
        recurrence: 'none',
        cleanedTitle,
        needsClarification: true,
        clarificationReason: 'missing_time',
        pendingTaskText: cleanedTitle,
        clarificationQuestion: isBengali
          ? `"${cleanedTitle}" রিমাইন্ডারটি কোন সময় বা তারিখে সেট করতে চান?`
          : `What time or date should I set the reminder "${cleanedTitle}" for?`
      };
    }
    hour24 = 9;
    minute = 0;
  }

  const target = new Date(now.getTime());
  target.setSeconds(0, 0);

  if (explicitDate) {
    target.setFullYear(explicitDate.year, explicitDate.month, explicitDate.day);
    target.setHours(hour24, minute, 0, 0);
    if (!explicitDate.hasExplicitYear && target.getTime() <= now.getTime()) {
      target.setFullYear(explicitDate.year + 1, explicitDate.month, explicitDate.day);
    }
  } else {
    target.setHours(hour24, minute, 0, 0);
    if (targetWeekday !== null) {
      const currentDay = target.getDay();
      let diff = (targetWeekday - currentDay + 7) % 7;
      if (diff === 0 && target.getTime() <= now.getTime()) {
        diff = 7;
      }
      target.setDate(target.getDate() + diff);
    } else if (recurrence === 'weekday') {
      while (target.getDay() === 0 || target.getDay() === 6 || target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
    } else if (explicitDaySpecified) {
      target.setDate(target.getDate() + dayOffset);
      if (dayOffset === 0 && target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
    } else if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
  }

  return {
    triggerAtMs: target.getTime(),
    recurrence,
    ...(targetWeekday !== null ? { recurrenceWeekday: targetWeekday } : {}),
    cleanedTitle,
    needsClarification: false
  };
}

function stripReminderFillerWords(input: string): string {
  return input
    .replace(/^(?:hey\s+|hi\s+)?(?:zuzu|জুজু)[,:\s]+/gi, '')
    .replace(/\b(?:remind\s+me\s+(?:to|that|about)?|set\s+(?:a\s+)?reminder\s+(?:for|to|about)?)\s*/gi, '')
    .replace(/(?:আমাকে|রিমাইন্ডার\s*(?:দাও|সেট\s*করো)|মনে\s*করিয়ে\s*দিও|মনে\s*করিয়ে\s*দিও|মনে\s*করাও)/g, ' ')
    .replace(/[।.!?]+$/g, '')
    .replace(/\b(?:to|for|about|please|on|at)\s*$/i, '')
    .replace(/^(?:to|that|for|about|on|at)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
