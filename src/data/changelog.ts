export type UpdateCategory = 'Feature' | 'Fix' | 'Improvement' | 'Major';

export interface ChangelogRecord {
  id: string;
  version: string;
  versionCode: number;
  title: string;
  date: string;
  category: UpdateCategory;
  description: string;
  newFeatures: string[];
  bugFixes: string[];
  improvements: string[];
  buildTag: string;
}

/**
 * Centralized dynamic release & update history for Zuzu AI.
 * Entries can be added in any order; `getSortedChangelog` always orders newest-first.
 */
export const APP_CHANGELOG: ChangelogRecord[] = [
  {
    id: 'release-3.8.0',
    version: '3.8.0',
    versionCode: 380,
    title: 'Voice Orb Fix, Smart Permissions & Live Changelog',
    date: '2026-11-24',
    category: 'Major',
    description:
      'Repaired the end-to-end Voice Orb capture pipeline, trimmed Android permissions down to only active capabilities, and introduced a live structured Update Changelog system.',
    newFeatures: [
      'Added full 5-state Voice Orb feedback (Idle, Listening, Thinking, Speaking, Error) with visual recovery hints',
      'Added Live Software Updates API & browsable Release History grouped into Features, Bug Fixes, and Improvements',
      'Added explicit permanently-denied permission detection with direct App Settings recovery across Orb & Permissions Center'
    ],
    bugFixes: [
      'Fixed Voice Orb stalling on "Microphone Permission Granted" without starting speech recognition',
      'Fixed premature "LISTENING..." indicator appearing before the microphone/SpeechRecognizer engine was actually ready',
      'Fixed background Wake Word / audio trigger monitors holding microphone hardware during active Orb taps',
      'Eliminated unwanted startup location and bulk permission popups on initial app launch'
    ],
    improvements: [
      'Removed 14 unused Android manifest & runtime permissions (Contacts, Calls, SMS, Bluetooth, Overlays, Package Inventory)',
      'Added session-generation isolation to Android SpeechRecognizer so stale callbacks cannot corrupt active turns',
      'Aligned app version metadata cleanly at v3.8.0 (Build 380) across Android Gradle, CI workflow, Web, and API server'
    ],
    buildTag: 'Build 380-Production'
  },
  {
    id: 'release-3.7.0',
    version: '3.7.0',
    versionCode: 370,
    title: 'Google Search Grounding, Advanced Reminders & Unified Auth',
    date: '2026-11-20',
    category: 'Feature',
    description:
      'Upgraded Zuzu AI with live Google Search Grounding for breaking updates, custom & recurring Android AlarmManager reminders, and per-account isolated Firebase workspaces.',
    newFeatures: [
      'Integrated official Gemini Google Search Grounding with clickable sources and 20-minute breaking news timestamps',
      'Added custom date/time pickers, recurring schedules, edit/pause/resume, and notification alerts to Reminders',
      'Added Firebase Google Sign-In and Mobile Phone OTP authentication with isolated per-user workspaces'
    ],
    bugFixes: [
      'Removed deprecated third-party Facebook/YouTube search token requirements in favor of native Google Search access',
      'Fixed timezone formatting and overdue tracking for scheduled voice & manual reminders'
    ],
    improvements: [
      'Unified Chat, Voice, Vision, and Image Generation behind one Google Gemini API Key settings card',
      'Enhanced English & Bengali natural-language detection for search, reminder, note, and app-launch commands'
    ],
    buildTag: 'Build 370-Production'
  },
  {
    id: 'release-3.6.0',
    version: '3.6.0',
    versionCode: 360,
    title: 'Native Android Speech Engine & Particle Orb Core',
    date: '2026-11-12',
    category: 'Improvement',
    description:
      'Introduced the native Android Capacitor speech bridge with Bangla cloud fallback, acoustic triggers, and 4 holographic 3D Particle Orb animations.',
    newFeatures: [
      'Added native Android SpeechRecognizer bridge with automatic Cloud Audio fallback for Bangla offline errors',
      'Introduced 4 customizable 3D holographic Particle Orb styles with configurable colors and glow intensity',
      'Added Notebook & long-term personal memory vault with voice recall commands'
    ],
    bugFixes: [
      'Fixed double audio playback when interrupting Gemini TTS speech mid-response',
      'Stabilized Android edge-to-edge status bar inset handling on Android 9 through Android 16'
    ],
    improvements: [
      'Added silent foreground Wake Word service and whistle/snap acoustic trigger calibration',
      'Optimized streaming SSE voice response latency for natural turn-taking'
    ],
    buildTag: 'Build 360-Production'
  }
];

function compareVersionDescending(a: ChangelogRecord, b: ChangelogRecord): number {
  if (b.versionCode !== a.versionCode) {
    return b.versionCode - a.versionCode;
  }
  const pa = a.version.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.version.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff !== 0) return diff;
  }
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

export function getSortedChangelog(records: ChangelogRecord[] = APP_CHANGELOG): ChangelogRecord[] {
  return [...records].sort(compareVersionDescending);
}

export function getLatestChangelogRelease(records: ChangelogRecord[] = APP_CHANGELOG): ChangelogRecord {
  const sorted = getSortedChangelog(records);
  return sorted[0];
}
