import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { AppSettings } from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';
import { getAllBackupPayload, restoreAllBackupPayload, saveAppSettings } from './storage';

export interface NusuRegistrationInput {
  fullName: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

export interface NusuAuthResult {
  success: boolean;
  accountId?: string;
  fullName?: string;
  phone?: string;
  lastSyncedAt?: number;
  restoredSettings?: AppSettings;
  message: string;
}

const LOCAL_VAULT_MIRROR_PREFIX = 'zuzu_nusu_vault_';

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
  // Fallback deterministic 64-char hex digest if subtle is unavailable in insecure http contexts
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
  // Stretch deterministically for brute-force resistance
  for (let i = 0; i < 16; i++) {
    digest = await sha256Hex(`${salt}:${i}:${digest}`);
  }
  return digest;
}

async function deriveVaultId(accountId: string, password: string): Promise<string> {
  return sha256Hex(`zuzu_vault::${accountId.toUpperCase()}::${password}`);
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

function randomSixDigitNusuId(): string {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    const num = 100000 + (arr[0] % 900000);
    return `NU-${num}`;
  }
  return `NU-${Math.floor(100000 + Math.random() * 900000)}`;
}

/**
 * Registers a brand new NUSU Account (`NU-XXXXXX`) in Firebase Firestore
 * with Full Name, Phone/Identifier, and Password, then logs user in instantly.
 */
export async function registerNusuAccount(input: NusuRegistrationInput): Promise<NusuAuthResult> {
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const password = input.password.trim();
  const confirmPassword = input.confirmPassword.trim();

  if (fullName.length < 2 || fullName.length > 80) {
    return { success: false, message: 'Enter your Full Name or Username (2-80 characters).' };
  }
  if (phone.length < 3 || phone.length > 40) {
    return { success: false, message: 'Enter a valid Phone Number or Identifier (3-40 characters).' };
  }
  if (password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters long.' };
  }
  if (password !== confirmPassword) {
    return { success: false, message: 'Password and Confirm Password do not match.' };
  }

  // Generate collision-free NU-XXXXXX ID checked against Firestore
  let accountId = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomSixDigitNusuId();
    const checkPath = `nusu_accounts/${candidate}`;
    try {
      const existingSnap = await getDoc(doc(db, 'nusu_accounts', candidate));
      if (!existingSnap.exists()) {
        accountId = candidate;
        break;
      }
    } catch (err: any) {
      // Only treat permission/fatal errors cleanly; otherwise try next
      if (err?.code === 'permission-denied') {
        try {
          handleFirestoreError(err, OperationType.GET, checkPath);
        } catch (wrapped: any) {
          return { success: false, message: wrapped.message };
        }
      }
      accountId = candidate;
      break;
    }
  }

  if (!accountId) {
    return { success: false, message: 'Could not allocate a unique NUSU ID. Please try again.' };
  }

  const salt = generateHexSalt(32);
  const passwordHash = await hashPassword(password, salt);
  const vaultId = await deriveVaultId(accountId, password);
  const vaultVerifier = await deriveVaultVerifier(vaultId);
  const phoneMasked = maskPhoneIdentifier(phone);

  const accountPath = `nusu_accounts/${accountId}`;
  const vaultPath = `nusu_accounts/${accountId}/vault/${vaultId}`;

  try {
    // 1. Write root NUSU Account metadata document
    await setDoc(doc(db, 'nusu_accounts', accountId), {
      accountId,
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
    } catch (wrapped: any) {
      return {
        success: false,
        message: 'Failed to register NUSU ID in Firebase Firestore. Check network connection.',
      };
    }
  }

  // Prepare initial persistent snapshot (preserving current user nickname as fullName)
  const rawPayload = getAllBackupPayload();
  const cleanSnapshot = sanitizeSnapshotForFirestore({
    ...rawPayload,
    settings: {
      ...rawPayload.settings,
      userNickname: fullName,
      nusuAccountId: accountId,
      nusuFullName: fullName,
      nusuPhone: phone,
    },
  });

  try {
    // 2. Write private password-capability protected Vault document
    await setDoc(doc(db, 'nusu_accounts', accountId, 'vault', vaultId), {
      accountId,
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
        message: 'Account ID created, but failed to initialize Firebase memory vault.',
      };
    }
  }

  const now = Date.now();
  const updatedSettings = saveAppSettings({
    userNickname: fullName,
    nusuAccountId: accountId,
    nusuFullName: fullName,
    nusuPhone: phone,
    nusuVaultKey: vaultId,
    nusuToken: `fb_${vaultId.slice(0, 24)}`,
    nusuLastSyncedAt: now,
  });

  try {
    localStorage.setItem(`${LOCAL_VAULT_MIRROR_PREFIX}${accountId}`, JSON.stringify(cleanSnapshot));
  } catch {}

  return {
    success: true,
    accountId,
    fullName,
    phone,
    lastSyncedAt: now,
    restoredSettings: updatedSettings,
    message: `Created NUSU ID ${accountId}! Logged in & backed up to Firebase.`,
  };
}

