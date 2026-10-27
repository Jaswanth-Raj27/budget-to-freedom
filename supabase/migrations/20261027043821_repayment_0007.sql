
-- Depends on migrations 0003-0005. 0006 is the immediately preceding local
-- migration; it does not alter debt_payments or record_debt_payment.
DO $$
BEGIN
    IF pg_catalog.to_regclass('public.debt_payments') IS NULL
       OR pg_catalog.to_regclass('public.scenarios') IS NULL
       OR pg_catalog.to_regclass('public.cards') IS NULL THEN
        RAISE EXCEPTION 'Migration 0007 requires scenarios, cards, and debt_payments';
    END IF;

    IF pg_catalog.to_regprocedure('public.record_debt_payment(uuid,uuid,numeric,date)') IS NULL THEN
        RAISE EXCEPTION 'Migration 0007 requires the payment RPC from migration 0005';
    END IF;

    IF NOT pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE')
       OR NOT pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.debt_payments', 'SELECT')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.debt_payments', 'INSERT')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.debt_payments', 'UPDATE') THEN
        RAISE EXCEPTION 'Migration 0007 requires public schema creation and debt_payments SELECT, INSERT, UPDATE privileges';
    END IF;

    -- The replacement SECURITY DEFINER RPC locks scenario and card rows. In
    -- PostgreSQL, SELECT ... FOR KEY SHARE/UPDATE also requires UPDATE.
    IF NOT pg_catalog.has_table_privilege(current_user, 'public.scenarios', 'SELECT')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.scenarios', 'UPDATE')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.cards', 'SELECT')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.cards', 'UPDATE')
       OR NOT pg_catalog.has_schema_privilege(current_user, 'auth', 'USAGE')
       OR NOT pg_catalog.has_function_privilege(current_user, 'auth.uid()', 'EXECUTE') THEN
        RAISE EXCEPTION 'Migration 0007 function owner requires scenario/card SELECT and UPDATE, plus auth.uid() access';
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
        RAISE EXCEPTION 'Migration 0007 requires row-level security on scenarios, cards, and debt_payments';
    END IF;

    -- The SECURITY DEFINER owner must be able to see all rows after the
    -- explicit auth.uid() ownership predicates have been applied.
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS protected_table
         WHERE protected_table.oid IN (
                   'public.scenarios'::regclass,
                   'public.cards'::regclass
               )
           AND protected_table.relrowsecurity
           AND NOT (
               (protected_table.relowner = current_user::regrole
                AND NOT protected_table.relforcerowsecurity)
               OR EXISTS (
                   SELECT 1
                     FROM pg_catalog.pg_roles AS role_entry
                    WHERE role_entry.rolname = current_user
                      AND role_entry.rolbypassrls
               )
           )
    ) THEN
        RAISE EXCEPTION 'Migration 0007 function owner must bypass scenario/card RLS through ownership without FORCE RLS or BYPASSRLS';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS payment_table
         WHERE payment_table.oid = 'public.debt_payments'::regclass
           AND (payment_table.relowner <> current_user::regrole
                OR NOT payment_table.relrowsecurity
                OR payment_table.relforcerowsecurity)
    ) THEN
        RAISE EXCEPTION 'Migration 0007 must run as the debt_payments owner with RLS enabled and not forced for the SECURITY DEFINER RPC';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_proc AS payment_function
         WHERE payment_function.oid = pg_catalog.to_regprocedure('public.record_debt_payment(uuid,uuid,numeric,date)')
           AND payment_function.proowner <> current_user::regrole
    ) THEN
        RAISE EXCEPTION 'Migration 0007 must run as the current record_debt_payment function owner';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM information_schema.columns AS payment_column
         WHERE payment_column.table_schema = 'public'
           AND payment_column.table_name = 'debt_payments'
           AND payment_column.column_name = 'idempotency_key'
    ) OR pg_catalog.to_regprocedure('public.record_debt_payment(uuid,uuid,numeric,date,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 0007 idempotency objects already exist; inspect the database before proceeding';
    END IF;
END;
$$;

-- Existing payment rows keep a NULL key. New RPC-created rows always have one.
ALTER TABLE public.debt_payments
    ADD COLUMN idempotency_key uuid;

-- Scope uniqueness to the authenticated owner. The RPC verifies that a reused
-- key also has the same scenario, card, amount, and date.
CREATE UNIQUE INDEX debt_payments_user_idempotency_key_unique
    ON public.debt_payments(user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Remove the old callable signature so no authenticated caller can bypass the
-- required key after this migration commits.
REVOKE ALL ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date)
    FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.record_debt_payment(uuid, uuid, numeric, date);

CREATE FUNCTION public.record_debt_payment(
    p_scenario_id uuid,
    p_card_id uuid,
    p_amount numeric,
    p_payment_date date,
    p_idempotency_key uuid
)
RETURNS public.debt_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_scenario_id uuid;
    v_starting_balance numeric(12,2);
    v_total_paid numeric;
    v_payment public.debt_payments%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authentication_required';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_idempotency_key';
    END IF;

    -- Serialize retries with the same key before checking for an earlier
    -- committed result. Hash collisions only serialize unrelated requests.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_user_id::text || ':' || p_idempotency_key::text, 0)
    );

    SELECT p.*
      INTO v_payment
      FROM public.debt_payments AS p
     WHERE p.user_id = v_user_id
       AND p.idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_payment.scenario_id IS NOT DISTINCT FROM p_scenario_id
           AND v_payment.card_id IS NOT DISTINCT FROM p_card_id
           AND v_payment.amount IS NOT DISTINCT FROM p_amount
           AND v_payment.payment_date IS NOT DISTINCT FROM p_payment_date THEN
            RETURN v_payment;
        END IF;

        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'idempotency_key_reused';
    END IF;

    IF p_amount IS NULL
       OR p_amount <= 0
       OR p_amount > 9999999999.99
       OR p_amount <> pg_catalog.trunc(p_amount, 2) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_amount';
    END IF;

    IF p_payment_date IS NULL
       OR p_payment_date > (pg_catalog.now() AT TIME ZONE 'UTC')::date THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_payment_date';
    END IF;

    SELECT s.id
      INTO v_scenario_id
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
        user_id, scenario_id, card_id, amount, payment_date, idempotency_key
    )
    VALUES (
        v_user_id, p_scenario_id, p_card_id, p_amount, p_payment_date, p_idempotency_key
    )
    RETURNING * INTO v_payment;

    RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date, uuid)
    TO authenticated;

