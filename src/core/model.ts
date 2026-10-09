// Modelo lógico da estrutura: um grafo.
// Coordenadas em MÓDULOS: x e z no plano da chapa (0…18, 0…12), y para cima.
// y = 0 é o centro da esfera embutida na ligação de base (nível PAV. TÉRREO).

export type Vec3 = [number, number, number];

export type NodeKind = "sphere" | "support";

export interface MolaNode {
  id: string;
  kind: NodeKind; // sphere = esfera C; support = ligação de base GC (esfera embutida)
  pos: Vec3;
}

/** Barra (B4, B6, B12) ou diagonal (D4x6, D6x6, D6x12) entre dois nós. */
export interface Member {
  id: string;
  code: string;
  a: string;
  b: string;
}

/** Placa ligada a 4 esferas (cantos em ordem ao redor do retângulo). */
export interface Plate {
  id: string;
  code: string;
  corners: [string, string, string, string];
}

/**
 * Ligação num nó.
 * RC90: dirs = as duas direções (unitárias, nos eixos) das peças a 90°. Com `base`, fica entre a GC e o pilar:
 *       dirs = [para cima, lado da GC].
 * CC / CC90: dirs = [eixo] (unitário positivo) do par de barras alinhadas que a ligação torna contínuo;
 *            side = lado da esfera onde a peça fica (um dos 4 perpendiculares ao eixo, livre de barra transversal).
 */
export interface Connector {
  id: string;
  code: string;
  node: string;
  dirs: Vec3[];
  base?: boolean;
  /** CC / CC90: lado da esfera em que a peça fica (unitário, perpendicular ao eixo). */
  side?: Vec3;
}

/** Chapa de base (18 × 12 módulos), com o canto (x, z) em módulos. `attach`: chapa ao lado da qual foi criada. */
export interface Board {
  id: string;
  x: number;
  z: number;
  attach?: { to: string; side: "+x" | "-x" | "+z" | "-z" };
}

export interface Model {
  nodes: Record<string, MolaNode>;
  members: Record<string, Member>;
  plates: Record<string, Plate>;
  connectors: Record<string, Connector>;
  nextId: number;
  /** chapas de base; sem a lista, uma chapa só no canto (0, 0) */
  boards?: Board[];
}

export const DEFAULT_BOARD: Board = { id: "b1", x: 0, z: 0 };
export const boardsOf = (model: Model): Board[] => (model.boards?.length ? model.boards : [DEFAULT_BOARD]);

export const emptyModel = (): Model => ({ nodes: {}, members: {}, plates: {}, connectors: {}, nextId: 1 });

export const EPS = 1e-6;
/** Tolerância para comparar direções unitárias (posições inclinadas são arredondadas a 1e-4). */
export const DIR_TOL = 1e-4;
export const UP: Vec3 = [0, 1, 0];
export const AXES: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: Vec3) => Math.sqrt(dot(a, a));
export const norm = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1));
export const samePos = (a: Vec3, b: Vec3, tol = 1e-4) => len(sub(a, b)) < tol;
export const round4 = (v: Vec3): Vec3 => v.map((c) => Math.round(c * 1e4) / 1e4 + 0) as Vec3;

export function findNodeAt(model: Model, pos: Vec3, tol = 1e-3): MolaNode | undefined {
  return Object.values(model.nodes).find((n) => samePos(n.pos, pos, tol));
}

export function membersAt(model: Model, nodeId: string): Member[] {
  return Object.values(model.members).filter((m) => m.a === nodeId || m.b === nodeId);
}

/** Vetor unitário saindo do nó `nodeId` ao longo do membro. */
export function directionFrom(model: Model, m: Member, nodeId: string): Vec3 {
  const a = model.nodes[m.a].pos;
  const b = model.nodes[m.b].pos;
  return norm(nodeId === m.a ? sub(b, a) : sub(a, b));
}

/** Membro que sai do nó na direção `dir` (unitária), se houver. */
export function memberAlong(model: Model, nodeId: string, dir: Vec3, filter?: (m: Member) => boolean): Member | undefined {
  return membersAt(model, nodeId).find((m) => (!filter || filter(m)) && samePos(directionFrom(model, m, nodeId), dir, DIR_TOL));
}

