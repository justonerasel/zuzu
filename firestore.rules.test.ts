/**
 * Phase 0 Security Specification Runner for Zuzu AI Firestore Rules
 * Verifies that all "Dirty Dozen" adversarial payloads violate rule invariants.
 */

export const DIRTY_DOZEN_CASES = [
  { name: 'Unbounded List Scrape on /nusu_accounts', operation: 'list', path: '/nusu_accounts', expected: 'PERMISSION_DENIED' },
  { name: 'Vault Enumeration on /vault', operation: 'list', path: '/nusu_accounts/NU-123456/vault', expected: 'PERMISSION_DENIED' },
  { name: 'Invalid NUSU ID Format', operation: 'create', path: '/nusu_accounts/INVALID_ID', payload: { accountId: 'INVALID_ID' }, expected: 'PERMISSION_DENIED' },
  { name: 'Existing Account Overwrite', operation: 'create', path: '/nusu_accounts/NU-123456', payload: { accountId: 'NU-123456' }, expected: 'PERMISSION_DENIED' },
  { name: 'Password Hash / Verifier Mutation', operation: 'update', path: '/nusu_accounts/NU-123456', payload: { passwordHash: '0'.repeat(64) }, expected: 'PERMISSION_DENIED' },
  { name: 'Shadow Field Injection on Account', operation: 'create', path: '/nusu_accounts/NU-123456', payload: { accountId: 'NU-123456', isAdmin: true }, expected: 'PERMISSION_DENIED' },
  { name: 'Forged Timestamp on Create', operation: 'create', path: '/nusu_accounts/NU-123456', payload: { createdAt: new Date(0).toISOString() }, expected: 'PERMISSION_DENIED' },
  { name: 'Unauthorized Vault Read (Wrong Capability Key)', operation: 'get', path: `/nusu_accounts/NU-123456/vault/${'a'.repeat(64)}`, expected: 'PERMISSION_DENIED' },
  { name: 'Unauthorized Vault Write (Wrong Capability Key)', operation: 'update', path: `/nusu_accounts/NU-123456/vault/${'b'.repeat(64)}`, expected: 'PERMISSION_DENIED' },
  { name: 'Shadow Field Injection on Vault', operation: 'create', path: `/nusu_accounts/NU-123456/vault/${'c'.repeat(64)}`, payload: { shadowRole: 'root' }, expected: 'PERMISSION_DENIED' },
  { name: 'Oversized String Resource Exhaustion', operation: 'create', path: '/nusu_accounts/NU-123456', payload: { fullName: 'X'.repeat(500) }, expected: 'PERMISSION_DENIED' },
  { name: 'Immortal AccountId Mutation on Vault Update', operation: 'update', path: `/nusu_accounts/NU-123456/vault/${'d'.repeat(64)}`, payload: { accountId: 'NU-999999' }, expected: 'PERMISSION_DENIED' }
];
