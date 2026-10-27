# Migration runner evidence

Inspection date: 2026-10-26. This records local source evidence, not approval to apply migrations or proof of hosted runner behavior.

## Current workspace

Git status reports deletions of `docs/repayment-migration-security-review.md` and `docs/lovable-cloud-migration-runbook.md`. Those deletions were preserved. The referenced `docs/repayment-migration-local-test-results.md` is also absent. `docs/recovered-migrations` currently contains no files. Prior conversation and reconciliation-plan test results are historical reports; they were not rerun in this inspection.

Git is available through WSL even though it is absent from the Windows PATH. The inspected HEAD is `f436e88`. Existing source edits, migration edits, and deleted files were preserved.

## Current source hashes

SHA-256 was computed directly from the current files with PowerShell `Get-FileHash`.

| Migration | Current SHA-256 | Provenance |
| --- | --- | --- |
| 0003 | `788CE5F721C952E73187496B5A3F0AB6EDF78CB8C78DBB4EC4F9E97EF1CABBD7` | Does not match supplied original hash. |
| 0004 | `01628A92592F993F25542E6A25ECB50F5EF610F7E38DE0A4AAB806C092A5A678` | Explicitly marked new local replacement draft; does not match supplied original hash. |
| 0005 | `A62E7CFCCC5F050CD7FC09A9D621BDDB8A7E452B8AFC04274C1C31A55207A58E` | Explicitly marked new local replacement draft. |
| 0006 | `2053E49FE50E66BA1A81A00B9197704E091182432E5281EA0DCB27584DA257F9` | Local artifact; no supplied original hash. |
| 0007 | `B5AD703986FF876A2AEDB7225BB76FE94AC2CC9CE9BF098173D00264B48836AC` | Local artifact; no supplied original hash. |

The supplied original hashes are `22721774CB9F3B30E97B7E918BC3BCE942B3CA8D664CD72BECB10EB521E50ED9` (0003) and `1A0A39CF76369C7C7271AE4D451D0419F3FDE0C015D4334EA79B499C4B367721` (0004). A current-file mismatch does not establish that the current SQL is incorrect; it prevents claiming byte-for-byte recovery.

Recovery search limitation: WSL Git status and recent history reads succeeded, but `git cat-file --batch-all-objects --batch` and `git count-objects -v` stalled during filesystem access and were interrupted. A native Node loose-object scan also stalled. No exhaustive object-search result is available; do not interpret this attempt as proof that the originals are absent from Git. No recovered source was written over the current files.

## Confirmed runner limitations

- `drizzle/migrations/meta/_journal.json` selects only 0000–0002. Installed `node_modules/drizzle-orm/migrator.js:12` iterates journal entries, rather than discovering every SQL file. Thus this reader does not select 0003–0007 today.
- `node_modules/drizzle-orm/pg-core/dialect.js:55` reads only the latest ledger row. Lines 61–70 select migrations by timestamp, execute SQL, and store hashes. This implementation does not compare previously applied file hashes to ledger hashes and has no explicit advisory lock in this method. A stored checksum is not evidence that reruns enforce checksum consistency.
- The same method wraps pending work in `session.transaction`. Current SQL has explicit outer transactions: 0003 lines 1/226; 0004 lines 4/215; 0005 lines 4/301; 0006 lines 1/235; 0007 lines 1/238. Passing these files unchanged through a surrounding transaction does not establish atomic schema-plus-ledger commits. Runner compatibility must be demonstrated before execution.
- `drizzle.config.ts` configures Drizzle Kit and an environment-based URL. `package.json` has no migration command. `supabase/migrations` is absent. These facts do not identify the hosted executor.

## Decision

Do not select a hosted runner or manufacture journal entries from this evidence. Preserve the existing authoritative ledger and obtain the mechanism that applied 0000–0002, its transaction handling, checksum enforcement, lock behavior, and failure/retry semantics. The earlier read-only ledger observation in the reconciliation plan does not prove those executor behaviors.

If a platform runner exists, validate its behavior on an isolated test target. If it cannot meet the requirements, design a single replacement execution path against the verified ledger schema before implementation. A replacement must reject checksum/schema mismatches, serialize execution, and commit each migration with its ledger entry atomically. Do not silently switch to Supabase CLI and introduce another migration history.

## Remaining acceptance work

1. Establish exact original source recovery or explicitly review the replacements as new drafts; these are different provenance outcomes.
2. Obtain authoritative hosted runner evidence. No hosted service was contacted in this inspection.
3. Validate the selected runner on disposable data: successful apply, matching rerun, changed checksum refusal, concurrent runner refusal, rollback after injected failure, and interrupted-run reconciliation.
4. Complete real local Supabase Auth/PostgREST tests once its image-download blocker is resolved. Native PostgreSQL tests cannot substitute for those API checks.

No migration SQL, journal, snapshot, or database state was changed by this inspection. No application tests were rerun for this documentation-only change.

## Local Supabase CLI transaction test (2026-10-27)

Supabase CLI 2.121.0 applied a deliberately failing migration on disposable PostgreSQL 17.11. With `BEGIN; CREATE TABLE ...; COMMIT; SELECT 1/0;`, the command failed but the table remained and the migration history had zero entries. With `CREATE TABLE ...; SELECT 1/0;` and no explicit wrapper, the command failed, the table was absent, and history had zero entries. This confirms the wrapper can break atomic recording for this CLI version; it does not validate the repayment SQL or a remote target.

For newly generated Supabase migration copies, the proposed change for each of 0003, 0004, 0005, 0006, and 0007 is exactly:

```diff
-BEGIN;
@@ remaining SQL unchanged @@
-COMMIT;
```

The original files and Drizzle journal remain unchanged. The new copies must be created by the Supabase CLI, with actual new migration identities, then tested in order on a disposable database including success, rerun, failure, and security checks. The transformed files and their own hashes must be preserved as the authoritative source for the new project if adopted. Do not represent the copies as recovered original artifacts. No hosted migration has been run under this proposal.

## New Supabase project application (2026-10-27)

The new free-plan project `wvdiagenjylxnhmogtcl` was verified as empty before application. Supabase CLI 2.121.0 generated the eight new migration files now in `supabase/migrations`; their contents match the local test copies byte-for-byte. Files 0003–0007 remove only the explicit outer transaction statements shown above; the Drizzle originals and journal were not changed.

On disposable PostgreSQL 17.11 with a minimal Auth shim, all eight copies applied through the Supabase CLI, a second invocation was a no-op, and failure rollback, cross-user denial, RLS visibility, idempotent payment retry and denial of direct payment inserts were checked. The test shim was granted trigger privileges after the first 0000 attempt failed; a read-only check established that the real target's migration role has that privilege. This remains an Auth shim, not real Supabase Auth verification.

The same eight files were then applied successfully to the new hosted project via `supabase migration up --linked --project-ref wvdiagenjylxnhmogtcl` (no `db push`). The hosted database reports eight history rows, RLS enabled on all eight app tables, no anonymous privileges on debt_payments, no authenticated direct payment write or column write privileges, and both expected RPCs present. An unauthenticated payment REST request returned HTTP 401. Live authenticated user flows, hosted environment configuration, backups and deployment remain to be verified. The previous Lovable database was not modified during this application.
