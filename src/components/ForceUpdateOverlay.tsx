import React from 'react';
import { ArrowUpCircle, Download, Globe2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { APP_VERSION } from '../utils/apiConfig';

export interface ForceUpdatePayload {
  latestVersion: string;
  minSupportedVersion?: string;
  apkDownloadUrl: string;
  websiteUrl: string;
  message: string;
  changelogSummary?: string[];
}

interface ForceUpdateOverlayProps {
  isOpen: boolean;
  updateInfo: ForceUpdatePayload | null;
  onStartOtaUpdate: () => void;
  onDismissPreview?: () => void;
  isPreview?: boolean;
}

export const ForceUpdateOverlay: React.FC<ForceUpdateOverlayProps> = ({
  isOpen,
  updateInfo,
  onStartOtaUpdate,
  onDismissPreview,
  isPreview = false
}) => {
  if (!isOpen || !updateInfo) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/75 backdrop-blur-xl flex items-center justify-center p-5 select-none animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-white border border-purple-200 p-6 text-center shadow-2xl text-slate-800 relative overflow-hidden">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 p-0.5 shadow-lg shadow-purple-200 mx-auto mb-3.5 flex items-center justify-center overflow-hidden">
          <img
            src="/zuzu-logo.png"
            alt="Zuzu AI"
            className="w-full h-full rounded-[14px] object-cover"
          />
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-bold uppercase tracking-wider mb-2">
          <AlertTriangle className="w-3 h-3" />
          <span>Update Required</span>
        </div>

        <h2 className="text-xl font-black text-slate-900 tracking-tight">
          Zuzu AI {updateInfo.latestVersion} Ready
        </h2>

        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          {updateInfo.message}
        </p>

        <div className="my-3.5 p-3 rounded-2xl bg-purple-50/80 border border-purple-100 text-left space-y-1 text-[11px]">
          <div className="flex justify-between font-semibold text-slate-700">
            <span>Installed Build:</span>
            <span className="font-mono text-slate-500">v{APP_VERSION}</span>
          </div>
          <div className="flex justify-between font-bold text-purple-800">
            <span>Required Release:</span>
            <span className="font-mono">{updateInfo.latestVersion}</span>
          </div>
          {updateInfo.changelogSummary && updateInfo.changelogSummary.length > 0 && (
            <div className="pt-1.5 mt-1.5 border-t border-purple-100 text-[10px] text-slate-600 space-y-1">
              {updateInfo.changelogSummary.slice(0, 3).map((item, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="text-purple-600 font-bold">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 mt-4">
          <a
            href={updateInfo.apkDownloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-purple-200 flex items-center justify-center gap-1.5 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Download Latest APK</span>
          </a>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={updateInfo.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
            >
              <Globe2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Official Web</span>
            </a>

            <button
              type="button"
              onClick={onStartOtaUpdate}
              className="py-2 px-3 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-800 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Open Updater</span>
            </button>
          </div>

          {isPreview && onDismissPreview && (
            <button
              type="button"
              onClick={onDismissPreview}
              className="w-full py-1.5 text-[11px] text-slate-400 hover:text-slate-600 font-semibold"
            >
              Dismiss Preview
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
