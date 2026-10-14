// Editar peças já colocadas: retirar, girar, mover estrutura.
import type { Catalog } from "./catalog";
import type { InventoryConfig } from "./inventory";
import { frameRadAt } from "./boards";
import {
  AXES, addMember, boardsOf, rotDir, toDisp, type Member, type Model, type Vec3, add, componentOf, cross, directionFrom, dot, len, membersAt, norm, removeConnector,
  removeMember, removeNode, removePlate, samePos, scale, sub, transformNodes,
} from "./model";
import { inclineStep as inclineStepOf, segmentHitsPlate, validateMember, validateMovedModel, type Check } from "./rules";
import {
  applyCandidate, connectorCandidates, inclinedDirs, markerPos, memberCandidates, plateCandidates, type Candidate,
} from "./snapping";

export type Sel = { kind: "node" | "member" | "plate" | "connector"; id: string };

export function codeOf(model: Model, sel: Sel): string | null {
  if (sel.kind === "member") return model.members[sel.id]?.code ?? null;
  if (sel.kind === "plate") return model.plates[sel.id]?.code ?? null;
  if (sel.kind === "connector") return model.connectors[sel.id]?.code ?? null;
  const n = model.nodes[sel.id];
  return n ? (n.kind === "support" ? "GC" : "C") : null;
}

export function removeSelection(model: Model, sel: Sel): Model {
  switch (sel.kind) {
    case "member": return removeMember(model, sel.id);
    case "plate": return removePlate(model, sel.id);
    case "connector": return removeConnector(model, sel.id);
    case "node": return removeNode(model, sel.id);
  }
}

export interface EditResult {
  model?: Model;
  error?: string;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b));
const without = <T,>(rec: Record<string, T>, id: string) => Object.fromEntries(Object.entries(rec).filter(([k]) => k !== id));

/** Próxima candidata válida depois da atual (em ciclo). */
function nextOf(cands: Candidate[], isCurrent: (c: Candidate) => boolean): Candidate | undefined {
  const valid = cands.filter((c) => c.check.ok);
  if (!valid.length) return undefined;
  const i = valid.findIndex(isCurrent);
  const next = valid[(i + 1) % valid.length];
  return next && !isCurrent(next) ? next : undefined;
}

/**
 * Gira uma peça já colocada:
 * barra/diagonal → próxima direção livre em torno de uma das pontas;
 * placa → próxima posição livre mais perto; ligação → próximo canto livre na mesma esfera;
 * nó (GC ou esfera) → a estrutura inteira 90° em torno dele.
 */
export function rotateSelection(cat: Catalog, inv: InventoryConfig, model: Model, sel: Sel, opts: { inclined?: boolean } = {}): EditResult {
  if (sel.kind === "node") return rotateGroup(cat, model, sel.id, 1);
  const inv2: InventoryConfig = { ...inv, unlimited: true }; // a peça já saiu do estoque
  if (sel.kind === "member") {
    const m = model.members[sel.id];
    if (!m) return {};
    for (const anchor of [m.a, m.b]) {
      const base: Model = { ...model, members: without(model.members, m.id) };
      const otherPos = model.nodes[anchor === m.a ? m.b : m.a].pos;
      const cands = memberCandidates(cat, inv2, base, m.code, anchor, opts);
      const cur = (c: Candidate) => c.kind === "member" && samePos(c.toPos, otherPos);
      // a ponta livre (esfera que só servia a esta peça) vai junto
      const next = nextOf(cands, cur);
      const removed = removeMember(model, m.id);
      if (next && removed.nodes[anchor]) return { model: applyCandidate(removed, next) };
    }
    return { error: "Não há outra direção livre para girar esta peça." };
  }
  if (sel.kind === "plate") {
    const p = model.plates[sel.id];
    if (!p) return {};
    const base: Model = { ...model, plates: without(model.plates, p.id) };
    const corners = p.corners.map((id) => model.nodes[id].pos);
    const center = corners.reduce((s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4, s[2] + q[2] / 4] as Vec3, [0, 0, 0] as Vec3);
    const cands = plateCandidates(cat, inv2, base, p.code).filter((c) => c.check.ok);
    cands.sort((x, y) => dist(markerPos(base, x), center) - dist(markerPos(base, y), center));
    const same = (c: Candidate) => c.kind === "plate" && c.geom.corners.every((q) => corners.some((r) => samePos(r, q)));
    const next = cands.find((c) => !same(c));
    return next ? { model: applyCandidate(base, next) } : { error: "Não há outra posição livre para esta placa." };
  }
  const c = model.connectors[sel.id];
  if (!c) return {};
  const base: Model = { ...model, connectors: without(model.connectors, c.id) };
  const cands = connectorCandidates(cat, inv2, base, c.code, c.node);
  const cur = (x: Candidate) =>
    x.kind === "connector" && !!x.spec.base === !!c.base && x.spec.dirs.every((d) => c.dirs.some((e) => samePos(d, e))) &&
    (!c.side || (!!x.spec.side && samePos(x.spec.side, c.side)));
  const next = nextOf(cands, cur);
  return next ? { model: applyCandidate(base, next) } : { error: "Esta ligação não tem outro canto livre nesta esfera." };
}

