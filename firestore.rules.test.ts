/**
 * Phase 0 Security Specification Runner for Zuzu AI Firestore Rules (SU-ID)
 * Verifies that all "Dirty Dozen" adversarial payloads violate rule invariants.
 */

export const DIRTY_DOZEN_CASES = [
  { name: 'Unbounded List Scrape on /su_accounts', operation: 'list', path: '/su_accounts', expected: 'PERMISSION_DENIED' },
  { name: 'Vault Enumeration on /vault', operation: 'list', path: '/su_accounts/rasel008/vault', expected: 'PERMISSION_DENIED' },
  { name: 'Invalid SU-ID Username Format', operation: 'create', path: '/su_accounts/A!', payload: { accountId: 'A!' }, expected: 'PERMISSION_DENIED' },
  { name: 'Existing Account Overwrite', operation: 'create', path: '/su_accounts/rasel008', payload: { accountId: 'rasel008' }, expected: 'PERMISSION_DENIED' },
  { name: 'Password Hash / Verifier Mutation', operation: 'update', path: '/su_accounts/rasel008', payload: { passwordHash: '0'.repeat(64) }, expected: 'PERMISSION_DENIED' },
  { name: 'Shadow Field Injection on Account', operation: 'create', path: '/su_accounts/rasel008', payload: { accountId: 'rasel008', isAdmin: true }, expected: 'PERMISSION_DENIED' },
  { name: 'Forged Timestamp on Create', operation: 'create', path: '/su_accounts/rasel008', payload: { createdAt: new Date(0).toISOString() }, expected: 'PERMISSION_DENIED' },
  { name: 'Unauthorized Vault Read (Wrong Capability Key)', operation: 'get', path: `/su_accounts/rasel008/vault/${'a'.repeat(64)}`, expected: 'PERMISSION_DENIED' },
  { name: 'Unauthorized Vault Write (Wrong Capability Key)', operation: 'update', path: `/su_accounts/rasel008/vault/${'b'.repeat(64)}`, expected: 'PERMISSION_DENIED' },
  { name: 'Shadow Field Injection on Vault', operation: 'create', path: `/su_accounts/rasel008/vault/${'c'.repeat(64)}`, payload: { shadowRole: 'root' }, expected: 'PERMISSION_DENIED' },
  { name: 'Oversized String Resource Exhaustion', operation: 'create', path: '/su_accounts/rasel008', payload: { fullName: 'X'.repeat(500) }, expected: 'PERMISSION_DENIED' },
  { name: 'Immortal AccountId Mutation on Vault Update', operation: 'update', path: `/su_accounts/rasel008/vault/${'d'.repeat(64)}`, payload: { accountId: 'otheruser99' }, expected: 'PERMISSION_DENIED' }
];
