import assert from 'node:assert/strict';

// Lightweight browser localStorage + window stub for Node tsx verification
const store = new Map<string, string>();
const dispatchedEvents: string[] = [];
const cancelledNativeAlarms: string[] = [];
const scheduledNativeAlarms: Array<{ id: string; triggerAtMs: number; recurrence?: string }> = [];

const mockStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    store.set(k, String(v));
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => {
    store.clear();
  },
  key: (idx: number) => Array.from(store.keys())[idx] ?? null,
  get length() {
    return store.size;
  }
};

const mockWindow: Record<string, any> = {
  localStorage: mockStorage,
  dispatchEvent: (ev: any) => {
    if (ev && typeof ev.type === 'string') {
      dispatchedEvents.push(ev.type);
    }
    return true;
  },
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {
      ZuzuNative: {
        scheduleReminderNotification: async (opts: any) => {
          scheduledNativeAlarms.push({
            id: opts.id,
            triggerAtMs: opts.triggerAtMs,
            recurrence: opts.recurrence
          });
          return { exact: true };
        },
        cancelReminderNotification: async (opts: any) => {
          cancelledNativeAlarms.push(opts.id);
          return { cancelled: true };
        },
        syncNativeReminders: async () => ({ synced: true })
      }
    }
  }
};

