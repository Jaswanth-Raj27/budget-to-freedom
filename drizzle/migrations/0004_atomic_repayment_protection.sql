BEGIN;

-- This migration requires repayment tables from 0002 and ownership constraints
-- from 0003. Check the database itself because the Drizzle journal currently
-- does not establish whether either migration has already been applied.
DO $$
BEGIN
    IF pg_catalog.to_regclass('public.scenarios') IS NULL
       OR pg_catalog.to_regclass('public.cards') IS NULL
       OR pg_catalog.to_regclass('public.debt_payments') IS NULL THEN
        RAISE EXCEPTION 'Migration 0004 requires scenarios and cards from migration 0000 and debt_payments from migration 0002';
    END IF;

    -- The RPC is created by current_user and runs with that role's privileges.
    -- The trigger must also be installed by a role allowed to create triggers
    -- on cards. These checks deliberately do not assume identical table owners.
    IF NOT pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE')
       OR NOT pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') THEN
        RAISE EXCEPTION 'Migration 0004 requires USAGE and CREATE on schema public to create its functions';
    END IF;

    IF NOT pg_catalog.has_table_privilege(current_user, 'public.debt_payments', 'SELECT')
       OR NOT pg_catalog.has_table_privilege(current_user, 'public.debt_payments', 'INSERT') THEN
        RAISE EXCEPTION 'Migration 0004 function owner requires SELECT and INSERT on public.debt_payments';
    END IF;

    IF NOT pg_catalog.has_table_privilege(current_user, 'public.scenarios', 'SELECT') THEN
        RAISE EXCEPTION 'Migration 0004 function owner requires SELECT on public.scenarios';
    END IF;

    IF NOT pg_catalog.has_table_privilege(current_user, 'public.cards', 'SELECT') THEN
        RAISE EXCEPTION 'Migration 0004 function owner requires SELECT on public.cards';
    END IF;

    -- SELECT grants alone do not bypass RLS. The existing scenario/card
    -- policies target authenticated, while this function runs as its owner.
    -- Require the definer to own each RLS-protected table without FORCE RLS,
    -- or to have BYPASSRLS; otherwise valid owner rows can be hidden from it.
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS protected_table
         WHERE protected_table.oid IN (
                   'public.scenarios'::regclass,
                   'public.cards'::regclass
               )
           AND protected_table.relrowsecurity
           AND NOT (
               protected_table.relowner = current_user::regrole
               AND NOT protected_table.relforcerowsecurity
           )
           AND NOT EXISTS (
               SELECT 1
                 FROM pg_catalog.pg_roles AS current_role
                WHERE current_role.rolname = current_user
                  AND current_role.rolbypassrls
           )
    ) THEN
        RAISE EXCEPTION 'Migration 0004 function owner must own public.scenarios and public.cards without FORCE RLS, or have BYPASSRLS, to read authenticated owner rows';
    END IF;

    IF NOT pg_catalog.has_table_privilege(current_user, 'public.cards', 'TRIGGER') THEN
        RAISE EXCEPTION 'Migration 0004 runner requires TRIGGER privilege on public.cards';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_trigger AS existing_trigger
          JOIN pg_catalog.pg_class AS trigger_table
            ON trigger_table.oid = existing_trigger.tgrelid
         WHERE existing_trigger.tgrelid = 'public.cards'::regclass
           AND existing_trigger.tgname = 'prevent_repaid_scenario_balance_change'
           AND NOT existing_trigger.tgisinternal
           AND trigger_table.relowner <> current_user::regrole
    ) THEN
        RAISE EXCEPTION 'Migration 0004 runner must own public.cards to replace the existing balance-protection trigger';
    END IF;

    IF NOT pg_catalog.has_schema_privilege(current_user, 'auth', 'USAGE')
       OR NOT pg_catalog.has_function_privilege(current_user, 'auth.uid()', 'EXECUTE') THEN
        RAISE EXCEPTION 'Migration 0004 function owner requires USAGE on schema auth and EXECUTE on auth.uid()';
    END IF;

    IF pg_catalog.to_regprocedure('public.record_debt_payment(uuid,uuid,numeric,date)') IS NOT NULL
       AND EXISTS (
           SELECT 1
             FROM pg_catalog.pg_proc AS existing_function
            WHERE existing_function.oid = pg_catalog.to_regprocedure('public.record_debt_payment(uuid,uuid,numeric,date)')
              AND existing_function.proowner <> current_user::regrole
       ) THEN
        RAISE EXCEPTION 'Migration 0004 runner must own the existing public.record_debt_payment function to replace it';
    END IF;

    IF pg_catalog.to_regprocedure('public.prevent_repaid_scenario_balance_change()') IS NOT NULL
       AND EXISTS (
           SELECT 1
             FROM pg_catalog.pg_proc AS existing_function
            WHERE existing_function.oid = pg_catalog.to_regprocedure('public.prevent_repaid_scenario_balance_change()')
              AND existing_function.proowner <> current_user::regrole
       ) THEN
        RAISE EXCEPTION 'Migration 0004 runner must own the existing public.prevent_repaid_scenario_balance_change function to replace it';
    END IF;

    -- Ensure the columns referenced by the RPC and trigger exist before any
    -- function DDL is attempted. This also detects an incompatible 0002 schema.
    IF EXISTS (
        SELECT required.table_name, required.column_name
          FROM (VALUES
                ('scenarios', 'id'), ('scenarios', 'user_id'),
                ('cards', 'id'), ('cards', 'scenario_id'), ('cards', 'user_id'), ('cards', 'balance'),
                ('debt_payments', 'id'), ('debt_payments', 'user_id'),
                ('debt_payments', 'scenario_id'), ('debt_payments', 'card_id'),
                ('debt_payments', 'amount'), ('debt_payments', 'payment_date')
          ) AS required(table_name, column_name)
         WHERE NOT EXISTS (
             SELECT 1
               FROM information_schema.columns AS actual
              WHERE actual.table_schema = 'public'
                AND actual.table_name = required.table_name
                AND actual.column_name = required.column_name
         )
    ) THEN
        RAISE EXCEPTION 'Migration 0004 requires the scenario, card, and payment columns defined by migrations 0000 and 0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS c
         WHERE c.oid = 'public.debt_payments'::regclass
           AND c.relowner = current_user::regrole
           AND NOT c.relforcerowsecurity
    ) THEN
        RAISE EXCEPTION 'Migration 0004 must run as the debt_payments table owner with RLS not forced so the SECURITY DEFINER RPC can insert';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.scenarios'::regclass
          AND conname = 'scenarios_id_user_id_unique'
          AND contype = 'u'
          AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.cards'::regclass
          AND conname = 'cards_id_scenario_user_unique'
          AND contype = 'u'
          AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.cards'::regclass
          AND conname = 'cards_scenario_user_owner_fkey'
          AND contype = 'f'
          AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.debt_payments'::regclass
          AND conname = 'debt_payments_pkey'
          AND contype = 'p'
          AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.debt_payments'::regclass
          AND conname = 'debt_payments_amount_check'
          AND contype = 'c'
          AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.debt_payments'::regclass
          AND conname = 'debt_payments_scenario_owner_fkey'
          AND contype = 'f'
          AND convalidated
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.debt_payments'::regclass
          AND conname = 'debt_payments_card_scenario_owner_fkey'
          AND contype = 'f'
          AND condeferrable
          AND convalidated
    ) THEN
        RAISE EXCEPTION 'Migration 0004 requires debt_payments primary key and amount check from migration 0002 and validated ownership constraints from migration 0003';
    END IF;
