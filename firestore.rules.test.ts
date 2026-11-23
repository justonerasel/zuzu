/**
 * Security Specification Matrix for Zuzu AI Firestore Rules
 * Covers UID-isolated UserProfile (/users/{userId}) and UserVault (/users/{userId}/vault/primary)
 * plus locked legacy paths (/zu_accounts, /su_accounts).
 */

export const DIRTY_DOZEN_CASES = [
  { name: 'Unbounded List Scrape on /users', operation: 'list', path: '/users', expected: 'PERMISSION_DENIED' },
  { name: 'Cross-User Profile Read (UID mismatch)', operation: 'get', path: '/users/victimUid', authUid: 'attackerUid', expected: 'PERMISSION_DENIED' },
  { name: 'Cross-User Vault Read (UID mismatch)', operation: 'get', path: '/users/victimUid/vault/primary', authUid: 'attackerUid', expected: 'PERMISSION_DENIED' },
  { name: 'Cross-User Vault Write (UID mismatch)', operation: 'update', path: '/users/victimUid/vault/primary', authUid: 'attackerUid', expected: 'PERMISSION_DENIED' },
  { name: 'Vault Enumeration on /users/{uid}/vault', operation: 'list', path: '/users/aliceUid/vault', authUid: 'aliceUid', expected: 'PERMISSION_DENIED' },
  { name: 'Shadow Field Injection on UserProfile', operation: 'create', path: '/users/aliceUid', authUid: 'aliceUid', payload: { uid: 'aliceUid', displayName: 'Alice', role: 'admin' }, expected: 'PERMISSION_DENIED' },
  { name: 'Immutable UID Mutation on UserProfile Update', operation: 'update', path: '/users/aliceUid', authUid: 'aliceUid', payload: { uid: 'otherUid' }, expected: 'PERMISSION_DENIED' },
  { name: 'Forged createdAt Timestamp on Profile Create', operation: 'create', path: '/users/aliceUid', authUid: 'aliceUid', payload: { uid: 'aliceUid', displayName: 'Alice', createdAt: new Date(0).toISOString() }, expected: 'PERMISSION_DENIED' },
  { name: 'Invalid Vault Document ID (must be primary)', operation: 'create', path: '/users/aliceUid/vault/secondary', authUid: 'aliceUid', payload: { uid: 'aliceUid' }, expected: 'PERMISSION_DENIED' },
  { name: 'Oversized Avatar photoData Exhaustion (>200KB)', operation: 'update', path: '/users/aliceUid', authUid: 'aliceUid', payload: { photoData: 'X'.repeat(250000) }, expected: 'PERMISSION_DENIED' },
  { name: 'Legacy /zu_accounts Public Access Lockdown', operation: 'get', path: '/zu_accounts/rasel008', authUid: 'aliceUid', expected: 'PERMISSION_DENIED' },
  { name: 'Legacy /su_accounts Public Access Lockdown', operation: 'get', path: '/su_accounts/rasel008', authUid: 'aliceUid', expected: 'PERMISSION_DENIED' }
];