(globalThis as any).window = mockWindow;
(globalThis as any).localStorage = mockStorage;
if (typeof (globalThis as any).CustomEvent === 'undefined') {
  (globalThis as any).CustomEvent = class MockCustomEvent {
    type: string;
    detail: any;
    constructor(type: string, init?: { detail?: any }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
}

async function run() {
  const assistantStore = await import('../src/utils/assistantStore.ts');
  const intentDetector = await import('../src/utils/intentDetector.ts');
  const authService = await import('../src/utils/authService.ts');
  const storage = await import('../src/utils/storage.ts');

  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`PASS: ${label}`);
  };

  // =========================================================================
  // MODULE 8 TESTS: CUSTOM SCHEDULING, NL PARSING, IN-PLACE EDIT, OVERDUE
  // =========================================================================

  check('NL reminder: after 7 minutes', () => {
    const before = Date.now();
    const res = assistantStore.parseNaturalReminderSchedule('Remind me after 7 minutes to check tea');
    assert.equal(res.needsClarification, false);
    assert.ok(res.triggerAtMs && res.triggerAtMs >= before + 6.9 * 60000 && res.triggerAtMs <= before + 7.2 * 60000);
    assert.match(res.cleanedTitle.toLowerCase(), /check tea/);
  });

  check('NL reminder: compound offset after 2 hours and 45 minutes', () => {
    const before = Date.now();
    const res = assistantStore.parseNaturalReminderSchedule('Remind me after 2 hours and 45 minutes');
    assert.equal(res.needsClarification, false);
    const expectedDelta = (2 * 60 + 45) * 60000;
    assert.ok(res.triggerAtMs && Math.abs(res.triggerAtMs - (before + expectedDelta)) < 5000);
  });

  check('NL reminder: tomorrow at 8:35 AM', () => {
    const res = assistantStore.parseNaturalReminderSchedule('Remind me tomorrow at 8:35 AM');
    assert.equal(res.needsClarification, false);
    assert.ok(res.triggerAtMs);
    const d = new Date(res.triggerAtMs);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.equal(d.getDate(), tomorrow.getDate());
    assert.equal(d.getHours(), 8);
    assert.equal(d.getMinutes(), 35);
  });

  check('NL reminder: explicit calendar date on December 15 at 6:20 PM', () => {
    const res = assistantStore.parseNaturalReminderSchedule('Remind me on December 15 at 6:20 PM');
    assert.equal(res.needsClarification, false);
    assert.ok(res.triggerAtMs);
    const d = new Date(res.triggerAtMs);
    assert.equal(d.getMonth(), 11); // December (0-indexed)
    assert.equal(d.getDate(), 15);
    assert.equal(d.getHours(), 18);
    assert.equal(d.getMinutes(), 20);
  });

  check('NL reminder: recurring every Friday at 9 AM', () => {
    const res = assistantStore.parseNaturalReminderSchedule('Remind me every Friday at 9 AM');
    assert.equal(res.needsClarification, false);
    assert.equal(res.recurrence, 'weekly');
    assert.equal(res.recurrenceWeekday, 5);
    assert.ok(res.triggerAtMs);
    const d = new Date(res.triggerAtMs);
    assert.equal(d.getDay(), 5);
    assert.equal(d.getHours(), 9);
    assert.equal(d.getMinutes(), 0);
  });

  check('Bangla wake-prefix reminder: Zuzu, আগামীকাল সকাল ৯টায় আমাকে অফিসের কথা মনে করিয়ে দিও।', () => {
    mockStorage.clear();
    const res = intentDetector.detectVoiceActionIntent('Zuzu, আগামীকাল সকাল ৯টায় আমাকে অফিসের কথা মনে করিয়ে দিও।');
    assert.equal(res.hasActionIntent, true);
    assert.equal(res.intentType, 'manage_reminder');
    const saved = assistantStore.getRemindersList();
    assert.equal(saved.length, 1);
    const d = new Date(saved[0].time);
    assert.equal(d.getHours(), 9);
    assert.equal(d.getMinutes(), 0);
    assert.ok(saved[0].title.includes('অফিস'));
  });

  check('Strict in-place reminder editing: zero duplicates & cancels old native alarm', () => {
    mockStorage.clear();
    cancelledNativeAlarms.length = 0;
    const future1 = Date.now() + 3600000;
    const created = assistantStore.addReminderVerified({
      title: 'Team Sync',
      description: 'Zoom room 1',
      triggerAtMs: future1,
      recurrence: 'none'
    });
    assert.equal(created.success, true);
    assert.ok(created.reminder);
    const origId = created.reminder.id;

    const future2 = Date.now() + 7200000;
    const edited = assistantStore.updateReminderById(origId, {
      title: 'Board Sync Updated',
      description: 'Updated room 2',
      triggerAtMs: future2,
      recurrence: 'weekly',
      recurrenceWeekday: 5
    });
    assert.equal(edited.success, true);
    assert.equal(edited.reminder?.id, origId);
    assert.equal(edited.reminder?.title, 'Board Sync Updated');
    assert.equal(edited.reminder?.description, 'Updated room 2');
    assert.equal(edited.reminder?.time, future2);
    assert.equal(edited.reminder?.recurrence, 'weekly');
    assert.equal(edited.reminder?.recurrenceWeekday, 5);
    assert.equal(edited.reminder?.notified, false);

    const listAfterEdit = assistantStore.getRemindersList();
    assert.equal(listAfterEdit.length, 1, 'Editing must NEVER create duplicate reminders');
    assert.equal(listAfterEdit[0].id, origId);
    assert.ok(cancelledNativeAlarms.includes(origId), 'Editing must cancel previous native alarm before rescheduling');
  });

  check('Reminder categorization: Overdue, Upcoming, Completed & Deletion', () => {
    mockStorage.clear();
    const now = Date.now();
    const past = now - 600000;
    const future = now + 600000;

    const r1 = assistantStore.addReminderVerified({ title: 'Overdue Task', triggerAtMs: past }).reminder!;
    const r2 = assistantStore.addReminderVerified({ title: 'Upcoming Task', triggerAtMs: future }).reminder!;
    assert.equal(assistantStore.getReminderCategory(r1, now), 'overdue');
    assert.equal(assistantStore.getReminderCategory(r2, now), 'upcoming');

    const toggled = assistantStore.toggleReminderCompletedById(r1.id);
    assert.equal(toggled.success, true);
    assert.equal(assistantStore.getReminderCategory(toggled.reminder!, now), 'completed');

    const deleted = assistantStore.deleteReminderById(r2.id);
    assert.equal(deleted.success, true);
    assert.equal(assistantStore.getRemindersList().length, 1);
  });

  check('Recurring weekday (Mon-Fri) skips weekend properly', () => {
    // Pick a Friday at 9:00 AM local time
    const friday = new Date(2026, 10, 20, 9, 0, 0, 0); // Nov 20, 2026 is Friday
    assert.equal(friday.getDay(), 5);
    const nextMs = assistantStore.computeNextRecurringTriggerMs(
      friday.getTime(),
      'weekday',
      undefined,
      friday.getTime() + 1000
    );
    const nextDate = new Date(nextMs);
    assert.equal(nextDate.getDay(), 1, 'Friday weekday recurrence should advance to Monday');
  });

  // =========================================================================
  // MODULE 9 TESTS: PHONE E.164, ERROR MAPPING & PER-UID ISOLATION
  // =========================================================================

  check('Phone E.164 normalization defaults to Bangladesh +880 & strips leading zero', () => {
    const bdLocal = authService.formatPhoneToE164('+880', '01712345678');
    assert.equal(bdLocal.valid, true);
    assert.equal(bdLocal.e164, '+8801712345678');

    const bdNoZero = authService.formatPhoneToE164('+880', '1812-345-678');
    assert.equal(bdNoZero.valid, true);
    assert.equal(bdNoZero.e164, '+8801812345678');

    const usFormatted = authService.formatPhoneToE164('+1', '(415) 555-2671');
    assert.equal(usFormatted.valid, true);
    assert.equal(usFormatted.e164, '+14155552671');

    const badBd = authService.formatPhoneToE164('+880', '01712');
    assert.equal(badBd.valid, false);
  });

  check('Firebase Auth error mapping produces clear actionable messages', () => {
    assert.equal(authService.mapFirebaseAuthError({ code: 'CANCELED' }).cancelled, true);
    assert.match(authService.mapFirebaseAuthError({ code: 'auth/invalid-verification-code' }).message, /Incorrect OTP/i);
    assert.match(authService.mapFirebaseAuthError({ code: 'auth/code-expired' }).message, /expired/i);
    assert.match(authService.mapFirebaseAuthError({ code: 'auth/account-exists-with-different-credential' }).message, /already exists/i);
    assert.match(authService.mapFirebaseAuthError({ code: 'auth/requires-recent-login' }).message, /sign out and sign back in/i);
    assert.match(authService.mapFirebaseAuthError({ code: 'NO_CREDENTIAL' }).message, /SHA-1/i);
  });

  check('Strict per-UID workspace isolation: zero leakage across sign-out and account switching', () => {
    mockStorage.clear();

    // User A creates private workspace state
    storage.saveChatMessage({
      id: 'c-a',
      conversation_type: 'text',
      sender: 'user',
      text: 'Secret project alpha from User A',
      timestamp: Date.now(),
      voiceIdentity: 'female',
      personality: 'Normal'
    });
    storage.saveMemory({
      key: 'userA_secret',
      value: 'Account A secret memory',
      category: 'personal',
      source: 'explicit'
    });
    assistantStore.addNoteVerified('User A Private Note');
    assistantStore.addReminderVerified({ title: 'User A Private Reminder', triggerAtMs: Date.now() + 3600000 });
    storage.recordUploadedFileMeta({
      name: 'userA_doc.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      source: 'screen_assistant'
    });
    storage.saveAppSettings({ userNickname: 'UserA', customGeminiApiKey: 'AIzaUserAKey123' });

    storage.setStoredActiveAuthUid('uid_alice');
    storage.stashUserNamespaceSnapshot('uid_alice');

    // User A signs out -> active workspace wiped cleanly (zero user-created records, zero meaningful data)
    storage.resetWorkspaceToCleanGuestState();
    assert.equal(storage.hasMeaningfulPreLoginUserData(), false);
    assert.equal(storage.getChatMessages().filter((c) => !c.id.startsWith('seed-')).length, 0);
    assert.equal(storage.getVoiceSessions().filter((v) => !v.id.startsWith('seed-')).length, 0);
    assert.equal(storage.getMemories().filter((m) => !m.id.startsWith('seed-')).length, 0);
    assert.equal(assistantStore.getNotesList().length, 0);
    assert.equal(assistantStore.getRemindersList().length, 0);
    assert.equal(storage.getUploadedFilesMeta().length, 0);
    assert.equal(storage.getAppSettings().customGeminiApiKey, '');
    assert.equal(storage.getStoredActiveAuthUid(), null);

    // User B signs in with their own state
    storage.saveChatMessage({
      id: 'c-b',
      conversation_type: 'text',
      sender: 'user',
      text: 'User B private chat',
      timestamp: Date.now(),
      voiceIdentity: 'male',
      personality: 'Normal'
    });
    storage.saveAppSettings({ userNickname: 'UserB', customGeminiApiKey: 'AIzaUserBKey999' });
    storage.setStoredActiveAuthUid('uid_bob');
    storage.stashUserNamespaceSnapshot('uid_bob');

    // Switch back to User A snapshot -> confirm User A gets only User A's items, zero User B items
    const aliceSnap = storage.getUserNamespaceSnapshot('uid_alice');
    assert.ok(aliceSnap);
    storage.restoreAllBackupPayload(aliceSnap);
    storage.setStoredActiveAuthUid('uid_alice');

    const restoredChats = storage.getChatMessages().filter((c) => !c.id.startsWith('seed-'));
    assert.equal(restoredChats.length, 1);
    assert.equal(restoredChats[0].text, 'Secret project alpha from User A');
    assert.equal(
      storage.getChatMessages().some((c) => c.text.includes('User B')),
      false
    );
    assert.equal(storage.getUploadedFilesMeta()[0].name, 'userA_doc.png');
    assert.equal(storage.getAppSettings().customGeminiApiKey, 'AIzaUserAKey123');
    assert.equal(assistantStore.getNotesList()[0].text, 'User A Private Note');
    assert.equal(assistantStore.getRemindersList()[0].title, 'User A Private Reminder');
  });

  console.log(`\nALL ${passed} AUTOMATED VERIFICATION TESTS PASSED.`);
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('TEST FAILURE:', err);
    process.exit(1);
  });