/** Depois de girar: a peça nova que ocupa o lugar da selecionada (para continuar girando com R). */
export function selAfter(before: Model, after: Model, sel: Sel): Sel | null {
  if (sel.kind === "node") return after.nodes[sel.id] ? sel : null;
  const key = sel.kind === "member" ? "members" : sel.kind === "plate" ? "plates" : "connectors";
  const id = Object.keys(after[key]).find((k) => !before[key][k]);
  return id ? { kind: sel.kind, id } : null;
}

/** Gira a estrutura conectada ao nó em torno do centro dela (eixo vertical), `turns` × 90°. */
export function rotateGroup(cat: Catalog, model: Model, nodeId: string, turns: number): EditResult {
  const r = moveGroup(cat, model, nodeId, [0, 0, 0], turns);
  return r.check.ok ? { model: r.model } : { error: r.check.errors[0] };
}

/** Estrutura conectada ao nó, girada `turns` × 90° em torno do centro e deslocada `delta` (módulos). */
export function moveGroup(cat: Catalog, model: Model, nodeId: string, delta: Vec3, turns: number) {
  const ids = componentOf(model, nodeId);
  // gira em torno do centro da estrutura (arredondado à grade), para ela não "fugir" da chapa
  const ps = [...ids].map((i) => model.nodes[i].pos);
  const mid = (k: 0 | 2) => Math.round((Math.min(...ps.map((p) => p[k])) + Math.max(...ps.map((p) => p[k]))) / 2);
  const pivot: Vec3 = [mid(0), 0, mid(2)];
  const next = transformNodes(model, ids, pivot, turns, delta);
  return { model: next, ids, check: validateMovedModel(cat, next, ids) };
}

/** Remove várias peças de uma vez (as que já sumiram junto com outras são ignoradas). */
export function removeMany(model: Model, sels: Sel[]): Model {
  // ligações e placas primeiro, depois membros, por último nós
  const order = { connector: 0, plate: 1, member: 2, node: 3 } as const;
  let m = model;
  for (const s of [...sels].sort((a, b) => order[a.kind] - order[b.kind])) {
    const exists =
      s.kind === "node" ? m.nodes[s.id] : s.kind === "member" ? m.members[s.id] : s.kind === "plate" ? m.plates[s.id] : m.connectors[s.id];
    if (exists) m = removeSelection(m, s);
  }
  return m;
}

// ---------------- Mover só o nó: as barras acompanham, girando em torno das pontas fixas ----------------

export interface NodeMove {
  pos: Vec3;
  model: Model;
  /** nós que se movem (o nó e as partes soltas presas só a ele) */
  ids: Set<string>;
  check: Check;
}

