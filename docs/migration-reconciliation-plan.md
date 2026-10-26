# Migration reconciliation and testing plan

This is a local plan. The live-database catalog spot check below is historical; no database was contacted for the current review. A disposable local PostgreSQL run is recorded separately below. Neither result establishes that every live object is free of manual drift.

## Read-only target spot check (2026-10-12)

An authorized catalog-only inspection targeted the intended Lovable Cloud project supplied by the owner. The database was enabled. It returned only the expected base tables among the eight application tables queried: `profiles`, `scenarios`, `cards`, and `saved_cards`; repayment tables were absent. The Drizzle ledger contained three rows. Their recorded hashes and timestamps matched the exact local 0000, 0001, and restored 0002 files/journal entries. This establishes ledger agreement for those three file bytes, not that every live object is free of manual drift.

RLS was enabled on all four base tables. The returned policy list was scoped to `authenticated`; the policy expressions were not fetched. Effective privilege checks showed `TRUNCATE` denied to both `anon` and `authenticated` on all four tables. Ordinary table privileges were present for those roles, so the RLS policies remain essential; the catalog listing showed no `anon` policies. Among the searched functions, only `handle_new_user` was present; the repayment and scenario-save RPCs were absent. No non-internal triggers were returned for the four public base tables. Further foreign-key, auth-trigger, and orphan-row catalog checks were blocked by the provider's read-only query limit; do not infer those results.

The original 0000 source does not add a foreign key from `scenarios.user_id` to `auth.users`; 0004 adds that cascade. Until 0004 is applied and verified, the account-deletion UI's promise to remove scenarios is not established by the database schema. The live constraint/orphan check could not be completed in this inspection, so treat full account deletion as a deployment blocker and do not assume existing scenario rows will cascade.

## Earlier disposable PostgreSQL verification (2026-10-12; not validation of current drafts)

A fresh disposable local Supabase/PostgreSQL 17.11 instance was previously used to execute an earlier set of temporary copies of migrations 0000–0007. That run reported passing payment, idempotency, concurrency, authorization, direct-write/TRUNCATE, scenario-save, and account-deletion checks, plus HTTP 200 results for the two RPCs through local PostgREST with synthetic JWTs. The temporary copies of 0005 and 0007 used the `current_role` to `role_entry` syntax correction. These are historical results for those exact temporary bytes only.

The migrations were applied manually with `psql`; this did not create migration-ledger entries. `supabase migration up --local` reported no migrations to apply for that legacy filename set. The earlier results do **not** validate the current locally authored replacement drafts for 0004 and 0005, the current corrected 0003 bytes, a migration runner, ledger reconciliation, production state, or Lovable Cloud behavior. The earlier disposable workspace and Docker volumes were retained. No production database was contacted during that test run.

Recompute hashes for the exact current files before any future database test. Do not cite the earlier PostgreSQL results as validation of the current SQL drafts.

## Repayment migration provenance

The current local 0003–0007 files are not a fully verified release set. Migration 0003 was restored byte-for-byte from its original local Git blob, then modified to revoke TRUNCATE from PUBLIC/anon/authenticated. Current 0004 and 0005 are newly authored replacement drafts because their previously reviewed source bytes could not be recovered. Migrations 0006 and 0007 remain local SQL artifacts whose compatibility with these replacement drafts has not been tested as a complete sequence. The earlier PostgreSQL run described above used different 0004/0005 bytes and does not validate this sequence. Treat the present files as drafts pending static review and repeatable disposable PostgreSQL testing.

## What workflow is established

No production migration runner is established by the checked-in project evidence. `.lovable/project.json` identifies a Lovable template revision but contains no migration configuration. The README describes Lovable publishing and source synchronization, not database migration execution. `supabase/` contains configuration but no migration directory. `package.json` has no migration script. Drizzle Kit is installed and `drizzle.config.ts` points to PostgreSQL, but `drizzle/schema.ts` is blank and Drizzle's journal only selects 0000–0002. Therefore its presence is not evidence that Drizzle Kit is the Lovable Cloud production runner.

The local Drizzle migrator executes journal-listed files and wraps pending PostgreSQL migrations in a transaction. Migrations 0003–0007 contain their own outer `BEGIN`/`COMMIT`; do not register or run them through that transaction-wrapping path without first proving and resolving the boundary behavior. No migration runner was implemented in this task.

## Recommended strategy

First, have an authorized operator confirm in the correct Lovable Cloud project's management interface whether a platform migration workflow exists, which ledger it uses, and how it handles explicit transaction statements, checksums, concurrent runs, and failed runs. If it satisfies the controls below, keep it as the only runner and ledger.

If no suitable platform workflow exists, use a reviewed custom runner as the sole execution path. It must adopt and validate the already established ledger rather than create a second history. Before use, verify the live ledger table and reconcile the exact 0000–0002 entries and hashes. A runner must fail closed if it cannot prove that reconciliation. Do not use Drizzle Kit and a custom runner interchangeably.

The custom-runner design must satisfy all of these before implementation or database use:

