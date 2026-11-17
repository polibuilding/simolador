// Peças ajustáveis da 2.x (Kit X, plano §11; chave Ajustável). Nesta BETA: barra e tirante ajustáveis, criados com
// dois cliques entre duas esferas: o comprimento é a distância entre elas (passo de 0,01 M, X2). A peça criada entra
// no catálogo (camada do usuário) com o código B5.12 / T7.21, preta. A barra sai de uma das Barras de Comprimento
// Regulável da Mola (A.B3-B4 … A.B9-B15) ou, fora delas, é "fabricar" (X4); o tirante é sempre fabricado.
import { type Catalog, type PieceDef } from "./catalog";
import type { Model } from "./model";
import { KIT_X, KIT_X_COLOR, adjustableModel, adjustableModels, barCode, lengthStep, tieCode } from "./userPieces";

/** ferramentas da paleta (não são peças: criam a peça na hora) */
export const ADJ_BAR = "BX";
export const ADJ_TIE = "TX";
export const isAdjustTool = (code: string) => code === ADJ_BAR || code === ADJ_TIE;

/** Comprimento (módulos) no passo do Kit X. */
export function adjustLength(cat: Catalog, d: number): number {
  const s = lengthStep(cat);
  return Math.round(Math.round(d / s) * s * 1e6) / 1e6;
}

/**
 * A peça ajustável de comprimento `lenM` (barra ou tirante), pronta para o catálogo. Massa estimada pelas pesagens
 * das molas e diagonais do kit (13/11/2026): barra ≈ 0,55 + 0,70 g/M; tirante ≈ 1,19 + 0,029 g/M.
 */
export function adjustablePiece(cat: Catalog, tool: string, lenM: number): PieceDef {
  const L = adjustLength(cat, lenM);
  const shown = String(L).replace(".", ",");
  if (tool === ADJ_TIE) {
    return { code: tieCode(cat, L), name: `Tirante ajustável ${shown} M`, type: "cable", spanM: [L, 0], geometry: {}, status: null, notes: "fabricar", origin: "user", parent: ADJ_TIE, color: KIT_X_COLOR, weightG: Math.round((1.19 + 0.029 * L) * 100) / 100 };
  }
  const model = adjustableModel(cat, L);
  return { code: barCode(cat, L), name: `Barra ajustável ${shown} M`, type: "bar", spanM: [L], geometry: {}, status: null, notes: model ? `regulável ${model}` : "fabricar", origin: "user", parent: ADJ_BAR, color: KIT_X_COLOR, weightG: Math.round((0.55 + 0.7 * L) * 100) / 100 };
}

/** Põe a peça no catálogo (e no Kit X), se ainda não estiver. */
export function ensureAdjustable(cat: Catalog, p: PieceDef): void {
  if (cat.pieces[p.code]) return;
  cat.pieces[p.code] = p;
  const k = (cat.kits[KIT_X] ??= { name: "Kit X", color: KIT_X_COLOR, pieces: {}, unlimited: true });
  cat.kits[KIT_X] = { ...k, pieces: { ...k.pieces, [p.code]: 1 } };
}

/**
 * Barras ajustáveis da montagem e o que comprar: quantas de cada regulável, quantos pacotes (cada pacote traz
 * `regulavel_pacote_por_modelo` de cada modelo; site da Mola: 2) e quantas precisam ser fabricadas.
 */
export function adjustableNeeds(cat: Catalog, model: Model): { perModel: Record<string, number>; packs: number; fabricate: number; ties: number; bars: number } {
  const perModel: Record<string, number> = Object.fromEntries(adjustableModels(cat).map((m) => [m.code, 0]));
  let fabricate = 0;
  let ties = 0;
  let bars = 0;
  for (const m of Object.values(model.members)) {
    const p = cat.pieces[m.code];
    if (p?.origin !== "user") continue;
    if (p.type === "cable") {
      ties++;
      continue;
    }
    if (p.type !== "bar" || !p.spanM) continue;
    bars++;
    const mod = adjustableModel(cat, p.spanM[0]);
    if (mod) perModel[mod]++;
    else fabricate++;
  }
  const per = Number(cat.settings.regulavel_pacote_por_modelo) || 2;
  const packs = Math.max(0, ...Object.values(perModel).map((n) => Math.ceil(n / per)));
  return { perModel, packs, fabricate, ties, bars };
}
