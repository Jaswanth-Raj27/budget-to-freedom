# Repayment migration security review

**Review scope:** local-only. No database was contacted or migration executed. Original 0003 was restored from a Git blob and then hardened locally; 0004/0005 were newly authored replacement drafts because their reviewed source bytes were unavailable. The journal was not edited. None of these drafts is certified for hosted deployment.

## Draft provenance and current readiness

0003 is recovered and hardened locally. New 0004 and 0005 drafts are present, but they are not the historical reviewed files and do not match their supplied hashes. The exact originals remain unrecovered.

| File | User-supplied expected SHA-256 | Workspace verification |
|---|---|---|
| `drizzle/migrations/0003_repayment_tracking_and_gamification.sql` | Original `22721774CB9F3B30E97B7E918BC3BCE942B3CA8D664CD72BECB10EB521E50ED9` | **Recovered from Git blob** `742d28882fef48ee001b649a907ec59a5872143d`; current corrected local SHA-256: `788CE5F721C952E73187496B5A3F0AB6EDF78CB8C78DBB4EC4F9E97EF1CABBD7`. |
| `drizzle/migrations/0004_repayment_ownership_integrity.sql` | Expected original `1A0A39CF76369C7C7271AE4D451D0419F3FDE0C015D4334EA79B499C4B367721` | **New replacement draft:** `EE1362215B1B71B4C27B3D69243FE815CFA4C4C3AF1F2176E7CD03B0663C8A16`; not the historical file. |
| `drizzle/migrations/0005_atomic_repayment_protection.sql` | Previously reported reviewed copy `1A90FFADCD8A7D6CF50A32602881FFF7B70AC4ACD023AB12C6B80597A08E7C99` | **New replacement draft:** `6BBE7507199D6A039491BE709A0F5933966657DD28ECDC9B09199A7F3B494E5B`; not the historical file. |

The expected reviewed hashes for 0004 (`1A0A39CF76369C7C7271AE4D451D0419F3FDE0C015D4334EA79B499C4B367721`) and 0005 (previously reported as `1A90FFADCD8A7D6CF50A32602881FFF7B70AC4ACD023AB12C6B80597A08E7C99`) were not found among named local backups or reachable Git objects. Similar older Git blobs have different hashes and were not substituted. The corrected 0003 hash previously reported (`C5A817C68941DC4F43000A0B1BD4456C42289D55E37BF20BC0F9A1427BF4A4EA`) also differs from the current local 0003 hash. The new 0004/0005 files are replacement drafts, not recovery artifacts.

The recovered 0003 omitted a revoke of `TRUNCATE` from `PUBLIC`, `anon`, or `authenticated` on its four new tables. The documented correction has now been applied locally. Migration 0002 revokes it from `anon` and `authenticated` on the four pre-existing base tables, but does not cover repayment tables or `PUBLIC` (`drizzle/migrations/0002_revoke_truncate_from_api_roles.sql:1`).

## Migration readiness

| Migration | Local evidence | Readiness |
|---|---|---|
| 0003 repayment tracking | Original hash was verified before the documented TRUNCATE revoke was added. Owner-scoped RLS exists; authenticated payment access is SELECT-only; the local copy now revokes TRUNCATE. | **Locally hardened; still needs disposable PostgreSQL validation.** |
| 0004 ownership integrity | New replacement draft with orphan/ownership preflight, catalog-based FK identification, composite constraints, and deferred NO ACTION payment-card FK. | **Static draft only; requires PostgreSQL testing and source-provenance decision.** |
| 0005 atomic repayment protection | New replacement draft defines the four-argument RPC expected by 0006 and replaced by 0007, plus direct-write restrictions and balance trigger. | **Static draft only; requires PostgreSQL/security testing and source-provenance decision.** |
| 0006 atomic scenario save | Present; SHA-256 not part of the supplied recovery record. Static review below. Explicit `BEGIN`/`COMMIT`. | **Not release-ready alone:** depends on 0004–0005 interfaces, the corrected 0003, and verified database prerequisites. |
| 0007 payment idempotency | Present; SHA-256 not part of the supplied recovery record. Static review below. Explicit `BEGIN`/`COMMIT`. | **Not release-ready alone:** depends on 0004–0005 interfaces, the corrected 0003, and verified database prerequisites. |

## 0003: repayment schema

The complete original was read after recovery. Its SHA-256 was `22721774CB9F3B30E97B7E918BC3BCE942B3CA8D664CD72BECB10EB521E50ED9`; the current corrected local SHA-256 is `788CE5F721C952E73187496B5A3F0AB6EDF78CB8C78DBB4EC4F9E97EF1CABBD7`. It has `BEGIN`/`COMMIT` at lines 1 and 226. It creates `debt_baselines` (8–24), `debt_payments` (76–94), `monthly_progress` (125–147), and `debt_achievements` (165–192), requiring Supabase `auth.users`, `auth.uid()`, roles `anon`, `authenticated`, `service_role`, and base `public.scenarios`/`public.cards`.

