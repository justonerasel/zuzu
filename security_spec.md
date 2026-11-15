# Zuzu AI Firestore Security Specification

## 1. Data Invariants
1. Every NUSU account ID must strictly match `^NU-[0-9]{6}$` and cannot be overwritten after creation (`!exists(...)`).
2. `list` queries on `/nusu_accounts` and `/nusu_accounts/{nusuId}/vault` are permanently disabled (`allow list: if false`) to prevent enumeration or scraping.
3. Sensitive PII (`phone`), chat histories, voice sessions, assistant memories, Master PIN hash, and owner face descriptors live exclusively inside `/nusu_accounts/{nusuId}/vault/{vaultId}` rather than the root account document.
4. Access (`get`, `create`, `update`) to `/nusu_accounts/{nusuId}/vault/{vaultId}` is gated cryptographically by checking `hashing.sha256(('verify::' + vaultId).toUtf8()).toHexString().lower() == get(...).data.vaultVerifier`, guaranteeing only someone holding the password-derived `vaultId` can read or mutate the vault.
5. `createdAt` and `updatedAt` must equal `request.time`; `createdAt`, `accountId`, `passwordSalt`, `passwordHash`, and `vaultVerifier` are immutable after creation.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unbounded List Scrape (`/nusu_accounts`)**: Attempting `list` on `/nusu_accounts`.
2. **Vault Enumeration (`/nusu_accounts/NU-123456/vault`)**: Attempting `list` on `/vault`.
3. **Invalid NUSU ID Format**: Creating `/nusu_accounts/ADMIN_1` (fails `^NU-[0-9]{6}$`).
4. **Account Overwrite Hijack**: Calling `create` on an existing `/nusu_accounts/NU-123456`.
5. **Password Hash / Verifier Tampering**: Updating `passwordHash` or `vaultVerifier` on an existing `/nusu_accounts/NU-123456`.
6. **Ghost / Shadow Field Injection on Account**: Creating `/nusu_accounts/NU-123456` with extra key `isAdmin: true`.
7. **Timestamp Forgery**: Creating/updating a document with client-chosen `createdAt` or `updatedAt != request.time`.
8. **Unauthorized Vault Read**: Reading `/nusu_accounts/NU-123456/vault/<wrong_64_hex_id>` without knowing the password-derived `vaultId`.
9. **Unauthorized Vault Write**: Creating or updating `/nusu_accounts/NU-123456/vault/<wrong_64_hex_id>`.
10. **Ghost Field Injection on Vault**: Writing `/nusu_accounts/NU-123456/vault/<valid_id>` with disallowed key `shadowRole: "root"`.
11. **Oversized Denial-of-Wallet String**: Writing `fullName` > 80 chars or `phone` > 40 chars or `chatHistory` > 500 items.
12. **Immortal AccountId Mutation**: Updating `accountId` inside `/vault/{vaultId}` to a different `NU-XXXXXX`.

## 3. Verification Runner
See `firestore.rules.test.ts` for automated verification payloads matching all 12 adversarial cases.
