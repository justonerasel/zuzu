import {
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  User,
  browserLocalPersistence,
  deleteUser,
  linkWithCredential,
  linkWithPhoneNumber,
  linkWithPopup,
  onAuthStateChanged,
  setPersistence,
  signInWithCredential,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  unlink,
  updateProfile
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth } from './firebase';
import { getNativeZuzuPlugin } from './permission';
import { recordUploadedFileMeta } from './storage';

export interface PhoneCountryOption {
  code: string;
  dialCode: string;
  name: string;
  flag: string;
  sample: string;
}

export const PHONE_COUNTRIES: PhoneCountryOption[] = [
  { code: 'BD', dialCode: '+880', name: 'Bangladesh', flag: '🇧🇩', sample: '017XXXXXXXX' },
  { code: 'US', dialCode: '+1', name: 'United States', flag: '🇺🇸', sample: '4155552671' },
  { code: 'GB', dialCode: '+44', name: 'United Kingdom', flag: '🇬🇧', sample: '7911123456' },
  { code: 'IN', dialCode: '+91', name: 'India', flag: '🇮🇳', sample: '9876543210' },
  { code: 'SA', dialCode: '+966', name: 'Saudi Arabia', flag: '🇸🇦', sample: '501234567' },
  { code: 'AE', dialCode: '+971', name: 'UAE', flag: '🇦🇪', sample: '501234567' },
  { code: 'MY', dialCode: '+60', name: 'Malaysia', flag: '🇲🇾', sample: '123456789' },
  { code: 'SG', dialCode: '+65', name: 'Singapore', flag: '🇸🇬', sample: '81234567' },
  { code: 'PK', dialCode: '+92', name: 'Pakistan', flag: '🇵🇰', sample: '3001234567' },
  { code: 'CA', dialCode: '+1', name: 'Canada', flag: '🇨🇦', sample: '4165550199' },
  { code: 'AU', dialCode: '+61', name: 'Australia', flag: '🇦🇺', sample: '412345678' },
  { code: 'DE', dialCode: '+49', name: 'Germany', flag: '🇩🇪', sample: '15112345678' }
];

