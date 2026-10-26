// Modelo lógico da estrutura: um grafo.
// Coordenadas em MÓDULOS: x e z no plano da chapa (0…18, 0…12), y para cima.
// y = 0 é o centro da esfera embutida na ligação de base (nível PAV. TÉRREO).

export type Vec3 = [number, number, number];

export type NodeKind = "sphere" | "support" | "clip";

export interface MolaNode {
  id: string;
  /**
   * sphere = esfera C; support = ligação de base GC (esfera embutida);
   * clip = ponto de cabo (Kit 3): uma bolinha de um cabo, presa pelo furo do meio de um CABLE CLIP C, onde sai outro
   * cabo (pendural). Só recebe cabos.
   */
  kind: NodeKind;
  pos: Vec3;
}

/** Barra (B4, B6, B12), diagonal (D4x6, D6x6, D6x12) ou cabo (CABLE, Kit 3) entre dois nós. */
export interface Member {
  id: string;
  code: string;
  a: string;
  b: string;
  /** mola com enrijecedor (Kit 3: tubo transparente em volta; B6 → BS6, B12 → BS12) */
  stiff?: boolean;
  /**
   * cabo: trechos de um mesmo pedaço de cabo (dividido pelos pontos de cabo) têm o mesmo `chain` (o id do cabo
   * original). Sem `chain`, o pedaço é o próprio membro.
   */
  chain?: string;
}

/** Pedaço de cabo a que o membro pertence. */
export const chainOf = (m: Member) => m.chain ?? m.id;
/** Trechos do mesmo pedaço de cabo (o próprio membro incluído). */
export const chainMembers = (model: Model, m: Member) => Object.values(model.members).filter((o) => chainOf(o) === chainOf(m));

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
  /** canto da chapa (módulos); com giro, é o canto que era (0, 0) */
  x: number;
  z: number;
  /** giro em torno do eixo vertical, em graus (positivo = anti-horário visto de cima); a grade e os eixos da chapa giram junto */
  rot?: number;
  /** nome dado pelo usuário (padrão: "Chapa N") */
  name?: string;
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

/**
 * Coordenadas mostradas ao usuário: Z é a altura. Por dentro (e nos arquivos .mola) o modelo continua com y para cima;
 * na tela, (X, Y, Z) = (x, z, y). A troca é a mesma nos dois sentidos.
 */
export const toDisp = (p: Vec3): Vec3 => [p[0], p[2], p[1]];
export const fromDisp = toDisp;
/** Nome do eixo interno na tela: x → X, y → Z (altura), z → Y. */
export const DISP_AXIS = ["X", "Z", "Y"] as const;

export const EPS = 1e-6;
/** Tolerância para comparar direções unitárias (posições inclinadas são arredondadas a 1e-4). */
export const DIR_TOL = 1e-4;
export const UP: Vec3 = [0, 1, 0];

/**
 * RC90 na base: true = uma RC90 sozinha engasta o pilar na GC; false = trava só o tombamento no plano dela (L10),
 * e duas em lados perpendiculares engastam.
 */