/**
 * Posições possíveis para um nó sem mexer o resto da estrutura.
 * - As partes presas só a esse nó (sem ligação de base) vão junto, sem girar.
 * - Cada barra/diagonal que liga o nó a uma parte fixa mantém o comprimento: gira em torno da ponta fixa.
 *   1 barra → esfera (direções dos eixos e passos de 15°); 2 → círculo (passos de 15°); 3 ou mais → até 2 pontos.
 * - Ligação de base fica na chapa (y = 0).
 * - Rigidez: RC90/CC/CC90 numa barra que giraria travam o ângulo; placa presa a partes fixas trava o nó.
 */
export interface NodeMoveSet {
  options: NodeMove[];
  locked?: string;
  /** avalia o nó numa posição qualquer (null se as barras não deixam) */
  evalAt?: (p: Vec3) => NodeMove | null;
  /** ponto possível mais perto de um alvo */
  nearest?: (p: Vec3) => Vec3 | null;
  /** onde o nó pode ficar (para desenhar): superfície de esfera, círculo ou alguns pontos */
  locus?: NodeLocus;
  /** como `nearest`, com mais um vínculo: o nó a `L` módulos de `c` (para ligar uma mola nova até ele) */
  nearestWith?: (extra: { c: Vec3; L: number }, target: Vec3) => Vec3 | null;
}

export type NodeLocus =
  | { kind: "sphere"; c: Vec3; r: number }
  | { kind: "circle"; p: Vec3; h: number; e1: Vec3; e2: Vec3 }
  | { kind: "points"; pts: Vec3[] };

