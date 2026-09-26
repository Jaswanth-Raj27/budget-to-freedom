// Lightweight CSV parsing + header matching for card imports.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

type Key = "name" | "balance" | "apr" | "min_pct" | "min_floor";

const SYNONYMS: Record<Key, string[]> = {
  name: ["name", "card name", "card", "nickname", "card nickname", "account", "account name", "description", "card type", "product"],
  balance: ["balance", "current balance", "amount owed", "outstanding balance", "statement balance", "total balance", "amount due", "owed", "debt", "new balance"],
  apr: ["apr", "interest rate", "rate", "interest", "purchase apr", "annual percentage rate", "apr %", "interest rate %"],
  min_pct: ["min pct", "minimum payment percentage", "minimum %", "min %", "minimum percent", "min payment %", "minimum payment %", "min_pct", "min percent"],
  min_floor: ["min floor", "minimum payment floor", "minimum floor", "min payment", "minimum payment", "minimum", "min_floor", "floor", "minimum due"],
};

const norm = (h: string) => h.toLowerCase().replace(/[_\-()]/g, " ").replace(/\s+/g, " ").trim();

export function matchHeaders(headers: string[]): Partial<Record<Key, number>> {
  const out: Partial<Record<Key, number>> = {};
  const used = new Set<number>();
  const hs = headers.map(norm);
  // exact first (priority order matters: min_pct before min_floor)
  (["name", "balance", "apr", "min_pct", "min_floor"] as Key[]).forEach((k) => {
    const idx = hs.findIndex((h, i) => !used.has(i) && SYNONYMS[k].includes(h));
    if (idx >= 0) { out[k] = idx; used.add(idx); }
  });
  (["name", "balance", "apr", "min_pct", "min_floor"] as Key[]).forEach((k) => {
    if (out[k] !== undefined) return;
    const idx = hs.findIndex((h, i) => !used.has(i) && SYNONYMS[k].some((syn) => h.includes(syn)));
    if (idx >= 0) { out[k] = idx; used.add(idx); }
  });
  return out;
}

export const toNum = (v: string | undefined) => {
  if (v == null) return NaN;
  const t = v.replace(/[$,%\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (t === "") return NaN;
  return Number(t);
};

export type ImportRow = { include: boolean; name: string; balance: string; apr: string; min_pct: string; min_floor: string };

export function csvToRows(text: string): { rows: ImportRow[]; error?: string } {
  const data = parseCsv(text);
  if (data.length < 2) return { rows: [], error: "That file doesn't have a header row and at least one data row." };
  const [header, ...body] = data;
  const m = matchHeaders(header);
  if (m.name === undefined && m.balance === undefined) {
    return { rows: [], error: "We couldn't find a card name or balance column. Check the column headers." };
  }
  const get = (r: string[], k: Key) => (m[k] === undefined ? "" : (r[m[k]!] ?? "").trim());
  const clean = (v: string) => { const n = toNum(v); return Number.isFinite(n) ? String(Math.abs(n)) : v; };
  return {
    rows: body.map((r) => ({
      include: true,
      name: get(r, "name"),
      balance: clean(get(r, "balance")),
      apr: clean(get(r, "apr")),
      min_pct: get(r, "min_pct") ? clean(get(r, "min_pct")) : "2",
      min_floor: get(r, "min_floor") ? clean(get(r, "min_floor")) : "25",
    })),
  };
}

export function rowIssues(r: ImportRow): string[] {
  const issues: string[] = [];
  if (!r.name.trim()) issues.push("name");
  const b = toNum(r.balance);
  if (!Number.isFinite(b) || b <= 0) issues.push("balance");
  const a = r.apr === "" ? 0 : toNum(r.apr);
  if (!Number.isFinite(a) || a < 0) issues.push("apr");
  if (!Number.isFinite(toNum(r.min_pct || "0"))) issues.push("min_pct");
  if (!Number.isFinite(toNum(r.min_floor || "0"))) issues.push("min_floor");
  return issues;
}

export function rowToCard(r: ImportRow) {
  return {
    name: r.name.trim(),
    balance: Math.round(toNum(r.balance) * 100) / 100,
    apr: r.apr === "" ? 0 : toNum(r.apr),
    min_pct: toNum(r.min_pct || "0") || 0,
    min_floor: toNum(r.min_floor || "0") || 0,
  };
}
