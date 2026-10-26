// Arquivo de projeto .mola (JSON com versão de esquema; A-CONFIRMAR Q05).
import type { InventoryConfig } from "./inventory";
import type { Board, Connector, Member, Model, MolaNode, Plate, Vec3 } from "./model";

export const FORMAT = "simolador";
export const VERSION = 3;

/** O que aparece nos desenhos das pranchas. */
export interface SheetShow {
  /** indicações de vistas (triângulos A–D e linhas de corte) */
  markers: boolean;
  /** indicações de peças (PILAR, LIGAÇÃO…) */
  labels: boolean;
  /** eixos e níveis */
  axes: boolean;
  /** cotas */
  dims: boolean;
  /** desenho renderizado (foto da cena 3D na escala do desenho); desligado = simplificado, em linhas */
  render: boolean;
}

/** Desenho numa prancha. `cell` é o quadro dele (mm de papel); o desenho fica no centro. */
/** Canto de onde se olha uma isométrica: as duas vistas que ela mostra (AD = frente e direita…). */
export type IsoCorner = "AD" | "DC" | "CB" | "BA";
export const ISO_CORNERS: IsoCorner[] = ["AD", "DC", "CB", "BA"];

export interface SheetView {
  id: string;
  kind: "plan" | "A" | "B" | "C" | "D" | "cut" | "iso";
  /** isométrica: canto de onde se olha */
  iso?: IsoCorner;
  /** planta: altura do pavimento (mm, acima da chapa) */
  level?: number;
  /** corte: id do corte */
  cut?: string;
  /** prancha (0 = a primeira depois da capa) */
  page: number;
  cell: { x: number; y: number; w: number; h: number };
  /** escala própria (desenho inserido à mão); sem ela, segue a escala geral */
  n?: number;
}

/** Arranjo das pranchas de um tamanho de folha, quando o usuário mexe nele (sem ele, o arranjo é automático). */
export interface SheetLayout {
  /** número de pranchas de desenho (sem a capa) */
  pages: number;
  views: SheetView[];
}

/** Ajustes de um desenho: título, subtítulo e o que mostrar (sem `show`, segue a barra de cima). */
export interface SheetViewOpts {
  title?: string;
  sub?: string;
  show?: SheetShow;
}

/** Linha de corte desenhada numa planta (mm do mundo: x e z, de `a` para `b`). */
export interface SheetCut {
  id: string;
  name: string;
  a: [number, number];
  b: [number, number];
}

export type SheetPaper = "A2" | "A3" | "A4" | "custom";

