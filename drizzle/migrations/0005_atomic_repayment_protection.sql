-- NEW LOCAL REPLACEMENT DRAFT, authored 2026-10-26.
-- This is not the previously reviewed/recovered migration artifact and does
-- not match its supplied SHA-256. Do not deploy without review and testing.
BEGIN;

DO $$
DECLARE
    v_bypass_rls boolean;
BEGIN
    IF pg_catalog.to_regclass('public.scenarios') IS NULL
       OR pg_catalog.to_regclass('public.cards') IS NULL
       OR pg_catalog.to_regclass('public.debt_payments') IS NULL THEN
        RAISE EXCEPTION 'Migration 0005 requires scenarios and cards from migration 0000 and debt_payments from migration 0003';
    END IF;

    IF pg_catalog.to_regprocedure('auth.uid()') IS NULL
       OR pg_catalog.to_regrole('anon') IS NULL
       OR pg_catalog.to_regrole('authenticated') IS NULL
       OR pg_catalog.to_regrole('service_role') IS NULL THEN
        RAISE EXCEPTION 'Migration 0005 requires Supabase auth.uid() and API roles';
    END IF;

    IF NOT pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE')
       OR NOT pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
       OR NOT pg_catalog.has_schema_privilege(current_user, 'auth', 'USAGE')
       OR NOT pg_catalog.has_function_privilege(current_user, 'auth.uid()', 'EXECUTE') THEN
        RAISE EXCEPTION 'Migration 0005 runner/function owner requires public schema creation and auth.uid() access';
    END IF;

    IF NOT pg_catalog.has_table_privilege(current_user, 'public.debt_payments', 'SELECT')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.debt_payments', 'INSERT')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.scenarios', 'SELECT')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.scenarios', 'UPDATE')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.cards', 'SELECT')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.cards', 'UPDATE')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.cards', 'TRIGGER') THEN
        RAISE EXCEPTION 'Migration 0005 runner/function owner lacks required payment, row-lock, or trigger privileges';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS protected_table
         WHERE protected_table.oid IN (
                   'public.scenarios'::regclass,
                   'public.cards'::regclass,
                   'public.debt_payments'::regclass
               )
           AND NOT protected_table.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'Migration 0005 requires RLS enabled on scenarios, cards, and debt_payments';
    END IF;

    SELECT role_entry.rolbypassrls
      INTO v_bypass_rls
      FROM pg_catalog.pg_roles AS role_entry
     WHERE role_entry.rolname = current_user;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS protected_table
         WHERE protected_table.oid IN (
                   'public.scenarios'::regclass,
                   'public.cards'::regclass,
                   'public.debt_payments'::regclass
               )
           AND protected_table.relrowsecurity
           AND NOT (
               (protected_table.relowner = current_user::regrole
                AND NOT protected_table.relforcerowsecurity)
               OR COALESCE(v_bypass_rls, false)
           )
    ) THEN
        RAISE EXCEPTION 'Migration 0005 SECURITY DEFINER owner must own each protected table without FORCE RLS or have BYPASSRLS';
    END IF;

    IF pg_catalog.to_regprocedure('public.record_debt_payment(uuid,uuid,numeric,date)') IS NOT NULL
       OR pg_catalog.to_regprocedure('public.prevent_repaid_scenario_balance_change()') IS NOT NULL
       OR EXISTS (
           SELECT 1
             FROM pg_catalog.pg_trigger AS existing_trigger
            WHERE existing_trigger.tgrelid = 'public.cards'::regclass
              AND existing_trigger.tgname = 'prevent_repaid_scenario_balance_change'
              AND NOT existing_trigger.tgisinternal
       ) THEN
        RAISE EXCEPTION 'Migration 0005 RPC or balance-protection objects already exist; inspect before proceeding';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
         WHERE conrelid = 'public.scenarios'::regclass
           AND conname = 'scenarios_id_user_id_unique'
           AND contype = 'u' AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
         WHERE conrelid = 'public.cards'::regclass
           AND conname = 'cards_id_scenario_user_unique'
           AND contype = 'u' AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
         WHERE conrelid = 'public.cards'::regclass
           AND conname = 'cards_scenario_user_owner_fkey'
           AND contype = 'f' AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
         WHERE conrelid = 'public.debt_payments'::regclass
           AND conname = 'debt_payments_scenario_owner_fkey'
           AND contype = 'f' AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
         WHERE conrelid = 'public.debt_payments'::regclass
           AND conname = 'debt_payments_card_scenario_owner_fkey'
           AND contype = 'f' AND condeferrable AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
         WHERE conrelid = 'public.debt_payments'::regclass
           AND conname = 'debt_payments_amount_check'
           AND contype = 'c' AND convalidated
    ) THEN
        RAISE EXCEPTION 'Migration 0005 requires validated ownership and amount constraints from migrations 0003 and 0004';
    END IF;

    -- A permissive API-role write policy is unexpected at this stage. Stop for
    -- review rather than silently preserving a hidden DML path.
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_policy AS payment_policy
         WHERE payment_policy.polrelid = 'public.debt_payments'::regclass
           AND payment_policy.polcmd IN ('a', 'w', 'd', '*')
           AND (
               0::oid = ANY (payment_policy.polroles)
               OR EXISTS (
                   SELECT 1
                     FROM pg_catalog.unnest(payment_policy.polroles) AS policy_role(role_oid)
                     JOIN pg_catalog.pg_roles AS api_role ON api_role.oid = policy_role.role_oid
                    WHERE api_role.rolname IN ('anon', 'authenticated')
               )
           )
    ) THEN
        RAISE EXCEPTION 'Migration 0005 found a direct-write RLS policy for anon/authenticated; inspect it before proceeding';
    END IF;
