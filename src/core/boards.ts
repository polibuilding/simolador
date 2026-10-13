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

export function addBoard(cat: Catalog, model: Model, fromId: string, side: Side): { model?: Model; id?: string; error?: string } {
  const boards = boardsOf(model);
  const from = boards.find((b) => b.id === fromId);
  if (!from) return { error: "Chapa não encontrada." };
  const id = nextBoardId(boards);
  // a chapa nova nasce encostada, mas é independente: depois anda pelas setas, pelo centro ou pela distância entre chapas
  const nb: Board = { id, ...placeBeside(cat, from, side, 0), ...(from.rot ? { rot: from.rot } : {}) };
  if (boards.some((b) => overlaps(cat, b, nb))) return { error: "Já existe uma chapa desse lado." };
  return { model: { ...model, boards: [...boards, nb] }, id };
}

/** Estruturas que estão só nesta chapa (vão junto se ela andar). Erro se alguma também se apoia em outra chapa. */
function ownStructures(cat: Catalog, model: Model, id: string | string[]): { ids: Set<string>; error?: string } {
  const sel = new Set(Array.isArray(id) ? id : [id]);
  const boards = boardsOf(model);
  const mine = boards.filter((b) => sel.has(b.id));
  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const n of Object.values(model.nodes)) {
    if (seen.has(n.id)) continue;
    const comp = componentOf(model, n.id);
    comp.forEach((k) => seen.add(k));
    const nodes = [...comp].map((k) => model.nodes[k]);
    const sup = nodes.filter((k) => k.kind === "support");
    // estrutura sem GC: vale pelos nós que estão em cima das chapas
    const ref = sup.length ? sup : nodes;
    const on = ref.map((k) => !!boardAt(cat, mine, k.pos[0], k.pos[2]));
    if (on.every(Boolean)) comp.forEach((k) => ids.add(k));
    else if (sup.length && on.some(Boolean)) {
      return { ids, error: sel.size > 1 ? "Uma estrutura liga estas chapas a outra que não está selecionada: selecione as duas (Ctrl+clique)." : "Uma estrutura liga esta chapa a outra: selecione as duas (Ctrl+clique) para mover juntas." };
    }
  }
  return { ids };
}

/** Nome da chapa para mostrar. */
export const boardName = (b: Board) => b.name?.trim() || `Chapa ${b.id.slice(1)}`;

/** Muda o nome da chapa (vazio = nome padrão). */
export function renameBoard(model: Model, id: string, name: string): Model {
  const nm = name.trim().slice(0, 40);
  return {
    ...model,
    boards: boardsOf(model).map((b) => {
      if (b.id !== id) return b;
      const nb: Board = { ...b, name: nm };
      if (!nm || nm === `Chapa ${b.id.slice(1)}`) delete nb.name;
      return nb;
    }),
  };
}

/**
 * Desloca as chapas `ids` (e o que está só em cima delas) por `delta` (módulos, no plano).
 * Uma estrutura que liga uma chapa a outra que não está entre elas trava o movimento.
 */
export function moveBoards(cat: Catalog, model: Model, ids: string[], delta: [number, number]): { model?: Model; error?: string } {
  const boards = boardsOf(model);
  const sel = new Set(ids);
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4 + 0;
  const moved = boards.map((b) => (sel.has(b.id) ? { ...b, x: r4(b.x + delta[0]), z: r4(b.z + delta[1]) } : b));
  for (const m of moved.filter((b) => sel.has(b.id))) {
    const hit = moved.find((o) => !sel.has(o.id) && overlaps(cat, o, m));
    if (hit) return { error: `${boardName(m)} encostaria em ${boardName(hit)}.` };
  }
  const own = ownStructures(cat, model, ids);
  if (own.error) return { error: own.error };
  let next: Model = { ...model, boards: moved };
  if (own.ids.size) {
    next = transformNodes(next, own.ids, [0, 0, 0], 0, [delta[0], 0, delta[1]]);
    const ck = validateMovedModel(cat, next, own.ids);
    if (!ck.ok) return { error: ck.errors[0] };
  }
  return { model: next };
}

/** Leva o centro da chapa para (cx, cz), em módulos. */
export function setBoardCenter(cat: Catalog, model: Model, id: string, cx: number, cz: number): { model?: Model; error?: string } {
  const b = boardsOf(model).find((x) => x.id === id);
  if (!b) return { error: "Chapa não encontrada." };
  if (!Number.isFinite(cx) || !Number.isFinite(cz) || Math.abs(cx) > 2000 || Math.abs(cz) > 2000) return { error: "Coordenadas em módulos (ex.: 12,5)." };
  const [x0, z0] = boardCenter(cat, b);
  return moveBoards(cat, model, [id], [cx - x0, cz - z0]);
}

/** Meia largura da chapa medida na direção `u` (unitária, no plano). */
function halfAlong(cat: Catalog, b: Board, u: [number, number]): number {
  const { w, d } = boardSize(cat);
  const ex = rotYRad([1, 0, 0], boardRad(b));
  const ez = rotYRad([0, 0, 1], boardRad(b));
  return (w / 2) * Math.abs(u[0] * ex[0] + u[1] * ex[2]) + (d / 2) * Math.abs(u[0] * ez[0] + u[1] * ez[2]);
}

/**
 * Distância entre duas chapas: no eixo de `a` que aponta para `b` (o lado em que `b` está), espaço livre entre as
 * bordas; também o eixo (unitário, no plano) e o deslocamento lateral entre os centros.
 */
