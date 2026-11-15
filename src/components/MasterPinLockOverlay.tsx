import React, { useState } from 'react';
import { ShieldAlert, Lock, Delete, CheckCircle2, KeyRound } from 'lucide-react';
import { verifyMasterPin, setSecurityLocked, getLastSecurityLockReason } from '../utils/faceGuard';
import { playHapticSound } from '../utils/audio';

interface MasterPinLockOverlayProps {
  isOpen: boolean;
  masterPinHash: string;
  onUnlocked: () => void;
}

export const MasterPinLockOverlay: React.FC<MasterPinLockOverlayProps> = ({
  isOpen,
  masterPinHash,
  onUnlocked
}) => {
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  if (!isOpen) return null;

  const lockReason = getLastSecurityLockReason();

  const handleDigit = (digit: string) => {
    if (pinInput.length >= 6) return;
    playHapticSound('message_sent');
    setErrorMsg(null);
    setPinInput(prev => prev + digit);
  };

  const handleBackspace = () => {
    playHapticSound('listen_stop');
    setErrorMsg(null);
    setPinInput(prev => prev.slice(0, -1));
  };

  const handleVerify = () => {
    if (pinInput.length < 4) {
      setErrorMsg('Enter your 4 to 6 digit Master PIN.');
      return;
    }

    if (verifyMasterPin(pinInput, masterPinHash)) {
      playHapticSound('switch');
      setSecurityLocked(false);
      setPinInput('');
      setErrorMsg(null);
      onUnlocked();
    } else {
      playHapticSound('listen_stop');
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setErrorMsg('Incorrect Master PIN. Access strictly denied.');
      setPinInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-5 select-none animate-fade-in">
      <div
        className={`w-full max-w-xs rounded-3xl bg-slate-900/95 border border-rose-500/40 p-6 text-center shadow-2xl text-white transition-transform ${
          shake ? 'translate-x-1' : ''
        }`}
      >
        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-400/40 text-rose-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-rose-950/50">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-bold uppercase tracking-wider mb-2">
          <Lock className="w-3 h-3" />
          <span>Anti-Theft Guard Active</span>
        </div>

        <h2 className="text-lg font-black tracking-tight text-white">
          Master PIN Required
        </h2>
        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
          {lockReason}
        </p>

        {/* PIN Dots Indicator */}
        <div className="my-4 flex items-center justify-center gap-2.5 h-8">
          {[0, 1, 2, 3, 4, 5].map(idx => {
            const filled = idx < pinInput.length;
            if (idx >= 4 && pinInput.length <= 4) return null;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all border ${
                  filled
                    ? 'bg-purple-400 border-purple-300 scale-110 shadow-sm shadow-purple-500/60'
                    : 'bg-slate-800 border-slate-600'
                }`}
              />
            );
          })}
        </div>

        {errorMsg && (
          <div className="mb-3 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[11px] font-medium">
            {errorMsg}
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 mt-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              className="h-12 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-base font-bold text-white border border-slate-700/80 transition-all"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-12 rounded-2xl bg-slate-800/60 hover:bg-slate-700 active:scale-95 flex items-center justify-center text-slate-300 border border-slate-700/60 transition-all"
            title="Backspace"
          >
            <Delete className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-12 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-base font-bold text-white border border-slate-700/80 transition-all"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleVerify}
            className="h-12 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 flex items-center justify-center text-white font-bold border border-purple-400/40 shadow-md transition-all"
            title="Unlock"
          >
            <CheckCircle2 className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <KeyRound className="w-3 h-3 text-purple-400" />
          <span>Locked locally • Only owner PIN can unlock</span>
        </div>
      </div>
    </div>
  );
};