END;
$$;

CREATE FUNCTION public.record_debt_payment(
    p_scenario_id uuid,
    p_card_id uuid,
    p_amount numeric,
    p_payment_date date
)
RETURNS public.debt_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_starting_balance numeric(12,2);
    v_total_paid numeric;
    v_payment public.debt_payments%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authentication_required';
    END IF;

    IF p_scenario_id IS NULL OR p_card_id IS NULL
       OR p_amount IS NULL
       OR p_amount <= 0
       OR p_amount > 9999999999.99
       OR p_amount <> pg_catalog.trunc(p_amount, 2) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_amount_or_reference';
    END IF;

    IF p_payment_date IS NULL
       OR p_payment_date > (pg_catalog.now() AT TIME ZONE 'UTC')::date THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_date';
    END IF;

    -- Lock in a stable order: scenario, card, then the scenario payment gate.
    -- The scenario-save RPC also locks scenario before card rows.
    PERFORM s.id
      FROM public.scenarios AS s
     WHERE s.id = p_scenario_id
       AND s.user_id = v_user_id
     FOR KEY SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'scenario_card_not_owned';
    END IF;

    SELECT c.balance
      INTO v_starting_balance
      FROM public.cards AS c
     WHERE c.id = p_card_id
       AND c.scenario_id = p_scenario_id
       AND c.user_id = v_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'scenario_card_not_owned';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_scenario_id::text, 0)
    );

    SELECT COALESCE(pg_catalog.sum(p.amount), 0)
      INTO v_total_paid
      FROM public.debt_payments AS p
     WHERE p.user_id = v_user_id
       AND p.scenario_id = p_scenario_id
       AND p.card_id = p_card_id;

    IF p_amount > GREATEST(v_starting_balance - v_total_paid, 0) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'payment_exceeds_remaining_balance';
    END IF;

    INSERT INTO public.debt_payments (
        user_id, scenario_id, card_id, amount, payment_date
    )
    VALUES (
        v_user_id, p_scenario_id, p_card_id, p_amount, p_payment_date
    )
    RETURNING * INTO v_payment;

    RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date)
    TO authenticated;

-- RLS governs row access, not table-level DML/TRUNCATE privileges. Keep
-- owner-scoped SELECT and force ordinary client writes through the RPC.
REVOKE ALL PRIVILEGES ON TABLE public.debt_payments
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.debt_payments TO authenticated;

DO $$
BEGIN
    IF pg_catalog.has_table_privilege(
           'anon', 'public.debt_payments', 'INSERT, UPDATE, DELETE, TRUNCATE'
       )
       OR pg_catalog.has_table_privilege(
           'authenticated', 'public.debt_payments', 'INSERT, UPDATE, DELETE, TRUNCATE'
       )
       OR pg_catalog.has_any_column_privilege(
           'anon', 'public.debt_payments', 'INSERT'
       )
       OR pg_catalog.has_any_column_privilege(
           'anon', 'public.debt_payments', 'UPDATE'
       )
       OR pg_catalog.has_any_column_privilege(
           'authenticated', 'public.debt_payments', 'INSERT'
       )
       OR pg_catalog.has_any_column_privilege(
           'authenticated', 'public.debt_payments', 'UPDATE'
       ) THEN
        RAISE EXCEPTION 'Migration 0005 found inherited or column-level API write privileges on debt_payments after revocation';
    END IF;
END;
$$;

CREATE FUNCTION public.prevent_repaid_scenario_balance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
    IF NEW.balance IS NOT DISTINCT FROM OLD.balance THEN
        RETURN NEW;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(OLD.scenario_id::text, 0)
    );

    IF EXISTS (
        SELECT 1
          FROM public.debt_payments AS p
         WHERE p.scenario_id = OLD.scenario_id
           AND p.user_id = OLD.user_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'scenario_starting_balance_locked_after_payment';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_repaid_scenario_balance_change()
    FROM PUBLIC, anon, authenticated;

CREATE TRIGGER prevent_repaid_scenario_balance_change
    BEFORE UPDATE OF balance ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_repaid_scenario_balance_change();

COMMIT;