/** Direção com sinal canônico (primeira componente não nula positiva): identifica o eixo de um par de barras alinhadas. */
export function canonicalDir(d: Vec3): Vec3 {
  const k = d.findIndex((x) => Math.abs(x) > DIR_TOL);
  return k >= 0 && d[k] < 0 ? (d.map((x) => -x + 0) as Vec3) : d;
}

/**
 * Os 4 lados de uma esfera em volta de um par de barras alinhadas no eixo `ax`.
 * Eixo da estrutura: os 4 eixos perpendiculares (como antes). Eixo inclinado num plano da estrutura:
 * a normal desse plano (±) e a perpendicular dentro do plano (±). Ordem: o mais "para cima" primeiro.
 */
export function sidesAround(ax: Vec3): Vec3[] {
  const a = norm(ax);
  if (a.filter((x) => Math.abs(x) > DIR_TOL).length === 1) return AXES.filter((s) => Math.abs(dot(s, a)) < DIR_TOL);
  const zero = a.findIndex((x) => Math.abs(x) < DIR_TOL);
  const p: Vec3 = zero >= 0 ? (AXES.find((s) => Math.abs(s[zero]) === 1 && s[zero] > 0) as Vec3) : norm(Math.abs(a[1]) < 0.99 ? cross(a, UP) : cross(a, [1, 0, 0]));
  const q = norm(cross(a, p));
  const r4 = (v: Vec3) => v.map((x) => Math.round(x * 1e6) / 1e6 + 0) as Vec3;
  return [p, scale(p, -1), q, scale(q, -1)].map(r4).sort((u, v) => v[1] - u[1]);
}

export const plateKey = (ids: string[]) => [...ids].sort().join("|");

// ---------------- Operações (puras, devolvem um novo modelo) ----------------

const newId = (model: Model, prefix: string) => `${prefix}${model.nextId}`;

export function addSupport(model: Model, pos: Vec3): { model: Model; id: string } {
  const id = newId(model, "n");
  return { id, model: { ...model, nextId: model.nextId + 1, nodes: { ...model.nodes, [id]: { id, kind: "support", pos: round4(pos) } } } };
}

/** Adiciona um membro do nó `fromId` até `toPos`, criando uma esfera em `toPos` se ainda não houver nó lá. */
export function addMember(model: Model, code: string, fromId: string, toPos: Vec3): { model: Model; id: string } {
  let m = model;
  let target = findNodeAt(m, toPos);
  if (!target) {
    const nid = newId(m, "n");
    target = { id: nid, kind: "sphere", pos: round4(toPos) };
    m = { ...m, nextId: m.nextId + 1, nodes: { ...m.nodes, [nid]: target } };
  }
  const id = newId(m, "m");
  return { id, model: { ...m, nextId: m.nextId + 1, members: { ...m.members, [id]: { id, code, a: fromId, b: target.id } } } };
}

export function addPlate(model: Model, code: string, corners: [string, string, string, string]): { model: Model; id: string } {
  const id = newId(model, "p");
  return { id, model: { ...model, nextId: model.nextId + 1, plates: { ...model.plates, [id]: { id, code, corners } } } };
}

export function addConnector(model: Model, c: Omit<Connector, "id">): { model: Model; id: string } {
  const id = newId(model, "c");
  return { id, model: { ...model, nextId: model.nextId + 1, connectors: { ...model.connectors, [id]: { ...c, id } } } };
}

const isBar = (code: string) => /^B\d+$/.test(code);

/** A ligação ainda tem as peças de que depende? */
export function connectorSupported(model: Model, c: Connector): boolean {
  const n = model.nodes[c.node];
  if (!n) return false;
  const barAlong = (d: Vec3) => !!memberAlong(model, c.node, d, (m) => isBar(m.code));
  if (c.code === "RC90") {
    if (c.base) return n.kind === "support" && barAlong(UP);
    return c.dirs.every(barAlong);
  }
  const ax = c.dirs[0];
  if (!barAlong(ax) || !barAlong(scale(ax, -1))) return false;
  if (c.side && barAlong(c.side)) return false; // uma barra transversal ocupou o lado
  if (c.code === "CC90") {
    return Object.values(model.connectors).some(
      (o) => o.code === "CC" && o.node === c.node && Math.abs(dot(o.dirs[0], ax)) < DIR_TOL && (!c.side || !o.side || samePos(o.side, c.side, DIR_TOL)),
    );
  }
  return true;
}

