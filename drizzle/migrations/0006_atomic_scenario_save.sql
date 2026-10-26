BEGIN;

-- This migration follows the reported 0002 TRUNCATE-hardening migration,
-- repayment schema 0003, ownership constraints 0004, and payment protection 0005.
-- The local Drizzle journal does not yet contain verified metadata for 0002-0005.
DO $$
BEGIN
    IF pg_catalog.to_regclass('public.scenarios') IS NULL
       OR pg_catalog.to_regclass('public.cards') IS NULL
       OR pg_catalog.to_regclass('public.debt_payments') IS NULL THEN
        RAISE EXCEPTION 'Migration 0006 requires scenarios, cards, and debt_payments';
    END IF;

    IF pg_catalog.to_regprocedure('public.record_debt_payment(uuid,uuid,numeric,date)') IS NULL
       OR NOT EXISTS (
           SELECT 1
             FROM pg_catalog.pg_trigger AS trigger_row
            WHERE trigger_row.tgrelid = 'public.cards'::regclass
              AND trigger_row.tgname = 'prevent_repaid_scenario_balance_change'
              AND NOT trigger_row.tgisinternal
              AND trigger_row.tgenabled IN ('O', 'A')
       ) THEN
        RAISE EXCEPTION 'Migration 0006 requires the payment RPC and enabled balance-protection trigger from migration 0005';
    END IF;

    IF NOT pg_catalog.has_table_privilege('authenticated', 'public.scenarios', 'SELECT')
       OR NOT pg_catalog.has_table_privilege('authenticated', 'public.scenarios', 'INSERT')
       OR NOT pg_catalog.has_table_privilege('authenticated', 'public.scenarios', 'UPDATE')
       OR NOT pg_catalog.has_table_privilege('authenticated', 'public.cards', 'SELECT')
       OR NOT pg_catalog.has_table_privilege('authenticated', 'public.cards', 'INSERT')
       OR NOT pg_catalog.has_table_privilege('authenticated', 'public.cards', 'UPDATE')
       OR NOT pg_catalog.has_table_privilege('authenticated', 'public.cards', 'DELETE')
       OR NOT pg_catalog.has_table_privilege('authenticated', 'public.debt_payments', 'SELECT')
       OR NOT pg_catalog.has_function_privilege('authenticated', 'auth.uid()', 'EXECUTE') THEN
        RAISE EXCEPTION 'Migration 0006 requires authenticated owner-scoped scenario/card access, payment SELECT, and auth.uid()';
    END IF;

    IF pg_catalog.to_regprocedure('public.save_debt_scenario(uuid,text,numeric,text,text,jsonb)') IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 0006 will not replace an existing save_debt_scenario function';
    END IF;
END;
$$;