export interface SheetMeta {
  line1: string; // título das pranchas, ex.: MOLA STRUCTURAL MODEL
  line2: string; // subtítulo, ex.: DESAFIO POLI-USP 2026
  /** etiquetas das pranchas arrastadas na tela: deslocamento (mm de papel) por chave */
  labels?: Record<string, [number, number]>;
  /** blocos das pranchas (desenhos, títulos, tabela) arrastados: deslocamento por "A3|bloco" */
  blocks?: Record<string, [number, number]>;
  /** tamanho da folha das pranchas */
  paper?: SheetPaper;
  /** folha personalizada (mm) */
  custom?: { w: number; h: number };
  /** escala geral (n de 1:n) ou automática */
  scale?: "auto" | number;
  /** o que aparece nos desenhos (barra de cima) */
  show?: Partial<SheetShow>;
  /** ajustes por desenho */
  views?: Record<string, SheetViewOpts>;
  /** arranjo mexido pelo usuário, por tamanho de folha */
  layouts?: Partial<Record<SheetPaper, SheetLayout>>;
  /** cortes */
  cuts?: SheetCut[];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPt = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(isNum);
const PAPERS: SheetPaper[] = ["A2", "A3", "A4", "custom"];
const VIEW_KINDS: SheetView["kind"][] = ["plan", "A", "B", "C", "D", "cut", "iso"];

function cleanShow(v: unknown): SheetShow | undefined {
  const o = v as Partial<SheetShow> | null;
  if (!o || typeof o !== "object") return undefined;
  return { markers: o.markers !== false, labels: o.labels !== false, axes: o.axes !== false, dims: o.dims !== false, render: o.render === true };
}

/** Confere o carimbo vindo de um arquivo: o que não tem o formato certo fica de fora (as pranchas voltam ao automático). */
export function cleanSheet(raw: unknown): SheetMeta | undefined {
  const s = raw as Partial<SheetMeta> | null;
  if (!s || typeof s !== "object") return undefined;
  const out: SheetMeta = { line1: typeof s.line1 === "string" ? s.line1 : "", line2: typeof s.line2 === "string" ? s.line2 : "" };
  const offs = (m: unknown) => {
    if (!m || typeof m !== "object") return undefined;
    const r = Object.fromEntries(Object.entries(m).filter(([, v]) => isPt(v))) as Record<string, [number, number]>;
    return Object.keys(r).length ? r : undefined;
  };
  const labels = offs(s.labels);
  const blocks = offs(s.blocks);
  if (labels) out.labels = labels;
  if (blocks) out.blocks = blocks;
  if (s.paper && PAPERS.includes(s.paper)) out.paper = s.paper;
  if (s.custom && isNum(s.custom.w) && isNum(s.custom.h)) out.custom = { w: s.custom.w, h: s.custom.h };
  if (s.scale === "auto" || (isNum(s.scale) && s.scale > 0)) out.scale = s.scale;
  if (s.show && typeof s.show === "object") out.show = cleanShow(s.show);
  if (s.views && typeof s.views === "object") {
    const views: Record<string, SheetViewOpts> = {};
    for (const [id, v] of Object.entries(s.views)) {
      if (!v || typeof v !== "object") continue;
      const o: SheetViewOpts = {};
      if (typeof v.title === "string") o.title = v.title;
      if (typeof v.sub === "string") o.sub = v.sub;
      const sh = cleanShow(v.show);
      if (sh) o.show = sh;
      views[id] = o;
    }
    out.views = views;
  }
  if (s.layouts && typeof s.layouts === "object") {
    const layouts: SheetMeta["layouts"] = {};
    for (const p of PAPERS) {
      const l = s.layouts[p];
      if (!l || !isNum(l.pages) || !Array.isArray(l.views)) continue;
      const views = l.views.filter(
        (v): v is SheetView =>
          !!v && typeof v.id === "string" && VIEW_KINDS.includes(v.kind) && isNum(v.page) && v.page >= 0 &&
          !!v.cell && [v.cell.x, v.cell.y, v.cell.w, v.cell.h].every(isNum) &&
          (v.level === undefined || isNum(v.level)) && (v.n === undefined || (isNum(v.n) && v.n > 0)) &&
          (v.cut === undefined || typeof v.cut === "string") &&
          (v.kind !== "iso" || ISO_CORNERS.includes(v.iso as IsoCorner)),
      );
      layouts[p] = { pages: Math.max(0, Math.round(l.pages)), views };
    }
    out.layouts = layouts;
  }
  if (Array.isArray(s.cuts)) {
    out.cuts = s.cuts.filter((c): c is SheetCut => !!c && typeof c.id === "string" && typeof c.name === "string" && isPt(c.a) && isPt(c.b));
  }
  return out;
}

export interface MolaFile {
  format: typeof FORMAT;
  version: number;
  savedAt: string;
  name: string;
  moduleMm: number;
  inventory: InventoryConfig;
  sheet?: SheetMeta;
  nodes: MolaNode[];
  members: Member[];
  plates: Plate[];
  connectors: Connector[];
  /** chapas de base (v3); sem elas, uma chapa no canto (0, 0) */
  boards?: Board[];
}

export function toFile(model: Model, inv: InventoryConfig, name: string, moduleMm: number, sheet?: SheetMeta): MolaFile {
  return {
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    name,
    moduleMm,
    inventory: inv,
    sheet,
    nodes: Object.values(model.nodes),
    members: Object.values(model.members),
    plates: Object.values(model.plates),
    connectors: Object.values(model.connectors),
    ...(model.boards?.length ? { boards: model.boards } : {}),
  };
}

export class MolaFileError extends Error {}

const vec = (v: unknown): Vec3 | null =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number") ? [v[0], v[1], v[2]] : null;

export function fromFile(raw: unknown): { model: Model; inventory: InventoryConfig; name: string; sheet?: SheetMeta } {
  const f = raw as Partial<MolaFile>;
  if (!f || f.format !== FORMAT) throw new MolaFileError("Este arquivo não é um projeto do siMOLAdor.");
  if (typeof f.version !== "number" || f.version > VERSION) throw new MolaFileError("Arquivo de uma versão mais nova do siMOLAdor.");
  if (!Array.isArray(f.nodes) || !Array.isArray(f.members)) throw new MolaFileError("Arquivo incompleto.");
  const nodes: Model["nodes"] = {};
  for (const n of f.nodes) {
    const pos = vec(n.pos);
    if (!n.id || !pos) throw new MolaFileError("Nó inválido no arquivo.");
    nodes[n.id] = { id: n.id, kind: n.kind === "support" || n.kind === "clip" ? n.kind : "sphere", pos };
  }
  const members: Model["members"] = {};
  for (const m of f.members) {
    if (!nodes[m.a] || !nodes[m.b]) throw new MolaFileError(`Peça ${m.id} liga um nó que não existe.`);
    members[m.id] = { id: m.id, code: m.code, a: m.a, b: m.b, ...(m.stiff ? { stiff: true } : {}), ...(typeof m.chain === "string" ? { chain: m.chain } : {}) };
  }
  const plates: Model["plates"] = {};
  for (const p of f.plates ?? []) {
    if (!Array.isArray(p.corners) || p.corners.length !== 4 || p.corners.some((c) => !nodes[c])) {
      throw new MolaFileError(`Placa ${p.id} com cantos inválidos.`);
    }
    plates[p.id] = { id: p.id, code: p.code, corners: [...p.corners] as Plate["corners"] };
  }
  const connectors: Model["connectors"] = {};
  for (const c of f.connectors ?? []) {
    if (!nodes[c.node]) throw new MolaFileError(`Ligação ${c.id} num nó que não existe.`);
    const dirs = (c.dirs ?? []).map(vec);
    if (dirs.some((d) => !d)) throw new MolaFileError(`Ligação ${c.id} inválida.`);
    const side = c.side ? vec(c.side) : null;
    connectors[c.id] = {
      id: c.id, code: c.code, node: c.node, dirs: dirs as Vec3[],
      ...(c.base ? { base: true } : {}),
      ...(side ? { side } : c.code === "CC" || c.code === "CC90" ? { side: defaultSide(dirs[0] as Vec3) } : {}),
    };
  }
  const all = [...Object.keys(nodes), ...Object.keys(members), ...Object.keys(plates), ...Object.keys(connectors)];
  const maxId = Math.max(0, ...all.map((k) => Number(k.slice(1)) || 0));
  const boards: Board[] = [];
  for (const b of f.boards ?? []) {
    if (typeof b?.id !== "string" || typeof b.x !== "number" || typeof b.z !== "number") throw new MolaFileError("Chapa inválida no arquivo.");
    boards.push({
      id: b.id, x: b.x, z: b.z,
      ...(typeof b.rot === "number" && b.rot ? { rot: b.rot } : {}),
      ...(typeof b.name === "string" && b.name.trim() ? { name: b.name.trim().slice(0, 40) } : {}),
    });
  }
  return {
    model: { nodes, members, plates, connectors, nextId: maxId + 1, ...(boards.length ? { boards } : {}) },
    inventory: f.inventory ?? { kits: {}, unlimited: false },
    name: f.name ?? "Estrutura",
    sheet: cleanSheet(f.sheet),
  };
}

/** Arquivos antigos (sem lado): CC no lado de cima; em pilares, no lado +x. */
function defaultSide(ax: Vec3): Vec3 {
  return Math.abs(ax[1]) > 0.5 ? [1, 0, 0] : [0, 1, 0];
}