export function formatPhoneToE164(
  dialCode: string,
  rawNationalInput: string
): { valid: boolean; e164: string; error?: string } {
  const cleanedRaw = rawNationalInput.trim().replace(/[\s\-().]/g, '');
  if (!cleanedRaw) {
    return { valid: false, e164: '', error: 'Please enter a valid mobile number.' };
  }

  let candidate = '';
  if (cleanedRaw.startsWith('+')) {
    candidate = `+${cleanedRaw.slice(1).replace(/\D/g, '')}`;
  } else {
    let nationalDigits = cleanedRaw.replace(/\D/g, '');
    const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode.replace(/\D/g, '')}`;
    if (cleanDial === '+880' && nationalDigits.startsWith('0')) {
      nationalDigits = nationalDigits.slice(1);
    } else if (nationalDigits.startsWith('0') && nationalDigits.length > 9) {
      nationalDigits = nationalDigits.replace(/^0+/, '');
    }
    candidate = `${cleanDial}${nationalDigits}`;
  }

  if (candidate.startsWith('+880')) {
    const bdLocal = candidate.slice(4);
    if (!/^1[3-9]\d{8}$/.test(bdLocal)) {
      return {
        valid: false,
        e164: '',
        error: 'Enter a valid 10/11-digit Bangladesh mobile number (e.g. 017XXXXXXXX).'
      };
    }
  }

  if (!/^\+[1-9]\d{6,14}$/.test(candidate)) {
    return {
      valid: false,
      e164: '',
      error: 'Phone number must be a valid international E.164 format (7-15 digits).'
    };
  }

  return { valid: true, e164: candidate };
}

export function mapFirebaseAuthError(err: any): { code: string; message: string; cancelled?: boolean } {
  const code = String(err?.code || '');
  const rawMessage = String(err?.message || '');

  if (code === 'CANCELED' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return { code, message: 'Sign-in was cancelled.', cancelled: true };
  }
  if (code === 'auth/popup-blocked') {
    return { code, message: 'Sign-in popup was blocked by the browser. Please allow popups and try again.' };
  }
  if (code === 'auth/unauthorized-domain') {
    return {
      code,
      message: 'This domain is not authorized in Firebase Console -> Authentication -> Settings -> Authorized domains.'
    };
  }
  if (code === 'auth/operation-not-allowed') {
    return {
      code,
      message: 'This sign-in provider is not enabled yet in Firebase Console -> Authentication -> Sign-in method.'
    };
  }
  if (code === 'auth/billing-not-enabled') {
    return {
      code,
      message: 'Firebase Phone SMS requires billing / Blaze quota (or configured test phone numbers) in Firebase Console.'
    };
  }
  if (code === 'auth/invalid-phone-number') {
    return { code, message: 'The phone number format is invalid. Check country code and digits.' };
  }
  if (code === 'auth/invalid-verification-code') {
    return { code, message: 'Incorrect OTP verification code. Please check the 6-digit SMS code and retry.' };
  }
  if (code === 'auth/code-expired') {
    return { code, message: 'OTP code has expired. Tap Resend OTP to request a new code.' };
  }
  if (code === 'auth/too-many-requests') {
    return { code, message: 'Too many OTP or sign-in attempts. Wait a few minutes before retrying.' };
  }
  if (code === 'auth/captcha-check-failed' || code === 'auth/missing-app-credential') {
    return {
      code,
      message: 'reCAPTCHA verification failed. Ensure Authorized Domains & reCAPTCHA are allowed on this origin.'
    };
  }
  if (code === 'auth/credential-already-in-use') {
    return {
      code,
      message: 'This Google account or phone number is already linked to another existing account.'
    };
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return {
      code,
      message: 'An account already exists with this email/identifier under a different sign-in method. Sign in with your existing method and link accounts inside Profile.'
    };
  }
  if (code === 'auth/provider-already-linked') {
    return { code, message: 'This authentication provider is already linked to your account.' };
  }
  if (code === 'auth/requires-recent-login') {
    return {
      code,
      message: 'For your security, please sign out and sign back in freshly before deleting your account.'
    };
  }
  if (code === 'auth/network-request-failed') {
    return { code, message: 'Network unavailable. Check your internet connection and retry.' };
  }
  if (code === 'NO_CREDENTIAL') {
    return {
      code,
      message:
        'Native Android Google Sign-In returned no credential. Ensure a Google account is signed in on this Android device and the APK SHA-1 fingerprint is added in Firebase Console.'
    };
  }

  return {
    code: code || 'auth/unknown',
    message: rawMessage || 'Authentication request failed. Please try again.'
  };
}

let persistenceInitialized = false;
export async function ensureAuthPersistence(): Promise<void> {
  if (persistenceInitialized) return;
  persistenceInitialized = true;
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {}
}

export function subscribeFirebaseAuthState(cb: (user: User | null) => void): () => void {
  ensureAuthPersistence().catch(() => {});
  return onAuthStateChanged(auth, cb);
}

let activeRecaptchaVerifier: RecaptchaVerifier | null = null;
let activeRecaptchaContainerId: string | null = null;

export function clearRecaptchaVerifier(): void {
  if (activeRecaptchaVerifier) {
    try {
      activeRecaptchaVerifier.clear();
    } catch {}
    activeRecaptchaVerifier = null;
  }
  if (activeRecaptchaContainerId && typeof document !== 'undefined') {
    const el = document.getElementById(activeRecaptchaContainerId);
    if (el) el.innerHTML = '';
  }
  activeRecaptchaContainerId = null;
}

function getOrCreateRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  clearRecaptchaVerifier();
  activeRecaptchaContainerId = containerId;
  activeRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible'
  });
  return activeRecaptchaVerifier;
}

export async function signInWithGoogleAuth(): Promise<{
  success: boolean;
  user?: User;
  cancelled?: boolean;
  error?: string;
}> {
  await ensureAuthPersistence();
  const nativePlugin = Capacitor.isNativePlatform() ? getNativeZuzuPlugin() : null;

  if (nativePlugin?.signInWithGoogleCredential && firebaseConfig.oAuthClientId) {
    try {
      const nativeRes = await nativePlugin.signInWithGoogleCredential({
        serverClientId: firebaseConfig.oAuthClientId
      });
      if (nativeRes?.idToken) {
        const cred = GoogleAuthProvider.credential(nativeRes.idToken);
        const result = await signInWithCredential(auth, cred);
        return { success: true, user: result.user };
      }
    } catch (nativeErr: any) {
      const mapped = mapFirebaseAuthError(nativeErr);
      if (mapped.cancelled) {
        return { success: false, cancelled: true, error: mapped.message };
      }
      // Fall through to popup only if non-native-config issue, otherwise return honest guidance
      if (mapped.code === 'NO_CREDENTIAL' || mapped.code === 'GOOGLE_CREDENTIAL_ERROR') {
        return { success: false, error: mapped.message };
      }
    }
  }

  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    return { success: true, user: result.user };
  } catch (err) {
    const mapped = mapFirebaseAuthError(err);
    return { success: false, cancelled: mapped.cancelled, error: mapped.message };
  }
}

export async function linkGoogleToCurrentUser(): Promise<{
  success: boolean;
  user?: User;
  cancelled?: boolean;
  error?: string;
}> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'You must be signed in before linking Google.' };
  }

  const nativePlugin = Capacitor.isNativePlatform() ? getNativeZuzuPlugin() : null;
  if (nativePlugin?.signInWithGoogleCredential && firebaseConfig.oAuthClientId) {
    try {
      const nativeRes = await nativePlugin.signInWithGoogleCredential({
        serverClientId: firebaseConfig.oAuthClientId
      });
      if (nativeRes?.idToken) {
        const cred = GoogleAuthProvider.credential(nativeRes.idToken);
        const result = await linkWithCredential(currentUser, cred);
        return { success: true, user: result.user };
      }
    } catch (nativeErr: any) {
      const mapped = mapFirebaseAuthError(nativeErr);
      return { success: false, cancelled: mapped.cancelled, error: mapped.message };
    }
  }

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await linkWithPopup(currentUser, provider);
    return { success: true, user: result.user };
  } catch (err) {
    const mapped = mapFirebaseAuthError(err);
    return { success: false, cancelled: mapped.cancelled, error: mapped.message };
  }
}

export async function sendPhoneOtpCode(params: {
  dialCode: string;
  phoneInput: string;
  recaptchaContainerId: string;
  mode?: 'signin' | 'link';
}): Promise<{
  success: boolean;
  e164Phone?: string;
  confirmationResult?: ConfirmationResult;
  error?: string;
}> {
  await ensureAuthPersistence();
  const formatted = formatPhoneToE164(params.dialCode, params.phoneInput);
  if (!formatted.valid) {
    return { success: false, error: formatted.error || 'Invalid mobile number.' };
  }

  if (params.mode === 'link' && !auth.currentUser) {
    return { success: false, error: 'Please sign in before linking a mobile number.' };
  }

  try {
    const verifier = getOrCreateRecaptchaVerifier(params.recaptchaContainerId);
    const confirmationResult =
      params.mode === 'link' && auth.currentUser
        ? await linkWithPhoneNumber(auth.currentUser, formatted.e164, verifier)
        : await signInWithPhoneNumber(auth, formatted.e164, verifier);
    return {
      success: true,
      e164Phone: formatted.e164,
      confirmationResult
    };
  } catch (err) {
    clearRecaptchaVerifier();
    const mapped = mapFirebaseAuthError(err);
    return { success: false, error: mapped.message };
  }
}

export async function confirmPhoneOtpCode(
  confirmationResult: ConfirmationResult,
  otpCode: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  const cleanCode = otpCode.trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return { success: false, error: 'Please enter the 6-digit numeric OTP verification code.' };
  }
  try {
    const cred = await confirmationResult.confirm(cleanCode);
    clearRecaptchaVerifier();
    return { success: true, user: cred.user };
  } catch (err) {
    const mapped = mapFirebaseAuthError(err);
    return { success: false, error: mapped.message };
  }
}

export async function unlinkAuthProvider(providerId: string): Promise<{
  success: boolean;
  user?: User;
  error?: string;
}> {
  const user = auth.currentUser;
  if (!user) return { success: false, error: 'Not authenticated.' };
  if ((user.providerData || []).length <= 1) {
    return {
      success: false,
      error: 'Cannot remove your only sign-in method. Link another provider first.'
    };
  }
  try {
    const updated = await unlink(user, providerId);
    return { success: true, user: updated };
  } catch (err) {
    const mapped = mapFirebaseAuthError(err);
    return { success: false, error: mapped.message };
  }
}

export async function updateFirebaseDisplayProfile(params: {
  displayName?: string;
  photoURL?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const payload: { displayName?: string | null; photoURL?: string | null } = {};
  if (params.displayName !== undefined) {
    payload.displayName = params.displayName.trim().slice(0, 80);
  }
  // Firebase Auth photoURL has strict ~2KB limit, so only sync HTTP(S) URLs to Firebase Auth
  if (params.photoURL !== undefined && /^https?:\/\//i.test(params.photoURL)) {
    payload.photoURL = params.photoURL;
  }
  if (Object.keys(payload).length > 0) {
    await updateProfile(user, payload);
  }
}

export async function signOutFirebaseUser(): Promise<void> {
  clearRecaptchaVerifier();
  await signOut(auth);
}

export async function deleteCurrentFirebaseUserOnly(user: User): Promise<void> {
  await deleteUser(user);
}

/**
 * Compresses an uploaded image file to a small JPEG Data URL (<= 192x192, well under 150KB)
 * so it complies cleanly with Firestore's 200,000 byte photoData rule.
 */
export async function resizeAvatarImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, WebP).');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Invalid image format.'));
    el.src = dataUrl;
  });

  const maxSide = 192;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Image processing unavailable in this browser.');
  }
  ctx.drawImage(img, 0, 0, width, height);

  let compressed = canvas.toDataURL('image/jpeg', 0.8);
  if (compressed.length > 180000) {
    compressed = canvas.toDataURL('image/jpeg', 0.55);
  }
  if (compressed.length > 195000) {
    throw new Error('Compressed avatar still exceeds size limit. Choose a smaller image.');
  }

  recordUploadedFileMeta({
    name: file.name,
    mimeType: 'image/jpeg',
    sizeBytes: compressed.length,
    source: 'profile_avatar'
  });

  return compressed;
}