export function nodeMoveOptions(cat: Catalog, model: Model, nodeId: string): NodeMoveSet {
  const node = model.nodes[nodeId];
  if (!node) return { options: [], locked: "Nó não encontrado." };
  const s = cat.settings;
  const fmtP = (p: Vec3) => `(${toDisp(p).map((v) => +v.toFixed(2)).join("; ")})`;

  // componentes do resto da estrutura sem o nó: as sem GC vão junto com ele
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === nodeId || b === nodeId) return;
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  // cabos (Kit 3) não seguram a forma: esticam ou encolhem com o nó (o pedaço é recortado)
  const rigid = Object.values(model.members).filter((m) => cat.pieces[m.code]?.type !== "rope");
  for (const m of rigid) link(m.a, m.b);
  for (const p of Object.values(model.plates)) for (let i = 0; i < 4; i++) link(p.corners[i], p.corners[(i + 1) % 4]);
  const moving = new Set<string>([nodeId]);
  const seen = new Set<string>([nodeId]);
  for (const start of Object.keys(model.nodes)) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      for (const nb of adj.get(k) ?? []) if (!seen.has(nb)) (seen.add(nb), stack.push(nb));
    }
    // só conta como "pendurada no nó" se encosta nele
    const touches = rigid.some((m) => (m.a === nodeId && comp.includes(m.b)) || (m.b === nodeId && comp.includes(m.a)));
    const grounded = comp.some((k) => model.nodes[k].kind === "support");
    if (touches && !grounded) comp.forEach((k) => moving.add(k));
  }

  // vínculos: peças entre o nó e as partes fixas
  const ties = rigid.filter((m) => (m.a === nodeId && !moving.has(m.b)) || (m.b === nodeId && !moving.has(m.a)));
  if (!ties.length) return { options: [], locked: "Esse nó não está preso a nenhuma parte fixa: use Mover estrutura." };
  for (const p of Object.values(model.plates)) {
    const inside = p.corners.filter((c) => moving.has(c)).length;
    if (inside && inside < 4) return { options: [], locked: `A placa ${p.code} prende esse nó às partes fixas: tire a placa para mover só o nó.` };
  }
  // rigidez das ligações
  const tieDir = (m: Member, at: string) => directionFrom(model, m, at);
  const touchesDir = (c: { code: string; dirs: Vec3[] }, d: Vec3) =>
    c.code === "RC90" ? c.dirs.some((x) => samePos(x, d, 1e-3)) : c.dirs.some((x) => Math.abs(Math.abs(dot(x, d)) - 1) < 1e-3);
  for (const m of ties) {
    const other = m.a === nodeId ? m.b : m.a;
    for (const c of Object.values(model.connectors)) {
      const here = c.node === nodeId && touchesDir(c, tieDir(m, nodeId));
      const there = c.node === other && touchesDir(c, tieDir(m, other));
      if (here || there) {
        return { options: [], locked: `A ${c.code} em ${fmtP(model.nodes[c.node].pos)} trava esse ângulo: tire a ligação para mover só o nó.` };
      }
    }
  }

  // posições possíveis
  const cons = ties.map((m) => {
    const c = model.nodes[m.a === nodeId ? m.b : m.a].pos;
    return { c, L: len(sub(node.pos, c)) };
  });
  const support = node.kind === "support";
  const step = (inclineStepOf(cat) || 15) * (Math.PI / 180);
  const pts: Vec3[] = [];
  const perpBasis = (u: Vec3, ref: Vec3): [Vec3, Vec3] => {
    let e1 = sub(ref, scale(u, dot(ref, u)));
    if (len(e1) < 1e-6) e1 = Math.abs(u[1]) < 0.9 ? cross(u, [0, 1, 0]) : cross(u, [1, 0, 0]);
    e1 = norm(e1);
    return [e1, norm(cross(u, e1))];
  };
  // A·cosθ + B·sinθ = C
  const solve = (A: number, B: number, C: number) => {
    const R = Math.hypot(A, B);
    if (R < 1e-9 || Math.abs(C) > R + 1e-9) return [] as number[];
    const base = Math.atan2(B, A);
    const d = Math.acos(Math.max(-1, Math.min(1, C / R)));
    return d < 1e-9 ? [base] : [base + d, base - d];
  };
  const onCircle = (p: Vec3, h: number, e1: Vec3, e2: Vec3, t: number): Vec3 => add(p, add(scale(e1, h * Math.cos(t)), scale(e2, h * Math.sin(t))));
  const circleOf = (a: { c: Vec3; L: number }, b: { c: Vec3; L: number }) => {
    const v = sub(b.c, a.c);
    const d = len(v);
    if (d < 1e-9) return null;
    const u = scale(v, 1 / d);
    const x = (a.L * a.L - b.L * b.L + d * d) / (2 * d);
    const h2 = a.L * a.L - x * x;
    if (h2 < -1e-9) return null;
    const p = add(a.c, scale(u, x));
    const [e1, e2] = perpBasis(u, sub(node.pos, p));
    return { p, h: Math.sqrt(Math.max(0, h2)), e1, e2 };
  };
  if (cons.length === 1) {
    const { c, L } = cons[0];
    if (support) {
      if (c[1] >= L) return { options: [], locked: "A barra é vertical e do tamanho da altura: a ligação de base não tem para onde ir sozinha." };
      const r = Math.sqrt(L * L - c[1] * c[1]);
      for (let k = 0; k < 24; k++) pts.push([c[0] + r * Math.cos(k * step), 0, c[2] + r * Math.sin(k * step)]);
    } else {
      const fr = frameRadAt(cat, boardsOf(model), c[0], c[2]);
      for (const d of [...AXES, ...inclinedDirs(inclineStepOf(cat) || 15)]) pts.push(add(c, scale(rotDir(d, fr), L)));
    }
  } else {
    const circ = circleOf(cons[0], cons[1]);
    if (!circ) return { options: [], locked: "As barras não deixam esse nó sair do lugar." };
    const { p, h, e1, e2 } = circ;
    let ts: number[];
    if (support) ts = solve(h * e1[1], h * e2[1], -p[1]);
    else if (cons.length === 2) ts = Array.from({ length: Math.round((2 * Math.PI) / step) }, (_, k) => k * step);
    else {
      const w = sub(p, cons[2].c);
      ts = solve(2 * h * dot(w, e1), 2 * h * dot(w, e2), cons[2].L * cons[2].L - dot(w, w) - h * h);
    }
    for (const t of ts) pts.push(onCircle(p, h, e1, e2, t));
  }

  const tol = s.tolerancia_encaixe_mm / s.modulo_mm;
  const minA = s.angulo_minimo_membros_graus;
  /** Avalia o nó numa posição: o modelo resultante e as regras. */
  const evalAt = (raw: Vec3): NodeMove | null => {
    const pos = raw.map((v) => Math.round(v * 1e4) / 1e4 + 0) as Vec3;
    if (support) pos[1] = 0;
    if (!cons.every(({ c, L }) => Math.abs(len(sub(pos, c)) - L) <= tol)) return null;
    const delta = sub(pos, node.pos);
    const next = transformNodes(model, moving, [0, 0, 0], 0, delta);
    next.nodes[nodeId] = { ...next.nodes[nodeId], pos };
    const errors: string[] = [];
    if ([...moving].some((k) => next.nodes[k].pos[1] < -1e-6)) errors.push("O nó iria para baixo da chapa.");
    errors.push(...validateMovedModel(cat, next, moving).errors);
    // N3 no nó e nas pontas fixas das barras que giraram
    for (const at of [nodeId, ...ties.map((m) => (m.a === nodeId ? m.b : m.a))]) {
      const bars = membersAt(next, at).filter((m) => cat.pieces[m.code]?.type === "bar").map((m) => directionFrom(next, m, at));
      for (let i = 0; i < bars.length && !errors.length; i++) {
        for (let j = i + 1; j < bars.length; j++) {
          const ang = (Math.acos(Math.max(-1, Math.min(1, dot(bars[i], bars[j])))) * 180) / Math.PI;
          if (ang < minA - 0.5) {
            errors.push(`Ângulo de ${ang.toFixed(0)}° entre barras em ${fmtP(next.nodes[at].pos)} (mínimo ${minA}°).`);
            break;
          }
        }
      }
    }
    // barras que giraram não furam placas
    for (const m of ties) {
      const a = next.nodes[m.a].pos;
      const b = next.nodes[m.b].pos;
      if (Object.values(next.plates).some((p) => !p.corners.includes(m.a) && !p.corners.includes(m.b) && segmentHitsPlate(a, b, p.corners.map((id) => next.nodes[id].pos)))) {
        errors.push("Uma barra atravessaria uma placa.");
      }
    }
    return { pos, model: next, ids: moving, check: { ok: !errors.length, errors: [...new Set(errors)], warnings: [] } };
  };
  /** Ponto possível mais perto de `target` (contínuo: esfera ou círculo; com 3 ou mais vínculos, os pontos que fecham). */
  const nearest = (target: Vec3): Vec3 | null => {
    if (cons.length === 1) {
      const { c, L } = cons[0];
      if (support) {
        if (c[1] >= L) return null;
        const r = Math.sqrt(L * L - c[1] * c[1]);
        const d = norm([target[0] - c[0], 0, target[2] - c[2]]);
        return [c[0] + r * d[0], 0, c[2] + r * d[2]];
      }
      return add(c, scale(norm(sub(target, c)), L));
    }
    const circ = circleOf(cons[0], cons[1]);
    if (!circ) return null;
    const { p, h, e1, e2 } = circ;
    let ts: number[];
    if (support) ts = solve(h * e1[1], h * e2[1], -p[1]);
    else if (cons.length === 2) {
      const w = sub(target, p);
      ts = [Math.atan2(dot(w, e2), dot(w, e1))];
    } else {
      const w = sub(p, cons[2].c);
      ts = solve(2 * h * dot(w, e1), 2 * h * dot(w, e2), cons[2].L * cons[2].L - dot(w, w) - h * h);
    }
    const pts = ts.map((t) => onCircle(p, h, e1, e2, t));
    return pts.length ? pts.reduce((a, b) => (len(sub(a, target)) <= len(sub(b, target)) ? a : b)) : null;
  };
  /** Pontos que atendem a todos os vínculos mais `extra`; o mais perto de `target`. */
  const nearestWith = (extra: { c: Vec3; L: number }, target: Vec3): Vec3 | null => {
    const all = [...cons, extra];
    const okAll = (q: Vec3) => all.every(({ c, L }) => Math.abs(len(sub(q, c)) - L) <= tol);
    const circ = circleOf(all[0], all[1]);
    if (!circ) return null;
    const { p, h, e1, e2 } = circ;
    let cands: Vec3[];
    if (support) {
      cands = solve(h * e1[1], h * e2[1], -p[1]).map((t) => onCircle(p, h, e1, e2, t));
    } else if (all.length === 2) {
      // círculo de posições: vale o ponto dele mais perto do alvo
      const w = sub(target, p);
      cands = [onCircle(p, h, e1, e2, Math.atan2(dot(w, e2), dot(w, e1)))];
    } else {
      const w = sub(p, all[2].c);
      cands = solve(2 * h * dot(w, e1), 2 * h * dot(w, e2), all[2].L * all[2].L - dot(w, w) - h * h).map((t) => onCircle(p, h, e1, e2, t));
    }
    const ok = cands.filter(okAll);
    return ok.length ? ok.reduce((a, b) => (len(sub(a, target)) <= len(sub(b, target)) ? a : b)) : null;
  };
  const options: NodeMove[] = [];
  const done = new Set<string>();
  for (const raw of pts) {
    const key = raw.map((v) => (Math.round(v * 1e4) / 1e4).toFixed(3)).join(",");
    if (done.has(key) || len(sub(raw, node.pos)) < 1e-3) continue;
    done.add(key);
    const o = evalAt(raw);
    if (o) options.push(o);
  }
  // lugar geométrico do nó (sem as regras): para desenhar o caminho possível
  let locus: NodeLocus | undefined;
  if (cons.length === 1) {
    const { c, L } = cons[0];
    if (support) {
      if (c[1] < L) locus = { kind: "circle", p: [c[0], 0, c[2]], h: Math.sqrt(L * L - c[1] * c[1]), e1: [1, 0, 0], e2: [0, 0, 1] };
    } else locus = { kind: "sphere", c, r: L };
  } else {
    const circ = circleOf(cons[0], cons[1]);
    if (circ) {
      if (!support && cons.length === 2) locus = { kind: "circle", ...circ };
      else {
        const { p, h, e1, e2 } = circ;
        let ts: number[];
        if (support) ts = solve(h * e1[1], h * e2[1], -p[1]);
        else {
          const w = sub(p, cons[2].c);
          ts = solve(2 * h * dot(w, e1), 2 * h * dot(w, e2), cons[2].L * cons[2].L - dot(w, w) - h * h);
        }
        locus = { kind: "points", pts: ts.map((t) => onCircle(p, h, e1, e2, t)).filter((q) => cons.every(({ c, L }) => Math.abs(len(sub(q, c)) - L) <= tol)) };
      }
    }
  }
  return { options, evalAt, nearest, nearestWith, locus };
}


