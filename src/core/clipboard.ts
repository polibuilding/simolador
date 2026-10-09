// Copiar, colar, mover, espelhar e repetir um conjunto de peças.
// A cópia guarda as peças com posições relativas a uma âncora; ao colar, esferas que caem no mesmo
// lugar de esferas existentes viram a mesma esfera (é assim que um vão repetido se liga ao anterior).
import type { Catalog } from "./catalog";
import type { Sel } from "./edit";
import { available, usage, type InventoryConfig } from "./inventory";
import {
  type Connector, type Member, type Model, type Vec3, add, canonicalDir, findNodeAt, plateKey, prune, rotY, round4, samePos, sub,
} from "./model";
import { validateConnector, validateMember, validatePlate, validateSupport, type Check, type PlateGeom } from "./rules";

export interface Clip {
  nodes: { key: string; kind: "support" | "sphere"; rel: Vec3 }[];
  members: { code: string; a: string; b: string }[];
  plates: { code: string; corners: [string, string, string, string] }[];
  connectors: { code: string; node: string; dirs: Vec3[]; base?: boolean; side?: Vec3 }[];
  /** âncora na posição original (centro da planta arredondado, no nível mais baixo) */
  anchor: Vec3;
  /** tamanho do conjunto (módulos) */
  size: Vec3;
}

/** Cópia das peças selecionadas (e das esferas que elas usam). */
export function makeClip(model: Model, sels: Sel[]): Clip | null {
  const memberIds = new Set<string>();
  const plateIds = new Set<string>();
  const connIds = new Set<string>();
  const nodeIds = new Set<string>();
  for (const s of sels) {
    if (s.kind === "member" && model.members[s.id]) memberIds.add(s.id);
    if (s.kind === "plate" && model.plates[s.id]) plateIds.add(s.id);
    if (s.kind === "connector" && model.connectors[s.id]) connIds.add(s.id);
    if (s.kind === "node" && model.nodes[s.id]) nodeIds.add(s.id);
  }
  for (const id of memberIds) (nodeIds.add(model.members[id].a), nodeIds.add(model.members[id].b));
  for (const id of plateIds) model.plates[id].corners.forEach((c) => nodeIds.add(c));
  for (const id of connIds) nodeIds.add(model.connectors[id].node);
  if (!nodeIds.size) return null;
  const ps = [...nodeIds].map((id) => model.nodes[id].pos);
  const lo = [0, 1, 2].map((k) => Math.min(...ps.map((p) => p[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...ps.map((p) => p[k])));
  const anchor: Vec3 = [Math.round((lo[0] + hi[0]) / 2), lo[1], Math.round((lo[2] + hi[2]) / 2)];
  return {
    nodes: [...nodeIds].map((id) => ({ key: id, kind: model.nodes[id].kind, rel: round4(sub(model.nodes[id].pos, anchor)) })),
    members: [...memberIds].map((id) => ({ code: model.members[id].code, a: model.members[id].a, b: model.members[id].b })),
    plates: [...plateIds].map((id) => ({ code: model.plates[id].code, corners: model.plates[id].corners })),
    connectors: [...connIds].map((id) => {
      const c = model.connectors[id];
      return { code: c.code, node: c.node, dirs: c.dirs, base: c.base, side: c.side };
    }),
    anchor,
    size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]],
  };
}

/** Espelha (em X e/ou Z, pela âncora) e gira `turns` × 90° em torno do eixo vertical. */
export function transformClip(clip: Clip, turns: number, mirrorX: boolean, mirrorZ: boolean): Clip {
  const f = (v: Vec3): Vec3 => rotY([mirrorX ? -v[0] : v[0], v[1], mirrorZ ? -v[2] : v[2]], turns).map((x) => x + 0) as Vec3;
  return {
    ...clip,
    nodes: clip.nodes.map((n) => ({ ...n, rel: round4(f(n.rel)) })),
    connectors: clip.connectors.map((c) => ({
      ...c,
      dirs: c.code === "RC90" ? c.dirs.map(f) : c.dirs.map((d) => canonicalDir(f(d))),
      side: c.side && f(c.side),
    })),
    size: turns % 2 ? [clip.size[2], clip.size[1], clip.size[0]] : clip.size,
  };
}

