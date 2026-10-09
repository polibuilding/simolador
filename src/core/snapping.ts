// Posições candidatas (encaixe) para cada tipo de peça, já validadas.
import type { Catalog } from "./catalog";
import type { InventoryConfig } from "./inventory";
import { boardAt, boardSize, nearestBoard } from "./boards";
import {
  AXES, DEFAULT_BOARD, DIR_TOL, EPS, UP, type Board, type Model, boardsOf, type Vec3, add, addConnector, addMember, addPlate, addSupport, canonicalDir, cross, dot,
  findNodeAt, len, membersAt, directionFrom, norm, plateKey, samePos, scale, sidesAround, sub,
} from "./model";
import {
  inclineStep, validateConnector, validateMember, validatePlate, validateSupport,
  type Check, type ConnectorSpec, type PlateGeom,
} from "./rules";

export type Candidate =
  | { kind: "support"; code: string; pos: Vec3; check: Check }
  /** `inclined`: barra inclinada (fora dos eixos); não ganha ponto verde, aparece ao puxar o cursor a partir da esfera */
  | { kind: "member"; code: string; fromId: string; toPos: Vec3; check: Check; inclined?: boolean }
  | { kind: "plate"; code: string; geom: PlateGeom; check: Check }
  | { kind: "connector"; spec: ConnectorSpec; check: Check };

export const candidateCode = (c: Candidate) => (c.kind === "connector" ? c.spec.code : c.code);

/** Onde fica o marcador verde da candidata (em módulos). */
export function markerPos(model: Model, c: Candidate): Vec3 {
  switch (c.kind) {
    case "support": return c.pos;
    case "member": return c.toPos;
    case "plate": return scale(c.geom.corners.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3), 0.25);
    case "connector": return model.nodes[c.spec.node].pos;
  }
}

/** Ponto de onde a candidata "sai" (para barras: o nó de origem). */
export function anchorPos(model: Model, c: Candidate): Vec3 | null {
  return c.kind === "member" ? model.nodes[c.fromId].pos : null;
}

export function applyCandidate(model: Model, c: Candidate): Model {
  switch (c.kind) {
    case "support": return addSupport(model, c.pos).model;
    case "member": return addMember(model, c.code, c.fromId, c.toPos).model;
    case "plate": {
      const ids = c.geom.corners.map((p) => findNodeAt(model, p)!.id) as [string, string, string, string];
      return addPlate(model, c.code, ids).model;
    }
    case "connector": return addConnector(model, c.spec).model;
  }
}

/** Direções do vão de uma diagonal (a, b) nos três planos ortogonais, com sinais e as duas ordens. */
function cableOffsets(a: number, b: number): Vec3[] {
  const out: Vec3[] = [];
  const planes: [number, number][] = [[0, 1], [0, 2], [1, 2]];
  for (const [i, j] of planes) {
    for (const [p, q] of a === b ? [[a, b]] : [[a, b], [b, a]]) {
      for (const si of [1, -1]) for (const sj of [1, -1]) {
        const v: Vec3 = [0, 0, 0];
        v[i] = si * p;
        v[j] = sj * q;
        out.push(v);
      }
    }
  }
  return out;
}

/** Direções inclinadas: nos três planos da estrutura, em múltiplos do passo, sem os eixos. */
const dirCache = new Map<number, Vec3[]>();
export function inclinedDirs(stepDeg: number): Vec3[] {
  let out = dirCache.get(stepDeg);
  if (out) return out;
  out = [];
  if (!(stepDeg > 0)) return out;
  const seen = new Set<string>();
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as [number, number][]) {
    for (let a = 0; a < 360; a += stepDeg) {
      if (a % 90 === 0) continue;
      const v: Vec3 = [0, 0, 0];
      v[i] = Math.cos((a * Math.PI) / 180);
      v[j] = Math.sin((a * Math.PI) / 180);
      const k = v.map((x) => x.toFixed(5)).join(",");
      if (!seen.has(k)) (seen.add(k), out.push(v));
    }
  }
  dirCache.set(stepDeg, out);
  return out;
}

export interface CandidateOptions {
  /** oferecer barras inclinadas até pontos novos (passos de 15°); o fechamento entre esferas existentes vale sempre */
  inclined?: boolean;
}

