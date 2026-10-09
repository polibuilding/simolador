// Arquivo de projeto .mola (JSON com versão de esquema; A-CONFIRMAR Q05).
import type { InventoryConfig } from "./inventory";
import type { Connector, Member, Model, MolaNode, Plate, Vec3 } from "./model";

export const FORMAT = "simolador";
export const VERSION = 2;

export interface SheetMeta {
  line1: string; // ex.: MOLA STRUCTURAL MODEL
  line2: string; // ex.: DESAFIO POLI-USP 2026
  /** etiquetas das pranchas arrastadas na tela: deslocamento (mm de papel) por chave */
  labels?: Record<string, [number, number]>;
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
    nodes[n.id] = { id: n.id, kind: n.kind === "support" ? "support" : "sphere", pos };
  }
  const members: Model["members"] = {};
  for (const m of f.members) {
    if (!nodes[m.a] || !nodes[m.b]) throw new MolaFileError(`Peça ${m.id} liga um nó que não existe.`);
    members[m.id] = { id: m.id, code: m.code, a: m.a, b: m.b };
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
  return {
    model: { nodes, members, plates, connectors, nextId: maxId + 1 },
    inventory: f.inventory ?? { kits: {}, unlimited: false },
    name: f.name ?? "Estrutura",
    sheet: f.sheet,
  };
}

/** Arquivos antigos (sem lado): CC no lado de cima; em pilares, no lado +x. */
function defaultSide(ax: Vec3): Vec3 {
  return Math.abs(ax[1]) > 0.5 ? [1, 0, 0] : [0, 1, 0];
}