/** Leva o nó para o ponto possível mais perto de `target` (as barras acompanham). */
export function nodeMoveNearest(cat: Catalog, model: Model, nodeId: string, target: Vec3): { move?: NodeMove; off?: number; error?: string } {
  const set = nodeMoveOptions(cat, model, nodeId);
  if (set.locked) return { error: set.locked };
  const p = set.nearest?.(target);
  if (!p) return { error: "As barras não deixam esse nó ir para lá." };
  const move = set.evalAt?.(p);
  if (!move) return { error: "As barras não deixam esse nó ir para lá." };
  if (!move.check.ok) return { error: move.check.errors[0] };
  return { move, off: len(sub(move.pos, target)) };
}


/**
 * Liga uma mola (ou diagonal) `code` entre as esferas A e B, nesta ordem (dois cliques).
 * Se a distância já é a da peça, só liga. Se não, B anda para o ponto possível mais perto em que a peça cabe:
 * as barras presas a B giram em torno das pontas fixas (como "Mover só o nó"). A fica parada.
 */
export function connectReach(
  cat: Catalog, inv: InventoryConfig, model: Model, code: string, aId: string, bId: string,
): { model?: Model; ids?: Set<string>; moved?: number; error?: string } {
  const piece = cat.pieces[code];
  const A = model.nodes[aId];
  const B = model.nodes[bId];
  if (!piece?.spanM || (piece.type !== "bar" && piece.type !== "cable")) return { error: `${code} não é mola nem diagonal.` };
  if (!A || !B || aId === bId) return { error: "Escolha duas esferas diferentes." };
  if (Object.values(model.members).some((m) => (m.a === aId && m.b === bId) || (m.a === bId && m.b === aId))) {
    return { error: "Já existe uma peça entre essas duas esferas." };
  }
  const L = piece.type === "cable" ? Math.hypot(piece.spanM[0], piece.spanM[1]) : piece.spanM[0];
  const tol = cat.settings.tolerancia_encaixe_mm / cat.settings.modulo_mm;
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  // já na distância certa: só liga
  if (Math.abs(len(sub(B.pos, A.pos)) - L) <= tol) {
    const ck = validateMember(cat, inv, model, code, aId, B.pos, { free: true });
    if (!ck.ok) return { error: ck.errors[0] };
    return { model: addMember(model, code, aId, B.pos).model, ids: new Set([bId]), moved: 0 };
  }
  const set = nodeMoveOptions(cat, model, bId);
  if (set.locked) return { error: `A segunda esfera não pode andar: ${set.locked.charAt(0).toLowerCase()}${set.locked.slice(1)}` };
  const p = set.nearestWith?.({ c: A.pos, L }, B.pos);
  if (!p) return { error: `As barras presas à segunda esfera não deixam ela chegar a ${fmt(L)} M da primeira (a ${code} tem ${fmt(L)} M; estão a ${fmt(len(sub(B.pos, A.pos)))} M).` };
  const mv = set.evalAt?.(p);
  if (!mv) return { error: "As barras presas à segunda esfera não deixam ela ir para lá." };
  if (mv.ids.has(aId)) return { error: "A primeira esfera anda junto com a segunda: escolha outra esfera, ou clique na ordem inversa." };
  if (!mv.check.ok) return { error: mv.check.errors[0] };
  const ck = validateMember(cat, inv, mv.model, code, aId, mv.pos, { free: true });
  if (!ck.ok) return { error: ck.errors[0] };
  return { model: addMember(mv.model, code, aId, mv.pos).model, ids: mv.ids, moved: len(sub(mv.pos, B.pos)) };
}

