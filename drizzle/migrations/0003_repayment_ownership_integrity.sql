BEGIN;

-- Refuse to add ownership constraints if historical rows already violate them.
-- Repair those rows explicitly before retrying this migration.
DO $$
BEGIN
    IF to_regclass('public.debt_baselines') IS NULL
       OR to_regclass('public.debt_payments') IS NULL
       OR to_regclass('public.monthly_progress') IS NULL
       OR to_regclass('public.debt_achievements') IS NULL THEN
        RAISE EXCEPTION 'Migration 0003 requires the repayment tables from migration 0002 to exist first';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.scenarios s
        LEFT JOIN auth.users u ON u.id = s.user_id
        WHERE u.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot add scenario ownership constraint: scenarios contain missing auth.users owners';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.cards c
        JOIN public.scenarios s ON s.id = c.scenario_id
        WHERE c.user_id <> s.user_id
    ) THEN
        RAISE EXCEPTION 'Cannot add card ownership constraint: cards and scenarios have different owners';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.debt_baselines b
        JOIN public.scenarios s ON s.id = b.scenario_id
        WHERE b.user_id <> s.user_id
    ) OR EXISTS (
        SELECT 1
        FROM public.debt_payments p
        JOIN public.scenarios s ON s.id = p.scenario_id
        WHERE p.user_id <> s.user_id
    ) OR EXISTS (
        SELECT 1
        FROM public.monthly_progress mp
        JOIN public.scenarios s ON s.id = mp.scenario_id
        WHERE mp.user_id <> s.user_id
    ) OR EXISTS (
        SELECT 1
        FROM public.debt_achievements a
        JOIN public.scenarios s ON s.id = a.scenario_id
        WHERE a.user_id <> s.user_id
    ) THEN
        RAISE EXCEPTION 'Cannot add repayment ownership constraints: tracking rows and scenarios have different owners';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.debt_payments p
        JOIN public.cards c ON c.id = p.card_id
        WHERE p.scenario_id <> c.scenario_id OR p.user_id <> c.user_id
    ) THEN
        RAISE EXCEPTION 'Cannot add payment card constraint: payment card, scenario, and user do not match';
    END IF;
END;
$$;

-- Composite unique keys let child rows bind both identity and ownership.
ALTER TABLE public.scenarios
    ADD CONSTRAINT scenarios_id_user_id_unique UNIQUE (id, user_id);

ALTER TABLE public.cards
    ADD CONSTRAINT cards_id_scenario_user_unique UNIQUE (id, scenario_id, user_id);

-- Deleting an auth user now removes their scenarios; deleting those scenarios
-- removes their cards through the ownership-aware card foreign key.
ALTER TABLE public.scenarios
    ADD CONSTRAINT scenarios_user_id_auth_users_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.cards
    ADD CONSTRAINT cards_scenario_user_owner_fkey
    FOREIGN KEY (scenario_id, user_id)
    REFERENCES public.scenarios(id, user_id) ON DELETE CASCADE;

-- Ensure every repayment record belongs to the same owner as its scenario.
ALTER TABLE public.debt_baselines
    ADD CONSTRAINT debt_baselines_scenario_owner_fkey
    FOREIGN KEY (scenario_id, user_id)
    REFERENCES public.scenarios(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.debt_payments
    ADD CONSTRAINT debt_payments_scenario_owner_fkey
    FOREIGN KEY (scenario_id, user_id)
    REFERENCES public.scenarios(id, user_id) ON DELETE CASCADE;

-- Keep a card's repayment history from being deleted by deleting that card.
-- Deferral allows an intentional scenario deletion to cascade its payment rows
-- through scenario_id before the card reference is checked at transaction end.
ALTER TABLE public.debt_payments
    DROP CONSTRAINT debt_payments_card_id_fkey;

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
