import { useRef, useState } from "react";
import { AlertTriangle, FileUp, Info, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { csvToRows, rowIssues, rowToCard, type ImportRow } from "@/lib/csv";
import type { CardInput } from "@/lib/simulate";

export type ImportDestination = "saved" | "scenario" | "both";

export function CsvHelpNote() {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      Export a statement or account summary CSV from your bank's website — we only read balance and rate info, nothing else.
    </p>
  );
}

export function CsvImportButton({
  onImport,
  destinations,
  size = "default",
}: {
  onImport: (cards: CardInput[], dest: ImportDestination) => Promise<void> | void;
  destinations?: { value: ImportDestination; label: string }[];
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [drag, setDrag] = useState(false);
  const [dest, setDest] = useState<ImportDestination>(destinations?.[0]?.value ?? "saved");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function readFile(f: File) {
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") { toast.error("Please choose a .csv file"); return; }
    const { rows, error } = csvToRows(await f.text());
    if (error) { toast.error(error); return; }
    setRows(rows);
  }

  function update(i: number, patch: Partial<ImportRow>) {
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const included = rows?.filter((r) => r.include) ?? [];
  const blocking = included.filter((r) => rowIssues(r).length > 0).length;

  async function confirm() {
    if (!included.length) { toast.error("No rows selected to import"); return; }
    if (blocking) { toast.error("Fix or exclude the flagged rows first"); return; }
    setBusy(true);
    try {
      await onImport(included.map(rowToCard), dest);
      setOpen(false);
      setRows(null);
    } finally {
      setBusy(false);
    }
  }

  const cell = "h-9 px-2 text-xs tabular-nums";

  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={() => setOpen(true)}>
        <FileUp className="h-4 w-4" /> Import from CSV
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRows(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import cards from CSV</DialogTitle>
            <DialogDescription>Upload a file, then review and fix anything before importing.</DialogDescription>
          </DialogHeader>

          {!rows ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-secondary/40 p-8 text-center",
                  drag ? "border-primary bg-primary/10" : "hover:border-primary/60 hover:bg-muted/40",
                )}
              >
                <Upload className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">Drop a CSV here, or click to choose a file</span>
                <span className="text-xs text-muted-foreground">Columns like name, balance, APR, minimum % and minimum payment</span>
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
              <CsvHelpNote />
            </div>
          ) : (
            <div className="space-y-4">
              {blocking > 0 && (
                <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {blocking} row{blocking === 1 ? " needs" : "s need"} attention — fix the highlighted fields or untick the row.
                </p>
              )}
              <div className="max-h-80 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-2 py-2 text-left">Name</th>
                      <th className="px-2 py-2 text-left">Balance $</th>
                      <th className="px-2 py-2 text-left">APR %</th>
                      <th className="px-2 py-2 text-left">Min %</th>
                      <th className="px-2 py-2 text-left">Min $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const iss = r.include ? rowIssues(r) : [];
                      const bad = (k: string) => iss.includes(k) && "border-destructive ring-1 ring-destructive/50";
                      return (
                        <tr key={i} className={cn("border-t", !r.include && "opacity-40", iss.length > 0 && "bg-destructive/5")}>
                          <td className="px-2 py-1.5">
                            <Checkbox checked={r.include} onCheckedChange={(v) => update(i, { include: !!v })} aria-label={`Include row ${i + 1}`} />
                          </td>
                          <td className="px-1 py-1.5"><Input className={cn(cell, "min-w-32", bad("name"))} value={r.name} placeholder="Required" onChange={(e) => update(i, { name: e.target.value })} /></td>
                          <td className="px-1 py-1.5"><Input className={cn(cell, "w-24", bad("balance"))} value={r.balance} placeholder="Required" onChange={(e) => update(i, { balance: e.target.value })} /></td>
                          <td className="px-1 py-1.5"><Input className={cn(cell, "w-20", bad("apr"))} value={r.apr} onChange={(e) => update(i, { apr: e.target.value })} /></td>
                          <td className="px-1 py-1.5"><Input className={cn(cell, "w-16", bad("min_pct"))} value={r.min_pct} onChange={(e) => update(i, { min_pct: e.target.value })} /></td>
                          <td className="px-1 py-1.5"><Input className={cn(cell, "w-16", bad("min_floor"))} value={r.min_floor} onChange={(e) => update(i, { min_floor: e.target.value })} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {destinations && destinations.length > 1 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Where should these cards go?</p>
                  <div className="flex flex-wrap gap-2">
                    {destinations.map((d) => (
                      <button key={d.value} type="button" onClick={() => setDest(d.value)}
                        className={cn("rounded-lg border px-3 py-1.5 text-sm", dest === d.value ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:border-accent/50")}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {rows && (
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRows(null)}>Choose another file</Button>
              <Button onClick={confirm} disabled={busy || !included.length}>
                {busy ? "Importing…" : `Import ${included.length} card${included.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