- Require an explicit target profile and project identity; have no implicit URL fallback, no personal-project default, and deny production unless a separate deliberate release approval is supplied. Display only a safe target label, never a connection string.
- Serialize runners with a PostgreSQL advisory lock. Check the lock is held for the entire migration decision and execution.
- Keep one authoritative ledger. Before a migration, compare its exact source-file SHA-256 with any existing ledger record. A match can be skipped; a mismatch, unknown ledger state, or unexplained schema state must stop for operator reconciliation.
- Ensure a migration's DDL and its success ledger record commit atomically. Because 0003–0007 have explicit transaction wrappers, a candidate implementation may execute the validated file body inside a runner-managed transaction after removing only verified outer wrapper statements in memory. It must reject nested/unexpected transaction control, preserve/checksum the untouched original bytes, use a PostgreSQL-aware execution mechanism (not naive semicolon splitting), and prove rollback behavior on the disposable instance. Do not edit the historical files to make a runner fit.
- If atomic ledger recording cannot be demonstrated, do not auto-retry after an interrupted run. Record an in-progress state in the same authoritative ledger if its verified design permits; otherwise stop on any ambiguous result and require schema/history reconciliation before retry. Never interpret an absent success row alone as proof that nothing committed.
- On any error, roll back the whole migration transaction, leave no success record, release the lock, and exit nonzero. A checksum mismatch or partially applied migration is a hard stop, never a prompt to continue.

This is a design proposal, not an implemented or tested runner. The existing Drizzle ledger format and the target's actual ledger location/semantics must be verified before deciding whether it can serve as the authoritative ledger for a custom runner.

## Local migration sequence and prerequisites

The candidate sequence below follows the verified local filenames and SQL dependencies. Only 0000–0002 have verified migration-history entries according to the user's supplied authoritative history; 0003–0007 are not confirmed applied to the intended database.

| Migration | Purpose and prerequisites |
|---|---|
| `0000_debt_free_buddy_schema.sql` | Base profiles, scenarios, cards, policies/grants and auth trigger; expects Supabase `auth.users`, `auth.uid()` and API roles. |
| `0001_create_saved_cards.sql` | Saved-card table, policy and index; depends on Supabase auth. |
| `0002_revoke_truncate_from_api_roles.sql` | Verified exact grant hardening: revokes `TRUNCATE` on profiles, scenarios, cards and saved_cards from `anon` and `authenticated`. Its supplied journal entry is idx 2, version 7, tag `0002_revoke_truncate_from_api_roles`, when `1791788043221`, breakpoints true. The file's supplied SHA-256 is `d274b361ea8dfacfe18201d52d006298d45aea1d4effd9269a796dc617e59392`. The matching supplied snapshot metadata is id `2c8da7df-774e-4a08-bc1b-c0200a5c65c5`, prevId `13d25ec9-9d21-48fa-b21c-8441698c3ed0`. These are local restored artifacts, not proof of live application. |
| `0003_repayment_tracking_and_gamification.sql` | Creates debt_baselines, debt_payments, monthly_progress and debt_achievements with RLS/policies/grants; depends on base scenarios/cards and Supabase auth. Non-idempotent table/policy creation can fail if objects already exist. Grants `service_role` broad access. |
| `0004_repayment_ownership_integrity.sql` | Adds same-owner composite unique keys/FKs and deletion behavior; depends on 0003 and required base keys. Preflight/data checks can fail on duplicates, missing references, or cross-owner rows; it does not repair them. |
| `0005_atomic_repayment_protection.sql` | Adds the atomic payment RPC, direct-write restrictions and starting-balance trigger; depends on 0003/0004 objects, expected ownership, auth function and migration-role privileges/RLS behavior. Its preflight requires SELECT and UPDATE rights for the row locks and checks RLS state. |
| `0006_atomic_scenario_save.sql` | Adds atomic scenario-save RPC; depends on 0005 payment protection and owner-scoped permissions/policies. It is SECURITY INVOKER. |
| `0007_payment_idempotency.sql` | Adds nullable idempotency key and partial unique index, replaces the four-argument RPC with a five-argument RPC; depends on the 0005 function, repayment table and 0004 ownership constraints. Preflight requires ownership of the table and prior function, row-lock privileges, `auth.uid()` access, and the required RLS/bypass configuration. |

The local journal contains entries 0000–0002. The source does not establish whether 0003–0007 were applied in the intended database. The reported target currently has no repayment tables, but that reported observation is not revalidated here and must not replace a fresh authorized preflight.

## Preflight and PostgreSQL test gate

Before any shared-environment application, an authorized operator should inspect the target in its approved management interface and record only safe catalog facts:

1. Confirm project identity, migration runner, ledger location/schema, ledger rows and checksum semantics. Compare exact local file hashes without exposing credentials. Reconcile 0000–0002, then establish whether any 0003–0007 objects or ledger records exist.
2. Verify expected tables/columns, unique keys/FKs/check constraints, indexes, RLS state/policies, triggers, function signatures/owners/configuration and effective privileges for `anon`, `authenticated`, `service_role`, and the migration/function owners. Check TRUNCATE independently because RLS does not restrict it.
3. Before 0003, check repayment objects are absent or deliberately reconciled. Before 0004, verify existing rows satisfy all ownership/reference constraints using aggregate checks; repair only under a separately reviewed data-repair plan.
4. Verify the SECURITY DEFINER owner can access each required table under actual RLS/ownership settings, can execute `auth.uid()`, and can insert into debt_payments. Check table/function owners individually; do not assume a shared owner.
5. Take and verify a recoverable backup before staging. Confirm the rollback/recovery procedure preserves repayment rows and does not rely on dropping tables.

