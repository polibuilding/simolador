// Estoque: quantos kits de cada tipo o usuário tem (A-CONFIRMAR Q03) e quantas peças já foram usadas.
import type { Catalog } from "./catalog";
import type { Model } from "./model";

export interface InventoryConfig {
  kits: Record<string, number>; // id do kit → quantidade de caixas
  unlimited: boolean; // modo "sem limite" (S2)
}

export const defaultInventory = (cat: Catalog): InventoryConfig => ({
  kits: Object.fromEntries(Object.keys(cat.kits).map((k) => [k, 1])),
  unlimited: false,
});

/** Quantidade disponível de uma peça, somando todas as caixas. Infinity no modo sem limite. */
export function available(cat: Catalog, inv: InventoryConfig, code: string): number {
  if (inv.unlimited) return Infinity;
  let total = 0;
  for (const [kitId, count] of Object.entries(inv.kits)) {
    total += (cat.kits[kitId]?.pieces[code] ?? 0) * count;
  }
  return total;
}

/** Quantidade usada de cada peça no modelo. A esfera da GC é embutida e não conta como C (N1). */
export function usage(model: Model): Record<string, number> {
  const u: Record<string, number> = {};
  const inc = (k: string) => (u[k] = (u[k] ?? 0) + 1);
  for (const n of Object.values(model.nodes)) inc(n.kind === "support" ? "GC" : "C");
  for (const m of Object.values(model.members)) inc(m.code);
  for (const p of Object.values(model.plates)) inc(p.code);
  for (const c of Object.values(model.connectors)) inc(c.code);
  return u;
}

export function remaining(cat: Catalog, inv: InventoryConfig, model: Model, code: string): number {
  return available(cat, inv, code) - (usage(model)[code] ?? 0);
}