- RLS is enabled on all four tables (26, 105, 149, 194). Authenticated policies are owner-scoped; baselines also have owner-scoped insert/update/delete policies (33–68).
- Authenticated has only SELECT on `debt_payments` (109–110), with a SELECT policy (114–117). `service_role` receives ALL on the four tables (31, 112, 152, 197) and must remain trusted.
- `debt_payments.card_id` has `ON DELETE CASCADE` (85–86), so card-only deletion can remove history until 0004 replaces this FK.
- The original file omitted an explicit TRUNCATE revoke. The local copy now revokes it on all four repayment tables from `PUBLIC`, `anon`, and `authenticated`; RLS alone does not govern TRUNCATE.
- Baseline CRUD lets an owner change or delete `baseline_amount` (28–29, 51–68). Current app calculations use card balances and payment rows; no client reference to `debt_baselines` was found. It does not currently change displayed progress, but a future consumer treating it as authoritative could be undermined. Whether corrections are intended remains unresolved.
- The migration is not rerunnable as a whole: table, index, and policy creation is unguarded.

### 0003 patch applied locally

Insert after the last policy (after current line 202), before helper indexes:

```diff
--- a/drizzle/migrations/0003_repayment_tracking_and_gamification.sql
+++ b/drizzle/migrations/0003_repayment_tracking_and_gamification.sql
@@
 CREATE POLICY "Users can view their own debt achievements"
 ON public.debt_achievements
 FOR SELECT TO authenticated
 USING (user_id = auth.uid());

+-- RLS and row-level DELETE policies do not restrict TRUNCATE.
+REVOKE TRUNCATE ON TABLE
+    public.debt_baselines,
+    public.debt_payments,
+    public.monthly_progress,
+    public.debt_achievements
+FROM PUBLIC, anon, authenticated;
+

 -- =========================================================
 -- 5. HELPER INDEXES
```

The revoke itself is repeatable, but 0003 as a whole is not. Verify effective privileges after migration, including inherited grants. The corrected file has not been executed against PostgreSQL.

## 0004: ownership integrity

The current file is a new local draft, not the previously reviewed artifact. It preflights required tables/columns and primary keys, rejects existing target names, checks missing auth owners, orphaned and mismatched card/repayment references, then finds exactly one validated cascade FK from `debt_payments.card_id` to `cards.id` by catalog relation/column/delete-action metadata rather than its generated name. It replaces that FK with `(card_id, scenario_id, user_id)` referencing the same card/scenario/owner tuple as a deferred NO ACTION constraint. This is intended to reject card-only deletion while scenario/account cascades delete both payment and card rows. These behaviors are statically intended, not PostgreSQL-tested. A concurrent write between preflight and constraint creation should be caught by PostgreSQL's FK validation and roll back the explicit transaction, but this failure path has not been executed locally.

The new FK lookup does not depend on a generated constraint name. It assumes the old relationship is exactly one validated `ON DELETE CASCADE` FK on those columns; zero, multiple, unvalidated, or differently configured FKs stop with an exception. Transaction rollback and concurrent DDL behavior have not been exercised because PostgreSQL is unavailable.

## 0005–0007: dependencies and RPC review

### 0005

The current file is a new replacement draft, not the historical reviewed migration. It defines the four-argument `record_debt_payment(uuid,uuid,numeric,date)` required by 0006 and replaced by the five-argument RPC in 0007. It uses `SECURITY DEFINER`, a fixed `pg_catalog` search path, `auth.uid()`, amount/date and ownership checks, scenario/card row locks, and a scenario advisory transaction lock before recalculating totals. It revokes API-role table DML/TRUNCATE, retains authenticated SELECT, and installs a security-definer balance trigger using the same advisory key. These are static design observations; actual owner/RLS privilege and concurrency behavior are untested.

### 0006

`0006_atomic_scenario_save.sql:1, 47-58, 215-220` wraps its changes in `BEGIN`/`COMMIT`, defines `save_debt_scenario(uuid,text,numeric,text,text,jsonb)`, uses `SECURITY INVOKER`, sets a fixed search path, revokes execution from `PUBLIC`, `anon`, and `authenticated`, then grants it to `authenticated`. Its preflight requires the 0005 four-argument payment function and enabled balance trigger (`:14-22`), plus authenticated table privileges and `auth.uid()` execution (`:24-35`). Those objects exist in the new local draft, but have not been executed or verified.

The function derives the user from `auth.uid()`, rejects unauthenticated calls and invalid scenario/card values, and checks scenario ownership before update (`:68-112`). Existing cards are selected by card ID, scenario ID, and user ID under `FOR UPDATE`; new cards use the same derived user (`:158-189`). The scenario row is locked before card rows, serializing saves for that scenario (`:102-114`). The single function call is statement-atomic in PostgreSQL; errors roll back its changes.

Before deleting omitted cards, it rejects removal if a matching payment row exists (`:191-204`), then deletes the remaining omitted cards (`:206-210`). The new 0004 draft adds an independent deferred FK guard, but neither path has been tested against PostgreSQL. The RPC/type/client signatures align: `src/integrations/supabase/types.ts:351-359`, `src/routes/_authenticated/dashboard.tsx:47-55`, and `src/routes/_authenticated/scenario.$id.tsx:165-174`.

