// Kit 3: cabo (corrente de bolinhas) e enrijecedor de mola.
//
// Montagem padrão do cabo, de uma esfera a outra (só tração):
//   esfera · CABLE C (ímã na esfera, anel na ponta) · CABLE CLIP C (anel numa ponta, bolinha do cabo na outra)
//   · cabo · CABLE CLIP C · CABLE C · esfera
// As ligações e os clipes entram sozinhos (2 de cada por cabo). O cabo vem num rolo (cabo_rolo_mm) e é cortado
// na montagem; cada pedaço é contado em bolinhas (régua do manual do Kit 3).
import type { Catalog } from "./catalog";
import type { InventoryConfig } from "./inventory";
import type { Model, Vec3 } from "./model";
import { len, sub } from "./model";

export const ROPE = "CABLE";
export const ROPE_CONN = "CABLE-C";
export const ROPE_CLIP = "CLIP-C";

export const isRopeCode = (cat: Catalog, code: string) => cat.pieces[code]?.type === "rope";

export interface RopeSpec {
  /** distância entre centros de bolinhas vizinhas (mm) */
  pitch: number;
  /** diâmetro da bolinha (mm) */
  ball: number;
  /** comprimento do rolo (mm) */
  roll: number;
  /** de cada ponta: raio da esfera + CABLE C + CABLE CLIP C, até o centro da primeira bolinha (mm) */
  end: number;
  /** quanto a CABLE C estica girando (mm) */
  adjust: number;
}

export function ropeSpec(cat: Catalog): RopeSpec {
  const s = cat.settings;
  const n = (k: string, d: number) => {
    const v = Number(s[k]);
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    pitch: n("cabo_passo_mm", 3.2),
    ball: n("cabo_bolinha_mm", 2.4),
    roll: n("cabo_rolo_mm", 3350),
    end: s.esfera_diametro_mm / 2 + n("cabo_ligacao_mm", 16) + n("cabo_clip_mm", 9),
    adjust: Number(s.cabo_ajuste_mm ?? 0) || 0,
  };
}

/** bolinhas que cabem num rolo inteiro */
export const ballsPerRoll = (sp: RopeSpec) => Math.floor(sp.roll / sp.pitch);

export interface RopeInfo {
  /** distância entre os centros das esferas (mm) */
  centerMm: number;
  /** do centro da primeira bolinha ao centro da última (mm), antes de arredondar */
  chainMm: number;
  /** bolinhas do pedaço */
  balls: number;
  /** comprimento do pedaço a cortar (mm, ≈ bolinhas × passo) */
  cutMm: number;
  /** sobra (mm) que o esticador da CABLE C absorve (menos de uma bolinha) */
  slackMm: number;
}

/** Pedaço de cabo entre esferas em `a` e `b` (módulos). null: curto demais para as ligações das duas pontas. */
export function ropeInfo(cat: Catalog, a: Vec3, b: Vec3): RopeInfo | null {
  const sp = ropeSpec(cat);
  const centerMm = len(sub(b, a)) * cat.settings.modulo_mm;
  const chainMm = centerMm - 2 * sp.end;
  if (chainMm < sp.pitch) return null; // pelo menos duas bolinhas
  const balls = Math.floor(chainMm / sp.pitch + 1e-9) + 1;
  return { centerMm, chainMm, balls, cutMm: balls * sp.pitch, slackMm: chainMm - (balls - 1) * sp.pitch };
}

/** menor distância entre esferas para caber um cabo (mm) */
export const ropeMinMm = (cat: Catalog) => {
  const sp = ropeSpec(cat);
  return 2 * sp.end + sp.pitch;
};

export interface RopeCut {
  id: string;
  balls: number;
  cutMm: number;
}

export interface RopePlan {
  cuts: RopeCut[];
  /** cortes de cada rolo (plano de corte: maiores primeiro, no primeiro rolo onde couber) */
  rolls: RopeCut[][];
  balls: number;
  mm: number;
}

/** Pedaços de cabo do modelo e como tirá-los dos rolos. `extra`: um pedaço a mais (cabo sendo colocado). */
export function ropePlan(cat: Catalog, model: Model, extra?: RopeCut): RopePlan {
  const sp = ropeSpec(cat);
  const cuts: RopeCut[] = [];
  for (const m of Object.values(model.members)) {
    if (!isRopeCode(cat, m.code)) continue;
    const a = model.nodes[m.a];
    const b = model.nodes[m.b];
    if (!a || !b) continue;
    const info = ropeInfo(cat, a.pos, b.pos);
    if (info) cuts.push({ id: m.id, balls: info.balls, cutMm: info.cutMm });
  }
  if (extra) cuts.push(extra);
  const cap = ballsPerRoll(sp);
  const rolls: RopeCut[][] = [];
  const free: number[] = [];
  for (const c of [...cuts].sort((x, y) => y.balls - x.balls)) {
    const i = free.findIndex((f) => f >= c.balls);
    if (i >= 0) (rolls[i].push(c), (free[i] -= c.balls));
    else (rolls.push([c]), free.push(cap - c.balls));
  }
  return { cuts, rolls, balls: cuts.reduce((s, c) => s + c.balls, 0), mm: cuts.reduce((s, c) => s + c.cutMm, 0) };
}

/** Enrijecedor que serve na mola `code` (B6 → BS6, B12 → BS12); null se não há. */
export function stiffenerFor(cat: Catalog, code: string): string | null {
  const span = cat.pieces[code]?.type === "bar" ? cat.pieces[code].spanM?.[0] : undefined;
  if (span == null) return null;
  const s = Object.values(cat.pieces).find((p) => p.type === "stiffener" && p.spanM?.[0] === span);
  return s?.code ?? null;
}

/** Peças que entram sozinhas com os cabos e os enrijecedores (para o estoque e o resumo). */
export function kit3Usage(cat: Catalog, model: Model): Record<string, number> {
  const u: Record<string, number> = {};
  const inc = (k: string, n = 1) => (u[k] = (u[k] ?? 0) + n);
  let ropes = 0;
  for (const m of Object.values(model.members)) {
    if (isRopeCode(cat, m.code)) ropes++;
    else if (m.stiff) {
      const s = stiffenerFor(cat, m.code);
      if (s) inc(s);
    }
  }
  if (ropes) {
    inc(ROPE_CONN, 2 * ropes);
    inc(ROPE_CLIP, 2 * ropes);
    inc(ROPE, ropePlan(cat, model).rolls.length);
  }
  return u;
}

/** Texto curto de um pedaço: "25 bolinhas · 8,0 cm". */
export const ropeText = (balls: number, cutMm: number) =>
  `${balls} bolinhas · ${(cutMm / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} cm`;

/** Cabo disponível no estoque (mm e bolinhas); Infinity sem limite. */
export function ropeStock(cat: Catalog, inv: InventoryConfig, availableRolls: number): { rolls: number; mm: number; balls: number } {
  const sp = ropeSpec(cat);
  if (inv.unlimited || !Number.isFinite(availableRolls)) return { rolls: Infinity, mm: Infinity, balls: Infinity };
  return { rolls: availableRolls, mm: availableRolls * sp.roll, balls: availableRolls * ballsPerRoll(sp) };
}

/** Código da ferramenta "Enrijecedor" na paleta (escolhe BS6 ou BS12 pela mola clicada). */
export const STIFF_TOOL = "BS";
