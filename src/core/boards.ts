// Várias chapas de base: posição, grade, que parte da estrutura está em cada uma, e operações (acrescentar, afastar, apagar).
import type { Catalog } from "./catalog";
import type { Sel } from "./edit";
import { type Board, type Model, type Vec3, boardsOf, componentOf, transformNodes } from "./model";
import { validateMovedModel } from "./rules";

export type Side = "+x" | "-x" | "+z" | "-z";
const EPS = 1e-6;

export const boardSize = (cat: Catalog) => ({ w: cat.settings.chapa_modulos_x, d: cat.settings.chapa_modulos_y });

/** Chapa que contém o ponto (x, z), borda inclusive. */
export function boardAt(cat: Catalog, boards: Board[], x: number, z: number): Board | undefined {
  const { w, d } = boardSize(cat);
  return boards.find((b) => x >= b.x - EPS && x <= b.x + w + EPS && z >= b.z - EPS && z <= b.z + d + EPS);
}

/** Chapa mais perto do ponto (para encaixar a GC quando o cursor sai um pouco da chapa). */
export function nearestBoard(cat: Catalog, boards: Board[], x: number, z: number): Board {
  const { w, d } = boardSize(cat);
  const dist = (b: Board) => Math.hypot(Math.max(b.x - x, 0, x - b.x - w), Math.max(b.z - z, 0, z - b.z - d));
  return boards.reduce((best, b) => (dist(b) < dist(best) ? b : best), boards[0]);
}

/** Nós de cada chapa: as estruturas (componentes) com alguma GC na chapa; estruturas sem GC, pelos nós em cima dela. */
export function nodesOnBoards(cat: Catalog, model: Model, ids: string[]): Set<string> {
  const boards = boardsOf(model).filter((b) => ids.includes(b.id));
  const out = new Set<string>();
  const seen = new Set<string>();
  for (const n of Object.values(model.nodes)) {
    if (seen.has(n.id)) continue;
    const comp = componentOf(model, n.id);
    comp.forEach((k) => seen.add(k));
    const nodes = [...comp].map((k) => model.nodes[k]);
    const supports = nodes.filter((k) => k.kind === "support");
    const ref = supports.length ? supports : nodes;
    if (ref.some((k) => boardAt(cat, boards, k.pos[0], k.pos[2]))) comp.forEach((k) => out.add(k));
  }
  return out;
}

/** O modelo só com as chapas escolhidas e o que está nelas. */
export function filterByBoards(cat: Catalog, model: Model, ids: string[]): Model {
  const keep = nodesOnBoards(cat, model, ids);
  const pick = <T,>(rec: Record<string, T>, ok: (v: T) => boolean) => Object.fromEntries(Object.entries(rec).filter(([, v]) => ok(v)));
  return {
    ...model,
    nodes: pick(model.nodes, (n) => keep.has(n.id)),
    members: pick(model.members, (m) => keep.has(m.a) && keep.has(m.b)),
    plates: pick(model.plates, (p) => p.corners.every((c) => keep.has(c))),
    connectors: pick(model.connectors, (c) => keep.has(c.node)),
    boards: boardsOf(model).filter((b) => ids.includes(b.id)),
  };
}

/** Peças da chapa, para selecionar. */
export function boardSelection(cat: Catalog, model: Model, id: string): Sel[] {
  const m = filterByBoards(cat, model, [id]);
  return [
    ...Object.keys(m.nodes).map((k) => ({ kind: "node" as const, id: k })),
    ...Object.keys(m.members).map((k) => ({ kind: "member" as const, id: k })),
    ...Object.keys(m.plates).map((k) => ({ kind: "plate" as const, id: k })),
    ...Object.keys(m.connectors).map((k) => ({ kind: "connector" as const, id: k })),
  ];
}

const overlaps = (cat: Catalog, a: Board, b: Board) => {
  const { w, d } = boardSize(cat);
  return a.x < b.x + w - EPS && b.x < a.x + w - EPS && a.z < b.z + d - EPS && b.z < a.z + d - EPS;
};

const nextBoardId = (boards: Board[]) => `b${Math.max(0, ...boards.map((b) => Number(b.id.slice(1)) || 0)) + 1}`;

/** Posição de uma chapa encostada (com `gap` módulos de distância) no lado `side` de `to`. */
export function placeBeside(cat: Catalog, to: Board, side: Side, gap: number): { x: number; z: number } {
  const { w, d } = boardSize(cat);
  if (side === "+x") return { x: to.x + w + gap, z: to.z };
  if (side === "-x") return { x: to.x - w - gap, z: to.z };
  if (side === "+z") return { x: to.x, z: to.z + d + gap };
  return { x: to.x, z: to.z - d - gap };
}

