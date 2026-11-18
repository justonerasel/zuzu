# Zuzu AI Firestore Security Specification (SU-ID Custom Username System)

## 1. Data Invariants
1. Every SU-ID canonical key must strictly match `^[a-z0-9][a-z0-9_-]{2,31}$` (derived from user-chosen alphanumeric Username) and cannot be overwritten after creation (`!exists(...)`).
2. `list` queries on `/su_accounts` and `/su_accounts/{suId}/vault` are permanently disabled (`allow list: if false`) to prevent enumeration or scraping.
3. Sensitive PII (`phone`), chat histories, voice sessions, assistant memories, Master PIN hash, and owner face profiles live exclusively inside `/su_accounts/{suId}/vault/{vaultId}` rather than the root account document.
4. Access (`get`, `create`, `update`) to `/su_accounts/{suId}/vault/{vaultId}` is gated cryptographically by checking `hashing.sha256(('verify::' + vaultId).toUtf8()).toHexString().lower() == get(...).data.vaultVerifier`, guaranteeing only someone holding the password-derived `vaultId` can read or mutate the vault.
5. `createdAt` and `updatedAt` must equal `request.time`; `createdAt`, `accountId`, `username`, `passwordSalt`, `passwordHash`, and `vaultVerifier` are immutable after creation.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unbounded List Scrape (`/su_accounts`)**: Attempting `list` on `/su_accounts`.
2. **Vault Enumeration (`/su_accounts/rasel008/vault`)**: Attempting `list` on `/vault`.
3. **Invalid SU-ID Format**: Creating `/su_accounts/A!` (fails `^[a-z0-9][a-z0-9_-]{2,31}$`).
4. **Account Overwrite Hijack**: Calling `create` on an existing `/su_accounts/rasel008`.
5. **Password Hash / Verifier Tampering**: Updating `passwordHash` or `vaultVerifier` on an existing `/su_accounts/rasel008`.
6. **Ghost / Shadow Field Injection on Account**: Creating `/su_accounts/rasel008` with extra key `isAdmin: true`.
7. **Timestamp Forgery**: Creating/updating a document with client-chosen `createdAt` or `updatedAt != request.time`.
8. **Unauthorized Vault Read**: Reading `/su_accounts/rasel008/vault/<wrong_64_hex_id>` without knowing the password-derived `vaultId`.
9. **Unauthorized Vault Write**: Creating or updating `/su_accounts/rasel008/vault/<wrong_64_hex_id>`.
10. **Ghost Field Injection on Vault**: Writing `/su_accounts/rasel008/vault/<valid_id>` with disallowed key `shadowRole: "root"`.
11. **Oversized Denial-of-Wallet String**: Writing `fullName` > 80 chars or `phone` > 40 chars or `chatHistory` > 500 items.
12. **Immortal AccountId Mutation**: Updating `accountId` inside `/vault/{vaultId}` to a different username key.

## 3. Verification Runner
See `firestore.rules.test.ts` for automated verification payloads matching all 12 adversarial cases.
