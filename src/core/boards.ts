// Várias chapas de base: posição, grade, que parte da estrutura está em cada uma, e operações (acrescentar, afastar, apagar).
import type { Catalog } from "./catalog";
import type { Sel } from "./edit";
import { type Board, type Model, boardsOf, componentOf, rotateNodes, rotYRad, transformNodes } from "./model";
import { validateMovedModel } from "./rules";

export type Side = "+x" | "-x" | "+z" | "-z";
const EPS = 1e-6;

export const boardSize = (cat: Catalog) => ({ w: cat.settings.chapa_modulos_x, d: cat.settings.chapa_modulos_y });

/** Giro da chapa em radianos. */
export const boardRad = (b: Board) => ((b.rot ?? 0) * Math.PI) / 180;

/** Ponto do plano (módulos) nas coordenadas da chapa: (0, 0) no canto, eixos ao longo dos lados. */
export function toBoardLocal(b: Board, x: number, z: number): [number, number] {
  const v = rotYRad([x - b.x, 0, z - b.z], -boardRad(b));
  return [v[0], v[2]];
}

/** Coordenadas da chapa → plano. */
export function fromBoardLocal(b: Board, lx: number, lz: number): [number, number] {
  const v = rotYRad([lx, 0, lz], boardRad(b));
  return [b.x + v[0], b.z + v[2]];
}

export function boardCenter(cat: Catalog, b: Board): [number, number] {
  const { w, d } = boardSize(cat);
  return fromBoardLocal(b, w / 2, d / 2);
}

/** Os quatro cantos da chapa no plano, em ordem. */
export function boardCorners(cat: Catalog, b: Board): [number, number][] {
  const { w, d } = boardSize(cat);
  return ([[0, 0], [w, 0], [w, d], [0, d]] as const).map(([x, z]) => fromBoardLocal(b, x, z));
}

/** Chapa que contém o ponto (x, z), borda inclusive. */
export function boardAt(cat: Catalog, boards: Board[], x: number, z: number): Board | undefined {
  const { w, d } = boardSize(cat);
  return boards.find((b) => {
    const [lx, lz] = toBoardLocal(b, x, z);
    return lx >= -EPS && lx <= w + EPS && lz >= -EPS && lz <= d + EPS;
  });
}

/** Chapa mais perto do ponto (para encaixar a GC quando o cursor sai um pouco da chapa). */
export function nearestBoard(cat: Catalog, boards: Board[], x: number, z: number): Board {
  const { w, d } = boardSize(cat);
  const dist = (b: Board) => {
    const [lx, lz] = toBoardLocal(b, x, z);
    return Math.hypot(Math.max(-lx, 0, lx - w), Math.max(-lz, 0, lz - d));
  };
  return boards.reduce((best, b) => (dist(b) < dist(best) ? b : best), boards[0]);
}

/** Giro (radianos) dos eixos da estrutura no ponto: o da chapa embaixo dele (ou da mais perto). 0 sem chapas giradas. */
export function frameRadAt(cat: Catalog, boards: Board[], x: number, z: number): number {
  if (boards.every((b) => !b.rot)) return 0;
  return boardRad(boardAt(cat, boards, x, z) ?? nearestBoard(cat, boards, x, z));
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

/** Duas chapas se sobrepõem (encostar não conta)? Eixos separadores dos dois retângulos. */
export function boardsOverlap(cat: Catalog, a: Board, b: Board): boolean {
  const A = boardCorners(cat, a);
  const B = boardCorners(cat, b);
  for (const P of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = P[i];
      const [x2, z2] = P[(i + 1) % 4];
      const ax = [z1 - z2, x2 - x1];
      const L = Math.hypot(ax[0], ax[1]) || 1;
      const proj = (Q: [number, number][]) => Q.map(([x, z]) => (x * ax[0] + z * ax[1]) / L);
      const pa = proj(A);
      const pb = proj(B);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-4 || Math.max(...pb) <= Math.min(...pa) + 1e-4) return false;
    }
  }
  return true;
}
const overlaps = boardsOverlap;

const nextBoardId = (boards: Board[]) => `b${Math.max(0, ...boards.map((b) => Number(b.id.slice(1)) || 0)) + 1}`;

const SIDE_DIR: Record<Side, [number, number]> = { "+x": [1, 0], "-x": [-1, 0], "+z": [0, 1], "-z": [0, -1] };

/**
 * Posição (canto) de uma chapa com giro `rot` ao lado `side` de `to`: `gap` módulos de distância (medida entre os
 * centros, menos as duas meias chapas, nos eixos de `to`) e `shift` módulos de deslocamento ao longo do lado.
 */
export function placeBeside(cat: Catalog, to: Board, side: Side, gap: number, shift = 0, rot = to.rot ?? 0): { x: number; z: number } {
  const { w, d } = boardSize(cat);
  const [sx, sz] = SIDE_DIR[side];
  const half = sx ? w / 2 : d / 2;
  const reach = half + gap + half;
  const lc: [number, number] = [w / 2 + sx * reach + (sx ? 0 : shift), d / 2 + sz * reach + (sz ? 0 : shift)];
  const [cx, cz] = fromBoardLocal(to, lc[0], lc[1]);
  const v = rotYRad([w / 2, 0, d / 2], (rot * Math.PI) / 180);
  const r = (n: number) => Math.round(n * 1e4) / 1e4 + 0;
  return { x: r(cx - v[0]), z: r(cz - v[2]) };
}