/** Distância atual entre a chapa e a chapa ao lado da qual ela foi criada. */
export function boardGap(cat: Catalog, model: Model, b: Board): number | null {
  if (!b.attach) return null;
  const to = boardsOf(model).find((x) => x.id === b.attach!.to);
  if (!to) return null;
  const { w, d } = boardSize(cat);
  const s = b.attach.side;
  const g = s === "+x" ? b.x - to.x - w : s === "-x" ? to.x - b.x - w : s === "+z" ? b.z - to.z - d : to.z - b.z - d;
  return Math.round(g * 1e4) / 1e4;
}

export function addBoard(cat: Catalog, model: Model, fromId: string, side: Side): { model?: Model; id?: string; error?: string } {
  const boards = boardsOf(model);
  const from = boards.find((b) => b.id === fromId);
  if (!from) return { error: "Chapa não encontrada." };
  const id = nextBoardId(boards);
  const nb: Board = { id, ...placeBeside(cat, from, side, 0), attach: { to: fromId, side } };
  if (boards.some((b) => overlaps(cat, b, nb))) return { error: "Já existe uma chapa desse lado." };
  return { model: { ...model, boards: [...boards, nb] }, id };
}

/** Estruturas que estão só nesta chapa (vão junto se ela andar). Erro se alguma também se apoia em outra chapa. */
function ownStructures(cat: Catalog, model: Model, id: string): { ids: Set<string>; error?: string } {
  const boards = boardsOf(model);
  const me = boards.find((b) => b.id === id)!;
  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const n of Object.values(model.nodes)) {
    if (seen.has(n.id) || n.kind !== "support") continue;
    const comp = componentOf(model, n.id);
    comp.forEach((k) => seen.add(k));
    const sup = [...comp].map((k) => model.nodes[k]).filter((k) => k.kind === "support");
    const on = sup.map((k) => boardAt(cat, [me], k.pos[0], k.pos[2]));
    if (on.every(Boolean)) comp.forEach((k) => ids.add(k));
    else if (on.some(Boolean)) return { ids, error: "Uma estrutura liga esta chapa a outra: desfaça a ligação antes." };
  }
  return { ids };
}

/** Muda a distância até a chapa vizinha; a estrutura de cima vai junto. */
export function setBoardGap(cat: Catalog, model: Model, id: string, gap: number): { model?: Model; error?: string } {
  const boards = boardsOf(model);
  const b = boards.find((x) => x.id === id);
  if (!b?.attach) return { error: "Essa chapa não tem vizinha de referência." };
  const to = boards.find((x) => x.id === b.attach!.to);
  if (!to) return { error: "A chapa de referência não existe mais." };
  if (!(gap >= 0) || gap > 200) return { error: "Distância entre 0 e 200 módulos." };
  const pos = placeBeside(cat, to, b.attach.side, gap);
  const moved: Board = { ...b, ...pos };
  if (boards.some((x) => x.id !== id && overlaps(cat, x, moved))) return { error: "A chapa encostaria em outra." };
  const own = ownStructures(cat, model, id);
  if (own.error) return { error: own.error };
  const delta: Vec3 = [pos.x - b.x, 0, pos.z - b.z];
  let next: Model = { ...model, boards: boards.map((x) => (x.id === id ? moved : x)) };
  if (own.ids.size) {
    next = transformNodes(next, own.ids, [0, 0, 0], 0, delta);
    const ck = validateMovedModel(cat, next, own.ids);
    if (!ck.ok) return { error: ck.errors[0] };
  }
  return { model: next };
}

/** Apaga a chapa e o que está só nela. */
export function removeBoard(cat: Catalog, model: Model, id: string): { model?: Model; error?: string } {
  const boards = boardsOf(model);
  if (boards.length < 2) return { error: "É a única chapa." };
  const own = ownStructures(cat, model, id);
  if (own.error) return { error: own.error };
  const rest = boards.filter((b) => b.id !== id).map((b) => (b.attach?.to === id ? { ...b, attach: undefined } : b));
  const keep = (n: string) => !own.ids.has(n);
  return {
    model: {
      ...model,
      nodes: Object.fromEntries(Object.entries(model.nodes).filter(([k]) => keep(k))),
      members: Object.fromEntries(Object.entries(model.members).filter(([, m]) => keep(m.a) && keep(m.b))),
      plates: Object.fromEntries(Object.entries(model.plates).filter(([, p]) => p.corners.every(keep))),
      connectors: Object.fromEntries(Object.entries(model.connectors).filter(([, c]) => keep(c.node))),
      boards: rest,
    },
  };
}

/** A estrutura da chapa como um projeto à parte, com a chapa no canto (0, 0). */
export function boardAsModel(cat: Catalog, model: Model, id: string): Model {
  const b = boardsOf(model).find((x) => x.id === id)!;
  const m = filterByBoards(cat, model, [id]);
  const moved = transformNodes(m, new Set(Object.keys(m.nodes)), [0, 0, 0], 0, [-b.x, 0, -b.z]);
  return { ...moved, boards: undefined };
}
