// Consultas com cache usadas pelo posicionamento (Placement e steps/): candidatas de encaixe, guias, caminhos e
// referências do Tab. Tudo indexado pela identidade do modelo: muda o modelo, recalcula.
import { catalog } from "../core/catalog";
import { alignStops, connectReach, locusCirclePoint, locusSpherePoint, locusStatus, nearestOnRing, nodeMoveOptions, sphereMeridianLimits, sphereRings, type LocusCircle, type LocusStatus, type NodeMove, type NodeMoveSet } from "../core/edit";
import { type GlobalMove } from "../core/globalMove";
import { supportReach, type ReachGuide } from "../core/reach";
import { type Clip, type PasteResult } from "../core/clipboard";
import { dot, findNodeAt, len, sub, type Model, type Vec3 } from "../core/model";
import { ropeRefs, type RopeRef } from "../core/rope";
import { allCandidates, anchorPos, barTriangleGuides, markerPos, supportGuides, type BarGuide, type Candidate, type SupportGuide } from "../core/snapping";
import { globalOf, useApp, type Tool } from "../ui/store";

export const SPOT_PX = 46;
export const CLICK_PX = 5;
export const DRAG_PX = 6;
/** canto superior direito da cena ocupado pelo cubo de visualização */
export const GIZMO_PX = 175;
/** canto inferior esquerdo ocupado pelos eixos X, Y, Z */
export const AXES_PX = 120;

export const key = (p: Vec3) => p.map((v) => v.toFixed(3)).join(",");

/** Preferência de direção para barras que saem de uma esfera: para cima, depois na horizontal, por último para baixo. */
export function dirRank(model: Model, c: Candidate) {
  const a = anchorPos(model, c);
  if (!a || c.kind !== "member") return 0;
  const dy = c.toPos[1] - a[1];
  return dy > 0 ? 0 : dy === 0 ? 1 : 2;
}

/** Ângulo de uma barra inclinada, em palavras ("30° com a horizontal", "30° em planta"); null se estiver num eixo. */
export function angleText(model: Model, c: Candidate): string | null {
  if (c.kind !== "member" || catalog.pieces[c.code]?.type !== "bar") return null;
  const v = sub(c.toPos, model.nodes[c.fromId].pos);
  const L = len(v);
  if (v.filter((x) => Math.abs(x) > 1e-6).length < 2) return null;
  const deg = (r: number) => Math.round((r * 180) / Math.PI);
  if (Math.abs(v[1]) < 1e-6) return `${deg(Math.atan2(Math.abs(v[2]), Math.abs(v[0])))}° em planta (a partir de X)`;
  return `${deg(Math.asin(Math.abs(v[1]) / L))}° com a horizontal`;
}

export interface Spot {
  pos: Vec3;
  ends: Candidate[]; // candidatas que terminam/ficam neste ponto
  starts: Candidate[]; // barras/diagonais que saem deste ponto (esfera existente)
}

// cache das candidatas: recalcula só quando muda o modelo, a peça ou o estoque
let cache: { model: Model; code: string; inv: unknown; inclined: boolean; cands: Candidate[]; spots: Map<string, Spot> } | null = null;
export function candidatesFor(model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"], inclined = false) {
  if (cache && cache.model === model && cache.code === code && cache.inv === inv && cache.inclined === inclined) return cache;
  const cands = allCandidates(catalog, inv, model, code, { inclined });
  const spots = new Map<string, Spot>();
  const get = (p: Vec3) => {
    const k = key(p);
    let s = spots.get(k);
    if (!s) spots.set(k, (s = { pos: p, ends: [], starts: [] }));
    return s;
  };
  for (const c of cands) {
    // inclinada até um ponto novo: não vira ponto de encaixe (apareceria em toda parte); surge ao puxar o cursor da esfera
    const free = c.kind === "member" && c.inclined && !findNodeAt(model, c.toPos);
    if (!free) get(markerPos(model, c)).ends.push(c);
    const a = anchorPos(model, c);
    if (a) get(a).starts.push(c);
  }
  cache = { model, code, inv, inclined, cands, spots };
  return cache;
}

// guias da GC (pontos azuis e amarelos): recalcula quando muda o modelo, o estoque ou o que está sendo movido
let guideCache: { model: Model; inv: unknown; key: string; guides: SupportGuide[] } | null = null;
export function guidesFor(model: Model, inv: ReturnType<typeof useApp.getState>["inventory"], ignore: Set<string> = new Set()) {
  const key = [...ignore].sort().join(",");
  if (guideCache && guideCache.model === model && guideCache.inv === inv && guideCache.key === key) return guideCache.guides;
  guideCache = { model, inv, key, guides: supportGuides(catalog, inv, model, ignore) };
  return guideCache.guides;
}

