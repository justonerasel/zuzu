import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Mic, 
  MapPin, 
  Sparkles, 
  CheckCircle2, 
  X, 
  Lock,
  ChevronRight
} from 'lucide-react';
import { requestMicrophonePermission } from '../utils/permission';
import { playHapticSound } from '../utils/audio';

interface FirstLaunchPermissionModalProps {
  isOpen: boolean;
  onFinish: () => void;
}

export const FirstLaunchPermissionModal: React.FC<FirstLaunchPermissionModalProps> = ({
  isOpen,
  onFinish
}) => {
  const [isRequesting, setIsRequesting] = useState(false);
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const [locGranted, setLocGranted] = useState<boolean | null>(null);

  if (!isOpen) return null;

  const handleAllowContinue = async () => {
    setIsRequesting(true);
    playHapticSound('message_sent');

    // 1. Request Microphone
    let micOk = false;
    try {
      const micRes = await requestMicrophonePermission();
      micOk = micRes.success && micRes.state === 'granted';
      setMicGranted(micOk);
      localStorage.setItem('zuzu_perm_status_microphone', micOk ? 'granted' : 'denied');
    } catch {
      setMicGranted(false);
      localStorage.setItem('zuzu_perm_status_microphone', 'denied');
    }

    // 2. Request Location
    let locOk = false;
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      try {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              locOk = true;
              setLocGranted(true);
              localStorage.setItem('zuzu_perm_status_location', 'granted');
              resolve();
            },
            () => {
              locOk = false;
              setLocGranted(false);
              localStorage.setItem('zuzu_perm_status_location', 'denied');
              resolve();
            },
            { timeout: 5000, enableHighAccuracy: true }
          );
        });
      } catch {
        setLocGranted(false);
        localStorage.setItem('zuzu_perm_status_location', 'denied');
      }
    }

    setIsRequesting(false);
    playHapticSound('listen_start');

    // Mark first launch finished in localStorage
    localStorage.setItem('zuzu_first_launch_done', 'true');

    setTimeout(() => {
      onFinish();
    }, 600);
  };

  const handleNotNow = () => {
    playHapticSound('listen_stop');
    // Set first launch flag so user is not prompted again immediately
    localStorage.setItem('zuzu_first_launch_done', 'true');
    onFinish();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="bg-white/95 backdrop-blur-2xl border border-purple-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden text-slate-800">
        {/* Glow ambient background decoration */}
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-purple-300/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-blue-300/30 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 p-0.5 shadow-lg shadow-purple-200 mb-3 flex items-center justify-center">
            <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center text-purple-600">
              <ShieldCheck className="w-7 h-7" />
            </div>
          </div>

          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 border border-purple-200 text-purple-800 text-[10px] font-bold uppercase tracking-wider mb-1.5">
            <Sparkles className="w-3 h-3 text-purple-600" />
            <span>Welcome to Zuzu AI</span>
          </div>

          <h3 className="text-lg font-black text-slate-900 tracking-tight">
            Enable Permissions for Best Experience
          </h3>

          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            Zuzu AI needs permission to hear your voice commands and provide hyper-local weather and reminders.
          </p>
        </div>

        {/* Permission items list */}
        <div className="mt-4 space-y-2.5">
          {/* 1. Microphone */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Mic className="w-5 h-5" />
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Microphone Access</span>
                {micGranted === true && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                    Granted ✓
                  </span>
                )}
                {micGranted === false && (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded-full">
                    Denied ✗
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                Powers real-time dual-gender voice conversations and continuous hands-free listening.
              </p>
            </div>
          </div>

          {/* 2. Precise Location */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Precise Location</span>
                {locGranted === true && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                    Granted ✓
                  </span>
                )}
                {locGranted === false && (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded-full">
                    Denied ✗
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                Powers your live weather card and contextual local time &amp; weather forecasts.
              </p>
            </div>
          </div>
        </div>

        {/* Security badge */}
        <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-medium">
          <Lock className="w-3 h-3 text-purple-600" />
          <span>Your data stays private &amp; processed on-device</span>
        </div>

        {/* Actions: Allow / Continue and Not Now */}
        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={handleAllowContinue}
            disabled={isRequesting}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:opacity-95 text-white font-bold text-xs shadow-md shadow-purple-200 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            <span>{isRequesting ? 'Requesting Permissions...' : 'Allow / Continue'}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleNotNow}
            className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold transition-colors text-center"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
};