export function memberCandidates(
  cat: Catalog, inv: InventoryConfig, model: Model, code: string, fromId: string, opts: CandidateOptions = {},
): Candidate[] {
  const piece = cat.pieces[code];
  const from = model.nodes[fromId];
  if (!piece || !from || !piece.spanM) return [];
  const mk = (toPos: Vec3, inclined = false): Candidate => ({
    kind: "member", code, fromId, toPos, inclined, check: validateMember(cat, inv, model, code, fromId, toPos),
  });
  if (piece.type === "cable") {
    const out = cableOffsets(piece.spanM[0], piece.spanM[1]).map((o) => mk(add(from.pos, o)));
    // painéis inclinados: esferas existentes à distância da diagonal (a regra confere o canto a 90°)
    const seen = new Set(out.map((c) => (c as { toPos: Vec3 }).toPos.map((v) => v.toFixed(3)).join(",")));
    const diag = Math.hypot(piece.spanM[0], piece.spanM[1]);
    const tol = cat.settings.tolerancia_encaixe_mm / cat.settings.modulo_mm;
    for (const n of Object.values(model.nodes)) {
      if (n.id === fromId || seen.has(n.pos.map((v) => v.toFixed(3)).join(","))) continue;
      if (Math.abs(len(sub(n.pos, from.pos)) - diag) <= tol) out.push(mk(n.pos));
    }
    return out;
  }
  const span = piece.spanM[0];
  const out = AXES.map((d) => mk(add(from.pos, scale(d, span))));
  const seen = new Set(out.map((c) => (c as { toPos: Vec3 }).toPos.join(",")));
  // fechar numa esfera existente à distância exata (triângulos, geodésicas)
  const tol = cat.settings.tolerancia_encaixe_mm / cat.settings.modulo_mm;
  for (const n of Object.values(model.nodes)) {
    if (n.id === fromId) continue;
    const d = Math.hypot(n.pos[0] - from.pos[0], n.pos[1] - from.pos[1], n.pos[2] - from.pos[2]);
    if (Math.abs(d - span) <= tol && !seen.has(n.pos.join(","))) {
      seen.add(n.pos.join(","));
      out.push(mk(n.pos, !AXES.some((a) => samePos(scale(a, span), [n.pos[0] - from.pos[0], n.pos[1] - from.pos[1], n.pos[2] - from.pos[2]], 1e-3))));
    }
  }
  // inclinadas até um ponto novo
  if (opts.inclined === false) return out;
  for (const d of inclinedDirs(inclineStep(cat))) {
    const p = add(from.pos, scale(d, span)).map((x) => Math.round(x * 1e4) / 1e4 + 0) as Vec3;
    if (seen.has(p.join(",")) || findNodeAt(model, p)) continue;
    out.push(mk(p, true));
  }
  return out;
}

export function plateCandidates(cat: Catalog, inv: InventoryConfig, model: Model, code: string): Candidate[] {
  const piece = cat.pieces[code];
  if (!piece?.spanM) return [];
  const [A, B] = piece.spanM;
  const tol = cat.settings.tolerancia_encaixe_mm / cat.settings.modulo_mm;
  const nodes = Object.values(model.nodes);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  // qualquer plano: esfera O, vizinhas U (a A módulos) e V (a B módulos) a 90°, e a quarta esfera em O + OU + OV
  for (const o of nodes) {
    const near = (d: number) => nodes.filter((n) => n.id !== o.id && Math.abs(len(sub(n.pos, o.pos)) - d) <= tol);
    const us = near(A);
    const vs = A === B ? us : near(B);
    for (const u of us) {
      for (const v of vs) {
        if (u.id === v.id) continue;
        const ou = sub(u.pos, o.pos);
        const ov = sub(v.pos, o.pos);
        if (Math.abs(dot(ou, ov)) / (len(ou) * len(ov)) > 1e-3) continue;
        const far = findNodeAt(model, add(o.pos, add(ou, ov)), Math.max(1e-3, tol));
        if (!far) continue;
        const key = plateKey([o.id, u.id, far.id, v.id]);
        if (seen.has(key)) continue;
        seen.add(key);
        const geom: PlateGeom = { corners: [o.pos, u.pos, far.pos, v.pos], normal: norm(cross(ou, ov)) };
        out.push({ kind: "plate", code, geom, check: validatePlate(cat, inv, model, code, geom) });
      }
    }
  }
  return out;
}