// fundação perto da estrutura: círculos na chapa onde uma mola (nova ou pendurada) chega até a GC
let reachCache: { model: Model; inv: unknown; r: ReachGuide[] } | null = null;
export function reachFor(model: Model, inv: ReturnType<typeof useApp.getState>["inventory"]) {
  if (reachCache && reachCache.model === model && reachCache.inv === inv) return reachCache.r;
  reachCache = { model, inv, r: supportReach(catalog, inv, model) };
  return reachCache.r;
}

// pontos amarelos de barras (triângulos a partir de uma esfera)
let barGuideCache: { model: Model; code: string; inv: unknown; anchor: string; guides: BarGuide[] } | null = null;
export function barGuidesFor(model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"], anchor: string) {
  const c = barGuideCache;
  if (c && c.model === model && c.code === code && c.inv === inv && c.anchor === anchor) return c.guides;
  barGuideCache = { model, code, inv, anchor, guides: barTriangleGuides(catalog, inv, model, code, anchor) };
  return barGuideCache.guides;
}

// ligação entre duas esferas (dois cliques): recalcula quando muda o modelo, a peça ou as esferas
let linkCache: { model: Model; code: string; inv: unknown; a: string; b: string; r: ReturnType<typeof connectReach> } | null = null;
export function linkFor(model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"], a: string, b: string) {
  const c = linkCache;
  if (c && c.model === model && c.code === code && c.inv === inv && c.a === a && c.b === b) return c.r;
  linkCache = { model, code, inv, a, b, r: connectReach(catalog, inv, model, code, a, b) };
  return linkCache.r;
}

/** Peças novas de `full` em relação a `base` (para o fantasma): o modelo só com elas e os nós novos. */
export function newPart(base: Model, full: Model): { part: Model; ids: Set<string> } {
  const members = Object.fromEntries(Object.entries(full.members).filter(([k]) => !base.members[k]));
  const used = new Set<string>();
  for (const m of Object.values(members)) (used.add(m.a), used.add(m.b));
  const nodes = Object.fromEntries(Object.entries(full.nodes).filter(([k]) => used.has(k)));
  return { part: { ...full, nodes, members, plates: {}, connectors: {} }, ids: new Set(Object.keys(nodes).filter((k) => !base.nodes[k])) };
}

/** distância na tela (px) para "pegar" um ponto amarelo de barra e para adotar a esfera de partida */
export const TRI_PX = 14;
export const TRI_ANCHOR_PX = 22;
/** depois do Tab, o cursor pode andar até aqui sem perder o ponto escolhido */
export const TAB_PX = 40;

// colar: recalcula só quando muda a posição na grade, o giro, o espelho ou a altura
export const paste: { cache: { base: Model; clip: Clip; key: string; r: PasteResult } | null } = { cache: null };

// referências nos cabos (K8): recalcula quando muda o modelo ou a primeira ponta
let refsCache: { model: Model; key: string; r: RopeRef[] } | null = null;
export function ropeRefsFor(model: Model, from?: Vec3): RopeRef[] {
  const key = from ? from.join(",") : "";
  if (refsCache && refsCache.model === model && refsCache.key === key) return refsCache.r;
  refsCache = { model, key, r: ropeRefs(catalog, model, from) };
  return refsCache.r;
}

// opções de "mover só o nó" (recalcula quando muda o modelo ou o nó)
let nodeMoveCache: { model: Model; nodeId: string; r: ReturnType<typeof nodeMoveOptions> } | null = null;
export function nodeOptionsFor(model: Model, nodeId: string) {
  if (nodeMoveCache && nodeMoveCache.model === model && nodeMoveCache.nodeId === nodeId) return nodeMoveCache.r;
  nodeMoveCache = { model, nodeId, r: nodeMoveOptions(catalog, model, nodeId) };
  return nodeMoveCache.r;
}

// movimento global (duplo clique): o que o conjunto escolhido deixa a peça fazer (caminho, livre ou travado)
export function globalFor(model: Model, tool: Extract<Tool, { kind: "moveBody" }>): GlobalMove {
  return globalOf(model, tool.ref, tool.level, tool.dofMode ?? 0);
}

/** Caminho de quem anda pelo azul: a esfera (mover só o nó) ou o conjunto (giro em torno das GC). */
export function pathFor(model: Model, tool: Tool): { set: NodeMoveSet; start: Vec3; lift: boolean; key: string } | null {
  if (tool.kind === "moveNode") {
    const n = model.nodes[tool.nodeId];
    if (!n) return null;
    return { set: nodeOptionsFor(model, tool.nodeId), start: n.pos, lift: n.kind === "support", key: `n:${tool.nodeId}` };
  }
  if (tool.kind === "moveBody") {
    const g = globalFor(model, tool);
    if (g.mode !== "path") return null;
    return { set: g.set, start: g.handle, lift: false, key: `b:${tool.ref.kind}:${tool.ref.id}:${tool.level}:${tool.dofMode ?? 0}` };
  }
  return null;
}