export interface PasteResult {
  model: Model;
  /** só as peças novas (e as esferas que elas usam), para o fantasma */
  part: Model;
  /** esferas novas */
  newNodes: Set<string>;
  check: Check;
  added: number;
}

const unlimited = (inv: InventoryConfig): InventoryConfig => ({ ...inv, unlimited: true });
const without = <T,>(rec: Record<string, T>, id: string) => Object.fromEntries(Object.entries(rec).filter(([k]) => k !== id));

/** Cola a cópia com a âncora em `target`. Não altera `model`. */
export function pasteClip(cat: Catalog, inv: InventoryConfig, model: Model, clip: Clip, target: Vec3): PasteResult {
  const m: Model = {
    nodes: { ...model.nodes }, members: { ...model.members }, plates: { ...model.plates }, connectors: { ...model.connectors },
    nextId: model.nextId, boards: model.boards,
  };
  const id = (prefix: string) => `${prefix}${m.nextId++}`;
  const map = new Map<string, string>();
  const newNodes = new Set<string>();
  const newMembers: string[] = [];
  const newPlates: string[] = [];
  const newConns: string[] = [];
  for (const n of clip.nodes) {
    const pos = round4(add(target, n.rel));
    const at = findNodeAt(m, pos);
    if (at) {
      map.set(n.key, at.id);
      continue;
    }
    const nid = id("n");
    // GC só no nível da chapa; fora dele vira esfera
    const kind = n.kind === "support" && Math.abs(pos[1]) < 1e-6 ? "support" : "sphere";
    m.nodes[nid] = { id: nid, kind, pos };
    map.set(n.key, nid);
    newNodes.add(nid);
  }
  for (const mb of clip.members) {
    const a = map.get(mb.a)!;
    const b = map.get(mb.b)!;
    if (Object.values(m.members).some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))) continue;
    const mid = id("m");
    m.members[mid] = { id: mid, code: mb.code, a, b } as Member;
    newMembers.push(mid);
  }
  for (const p of clip.plates) {
    const corners = p.corners.map((k) => map.get(k)!) as [string, string, string, string];
    const key = plateKey(corners);
    if (Object.values(m.plates).some((x) => plateKey(x.corners) === key)) continue;
    const pid = id("p");
    m.plates[pid] = { id: pid, code: p.code, corners };
    newPlates.push(pid);
  }
  for (const c of clip.connectors) {
    const node = map.get(c.node)!;
    const same = Object.values(m.connectors).some(
      (x) => x.node === node && x.code === c.code && !!x.base === !!c.base &&
        x.dirs.length === c.dirs.length && x.dirs.every((d) => c.dirs.some((e) => samePos(d, e, 1e-3))) &&
        (!x.side || !c.side || samePos(x.side, c.side, 1e-3)),
    );
    if (same) continue;
    const cid = id("c");
    m.connectors[cid] = { id: cid, code: c.code, node, dirs: c.dirs, base: c.base, side: c.side } as Connector;
    newConns.push(cid);
  }

  // validação de cada peça nova contra o resto
  const errors: string[] = [];
  const inv2 = unlimited(inv);
  const minD = cat.settings.esfera_diametro_mm / cat.settings.modulo_mm;
  for (const nid of newNodes) {
    const n = m.nodes[nid];
    if (n.pos[1] < -1e-6) errors.push("A cópia iria para baixo da chapa.");
    if (n.kind === "support") errors.push(...validateSupport(cat, inv2, m, n.pos, new Set([nid])).errors);
    for (const o of Object.values(m.nodes)) {
      if (o.id !== nid && Math.hypot(...sub(o.pos, n.pos)) < minD) {
        errors.push("Uma esfera da cópia cairia em cima de outra.");
        break;
      }
    }
  }
  for (const mid of newMembers) {
    const mb = m.members[mid];
    const base = { ...m, members: without(m.members, mid) };
    errors.push(...validateMember(cat, inv2, base, mb.code, mb.a, m.nodes[mb.b].pos).errors);
  }
  for (const pid of newPlates) {
    const p = m.plates[pid];
    const base = { ...m, plates: without(m.plates, pid) };
    const geom: PlateGeom = { corners: p.corners.map((c) => m.nodes[c].pos) as PlateGeom["corners"], normal: [0, 1, 0] };
    errors.push(...validatePlate(cat, inv2, base, p.code, geom).errors);
  }
  for (const cid of newConns) {
    const c = m.connectors[cid];
    const base = { ...m, connectors: without(m.connectors, cid) };
    errors.push(...validateConnector(cat, inv2, base, { code: c.code, node: c.node, dirs: c.dirs, base: c.base, side: c.side }).errors);
  }
  if (!inv.unlimited) {
    const used = usage(m);
    for (const [code, n] of Object.entries(used)) {
      const total = available(cat, inv, code);
      if (n > total) errors.push(`Faltariam ${n - total} ${code} no estoque.`);
    }
  }
  const added = newNodes.size + newMembers.length + newPlates.length + newConns.length;
  if (!added) errors.push("Nada novo: a cópia cairia em cima das peças que já existem.");

  // parte nova, para o fantasma
  const partNodes = new Set<string>(newNodes);
  for (const mid of newMembers) (partNodes.add(m.members[mid].a), partNodes.add(m.members[mid].b));
  for (const pid of newPlates) m.plates[pid].corners.forEach((c) => partNodes.add(c));
  for (const cid of newConns) partNodes.add(m.connectors[cid].node);
  const pick = <T,>(rec: Record<string, T>, ids: Iterable<string>) => Object.fromEntries([...ids].map((k) => [k, rec[k]]));
  const part: Model = {
    nodes: pick(m.nodes, partNodes),
    members: pick(m.members, newMembers),
    plates: pick(m.plates, newPlates),
    connectors: pick(m.connectors, newConns),
    nextId: m.nextId,
  };
  return { model: m, part, newNodes, check: { ok: !errors.length, errors: [...new Set(errors)], warnings: [] }, added };
}

