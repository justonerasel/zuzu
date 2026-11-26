import React, { useEffect, useRef, useState } from 'react';

interface IntroSplashProps {
  onComplete: () => void;
}

export const IntroSplash: React.FC<IntroSplashProps> = ({ onComplete }) => {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const completedRef = useRef(false);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearAllTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  const finishOnce = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    clearAllTimers();
    onComplete();
  };

  const triggerExit = (fadeDurationMs: number) => {
    if (completedRef.current) return;
    clearAllTimers();
    setIsFadingOut(true);
    const doneTimer = setTimeout(() => {
      finishOnce();
    }, fadeDurationMs);
    timersRef.current.push(doneTimer);
  };

  useEffect(() => {
    // Total lifecycle ~2.0s: hold/reveal ~1.62s, smooth fade out ~380ms
    const fadeTimer = setTimeout(() => {
      triggerExit(380);
    }, 1620);
    timersRef.current.push(fadeTimer);

    return () => {
      clearAllTimers();
    };
  }, []);

  const handleSkip = () => {
    if (isFadingOut) {
      finishOnce();
      return;
    }
    triggerExit(200);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Zuzu AI splash screen, tap to continue"
      onClick={handleSkip}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          e.preventDefault();
          handleSkip();
        }
      }}
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-center px-6 select-none cursor-pointer overflow-hidden transition-opacity ${
        isFadingOut ? 'opacity-0 duration-300 ease-out pointer-events-none' : 'opacity-100 duration-200'
      }`}
      style={{
        background:
          'radial-gradient(circle at 50% 44%, rgba(68, 28, 128, 0.34) 0%, rgba(16, 11, 34, 0.96) 54%, #06040d 100%)'
      }}
    >
      {/* Logo + Soft Purple Glow */}
      <div className="relative flex flex-col items-center">
        <div
          aria-hidden="true"
          className="animate-splash-glow pointer-events-none absolute -inset-12 rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(168, 85, 247, 0.55) 0%, rgba(124, 58, 237, 0.28) 48%, rgba(88, 28, 135, 0) 75%)'
          }}
        />
        <div
          aria-hidden="true"
          className="animate-splash-glow pointer-events-none absolute -inset-4 rounded-full blur-xl"
          style={{
            background:
              'radial-gradient(circle, rgba(216, 180, 254, 0.32) 0%, rgba(147, 51, 234, 0.14) 55%, transparent 80%)'
          }}
        />

        <div className="animate-splash-logo relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl p-[2px] bg-gradient-to-tr from-purple-500/80 via-violet-400/70 to-white/60 shadow-[0_0_48px_rgba(147,51,234,0.45)]">
          <div className="w-full h-full rounded-[22px] overflow-hidden bg-[#0c081a] flex items-center justify-center">
            <img
              src="/zuzu-logo.png"
              alt="Zuzu AI"
              className="w-full h-full object-cover"
              draggable={false}
            />
          </div>
        </div>

        <div className="animate-splash-text mt-6 flex flex-col items-center text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Zuzu AI
          </h1>
          <p className="mt-1.5 text-sm sm:text-base font-medium tracking-wide text-purple-200/85">
            Your Smart AI Assistant
          </p>
        </div>
      </div>

      {/* Subtle bottom skip hint */}
      <span className="animate-splash-text absolute bottom-8 text-[11px] font-medium tracking-wider uppercase text-purple-200/40">
        Tap anywhere to skip
      </span>
    </div>
  );
};
