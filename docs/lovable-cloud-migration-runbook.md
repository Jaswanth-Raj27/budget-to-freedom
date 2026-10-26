# Lovable Cloud migration runbook

**Status:** preparation only. No migration was applied as part of this review.

## Scope and evidence

This runbook combines local source inspection with database and platform facts previously supplied by the project owner. Those supplied facts identify the intended Lovable Cloud project as Debt Free Buddy, project ID `acf39fdc-2c65-4a90-a261-ce2b7194c3a3`. This task did not connect to that project, run SQL, invoke Lovable AI, or change deployment state.

Per the owner-provided Lovable Support guidance, the Cloud workflow uses Lovable's Drizzle-based migration mechanism, records history in `drizzle.__drizzle_migrations`, and maintains the corresponding Drizzle journal. The owner reports that migrations are applied through the Lovable project chat/agent workflow and that `supabase db push` is not the route to use. This support information was not independently verified in this local-only review. The exact hosted executor implementation and its transaction, locking, checksum, retry, and partial-failure semantics remain undocumented/unverified.

The owner reports the live ledger has exactly migrations 0000–0002 and their hashes/timestamps agree with the local files/journal; repayment tables, RPCs, trigger, and 0004 ownership constraints are absent. Treat this as prior owner-provided inspection, not a fresh live check.

## Local artifacts and compatibility

The intended sequence is:

1. `0000_debt_free_buddy_schema.sql`
2. `0001_create_saved_cards.sql`
3. `0002_revoke_truncate_from_api_roles.sql`
4. `0003_repayment_tracking_and_gamification.sql`
5. `0004_repayment_ownership_integrity.sql`
6. `0005_atomic_repayment_protection.sql`
7. `0006_atomic_scenario_save.sql`
8. `0007_payment_idempotency.sql`

The local Drizzle journal and snapshots contain only 0000–0002. Do not fabricate entries, timestamps, hashes, or snapshots for 0003–0007. Local `drizzle.config.ts` points at the intentionally blank `drizzle/schema.ts`; `package.json` has no migration command. There is no `supabase/migrations` directory. These facts alone do not identify the hosted executor. Lovable Support's stated workflow is the only available evidence for the intended application path.

Migrations 0003–0007 contain explicit `BEGIN`/`COMMIT` statements. Drizzle Kit's normal PostgreSQL migration execution may wrap journaled migrations in its own transaction; do not run these files through a generic Drizzle Kit command unless Lovable confirms the exact execution semantics. The hosted Lovable agent path should be used one migration at a time, with its preview and metadata handling reviewed before approval. Do not use `supabase db push`, a hand-built runner, or manual SQL-editor execution as a substitute.

Local inspection confirms migration 0002 is the `REVOKE TRUNCATE` statement and is represented by the existing journal entry. Migrations 0003–0007 create repayment schema, ownership constraints, secured payment and scenario-save RPCs, and idempotency support. They are not generally safe to rerun blindly: table/constraint/index creation and function replacement/drop sequences can fail or produce ambiguous state after partial application. Migration 0004 specifically expects 0003's tables and named payment-card foreign key. It checks ownership relationships before adding composite constraints and adds account-deletion cascades through scenarios/cards. Existing data must satisfy these checks; the expected named FK must exist and be valid. The previously reported live schema has scenarios without an `auth.users` FK and cards with only a scenario FK, so orphan and cross-owner preflight checks are essential.

Migrations 0005 and 0007 locally use the tested non-reserved `role_entry` alias in the permission/ownership checks. Application source calls the five-argument `record_debt_payment` RPC and the `save_debt_scenario` RPC with arguments matching migrations 0007 and 0006 respectively. Generated Supabase types describe those calls. This local source alignment is not evidence that hosted objects exist until the migrations are applied and verified.

## Prior disposable database test evidence

The owner reports that all eight migrations executed in order against a disposable PostgreSQL 17.11/Supabase-compatible environment after the `current_role` alias was corrected to `role_entry` in migrations 0005 and 0007. Reported tests included payment success/overpayment rejection, idempotency and conflict, concurrent requests, authorization, direct-write restrictions, scenario-save atomicity, account deletion, and local PostgREST calls using synthetic JWTs. These results are reported as prior local test results; they do not establish Lovable's migration-runner behavior or production readiness. A manual `psql` run did not create migration-ledger entries.

## Controlled application sequence

Before starting, an authorized owner/operator should confirm the project identity in Lovable's project UI, verify that the migration executor is the documented Lovable Cloud workflow, and ensure there is a recoverable backup/restore point. Confirm the current journal, snapshots, and ledger still agree through Lovable's supported read-only history view. Never use the similarly named local Supabase project configuration to select a remote target.

For each migration 0003, 0004, 0005, 0006, and 0007, separately:

1. Review the exact source file and its SHA-256. Confirm no unreviewed edits or unexpected object/ledger entry exists.
2. Ask Lovable's project agent to analyze and preview **only that migration**, preserve prior files and metadata, and explain the planned schema changes, transaction behavior, and recovery path. Do not ask it to rewrite or regenerate migration history.
3. Review the generated SQL/metadata diff. Confirm it uses the exact reviewed migration content and the established journal/snapshot conventions. Do not approve if it invents historical metadata or combines multiple migrations.
4. Apply only after the preview, target, transaction boundary, and failure behavior are clear. Wait for explicit success from the platform workflow.
5. Use read-only project history/catalog inspection to confirm exactly one expected ledger entry and the expected objects/constraints/policies/functions. Compare recorded hash/timestamp semantics with the executor's documented behavior.
6. Proceed to the next file only if source, journal/snapshot, ledger, and resulting schema agree.

The expected order and immediate focus are:

