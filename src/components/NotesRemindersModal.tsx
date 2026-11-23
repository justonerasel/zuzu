import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  StickyNote,
  Bell,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Copy,
  Check,
  Clock,
  Search,
  Pencil,
  Repeat,
  AlertTriangle,
  Calendar
} from 'lucide-react';
import { NotebookNote, ReminderRecurrence, UserReminder } from '../types';
import { getNativeZuzuPlugin } from '../utils/permission';
import { playHapticSound } from '../utils/audio';
import {
  addNoteVerified,
  addReminderVerified,
  deleteReminderById,
  getNotesList,
  getReminderCategory,
  getRemindersList,
  parseNaturalReminderSchedule,
  setNotesList,
  toggleReminderCompletedById,
  updateNoteByIdOrQuery,
  updateReminderById
} from '../utils/assistantStore';

export type { NotebookNote, UserReminder };

export function getNotes(): NotebookNote[] {
  return getNotesList();
}

export function getReminders(): UserReminder[] {
  return getRemindersList();
}

export function executeConfirmedMessageIntent(draft: {
  recipient: string;
  text: string;
  app: 'messenger' | 'whatsapp' | 'sms';
}): void {
  const nativePlugin = getNativeZuzuPlugin();
  const encodedText = encodeURIComponent(draft.text);
  let targetUrl = `sms:?body=${encodedText}`;
  if (draft.app === 'whatsapp') {
    targetUrl = `https://wa.me/?text=${encodedText}`;
  } else if (draft.app === 'messenger') {
    targetUrl = `https://www.messenger.com/t/?text=${encodedText}`;
  }

  if (nativePlugin?.openExternalUrl) {
    nativePlugin.openExternalUrl({ url: targetUrl }).catch(() => {
      if (nativePlugin?.launchApp) {
        nativePlugin.launchApp({ appName: draft.app, fallbackUrl: targetUrl }).catch(() => {});
      }
    });
    return;
  }

  try {
    window.open(targetUrl, '_blank');
  } catch {}
}

interface NotesRemindersModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'notes' | 'reminders';
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const QUICK_PRESETS = [
  { label: '5m', min: 5 },
  { label: '10m', min: 10 },
  { label: '15m', min: 15 },
  { label: '30m', min: 30 },
  { label: '1h', min: 60 },
  { label: '3h', min: 180 }
];

function detectDeviceUses12Hour(): boolean {
  try {
    const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    if (typeof resolved.hour12 === 'boolean') return resolved.hour12;
  } catch {}
  return true;
}

