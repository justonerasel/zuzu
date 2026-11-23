import { User } from 'firebase/auth';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { AppSettings, FirebaseUserProfile } from '../types';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  clearUserNamespaceSnapshot,
  getAllBackupPayload,
  getAppSettings,
  getStoredActiveAuthUid,
  getUserNamespaceSnapshot,
  hasMeaningfulPreLoginUserData,
  resetWorkspaceToCleanGuestState,
  restoreAllBackupPayload,
  saveAppSettings,
  setStoredActiveAuthUid,
  stashUserNamespaceSnapshot
} from './storage';
import { deleteCurrentFirebaseUserOnly, updateFirebaseDisplayProfile } from './authService';

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        clean[k] = stripUndefinedDeep(v);
      }
    }
    return clean as T;
  }
  return value;
}

function clampString(val: unknown, maxLen: number): string {
  return String(val ?? '').trim().slice(0, maxLen);
}

function buildSanitizedVaultFields(uid: string) {
  const raw = getAllBackupPayload();
  const {
    zuAccountId: _legacyId,
    zuUsername: _legacyUser,
    zuFullName: _legacyFull,
    zuPhone: _legacyPhone,
    zuToken: _legacyToken,
    zuVaultKey: _legacyVaultKey,
    ...cleanSettings
  } = raw.settings || {};

  // Respect Firestore rule cap of 80 keys on settings map
  const limitedSettingsEntries = Object.entries(stripUndefinedDeep(cleanSettings)).slice(0, 80);

  return {
    uid,
    chatHistory: stripUndefinedDeep((raw.chatHistory || []).slice(-500)),
    voiceSessions: stripUndefinedDeep((raw.voiceSessions || []).slice(0, 200)),
    memories: stripUndefinedDeep((raw.memories || []).slice(0, 300)),
    notes: stripUndefinedDeep((raw.notes || []).slice(0, 200)),
    reminders: stripUndefinedDeep((raw.reminders || []).slice(0, 200)),
    uploadedFiles: stripUndefinedDeep((raw.uploadedFiles || []).slice(0, 100)),
    settings: Object.fromEntries(limitedSettingsEntries)
  };
}

export function extractProvidersList(user: User): string[] {
  const raw = (user.providerData || [])
    .map((p) => p?.providerId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (raw.length > 0) {
    return Array.from(new Set(raw)).slice(0, 10);
  }
  if (user.phoneNumber) return ['phone'];
  if (user.email) return ['google.com'];
  return ['firebase'];
}

export function buildDefaultDisplayName(user: User, existingName?: string): string {
  const preferred =
    clampString(existingName, 80) ||
    clampString(user.displayName, 80) ||
    (user.email ? clampString(user.email.split('@')[0], 80) : '') ||
    (user.phoneNumber ? clampString(user.phoneNumber, 80) : '') ||
    'Zuzu User';
  return preferred || 'Zuzu User';
}

export async function loadOrCreateUserProfile(
  user: User,
  overrides?: Partial<Pick<FirebaseUserProfile, 'displayName' | 'photoData'>>
): Promise<FirebaseUserProfile> {
  const profilePath = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const providers = extractProvidersList(user);
  const verifiedEmail = user.email ? clampString(user.email, 160) : '';
  const verifiedPhone = user.phoneNumber ? clampString(user.phoneNumber, 40) : '';

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, profilePath);
  }

  if (existingSnap && existingSnap.exists()) {
    const data = existingSnap.data() as FirebaseUserProfile;
    const nextDisplayName = buildDefaultDisplayName(
      user,
      overrides?.displayName !== undefined ? overrides.displayName : data.displayName
    );
    const nextPhotoData = clampString(
      overrides?.photoData !== undefined
        ? overrides.photoData
        : data.photoData || user.photoURL || '',
      200000
    );

    const changed =
      nextDisplayName !== data.displayName ||
      verifiedEmail !== (data.email || '') ||
      verifiedPhone !== (data.phoneNumber || '') ||
      nextPhotoData !== (data.photoData || '') ||
      JSON.stringify(providers) !== JSON.stringify(data.providers || []);

    const nextProfile: FirebaseUserProfile = {
      uid: user.uid,
      displayName: nextDisplayName,
      email: verifiedEmail,
      phoneNumber: verifiedPhone,
      photoData: nextPhotoData,
      providers,
      createdAt: data.createdAt,
      updatedAt: serverTimestamp()
    };

    if (changed) {
      try {
        await updateDoc(ref, {
          displayName: nextDisplayName,
          email: verifiedEmail,
          phoneNumber: verifiedPhone,
          photoData: nextPhotoData,
          providers,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, profilePath);
      }
    }
    return nextProfile;
  }

  const createdProfile: FirebaseUserProfile = {
    uid: user.uid,
    displayName: buildDefaultDisplayName(user, overrides?.displayName),
    email: verifiedEmail,
    phoneNumber: verifiedPhone,
    photoData: clampString(
      overrides?.photoData !== undefined ? overrides.photoData : user.photoURL || '',
      200000
    ),
    providers,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(ref, createdProfile);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, profilePath);
  }

  return createdProfile;
}