| Step | Migration | Required check before proceeding |
| --- | --- | --- |
| 1 | 0003 repayment schema | Tables, checks, FKs, RLS, policies, grants created; no partial objects on failure. |
| 2 | 0004 ownership integrity | Preflight data is clean; named payment-card FK exists/valid; composite ownership constraints and auth-user deletion cascades match intent. |
| 3 | 0005 atomic payment protection | Function owner has required privileges; fixed search path, `auth.uid()` authorization, execute grants, direct-write revocations, and balance trigger are present. |
| 4 | 0006 atomic scenario save | RPC signature/grants match frontend; atomic card/scenario handling and ownership checks are present. |
| 5 | 0007 payment idempotency | Five-argument RPC replaces old signature as intended; key uniqueness/locking and execute permissions are correct. |

Suggested Lovable project-chat request for each step (use one request at a time):

> In the verified Debt Free Buddy Lovable Cloud project, review migration `NNNN_filename.sql` only. Do not use Supabase CLI, `supabase db push`, remote SQL outside the approved Lovable migration workflow, or any other project. First show the exact proposed SQL and metadata changes, explain the executor's transaction and failure/retry behavior, and identify preflight results. Preserve all prior migration files and history; do not fabricate or backfill entries. Do not apply until I review the preview and explicitly approve this single migration.

The request is a human review template only. This review did not send it or invoke Lovable AI.

## Stop and recovery rules

- Stop immediately on a failed preflight, altered SQL, unexpected object, duplicate/unknown ledger entry, hash mismatch, or unclear target.
- Do not retry a failed migration blindly. Because hosted transaction/failure semantics are not established, first inspect the ledger and affected schema through the supported read-only Lovable interface. Record the exact error and determine whether the transaction rolled back fully.
- If schema objects exist without the matching ledger entry, or the ledger entry exists without the expected complete schema, treat the state as partial/ambiguous. Do not stamp, delete objects, edit the ledger, or rerun. Obtain platform-owner/support guidance for a reviewed forward repair or restore.
- Do not promise rollback by issuing `ROLLBACK` after a hosted migration. Confirm whether the executor wraps each file atomically. If not, use a reviewed compensating migration or restore procedure appropriate to the observed state.
- Keep migration history and schema changes aligned. Never add journal/snapshot or ledger metadata manually merely to make histories appear consistent.

## Preflight data-integrity checklist for 0004

The authorized operator should use Lovable's read-only catalog/data-quality tooling to establish, without exposing customer rows:

- No scenario references a missing `auth.users` row.
- Every card's `user_id` equals its scenario owner's `user_id`.
- Each debt baseline, payment, monthly-progress row, and achievement references a scenario owned by the same user.
- Every payment's card belongs to the same scenario and user as the payment.
- The expected constraint named `debt_payments_card_id_fkey` exists, references the expected columns/tables, and is validated before 0004 attempts to replace it.
- All prerequisite foreign keys/checks from 0003 exist and are validated; no hidden `NOT VALID` state or conflicting duplicate constraint exists.
- Understand the impact of the new `ON DELETE CASCADE` ownership path from `auth.users` to scenarios and cards. Confirm that intended account deletion removes the associated scenario/card tree, while payment-history/card relationships behave as designed (payment rows should not be silently lost by card-only deletion).

Preflight query results should be summarized as counts/pass-fail only. Do not export or paste names, emails, payment amounts, tokens, or other customer data into the runbook or chat.

## Verification after each application

Use the supported Lovable read-only interface to verify migration history and catalog state: expected relations/columns, validated FKs and checks, indexes, RLS enabled status and policies, grants, function signatures/owners/security configuration/search paths/EXECUTE privileges, trigger enabled state, and absence of direct API-role write paths that bypass the RPC. Also run the previously prepared synthetic-data integration suite in an isolated PostgreSQL/Supabase-compatible environment after any SQL changes. Do not treat application unit tests or static inspection as database verification.

## Remaining blockers before staging

1. Lovable's exact hosted executor semantics (transaction boundaries, serialization, checksum enforcement, failure and retry recovery) have not been documented or independently verified.
2. The operator must verify current live journal/snapshot/ledger state and the 0004 preflight data conditions immediately before proceeding; previous inspection is not a substitute for a current check.
3. Confirm Lovable's per-migration preview preserves the original reviewed SQL and supplies correct metadata without editing earlier entries.
4. After applying in a non-production staging project, perform catalog and authenticated PostgREST behavior tests there before a production change is considered.

This runbook does not authorize production application. No hosted migration, database query, deployment, or push was performed while preparing it.

## Local status update (2026-10-26)

Migrations 0004 and 0005 currently in the workspace are newly authored replacement drafts, not the previously reviewed historical files. Their current SHA-256 values are recorded in `repayment-migration-security-review.md`. The earlier disposable PostgreSQL results do not validate these replacement bytes. The Drizzle journal remains at the verified 0000–0002 history; no entries or snapshots were fabricated for 0003–0007.

The local Docker engine is currently unavailable (`com.docker.service` is stopped and `docker version` cannot reach the engine); PostgreSQL and Supabase CLI are not available on PATH. Do not apply these drafts until a disposable test environment is restored and the complete current migration sequence has been tested. Hosted executor and transaction semantics remain unverified.

## Local verification record (2026-10-12)

- `npm.cmd run build`: passed.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run test:repayment`: passed, 10 tests.
- Focused ESLint on the repayment tracker, dashboard, scenario route, Supabase types, and repayment utility files (Prettier rule disabled): passed.
- `git diff --check`: not run successfully because the Git executable is unavailable in this environment. The runbook file was checked directly for trailing whitespace; repository status and the complete diff remain unverified.
