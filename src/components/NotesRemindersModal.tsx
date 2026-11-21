import React, { useState, useEffect } from 'react';
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
  Clock
} from 'lucide-react';
import { getNativeZuzuPlugin } from '../utils/permission';
import { playHapticSound } from '../utils/audio';

export interface NotebookNote {
  id: string;
  text: string;
  timestamp: number;
}

export interface UserReminder {
  id: string;
  title: string;
  time: number;
  completed: boolean;
  notified?: boolean;
}

const NOTES_KEY = 'zuzu_notebook_notes';
const REMINDERS_KEY = 'zuzu_user_reminders';

export function getNotes(): NotebookNote[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getReminders(): UserReminder[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(REMINDERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

export const NotesRemindersModal: React.FC<NotesRemindersModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'notes'
}) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'reminders'>(initialTab);
  const [notes, setNotes] = useState<NotebookNote[]>(() => getNotes());
  const [reminders, setReminders] = useState<UserReminder[]>(() => getReminders());
  const [noteInput, setNoteInput] = useState('');
  const [reminderInput, setReminderInput] = useState('');
  const [reminderDelayMin, setReminderDelayMin] = useState(30);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const reloadAll = () => {
    setNotes(getNotes());
    setReminders(getReminders());
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      reloadAll();
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const onChanged = () => reloadAll();
    window.addEventListener('zuzu-notes-reminders-changed', onChanged);
    return () => window.removeEventListener('zuzu-notes-reminders-changed', onChanged);
  }, []);

  if (!isOpen) return null;

  const persistNotes = (next: NotebookNote[]) => {
    setNotes(next);
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('zuzu-notes-reminders-changed'));
  };

  const persistReminders = (next: UserReminder[]) => {
    setReminders(next);
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('zuzu-notes-reminders-changed'));
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    playHapticSound('message_sent');
    persistNotes([{ id: `note-${Date.now()}`, text: trimmed, timestamp: Date.now() }, ...notes]);
    setNoteInput('');
  };

  const handleAddReminder = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reminderInput.trim();
    if (!trimmed) return;
    playHapticSound('message_sent');
    const triggerAtMs = Date.now() + reminderDelayMin * 60000;
    const newRem: UserReminder = {
      id: `rem-${Date.now()}`,
      title: trimmed,
      time: triggerAtMs,
      completed: false,
      notified: false
    };
    persistReminders([newRem, ...reminders]);
    setReminderInput('');

    const nativePlugin = getNativeZuzuPlugin();
    if (nativePlugin?.scheduleReminderNotification) {
      nativePlugin
        .scheduleReminderNotification({
          id: newRem.id,
          title: 'Zuzu AI Reminder',
          body: newRem.title,
          triggerAtMs
        })
        .catch(() => {});
    }
  };

  const handleCopyNote = async (note: NotebookNote) => {
    try {
      await navigator.clipboard.writeText(note.text);
      setCopiedId(note.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const toggleReminder = (id: string) => {
    playHapticSound('switch');
    persistReminders(
      reminders.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white/95 backdrop-blur-xl w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-purple-100 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-purple-100 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-indigo-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              {activeTab === 'notes' ? <StickyNote className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Notebook & Reminders</h3>
              <p className="text-[10px] text-slate-500">Voice-saved notes & active alerts</p>
            </div>
          </div>
          <button
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
            onClick={() => setActiveTab('reminders')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'reminders'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-indigo-50/70 text-slate-600 hover:bg-indigo-100/70'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Reminders ({reminders.filter((r) => !r.completed).length})</span>
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

              {notes.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No notes saved yet. Say "Note down buy milk" or add one above!
                </div>
              ) : (
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="p-3 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
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
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
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
                          onClick={() => persistNotes(notes.filter((x) => x.id !== n.id))}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Delete Note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <form onSubmit={handleAddReminder} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reminderInput}
                    onChange={(e) => setReminderInput(e.target.value)}
                    placeholder="What should Zuzu remind you about?"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Set</span>
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {[
                    { label: '5m', min: 5 },
                    { label: '15m', min: 15 },
                    { label: '30m', min: 30 },
                    { label: '1h', min: 60 },
                    { label: '3h', min: 180 }
                  ].map((opt) => (
                    <button
                      type="button"
                      key={opt.min}
                      onClick={() => setReminderDelayMin(opt.min)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                        reminderDelayMin === opt.min
                          ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      In {opt.label}
                    </button>
                  ))}
                </div>
              </form>

              {reminders.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No active reminders. Say "Remind me to call Mom in 15 minutes" or add one above!
                </div>
              ) : (
                <div className="space-y-2">
                  {reminders.map((r) => (
                    <div
                      key={r.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                        r.completed
                          ? 'bg-slate-50/70 border-slate-100 opacity-60'
                          : 'bg-indigo-50/50 border-indigo-100'
                      }`}
                    >
                      <button
                        onClick={() => toggleReminder(r.id)}
                        className="flex items-start gap-2.5 text-left min-w-0 flex-1"
                      >
                        {r.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p
                            className={`text-xs font-semibold break-words ${
                              r.completed ? 'line-through text-slate-400' : 'text-slate-800'
                            }`}
                          >
                            {r.title}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {new Date(r.time).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => persistReminders(reminders.filter((x) => x.id !== r.id))}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0"
                        title="Delete Reminder"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
