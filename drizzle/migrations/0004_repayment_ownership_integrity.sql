-- NEW LOCAL REPLACEMENT DRAFT, authored 2026-10-26.
-- This is not the previously reviewed/recovered migration artifact and does
-- not match its supplied SHA-256. Do not deploy without review and testing.
BEGIN;

DO $$
DECLARE
    v_card_fk_count integer;
    v_card_fk_name text;
    v_card_fk_validated boolean;
BEGIN
    IF pg_catalog.to_regclass('public.scenarios') IS NULL
       OR pg_catalog.to_regclass('public.cards') IS NULL
       OR pg_catalog.to_regclass('public.debt_baselines') IS NULL
       OR pg_catalog.to_regclass('public.debt_payments') IS NULL
       OR pg_catalog.to_regclass('public.monthly_progress') IS NULL
       OR pg_catalog.to_regclass('public.debt_achievements') IS NULL
       OR pg_catalog.to_regclass('auth.users') IS NULL THEN
        RAISE EXCEPTION 'Migration 0004 requires base tables and all repayment tables from migrations 0000-0003';
    END IF;

    IF EXISTS (
        SELECT required.table_name, required.column_name
          FROM (VALUES
                ('scenarios', 'id'), ('scenarios', 'user_id'),
                ('cards', 'id'), ('cards', 'scenario_id'), ('cards', 'user_id'),
                ('debt_baselines', 'user_id'), ('debt_baselines', 'scenario_id'),
                ('debt_payments', 'user_id'), ('debt_payments', 'scenario_id'), ('debt_payments', 'card_id'),
                ('monthly_progress', 'user_id'), ('monthly_progress', 'scenario_id'),
                ('debt_achievements', 'user_id'), ('debt_achievements', 'scenario_id')
          ) AS required(table_name, column_name)
         WHERE NOT EXISTS (
             SELECT 1
               FROM information_schema.columns AS actual
              WHERE actual.table_schema = 'public'
                AND actual.table_name = required.table_name
                AND actual.column_name = required.column_name
         )
    ) THEN
        RAISE EXCEPTION 'Migration 0004 found an incompatible base or repayment table definition';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
         WHERE conrelid = 'public.scenarios'::regclass
           AND contype = 'p' AND convalidated
           AND conkey = ARRAY(
               SELECT attnum::smallint FROM pg_catalog.pg_attribute
                WHERE attrelid = 'public.scenarios'::regclass
                  AND attname = 'id' AND NOT attisdropped
           )
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
         WHERE conrelid = 'public.cards'::regclass
           AND contype = 'p' AND convalidated
           AND conkey = ARRAY(
               SELECT attnum::smallint FROM pg_catalog.pg_attribute
                WHERE attrelid = 'public.cards'::regclass
                  AND attname = 'id' AND NOT attisdropped
           )
    ) THEN
        RAISE EXCEPTION 'Migration 0004 requires validated primary keys on scenarios(id) and cards(id)';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (VALUES
              ('public.scenarios'::regclass, 'scenarios_id_user_id_unique'),
              ('public.cards'::regclass, 'cards_id_scenario_user_unique'),
              ('public.scenarios'::regclass, 'scenarios_user_id_auth_users_fkey'),
              ('public.cards'::regclass, 'cards_scenario_user_owner_fkey'),
              ('public.debt_baselines'::regclass, 'debt_baselines_scenario_owner_fkey'),
              ('public.debt_payments'::regclass, 'debt_payments_scenario_owner_fkey'),
              ('public.debt_payments'::regclass, 'debt_payments_card_scenario_owner_fkey'),
              ('public.monthly_progress'::regclass, 'monthly_progress_scenario_owner_fkey'),
              ('public.debt_achievements'::regclass, 'debt_achievements_scenario_owner_fkey')
          ) AS expected(relation_oid, constraint_name)
          JOIN pg_catalog.pg_constraint AS existing
            ON existing.conrelid = expected.relation_oid
           AND existing.conname = expected.constraint_name
    ) THEN
        RAISE EXCEPTION 'Migration 0004 target constraint names already exist; inspect the schema before proceeding';
    END IF;

    -- Reject missing owners and orphaned or cross-owner references before DDL.
    IF EXISTS (
        SELECT 1
          FROM public.scenarios AS s
          LEFT JOIN auth.users AS u ON u.id = s.user_id
         WHERE u.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Migration 0004 cannot proceed: scenarios contain owners missing from auth.users';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.cards AS c
          LEFT JOIN public.scenarios AS s ON s.id = c.scenario_id
         WHERE s.id IS NULL OR c.user_id IS DISTINCT FROM s.user_id
    ) THEN
        RAISE EXCEPTION 'Migration 0004 cannot proceed: cards contain orphaned or cross-owner scenario references';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.debt_baselines AS b
          LEFT JOIN public.scenarios AS s ON s.id = b.scenario_id
          LEFT JOIN auth.users AS u ON u.id = b.user_id
         WHERE s.id IS NULL OR u.id IS NULL OR b.user_id IS DISTINCT FROM s.user_id
    ) OR EXISTS (
        SELECT 1
          FROM public.monthly_progress AS mp
          LEFT JOIN public.scenarios AS s ON s.id = mp.scenario_id
          LEFT JOIN auth.users AS u ON u.id = mp.user_id
         WHERE s.id IS NULL OR u.id IS NULL OR mp.user_id IS DISTINCT FROM s.user_id
    ) OR EXISTS (
        SELECT 1
          FROM public.debt_achievements AS a
          LEFT JOIN public.scenarios AS s ON s.id = a.scenario_id
          LEFT JOIN auth.users AS u ON u.id = a.user_id
         WHERE s.id IS NULL OR u.id IS NULL OR a.user_id IS DISTINCT FROM s.user_id
    ) THEN
        RAISE EXCEPTION 'Migration 0004 cannot proceed: repayment tracking rows contain orphaned or cross-owner scenario references';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.debt_payments AS p
          LEFT JOIN public.scenarios AS s ON s.id = p.scenario_id
          LEFT JOIN public.cards AS c ON c.id = p.card_id
          LEFT JOIN auth.users AS u ON u.id = p.user_id
         WHERE s.id IS NULL OR c.id IS NULL OR u.id IS NULL
            OR p.user_id IS DISTINCT FROM s.user_id
            OR p.user_id IS DISTINCT FROM c.user_id
            OR p.scenario_id IS DISTINCT FROM c.scenario_id
    ) THEN
        RAISE EXCEPTION 'Migration 0004 cannot proceed: payments contain orphaned or mismatched user/scenario/card references';
    END IF;

    -- Find the original cascade FK by its catalog definition, not its generated
    -- name. Require one validated FK on exactly (card_id) -> cards(id).
    SELECT count(*)::integer, min(fk.conname::text), bool_and(fk.convalidated)
      INTO v_card_fk_count, v_card_fk_name, v_card_fk_validated
      FROM pg_catalog.pg_constraint AS fk
     WHERE fk.conrelid = 'public.debt_payments'::regclass
       AND fk.contype = 'f'
       AND fk.confrelid = 'public.cards'::regclass
       AND fk.conkey = ARRAY(
            SELECT a.attnum::smallint FROM pg_catalog.pg_attribute AS a
             WHERE a.attrelid = 'public.debt_payments'::regclass
               AND a.attname = 'card_id' AND NOT a.attisdropped
       )
       AND fk.confkey = ARRAY(
            SELECT a.attnum::smallint FROM pg_catalog.pg_attribute AS a
             WHERE a.attrelid = 'public.cards'::regclass
               AND a.attname = 'id' AND NOT a.attisdropped
       )
       AND fk.confdeltype = 'c';

    IF v_card_fk_count <> 1 OR NOT COALESCE(v_card_fk_validated, false) THEN
        RAISE EXCEPTION 'Migration 0004 expected exactly one validated ON DELETE CASCADE FK from debt_payments.card_id to cards.id; found %, validated=%', v_card_fk_count, v_card_fk_validated;
    END IF;

    EXECUTE pg_catalog.format(
        'ALTER TABLE public.debt_payments DROP CONSTRAINT %I',
        v_card_fk_name
    );
