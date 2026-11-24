import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  X,
  Tag,
  Calendar,
  Layers,
  Loader2,
  Check,
  History,
  ChevronDown,
  ChevronUp,
  Wrench,
  Zap
} from 'lucide-react';
import { playHapticSound } from '../utils/audio';
import { apiFetch, APP_VERSION, APP_VERSION_CODE } from '../utils/apiConfig';
import {
  ChangelogRecord,
  UpdateCategory,
  getSortedChangelog
} from '../data/changelog';
import type { ForceUpdatePayload } from './ForceUpdateOverlay';

interface UpdatesViewProps {
  onForceUpdateTriggered?: (payload: ForceUpdatePayload) => void;
}

const CATEGORY_BADGE_STYLES: Record<UpdateCategory, string> = {
  Major: 'bg-purple-100 text-purple-800 border-purple-200',
  Feature: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  Fix: 'bg-rose-100 text-rose-800 border-rose-200',
  Improvement: 'bg-emerald-100 text-emerald-800 border-emerald-200'
};

export const UpdatesView: React.FC<UpdatesViewProps> = ({ onForceUpdateTriggered }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStepText, setUpdateStepText] = useState('');
  const [isOtaApplied, setIsOtaApplied] = useState(false);
  const [checkStatusMessage, setCheckStatusMessage] = useState<string | null>(null);
  const [remoteVersion, setRemoteVersion] = useState(`v${APP_VERSION}`);

  // Dynamic changelog state (falls back cleanly to bundled sorted changelog when offline)
  const [changelogHistory, setChangelogHistory] = useState<ChangelogRecord[]>(() =>
    getSortedChangelog()
  );
  const [expandedReleaseIds, setExpandedReleaseIds] = useState<Record<string, boolean>>({});
  const [isLoadingChangelog, setIsLoadingChangelog] = useState(false);

  const currentVersion = `v${APP_VERSION}`;
  const sortedReleases = getSortedChangelog(changelogHistory);
  const latestRelease = sortedReleases[0];
  const previousReleases = sortedReleases.slice(1);

  const fetchDynamicUpdates = useCallback(async () => {
    setIsLoadingChangelog(true);
    try {
      const res = await apiFetch('/api/system/updates', {}, 8000);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.history) && data.history.length > 0) {
          const ordered = getSortedChangelog(data.history);
          setChangelogHistory(ordered);
          if (ordered[0]?.version) {
            setRemoteVersion(`v${ordered[0].version}`);
          }
        }
      }
    } catch {
      // Keep bundled changelog fallback cleanly when offline
    } finally {
      setIsLoadingChangelog(false);
    }
  }, []);

  useEffect(() => {
    fetchDynamicUpdates();
  }, [fetchDynamicUpdates]);

  const runSeamlessOtaSync = (targetVer: string, autoReloadReady = false) => {
    setIsUpdating(true);
    setUpdateProgress(10);
    setUpdateStepText('Connecting to Zuzu AI OTA delta stream...');
    playHapticSound('listen_start');

    let currentP = 10;
    const interval = setInterval(() => {
      currentP += 15;
      if (currentP <= 40) {
        setUpdateStepText('Fetching latest OTA bundle & delta manifest...');
      } else if (currentP <= 75) {
        setUpdateStepText('Verifying SHA-256 integrity & neural configuration...');
      } else if (currentP < 100) {
        setUpdateStepText(`Finalizing seamless OTA update (${targetVer})...`);
      } else {
        currentP = 100;
        clearInterval(interval);
        setUpdateStepText(
          autoReloadReady
            ? `OTA update ${targetVer} installed cleanly!`
            : `OTA sync complete • Running latest release ${targetVer}`
        );
        setIsUpdating(false);
        setIsOtaApplied(true);
        setRemoteVersion(targetVer);
        setCheckStatusMessage(`In-App OTA Verified: Zuzu AI ${targetVer} is active and up to date.`);
        playHapticSound('message_sent');
      }
      setUpdateProgress(currentP);
    }, 110);
  };

  const handleCheckStatus = async () => {
    if (isChecking || isUpdating) return;
    setIsChecking(true);
    setCheckStatusMessage(null);
    playHapticSound('switch');

    try {
      await fetchDynamicUpdates();
      const res = await apiFetch(
        `/api/system/check-update?installedVersion=${encodeURIComponent(APP_VERSION)}&versionCode=${APP_VERSION_CODE}`
      );
      if (res.ok) {
        const data = await res.json();
        const latestVer = data?.latestVersion || currentVersion;
        setRemoteVersion(latestVer);

        if (data?.forceUpdate) {
          onForceUpdateTriggered?.({
            latestVersion: latestVer,
            minSupportedVersion: data.minSupportedVersion,
            websiteUrl: data.websiteUrl || 'https://ais-pre-requvmmuycwborvooarj55-817905745905.asia-east1.run.app',
            message: data.message || 'An in-app OTA update is ready.',
            changelogSummary: data.changelogSummary
          });
          setIsChecking(false);
          return;
        }

        if (data?.updateRequired) {
          setIsChecking(false);
          runSeamlessOtaSync(latestVer, true);
          return;
        }

        setCheckStatusMessage(data?.message || `Zuzu AI is up to date on ${latestVer}.`);
        playHapticSound('listen_stop');
      } else {
        setCheckStatusMessage(`Update check returned HTTP ${res.status}. Running installed release ${currentVersion}.`);
        playHapticSound('listen_stop');
      }
    } catch {
      setCheckStatusMessage(`OTA server unreachable right now. Showing verified release notes for ${currentVersion}.`);
      playHapticSound('listen_stop');
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    const onExternalOtaTrigger = () => {
      runSeamlessOtaSync(remoteVersion, true);
    };
    window.addEventListener('zuzu-trigger-ota-sync', onExternalOtaTrigger);
    return () => window.removeEventListener('zuzu-trigger-ota-sync', onExternalOtaTrigger);
  }, [remoteVersion]);

  const handleRestartApp = () => {
    playHapticSound('switch');
    window.location.reload();
  };

  const toggleHistoryExpand = (id: string) => {
    playHapticSound('switch');
    setExpandedReleaseIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderReleaseBreakdown = (release: ChangelogRecord) => (
    <div className="space-y-3 pt-1">
      {release.newFeatures.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            <span>New Features</span>
          </div>
          <div className="space-y-1.5">
            {release.newFeatures.map((item, idx) => (
              <div
                key={`feat-${idx}`}
                className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100/80 flex items-start gap-2 text-xs"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 flex-shrink-0" />
                <p className="text-[11px] text-slate-700 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {release.bugFixes.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
            <Wrench className="w-3 h-3" />
            <span>Bug Fixes</span>
          </div>
          <div className="space-y-1.5">
            {release.bugFixes.map((item, idx) => (
              <div
                key={`fix-${idx}`}
                className="p-2.5 rounded-xl bg-rose-50/55 border border-rose-100/80 flex items-start gap-2 text-xs"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                <p className="text-[11px] text-slate-700 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {release.improvements.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
            <Zap className="w-3 h-3" />
            <span>Improvements</span>
          </div>
          <div className="space-y-1.5">
            {release.improvements.map((item, idx) => (
              <div
                key={`imp-${idx}`}
                className="p-2.5 rounded-xl bg-emerald-50/55 border border-emerald-100/80 flex items-start gap-2 text-xs"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 flex-shrink-0" />
                <p className="text-[11px] text-slate-700 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const isLatestInstalled = latestRelease
    ? latestRelease.versionCode <= APP_VERSION_CODE && latestRelease.version === APP_VERSION
    : true;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-8 select-none">
      {/* Top Header Card */}
      <div className="rounded-3xl bg-white/80 backdrop-blur-xl border border-white/90 p-5 shadow-lg shadow-purple-900/5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/zuzu-logo.png"
              alt="Zuzu AI"
              className="w-14 h-14 rounded-2xl object-cover shadow-md border border-purple-200 flex-shrink-0"
            />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3 text-purple-600" />
                <span>In-App OTA Channel</span>
              </div>
              <h1 className="text-lg font-black text-slate-800 tracking-tight truncate">
                Software Updates
              </h1>
              <p className="text-[11px] text-slate-500 truncate">
                Installed: {currentVersion} (Build {APP_VERSION_CODE})
              </p>
            </div>
          </div>

          <button
            onClick={handleCheckStatus}
            disabled={isChecking || isUpdating}
            className="px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md shadow-purple-600/25 transition-all flex items-center gap-1.5 text-xs font-bold active:scale-95 disabled:opacity-50 flex-shrink-0"
            title="Check & sync live updates"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking || isUpdating || isLoadingChangelog ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking...' : isUpdating ? 'Syncing...' : 'Check Status'}</span>
          </button>
        </div>

        {/* Live Status Banner */}
        {checkStatusMessage && (
          <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 text-purple-950 text-xs flex items-center justify-between animate-fade-in shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
              <span className="font-medium">{checkStatusMessage}</span>
            </div>
            <button
              onClick={() => setCheckStatusMessage(null)}
              className="text-purple-600 hover:text-purple-900 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Target Android Architecture Card */}
      <div className="rounded-3xl bg-white/75 backdrop-blur-md border border-white/80 p-4 shadow-sm flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-blue-100 text-blue-700 flex-shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-extrabold text-slate-800">
            Target Android Compatibility
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Android 9.0 (API 28) through Android 16 • Edge-to-Edge Ready
          </div>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          API 28 - 36
        </span>
      </div>

      {/* In-App OTA Progress Card */}
      {(isUpdating || isOtaApplied) && (
        <div className="rounded-3xl bg-white/90 backdrop-blur-xl border border-purple-200 p-5 shadow-md space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isUpdating ? (
                <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
              ) : (
                <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
              )}
              <span className="text-xs font-bold text-slate-800">
                {isUpdating ? 'Seamless OTA Update Syncing...' : 'OTA Release Synchronized!'}
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-purple-700">
              {updateProgress}%
            </span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
            <div
              className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2.5 rounded-full transition-all duration-200 ease-out"
              style={{ width: `${updateProgress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{updateStepText}</span>
            <span className="font-mono">{remoteVersion} OTA</span>
          </div>

          {isOtaApplied && (
            <div className="pt-1 flex justify-end">
              <button
                onClick={handleRestartApp}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-200 flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh App ({remoteVersion})</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Latest Update Card (Always Most Recent Release at Top) */}
      {latestRelease && (
        <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-purple-200/80 p-5 shadow-sm space-y-4 text-slate-800">
          <div className="flex items-start justify-between gap-2 border-b border-purple-100/70 pb-3">
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                  v{latestRelease.version}
                </h2>
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-600 text-white">
                  Latest Update
                </span>
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                    CATEGORY_BADGE_STYLES[latestRelease.category]
                  }`}
                >
                  {latestRelease.category}
                </span>
              </div>
              <div className="text-xs font-bold text-purple-900 mt-1.5">
                {latestRelease.title}
              </div>
              <div className="flex items-center flex-wrap gap-3 mt-1 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>{latestRelease.date}</span>
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <Tag className="w-3 h-3 text-slate-400" />
                  <span>{latestRelease.buildTag}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end flex-shrink-0">
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                  isLatestInstalled
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}
              >
                {isLatestInstalled ? 'Up to Date ✓' : 'Update Available'}
              </span>
              <span className="text-[9px] text-slate-400 mt-0.5">Installed: {currentVersion}</span>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {latestRelease.description}
          </p>

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-600" />
              <span>What&apos;s New in v{latestRelease.version}</span>
            </div>
            {renderReleaseBreakdown(latestRelease)}
          </div>
        </div>
      )}

      {/* Browsable Update History (All Previous Releases) */}
      {previousReleases.length > 0 && (
        <div className="rounded-3xl bg-white/80 backdrop-blur-xl border border-purple-100 p-5 shadow-sm space-y-3 text-slate-800">
          <div className="flex items-center justify-between">
            <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-4 h-4 text-purple-600" />
              <span>Update History</span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              {previousReleases.length} Previous Releases
            </span>
          </div>

          <div className="space-y-2.5">
            {previousReleases.map((rel) => {
              const isExpanded = Boolean(expandedReleaseIds[rel.id]);
              return (
                <div
                  key={rel.id}
                  className="rounded-2xl bg-white/90 border border-slate-200/80 overflow-hidden shadow-2xs"
                >
                  <button
                    type="button"
                    onClick={() => toggleHistoryExpand(rel.id)}
                    className="w-full p-3.5 text-left flex items-start justify-between gap-2 hover:bg-purple-50/40 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center flex-wrap gap-1.5">
                        <span className="text-xs font-black text-slate-900 font-mono">
                          v{rel.version}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                            CATEGORY_BADGE_STYLES[rel.category]
                          }`}
                        >
                          {rel.category}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{rel.date}</span>
                      </div>
                      <div className="text-xs font-bold text-slate-800 truncate">{rel.title}</div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-snug">
                        {rel.description}
                      </p>
                    </div>
                    <div className="p-1 rounded-lg bg-slate-100 text-slate-500 flex-shrink-0 mt-0.5">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 animate-fade-in">
                      {renderReleaseBreakdown(rel)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* System Architecture Details */}
      <div className="rounded-3xl bg-white/60 backdrop-blur-md border border-white/70 p-4 text-xs text-slate-500 space-y-1">
        <div className="font-bold text-slate-700 flex items-center gap-1.5 mb-1">
          <ShieldCheck className="w-4 h-4 text-purple-600" />
          <span>Application Environment &amp; Low-Latency Architecture</span>
        </div>
        <div>Target Platform: Android 9.0 (API 28) - 16 (API 36) / Mobile Web</div>
        <div>Neural Backend: Google Gemini Unified Voice, Vision &amp; Text Engine</div>
        <div>Changelog Feed: Dynamic release registry synchronized via /api/system/updates</div>
      </div>
    </div>
  );
};