/** Remove o que ficou sem apoio: ligações sem as barras, placas sem cantos, esferas soltas. */
export function prune(model: Model): Model {
  let m = model;
  for (let guard = 0; guard < 10; guard++) {
    let changed = false;
    const plates = { ...m.plates };
    for (const p of Object.values(plates)) if (p.corners.some((c) => !m.nodes[c])) (delete plates[p.id], (changed = true));
    const connectors = { ...m.connectors };
    for (const c of Object.values(connectors)) if (!connectorSupported({ ...m, plates }, c)) (delete connectors[c.id], (changed = true));
    const nodes = { ...m.nodes };
    for (const n of Object.values(nodes)) {
      if (n.kind !== "sphere") continue;
      const used =
        Object.values(m.members).some((x) => x.a === n.id || x.b === n.id) ||
        Object.values(plates).some((p) => p.corners.includes(n.id));
      if (!used) (delete nodes[n.id], (changed = true));
    }
    m = { ...m, nodes, plates, connectors };
    if (!changed) break;
  }
  return m;
}

export function removeMember(model: Model, id: string): Model {
  if (!model.members[id]) return model;
  const members = { ...model.members };
  delete members[id];
  return prune({ ...model, members });
}

export function removePlate(model: Model, id: string): Model {
  const plates = { ...model.plates };
  delete plates[id];
  return prune({ ...model, plates });
}

export function removeConnector(model: Model, id: string): Model {
  const connectors = { ...model.connectors };
  delete connectors[id];
  // CC90 depende da CC
  return prune({ ...model, connectors });
}

/** Remove um nó e tudo o que depende dele. */
export function removeNode(model: Model, nodeId: string): Model {
  if (!model.nodes[nodeId]) return model;
  const members = Object.fromEntries(Object.entries(model.members).filter(([, m]) => m.a !== nodeId && m.b !== nodeId));
  const nodes = { ...model.nodes };
  delete nodes[nodeId];
  return prune({ ...model, nodes, members });
}

// ---------------- Estrutura conectada (para mover e girar) ----------------

/** Nós ligados ao nó dado por barras, diagonais ou placas. */
export function componentOf(model: Model, nodeId: string): Set<string> {
  const seen = new Set<string>([nodeId]);
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    const next: string[] = [];
    for (const m of Object.values(model.members)) {
      if (m.a === id) next.push(m.b);
      if (m.b === id) next.push(m.a);
    }
    for (const p of Object.values(model.plates)) if (p.corners.includes(id)) next.push(...p.corners);
    for (const n of next) if (!seen.has(n)) (seen.add(n), stack.push(n));
  }
  return seen;
}

/** Gira um vetor em torno do eixo vertical em múltiplos de 90° (sentido anti-horário visto de cima). */
export function rotY(v: Vec3, quarterTurns: number): Vec3 {
  let [x, y, z] = v;
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) [x, z] = [z, -x];
  return [x + 0, y, z + 0];
}

/** Move (e gira) um conjunto de nós rigidamente: gira `turns`×90° em torno de `pivot` e depois desloca `delta`. */
export function transformNodes(model: Model, ids: Set<string>, pivot: Vec3, turns: number, delta: Vec3): Model {
  const nodes = { ...model.nodes };
  for (const id of ids) {
    const n = nodes[id];
    nodes[id] = { ...n, pos: round4(add(add(pivot, rotY(sub(n.pos, pivot), turns)), delta)) };
  }
  const connectors = { ...model.connectors };
  for (const c of Object.values(connectors)) {
    if (!ids.has(c.node)) continue;
    connectors[c.id] = {
      ...c,
      dirs: c.dirs.map((d) => {
        const r = rotY(d, turns);
        // eixos das CC ficam sempre positivos
        return c.code === "RC90" ? r : canonicalDir(r);
      }),
      ...(c.side ? { side: rotY(c.side, turns) } : {}),
    };
  }
  return { ...model, nodes, connectors };
}