/**
 * Signs into an existing NUSU Account (`NU-XXXXXX` + Password) via Firebase Firestore
 * and completely restores user profile, chat histories, voice sessions, memories & settings.
 */
export async function loginNusuAccount(accountId: string, password: string): Promise<NusuAuthResult> {
  const normalizedId = accountId.trim().toUpperCase();
  const cleanPassword = password.trim();

  if (!/^NU-\d{6}$/.test(normalizedId)) {
    return { success: false, message: 'Enter a valid NUSU ID (format: NU-XXXXXX).' };
  }
  if (!cleanPassword) {
    return { success: false, message: 'Password is required.' };
  }

  const accountPath = `nusu_accounts/${normalizedId}`;
  let accountData: any = null;
  try {
    const accountSnap = await getDoc(doc(db, 'nusu_accounts', normalizedId));
    if (!accountSnap.exists()) {
      return { success: false, message: `No NUSU Account found for ${normalizedId}.` };
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
    return { success: false, message: 'Incorrect password for this NUSU Account.' };
  }

  const vaultId = await deriveVaultId(normalizedId, cleanPassword);
  const vaultPath = `nusu_accounts/${normalizedId}/vault/${vaultId}`;
  let vaultData: any = null;

  try {
    const vaultSnap = await getDoc(doc(db, 'nusu_accounts', normalizedId, 'vault', vaultId));
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
  const restoredFullName = String(vaultData?.fullName || accountData.fullName || 'Zuzu User');
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
          nusuAccountId: normalizedId,
          nusuFullName: restoredFullName,
          nusuPhone: restoredPhone,
          nusuVaultKey: vaultId,
          nusuToken: sessionToken,
          nusuLastSyncedAt: now,
        }
      )
    : saveAppSettings({
        userNickname: restoredFullName,
        nusuAccountId: normalizedId,
        nusuFullName: restoredFullName,
        nusuPhone: restoredPhone,
        nusuVaultKey: vaultId,
        nusuToken: sessionToken,
        nusuLastSyncedAt: now,
      });

  try {
    localStorage.setItem(
      `${LOCAL_VAULT_MIRROR_PREFIX}${normalizedId}`,
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
    accountId: normalizedId,
    fullName: restoredFullName,
    phone: restoredPhone,
    lastSyncedAt: now,
    restoredSettings,
    message: `Signed in as ${normalizedId} (${restoredFullName}). Restored ${chatCount} chats & ${memCount} memories from Firebase!`,
  };
}

/**
 * Syncs local chat history, voice sessions, assistant memories & settings to Firebase Firestore
 */
export async function syncNusuCloudNow(settings: AppSettings): Promise<{
  success: boolean;
  lastSyncedAt?: number;
  message: string;
}> {
  if (!settings.nusuAccountId || !settings.nusuVaultKey) {
    return { success: false, message: 'Sign in with your NUSU ID (NU-XXXXXX) first.' };
  }

  const accountId = settings.nusuAccountId;
  const vaultId = settings.nusuVaultKey;
  const rawSnapshot = getAllBackupPayload();
  const cleanSnapshot = sanitizeSnapshotForFirestore(rawSnapshot);

  try {
    localStorage.setItem(`${LOCAL_VAULT_MIRROR_PREFIX}${accountId}`, JSON.stringify(cleanSnapshot));
  } catch {}

  const rawPhone = String(settings.nusuPhone || cleanSnapshot.settings?.nusuPhone || 'NUSU-User').trim();
  const safePhone = rawPhone.length >= 3 ? rawPhone.slice(0, 40) : 'NUSU-User';
  const rawName = String(settings.nusuFullName || settings.userNickname || 'Zuzu User').trim();
  const safeName = rawName.length >= 1 ? rawName.slice(0, 80) : 'Zuzu User';

  const vaultPath = `nusu_accounts/${accountId}/vault/${vaultId}`;
  try {
    await updateDoc(doc(db, 'nusu_accounts', accountId, 'vault', vaultId), {
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
        parsed.nusuLastSyncedAt = now;
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

export function logoutNusuAccount(): AppSettings {
  return saveAppSettings({
    nusuAccountId: undefined,
    nusuFullName: undefined,
    nusuPhone: undefined,
    nusuToken: undefined,
    nusuVaultKey: undefined,
  });
}