END;
$$;

-- Serialize payment writes for the scenario and enforce amount, ownership,
-- date, and remaining-balance rules in the same transaction as the insert.
CREATE OR REPLACE FUNCTION public.record_debt_payment(
    p_scenario_id uuid,
    p_card_id uuid,
    p_amount numeric,
    p_payment_date date
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

    -- Protect scenario deletion first, then lock the selected card. A shared
    -- scenario advisory lock below serializes payment and balance writes.
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

    INSERT INTO public.debt_payments (user_id, scenario_id, card_id, amount, payment_date)
    VALUES (v_user_id, p_scenario_id, p_card_id, p_amount, p_payment_date)
    RETURNING * INTO v_payment;

    RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(uuid, uuid, numeric, date)
    TO authenticated;

-- Authenticated clients retain owner-scoped SELECT. All payment creation must
-- pass through the RPC; history changes require an explicit privileged,
-- auditable correction path. service_role remains a trusted backend role.
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.debt_payments
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.debt_payments TO authenticated;

DROP POLICY IF EXISTS "Users can view their own debt payments" ON public.debt_payments;
CREATE POLICY "Users can view their own debt payments"
    ON public.debt_payments
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create their own debt payments" ON public.debt_payments;
DROP POLICY IF EXISTS "Users can update their own debt payments" ON public.debt_payments;
DROP POLICY IF EXISTS "Users can delete their own debt payments" ON public.debt_payments;

-- A scenario's original debt baseline is frozen after its first repayment.
-- Balance updates acquire the card row lock as part of UPDATE, then the same
-- transaction-scoped scenario advisory lock used by the payment RPC.
CREATE OR REPLACE FUNCTION public.prevent_repaid_scenario_balance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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

DROP TRIGGER IF EXISTS prevent_repaid_scenario_balance_change ON public.cards;
CREATE TRIGGER prevent_repaid_scenario_balance_change
    BEFORE UPDATE OF balance ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_repaid_scenario_balance_change();

COMMIT;
