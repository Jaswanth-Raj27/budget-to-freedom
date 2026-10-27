
-- =========================================================
-- 1. DEBT BASELINES
-- Store the original debt for each repayment scenario.
-- =========================================================

CREATE TABLE public.debt_baselines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id uuid NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    scenario_id uuid NOT NULL
        REFERENCES public.scenarios(id) ON DELETE CASCADE,

    baseline_amount numeric(12,2) NOT NULL
        CHECK (baseline_amount >= 0),

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT debt_baselines_user_scenario_unique
        UNIQUE (user_id, scenario_id)
);

ALTER TABLE public.debt_baselines ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.debt_baselines TO authenticated;

GRANT ALL ON public.debt_baselines TO service_role;

CREATE POLICY "Users can view their own debt baselines"
ON public.debt_baselines
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own debt baselines"
ON public.debt_baselines
FOR INSERT TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.scenarios s
        WHERE s.id = scenario_id
          AND s.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their own debt baselines"
ON public.debt_baselines
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.scenarios s
        WHERE s.id = scenario_id
          AND s.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete their own debt baselines"
ON public.debt_baselines
FOR DELETE TO authenticated
USING (user_id = auth.uid());


-- =========================================================
-- 2. DEBT PAYMENTS
-- Store repayments against individual cards and scenarios.
-- =========================================================

CREATE TABLE public.debt_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id uuid NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    scenario_id uuid NOT NULL
        REFERENCES public.scenarios(id) ON DELETE CASCADE,

    card_id uuid NOT NULL
        REFERENCES public.cards(id) ON DELETE CASCADE,

    amount numeric(12,2) NOT NULL
        CHECK (amount > 0),

    payment_date date NOT NULL DEFAULT CURRENT_DATE,

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX debt_payments_user_scenario_idx
ON public.debt_payments(user_id, scenario_id);

CREATE INDEX debt_payments_card_idx
ON public.debt_payments(card_id);

CREATE INDEX debt_payments_date_idx
ON public.debt_payments(payment_date);

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

-- Keep repayment rows read-only for clients from the moment this table exists.
-- Migration 0005 installs the only authenticated write path through the RPC.
GRANT SELECT
ON public.debt_payments TO authenticated;

GRANT ALL ON public.debt_payments TO service_role;

CREATE POLICY "Users can view their own debt payments"
ON public.debt_payments
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- =========================================================
-- 3. MONTHLY PROGRESS
-- Store progress summaries for each scenario and month.
-- These values will be maintained by database functions.
-- =========================================================

CREATE TABLE public.monthly_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id uuid NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    scenario_id uuid NOT NULL
        REFERENCES public.scenarios(id) ON DELETE CASCADE,

    month date NOT NULL
        CHECK (EXTRACT(DAY FROM month) = 1),

    total_paid numeric(12,2) NOT NULL DEFAULT 0
        CHECK (total_paid >= 0),

    payment_count integer NOT NULL DEFAULT 0
        CHECK (payment_count >= 0),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT monthly_progress_user_scenario_month_unique
        UNIQUE (user_id, scenario_id, month)
);

ALTER TABLE public.monthly_progress ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.monthly_progress TO authenticated;
GRANT ALL ON public.monthly_progress TO service_role;

CREATE POLICY "Users can view their own monthly progress"
ON public.monthly_progress
FOR SELECT TO authenticated
USING (user_id = auth.uid());


-- =========================================================
-- 4. DEBT ACHIEVEMENTS
-- Store milestones earned for each scenario.
-- =========================================================

CREATE TABLE public.debt_achievements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id uuid NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    scenario_id uuid NOT NULL
        REFERENCES public.scenarios(id) ON DELETE CASCADE,

    achievement_key text NOT NULL
        CHECK (
            achievement_key IN (
                'first_payment',
                'repaid_500',
                'repaid_1000',
                'repaid_10_percent',
                'repaid_25_percent',
                'repaid_50_percent',
                'repaid_75_percent',
                'debt_free'
            )
        ),

    earned_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT debt_achievements_user_scenario_key_unique
        UNIQUE (user_id, scenario_id, achievement_key)
);

ALTER TABLE public.debt_achievements ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.debt_achievements TO authenticated;
GRANT ALL ON public.debt_achievements TO service_role;

CREATE POLICY "Users can view their own debt achievements"
ON public.debt_achievements
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- RLS and row-level DELETE policies do not restrict TRUNCATE.
REVOKE TRUNCATE ON TABLE
    public.debt_baselines,
    public.debt_payments,
    public.monthly_progress,
    public.debt_achievements
FROM PUBLIC, anon, authenticated;


-- =========================================================
-- 5. HELPER INDEXES
-- =========================================================

CREATE INDEX debt_baselines_scenario_idx
ON public.debt_baselines(scenario_id);

CREATE INDEX monthly_progress_scenario_month_idx
ON public.monthly_progress(scenario_id, month);

CREATE INDEX debt_achievements_scenario_idx
ON public.debt_achievements(scenario_id);

