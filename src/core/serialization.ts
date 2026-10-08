// Arquivo de projeto .mola (JSON com versão de esquema; A-CONFIRMAR Q05).
import type { InventoryConfig } from "./inventory";
import type { Model, MolaNode, Member } from "./model";

export const FORMAT = "simolador";
export const VERSION = 1;

export interface MolaFile {
  format: typeof FORMAT;
  version: number;
  savedAt: string;
  name: string;
  moduleMm: number;
  inventory: InventoryConfig;
  nodes: MolaNode[];
  members: Member[];
}

export function toFile(model: Model, inv: InventoryConfig, name: string, moduleMm: number): MolaFile {
  return {
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    name,
    moduleMm,
    inventory: inv,
    nodes: Object.values(model.nodes),
    members: Object.values(model.members),
  };
}

export class MolaFileError extends Error {}

export function fromFile(raw: unknown): { model: Model; inventory: InventoryConfig; name: string } {
  const f = raw as Partial<MolaFile>;
  if (!f || f.format !== FORMAT) throw new MolaFileError("Este arquivo não é um projeto do siMOLAdor.");
  if (typeof f.version !== "number" || f.version > VERSION) {
    throw new MolaFileError("Arquivo de uma versão mais nova do siMOLAdor.");
  }
  if (!Array.isArray(f.nodes) || !Array.isArray(f.members)) throw new MolaFileError("Arquivo incompleto.");
  const nodes: Model["nodes"] = {};
  for (const n of f.nodes) {
    if (!n.id || !Array.isArray(n.pos) || n.pos.length !== 3) throw new MolaFileError("Nó inválido no arquivo.");
    nodes[n.id] = { id: n.id, kind: n.kind === "support" ? "support" : "sphere", pos: [n.pos[0], n.pos[1], n.pos[2]] };
  }
  const members: Model["members"] = {};
  for (const m of f.members) {
    if (!nodes[m.a] || !nodes[m.b]) throw new MolaFileError(`Barra ${m.id} liga um nó que não existe.`);
    members[m.id] = { id: m.id, code: m.code, a: m.a, b: m.b };
  }
  const maxId = Math.max(0, ...[...Object.keys(nodes), ...Object.keys(members)].map((k) => Number(k.slice(1)) || 0));
  return {
    model: { nodes, members, nextId: maxId + 1 },
    inventory: f.inventory ?? { kits: {}, unlimited: false },
    name: f.name ?? "Estrutura",
  };
}