/** Distância e deslocamento atuais até a chapa ao lado da qual ela foi criada (módulos, nos eixos da vizinha). */
export function boardOffset(cat: Catalog, model: Model, b: Board): { gap: number; shift: number } | null {
  if (!b.attach) return null;
  const to = boardsOf(model).find((x) => x.id === b.attach!.to);
  if (!to) return null;
  const { w, d } = boardSize(cat);
  const [sx, sz] = SIDE_DIR[b.attach.side];
  const [cx, cz] = boardCenter(cat, b);
  const [lx, lz] = toBoardLocal(to, cx, cz);
  const rel = [lx - w / 2, lz - d / 2];
  const half = sx ? w / 2 : d / 2;
  const along = rel[0] * sx + rel[1] * sz;
  const across = sx ? rel[1] : rel[0];
  const r = (n: number) => Math.round(n * 1e4) / 1e4 + 0;
  return { gap: r(along - 2 * half), shift: r(across) };
}

/** Distância atual entre a chapa e a chapa ao lado da qual ela foi criada. */
export function boardGap(cat: Catalog, model: Model, b: Board): number | null {
  return boardOffset(cat, model, b)?.gap ?? null;
}

export function addBoard(cat: Catalog, model: Model, fromId: string, side: Side): { model?: Model; id?: string; error?: string } {
  const boards = boardsOf(model);
  const from = boards.find((b) => b.id === fromId);
  if (!from) return { error: "Chapa não encontrada." };
  const id = nextBoardId(boards);
  const nb: Board = { id, ...placeBeside(cat, from, side, 0), ...(from.rot ? { rot: from.rot } : {}), attach: { to: fromId, side } };
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

/**
 * Muda a posição da chapa: distância e deslocamento até a vizinha de referência e o giro (graus).
 * A estrutura que está só nela vai junto (gira em torno do centro da chapa).
 */
export function setBoardPose(
  cat: Catalog, model: Model, id: string, pose: { gap?: number; shift?: number; rot?: number },
): { model?: Model; error?: string; note?: string } {
  const boards = boardsOf(model);
  const b = boards.find((x) => x.id === id);
  if (!b) return { error: "Chapa não encontrada." };
  const off = boardOffset(cat, model, b);
  // girar uma chapa encostada: ela se afasta o mínimo para não bater na vizinha (em passos de 1/4 de módulo)
  if (pose.rot !== undefined && pose.gap === undefined && off) {
    for (let g = off.gap; g <= off.gap + 40; g += 0.25) {
      const r = setBoardPose(cat, model, id, { ...pose, gap: Math.round(g * 1e4) / 1e4 });
      if (r.model) return g > off.gap ? { ...r, note: `Para girar sem bater na vizinha, a chapa se afastou para ${String(Math.round(g * 100) / 100).replace(".", ",")} módulos.` } : r;
      if (!/encostaria/.test(r.error ?? "")) return r;
    }
  }
  if ((pose.gap !== undefined || pose.shift !== undefined) && !off) {
    return { error: b.attach ? "A chapa de referência não existe mais." : "Essa chapa não tem vizinha de referência: só gira." };
  }
  for (const v of [pose.gap, pose.shift]) if (v !== undefined && !(Math.abs(v) <= 200)) return { error: "Distância entre −200 e 200 módulos." };
  const rot = pose.rot ?? b.rot ?? 0;
  if (!Number.isFinite(rot)) return { error: "Giro em graus (ex.: 30)." };
  const rotN = Math.round((((rot % 360) + 540) % 360 - 180) * 1e4) / 1e4 + 0; // −180…180
  let pos = { x: b.x, z: b.z };
  if (off) {
    const to = boards.find((x) => x.id === b.attach!.to)!;
    pos = placeBeside(cat, to, b.attach!.side, pose.gap ?? off.gap, pose.shift ?? off.shift, rotN);
  } else {
    // sem vizinha: gira em torno do próprio centro
    const [cx, cz] = boardCenter(cat, b);
    const { w, d } = boardSize(cat);
    const v = rotYRad([w / 2, 0, d / 2], (rotN * Math.PI) / 180);
    pos = { x: Math.round((cx - v[0]) * 1e4) / 1e4 + 0, z: Math.round((cz - v[2]) * 1e4) / 1e4 + 0 };
  }
  const moved: Board = { ...b, ...pos, ...(rotN ? { rot: rotN } : { rot: undefined }) };
  if (!rotN) delete moved.rot;
  if (boards.some((x) => x.id !== id && overlaps(cat, x, moved))) return { error: "A chapa encostaria em outra." };
  const own = ownStructures(cat, model, id);
  if (own.error) return { error: own.error };
  let next: Model = { ...model, boards: boards.map((x) => (x.id === id ? moved : x)) };
  if (own.ids.size) {
    // movimento rígido: gira em torno do centro antigo e leva o centro para o lugar novo
    const [c0x, c0z] = boardCenter(cat, b);
    const [c1x, c1z] = boardCenter(cat, moved);
    next = rotateNodes(next, own.ids, [c0x, 0, c0z], boardRad(moved) - boardRad(b));
    next = transformNodes(next, own.ids, [0, 0, 0], 0, [c1x - c0x, 0, c1z - c0z]);
    const ck = validateMovedModel(cat, next, own.ids);
    if (!ck.ok) return { error: ck.errors[0] };
  }
  return { model: next };
}

/** Muda a distância até a chapa vizinha; a estrutura de cima vai junto. */
export function setBoardGap(cat: Catalog, model: Model, id: string, gap: number): { model?: Model; error?: string } {
  return setBoardPose(cat, model, id, { gap });
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
  const all = new Set(Object.keys(m.nodes));
  const flat = rotateNodes(m, all, [b.x, 0, b.z], -boardRad(b));
  const moved = transformNodes(flat, all, [0, 0, 0], 0, [-b.x, 0, -b.z]);
  return { ...moved, boards: undefined };
}