END;
$$;

ALTER TABLE public.scenarios
    ADD CONSTRAINT scenarios_id_user_id_unique UNIQUE (id, user_id);

ALTER TABLE public.cards
    ADD CONSTRAINT cards_id_scenario_user_unique UNIQUE (id, scenario_id, user_id);

ALTER TABLE public.scenarios
    ADD CONSTRAINT scenarios_user_id_auth_users_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.cards
    ADD CONSTRAINT cards_scenario_user_owner_fkey
    FOREIGN KEY (scenario_id, user_id)
    REFERENCES public.scenarios(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.debt_baselines
    ADD CONSTRAINT debt_baselines_scenario_owner_fkey
    FOREIGN KEY (scenario_id, user_id)
    REFERENCES public.scenarios(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.debt_payments
    ADD CONSTRAINT debt_payments_scenario_owner_fkey
    FOREIGN KEY (scenario_id, user_id)
    REFERENCES public.scenarios(id, user_id) ON DELETE CASCADE;

-- NO ACTION is intentional and deferred: deleting a card alone cannot commit
-- while payment history references it. Scenario/account cascades delete both
-- the payments and cards before this deferred check runs at transaction end.
ALTER TABLE public.debt_payments
    ADD CONSTRAINT debt_payments_card_scenario_owner_fkey
    FOREIGN KEY (card_id, scenario_id, user_id)
    REFERENCES public.cards(id, scenario_id, user_id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.monthly_progress
    ADD CONSTRAINT monthly_progress_scenario_owner_fkey
    FOREIGN KEY (scenario_id, user_id)
    REFERENCES public.scenarios(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.debt_achievements
    ADD CONSTRAINT debt_achievements_scenario_owner_fkey
    FOREIGN KEY (scenario_id, user_id)
    REFERENCES public.scenarios(id, user_id) ON DELETE CASCADE;

COMMIT;
