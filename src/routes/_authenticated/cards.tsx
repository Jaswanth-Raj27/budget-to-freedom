import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CsvHelpNote, CsvImportButton } from "@/components/CsvImport";
import { formatInr, parseCents } from "@/lib/repayment-utils";

export const Route = createFileRoute("/_authenticated/cards")({
  head: () => pageMeta("My Cards", "Manage your private card library and reuse balances and rates in your payoff plans."),
  component: CardsPage,
});

type Draft = { name: string; balance: string; apr: string; min_pct: string; min_floor: string };
const empty: Draft = { name: "", balance: "", apr: "", min_pct: "2", min_floor: "25" };

export function useSavedCards() {
  return useQuery({
    queryKey: ["saved_cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("saved_cards").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function CardsPage() {
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const { data, isLoading } = useSavedCards();
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);

  async function save() {
    if (!editing) return;
    const d = editing.draft;
    if (!d.name.trim() || !(Number(d.balance) > 0) || d.apr === "" || Number(d.apr) < 0) {
      toast.error("Add a name, balance and APR"); return;
    }
    const row = {
      name: d.name.trim(), balance: Math.round(Number(d.balance) * 100) / 100, apr: Number(d.apr),
      min_pct: Number(d.min_pct) || 0, min_floor: Number(d.min_floor) || 0, last_updated: new Date().toISOString(),
    };
    const { error } = editing.id
      ? await supabase.from("saved_cards").update(row).eq("id", editing.id)
      : await supabase.from("saved_cards").insert(row);
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "Card updated" : "Card saved");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["saved_cards"] });
  }

  async function remove(id: string, name: string) {
    const { error } = await supabase.from("saved_cards").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast(`${name} removed`);
    qc.invalidateQueries({ queryKey: ["saved_cards"] });
  }

  const d = editing?.draft;
  const set = (p: Partial<Draft>) => setEditing((e) => e && { ...e, draft: { ...e.draft, ...p } });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl text-foreground">My Cards</h1>
          <p className="mt-1 text-sm text-muted-foreground">Save cards once, reuse them in any scenario.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CsvImportButton onImport={async (cards) => {
            const { error } = await supabase.from("saved_cards").insert(cards);
            if (error) { toast.error(error.message); throw error; }
            toast.success(`${cards.length} card${cards.length === 1 ? "" : "s"} imported`);
            qc.invalidateQueries({ queryKey: ["saved_cards"] });
          }} />
          <Button onClick={() => setEditing({ id: null, draft: empty })}><Plus className="h-4 w-4" /> Add a card</Button>
        </div>
      </div>
      <div className="mt-3"><CsvHelpNote /></div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading && <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground animate-pulse">Loading your cards…</p>}
        {data && data.length === 0 && (
          <div className="border-b py-12 text-center">
            <CreditCard className="mx-auto h-6 w-6 text-accent" />
            <p className="mt-3 text-sm text-muted-foreground">No cards saved yet — add one here, or save one while building a scenario. No judgment, just a plan.</p>
          </div>
        )}
        <AnimatePresence initial={true}>
          {data?.map((c, i) => (
            <motion.div key={c.id} layout initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.05 }}
              className="flex min-h-56 flex-col justify-between overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs opacity-75">My Cards</p><h2 className="mt-1 truncate text-lg font-semibold">{c.name}</h2></div><CreditCard className="h-6 w-6 shrink-0 opacity-80" aria-hidden="true" /></div>
              <div className="mt-6"><p className="text-xs opacity-75">Saved balance</p><p className="mt-1 text-2xl tabular-nums">{formatInr(parseCents(String(c.balance)) ?? 0)}</p><p className="mt-2 text-xs opacity-80">{Number(c.apr)}% APR · minimum {Number(c.min_pct)}% / {formatInr(parseCents(String(c.min_floor)) ?? 0)}</p></div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-primary-foreground/20 pt-2"><span className="text-xs opacity-75">Updated {new Date(c.last_updated).toLocaleDateString()}</span><div className="flex">
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" aria-label={`Edit ${c.name}`} onClick={() => setEditing({ id: c.id, draft: {
                name: c.name, balance: String(Number(c.balance)), apr: String(Number(c.apr)), min_pct: String(Number(c.min_pct)), min_floor: String(Number(c.min_floor)),
              } })}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" aria-label={`Delete ${c.name}`} onClick={() => remove(c.id, c.name)}>
                <Trash2 className="h-4 w-4" />
              </Button>
              </div></div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit card" : "Add a card"}</DialogTitle></DialogHeader>
          {d && (
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="n">Card nickname</Label><Input id="n" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Chase Freedom" /></div>
              <div className="space-y-1.5"><Label htmlFor="b">Current balance (₹)</Label><Input id="b" type="number" step="0.01" min="0" value={d.balance} onChange={(e) => set({ balance: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="a">Interest rate (APR %)</Label><Input id="a" type="number" step="0.01" min="0" value={d.apr} onChange={(e) => set({ apr: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="p">Minimum payment (%)</Label><Input id="p" type="number" step="0.1" min="0" value={d.min_pct} onChange={(e) => set({ min_pct: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="f">Minimum floor (₹)</Label><Input id="f" type="number" step="1" min="0" value={d.min_floor} onChange={(e) => set({ min_floor: e.target.value })} /></div>
              {editing?.id && <p className="text-xs text-muted-foreground sm:col-span-2">Changes here won't affect scenarios you've already saved.</p>}
              <div className="sm:col-span-2"><Button type="submit" className="w-full">Save card</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