export async function updateAuthenticatedUserProfile(
  user: User,
  updates: { displayName?: string; photoData?: string }
): Promise<FirebaseUserProfile> {
  const cleanName = updates.displayName !== undefined ? clampString(updates.displayName, 80) : undefined;
  if (updates.displayName !== undefined && !cleanName) {
    throw new Error('Display name cannot be empty.');
  }

  await updateFirebaseDisplayProfile({
    displayName: cleanName,
    photoURL: updates.photoData
  });

  const saved = await loadOrCreateUserProfile(user, {
    displayName: cleanName,
    photoData: updates.photoData
  });

  if (cleanName) {
    saveAppSettings({ userNickname: cleanName });
  }
  return saved;
}

/**
 * Hydrates the signed-in user's isolated private workspace (Firestore + local UID snapshot).
 * Safely isolates data between distinct users on the same device.
 */
export async function hydrateUserIsolatedWorkspace(user: User): Promise<{
  profile: FirebaseUserProfile;
  settings: AppSettings;
  restoredFromCloud: boolean;
}> {
  const uid = user.uid;
  const previousActiveUid = getStoredActiveAuthUid();
  const vaultPath = `users/${uid}/vault/primary`;

  // If switching directly from User A to User B, stash User A locally before loading User B
  if (previousActiveUid && previousActiveUid !== uid) {
    stashUserNamespaceSnapshot(previousActiveUid);
  }

  const profile = await loadOrCreateUserProfile(user);

  let cloudVaultSnap;
  try {
    cloudVaultSnap = await getDoc(doc(db, 'users', uid, 'vault', 'primary'));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, vaultPath);
  }

  // Case 1: Existing user with cloud backup -> restore strictly their own vault
  if (cloudVaultSnap && cloudVaultSnap.exists()) {
    const v = cloudVaultSnap.data() as any;
    const restoredSettings = restoreAllBackupPayload(
      {
        chatHistory: v.chatHistory || [],
        voiceSessions: v.voiceSessions || [],
        memories: v.memories || [],
        notes: Array.isArray(v.notes) ? v.notes : [],
        reminders: Array.isArray(v.reminders) ? v.reminders : [],
        uploadedFiles: Array.isArray(v.uploadedFiles) ? v.uploadedFiles : [],
        settings: v.settings || {}
      },
      {
        userNickname: profile.displayName || v.settings?.userNickname || getAppSettings().userNickname
      }
    );
    setStoredActiveAuthUid(uid);
    stashUserNamespaceSnapshot(uid);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zuzu-workspace-switched'));
      window.dispatchEvent(new CustomEvent('zuzu-notes-reminders-changed'));
    }
    return { profile, settings: restoredSettings, restoredFromCloud: true };
  }

  // Case 2: First-ever Firebase Auth login on this device — check if there is a cached local snapshot for THIS uid
  const localUidSnapshot = getUserNamespaceSnapshot(uid);
  if (localUidSnapshot) {
    const restoredSettings = restoreAllBackupPayload(localUidSnapshot, {
      userNickname: profile.displayName
    });
    setStoredActiveAuthUid(uid);
    await pushActiveVaultToCloud(user, true).catch(() => {});
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zuzu-workspace-switched'));
      window.dispatchEvent(new CustomEvent('zuzu-notes-reminders-changed'));
    }
    return { profile, settings: restoredSettings, restoredFromCloud: false };
  }

  // Case 3: Brand-new Firebase account.
  // If another account was previously active on device, do NOT carry over their workspace.
  // If current workspace holds pre-login guest data (no previous uid), preserve & migrate it cleanly into this new account!
  if (previousActiveUid && previousActiveUid !== uid) {
    resetWorkspaceToCleanGuestState();
  } else if (!hasMeaningfulPreLoginUserData()) {
    // Keep clean seed state with user's displayName
  }

  const nextSettings = saveAppSettings({
    userNickname: profile.displayName
  });
  setStoredActiveAuthUid(uid);
  await pushActiveVaultToCloud(user, true).catch(() => {});
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zuzu-workspace-switched'));
    window.dispatchEvent(new CustomEvent('zuzu-notes-reminders-changed'));
  }
  return { profile, settings: nextSettings, restoredFromCloud: false };
}

