// Kit 3: cabo (corrente de bolinhas) e enrijecedor de mola.
//
// Montagem padrão do cabo, de uma esfera a outra (só tração):
//   esfera · CABLE C (ímã na esfera, anel na ponta) · CABLE CLIP C (anel numa ponta, bolinha do cabo na outra)
//   · cabo · CABLE CLIP C · CABLE C · esfera
// As ligações e os clipes entram sozinhos (2 de cada por cabo). O cabo vem num rolo (cabo_rolo_mm) e é cortado
// na montagem; cada pedaço é contado em bolinhas (régua do manual do Kit 3).
//
// Cabo preso em cabo (pendural, K7): um CABLE CLIP C prende uma bolinha do cabo principal pelo furo do meio e a
// bolinha da ponta do pendural. No modelo, essa bolinha vira um ponto de cabo (nó "clip") que divide o cabo principal
// em trechos do mesmo pedaço (`chain`); o pendural começa ali. Tudo fica esticado (1.x): reto entre os pontos.
import type { Catalog } from "./catalog";
import type { InventoryConfig } from "./inventory";
import type { Member, Model, Vec3 } from "./model";
import { add, chainOf, len, membersAt, scale, splitRope, sub } from "./model";

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
  /** pendural: da bolinha do cabo principal (no ponto de cabo) até a primeira bolinha do pendural (mm) */
  tap: number;
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
    tap: n("cabo_pendural_mm", 5),
  };
}

/**
 * Ponta de um trecho de cabo num nó: "sphere" (esfera ou GC: CABLE C + clip), "pass" (o cabo passa pelo ponto de
 * cabo; a bolinha fica no ponto) ou "tap" (pendural preso no ponto de cabo).
 */
export type RopeEnd = "sphere" | "pass" | "tap";

export function ropeEndAt(model: Model, m: Member, nodeId: string): RopeEnd {
  if (model.nodes[nodeId]?.kind !== "clip") return "sphere";
  return membersAt(model, nodeId).some((o) => o.id !== m.id && chainOf(o) === chainOf(m)) ? "pass" : "tap";
}

/** Quanto a ponta ocupa antes da primeira bolinha (mm). */
export const endMm = (sp: RopeSpec, e: RopeEnd) => (e === "sphere" ? sp.end : e === "tap" ? sp.tap : 0);

/**
 * Bolinhas de um trecho de `Lmm` (centro a centro dos nós): distância de cada uma até a ponta `a` (mm). Num ponto de
 * cabo a bolinha fica no ponto e as outras seguem dali; entre duas esferas, a sobra fica dividida nos esticadores.
 */
export function segmentBallOffsets(sp: RopeSpec, Lmm: number, ea: RopeEnd, eb: RopeEnd): number[] {
  const a0 = endMm(sp, ea);
  const room = Lmm - a0 - endMm(sp, eb);
  if (room < -1e-9) return [];
  const n = Math.floor(Math.max(0, room) / sp.pitch + 1e-9) + 1;
  const slack = Math.max(0, room) - (n - 1) * sp.pitch;
  const start = ea === "pass" ? a0 : eb === "pass" ? a0 + slack : ea === "tap" ? a0 : eb === "tap" ? a0 + slack : a0 + slack / 2;
  return Array.from({ length: n }, (_, i) => start + i * sp.pitch);
}

export interface RopeChain {
  /** id do pedaço (`chain` dos trechos) */
  id: string;
  code: string;
  /** trechos em ordem, de uma ponta à outra */
  members: string[];
  /** nós em ordem (um a mais que os trechos) */
  nodes: string[];
  /** pontas do pedaço */
  ends: [RopeEnd, RopeEnd];
  /** do centro da primeira bolinha ao da última (mm), antes de arredondar; null se curto demais */
  chainMm: number;
  balls: number;
  cutMm: number;
  /** pontos de cabo por onde o pedaço passa, com a bolinha (1 = a da primeira ponta) */
  points: { node: string; ball: number }[];
}

