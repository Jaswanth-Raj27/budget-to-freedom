CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile delete" ON public.profiles FOR DELETE TO authenticated USING (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), COALESCE(NEW.email, ''));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL DEFAULT 'My plan',
  budget numeric(12,2) NOT NULL DEFAULT 0,
  budget_mode text NOT NULL DEFAULT 'fixed_total' CHECK (budget_mode IN ('fixed_total','fixed_extra')),
  strategy text NOT NULL DEFAULT 'avalanche' CHECK (strategy IN ('snowball','avalanche')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarios TO authenticated;
GRANT ALL ON public.scenarios TO service_role;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scenarios select" ON public.scenarios FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own scenarios insert" ON public.scenarios FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own scenarios update" ON public.scenarios FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own scenarios delete" ON public.scenarios FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL DEFAULT 'Card',
  balance numeric(12,2) NOT NULL DEFAULT 0,
  apr numeric(6,3) NOT NULL DEFAULT 0,
  min_pct numeric(6,3) NOT NULL DEFAULT 2,
  min_floor numeric(10,2) NOT NULL DEFAULT 25,
  position int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cards select" ON public.cards FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own cards insert" ON public.cards FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own cards update" ON public.cards FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own cards delete" ON public.cards FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX cards_scenario_idx ON public.cards(scenario_id);