// trechos azuis e vermelhos do caminho (recalcula quando muda o modelo ou quem anda)
let locusCache: { model: Model; key: string; r: LocusStatus } | null = null;
export function locusStatusFor(model: Model, key: string, set: NodeMoveSet): LocusStatus {
  if (locusCache && locusCache.model === model && locusCache.key === key) return locusCache.r;
  locusCache = { model, key, r: locusStatus(set) };
  return locusCache.r;
}

/** Referência do Tab: um ponto do caminho ou, na esfera de uma mola, uma circunferência (a esfera desliza nela). */
export type TabStop = { pos: Vec3; label: string; ring?: LocusCircle };

/**
 * Referências do Tab num caminho: os limites azul ↔ vermelho e as posições (azuis) em que a peça pega ou as molas que
 * chegam nela ficam na horizontal ou na vertical, em ordem ao longo do caminho. Na esfera de uma mola, antes vêm as
 * circunferências (mesma altura, mesmo rumo, horizontal, verticais).
 */
export function tabStops(model: Model, tool: Tool, set: NodeMoveSet, key: string, toward: Vec3, start: Vec3): TabStop[] {
  const rings: TabStop[] = set.locus?.kind === "sphere" ? sphereRings(set.locus, start).map((x) => ({ pos: nearestOnRing(x.ring, start), label: x.label, ring: x.ring })) : [];
  return [...rings, ...pathStops(model, tool, set, key, toward)];
}

function pathStops(model: Model, tool: Tool, set: NodeMoveSet, key: string, toward: Vec3): TabStop[] {
  const loc = set.locus;
  if (!loc || !set.evalAt) return [];
  const tracked =
    set.tracked ??
    (tool.kind === "moveNode" ? Object.values(model.members).filter((m) => (m.a === tool.nodeId || m.b === tool.nodeId) && catalog.pieces[m.code]?.type === "bar").map((m) => m.id) : []);
  const out: { pos: Vec3; label: string; t: number }[] = [];
  let at: (t: number) => NodeMove | null;
  let posAt: (t: number) => Vec3;
  let t0 = 0;
  let t1 = 1;
  let n = 90;
  let paramOf: (p: Vec3) => number;
  let limits: Vec3[];
  if (loc.kind === "circle") {
    posAt = (t) => locusCirclePoint(loc, t);
    at = (t) => set.evalAt!(posAt(t));
    t1 = 2 * Math.PI;
    n = 144;
    paramOf = (p) => {
      const w = sub(p, loc.p);
      const t = Math.atan2(dot(w, loc.e2), dot(w, loc.e1));
      return t < 0 ? t + 2 * Math.PI : t;
    };
    limits = locusStatusFor(model, key, set).limits;
  } else if (loc.kind === "sphere") {
    const d = sub(toward, loc.c);
    const phi = Math.hypot(d[0], d[2]) < 1e-6 ? 0 : Math.atan2(d[2], d[0]);
    posAt = (t) => locusSpherePoint(loc, t, phi);
    at = (t) => set.evalAt!(posAt(t));
    t1 = Math.PI;
    paramOf = (p) => Math.acos(Math.max(-1, Math.min(1, (p[1] - loc.c[1]) / loc.r)));
    limits = sphereMeridianLimits(set, toward);
  } else if (loc.kind === "path" && set.evalParam) {
    const ev = set.evalParam;
    at = (t) => ev(t);
    posAt = (t) => ev(t)?.pos ?? loc.pts[Math.round(t)];
    t1 = Math.max(1, loc.pts.length - 1);
    n = Math.min(360, loc.pts.length - 1);
    paramOf = (p) => {
      let best = 0;
      let bd = Infinity;
      loc.pts.forEach((q, i) => {
        const dd = len(sub(q, p));
        if (dd < bd) (bd = dd), (best = i);
      });
      return best;
    };
    limits = locusStatusFor(model, key, set).limits;
  } else {
    return locusStatusFor(model, key, set).limits.map((p) => ({ pos: p, label: "Posição" }));
  }
  for (const p of limits) out.push({ pos: p, label: "Limite do trecho azul", t: paramOf(p) });
  const closed = loc.kind === "circle" || (loc.kind === "path" && loc.closed);
  for (const s of alignStops(catalog, at, t0, t1, n, tracked, closed)) {
    const mv = at(s.t);
    if (mv?.check.ok) out.push({ pos: loc.kind === "path" ? mv.pos : posAt(s.t), label: s.label, t: s.t });
  }
  out.sort((a, b) => a.t - b.t);
  return out.filter((s, i) => i === 0 || len(sub(s.pos, out[i - 1].pos)) > 1e-3);
}

/** A GC sendo colocada/movida "puxa" para um ponto-guia perto do cursor (na tela), em qualquer modo de encaixe. */
export const GUIDE_PX = 18;
/** com a grade desligada, os pontos azuis/amarelos puxam a GC de mais longe */
export const EXCLUSIVE_PX = 90;