/** Pedaços de cabo do modelo (cada um com seus trechos em ordem). */
export function ropeChains(cat: Catalog, model: Model): RopeChain[] {
  const sp = ropeSpec(cat);
  const M = cat.settings.modulo_mm;
  const groups = new Map<string, Member[]>();
  for (const m of Object.values(model.members)) {
    if (!isRopeCode(cat, m.code) || !model.nodes[m.a] || !model.nodes[m.b]) continue;
    groups.set(chainOf(m), [...(groups.get(chainOf(m)) ?? []), m]);
  }
  const out: RopeChain[] = [];
  for (const [id, list] of groups) {
    // ordem: começa num nó que só um trecho toca
    const deg = new Map<string, number>();
    for (const m of list) for (const k of [m.a, m.b]) deg.set(k, (deg.get(k) ?? 0) + 1);
    let at = [...deg].find(([, d]) => d === 1)?.[0] ?? list[0].a;
    const nodes = [at];
    const members: string[] = [];
    const left = new Set(list.map((m) => m.id));
    while (left.size) {
      const m = list.find((x) => left.has(x.id) && (x.a === at || x.b === at));
      if (!m) break;
      left.delete(m.id);
      members.push(m.id);
      at = m.a === at ? m.b : m.a;
      nodes.push(at);
    }
    const first = model.members[members[0]];
    const last = model.members[members[members.length - 1]];
    const ends: [RopeEnd, RopeEnd] = [ropeEndAt(model, first, nodes[0]), ropeEndAt(model, last, nodes[nodes.length - 1])];
    const segMm = members.map((_, i) => len(sub(model.nodes[nodes[i + 1]].pos, model.nodes[nodes[i]].pos)) * M);
    const chainMm = segMm.reduce((s, v) => s + v, 0) - endMm(sp, ends[0]) - endMm(sp, ends[1]);
    const balls = chainMm >= sp.pitch - 1e-9 ? Math.floor(chainMm / sp.pitch + 1e-9) + 1 : 0;
    const points: RopeChain["points"] = [];
    let d = -endMm(sp, ends[0]);
    for (let i = 1; i < nodes.length - 1; i++) {
      d += segMm[i - 1];
      points.push({ node: nodes[i], ball: Math.round(d / sp.pitch) + 1 });
    }
    out.push({ id, code: first.code, members, nodes, ends, chainMm, balls, cutMm: balls * sp.pitch, points });
  }
  return out;
}

/** Pedaço de cabo de um membro. */
export const ropeChainOf = (cat: Catalog, model: Model, memberId: string) => {
  const m = model.members[memberId];
  return m ? ropeChains(cat, model).find((c) => c.id === chainOf(m)) ?? null : null;
};

/** Uma bolinha de um trecho de cabo: posição (módulos) e número no pedaço (1 = a da primeira ponta). */
export interface RopeBall {
  member: string;
  pos: Vec3;
  ball: number;
}