function toLocalDateInputValue(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const NotesRemindersModal: React.FC<NotesRemindersModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'notes'
}) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'reminders'>(initialTab);
  const [notes, setNotes] = useState<NotebookNote[]>(() => getNotesList());
  const [reminders, setReminders] = useState<UserReminder[]>(() => getRemindersList());
  const [noteInput, setNoteInput] = useState('');
  const [noteSearch, setNoteSearch] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exactAlarmMissing, setExactAlarmMissing] = useState(false);

  // Module 8 Advanced Reminder Form State
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [reminderInput, setReminderInput] = useState('');
  const [reminderDescription, setReminderDescription] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'preset' | 'custom'>('preset');
  const [reminderDelayMin, setReminderDelayMin] = useState(15);

  const [use12Hour, setUse12Hour] = useState<boolean>(() => detectDeviceUses12Hour());
  const [customDate, setCustomDate] = useState<string>(() => toLocalDateInputValue(Date.now() + 3600000));
  const [customHour24, setCustomHour24] = useState<number>(() => new Date(Date.now() + 3600000).getHours());
  const [customMinute, setCustomMinute] = useState<number>(() => new Date(Date.now() + 3600000).getMinutes());

  const [recurrence, setRecurrence] = useState<ReminderRecurrence>('none');
  const [recurrenceWeekday, setRecurrenceWeekday] = useState<number>(() => new Date().getDay());
  const [reminderFormError, setReminderFormError] = useState<string | null>(null);
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());

  const reloadAll = () => {
    setNotes(getNotesList());
    setReminders(getRemindersList());
    setNowTickMs(Date.now());
  };

  const resetReminderForm = () => {
    const defaultFuture = Date.now() + 3600000;
    const d = new Date(defaultFuture);
    setEditingReminderId(null);
    setReminderInput('');
    setReminderDescription('');
    setScheduleMode('preset');
    setReminderDelayMin(15);
    setCustomDate(toLocalDateInputValue(defaultFuture));
    setCustomHour24(d.getHours());
    setCustomMinute(d.getMinutes());
    setRecurrence('none');
    setRecurrenceWeekday(d.getDay());
    setReminderFormError(null);
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      reloadAll();
      const nativePlugin = getNativeZuzuPlugin();
      if (nativePlugin?.checkExactAlarmPermission) {
        nativePlugin
          .checkExactAlarmPermission()
          .then((res: any) => {
            setExactAlarmMissing(res && res.canScheduleExactAlarms === false);
          })
          .catch(() => setExactAlarmMissing(false));
      } else {
        setExactAlarmMissing(false);
      }
    } else {
      resetReminderForm();
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const onChanged = () => reloadAll();
    window.addEventListener('zuzu-notes-reminders-changed', onChanged);
    window.addEventListener('zuzu-workspace-switched', onChanged);
    return () => {
      window.removeEventListener('zuzu-notes-reminders-changed', onChanged);
      window.removeEventListener('zuzu-workspace-switched', onChanged);
    };
  }, []);

  // Live refresh overdue categorization every 20s while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNowTickMs(Date.now()), 20000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const filteredNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.text.toLowerCase().includes(q) ||
        (n.category && n.category.toLowerCase().includes(q))
    );
  }, [notes, noteSearch]);

  const { overdueReminders, upcomingReminders, completedReminders } = useMemo(() => {
    const overdue: UserReminder[] = [];
    const upcoming: UserReminder[] = [];
    const completed: UserReminder[] = [];
    for (const r of reminders) {
      const cat = getReminderCategory(r, nowTickMs);
      if (cat === 'completed') completed.push(r);
      else if (cat === 'overdue') overdue.push(r);
      else upcoming.push(r);
    }
    return {
      overdueReminders: overdue,
      upcomingReminders: upcoming,
      completedReminders: completed
    };
  }, [reminders, nowTickMs]);

  if (!isOpen) return null;

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    playHapticSound('message_sent');
    const res = addNoteVerified(trimmed);
    if (res.success) {
      setNoteInput('');
      reloadAll();
    }
  };

  const handleSaveEditNote = (id: string) => {
    const clean = editingNoteText.trim();
    if (!clean) return;
    const res = updateNoteByIdOrQuery(id, clean, false);
    if (res.success) {
      playHapticSound('switch');
      setEditingNoteId(null);
      setEditingNoteText('');
      reloadAll();
    }
  };

  const handleDeleteNote = (id: string) => {
    setNotesList(notes.filter((x) => x.id !== id));
    reloadAll();
  };

  const handleCopyNote = async (note: NotebookNote) => {
    try {
      await navigator.clipboard.writeText(note.text);
      setCopiedId(note.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const resolveCustomTimestampMs = (): { ok: true; ms: number } | { ok: false; error: string } => {
    if (!customDate) {
      return { ok: false, error: 'Please select a valid date.' };
    }
    const [yStr, mStr, dStr] = customDate.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10) - 1;
    const day = parseInt(dStr, 10);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return { ok: false, error: 'Invalid calendar date.' };
    }
    const target = new Date(year, month, day, customHour24, customMinute, 0, 0);
    const ms = target.getTime();
    if (Number.isNaN(ms)) {
      return { ok: false, error: 'Invalid reminder time.' };
    }
    if (ms <= Date.now() - 10000) {
      return { ok: false, error: 'Please choose a future date and time.' };
    }
    return { ok: true, ms };
  };

  const handleBeginEditReminder = (rem: UserReminder) => {
    const targetTime = rem.time > Date.now() ? rem.time : Date.now() + 15 * 60000;
    const d = new Date(rem.time);
    setEditingReminderId(rem.id);
    setReminderInput(rem.title);
    setReminderDescription(rem.description || '');
    setScheduleMode('custom');
    setCustomDate(toLocalDateInputValue(rem.time > Date.now() - 60000 ? rem.time : targetTime));
    setCustomHour24(d.getHours());
    setCustomMinute(d.getMinutes());
    setRecurrence(rem.recurrence || 'none');
    setRecurrenceWeekday(
      typeof rem.recurrenceWeekday === 'number' ? rem.recurrenceWeekday : d.getDay()
    );
    setReminderFormError(null);
    playHapticSound('switch');
  };

  const handleSubmitReminder = (e: React.FormEvent) => {
    e.preventDefault();
    setReminderFormError(null);
    const trimmedTitle = reminderInput.trim();
    if (!trimmedTitle) {
      setReminderFormError('Please enter a reminder title.');
      return;
    }

    let triggerAtMs = Date.now() + reminderDelayMin * 60000;
    let finalTitle = trimmedTitle;
    let finalRecurrence: ReminderRecurrence = recurrence;
    let finalWeekday: number | undefined = recurrence === 'weekly' ? recurrenceWeekday : undefined;

    if (scheduleMode === 'custom') {
      const customRes = resolveCustomTimestampMs();
      if (customRes.ok === false) {
        setReminderFormError(customRes.error);
        playHapticSound('listen_stop');
        return;
      }
      triggerAtMs = customRes.ms;
    } else if (!editingReminderId) {
      const nlParsed = parseNaturalReminderSchedule(trimmedTitle);
      if (!nlParsed.needsClarification && nlParsed.triggerAtMs) {
        triggerAtMs = nlParsed.triggerAtMs;
        finalTitle = nlParsed.cleanedTitle || trimmedTitle;
        if (nlParsed.recurrence !== 'none') {
          finalRecurrence = nlParsed.recurrence;
        }
        if (typeof nlParsed.recurrenceWeekday === 'number') {
          finalWeekday = nlParsed.recurrenceWeekday;
        }
      }
    }

    playHapticSound('message_sent');

    if (editingReminderId) {
      // Strictly in-place edit preserving the original reminder ID (zero duplicates)
      const res = updateReminderById(editingReminderId, {
        title: finalTitle,
        description: reminderDescription,
        triggerAtMs,
        recurrence: finalRecurrence,
        recurrenceWeekday: finalRecurrence === 'weekly' ? finalWeekday : undefined
      });
      if (!res.success) {
        setReminderFormError(res.error || 'Could not update reminder.');
        playHapticSound('listen_stop');
        return;
      }
      resetReminderForm();
      reloadAll();
      return;
    }

    const res = addReminderVerified({
      title: finalTitle,
      description: reminderDescription,
      triggerAtMs,
      recurrence: finalRecurrence,
      recurrenceWeekday: finalRecurrence === 'weekly' ? finalWeekday : undefined
    });

    if (!res.success) {
      setReminderFormError(res.error || 'Could not save reminder.');
      playHapticSound('listen_stop');
      return;
    }

    resetReminderForm();
    reloadAll();
  };

  const handleToggleReminder = (id: string) => {
    playHapticSound('switch');
    toggleReminderCompletedById(id);
    reloadAll();
  };

  const handleDeleteReminder = (id: string) => {
    if (editingReminderId === id) {
      resetReminderForm();
    }
    deleteReminderById(id);
    playHapticSound('listen_stop');
    reloadAll();
  };

  // Derived 12h UI fields for custom picker
  const currentAmPm: 'AM' | 'PM' = customHour24 >= 12 ? 'PM' : 'AM';
  const currentHour12 = customHour24 % 12 || 12;

  const setHourFrom12 = (hour12: number, ampm: 'AM' | 'PM') => {
    let next24 = hour12 % 12;
    if (ampm === 'PM') next24 += 12;
    setCustomHour24(next24);
  };

  const formatReminderRecurrenceBadge = (r: UserReminder): string | null => {
    if (!r.recurrence || r.recurrence === 'none') return null;
    if (r.recurrence === 'weekly' && typeof r.recurrenceWeekday === 'number') {
      return `Every ${WEEKDAY_NAMES[r.recurrenceWeekday] || 'Week'}`;
    }
    if (r.recurrence === 'weekday') return 'Mon–Fri';
    return r.recurrence;
  };

  const renderReminderCard = (
    r: UserReminder,
    category: 'overdue' | 'upcoming' | 'completed'
  ) => {
    const recLabel = formatReminderRecurrenceBadge(r);
    const isEditingThis = editingReminderId === r.id;

    const cardClasses =
      category === 'overdue'
        ? 'bg-amber-50/90 border-amber-300 shadow-xs'
        : category === 'completed'
        ? 'bg-slate-50/80 border-slate-200 opacity-75'
        : 'bg-indigo-50/60 border-indigo-100';

    return (
      <div
        key={r.id}
        className={`p-3 rounded-2xl border flex items-start justify-between gap-2 transition-all ${cardClasses} ${
          isEditingThis ? 'ring-2 ring-purple-500' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => handleToggleReminder(r.id)}
          className="flex items-start gap-2.5 text-left min-w-0 flex-1 py-0.5"
          title={r.completed ? 'Mark as pending' : 'Mark as completed'}
        >
          {r.completed ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          ) : category === 'overdue' ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          ) : (
            <Circle className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p
                className={`text-xs font-bold break-words ${
                  r.completed ? 'line-through text-slate-500' : 'text-slate-800'
                }`}
              >
                {r.title}
              </p>
              {category === 'overdue' && (
                <span className="px-1.5 py-0.2 rounded bg-rose-100 border border-rose-200 text-rose-800 text-[9px] font-extrabold uppercase">
                  Overdue
                </span>
              )}
              {category === 'upcoming' && (
                <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 text-[9px] font-bold uppercase">
                  Upcoming
                </span>
              )}
              {category === 'completed' && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold uppercase">
                  Done
                </span>
              )}
            </div>

            {r.description && (
              <p className="text-[11px] text-slate-600 mt-0.5 break-words leading-snug">
                {r.description}
              </p>
            )}

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span
                className={`text-[10px] font-medium ${
                  category === 'overdue' ? 'text-rose-700 font-bold' : 'text-slate-500'
                }`}
              >
                {new Date(r.time).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: use12Hour
                })}
              </span>
              {recLabel && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 text-[9px] font-bold uppercase">
                  <Repeat className="w-2.5 h-2.5" />
                  {recLabel}
                </span>
              )}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => handleBeginEditReminder(r)}
            className="w-8 h-8 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-100 flex items-center justify-center transition-colors"
            title="Edit & Reschedule Reminder"
            aria-label={`Edit reminder ${r.title}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleDeleteReminder(r.id)}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
            title="Delete Reminder"
            aria-label={`Delete reminder ${r.title}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white/95 backdrop-blur-xl w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-purple-100 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-purple-100 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-indigo-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              {activeTab === 'notes' ? <StickyNote className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Notebook &amp; Reminders</h3>
              <p className="text-[10px] text-slate-500">Custom schedules, smart edits &amp; voice alerts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'notes'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-purple-50/70 text-slate-600 hover:bg-purple-100/70'
            }`}
          >
            <StickyNote className="w-3.5 h-3.5" />
            <span>Notes ({notes.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reminders')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'reminders'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-indigo-50/70 text-slate-600 hover:bg-indigo-100/70'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>
              Reminders ({upcomingReminders.length + overdueReminders.length})
            </span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 custom-scrollbar">
          {activeTab === 'notes' ? (
            <>
              <form onSubmit={handleAddNote} className="flex gap-2">
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Write a quick note..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>

              {notes.length > 0 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={noteSearch}
                    onChange={(e) => setNoteSearch(e.target.value)}
                    placeholder="Search saved notes..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
              )}

              {filteredNotes.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  {notes.length === 0
                    ? 'No notes saved yet. Say "Note down buy milk" or add one above!'
                    : `No notes matched "${noteSearch}".`}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredNotes.map((n) => (
                    <div
                      key={n.id}
                      className="p-3 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        {editingNoteId === n.id ? (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={editingNoteText}
                              onChange={(e) => setEditingNoteText(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-purple-300 text-xs text-slate-800 focus:outline-none"
                              autoFocus
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveEditNote(n.id)}
                                className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-[10px] font-bold"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNoteId(null);
                                  setEditingNoteText('');
                                }}
                                className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-500 text-[10px] font-bold"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-medium text-slate-800 whitespace-pre-wrap break-words">
                              {n.text}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {new Date(n.timestamp).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </>
                        )}
                      </div>
                      {editingNoteId !== n.id && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(n.id);
                              setEditingNoteText(n.text);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-700 hover:bg-purple-100"
                            title="Edit Note"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyNote(n)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-700 hover:bg-purple-100"
                            title="Copy Note"
                          >
                            {copiedId === n.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(n.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Delete Note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {exactAlarmMissing && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-[11px] text-amber-900">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>Enable exact alarms for reliable background delivery.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => getNativeZuzuPlugin()?.openExactAlarmSettings?.()}
                    className="px-2 py-1 rounded-lg bg-amber-600 text-white font-bold text-[10px] flex-shrink-0"
                  >
                    Allow
                  </button>
                </div>
              )}

              <form
                onSubmit={handleSubmitReminder}
                className={`p-3 rounded-2xl border space-y-2.5 ${
                  editingReminderId
                    ? 'bg-purple-50/80 border-purple-300 shadow-xs'
                    : 'bg-slate-50/70 border-slate-200'
                }`}
              >
                {editingReminderId && (
                  <div className="flex items-center justify-between text-[11px] font-bold text-purple-800 pb-1 border-b border-purple-200">
                    <span>Editing Existing Reminder (Updates In-Place)</span>
                    <button
                      type="button"
                      onClick={resetReminderForm}
                      className="text-slate-500 hover:text-slate-800 underline text-[10px]"
                    >
                      Cancel Edit
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reminderInput}
                    onChange={(e) => setReminderInput(e.target.value)}
                    placeholder="Reminder title (e.g. Call Mom tomorrow at 8:35 AM)"
                    className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    type="submit"
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 flex-shrink-0"
                  >
                    {editingReminderId ? (
                      <span>Save Changes</span>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Set</span>
                      </>
                    )}
                  </button>
                </div>

                <input
                  type="text"
                  value={reminderDescription}
                  onChange={(e) => setReminderDescription(e.target.value)}
                  placeholder="Optional description or notes..."
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />

                {/* Quick Presets + Custom Toggle */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  {QUICK_PRESETS.map((opt) => (
                    <button
                      type="button"
                      key={opt.min}
                      onClick={() => {
                        setScheduleMode('preset');
                        setReminderDelayMin(opt.min);
                        setReminderFormError(null);
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                        scheduleMode === 'preset' && reminderDelayMin === opt.min
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-indigo-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleMode('custom');
                      setReminderFormError(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 transition-colors ${
                      scheduleMode === 'custom'
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'bg-white border-purple-200 text-purple-700 hover:bg-purple-50'
                    }`}
                  >
                    <Calendar className="w-3 h-3" />
                    <span>Custom</span>
                  </button>
                </div>

                {/* Custom Calendar Date + Hour + Minute + AM/PM / 24H */}
                {scheduleMode === 'custom' && (
                  <div className="p-2.5 rounded-xl bg-white border border-purple-200 space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-slate-600">
                        Calendar Date
                      </label>
                      <button
                        type="button"
                        onClick={() => setUse12Hour((prev) => !prev)}
                        className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200"
                      >
                        {use12Hour ? '12h AM/PM' : '24h Clock'}
                      </button>
                    </div>

                    <input
                      type="date"
                      value={customDate}
                      min={toLocalDateInputValue(Date.now())}
                      onChange={(e) => {
                        setCustomDate(e.target.value);
                        setReminderFormError(null);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400"
                      aria-label="Custom reminder date"
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                          Hour
                        </label>
                        {use12Hour ? (
                          <select
                            value={currentHour12}
                            onChange={(e) => setHourFrom12(parseInt(e.target.value, 10), currentAmPm)}
                            className="w-full px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                            aria-label="Custom hour"
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                              <option key={h} value={h}>
                                {String(h).padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={customHour24}
                            onChange={(e) => setCustomHour24(parseInt(e.target.value, 10))}
                            className="w-full px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                            aria-label="Custom hour 24h"
                          >
                            {Array.from({ length: 24 }, (_, h) => (
                              <option key={h} value={h}>
                                {String(h).padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                          Minute
                        </label>
                        <select
                          value={customMinute}
                          onChange={(e) => setCustomMinute(parseInt(e.target.value, 10))}
                          className="w-full px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                          aria-label="Custom minute"
                        >
                          {Array.from({ length: 60 }, (_, m) => (
                            <option key={m} value={m}>
                              {String(m).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                      </div>

                      {use12Hour ? (
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 mb-0.5">
                            AM / PM
                          </label>
                          <div className="grid grid-cols-2 gap-1 h-[32px]">
                            <button
                              type="button"
                              onClick={() => setHourFrom12(currentHour12, 'AM')}
                              className={`rounded-lg text-[10px] font-extrabold border ${
                                currentAmPm === 'AM'
                                  ? 'bg-purple-600 border-purple-600 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              AM
                            </button>
                            <button
                              type="button"
                              onClick={() => setHourFrom12(currentHour12, 'PM')}
                              className={`rounded-lg text-[10px] font-extrabold border ${
                                currentAmPm === 'PM'
                                  ? 'bg-purple-600 border-purple-600 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              PM
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-end pb-1">
                          <span className="text-[10px] font-mono text-slate-500">
                            {String(customHour24).padStart(2, '0')}:
                            {String(customMinute).padStart(2, '0')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Recurrence Selector */}
                <div className="flex items-center gap-2">
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value as ReminderRecurrence)}
                    className="flex-1 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 focus:outline-none"
                    title="Repeat schedule"
                  >
                    <option value="none">One-time</option>
                    <option value="daily">Every Day (Daily)</option>
                    <option value="weekday">Weekdays (Mon–Fri)</option>
                    <option value="weekly">Weekly (Choose Day)</option>
                  </select>

                  {recurrence === 'weekly' && (
                    <select
                      value={recurrenceWeekday}
                      onChange={(e) => setRecurrenceWeekday(parseInt(e.target.value, 10))}
                      className="px-2.5 py-1.5 rounded-xl bg-white border border-purple-200 text-[11px] font-bold text-purple-800 focus:outline-none"
                      aria-label="Weekly recurrence day"
                    >
                      {WEEKDAY_NAMES.map((name, idx) => (
                        <option key={name} value={idx}>
                          Every {name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {reminderFormError && (
                  <div className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl">
                    {reminderFormError}
                  </div>
                )}
              </form>

              {reminders.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No reminders yet. Say &ldquo;Remind me tomorrow at 8:35 AM&rdquo; or use Quick / Custom above!
                </div>
              ) : (
                <div className="space-y-3">
                  {overdueReminders.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Overdue ({overdueReminders.length})</span>
                      </div>
                      {overdueReminders.map((r) => renderReminderCard(r, 'overdue'))}
                    </div>
                  )}

                  {upcomingReminders.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                        Upcoming ({upcomingReminders.length})
                      </div>
                      {upcomingReminders.map((r) => renderReminderCard(r, 'upcoming'))}
                    </div>
                  )}

                  {completedReminders.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Completed ({completedReminders.length})
                      </div>
                      {completedReminders.map((r) => renderReminderCard(r, 'completed'))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