export const RC90_BASE_ENGASTA = true;
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
export function sidesAround(ax: Vec3, frameRad = 0): Vec3[] {
  const a = norm(ax);
  // pilar numa chapa girada: os lados seguem os eixos da chapa
  if (frameRad && Math.abs(Math.abs(a[1]) - 1) < DIR_TOL) return [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((d) => rotDir(d as Vec3, frameRad));
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

/**
 * Pontos de cabo depois de uma remoção: sem o cabo que passa por ele, o ponto sai com os pendurais (o pedaço inteiro
 * de cada um); só com o cabo que passa (sem pendural), os dois trechos voltam a ser um.
 */
function pruneClips(model: Model): { model: Model; changed: boolean } {
  for (const n of Object.values(model.nodes)) {
    if (n.kind !== "clip") continue;
    const at = membersAt(model, n.id);
    const byChain = new Map<string, Member[]>();
    for (const x of at) byChain.set(chainOf(x), [...(byChain.get(chainOf(x)) ?? []), x]);
    const pass = [...byChain.values()].filter((l) => l.length === 2);
    if (!pass.length) {
      // o cabo que passava saiu: tudo o que estava preso no ponto sai junto
      const gone = new Set(at.map(chainOf));
      const members = Object.fromEntries(Object.entries(model.members).filter(([, x]) => !gone.has(chainOf(x))));
      const nodes = { ...model.nodes };
      delete nodes[n.id];
      return { model: { ...model, nodes, members }, changed: true };
    }
    if (pass.length === 1 && at.length === 2) {
      // ponto sem pendural: os dois trechos voltam a ser um
      const [x, y] = pass[0];
      const ex = x.a === n.id ? x.b : x.a;
      const ey = y.a === n.id ? y.b : y.a;
      const members = { ...model.members };
      delete members[y.id];
      const rest = Object.values(members).filter((o) => o.id !== x.id && chainOf(o) === chainOf(x)).length;
      const joined: Member = { ...x, a: ex, b: ey };
      if (!rest) delete joined.chain;
      members[x.id] = joined;
      const nodes = { ...model.nodes };
      delete nodes[n.id];
      return { model: { ...model, nodes, members }, changed: true };
    }
  }
  return { model, changed: false };
}

/** Remove o que ficou sem apoio: ligações sem as barras, placas sem cantos, esferas soltas, pontos de cabo soltos. */
export function prune(model: Model): Model {
  let m = model;
  for (let guard = 0; guard < 10; guard++) {
    let changed = false;
    for (let k = 0; k < 50; k++) {
      const r = pruneClips(m);
      if (!r.changed) break;
      m = r.model;
      changed = true;
    }
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
  const m = model.members[id];
  if (!m) return model;
  // cabo dividido por pontos de cabo: sai o pedaço inteiro
  const members = Object.fromEntries(Object.entries(model.members).filter(([, x]) => chainOf(x) !== chainOf(m)));
  return prune({ ...model, members });
}

/**
 * Divide o cabo `memberId` num ponto de cabo em `pos` (uma bolinha dele): os dois trechos continuam sendo o mesmo
 * pedaço (`chain`).
 */
export function splitRope(model: Model, memberId: string, pos: Vec3): { model: Model; id: string } {
  const m = model.members[memberId];
  const id = newId(model, "n");
  const id2 = `m${model.nextId + 1}`;
  const chain = chainOf(m);
  return {
    id,
    model: {
      ...model,
      nextId: model.nextId + 2,
      nodes: { ...model.nodes, [id]: { id, kind: "clip", pos: round4(pos) } },
      members: { ...model.members, [m.id]: { ...m, b: id, chain }, [id2]: { id: id2, code: m.code, a: id, b: m.b, chain } },
    },
  };
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

/** Remove um nó e tudo o que depende dele. Ponto de cabo: saem os pendurais e o cabo que passava volta a ser um. */
export function removeNode(model: Model, nodeId: string): Model {
  const node = model.nodes[nodeId];
  if (!node) return model;
  if (node.kind === "clip") {
    const at = membersAt(model, nodeId);
    const taps = new Set(at.filter((m) => at.filter((o) => chainOf(o) === chainOf(m)).length === 1).map(chainOf));
    return prune({ ...model, members: Object.fromEntries(Object.entries(model.members).filter(([, m]) => !taps.has(chainOf(m)))) });
  }
  // os cabos que passam pelo nó saem inteiros (todos os trechos)
  const gone = new Set(Object.values(model.members).filter((m) => m.a === nodeId || m.b === nodeId).map(chainOf));
  const members = Object.fromEntries(Object.entries(model.members).filter(([, m]) => !gone.has(chainOf(m))));
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

/** Gira o vetor em torno do eixo vertical (radianos; mesmo sentido do three.js: anti-horário visto de cima). */
export function rotYRad(v: Vec3, rad: number): Vec3 {
  if (!rad) return v;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [v[0] * c + v[2] * s + 0, v[1], -v[0] * s + v[2] * c + 0];
}

/** Direção girada e limpa (zeros de verdade, para não virar "inclinada" por 1e-17). */
export const rotDir = (d: Vec3, rad: number): Vec3 =>
  rad ? (rotYRad(d, rad).map((x) => (Math.abs(x) < 1e-9 ? 0 : Math.round(x * 1e9) / 1e9)) as Vec3) : d;

/** Gira um conjunto de nós (e as ligações deles) por um ângulo qualquer em torno do eixo vertical que passa por `pivot`. */
export function rotateNodes(model: Model, ids: Set<string>, pivot: Vec3, rad: number): Model {
  if (!rad) return model;
  const nodes = { ...model.nodes };
  for (const id of ids) {
    const n = nodes[id];
    nodes[id] = { ...n, pos: round4(add(pivot, rotYRad(sub(n.pos, pivot), rad))) };
  }
  const connectors = { ...model.connectors };
  for (const c of Object.values(connectors)) {
    if (!ids.has(c.node)) continue;
    connectors[c.id] = {
      ...c,
      dirs: c.dirs.map((d) => (c.code === "RC90" ? rotDir(d, rad) : canonicalDir(rotDir(d, rad)))),
      ...(c.side ? { side: rotDir(c.side, rad) } : {}),
    };
  }
  return { ...model, nodes, connectors };
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