export function connectorCandidates(cat: Catalog, inv: InventoryConfig, model: Model, code: string, nodeId: string): Candidate[] {
  const n = model.nodes[nodeId];
  if (!n) return [];
  const bars = membersAt(model, nodeId).filter((m) => cat.pieces[m.code]?.type === "bar");
  const dirs = bars.map((m) => directionFrom(model, m, nodeId));
  const specs: ConnectorSpec[] = [];
  if (code === "RC90") {
    for (let i = 0; i < dirs.length; i++) {
      for (let j = i + 1; j < dirs.length; j++) {
        if (Math.abs(dot(dirs[i], dirs[j])) < DIR_TOL) specs.push({ code, node: nodeId, dirs: [dirs[i], dirs[j]] });
      }
    }
    if (n.kind === "support" && dirs.some((d) => Math.abs(d[1] - 1) < EPS)) {
      for (const side of [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]] as Vec3[]) {
        specs.push({ code, node: nodeId, dirs: [UP, side], base: true });
      }
    }
  } else if (code === "CC") {
    const has = (d: Vec3) => dirs.some((x) => Math.abs(dot(x, d) - 1) < DIR_TOL);
    const axes: Vec3[] = [];
    for (const d of dirs) {
      const ax = canonicalDir(d);
      if (has(ax) && has(scale(ax, -1)) && !axes.some((a) => samePos(a, ax, DIR_TOL))) axes.push(ax);
    }
    for (const ax of axes) {
      // os 4 lados em volta do par; lado com barra transversal fica de fora (L6)
      for (const side of sidesAround(ax)) if (!has(side)) specs.push({ code, node: nodeId, dirs: [ax], side });
    }
  } else if (code === "CC90") {
    const has = (d: Vec3) => dirs.some((x) => Math.abs(dot(x, d) - 1) < DIR_TOL);
    for (const c of Object.values(model.connectors)) {
      if (c.node !== nodeId || c.code !== "CC" || !c.side) continue;
      const ax = canonicalDir(norm(cross(c.dirs[0], c.side)).map((v) => Math.round(v * 1e6) / 1e6 + 0) as Vec3);
      if (has(ax) && has(scale(ax, -1))) specs.push({ code, node: nodeId, dirs: [ax], side: c.side });
    }
  }
  return specs.map((spec) => ({ kind: "connector" as const, spec, check: validateConnector(cat, inv, model, spec) }));
}

/** GC: ponto (em módulos) → posição encaixada na grade da chapa mais perto, ou livre. */
export function supportPosition(cat: Catalog, point: { x: number; z: number }, snap: boolean, boards: Board[] = [DEFAULT_BOARD]): Vec3 {
  const b = boardAt(cat, boards, point.x, point.z) ?? nearestBoard(cat, boards, point.x, point.z);
  const { w, d } = boardSize(cat);
  const cx = (v: number) => Math.min(b.x + w, Math.max(b.x, v));
  const cz = (v: number) => Math.min(b.z + d, Math.max(b.z, v));
  // a grade de cada chapa começa no canto dela
  if (snap) return [cx(b.x + Math.round(point.x - b.x)), 0, cz(b.z + Math.round(point.z - b.z))].map((v) => Math.round(v * 1e4) / 1e4 + 0) as Vec3;
  const r = (v: number) => Math.round(v * 100) / 100;
  return [r(point.x), 0, r(point.z)];
}

export function supportCandidate(cat: Catalog, inv: InventoryConfig, model: Model, pos: Vec3): Candidate {
  return { kind: "support", code: "GC", pos, check: validateSupport(cat, inv, model, pos) };
}

/** Ponto-guia para colocar uma GC: azul = a um vão de barra de outra GC num eixo; amarelo = vértice de triângulo. */
export interface SupportGuide {
  pos: Vec3;
  kind: "blue" | "yellow";
  text: string;
}

/**
 * Guias para a ligação de base:
 * - azul: a 4, 6 ou 12 módulos (vão de uma barra) de uma GC, nas direções X e Z;
 * - amarelo: o terceiro vértice de um triângulo equilátero (ou outro com todos os ângulos ≥ ao mínimo) cujos três lados
 *   são vãos de barra, apoiado em duas GC que já estão a um vão de barra uma da outra.
 * `ignore`: GC que estão sendo movidas (não servem de referência).
 */
