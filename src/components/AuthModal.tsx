import React, { useState, useEffect, useId } from 'react';
import {
  X,
  Phone,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { ConfirmationResult, User } from 'firebase/auth';
import {
  PHONE_COUNTRIES,
  clearRecaptchaVerifier,
  confirmPhoneOtpCode,
  sendPhoneOtpCode,
  signInWithGoogleAuth
} from '../utils/authService';
import { playHapticSound } from '../utils/audio';

interface AuthModalProps {
  isOpen: boolean;
  mode?: 'signin' | 'link_phone';
  onClose: () => void;
  onAuthenticated?: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  mode = 'signin',
  onClose,
  onAuthenticated
}) => {
  const uid = useId().replace(/:/g, '');
  const recaptchaContainerId = `zuzu-recaptcha-${uid}`;

  const [step, setStep] = useState<'choose' | 'otp'>('choose');
  const [selectedDialCode, setSelectedDialCode] = useState<string>('+880');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [sentE164, setSentE164] = useState<string>('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [resendCooldownSec, setResendCooldownSec] = useState<number>(0);

  const [googleLoading, setGoogleLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      clearRecaptchaVerifier();
      setStep('choose');
      setOtpInput('');
      setConfirmationResult(null);
      setErrorMsg(null);
      setInfoMsg(null);
      setGoogleLoading(false);
      setOtpLoading(false);
      return;
    }
    setStep('choose');
    setErrorMsg(null);
    setInfoMsg(null);
  }, [isOpen, mode]);

  useEffect(() => {
    if (resendCooldownSec <= 0) return;
    const timer = setInterval(() => {
      setResendCooldownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldownSec]);

  if (!isOpen) return null;

  const selectedCountry =
    PHONE_COUNTRIES.find((c) => c.dialCode === selectedDialCode && (selectedDialCode !== '+1' || c.code === 'US')) ||
    PHONE_COUNTRIES[0];

  const handleGoogleContinue = async () => {
    if (googleLoading || otpLoading) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setGoogleLoading(true);
    playHapticSound('message_sent');
    try {
      const res = await signInWithGoogleAuth();
      if (res.success && res.user) {
        playHapticSound('listen_start');
        onAuthenticated?.(res.user);
        onClose();
        return;
      }
      if (!res.cancelled) {
        setErrorMsg(res.error || 'Google sign-in failed.');
        playHapticSound('listen_stop');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (otpLoading || googleLoading) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setOtpLoading(true);
    playHapticSound('message_sent');

    try {
      const res = await sendPhoneOtpCode({
        dialCode: selectedDialCode,
        phoneInput,
        recaptchaContainerId,
        mode: mode === 'link_phone' ? 'link' : 'signin'
      });

      if (!res.success || !res.confirmationResult || !res.e164Phone) {
        setErrorMsg(res.error || 'Failed to send verification code.');
        playHapticSound('listen_stop');
        return;
      }

      setConfirmationResult(res.confirmationResult);
      setSentE164(res.e164Phone);
      setStep('otp');
      setOtpInput('');
      setResendCooldownSec(60);
      setInfoMsg(`Verification SMS sent to ${res.e164Phone}`);
      playHapticSound('listen_start');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldownSec > 0 || otpLoading) return;
    await handleSendOtp();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult || otpLoading) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setOtpLoading(true);
    playHapticSound('message_sent');

    try {
      const res = await confirmPhoneOtpCode(confirmationResult, otpInput);
      if (!res.success || !res.user) {
        setErrorMsg(res.error || 'OTP verification failed.');
        playHapticSound('listen_stop');
        return;
      }
      playHapticSound('listen_start');
      onAuthenticated?.(res.user);
      onClose();
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white/95 backdrop-blur-xl w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-purple-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-purple-100 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-indigo-50">
          <div className="flex items-center gap-2.5">
            {step === 'otp' ? (
              <button
                type="button"
                onClick={() => {
                  setStep('choose');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className="w-9 h-9 rounded-xl bg-white border border-purple-100 text-slate-600 hover:text-purple-700 flex items-center justify-center"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <img
                src="/zuzu-logo.png"
                alt="Zuzu AI"
                className="w-10 h-10 rounded-xl object-cover border border-purple-200 shadow-xs"
              />
            )}
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">
                {mode === 'link_phone'
                  ? 'Link Mobile Number'
                  : step === 'otp'
                  ? 'Verify OTP Code'
                  : 'Sign In to Zuzu AI'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {mode === 'link_phone'
                  ? 'Add SMS verification to your existing account'
                  : 'Private per-account backup & multi-device sync'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
            aria-label="Close sign-in modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{infoMsg}</span>
            </div>
          )}

          {step === 'choose' ? (
            <>
              {mode === 'signin' && (
                <>
                  <button
                    type="button"
                    disabled={googleLoading || otpLoading}
                    onClick={handleGoogleContinue}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 shadow-sm text-slate-800 text-xs font-bold flex items-center justify-center gap-2.5 transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    {googleLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                    ) : (
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                        />
                      </svg>
                    )}
                    <span>{googleLoading ? 'Connecting Google Account...' : 'Continue with Google'}</span>
                  </button>

                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-slate-200" />
                    <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Or Mobile OTP
                    </span>
                    <div className="flex-grow border-t border-slate-200" />
                  </div>
                </>
              )}

              <form onSubmit={handleSendOtp} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-purple-600" />
                    <span>Mobile Number (SMS OTP)</span>
                  </label>

                  <div className="flex gap-2">
                    <select
                      value={selectedDialCode}
                      onChange={(e) => setSelectedDialCode(e.target.value)}
                      className="min-h-[44px] px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400 max-w-[138px]"
                      aria-label="Country dial code"
                    >
                      {PHONE_COUNTRIES.map((country) => (
                        <option key={`${country.code}-${country.dialCode}`} value={country.dialCode}>
                          {country.flag} {country.dialCode} ({country.code})
                        </option>
                      ))}
                    </select>

                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder={selectedCountry.sample}
                      className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Default: Bangladesh (+880). Leading 0 is automatically formatted to E.164.
                  </p>
                </div>

                <div id={recaptchaContainerId} />

                <button
                  type="submit"
                  disabled={otpLoading || googleLoading || !phoneInput.trim()}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {otpLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Verification Code...</span>
                    </>
                  ) : (
                    <span>Send OTP</span>
                  )}
                </button>
              </form>

              <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-100 text-[10px] text-slate-600 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <span>
                  Authenticated strictly via Firebase Authentication. Each account keeps an isolated private workspace for chats, voice sessions, notes, reminders, and memories.
                </span>
              </div>
            </>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3.5">
              <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase text-indigo-600">SMS Sent To</div>
                  <div className="text-xs font-mono font-extrabold text-slate-800">{sentE164}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('choose');
                    setErrorMsg(null);
                  }}
                  className="text-[11px] font-bold text-indigo-700 hover:underline px-2 py-1"
                >
                  Change number
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600">
                  Enter 6-Digit OTP Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-center text-lg font-mono font-black tracking-[0.45em] text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
              </div>

              <div id={recaptchaContainerId} />

              <button
                type="submit"
                disabled={otpLoading || otpInput.length !== 6}
                className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {otpLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying OTP...</span>
                  </>
                ) : (
                  <span>Verify &amp; Continue</span>
                )}
              </button>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">Didn&apos;t receive SMS?</span>
                <button
                  type="button"
                  disabled={resendCooldownSec > 0 || otpLoading}
                  onClick={handleResendOtp}
                  className="text-[11px] font-bold text-purple-700 hover:text-purple-900 disabled:text-slate-400 flex items-center gap-1 min-h-[36px] px-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>
                    {resendCooldownSec > 0 ? `Resend OTP in ${resendCooldownSec}s` : 'Resend OTP'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
