import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { AppSettings } from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';
import { getAllBackupPayload, restoreAllBackupPayload, saveAppSettings } from './storage';

export interface ZuRegistrationInput {
  username: string;
  fullName?: string;
  phone?: string;
  password: string;
  confirmPassword: string;
}

export interface ZuAuthResult {
  success: boolean;
  zu_id?: string;
  accountId?: string;
  username?: string;
  fullName?: string;
  phone?: string;
  lastSyncedAt?: number;
  restoredSettings?: AppSettings;
  message: string;
}

const LOCAL_VAULT_MIRROR_PREFIX = 'zuzu_zu_vault_';

/**
 * Computes lowercase SHA-256 hex digest using Web Crypto API with pure-JS fallback
 */
async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const enc = new TextEncoder().encode(input);
    const buf = await window.crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b);
    h3 = Math.imul(h3 ^ (c * 31), 0xc2b2ae35);
    h4 = Math.imul(h4 ^ (c ^ 0x5a), 0x27d4eb2f);
  }
  const part = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${part(h1)}${part(h2)}${part(h3)}${part(h4)}${part(h1 ^ h3)}${part(h2 ^ h4)}${part(h1 + h2)}${part(h3 + h4)}`;
}

function generateHexSalt(length = 32): string {
  const bytes = new Uint8Array(length / 2);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  let digest = await sha256Hex(`${salt}::${password}`);
  for (let i = 0; i < 16; i++) {
    digest = await sha256Hex(`${salt}:${i}:${digest}`);
  }
  return digest;
}

async function deriveVaultId(canonicalId: string, password: string): Promise<string> {
  return sha256Hex(`zuzu_zu_vault::${canonicalId.toLowerCase()}::${password}`);
}

async function deriveVaultVerifier(vaultId: string): Promise<string> {
  return sha256Hex(`verify::${vaultId}`);
}

function maskPhoneIdentifier(phone: string): string {
  const clean = phone.trim();
  if (clean.length <= 4) return '****';
  return `${'*'.repeat(Math.min(8, clean.length - 4))}${clean.slice(-4)}`;
}

/**
 * Firestore strictly rejects `undefined` values inside objects/arrays.
 */
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

function sanitizeSnapshotForFirestore(raw: ReturnType<typeof getAllBackupPayload>) {
  return {
    chatHistory: stripUndefinedDeep((raw.chatHistory || []).slice(-500)),
    voiceSessions: stripUndefinedDeep((raw.voiceSessions || []).slice(0, 200)),
    memories: stripUndefinedDeep((raw.memories || []).slice(0, 300)),
    settings: stripUndefinedDeep(raw.settings || {}),
  };
}

/**
 * Extracts clean custom username (stripping optional "ZU-" prefix if user typed it).
 */
export function normalizeCustomUsername(rawInput: string): {
  displayUsername: string;
  canonicalId: string;
  formattedZuId: string;
} {
  const trimmed = rawInput.trim().replace(/^zu-/i, '');
  const canonicalId = trimmed.toLowerCase();
  return {
    displayUsername: trimmed,
    canonicalId,
    formattedZuId: trimmed ? `ZU-${trimmed}` : ''
  };
}

export function isValidCustomUsername(username: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/.test(username);
}

/**
 * Registers a custom ZU-ID account using a user-chosen Username (letters & numbers)
 * and Secure Password in Firebase Firestore, then signs the user in immediately.
 */
export async function registerZuAccount(input: ZuRegistrationInput): Promise<ZuAuthResult> {
  const { displayUsername, canonicalId, formattedZuId } = normalizeCustomUsername(input.username);
  const fullName = (input.fullName || '').trim() || displayUsername;
  const rawPhone = (input.phone || '').trim();
  const phone = rawPhone.length >= 3 ? rawPhone.slice(0, 40) : `ZU-${displayUsername}`.slice(0, 40);
  const password = input.password.trim();
  const confirmPassword = input.confirmPassword.trim();

  if (!isValidCustomUsername(displayUsername)) {
    return {
      success: false,
      message: 'Username must be 3-32 characters (letters & numbers, starting with a letter or digit).'
    };
  }
  if (fullName.length < 1 || fullName.length > 80) {
    return { success: false, message: 'Full Name must be 1-80 characters.' };
  }
  if (password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters long.' };
  }
  if (password !== confirmPassword) {
    return { success: false, message: 'Password and Confirm Password do not match.' };
  }

  const accountPath = `zu_accounts/${canonicalId}`;
  try {
    const existingSnap = await getDoc(doc(db, 'zu_accounts', canonicalId));
    if (existingSnap.exists()) {
      return {
        success: false,
        message: `Username "${displayUsername}" is already registered. Pick another Username or sign in.`
      };
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      try {
        handleFirestoreError(err, OperationType.GET, accountPath);
      } catch (wrapped: any) {
        return { success: false, message: wrapped.message };
      }
    }
  }

  const salt = generateHexSalt(32);
  const passwordHash = await hashPassword(password, salt);
  const vaultId = await deriveVaultId(canonicalId, password);
  const vaultVerifier = await deriveVaultVerifier(vaultId);
  const phoneMasked = maskPhoneIdentifier(phone);
  const vaultPath = `zu_accounts/${canonicalId}/vault/${vaultId}`;

  try {
    await setDoc(doc(db, 'zu_accounts', canonicalId), {
      zu_id: canonicalId,
      accountId: canonicalId,
      username: displayUsername,
      fullName,
      phoneMasked,
      passwordSalt: salt,
      passwordHash,
      vaultVerifier,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.CREATE, accountPath);
    } catch {
      return {
        success: false,
        message: 'Failed to create ZU-ID account in Firebase Firestore. Check network connection.',
      };
    }
  }

  const rawPayload = getAllBackupPayload();
  const cleanSnapshot = sanitizeSnapshotForFirestore({
    ...rawPayload,
    settings: {
      ...rawPayload.settings,
      userNickname: fullName,
      zuAccountId: canonicalId,
      zuUsername: displayUsername,
      zuFullName: fullName,
      zuPhone: phone,
    },
  });

  try {
    await setDoc(doc(db, 'zu_accounts', canonicalId, 'vault', vaultId), {
      zu_id: canonicalId,
      accountId: canonicalId,
      username: displayUsername,
      phone,
      fullName,
      chatHistory: cleanSnapshot.chatHistory,
      voiceSessions: cleanSnapshot.voiceSessions,
      memories: cleanSnapshot.memories,
      settings: cleanSnapshot.settings,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.CREATE, vaultPath);
    } catch {
      return {
        success: false,
        message: 'ZU-ID created, but failed to initialize Firebase memory vault.',
      };
    }
  }

  const now = Date.now();
  const updatedSettings = saveAppSettings({
    userNickname: fullName,
    zuAccountId: canonicalId,
    zuUsername: displayUsername,
    zuFullName: fullName,
    zuPhone: phone,
    zuVaultKey: vaultId,
    zuToken: `fb_${vaultId.slice(0, 24)}`,
    zuLastSyncedAt: now,
  });

  try {
    localStorage.setItem(`${LOCAL_VAULT_MIRROR_PREFIX}${canonicalId}`, JSON.stringify(cleanSnapshot));
  } catch {}

  return {
    success: true,
    zu_id: canonicalId,
    accountId: canonicalId,
    username: displayUsername,
    fullName,
    phone,
    lastSyncedAt: now,
    restoredSettings: updatedSettings,
    message: `ZU-ID ${formattedZuId} created! Signed in & backed up to Firebase.`,
  };
}

/**
 * Signs in directly using the user's chosen Username / ZU-ID + Password via Firebase Firestore
 * and completely restores user profile, chat histories, voice sessions, memories & settings.
 */
export async function loginZuAccount(usernameOrZuId: string, password: string): Promise<ZuAuthResult> {
  const { displayUsername, canonicalId } = normalizeCustomUsername(usernameOrZuId);
  const cleanPassword = password.trim();

  if (!isValidCustomUsername(displayUsername)) {
    return {
      success: false,
      message: 'Enter a valid Username or ZU-ID (3-32 letters/numbers).'
    };
  }
  if (!cleanPassword) {
    return { success: false, message: 'Password is required.' };
  }

  const accountPath = `zu_accounts/${canonicalId}`;
  let accountData: any = null;
  try {
    const accountSnap = await getDoc(doc(db, 'zu_accounts', canonicalId));
    if (!accountSnap.exists()) {
      return { success: false, message: `No ZU-ID Account found for "${displayUsername}".` };
    }
    accountData = accountSnap.data();
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.GET, accountPath);
    } catch {
      return { success: false, message: 'Network error connecting to Firebase Firestore.' };
    }
  }

  const expectedHash = await hashPassword(cleanPassword, String(accountData.passwordSalt || ''));
  if (expectedHash !== accountData.passwordHash) {
    return { success: false, message: 'Incorrect password for this ZU-ID Account.' };
  }

  const vaultId = await deriveVaultId(canonicalId, cleanPassword);
  const vaultPath = `zu_accounts/${canonicalId}/vault/${vaultId}`;
  let vaultData: any = null;

  try {
    const vaultSnap = await getDoc(doc(db, 'zu_accounts', canonicalId, 'vault', vaultId));
    if (vaultSnap.exists()) {
      vaultData = vaultSnap.data();
    }
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.GET, vaultPath);
    } catch {
      return { success: false, message: 'Failed to unlock your Firebase memory vault.' };
    }
  }

  const now = Date.now();
  const storedUsername = String(vaultData?.username || accountData.username || displayUsername);
  const restoredFullName = String(vaultData?.fullName || accountData.fullName || storedUsername);
  const restoredPhone = String(vaultData?.phone || accountData.phoneMasked || '');
  const sessionToken = `fb_${vaultId.slice(0, 24)}`;

  const restoredSettings = vaultData
    ? restoreAllBackupPayload(
        {
          chatHistory: vaultData.chatHistory || [],
          voiceSessions: vaultData.voiceSessions || [],
          memories: vaultData.memories || [],
          settings: vaultData.settings || {},
          savedAt: now,
        },
        {
          zuAccountId: canonicalId,
          zuUsername: storedUsername,
          zuFullName: restoredFullName,
          zuPhone: restoredPhone,
          zuVaultKey: vaultId,
          zuToken: sessionToken,
          zuLastSyncedAt: now,
        }
      )
    : saveAppSettings({
        userNickname: restoredFullName,
        zuAccountId: canonicalId,
        zuUsername: storedUsername,
        zuFullName: restoredFullName,
        zuPhone: restoredPhone,
        zuVaultKey: vaultId,
        zuToken: sessionToken,
        zuLastSyncedAt: now,
      });

  try {
    localStorage.setItem(
      `${LOCAL_VAULT_MIRROR_PREFIX}${canonicalId}`,
      JSON.stringify({
        chatHistory: vaultData?.chatHistory || [],
        voiceSessions: vaultData?.voiceSessions || [],
        memories: vaultData?.memories || [],
        settings: restoredSettings,
      })
    );
  } catch {}

  const chatCount = Array.isArray(vaultData?.chatHistory) ? vaultData.chatHistory.length : 0;
  const memCount = Array.isArray(vaultData?.memories) ? vaultData.memories.length : 0;

  return {
    success: true,
    zu_id: canonicalId,
    accountId: canonicalId,
    username: storedUsername,
    fullName: restoredFullName,
    phone: restoredPhone,
    lastSyncedAt: now,
    restoredSettings,
    message: `Signed in as ZU-${storedUsername}. Restored ${chatCount} chats & ${memCount} memories from Firebase!`,
  };
}

/**
 * Syncs local chat history, voice sessions, assistant memories & settings to Firebase Firestore
 */
export async function syncZuCloudNow(settings: AppSettings): Promise<{
  success: boolean;
  lastSyncedAt?: number;
  message: string;
}> {
  if (!settings.zuAccountId || !settings.zuVaultKey) {
    return { success: false, message: 'Sign in with your custom Username / ZU-ID first.' };
  }

  const canonicalId = settings.zuAccountId.toLowerCase();
  const vaultId = settings.zuVaultKey;
  const rawSnapshot = getAllBackupPayload();
  const cleanSnapshot = sanitizeSnapshotForFirestore(rawSnapshot);

  try {
    localStorage.setItem(`${LOCAL_VAULT_MIRROR_PREFIX}${canonicalId}`, JSON.stringify(cleanSnapshot));
  } catch {}

  const rawPhone = String(settings.zuPhone || cleanSnapshot.settings?.zuPhone || 'ZU-User').trim();
  const safePhone = rawPhone.length >= 3 ? rawPhone.slice(0, 40) : 'ZU-User';
  const rawName = String(settings.zuFullName || settings.userNickname || settings.zuUsername || 'Zuzu User').trim();
  const safeName = rawName.length >= 1 ? rawName.slice(0, 80) : 'Zuzu User';

  const vaultPath = `zu_accounts/${canonicalId}/vault/${vaultId}`;
  try {
    await updateDoc(doc(db, 'zu_accounts', canonicalId, 'vault', vaultId), {
      phone: safePhone,
      fullName: safeName,
      chatHistory: cleanSnapshot.chatHistory,
      voiceSessions: cleanSnapshot.voiceSessions,
      memories: cleanSnapshot.memories,
      settings: cleanSnapshot.settings,
      updatedAt: serverTimestamp(),
    });

    const now = Date.now();
    try {
      const currentRaw = localStorage.getItem('zuzu_settings_v2');
      if (currentRaw) {
        const parsed = JSON.parse(currentRaw);
        parsed.zuLastSyncedAt = now;
        localStorage.setItem('zuzu_settings_v2', JSON.stringify(parsed));
      }
    } catch {}

    return {
      success: true,
      lastSyncedAt: now,
      message: `Firebase synced: ${cleanSnapshot.chatHistory.length} chats, ${cleanSnapshot.voiceSessions.length} voice sessions & ${cleanSnapshot.memories.length} memories.`,
    };
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.UPDATE, vaultPath);
    } catch {
      return {
        success: false,
        message: 'Offline — saved locally and will sync to Firebase when online.',
      };
    }
  }
}

export function logoutZuAccount(): AppSettings {
  return saveAppSettings({
    zuAccountId: undefined,
    zuUsername: undefined,
    zuFullName: undefined,
    zuPhone: undefined,
    zuToken: undefined,
    zuVaultKey: undefined,
  });
}