/**
 * Tira a seleção do modelo para movê-la: saem as peças selecionadas; uma esfera selecionada só sai
 * se nenhuma peça fora da seleção depender dela (senão fica, e a cópia leva uma igual).
 */
export function cutSelection(model: Model, sels: Sel[]): Model {
  const ids = new Set(sels.map((s) => `${s.kind}:${s.id}`));
  const has = (k: string, id: string) => ids.has(`${k}:${id}`);
  const members = Object.fromEntries(Object.entries(model.members).filter(([k]) => !has("member", k)));
  const plates = Object.fromEntries(Object.entries(model.plates).filter(([k]) => !has("plate", k)));
  const connectors = Object.fromEntries(Object.entries(model.connectors).filter(([k]) => !has("connector", k)));
  const used = new Set<string>();
  for (const mb of Object.values(members)) (used.add(mb.a), used.add(mb.b));
  for (const p of Object.values(plates)) p.corners.forEach((c) => used.add(c));
  for (const c of Object.values(connectors)) used.add(c.node);
  const nodes = Object.fromEntries(Object.entries(model.nodes).filter(([k]) => !has("node", k) || used.has(k)));
  return prune({ ...model, nodes, members, plates, connectors });
}

/** Repete a cópia `times` vezes, cada uma deslocada `step` da anterior. Para na primeira que não couber. */
export function repeatClip(cat: Catalog, inv: InventoryConfig, model: Model, clip: Clip, step: Vec3, times: number) {
  let m = model;
  let done = 0;
  let error: string | null = null;
  for (let i = 1; i <= times; i++) {
    const r = pasteClip(cat, inv, m, clip, add(clip.anchor, [step[0] * i, step[1] * i, step[2] * i]));
    if (!r.check.ok) {
      error = `Cópia ${i}: ${r.check.errors[0]}`;
      break;
    }
    m = r.model;
    done++;
  }
  return { model: m, done, error };
}