/** Bolinhas de um trecho (para destacar sob o cursor e escolher onde prender outro cabo). */
export function ropeBalls(cat: Catalog, model: Model, memberId: string, chains?: RopeChain[]): RopeBall[] {
  const m = model.members[memberId];
  if (!m) return [];
  const sp = ropeSpec(cat);
  const M = cat.settings.modulo_mm;
  const ch = (chains ?? ropeChains(cat, model)).find((c) => c.id === chainOf(m));
  if (!ch) return [];
  const i = ch.members.indexOf(m.id);
  const A = model.nodes[ch.nodes[i]].pos;
  const B = model.nodes[ch.nodes[i + 1]].pos;
  const Lmm = len(sub(B, A)) * M;
  if (Lmm < 1e-9) return [];
  // distância (mm) ao longo do pedaço até o começo deste trecho
  let d0 = -endMm(sp, ch.ends[0]);
  for (let k = 0; k < i; k++) d0 += len(sub(model.nodes[ch.nodes[k + 1]].pos, model.nodes[ch.nodes[k]].pos)) * M;
  const ea = i === 0 ? ch.ends[0] : "pass";
  const eb = i === ch.members.length - 1 ? ch.ends[1] : "pass";
  const u = scale(sub(B, A), 1 / Lmm);
  return segmentBallOffsets(sp, Lmm, ea, eb).map((o) => ({ member: m.id, pos: add(A, scale(u, o)), ball: Math.round((d0 + o) / sp.pitch) + 1 }));
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

/**
 * Pedaço de cabo entre esferas em `a` e `b` (módulos). null: curto demais para as ligações das duas pontas.
 * `ends`: pontas num ponto de cabo (pendural: "tap").
 */
export function ropeInfo(cat: Catalog, a: Vec3, b: Vec3, ends: [RopeEnd, RopeEnd] = ["sphere", "sphere"]): RopeInfo | null {
  const sp = ropeSpec(cat);
  const centerMm = len(sub(b, a)) * cat.settings.modulo_mm;
  const chainMm = centerMm - endMm(sp, ends[0]) - endMm(sp, ends[1]);
  if (chainMm < sp.pitch) return null; // pelo menos duas bolinhas
  const balls = Math.floor(chainMm / sp.pitch + 1e-9) + 1;
  return { centerMm, chainMm, balls, cutMm: balls * sp.pitch, slackMm: chainMm - (balls - 1) * sp.pitch };
}

/** menor distância entre esferas (ou pontos de cabo) para caber um cabo (mm) */
export const ropeMinMm = (cat: Catalog, ends: [RopeEnd, RopeEnd] = ["sphere", "sphere"]) => {
  const sp = ropeSpec(cat);
  return endMm(sp, ends[0]) + endMm(sp, ends[1]) + sp.pitch;
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
  // um corte por pedaço (o cabo principal de uma ponte pênsil é um pedaço só, com os pendurais presos nele)
  for (const ch of ropeChains(cat, model)) if (ch.balls) cuts.push({ id: ch.id, balls: ch.balls, cutMm: ch.cutMm });
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

/** Onde fica uma ponta de um cabo novo: num nó (esfera, GC ou ponto de cabo) ou numa bolinha de um cabo. */
export type RopePick = { node: string } | RopeBall;

/**
 * Cabo novo entre duas pontas. Ponta numa bolinha de cabo: o cabo é dividido ali (ponto de cabo, K7) e o cabo novo
 * vira um pendural preso nele. Tudo esticado. `clips`: pontos de cabo novos.
 */
export function ropeLink(model: Model, code: string, a: RopePick, b: RopePick): { model: Model; a: string; b: string; id: string; clips: string[] } {
  let m = model;
  const clips: string[] = [];
  const place = (p: RopePick): string => {
    if ("node" in p) return p.node;
    // o trecho pode ter sido dividido pela outra ponta: vale o trecho do mesmo pedaço mais perto da bolinha
    const orig = model.members[p.member];
    const seg = Object.values(m.members)
      .filter((x) => chainOf(x) === chainOf(orig))
      .map((x) => ({ x, d: segDist(m.nodes[x.a].pos, m.nodes[x.b].pos, p.pos) }))
      .sort((u, v) => u.d - v.d)[0]?.x;
    const at = Object.values(m.nodes).find((n) => len(sub(n.pos, p.pos)) < 1e-3);
    if (at) return at.id;
    const r = splitRope(m, seg.id, p.pos);
    m = r.model;
    clips.push(r.id);
    return r.id;
  };
  const ia = place(a);
  const ib = place(b);
  const id = `m${m.nextId}`;
  m = { ...m, nextId: m.nextId + 1, members: { ...m.members, [id]: { id, code, a: ia, b: ib } } };
  return { model: m, a: ia, b: ib, id, clips };
}

/** Distância de um ponto a um segmento. */
function segDist(a: Vec3, b: Vec3, p: Vec3): number {
  const d = sub(b, a);
  const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / L2)) : 0;
  return len(sub(p, add(a, scale(d, t))));
}

/** Bolinha-referência num cabo, para prender outro cabo: verde (na vertical de uma esfera) ou amarela (meio, perpendicular). */
export interface RopeRef extends RopeBall {
  kind: "green" | "yellow";
  text: string;
}

