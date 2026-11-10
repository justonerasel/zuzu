import React, { useState } from 'react';
import { Calendar, Sparkles } from 'lucide-react';
import { getTodayHighlights, TodayHighlightData } from '../utils/dailyHighlights';

export const BengaliMarqueeWidget: React.FC = () => {
  const [data] = useState<TodayHighlightData>(() => getTodayHighlights());

  return (
    <div className="w-full rounded-2xl bg-white/85 backdrop-blur-md border border-purple-200/80 px-2.5 py-1.5 shadow-xs flex items-center gap-2 overflow-hidden text-slate-800 select-none">
      {/* Left Pinned LED Badge */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white font-bold text-[10px] tracking-wide flex-shrink-0 z-20 shadow-xs font-['Noto_Sans_Bengali']">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
        <span className="font-semibold">আজকের দিবস</span>
      </div>

      {/* Single-Layer Horizontal Scrolling LED Marquee Ticker */}
      <div className="relative overflow-hidden flex-1 h-6 flex items-center">
        {/* Left and Right Fade Gradient Masks */}
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-white/90 to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-white/90 to-transparent pointer-events-none z-10" />

        {/* Continuous Looping Single-Line Bengali Text */}
        <div className="animate-marquee flex items-center whitespace-nowrap text-[11px] font-medium font-['Noto_Sans_Bengali'] text-slate-800 tracking-wide">
          <span className="inline-flex items-center gap-3 pr-8">
            <span className="font-bold text-purple-700">
              📅 {data.bengaliDayString}, {data.bengaliFullDateString}
            </span>
            <span className="text-purple-400">•</span>
            <span className="text-slate-600">
              {data.bengaliDateString}
            </span>
            <span className="text-purple-400">•</span>
            <span className="font-semibold text-slate-700">
              বিশেষ দিবস:
            </span>
            {data.events.map((ev, i) => (
              <React.Fragment key={ev.id || i}>
                <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-900 border border-purple-200/60 px-1.5 py-0.2 rounded font-medium">
                  <span>{ev.emoji}</span>
                  <span>{ev.title}</span>
                </span>
                {i < data.events.length - 1 && (
                  <span className="text-purple-300">✦</span>
                )}
              </React.Fragment>
            ))}
            <span className="text-purple-400">•</span>
            <span className="text-indigo-600 font-medium">
              ⚡ জুজু এআই সর্বদা প্রস্তুত
            </span>
          </span>

          {/* Duplicate node for seamless endless ticker tape loop */}
          <span className="inline-flex items-center gap-3 pr-8" aria-hidden="true">
            <span className="font-bold text-purple-700">
              📅 {data.bengaliDayString}, {data.bengaliFullDateString}
            </span>
            <span className="text-purple-400">•</span>
            <span className="text-slate-600">
              {data.bengaliDateString}
            </span>
            <span className="text-purple-400">•</span>
            <span className="font-semibold text-slate-700">
              বিশেষ দিবস:
            </span>
            {data.events.map((ev, i) => (
              <React.Fragment key={`dup-${ev.id || i}`}>
                <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-900 border border-purple-200/60 px-1.5 py-0.2 rounded font-medium">
                  <span>{ev.emoji}</span>
                  <span>{ev.title}</span>
                </span>
                {i < data.events.length - 1 && (
                  <span className="text-purple-300">✦</span>
                )}
              </React.Fragment>
            ))}
            <span className="text-purple-400">•</span>
            <span className="text-indigo-600 font-medium">
              ⚡ জুজু এআই সর্বদা প্রস্তুত
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
