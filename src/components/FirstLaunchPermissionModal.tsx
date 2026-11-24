import React from 'react';
import {
  Mic,
  Bell,
  MapPin,
  Sparkles,
  Lock,
  ChevronRight
} from 'lucide-react';

interface FirstLaunchPermissionModalProps {
  isOpen: boolean;
  onFinish: () => void;
}

export const FirstLaunchPermissionModal: React.FC<FirstLaunchPermissionModalProps> = ({
  isOpen,
  onFinish
}) => {
  if (!isOpen) return null;

  const handleContinue = () => {
    localStorage.setItem('zuzu_first_launch_done', 'true');
    onFinish();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="bg-white/95 backdrop-blur-2xl border border-purple-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden text-slate-800">
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-purple-300/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-blue-300/30 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 p-0.5 shadow-lg shadow-purple-200 mb-3 flex items-center justify-center overflow-hidden">
            <img
              src="/zuzu-logo.png"
              alt="Zuzu AI"
              className="w-full h-full rounded-[14px] object-cover"
            />
          </div>

          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 border border-purple-200 text-purple-800 text-[10px] font-bold uppercase tracking-wider mb-1.5">
            <Sparkles className="w-3 h-3 text-purple-600" />
            <span>Welcome to Zuzu AI</span>
          </div>

          <h3 className="text-lg font-black text-slate-900 tracking-tight">
            Privacy-First On-Demand Access
          </h3>

          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            Zuzu AI never asks for all permissions at once. Each permission is requested only when you tap a feature that needs it.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-xs font-bold text-slate-900">Microphone</div>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                Requested when you tap the Voice Orb for English &amp; Bengali voice chat.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-xs font-bold text-slate-900">Notifications &amp; Alarms</div>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                Requested when you create scheduled reminders or enable background listening.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-xs font-bold text-slate-900">Location &amp; Camera</div>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                Optional, requested strictly on demand for local weather or camera commands.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-medium">
          <Lock className="w-3 h-3 text-purple-600" />
          <span>Manage anytime inside Settings &gt; Permissions Center</span>
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={handleContinue}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:opacity-95 text-white font-bold text-xs shadow-md shadow-purple-200 flex items-center justify-center gap-1.5 transition-all"
          >
            <span>Get Started</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