No confirmed SQL defect was established by static inspection of 0006. Deployment readiness remains blocked by untested 0004/0005 drafts and unverified database privileges/policies.

### 0007

`0007_payment_idempotency.sql:1, 107-119, 233-238` has explicit transaction boundaries, adds a nullable UUID key and a partial unique index on `(user_id, idempotency_key)`, revokes the old four-argument function, drops it, then creates the five-argument replacement. Existing rows remain `NULL`; new RPC rows require a key. The client and generated type match the new RPC arguments.

Preflight checks the old RPC, necessary table/schema/function privileges, RLS, ownership/BYPASSRLS conditions for the definer, table ownership, and absence of the new column/signature (`:6-104`). The replacement is `SECURITY DEFINER` with `search_path = pg_catalog, public` (`:121-138`), rejects a null `auth.uid()` and null key (`:140-145`), serializes same-user/same-key retries with a transaction advisory lock, and returns the earlier row only when all request details match (`:147-171`). It validates amount/date, checks the scenario's user, locks the card, serializes payments on a scenario key, totals prior payments, rejects overpayment, then inserts the row (`:173-229`). This provides atomic database-side duplicate retry handling for a key and prevents two distinct-key requests from exceeding the same card's remaining balance, assuming starting balances are protected as required by 0005.

The SQL directly assumes required 0004 ownership constraints and 0005 balance protections through migration ordering/comments; its preflight does not establish the expected composite FK definitions. The row predicates in this function explicitly validate scenario/card ownership, but they do not replace schema-level integrity constraints. The preflight's table/function role-owner conditions and the actual hosted executor role must be verified in the target environment before any application.

No confirmed defect in 0007 was established from static inspection alone. Its correctness and deployability remain conditional on the untested 0004/0005 drafts, actual schema, migration-role behavior, and runner transaction semantics.

## Confirmed defects, proposed corrections, and unresolved questions

### Confirmed workspace defects

- The original 0003 is recovered and verified; its local copy includes the documented TRUNCATE hardening.
- 0004 and 0005 are present as newly authored replacement drafts. They are not recovered historical artifacts; the prior exact files and their expected hashes remain unavailable.
- Present 0006/0007 depend on the draft interfaces. Their presence does not prove compatibility or deployment history.

These are source/workspace defects. They do not establish what is or is not present in any database.

### Proposed corrections

- Decide whether to continue with these clearly identified replacement drafts or pause until the historical 0004/0005 files are recovered. Do not treat these drafts as verified history.
- The exact 0003 TRUNCATE diff above has been applied locally. The corrected file still needs disposable PostgreSQL execution and hash reconciliation with any previously reported corrected copy.
- Draft 0004 identifies the old payment-card cascade FK by table, columns, referenced relation, delete action, and validation status, then stops unless exactly one match exists. This static design still requires execution against a disposable Supabase-compatible PostgreSQL instance.

### Unresolved questions

- Should the unrecovered historical 0004/0005 be restored before proceeding, or are the new replacement drafts accepted as a new migration source?
- Does draft 0004's catalog query and deferred NO ACTION FK behave as intended for card-only deletion and scenario/account cascades on the target PostgreSQL version?
- Does draft 0005's function owner have the required effective table/sequence privileges and RLS behavior in the target Supabase migration context?
- Do inherited role grants or policies permit API-role direct writes despite the explicit revokes? Effective ACL and role-membership behavior must be tested in the disposable environment.
- Does the intended migration executor safely handle explicit transaction statements, serialize concurrent runs, and record checksums/metadata without manual journal fabrication?
- What is the current hosted schema and migration ledger? This review made no database connection, so current remote state is unknown.

## Local validation record

Validation was attempted only against the local project. Nothing here verifies hosted migrations or database state.

| Check | Result |
|---|---|
| `npm.cmd run build` | **Passed.** Vite client and SSR bundles built; Nitro generated its local deploy output. The build emitted a non-fatal notice that `vite-tsconfig-paths` is detected although Vite has native tsconfig path support. |
| `npx.cmd tsc --noEmit` | **Passed** with exit code 0. |
| `npm.cmd run test:repayment` | **Passed:** 10 tests, 0 failures. |
| Focused ESLint on `RepaymentTracker.tsx`, `repayment-utils.ts`, `payment-idempotency.ts`, authenticated dashboard/scenario routes, and Supabase types | The default focused lint reported only Prettier formatting errors caused by CRLF line endings in the selected files (1,894 reported). Rerun with `--rule 'prettier/prettier: off'` **passed** with exit code 0. No files were formatted or edited by lint. |

These checks validate the current application source only. They do not validate SQL execution, PostgreSQL behavior, migration metadata, or deploy state.

### Current disposable Supabase setup

The pinned Supabase CLI previously used in a temp folder is currently absent. Docker Desktop is installed; a prior launch left the `com.docker.service` Windows service stopped and the local Docker engine health check unresponsive. No Docker service setting was changed. No Supabase stack was started and no migration was applied. PostgreSQL validation remains blocked until the local Docker engine is healthy and the historical-source-versus-replacement decision is resolved.
