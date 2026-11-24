import React, { useEffect, useState } from 'react';
import {
  Mic,
  ShieldAlert,
  Settings,
  X,
  CheckCircle2,
  AlertTriangle,
  Lock,
  RefreshCw
} from 'lucide-react';
import {
  checkMicrophonePermission,
  requestMicrophonePermission,
  openAndroidAppSettingsGuide,
  MicrophonePermissionState
} from '../utils/permission';
import { playHapticSound } from '../utils/audio';

interface MicrophonePermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPermissionGranted: () => void;
  initialState?: MicrophonePermissionState;
}

export const MicrophonePermissionModal: React.FC<MicrophonePermissionModalProps> = ({
  isOpen,
  onClose,
  onPermissionGranted,
  initialState = 'prompt'
}) => {
  const [status, setStatus] = useState<MicrophonePermissionState>(initialState);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSettingsGuide, setShowSettingsGuide] = useState(false);

  // Sync live OS/browser permission state every time modal opens.
  // If microphone is already granted, immediately start listening without showing any intermediate granted blocker.
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setErrorMessage(null);
    setShowSettingsGuide(false);
    setIsRequesting(false);
    setStatus(initialState);

    (async () => {
      try {
        const current = await checkMicrophonePermission();
        if (!active) return;
        if (current === 'granted') {
          onPermissionGranted();
          return;
        }
        setStatus(current);
      } catch {
        if (active) setStatus(initialState);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, initialState, onPermissionGranted]);

  if (!isOpen) return null;

  const isPermanent = status === 'permanently_denied';
  const isBlocked = status === 'denied' || status === 'permanently_denied';

  const handleGrantPermission = async () => {
    setIsRequesting(true);
    setErrorMessage(null);
    playHapticSound('message_sent');

    try {
      const result = await requestMicrophonePermission();

      if (result.success && result.state === 'granted') {
        playHapticSound('listen_start');
        onPermissionGranted();
        return;
      }

      setStatus(result.state);
      setErrorMessage(
        result.error ||
          (result.state === 'permanently_denied'
            ? 'Microphone permission was permanently denied. Enable Microphone in Android App Settings to use Voice Assistant.'
            : 'Microphone access was denied. Zuzu AI needs microphone permission to hear your voice commands.')
      );
      playHapticSound('listen_stop');
    } catch (err: any) {
      setStatus('denied');
      setErrorMessage(err?.message || 'Failed to request microphone permission.');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleRecheckAfterSettings = async () => {
    setIsChecking(true);
    setErrorMessage(null);
    try {
      const current = await checkMicrophonePermission();
      if (current === 'granted') {
        playHapticSound('listen_start');
        onPermissionGranted();
        return;
      }
      setStatus(current);
      setErrorMessage('Microphone is still turned off. Please allow Microphone inside App Settings and try again.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleOpenSettings = async () => {
    await openAndroidAppSettingsGuide();
    setShowSettingsGuide(true);
    playHapticSound('message_sent');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="bg-white/95 backdrop-blur-xl border border-purple-200/90 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden text-slate-800">
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-purple-200/40 rounded-full blur-3xl pointer-events-none"></div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div
            className={`w-16 h-16 rounded-2xl p-1 mb-4 flex items-center justify-center shadow-sm transition-all ${
              isBlocked
                ? 'bg-gradient-to-br from-rose-400 to-red-500 shadow-rose-200'
                : 'bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-200 animate-pulse'
            }`}
          >
            <div className="w-full h-full bg-white rounded-xl flex items-center justify-center">
              {isBlocked ? (
                <ShieldAlert className="w-8 h-8 text-rose-600" />
              ) : (
                <Mic className="w-8 h-8 text-purple-600" />
              )}
            </div>
          </div>

          <span className="text-[10px] font-bold tracking-widest text-purple-700 uppercase bg-purple-100/80 border border-purple-200 px-2.5 py-0.5 rounded-full mb-1.5 flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" /> Microphone Access
          </span>

          <h3 className="text-lg font-black text-slate-900 tracking-tight">
            {isPermanent
              ? 'Microphone Blocked in Settings'
              : isBlocked
              ? 'Microphone Permission Needed'
              : 'Enable Microphone for Voice'}
          </h3>

          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            {isPermanent
              ? 'Microphone permission was blocked permanently on this device. Open App Settings -> Permissions -> Microphone and choose Allow.'
              : isBlocked
              ? 'Zuzu AI cannot capture your voice until microphone permission is enabled.'
              : 'Zuzu AI requests microphone permission only when you use Voice Assistant, Wake Triggers, or speech dictation.'}
          </p>
        </div>

        <div className="mt-4 p-3.5 bg-purple-50/60 border border-purple-100 rounded-2xl space-y-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
            <span>Live voice recognition in English &amp; Bengali</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
            <span>Voice answers, reminders, and app launch commands</span>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <span className="text-[11px] leading-tight">{errorMessage}</span>
          </div>
        )}

        {showSettingsGuide && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1 animate-fade-in">
            <div className="font-bold text-[11px] uppercase tracking-wider text-amber-800">
              Enable in Settings:
            </div>
            <ol className="list-decimal list-inside text-[10px] space-y-0.5 text-amber-800">
              <li>Open <strong>Permissions</strong> &gt; <strong>Microphone</strong>.</li>
              <li>Select <strong>Allow only while using the app</strong>.</li>
              <li>Return to Zuzu AI and tap <strong>Re-check &amp; Start</strong>.</li>
            </ol>
          </div>
        )}

        <div className="mt-5 space-y-2">
          {!isPermanent ? (
            <button
              onClick={handleGrantPermission}
              disabled={isRequesting}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs tracking-wide shadow-md shadow-purple-200 flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isRequesting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Requesting Microphone...</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>{isBlocked ? 'Allow Microphone & Start' : 'Grant Microphone Permission'}</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleOpenSettings}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 text-white font-bold text-xs tracking-wide shadow-md shadow-rose-200 flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all"
            >
              <Settings className="w-4 h-4" />
              <span>Open App Settings</span>
            </button>
          )}

          {isBlocked && (
            <div className="flex gap-2">
              {!isPermanent && (
                <button
                  onClick={handleOpenSettings}
                  className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                >
                  <Settings className="w-3.5 h-3.5 text-purple-600" />
                  <span>App Settings</span>
                </button>
              )}
              <button
                onClick={handleRecheckAfterSettings}
                disabled={isChecking}
                className="flex-1 py-2.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs border border-purple-200 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                <span>Re-check &amp; Start</span>
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold text-center transition-colors"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
};

