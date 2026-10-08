// Editar peças já colocadas: retirar, girar, mover estrutura.
import type { Catalog } from "./catalog";
import type { InventoryConfig } from "./inventory";
import {
  type Model, type Vec3, componentOf, removeConnector, removeMember, removeNode, removePlate, samePos, sub, transformNodes,
} from "./model";
import { validateMovedModel } from "./rules";
import { applyCandidate, connectorCandidates, markerPos, memberCandidates, plateCandidates, type Candidate } from "./snapping";

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
export function rotateSelection(cat: Catalog, inv: InventoryConfig, model: Model, sel: Sel): EditResult {
  if (sel.kind === "node") return rotateGroup(cat, model, sel.id, 1);
  const inv2: InventoryConfig = { ...inv, unlimited: true }; // a peça já saiu do estoque
  if (sel.kind === "member") {
    const m = model.members[sel.id];
    if (!m) return {};
    for (const anchor of [m.a, m.b]) {
      const base: Model = { ...model, members: without(model.members, m.id) };
      const otherPos = model.nodes[anchor === m.a ? m.b : m.a].pos;
      const cands = memberCandidates(cat, inv2, base, m.code, anchor);
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