/**
 * Referências nos cabos (K8), como os pontos verdes e amarelos das barras:
 * - verde: a bolinha na vertical de uma esfera ou GC (o pendural sai a prumo até ela);
 * - amarela: a do meio do cabo e, com a primeira ponta já escolhida em `from`, a mais perto dela (pendural
 *   perpendicular ao cabo).
 */
export function ropeRefs(cat: Catalog, model: Model, from?: Vec3): RopeRef[] {
  const out: RopeRef[] = [];
  const chains = ropeChains(cat, model);
  const fmt = (p: Vec3) => `(${[p[0], p[2], p[1]].map((v) => +v.toFixed(2)).join("; ")})`;
  const tolPlan = 0.3; // módulos: a bolinha fica a menos disso da vertical da esfera
  for (const ch of chains) {
    const balls = ch.members.flatMap((id) => ropeBalls(cat, model, id, chains));
    if (!balls.length) continue;
    const add1 = (b: RopeBall, kind: RopeRef["kind"], text: string) => {
      if (!out.some((r) => len(sub(r.pos, b.pos)) < 1e-6)) out.push({ ...b, kind, text });
    };
    for (const n of Object.values(model.nodes)) {
      if (n.kind === "clip" || ch.nodes.includes(n.id)) continue;
      let best: { b: RopeBall; d: number } | null = null;
      for (const b of balls) {
        const d = Math.hypot(b.pos[0] - n.pos[0], b.pos[2] - n.pos[2]);
        if (Math.abs(b.pos[1] - n.pos[1]) > 0.5 && (!best || d < best.d)) best = { b, d };
      }
      if (best && best.d < tolPlan) add1(best.b, "green", `na vertical ${n.kind === "support" ? "da GC" : "da esfera"} ${fmt(n.pos)}`);
    }
    const mid = balls.find((b) => b.ball === Math.ceil(ch.balls / 2));
    if (mid) add1(mid, "yellow", `meio do cabo (bolinha ${mid.ball} de ${ch.balls})`);
    if (from) {
      const b = balls.reduce((x, y) => (len(sub(x.pos, from)) <= len(sub(y.pos, from)) ? x : y));
      if (b.ball > 1 && b.ball < ch.balls) add1(b, "yellow", "pendural perpendicular ao cabo");
    }
  }
  return out;
}

/** Enrijecedor que serve na mola `code` (B6 → BS6, B12 → BS12); null se não há. */
export function stiffenerFor(cat: Catalog, code: string): string | null {
  const span = cat.pieces[code]?.type === "bar" ? cat.pieces[code].spanM?.[0] : undefined;
  if (span == null) return null;
  const s = Object.values(cat.pieces).find((p) => p.type === "stiffener" && p.spanM?.[0] === span);
  return s?.code ?? null;
}

/**
 * Peças que entram sozinhas com os cabos e os enrijecedores (para o estoque e o resumo): cada ponta numa esfera usa
 * uma CABLE C e um CABLE CLIP C; cada ponto de cabo, um CABLE CLIP C (prende a bolinha do cabo principal e a do
 * pendural).
 */
export function kit3Usage(cat: Catalog, model: Model): Record<string, number> {
  const u: Record<string, number> = {};
  const inc = (k: string, n = 1) => (u[k] = (u[k] ?? 0) + n);
  let ropes = false;
  for (const m of Object.values(model.members)) {
    if (isRopeCode(cat, m.code)) ropes = true;
    else if (m.stiff) {
      const s = stiffenerFor(cat, m.code);
      if (s) inc(s);
    }
  }
  if (ropes) {
    const chains = ropeChains(cat, model);
    const sphereEnds = chains.reduce((s, c) => s + c.ends.filter((e) => e === "sphere").length, 0);
    const clips = Object.values(model.nodes).filter((n) => n.kind === "clip").length;
    inc(ROPE_CONN, sphereEnds);
    inc(ROPE_CLIP, sphereEnds + clips);
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
