# Alfred data retention and account erasure

## Active accounts

Alfred retains account and user-created content while an account remains active so the service can provide its requested features.

## User-requested deletion

1. The user confirms the request with their current password and the word `DELETE`.
2. Alfred immediately deactivates the account, revokes its sessions and credentials, disables push delivery, and removes the voice reference.
3. A 30-day grace period allows operational recovery from an accidental request. The account cannot be used during this period.
4. The authenticated morning or evening scheduler processes due erasures in bounded batches.
5. The purge removes user-owned database records, meeting recordings, and project documents. It also clears personal account fields.
6. Alfred retains only a non-identifying user tombstone where required to preserve referential integrity of security and operational records.

The purge discovers ownership from both foreign keys to `users.id` and legacy `user_number` columns. This design causes newly added user-owned tables to enter the purge scope automatically when they follow either ownership convention.

## Backups and third parties

Erasure removes data from the live Alfred database and Alfred-managed file storage. Encrypted provider backups age out according to the provider retention window and are not selectively rewritten. If a backup is restored, due erasures must be run again before normal service resumes.

External processors must be reviewed whenever a new integration is introduced. The current retired messaging integrations do not receive new Alfred data.