Run the repeatable tests in [payment-idempotency-postgres-test-plan.md](payment-idempotency-postgres-test-plan.md) against a disposable Supabase-compatible PostgreSQL instance before staging. Required coverage includes migration order/prerequisites, payment success and rollback, exact retries, same-key conflicts, concurrent overpayment attempts, cross-user denial, RLS/direct-write permissions, atomic scenario saves, and TRUNCATE permissions.

The local Supabase/PostgreSQL environment is currently unavailable: Docker Desktop's service is stopped and `docker version` cannot reach the engine; no `psql` or Supabase CLI is available on PATH. Do not repeatedly retry the unavailable daemon. For repeatable future tests, first restore a healthy local Docker engine, then verify the temporary Supabase project is local-only and has no hosted link. Use synthetic data and independent database sessions for concurrency cases. An isolated PostgreSQL substitute requires a compatible PostgreSQL version, Supabase-like `auth` schema and `auth.uid()`, roles `anon`, `authenticated`, `service_role`, required auth functions, and independent sessions. Do not point tests at any shared or personal database.

## Failure, rollback, and release handling

- A failed transaction must leave neither partial schema/data changes nor a success ledger record. Validate this with a deliberate failure on the disposable database.
- If a runner process dies or times out, do not rerun based only on a missing success row. Check the lock, ledger, checksums and schema state; ambiguous state requires operator reconciliation.
- Once a migration commits, prefer a new reviewed forward repair. Dropping repayment tables or rows can destroy user history. Restore from backup only through the incident/recovery process.
- Apply to staging only after runner and SQL behavior pass disposable tests and the target ledger/schema are reconciled. Verify functions, grants, RLS, triggers, and end-to-end application behavior on staging before the normal release approval.
- No deployment readiness is claimed by this plan.

## Migration-runner decision gate (2026-10-12)

The production mechanism remains unverified from local evidence. `drizzle.config.ts` configures Drizzle Kit, but `drizzle/schema.ts` is blank, the journal has only 0000–0002, and `package.json` has no migration script. The SQL files are in `drizzle/migrations`; there is no `supabase/migrations` directory. The local Supabase configuration's project identifier does not match the owner-verified Lovable Cloud target, so it must not be used to select or contact a hosted database. Local `.temp` and `.branches` metadata do not establish which runner the deployment used. Git history could not be inspected in this review because no Git executable was available.

Do not extend the journal, adopt Supabase CLI, implement a runner, or execute a migration until an authorized operator obtains this read-only evidence from the correct Lovable Cloud project:

1. Confirm the project identity in the Lovable Cloud management interface and identify the deployment mechanism that applied 0000–0002 (platform workflow, CI job, Drizzle command, Supabase CLI, or manual SQL editor).
2. Identify the actual migration ledger table/schema, its columns and checksum/timestamp semantics, and the exact existing rows for 0000–0002. Compare the safe metadata and hashes to the restored local files and journal; do not export connection strings or credentials.
3. Confirm whether the platform stores migration execution logs or migration artifacts and how it handles transaction boundaries, concurrent runs, failures, retries, and checksums.
4. Read-only inspect whether any 0003–0007 ledger entries or repayment objects already exist. A missing ledger row alone is not proof that no SQL was partially or manually applied.

Strategy comparison: extending Drizzle is not safe yet because it would make 0003–0007 journal-pending while their current files contain explicit `BEGIN`/`COMMIT`, and the deployed use of Drizzle is unproven. Adopting Supabase CLI would introduce a different history mechanism and a separate ledger unless the operator verifies a deliberate reconciliation plan; the current Supabase migration directory is absent. A dedicated SQL runner best fits the raw SQL and explicit transaction files, but it must reuse the verified authoritative ledger and cannot be implemented safely before that ledger is identified. The recommendation is therefore to defer runner selection and all history edits until the operator supplies the evidence above. If no suitable platform runner exists, evaluate one dedicated runner as the sole future runner, using the verified existing ledger rather than creating a competing one.

Once the authoritative ledger and runner path are confirmed, the disposable-runner acceptance plan is: require an explicit local test target; verify immutable source-file SHA-256 values before execution; refuse any ledger/schema mismatch; hold a PostgreSQL advisory lock for the entire decision and migration sequence; execute each migration and its ledger record atomically; reject nested or unexpected transaction-control statements; stop on first error; and prove rollback, lock contention, matching rerun, checksum mismatch, process interruption, and ambiguous partial-state refusal on the disposable PostgreSQL instance. Hash the original bytes even if a reviewed SQL-aware step removes only verified outer transaction wrappers in memory. Do not treat absence of a success row as proof that no DDL committed. This is a proposed test plan, not an implemented or tested runner.
