// Estoque: quantos kits de cada tipo o usuário tem (A-CONFIRMAR Q03) e quantas peças já foram usadas.
import { catalog as defaultCatalog, type Catalog } from "./catalog";
import type { Model } from "./model";
import { isRopeCode, kit3Usage, ropePlan } from "./rope";

export interface InventoryConfig {
  kits: Record<string, number>; // id do kit → quantidade de caixas
  unlimited: boolean; // modo "sem limite" (S2)
}

export const defaultInventory = (cat: Catalog): InventoryConfig => ({
  kits: Object.fromEntries(Object.keys(cat.kits).map((k) => [k, 1])),
  unlimited: false,
});

/**
 * Quanto de uma peça `count` caixas do kit dão. Kit sem limite (Kit X, 2.x): Infinity para as peças que ele traz,
 * com pelo menos uma caixa. Sem caixa, 0 (nunca 0 × Infinity).
 */
export function kitAmount(kit: Catalog["kits"][string] | undefined, code: string, count: number): number {
  const q = kit?.pieces[code] ?? 0;
  if (!(count > 0) || !(q > 0)) return 0;
  return kit!.unlimited ? Infinity : q * count;
}

/** Quantidade disponível de uma peça, somando todas as caixas. Infinity no modo sem limite. */
export function available(cat: Catalog, inv: InventoryConfig, code: string): number {
  if (inv.unlimited) return Infinity;
  let total = 0;
  for (const [kitId, count] of Object.entries(inv.kits)) {
    total += kitAmount(cat.kits[kitId], code, count);
  }
  return total;
}

/**
 * Quantidade usada de cada peça no modelo. A esfera da GC é embutida e não conta como C (N1).
 * Cabos (Kit 3): CABLE conta rolos (pelo plano de corte); CABLE C e CABLE CLIP C entram 2 por cabo; enrijecedores
 * contam pelas molas com `stiff`.
 */
export function usage(model: Model, cat: Catalog = defaultCatalog): Record<string, number> {
  const u: Record<string, number> = {};
  const inc = (k: string, n = 1) => (u[k] = (u[k] ?? 0) + n);
  // ponto de cabo: clip, em kit3Usage; anel: o código dele (RING-P ou RING-M)
  for (const n of Object.values(model.nodes)) if (n.kind !== "clip") inc(n.kind === "support" ? "GC" : n.kind === "ring" ? n.ring ?? "RING-P" : "C");
  for (const m of Object.values(model.members)) if (!isRopeCode(cat, m.code)) inc(m.code);
  for (const p of Object.values(model.plates)) inc(p.code);
  for (const c of Object.values(model.connectors)) inc(c.code);
  for (const [k, n] of Object.entries(kit3Usage(cat, model))) inc(k, n);
  return u;
}

/**
 * Massa da estrutura (g), pela coluna "Massa (g)" da planilha (pesagens da equipe, 13/11/2026) ou pelas configurações.
 * O cabo do Kit 3 conta em g por metro. A chapa de base não entra. `missing`: peças usadas ainda sem massa.
 */
export function structureMass(model: Model, cat: Catalog = defaultCatalog): { g: number; missing: string[] } {
  let g = 0;
  const missing: string[] = [];
  const add = (code: string, n: number) => {
    const w = cat.pieces[code]?.weightG;
    if (typeof w === "number" && w > 0) g += w * n;
    else if (!missing.includes(code)) missing.push(code);
  };
  for (const [code, n] of Object.entries(usage(model, cat))) if (n > 0 && !isRopeCode(cat, code)) add(code, n);
  const rope = Object.values(model.members).some((m) => isRopeCode(cat, m.code)) ? ropePlan(cat, model).mm : 0;
  if (rope > 0) add("CABLE", rope / 1000);
  return { g, missing };
}

export function remaining(cat: Catalog, inv: InventoryConfig, model: Model, code: string): number {
  return available(cat, inv, code) - (usage(model, cat)[code] ?? 0);
}

/**
 * Menor número de caixas que cobre as peças usadas (modo sem limite): busca em todas as combinações de kits, até
 * o necessário de cada um. Empate: a que sobra menos peça. `missing`: peças que não existem em nenhum kit.
 */
export function minKits(cat: Catalog, used: Record<string, number>): { kits: Record<string, number>; total: number; missing: string[] } {
  const ids = Object.keys(cat.kits);
  const need = Object.entries(used).filter(([, n]) => n > 0);
  const missing = need.filter(([c]) => !ids.some((k) => (cat.kits[k].pieces[c] ?? 0) > 0)).map(([c]) => c);
  const req = need.filter(([c]) => !missing.includes(c));
  // teto de cada kit: o bastante para cobrir sozinho as peças que ele tem (kit sem limite: uma caixa basta)
  const cap = ids.map((k) =>
    Math.max(0, ...req.map(([c, n]) => ((cat.kits[k].pieces[c] ?? 0) > 0 ? (cat.kits[k].unlimited ? 1 : Math.ceil(n / cat.kits[k].pieces[c])) : 0))),
  );
  let best: { counts: number[]; total: number; spare: number } | null = null;
  const counts = ids.map(() => 0);
  let visited = 0;
  const walk = (i: number, total: number) => {
    if (best && total > best.total) return;
    if (++visited > 2_000_000) return; // segurança (muitos kits)
    if (i === ids.length) {
      let spare = 0;
      for (const [c, n] of req) {
        const have = ids.reduce((s, k, j) => s + kitAmount(cat.kits[k], c, counts[j]), 0);
        if (have < n) return;
        if (Number.isFinite(have)) spare += have - n;
      }
      if (!best || total < best.total || (total === best.total && spare < best.spare)) best = { counts: [...counts], total, spare };
      return;
    }
    for (let n = 0; n <= cap[i]; n++) {
      counts[i] = n;
      walk(i + 1, total + n);
    }
    counts[i] = 0;
  };
  walk(0, 0);
  const b = best as { counts: number[]; total: number } | null;
  return { kits: Object.fromEntries(ids.map((k, j) => [k, b ? b.counts[j] : 0]).filter(([, n]) => (n as number) > 0)), total: b?.total ?? 0, missing };
}
