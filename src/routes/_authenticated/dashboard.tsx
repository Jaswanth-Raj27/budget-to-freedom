import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { simulate, money, formatMonths, type BudgetMode, type Strategy } from "@/lib/simulate";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your plans — Debt Free Buddy" }] }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await supabase.from("profiles").select("name").maybeSingle()).data,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scenarios")
        .select("*, cards(*)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function remove(id: string, name: string) {
    const { error } = await supabase.from("scenarios").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted "${name}"`);
    qc.invalidateQueries({ queryKey: ["scenarios"] });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {profile?.name ? `Hi, ${profile.name.split(" ")[0]}` : "Your plans"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Your saved payoff scenarios.</p>
        </div>
        <Button asChild>
          <Link to="/scenario/$id" params={{ id: "new" }}><Plus className="h-4 w-4" /> New scenario</Link>
        </Button>
      </div>

      <div className="mt-8 space-y-3">
        {isLoading && <div className="h-24 animate-pulse rounded-2xl bg-muted" />}
        {data && data.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <h2 className="font-semibold text-foreground">No scenarios yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Add your cards and see when you could be debt-free.</p>
            <Button asChild className="mt-5">
              <Link to="/scenario/$id" params={{ id: "new" }}><Plus className="h-4 w-4" /> Create your first scenario</Link>
            </Button>
          </div>
        )}
        {data?.map((s) => {
          const cards = [...s.cards].sort((a, b) => a.position - b.position).map((c) => ({
            name: c.name, balance: Number(c.balance), apr: Number(c.apr), min_pct: Number(c.min_pct), min_floor: Number(c.min_floor),
          }));
          const r = simulate(cards, Number(s.budget), s.budget_mode as BudgetMode, s.strategy as Strategy);
          const total = cards.reduce((a, c) => a + c.balance, 0);
          return (
            <div key={s.id} className="group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card transition-shadow hover:shadow-md sm:p-5">
              <Link to="/scenario/$id" params={{ id: s.id }} className="flex min-w-0 flex-1 items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">{s.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {money(total)} across {cards.length} card{cards.length === 1 ? "" : "s"} · edited{" "}
                    {new Date(s.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  {r.status === "ok" && r.months > 0 ? (
                    <>
                      <div className="text-sm font-semibold text-foreground">Debt-free in {formatMonths(r.months)}</div>
                      <div className="text-xs capitalize text-muted-foreground">{s.strategy}</div>
                    </>
                  ) : (
                    <div className="text-sm font-medium text-destructive">Budget too low</div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => remove(s.id, s.name)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