export function boardsGap(cat: Catalog, a: Board, b: Board): { gap: number; u: [number, number]; across: number } {
  const { w, d } = boardSize(cat);
  const [ax, az] = boardCenter(cat, a);
  const [bx, bz] = boardCenter(cat, b);
  const [lx, lz] = toBoardLocal(a, bx, bz);
  const rel = [lx - w / 2, lz - d / 2];
  const alongX = Math.abs(rel[0]) / w >= Math.abs(rel[1]) / d;
  const sg = Math.sign(alongX ? rel[0] : rel[1]) || 1;
  const e = rotYRad(alongX ? [sg, 0, 0] : [0, 0, sg], boardRad(a));
  const u: [number, number] = [e[0], e[2]];
  const along = (bx - ax) * u[0] + (bz - az) * u[1];
  const across = (bx - ax) * -u[1] + (bz - az) * u[0];
  const gap = along - (alongX ? w / 2 : d / 2) - halfAlong(cat, b, u);
  return { gap: Math.round(gap * 1e4) / 1e4 + 0, u, across: Math.round(across * 1e4) / 1e4 + 0 };
}

/**
 * Põe as chapas a `gap` módulos umas das outras, na ordem dada: a primeira fica parada; cada uma anda (só na direção
 * em que já está da anterior) até ficar a `gap` dela. A estrutura de cima vai junto.
 */
export function setBoardsGap(cat: Catalog, model: Model, ids: string[], gap: number): { model?: Model; error?: string } {
  if (ids.length < 2) return { error: "Selecione duas chapas ou mais (Ctrl+clique)." };
  if (!(gap >= 0 && gap <= 500)) return { error: "Distância entre 0 e 500 módulos." };
  let m = model;
  for (let i = 1; i < ids.length; i++) {
    const bs = boardsOf(m);
    const a = bs.find((b) => b.id === ids[i - 1]);
    const b = bs.find((x) => x.id === ids[i]);
    if (!a || !b) return { error: "Chapa não encontrada." };
    const g = boardsGap(cat, a, b);
    const k = gap - g.gap;
    if (Math.abs(k) < 1e-9) continue;
    // as seguintes da fila vão junto (mantêm a posição entre si; o ajuste delas vem nas próximas voltas)
    const r = moveBoards(cat, m, ids.slice(i), [g.u[0] * k, g.u[1] * k]);
    if (!r.model) return { error: r.error };
    m = r.model;
  }
  return { model: m };
}

/**
 * Gira a chapa em torno do próprio centro (graus, anti-horário visto de cima); a estrutura de cima gira junto.
 * Se for bater em outra chapa, ela se afasta o mínimo dessa chapa (passos de 1/4 de módulo) e avisa.
 */
export function rotateBoard(cat: Catalog, model: Model, id: string, deg: number): { model?: Model; error?: string; note?: string } {
  const boards = boardsOf(model);
  const b = boards.find((x) => x.id === id);
  if (!b) return { error: "Chapa não encontrada." };
  if (!Number.isFinite(deg)) return { error: "Giro em graus (ex.: 30)." };
  const rotN = Math.round((((deg % 360) + 540) % 360 - 180) * 1e4) / 1e4 + 0; // −180…180
  const [cx, cz] = boardCenter(cat, b);
  const { w, d } = boardSize(cat);
  const v = rotYRad([w / 2, 0, d / 2], (rotN * Math.PI) / 180);
  const turned: Board = { ...b, x: Math.round((cx - v[0]) * 1e4) / 1e4 + 0, z: Math.round((cz - v[2]) * 1e4) / 1e4 + 0, rot: rotN };
  if (!rotN) delete turned.rot;
  const own = ownStructures(cat, model, id);
  if (own.error) return { error: own.error };
  let next: Model = { ...model, boards: boards.map((x) => (x.id === id ? turned : x)) };
  if (own.ids.size) {
    next = rotateNodes(next, own.ids, [cx, 0, cz], boardRad(turned) - boardRad(b));
    const ck = validateMovedModel(cat, next, own.ids);
    if (!ck.ok) return { error: ck.errors[0] };
  }
  const hit = boards.find((o) => o.id !== id && overlaps(cat, o, turned));
  if (!hit) return { model: next };
  // afasta da chapa em que bateria, na direção entre os centros
  const [hx, hz] = boardCenter(cat, hit);
  const L = Math.hypot(cx - hx, cz - hz) || 1;
  const u: [number, number] = [(cx - hx) / L, (cz - hz) / L];
  for (let k = 0.25; k <= 40; k += 0.25) {
    const r = moveBoards(cat, next, [id], [u[0] * k, u[1] * k]);
    if (r.model) return { model: r.model, note: `Para girar sem bater em ${boardName(hit)}, ${boardName(b)} se afastou ${String(k).replace(".", ",")} módulos.` };
  }
  return { error: `${boardName(b)} encostaria em ${boardName(hit)}.` };
}

/** Apaga a chapa e o que está só nela. */
export function removeBoard(cat: Catalog, model: Model, id: string): { model?: Model; error?: string } {
  const boards = boardsOf(model);
  if (boards.length < 2) return { error: "É a única chapa." };
  const own = ownStructures(cat, model, id);
  if (own.error) return { error: "Uma estrutura liga esta chapa a outra: desfaça a ligação antes de apagar." };
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
