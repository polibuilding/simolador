// Posições candidatas (encaixe) para cada tipo de peça, já validadas.
import type { Catalog } from "./catalog";
import type { InventoryConfig } from "./inventory";
import {
  AXES, EPS, UP, type Model, type Vec3, add, addConnector, addMember, addPlate, addSupport, cross, dot, findNodeAt,
  membersAt, directionFrom, plateKey, samePos, scale,
} from "./model";
import {
  inclineStep, plateCorners, validateConnector, validateMember, validatePlate, validateSupport,
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
  if (piece.type === "cable") return cableOffsets(piece.spanM[0], piece.spanM[1]).map((o) => mk(add(from.pos, o)));
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
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const pairs: [number, number][] = [[0, 1], [0, 2], [1, 2]];
  for (const n of Object.values(model.nodes)) {
    for (const [i, j] of pairs) {
      for (const [a, b] of A === B ? [[A, B]] : [[A, B], [B, A]]) {
        for (const si of [1, -1]) for (const sj of [1, -1]) {
          const u: Vec3 = [0, 0, 0];
          const v: Vec3 = [0, 0, 0];
          u[i] = si;
          v[j] = sj;
          const geom = plateCorners(n.pos, u, a, v, b);
          const nodes = geom.corners.map((p) => findNodeAt(model, p));
          if (nodes.some((x) => !x)) continue; // só vãos com as 4 esferas
          const key = plateKey(nodes.map((x) => x!.id));
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ kind: "plate", code, geom, check: validatePlate(cat, inv, model, code, geom) });
        }
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
        if (Math.abs(dot(dirs[i], dirs[j])) < EPS) specs.push({ code, node: nodeId, dirs: [dirs[i], dirs[j]] });
      }
    }
    if (n.kind === "support" && dirs.some((d) => Math.abs(d[1] - 1) < EPS)) {
      for (const side of [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]] as Vec3[]) {
        specs.push({ code, node: nodeId, dirs: [UP, side], base: true });
      }
    }
  } else if (code === "CC") {
    const has = (d: Vec3) => dirs.some((x) => Math.abs(dot(x, d) - 1) < EPS);
    for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[]) {
      if (!(has(ax) && has(scale(ax, -1)))) continue;
      // os 4 lados perpendiculares ao par; lado com barra transversal fica de fora (L6)
      for (const side of AXES.filter((s) => Math.abs(dot(s, ax)) < EPS)) {
        if (!has(side)) specs.push({ code, node: nodeId, dirs: [ax], side });
      }
    }
  } else if (code === "CC90") {
    const has = (d: Vec3) => dirs.some((x) => Math.abs(dot(x, d) - 1) < EPS);
    for (const c of Object.values(model.connectors)) {
      if (c.node !== nodeId || c.code !== "CC" || !c.side) continue;
      const ax = cross(c.dirs[0], c.side).map(Math.abs) as Vec3;
      if (has(ax) && has(scale(ax, -1))) specs.push({ code, node: nodeId, dirs: [ax], side: c.side });
    }
  }
  return specs.map((spec) => ({ kind: "connector" as const, spec, check: validateConnector(cat, inv, model, spec) }));
}

/** GC: ponto da chapa (em módulos) → posição encaixada (grade) ou livre. */
export function supportPosition(cat: Catalog, point: { x: number; z: number }, snap: boolean): Vec3 {
  const s = cat.settings;
  const cx = (v: number) => Math.min(s.chapa_modulos_x, Math.max(0, v));
  const cz = (v: number) => Math.min(s.chapa_modulos_y, Math.max(0, v));
  if (snap) return [cx(Math.round(point.x)), 0, cz(Math.round(point.z))];
  const r = (v: number) => Math.round(v * 100) / 100;
  return [r(point.x), 0, r(point.z)];
}

export function supportCandidate(cat: Catalog, inv: InventoryConfig, model: Model, pos: Vec3): Candidate {
  return { kind: "support", code: "GC", pos, check: validateSupport(cat, inv, model, pos) };
}

/** Todas as candidatas de uma peça (para os marcadores verdes). GC: os cruzamentos da grade. */
export function allCandidates(cat: Catalog, inv: InventoryConfig, model: Model, code: string, opts: CandidateOptions = {}): Candidate[] {
  const t = cat.pieces[code]?.type;
  if (t === "support") {
    const out: Candidate[] = [];
    for (let x = 0; x <= cat.settings.chapa_modulos_x; x++) {
      for (let z = 0; z <= cat.settings.chapa_modulos_y; z++) out.push(supportCandidate(cat, inv, model, [x, 0, z]));
    }
    return out;
  }
  if (t === "plate") return plateCandidates(cat, inv, model, code);
  const ids = Object.keys(model.nodes);
  if (t === "connector") return ids.flatMap((id) => connectorCandidates(cat, inv, model, code, id));
  return ids.flatMap((id) => memberCandidates(cat, inv, model, code, id, opts));
}