/* ---------- caminho da esfera: trechos possíveis (azul) e bloqueados (vermelho) ---------- */

/** ponto do círculo do caminho no ângulo t */
export function locusCirclePoint(loc: Extract<NodeLocus, { kind: "circle" }>, t: number): Vec3 {
  return add(loc.p, add(scale(loc.e1, loc.h * Math.cos(t)), scale(loc.e2, loc.h * Math.sin(t))));
}

/** ponto da esfera do caminho: θ a partir de cima (0 = em cima, π = embaixo), φ em volta (no plano da chapa) */
export function locusSpherePoint(loc: Extract<NodeLocus, { kind: "sphere" }>, theta: number, phi: number): Vec3 {
  const s = Math.sin(theta);
  return add(loc.c, scale([s * Math.cos(phi), Math.cos(theta), s * Math.sin(phi)], loc.r));
}

export interface LocusArc { t0: number; t1: number; ok: boolean }
export interface LocusLimit { pos: Vec3; t: number }

/**
 * Percorre um parâmetro t em [a, b] (fechado em volta, se `closed`) e acha os trechos em que a esfera pode ficar.
 * Os limites (trocas azul ↔ vermelho) são refinados por bisseção e ficam do lado possível.
 */
export function scanPath(okAt: (t: number) => boolean, at: (t: number) => Vec3, a: number, b: number, n: number, closed: boolean): { arcs: LocusArc[]; limits: LocusLimit[] } {
  const ts = Array.from({ length: n + 1 }, (_, k) => a + ((b - a) * k) / n);
  const ok = ts.map((t, k) => (closed && k === n ? undefined : okAt(t)));
  if (closed) ok[n] = ok[0];
  const cuts: { t: number; okT: number; before: boolean }[] = [];
  for (let k = 0; k < n; k++) {
    if (ok[k] === ok[k + 1]) continue;
    let [lo, hi] = [ts[k], ts[k + 1]];
    const before = ok[k]!;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (okAt(mid) === before) lo = mid;
      else hi = mid;
    }
    cuts.push({ t: (lo + hi) / 2, okT: before ? lo : hi, before });
  }
  const limits = cuts.map((c) => ({ pos: at(c.okT), t: c.okT }));
  if (!cuts.length) return { arcs: [{ t0: a, t1: b, ok: !!ok[0] }], limits };
  const arcs: LocusArc[] = [];
  if (closed) {
    for (let i = 0; i < cuts.length; i++) {
      const c = cuts[i];
      const nx = cuts[(i + 1) % cuts.length];
      arcs.push({ t0: c.t, t1: nx.t > c.t ? nx.t : nx.t + (b - a), ok: !c.before });
    }
  } else {
    let t0 = a;
    for (const c of cuts) (arcs.push({ t0, t1: c.t, ok: c.before }), (t0 = c.t));
    arcs.push({ t0, t1: b, ok: !cuts[cuts.length - 1].before });
  }
  return { arcs, limits };
}

