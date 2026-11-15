import React, { useState } from 'react';
import { ShieldAlert, Lock, Delete, CheckCircle2, KeyRound, ScanFace, HelpCircle, ArrowLeft } from 'lucide-react';
import { OwnerFaceProfile, SecurityRecoveryHint } from '../types';
import {
  verifyMasterPin,
  setSecurityLocked,
  getLastSecurityLockReason,
  verifySecurityHints,
  hashMasterPin
} from '../utils/faceGuard';
import { playHapticSound } from '../utils/audio';
import { FaceScannerModal } from './FaceScannerModal';

interface MasterPinLockOverlayProps {
  isOpen: boolean;
  masterPinHash: string;
  ownerFaceEnrolled?: boolean;
  ownerFaceProfiles?: OwnerFaceProfile[];
  ownerFaceDescriptor?: number[];
  securityRecoveryHints?: SecurityRecoveryHint[];
  onResetMasterPin?: (newHash: string) => void;
  onUnlocked: () => void;
}

export const MasterPinLockOverlay: React.FC<MasterPinLockOverlayProps> = ({
  isOpen,
  masterPinHash,
  ownerFaceEnrolled = false,
  ownerFaceProfiles = [],
  ownerFaceDescriptor,
  securityRecoveryHints = [],
  onResetMasterPin,
  onUnlocked
}) => {
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  // Live Face Unlock modal state
  const [showFaceUnlock, setShowFaceUnlock] = useState(false);

  // Security Hints PIN Reset flow
  const [recoveryMode, setRecoveryMode] = useState<'none' | 'hints' | 'new_pin'>('none');
  const [hintAnswers, setHintAnswers] = useState<string[]>([]);
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');

  if (!isOpen) return null;

  const lockReason = getLastSecurityLockReason();
  const hasFaceProfiles =
    ownerFaceEnrolled && (ownerFaceProfiles.length > 0 || Boolean(ownerFaceDescriptor?.length));
  const hasConfiguredHints = Array.isArray(securityRecoveryHints) && securityRecoveryHints.length > 0;

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
      setRecoveryMode('none');
      onUnlocked();
    } else {
      playHapticSound('listen_stop');
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setErrorMsg('Incorrect Master PIN. Access strictly denied.');
      setPinInput('');
    }
  };

  const handleVerifyRecoveryHints = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasConfiguredHints) {
      setErrorMsg('No security recovery hints were configured by the owner.');
      return;
    }
    if (verifySecurityHints(securityRecoveryHints, hintAnswers)) {
      playHapticSound('listen_start');
      setErrorMsg(null);
      setRecoveryMode('new_pin');
    } else {
      playHapticSound('listen_stop');
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setErrorMsg('Incorrect security answers. Unauthorized reset blocked.');
    }
  };

  const handleSaveRecoveredPin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPinInput.replace(/\D/g, '');
    if (clean.length < 4 || clean.length > 6) {
      setErrorMsg('New Master PIN must be 4 to 6 digits.');
      return;
    }
    if (clean !== confirmNewPinInput.replace(/\D/g, '')) {
      setErrorMsg('Master PIN confirmation does not match.');
      return;
    }
    const newHash = hashMasterPin(clean);
    onResetMasterPin?.(newHash);
    playHapticSound('switch');
    setSecurityLocked(false);
    setPinInput('');
    setNewPinInput('');
    setConfirmNewPinInput('');
    setHintAnswers([]);
    setRecoveryMode('none');
    setErrorMsg(null);
    onUnlocked();
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
          {recoveryMode === 'hints'
            ? 'Security Recovery Check'
            : recoveryMode === 'new_pin'
            ? 'Set New Master PIN'
            : 'Master PIN Required'}
        </h2>
        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
          {recoveryMode === 'hints'
            ? 'Answer all owner security hints correctly to reset your Master PIN.'
            : recoveryMode === 'new_pin'
            ? 'Identity confirmed! Enter a new 4–6 digit Master PIN.'
            : lockReason}
        </p>

        {errorMsg && (
          <div className="mt-3 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[11px] font-medium">
            {errorMsg}
          </div>
        )}

        {recoveryMode === 'none' && (
          <>
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

            {/* Owner Quick Actions: Live Face Verify + Forgot PIN via Security Hints */}
            <div className="mt-4 space-y-2">
              {hasFaceProfiles && (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setShowFaceUnlock(true);
                  }}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-200 border border-purple-500/30 text-[11px] font-bold flex items-center justify-center gap-1.5"
                >
                  <ScanFace className="w-4 h-4 text-purple-400" />
                  <span>Scan Owner Face to Unlock</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  if (!hasConfiguredHints) {
                    setErrorMsg('No security hints set yet. Only the Master PIN can unlock this device.');
                    return;
                  }
                  setHintAnswers(new Array(securityRecoveryHints.length).fill(''));
                  setRecoveryMode('hints');
                }}
                className="w-full py-1.5 text-[11px] text-slate-400 hover:text-purple-300 font-semibold flex items-center justify-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Reset PIN using Security Hints</span>
              </button>
            </div>
          </>
        )}

        {recoveryMode === 'hints' && (
          <form onSubmit={handleVerifyRecoveryHints} className="mt-4 space-y-2.5 text-left">
            {securityRecoveryHints.map((hint, idx) => (
              <div key={idx} className="space-y-1">
                <label className="text-[10px] font-semibold text-purple-200 block">
                  {hint.question}
                </label>
                <input
                  type="text"
                  value={hintAnswers[idx] || ''}
                  onChange={(e) => {
                    const next = [...hintAnswers];
                    next[idx] = e.target.value;
                    setHintAnswers(next);
                  }}
                  placeholder="Enter your secret answer..."
                  className="w-full bg-slate-800 text-xs text-white px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400"
                />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setRecoveryMode('none');
                }}
                className="py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center gap-1 border border-slate-700"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                className="py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
              >
                Verify Hints
              </button>
            </div>
          </form>
        )}

        {recoveryMode === 'new_pin' && (
          <form onSubmit={handleSaveRecoveredPin} className="mt-4 space-y-2.5 text-left">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPinInput}
              onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="New 4–6 digit Master PIN"
              className="w-full bg-slate-800 text-xs font-mono text-white px-3 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400"
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmNewPinInput}
              onChange={(e) => setConfirmNewPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="Confirm new Master PIN"
              className="w-full bg-slate-800 text-xs font-mono text-white px-3 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400"
            />

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold"
            >
              Save New PIN &amp; Unlock
            </button>
          </form>
        )}

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <KeyRound className="w-3 h-3 text-purple-400" />
          <span>Locked locally • Only owner PIN or Face can unlock</span>
        </div>
      </div>

      {/* Live Camera Owner Verification Modal */}
      <FaceScannerModal
        isOpen={showFaceUnlock}
        mode="verify"
        existingProfiles={ownerFaceProfiles}
        legacyDescriptor={ownerFaceDescriptor}
        lockOnStranger={false}
        onClose={() => setShowFaceUnlock(false)}
        onVerifiedSuccess={() => {
          setShowFaceUnlock(false);
          setSecurityLocked(false);
          setPinInput('');
          setErrorMsg(null);
          onUnlocked();
        }}
      />
    </div>
  );
};