export function supportGuides(cat: Catalog, inv: InventoryConfig, model: Model, ignore: Set<string> = new Set()): SupportGuide[] {
  const s = cat.settings;
  const tol = s.tolerancia_encaixe_mm / s.modulo_mm;
  const bars = Object.values(cat.pieces)
    .filter((p) => p.type === "bar" && p.spanM)
    .map((p) => ({ code: p.code, span: p.spanM![0] }));
  const gcs = Object.values(model.nodes).filter((n) => n.kind === "support" && !ignore.has(n.id));
  const out: SupportGuide[] = [];
  // cada cor tem seus pontos: um vértice de triângulo que também está a um vão de barra aparece nas duas
  const occupied = Object.values(model.nodes).map((n) => n.pos.map((v) => v.toFixed(3)).join(","));
  const taken = { blue: new Set(occupied), yellow: new Set(occupied) };
  const push = (pos: Vec3, kind: SupportGuide["kind"], text: string) => {
    const p = pos.map((v) => Math.round(v * 1e4) / 1e4 + 0) as Vec3;
    const k = p.map((v) => v.toFixed(3)).join(",");
    if (taken[kind].has(k) || !validateSupport(cat, inv, model, p, ignore).ok) return;
    taken[kind].add(k);
    out.push({ pos: p, kind, text });
  };
  const xz = (p: Vec3) => `(${[p[0], p[2]].map((v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })).join("; ")})`;
  for (const g of gcs) {
    for (const b of bars) {
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] as Vec3[]) {
        push(add(g.pos, scale(d, b.span)), "blue", `A ${b.span} M da GC ${xz(g.pos)}: cabe uma ${b.code} entre os pilares.`);
      }
    }
  }
  const minAng = (s.angulo_minimo_membros_graus * Math.PI) / 180 - 1e-6;
  const angle = (a: number, b: number, c: number) => Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - c * c) / (2 * a * b))));
  for (let i = 0; i < gcs.length; i++) {
    for (let j = i + 1; j < gcs.length; j++) {
      const p1 = gcs[i].pos;
      const p2 = gcs[j].pos;
      const d = Math.hypot(p2[0] - p1[0], p2[2] - p1[2]);
      const base = bars.find((b) => Math.abs(b.span - d) <= tol);
      if (!base) continue;
      for (const b1 of bars) {
        for (const b2 of bars) {
          const r1 = b1.span;
          const r2 = b2.span;
          if (r1 + r2 <= d + 1e-9 || Math.abs(r1 - r2) >= d) continue;
          // ângulos do triângulo: todos ≥ ao mínimo (as três vigas se encontram nos topos dos pilares)
          if (angle(r1, r2, d) < minAng || angle(d, r1, r2) < minAng || angle(d, r2, r1) < minAng) continue;
          const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
          const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
          const ux = (p2[0] - p1[0]) / d;
          const uz = (p2[2] - p1[2]) / d;
          for (const sg of [1, -1]) {
            const pos: Vec3 = [p1[0] + ux * a - sg * uz * h, 0, p1[2] + uz * a + sg * ux * h];
            const kind = r1 === r2 && r1 === base.span ? `triângulo equilátero de ${base.code}` : `triângulo ${b1.code}–${b2.code}–${base.code}`;
            push(pos, "yellow", `Vértice de ${kind} com as GC ${xz(p1)} e ${xz(p2)}.`);
          }
        }
      }
    }
  }
  return out;
}

/** Todas as candidatas de uma peça (para os marcadores verdes). GC: os cruzamentos da grade. */
export function allCandidates(cat: Catalog, inv: InventoryConfig, model: Model, code: string, opts: CandidateOptions = {}): Candidate[] {
  const t = cat.pieces[code]?.type;
  if (t === "support") {
    const out: Candidate[] = [];
    const seen = new Set<string>();
    for (const b of boardsOf(model)) {
      for (let x = 0; x <= cat.settings.chapa_modulos_x; x++) {
        for (let z = 0; z <= cat.settings.chapa_modulos_y; z++) {
          const p = [b.x + x, 0, b.z + z].map((v) => Math.round(v * 1e4) / 1e4 + 0) as Vec3;
          const k = p.join(",");
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(supportCandidate(cat, inv, model, p));
        }
      }
    }
    return out;
  }
  if (t === "plate") return plateCandidates(cat, inv, model, code);
  const ids = Object.keys(model.nodes);
  if (t === "connector") return ids.flatMap((id) => connectorCandidates(cat, inv, model, code, id));
  return ids.flatMap((id) => memberCandidates(cat, inv, model, code, id, opts));
}