export interface LocusStatus {
  /** círculo: trechos azuis e vermelhos (ângulo t) */
  arcs?: LocusArc[];
  /** esfera: se cada vértice da grade (θ em linhas, φ em colunas) é possível */
  grid?: { rows: number; cols: number; ok: boolean[] };
  /** pontos: quais são possíveis */
  pointsOk?: boolean[];
  /** posições-limite (do lado possível), para o Tab */
  limits: Vec3[];
}

/** Onde, no caminho, a esfera pode ficar (regras: ângulos, cruzamentos, chapa...). */
export function locusStatus(set: NodeMoveSet, opts: { circleSteps?: number; rows?: number; cols?: number } = {}): LocusStatus {
  const loc = set.locus;
  const ev = set.evalAt;
  if (!loc || !ev || set.locked) return { limits: [] };
  const okAt = (p: Vec3) => !!ev(p)?.check.ok;
  if (loc.kind === "points") {
    const ok = loc.pts.map(okAt);
    return { pointsOk: ok, limits: loc.pts.filter((_, i) => ok[i]) };
  }
  if (loc.kind === "circle") {
    const at = (t: number) => locusCirclePoint(loc, t);
    const { arcs, limits } = scanPath((t) => okAt(at(t)), at, 0, 2 * Math.PI, opts.circleSteps ?? 144, true);
    return { arcs, limits: limits.map((l) => l.pos) };
  }
  const rows = opts.rows ?? 16;
  const cols = opts.cols ?? 32;
  const ok: boolean[] = [];
  for (let i = 0; i <= rows; i++) {
    const theta = (i * Math.PI) / rows;
    for (let j = 0; j <= cols; j++) ok.push(okAt(locusSpherePoint(loc, theta, (j * 2 * Math.PI) / cols)));
  }
  return { grid: { rows, cols, ok }, limits: [] };
}

/** Esfera: limites ao longo do meridiano (de cima para baixo) que passa por `toward`. */
export function sphereMeridianLimits(set: NodeMoveSet, toward: Vec3, steps = 90): Vec3[] {
  const loc = set.locus;
  if (loc?.kind !== "sphere" || !set.evalAt) return [];
  const d = sub(toward, loc.c);
  const phi = Math.hypot(d[0], d[2]) < 1e-6 ? 0 : Math.atan2(d[2], d[0]);
  const at = (t: number) => locusSpherePoint(loc, t, phi);
  return scanPath((t) => !!set.evalAt!(at(t))?.check.ok, at, 0, Math.PI, steps, false).limits.map((l) => l.pos);
}
