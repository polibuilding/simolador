// Modelo lógico da estrutura: um grafo de nós (esferas e ligações de base) e membros (barras).
// Coordenadas em MÓDULOS: x e z no plano da chapa (0…18, 0…12), y para cima.
// y = 0 é o centro da esfera embutida na ligação de base (nível PAV. TÉRREO).

export type Vec3 = [number, number, number];

export type NodeKind = "sphere" | "support";

export interface MolaNode {
  id: string;
  kind: NodeKind; // sphere = esfera C; support = ligação de base GC (esfera embutida)
  pos: Vec3;
}

export interface Member {
  id: string;
  code: string; // B4, B6, B12…
  a: string; // id do nó
  b: string;
}

export interface Model {
  nodes: Record<string, MolaNode>;
  members: Record<string, Member>;
  nextId: number;
}

export const emptyModel = (): Model => ({ nodes: {}, members: {}, nextId: 1 });

export const EPS = 1e-6;

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Vec3) => Math.sqrt(dot(a, a));
export const samePos = (a: Vec3, b: Vec3, tol = 1e-4) => len(sub(a, b)) < tol;

export function findNodeAt(model: Model, pos: Vec3, tol = 1e-4): MolaNode | undefined {
  return Object.values(model.nodes).find((n) => samePos(n.pos, pos, tol));
}

export function membersAt(model: Model, nodeId: string): Member[] {
  return Object.values(model.members).filter((m) => m.a === nodeId || m.b === nodeId);
}

/** Vetor unitário saindo do nó `nodeId` ao longo do membro. */
export function directionFrom(model: Model, m: Member, nodeId: string): Vec3 {
  const a = model.nodes[m.a].pos;
  const b = model.nodes[m.b].pos;
  const v = nodeId === m.a ? sub(b, a) : sub(a, b);
  return scale(v, 1 / len(v));
}

// ---------- Operações puras (devolvem um novo modelo) ----------

const newId = (model: Model, prefix: string) => `${prefix}${model.nextId}`;

export function addSupport(model: Model, pos: Vec3): { model: Model; id: string } {
  const id = newId(model, "n");
  return {
    id,
    model: { ...model, nextId: model.nextId + 1, nodes: { ...model.nodes, [id]: { id, kind: "support", pos } } },
  };
}

/** Adiciona um membro do nó `fromId` até `toPos`, criando uma esfera em `toPos` se ainda não houver nó lá. */
export function addMember(model: Model, code: string, fromId: string, toPos: Vec3): { model: Model; id: string } {
  let m = model;
  let target = findNodeAt(m, toPos);
  if (!target) {
    const nid = newId(m, "n");
    target = { id: nid, kind: "sphere", pos: toPos };
    m = { ...m, nextId: m.nextId + 1, nodes: { ...m.nodes, [nid]: target } };
  }
  const id = newId(m, "m");
  return {
    id,
    model: { ...m, nextId: m.nextId + 1, members: { ...m.members, [id]: { id, code, a: fromId, b: target.id } } },
  };
}

/** Remove um membro e as esferas que ficarem soltas. */
export function removeMember(model: Model, memberId: string): Model {
  const mem = model.members[memberId];
  if (!mem) return model;
  const members = { ...model.members };
  delete members[memberId];
  const nodes = { ...model.nodes };
  for (const nid of [mem.a, mem.b]) {
    const n = nodes[nid];
    const stillUsed = Object.values(members).some((x) => x.a === nid || x.b === nid);
    if (n && n.kind === "sphere" && !stillUsed) delete nodes[nid];
  }
  return { ...model, nodes, members };
}

/** Remove um nó, seus membros e as esferas que ficarem soltas. */
export function removeNode(model: Model, nodeId: string): Model {
  let m = model;
  for (const mem of membersAt(m, nodeId)) m = removeMember(m, mem.id);
  if (!m.nodes[nodeId]) return m;
  const nodes = { ...m.nodes };
  delete nodes[nodeId];
  return { ...m, nodes };
}
