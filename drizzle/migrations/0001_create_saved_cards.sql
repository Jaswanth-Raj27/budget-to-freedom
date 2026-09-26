CREATE TABLE public.saved_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  apr numeric(6,2) NOT NULL DEFAULT 0,
  min_pct numeric(6,2) NOT NULL DEFAULT 2,
  min_floor numeric(10,2) NOT NULL DEFAULT 25,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_cards TO authenticated;
GRANT ALL ON public.saved_cards TO service_role;
ALTER TABLE public.saved_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own saved cards select" ON public.saved_cards FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own saved cards insert" ON public.saved_cards FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own saved cards update" ON public.saved_cards FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own saved cards delete" ON public.saved_cards FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX saved_cards_user_idx ON public.saved_cards(user_id);