export async function pushActiveVaultToCloud(
  user: User | null = auth.currentUser,
  allowCreate = false
): Promise<{ success: boolean; syncedAt?: number; message: string }> {
  if (!user) {
    return { success: false, message: 'Sign in with Google or Mobile OTP to sync to Firebase Cloud.' };
  }

  const uid = user.uid;
  const vaultPath = `users/${uid}/vault/primary`;
  const ref = doc(db, 'users', uid, 'vault', 'primary');
  const payload = buildSanitizedVaultFields(uid);

  stashUserNamespaceSnapshot(uid);

  try {
    if (allowCreate) {
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        const now = Date.now();
        saveAppSettings({ zuLastSyncedAt: now });
        return { success: true, syncedAt: now, message: 'Private cloud vault initialized & synced.' };
      }
    }

    await updateDoc(ref, {
      chatHistory: payload.chatHistory,
      voiceSessions: payload.voiceSessions,
      memories: payload.memories,
      notes: payload.notes,
      reminders: payload.reminders,
      uploadedFiles: payload.uploadedFiles,
      settings: payload.settings,
      updatedAt: serverTimestamp()
    });
    const now = Date.now();
    saveAppSettings({ zuLastSyncedAt: now });
    return {
      success: true,
      syncedAt: now,
      message: `Cloud synced: ${payload.chatHistory.length} chats, ${payload.voiceSessions.length} voice, ${payload.notes.length} notes, ${payload.reminders.length} reminders & ${payload.memories.length} memories.`
    };
  } catch (err: any) {
    if (err?.code === 'not-found' && !allowCreate) {
      return pushActiveVaultToCloud(user, true);
    }
    handleFirestoreError(err, OperationType.WRITE, vaultPath);
  }
}

export function performIsolatedSignOutCleanup(uid?: string): AppSettings {
  if (uid) {
    stashUserNamespaceSnapshot(uid);
  }
  return resetWorkspaceToCleanGuestState();
}

export async function deleteAccountAndPrivateData(user: User): Promise<void> {
  const uid = user.uid;
  const vaultRef = doc(db, 'users', uid, 'vault', 'primary');
  const profileRef = doc(db, 'users', uid);

  let backupProfile: any = null;
  let backupVault: any = null;
  try {
    const [pSnap, vSnap] = await Promise.all([getDoc(profileRef), getDoc(vaultRef)]);
    if (pSnap.exists()) backupProfile = pSnap.data();
    if (vSnap.exists()) backupVault = vSnap.data();
  } catch {}

  // Firestore rules enforce request.auth.uid == uid, so remove private Firestore docs while still signed in
  try {
    await deleteDoc(vaultRef);
  } catch {}
  try {
    await deleteDoc(profileRef);
  } catch {}

  try {
    await deleteCurrentFirebaseUserOnly(user);
  } catch (err) {
    // Restore Firestore records if Firebase Auth refused deletion (e.g. auth/requires-recent-login)
    if (backupProfile) {
      await setDoc(profileRef, backupProfile).catch(() => {});
    }
    if (backupVault) {
      await setDoc(vaultRef, backupVault).catch(() => {});
    }
    throw err;
  }

  clearUserNamespaceSnapshot(uid);
  resetWorkspaceToCleanGuestState();
}