-- SECURITY INVOKER preserves the caller's RLS context. The function derives
-- ownership from auth.uid(), locks the scenario before cards, and commits all
-- scenario/card changes as one PostgreSQL statement transaction.
CREATE FUNCTION public.save_debt_scenario(
    p_scenario_id uuid,
    p_name text,
    p_budget numeric,
    p_budget_mode text,
    p_strategy text,
    p_cards jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_scenario_id uuid;
    v_card_json jsonb;
    v_position integer;
    v_requested_card_id uuid;
    v_card_id uuid;
    v_name text;
    v_balance numeric;
    v_apr numeric;
    v_min_pct numeric;
    v_min_floor numeric;
    v_card_ids uuid[] := ARRAY[]::uuid[];
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authentication_required';
    END IF;

    IF p_budget IS NULL
       OR p_budget < 0
       OR p_budget > 9999999999.99
       OR p_budget <> pg_catalog.trunc(p_budget, 2)
       OR p_budget_mode IS NULL OR p_budget_mode NOT IN ('fixed_total', 'fixed_extra')
       OR p_strategy IS NULL OR p_strategy NOT IN ('snowball', 'avalanche')
       OR pg_catalog.jsonb_typeof(p_cards) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_scenario_input';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.jsonb_array_elements(p_cards) AS entry(value)
         WHERE pg_catalog.jsonb_typeof(entry.value) IS DISTINCT FROM 'object'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_card_input';
    END IF;

    IF p_scenario_id IS NULL THEN
        INSERT INTO public.scenarios (user_id, name, budget, budget_mode, strategy, updated_at)
        VALUES (
            v_user_id,
            COALESCE(NULLIF(pg_catalog.btrim(p_name), ''), 'My payoff plan'),
            p_budget,
            p_budget_mode,
            p_strategy,
            pg_catalog.now()
        )
        RETURNING id INTO v_scenario_id;
    ELSE
        SELECT s.id
          INTO v_scenario_id
          FROM public.scenarios AS s
         WHERE s.id = p_scenario_id
           AND s.user_id = v_user_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'scenario_not_owned';
        END IF;

        UPDATE public.scenarios AS s
           SET name = COALESCE(NULLIF(pg_catalog.btrim(p_name), ''), 'My payoff plan'),
               budget = p_budget,
               budget_mode = p_budget_mode,
               strategy = p_strategy,
               updated_at = pg_catalog.now()
         WHERE s.id = v_scenario_id
           AND s.user_id = v_user_id;
    END IF;

    FOR v_card_json, v_position IN
        SELECT entry.value, (entry.ordinality - 1)::integer
          FROM pg_catalog.jsonb_array_elements(p_cards) WITH ORDINALITY AS entry(value, ordinality)
    LOOP
        v_name := NULLIF(pg_catalog.btrim(v_card_json ->> 'name'), '');

        BEGIN
            v_requested_card_id := NULLIF(v_card_json ->> 'id', '')::uuid;
            v_balance := (v_card_json ->> 'balance')::numeric;
            v_apr := (v_card_json ->> 'apr')::numeric;
            v_min_pct := (v_card_json ->> 'min_pct')::numeric;
            v_min_floor := (v_card_json ->> 'min_floor')::numeric;
        EXCEPTION
            WHEN invalid_text_representation OR numeric_value_out_of_range THEN
                RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_card_input';
        END;

        IF v_name IS NULL
           OR v_balance IS NULL OR v_balance < 0 OR v_balance > 9999999999.99
           OR v_balance <> pg_catalog.trunc(v_balance, 2)
           OR v_apr IS NULL OR v_apr < 0 OR v_apr > 100 OR v_apr <> pg_catalog.trunc(v_apr, 3)
           OR v_min_pct IS NULL OR v_min_pct < 0 OR v_min_pct > 100 OR v_min_pct <> pg_catalog.trunc(v_min_pct, 3)
           OR v_min_floor IS NULL OR v_min_floor < 0 OR v_min_floor > 99999999.99
           OR v_min_floor <> pg_catalog.trunc(v_min_floor, 2) THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_card_input';
        END IF;

        IF v_requested_card_id IS NOT NULL THEN
            IF v_requested_card_id = ANY (v_card_ids) THEN
                RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'duplicate_card_id';
            END IF;

            SELECT c.id
              INTO v_card_id
              FROM public.cards AS c
             WHERE c.id = v_requested_card_id
               AND c.scenario_id = v_scenario_id
               AND c.user_id = v_user_id
             FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'card_not_owned_by_scenario';
            END IF;

            UPDATE public.cards AS c
               SET name = v_name,
                   balance = v_balance,
                   apr = v_apr,
                   min_pct = v_min_pct,
                   min_floor = v_min_floor,
                   position = v_position
             WHERE c.id = v_card_id
               AND c.scenario_id = v_scenario_id
               AND c.user_id = v_user_id;
        ELSE
            INSERT INTO public.cards (scenario_id, user_id, name, balance, apr, min_pct, min_floor, position)
            VALUES (v_scenario_id, v_user_id, v_name, v_balance, v_apr, v_min_pct, v_min_floor, v_position)
            RETURNING id INTO v_card_id;
        END IF;

        v_card_ids := pg_catalog.array_append(v_card_ids, v_card_id);
    END LOOP;

    IF EXISTS (
        SELECT 1
          FROM public.cards AS c
          JOIN public.debt_payments AS p
            ON p.card_id = c.id
           AND p.scenario_id = c.scenario_id
           AND p.user_id = c.user_id
         WHERE c.scenario_id = v_scenario_id
           AND c.user_id = v_user_id
           AND NOT (c.id = ANY (v_card_ids))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'card_has_repayment_history';
    END IF;

    DELETE FROM public.cards AS c
     WHERE c.scenario_id = v_scenario_id
       AND c.user_id = v_user_id
       AND NOT (c.id = ANY (v_card_ids));

    RETURN v_scenario_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_debt_scenario(uuid, text, numeric, text, text, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_debt_scenario(uuid, text, numeric, text, text, jsonb)
    TO authenticated;

COMMIT;
