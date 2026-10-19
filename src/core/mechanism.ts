// Modelo cinemático do Kit Mola: o que trava e o que gira, para mover conjuntos e estudar a rigidez.
//
// - Esfera = rótula (articulação esférica): as molas giram livres em volta dela.
// - Mola (B4, B6, B12) = barra: o comprimento não muda.
// - RC90 entre duas molas a 90°: trava o ângulo entre elas (vira um esquadro).
// - CC entre duas molas alinhadas: trava em 180° (viga contínua); CC90 por cima de uma CC: trava o par
//   perpendicular em 180° e o ângulo entre os dois pares.
// - RC90 na base de uma GC: engasta o pilar (o topo dele não sai do lugar).
// - Placa: corpo rígido com as 4 esferas dos cantos.
// - Diagonal e cabo: só tração. Não deixam esticar (vermelho), deixam afrouxar. Não entram na conta de graus de
//   liberdade (seguram só um sentido).
// - GC: fixa na chapa.
//
// Graus de liberdade: 3 × (esferas livres) − posto da matriz de rigidez (vínculos linearizados). Movimento:
// projeção iterativa dos vínculos (barras, alinhamentos, corpos rígidos), com as esferas longe da peça pega
// "mais pesadas" (o que não precisa mexer fica parado).
import type { Catalog } from "./catalog";
import {
  add, canonicalDir, cross, directionFrom, dot, len, memberAlong, membersAt, norm, scale, sub, UP,
  type Connector, type Member, type Model, type Vec3,
} from "./model";

export interface Mech {
  ids: string[];
  index: Map<string, number>;
  /** inverso da massa (0 = fixo: GC e topo de pilar engastado) */
  fixed: boolean[];
  dists: { a: number; b: number; L: number }[];
  lerps: { n: number; a: number; b: number; wa: number; wb: number }[];
  /** corpos rígidos (placas e a forma travada das etapas anteriores): os 3 primeiros pontos fora de uma reta */
  rigids: { idx: number[]; rest: Vec3[]; planar: boolean }[];
  ties: { a: number; b: number; L: number; member: string }[];
  /** ligações e as molas que elas seguram (para acertar as direções depois de mexer) */
  conns: { id: string; members: string[] }[];
  /** o que trava, em palavras (para o painel) */
  locks: { rc90: number; rc90base: number; cc: number; plates: number; ties: number; frozen: number };
}

const isBar = (cat: Catalog) => (m: Member) => cat.pieces[m.code]?.type === "bar";
const isTie = (cat: Catalog, code: string) => cat.pieces[code]?.type === "cable" || cat.pieces[code]?.type === "rope";
const other = (m: Member, n: string) => (m.a === n ? m.b : m.a);

/** Nós ligados (por molas, placas e ligações) a partir de `start`, sem atravessar GC. As GC tocadas entram (fixas). */
export function mechComponent(cat: Catalog, model: Model, start: string[]): Set<string> {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const m of Object.values(model.members)) if (!isTie(cat, m.code)) link(m.a, m.b);
  for (const p of Object.values(model.plates)) for (let i = 0; i < 4; i++) link(p.corners[i], p.corners[(i + 1) % 4]);
  const seen = new Set<string>();
  const stack = [...start];
  while (stack.length) {
    const k = stack.pop()!;
    if (seen.has(k) || !model.nodes[k]) continue;
    seen.add(k);
    if (model.nodes[k].kind === "support" && !start.includes(k)) continue;
    for (const nb of adj.get(k) ?? []) if (!seen.has(nb)) stack.push(nb);
  }
  return seen;
}

/** Monta os vínculos dos nós `ids` (os demais ficam de fora, parados). */
export function buildMech(cat: Catalog, model: Model, ids: Set<string>): Mech {
  const list = [...ids];
  const index = new Map(list.map((id, i) => [id, i]));
  const fixed = list.map((id) => model.nodes[id].kind === "support");
  const dists: Mech["dists"] = [];
  const lerps: Mech["lerps"] = [];
  const rigids: Mech["rigids"] = [];
  const ties: Mech["ties"] = [];
  const conns: Mech["conns"] = [];
  const locks = { rc90: 0, rc90base: 0, cc: 0, plates: 0, ties: 0, frozen: 0 };
  const P = (id: string) => model.nodes[id].pos;
  const I = (id: string) => index.get(id);
  for (const m of Object.values(model.members)) {
    const a = I(m.a);
    const b = I(m.b);
    if (a === undefined && b === undefined) continue;
    const L = len(sub(P(m.b), P(m.a)));
    if (isTie(cat, m.code)) {
      if (a !== undefined && b !== undefined) (ties.push({ a, b, L, member: m.id }), locks.ties++);
      continue;
    }
    // barra para fora do conjunto (não deveria acontecer: o conjunto é fechado por barras)
    if (a === undefined || b === undefined) continue;
    dists.push({ a, b, L });
  }
  const bar = isBar(cat);
  for (const c of Object.values(model.connectors) as Connector[]) {
    const n = I(c.node);
    if (n === undefined) continue;
    if (c.code === "RC90" && c.base) {
      const col = memberAlong(model, c.node, c.dirs[0] ?? UP, bar);
      const top = col ? I(other(col, c.node)) : undefined;
      if (top !== undefined) (fixed[top] = true), locks.rc90base++, conns.push({ id: c.id, members: [col!.id] });
      continue;
    }
    if (c.code === "RC90" && c.dirs.length === 2) {
      const m1 = memberAlong(model, c.node, c.dirs[0], bar);
      const m2 = memberAlong(model, c.node, c.dirs[1], bar);
      if (!m1 || !m2) continue;
      const a = I(other(m1, c.node));
      const b = I(other(m2, c.node));
      if (a === undefined || b === undefined) continue;
      dists.push({ a, b, L: len(sub(P(other(m1, c.node)), P(other(m2, c.node)))) });
      conns.push({ id: c.id, members: [m1.id, m2.id] });
      locks.rc90++;
      continue;
    }
    if (c.code === "CC" || c.code === "CC90") {
      const ax = c.dirs[0];
      if (!ax) continue;
      const m1 = memberAlong(model, c.node, ax, bar);
      const m2 = memberAlong(model, c.node, scale(ax, -1), bar);
      if (!m1 || !m2) continue;
      const ia = I(other(m1, c.node));
      const ib = I(other(m2, c.node));
      if (ia === undefined || ib === undefined) continue;
      const La = len(sub(P(other(m1, c.node)), P(c.node)));
      const Lb = len(sub(P(other(m2, c.node)), P(c.node)));
      // a esfera do meio fica na reta entre as pontas, na mesma proporção
      lerps.push({ n, a: ia, b: ib, wa: Lb / (La + Lb), wb: La / (La + Lb) });
      conns.push({ id: c.id, members: [m1.id, m2.id] });
      locks.cc++;
      if (c.code === "CC90") {
        // trava também o ângulo com o par da CC de baixo (mesmo lado)
        const base = Object.values(model.connectors).find((x) => x.node === c.node && x.code === "CC" && x.side && c.side && len(sub(x.side, c.side)) < 1e-3);
        const bm = base ? memberAlong(model, c.node, base.dirs[0], bar) : undefined;
        const ib2 = bm ? I(other(bm, c.node)) : undefined;
        if (bm && ib2 !== undefined) dists.push({ a: ia, b: ib2, L: len(sub(P(other(m1, c.node)), P(other(bm, c.node)))) });
      }
    }
  }
  for (const p of Object.values(model.plates)) {
    const idx = p.corners.map(I);
    if (idx.some((i) => i === undefined)) continue;
    const r = rigidOf(idx as number[], p.corners.map(P));
    if (!r) continue;
    rigids.push(r);
    locks.plates++;
  }
  return { ids: list, index, fixed, dists, lerps, rigids, ties, conns, locks };
}

/** Corpo rígido com os pontos em ordem boa: os 3 primeiros fora de uma reta (base das contas); plano ou não. */
function rigidOf(idx: number[], rest: Vec3[]): Mech["rigids"][number] | null {
  const n = idx.length;
  const ord = [...Array(n).keys()];
  let found = false;
  for (let i = 2; i < n && !found; i++) {
    if (len(cross(sub(rest[1], rest[0]), sub(rest[i], rest[0]))) > 1e-6 * Math.max(1, len(sub(rest[1], rest[0])) ** 2)) {
      [ord[2], ord[i]] = [ord[i], ord[2]];
      found = true;
    }
  }
  if (!found) return null;
  const r = ord.map((k) => rest[k]);
  const nrm = norm(cross(sub(r[1], r[0]), sub(r[2], r[0])));
  const planar = r.every((p) => Math.abs(dot(sub(p, r[0]), nrm)) < 1e-6);
  return { idx: ord.map((k) => idx[k]), rest: r, planar };
}

/**
 * Edição por etapas (E2f): cada grupo de `groups` (a etapa anterior e as vizinhas) vira um corpo rígido: a forma dele
 * não muda mais, e só a liberdade nova mexe. Devolve outro Mech.
 */
export function freezeShapes(model: Model, mech: Mech, groups: string[][]): Mech {
  const rigids = [...mech.rigids];
  const dists = [...mech.dists];
  let n = 0;
  for (const g of groups) {
    const idx = g.map((id) => mech.index.get(id)).filter((i): i is number => i !== undefined);
    if (idx.length < 2) continue;
    const rest = idx.map((i) => model.nodes[mech.ids[i]].pos);
    const r = idx.length >= 3 ? rigidOf(idx, rest) : null;
    if (r) rigids.push(r);
    // pontos numa reta: as distâncias entre eles bastam
    else for (let k = 1; k < idx.length; k++) dists.push({ a: idx[k - 1], b: idx[k], L: len(sub(rest[k], rest[k - 1])) });
    n++;
  }
  return n ? { ...mech, rigids, dists, locks: { ...mech.locks, frozen: mech.locks.frozen + n } } : mech;
}

export const positionsOf = (model: Model, mech: Mech): Float64Array => {
  const x = new Float64Array(mech.ids.length * 3);
  mech.ids.forEach((id, i) => x.set(model.nodes[id].pos, 3 * i));
  return x;
};
const get = (x: Float64Array, i: number): Vec3 => [x[3 * i], x[3 * i + 1], x[3 * i + 2]];
const put = (x: Float64Array, i: number, v: Vec3) => ((x[3 * i] = v[0]), (x[3 * i + 1] = v[1]), (x[3 * i + 2] = v[2]));

// ---------- rotação ótima (Horn, quatérnio por Jacobi 4×4) ----------

function jacobiTopEigen(A: number[][]): number[] {
  const n = 4;
  const a = A.map((r) => [...r]);
  const v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < n; i++) if (a[i][i] > a[best][best]) best = i;
  return [v[0][best], v[1][best], v[2][best], v[3][best]];
}

/** Rotação R que melhor leva os vetores q (repouso) para p (agora), com pesos. */
function bestRotation(q: Vec3[], p: Vec3[], m: number[]): (v: Vec3) => Vec3 {
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  for (let i = 0; i < q.length; i++) {
    const [a, b, c] = q[i];
    const [x, y, z] = p[i];
    const w = m[i];
    Sxx += w * a * x; Sxy += w * a * y; Sxz += w * a * z;
    Syx += w * b * x; Syy += w * b * y; Syz += w * b * z;
    Szx += w * c * x; Szy += w * c * y; Szz += w * c * z;
  }
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  const [w, x, y, z] = jacobiTopEigen(N);
  const u: Vec3 = [x, y, z];
  // v' = v + 2w (u × v) + 2 u × (u × v)
  return (v: Vec3) => {
    const t = scale(cross(u, v), 2);
    return add(add(v, scale(t, w)), cross(u, t));
  };
}

// ---------- projeção dos vínculos ----------

export interface Pin {
  /** nós que a mão segura (o centro deles vai para `target`) */
  idx: number[];
  target: Vec3;
  /** 0–1: quanto puxa por volta */
  k?: number;
}

/** Peso de cada esfera: as longe da mão pesam mais (mexem menos). Fixas: 0. */
export function weightsFrom(mech: Mech, hand: number[]): Float64Array {
  const n = mech.ids.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const link = (a: number, b: number) => (adj[a].push(b), adj[b].push(a));
  for (const d of mech.dists) link(d.a, d.b);
  for (const l of mech.lerps) (link(l.n, l.a), link(l.n, l.b));
  for (const r of mech.rigids) for (let i = 1; i < r.idx.length; i++) link(r.idx[0], r.idx[i]);
  const dist = new Array(n).fill(Infinity);
  const queue = [...hand];
  hand.forEach((h) => (dist[h] = 0));
  while (queue.length) {
    const k = queue.shift()!;
    for (const nb of adj[k]) if (dist[nb] === Infinity) (dist[nb] = dist[k] + 1), queue.push(nb);
  }
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = mech.fixed[i] ? 0 : 1 / (1 + (Number.isFinite(dist[i]) ? dist[i] : n)) ** 2;
  return w;
}

/** Leva as posições para os vínculos (e, com `pin`, a mão para o alvo). Devolve o maior erro (módulos). */
export function project(mech: Mech, x: Float64Array, w: Float64Array, iters: number, pin?: Pin): number {
  const mass = Array.from(w, (v) => (v > 0 ? 1 / v : 1e9));
  let err = 0;
  for (let it = 0; it < iters; it++) {
    if (pin) {
      const c: Vec3 = [0, 0, 0];
      for (const i of pin.idx) for (let k = 0; k < 3; k++) c[k] += x[3 * i + k] / pin.idx.length;
      const d = scale(sub(pin.target, c), pin.k ?? 1);
      for (const i of pin.idx) if (w[i] > 0) for (let k = 0; k < 3; k++) x[3 * i + k] += d[k];
    }
    err = 0;
    for (const { a, b, L } of mech.dists) {
      const wa = w[a];
      const wb = w[b];
      if (wa + wb === 0) continue;
      const d = sub(get(x, b), get(x, a));
      const l = len(d) || 1e-12;
      const C = l - L;
      err = Math.max(err, Math.abs(C));
      const s = C / (l * (wa + wb));
      for (let k = 0; k < 3; k++) {
        x[3 * a + k] += wa * s * d[k];
        x[3 * b + k] -= wb * s * d[k];
      }
    }
    for (const { n, a, b, wa: fa, wb: fb } of mech.lerps) {
      const den = w[n] + fa * fa * w[a] + fb * fb * w[b];
      if (den === 0) continue;
      for (let k = 0; k < 3; k++) {
        const C = x[3 * n + k] - fa * x[3 * a + k] - fb * x[3 * b + k];
        err = Math.max(err, Math.abs(C));
        const l = C / den;
        x[3 * n + k] -= w[n] * l;
        x[3 * a + k] += fa * w[a] * l;
        x[3 * b + k] += fb * w[b] * l;
      }
    }
    for (const r of mech.rigids) {
      const m = r.idx.map((i) => mass[i]);
      const M = m.reduce((s, v) => s + v, 0);
      const c = r.idx.reduce((s, i, k) => add(s, scale(get(x, i), m[k] / M)), [0, 0, 0] as Vec3);
      const c0 = r.rest.reduce((s, p, k) => add(s, scale(p, m[k] / M)), [0, 0, 0] as Vec3);
      const q = r.rest.map((p) => sub(p, c0));
      const p = r.idx.map((i) => sub(get(x, i), c));
      const R = bestRotation(q, p, m);
      r.idx.forEach((i, k) => {
        const g = add(c, R(q[k]));
        err = Math.max(err, len(sub(g, get(x, i))));
        if (w[i] > 0) put(x, i, g);
      });
    }
    if (err < 1e-7 && !pin) break;
  }
  return err;
}

const centerOf = (x: Float64Array, idx: number[]): Vec3 => idx.reduce((s, i) => add(s, scale(get(x, i), 1 / idx.length)), [0, 0, 0] as Vec3);

// ---------- graus de liberdade (posto da matriz de rigidez) ----------

/** Distâncias que seguram um corpo rígido: o triângulo da base (0, 1, 2) e cada outro ponto até os 3 da base. */
function rigidPairs(n: number): [number, number][] {
  const out: [number, number][] = n >= 2 ? [[0, 1]] : [];
  if (n >= 3) out.push([0, 2], [1, 2]);
  for (let i = 3; i < n; i++) out.push([0, i], [1, i], [2, i]);
  return out;
}

/** Linhas da matriz de rigidez (vínculos linearizados) nas coordenadas das esferas livres. */
function rigidityRows(mech: Mech, x: Float64Array, col: (i: number) => number, C = 3 * mech.ids.filter((_, i) => !mech.fixed[i]).length): number[][] {
  const rows: number[][] = [];
  const row = () => new Array(C).fill(0);
  const set3 = (r: number[], i: number, v: Vec3, s = 1) => {
    const c = col(i);
    if (c < 0) return;
    for (let k = 0; k < 3; k++) r[c + k] += s * v[k];
  };
  for (const { a, b } of mech.dists) {
    const d = sub(get(x, a), get(x, b));
    const r = row();
    set3(r, a, d);
    set3(r, b, d, -1);
    rows.push(r);
  }
  for (const { n, a, b, wa, wb } of mech.lerps) {
    for (let k = 0; k < 3; k++) {
      const e: Vec3 = [0, 0, 0];
      e[k] = 1;
      const r = row();
      set3(r, n, e);
      set3(r, a, e, -wa);
      set3(r, b, e, -wb);
      rows.push(r);
    }
  }
  for (const g of mech.rigids) {
    const idx = g.idx;
    for (const [i, j] of rigidPairs(idx.length)) {
      const d = sub(get(x, idx[i]), get(x, idx[j]));
      const r = row();
      set3(r, idx[i], d);
      set3(r, idx[j], d, -1);
      rows.push(r);
    }
    // corpo plano (placa): os pontos continuam no mesmo plano (senão a conta acharia uma "dobra" que não existe)
    if (g.planar && idx.length >= 4) {
      const [p1, p2, p3] = idx.slice(0, 3).map((i) => get(x, i));
      const e2 = sub(p2, p1);
      const e3 = sub(p3, p1);
      const nrm = cross(e2, e3);
      for (const i4 of idx.slice(3)) {
        const wv = sub(get(x, i4), p1);
        const r = row();
        const g2 = cross(e3, wv);
        const g3 = cross(wv, e2);
        set3(r, idx[1], g2);
        set3(r, idx[2], g3);
        set3(r, i4, nrm);
        set3(r, idx[0], scale(add(add(g2, g3), nrm), -1));
        rows.push(r);
      }
    }
  }
  return rows;
}

/** Resíduos dos vínculos, na mesma ordem das linhas de rigidityRows. */
function residuals(mech: Mech, x: Float64Array): number[] {
  const f: number[] = [];
  for (const { a, b, L } of mech.dists) {
    const d = sub(get(x, a), get(x, b));
    f.push(0.5 * (dot(d, d) - L * L));
  }
  for (const { n, a, b, wa, wb } of mech.lerps) for (let k = 0; k < 3; k++) f.push(x[3 * n + k] - wa * x[3 * a + k] - wb * x[3 * b + k]);
  for (const g of mech.rigids) {
    const idx = g.idx;
    for (const [i, j] of rigidPairs(idx.length)) {
      const d = sub(get(x, idx[i]), get(x, idx[j]));
      const r = sub(g.rest[i], g.rest[j]);
      f.push(0.5 * (dot(d, d) - dot(r, r)));
    }
    if (g.planar && idx.length >= 4) {
      const [p1, p2, p3] = idx.slice(0, 3).map((i) => get(x, i));
      const nrm = cross(sub(p2, p1), sub(p3, p1));
      for (const i4 of idx.slice(3)) f.push(dot(nrm, sub(get(x, i4), p1)));
    }
  }
  return f;
}

/** Resolve A y = b (A quadrada) por eliminação com pivô; devolve null se singular. */
function solveDense(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const y = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * y[k];
    y[r] = s / M[r][r];
  }
  return y;
}

/**
 * Projeção de Gauss–Newton nos vínculos (passo de norma mínima ponderada pelos pesos `w`), com linhas extras
 * opcionais (ex.: a mão a um passo do ponto anterior). Converge bem mesmo perto de configurações planas.
 */
export function newtonProject(
  mech: Mech, x: Float64Array, w: Float64Array, extra?: { rows: (col: (i: number) => number, C: number) => number[][]; f: (x: Float64Array) => number[] },
  iters = 20,
  damping = 1e-10,
): number {
  const n = mech.ids.length;
  const colOf = new Array(n).fill(-1);
  let C = 0;
  for (let i = 0; i < n; i++) if (w[i] > 0) (colOf[i] = C), (C += 3);
  if (!C) return 0;
  const wc = new Array(C).fill(0);
  for (let i = 0; i < n; i++) if (colOf[i] >= 0) for (let k = 0; k < 3; k++) wc[colOf[i] + k] = w[i];
  let err = Infinity;
  for (let it = 0; it < iters; it++) {
    const J = rigidityRows(mech, x, (i) => colOf[i], C);
    const f = residuals(mech, x);
    if (extra) {
      J.push(...extra.rows((i) => colOf[i], C));
      f.push(...extra.f(x));
    }
    err = Math.max(0, ...f.map(Math.abs));
    if (err < 1e-11) break;
    const m = J.length;
    // (J W Jᵀ + μ I) y = −f ; dx = W Jᵀ y
    const JW = J.map((r) => r.map((v, k) => v * wc[k]));
    const A = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => {
      let s = 0;
      const ri = JW[i];
      const rj = J[j];
      for (let k = 0; k < C; k++) s += ri[k] * rj[k];
      return s + (i === j ? damping : 0);
    }));
    const y = solveDense(A, f.map((v) => -v));
    if (!y) break;
    for (let i = 0; i < n; i++) {
      if (colOf[i] < 0) continue;
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (let r = 0; r < m; r++) s += JW[r][colOf[i] + k] * y[r];
        x[3 * i + k] += s;
      }
    }
  }
  return err;
}

/** Escalonamento: posto e base do núcleo (vetores ortonormais). */
function nullSpace(rows: number[][], C: number): { rank: number; basis: number[][] } {
  const A = rows.map((r) => {
    const s = Math.hypot(...r) || 1;
    return r.map((v) => v / s);
  });
  const piv: number[] = [];
  let rank = 0;
  const tol = 1e-9;
  for (let c = 0; c < C && rank < A.length; c++) {
    let best = rank;
    for (let r = rank + 1; r < A.length; r++) if (Math.abs(A[r][c]) > Math.abs(A[best][c])) best = r;
    if (Math.abs(A[best][c]) < tol) continue;
    [A[rank], A[best]] = [A[best], A[rank]];
    const pv = A[rank][c];
    for (let k = c; k < C; k++) A[rank][k] /= pv;
    for (let r = 0; r < A.length; r++) {
      if (r === rank) continue;
      const f = A[r][c];
      if (Math.abs(f) < 1e-15) continue;
      for (let k = c; k < C; k++) A[r][k] -= f * A[rank][k];
    }
    piv.push(c);
    rank++;
  }
  const isPiv = new Set(piv);
  const basis: number[][] = [];
  for (let f = 0; f < C; f++) {
    if (isPiv.has(f)) continue;
    const v = new Array(C).fill(0);
    v[f] = 1;
    piv.forEach((pc, i) => (v[pc] = -A[i][f]));
    // Gram–Schmidt
    for (const b of basis) {
      const d = v.reduce((s, x, i) => s + x * b[i], 0);
      for (let i = 0; i < C; i++) v[i] -= d * b[i];
    }
    const nv = Math.hypot(...v);
    if (nv > 1e-9) basis.push(v.map((x) => x / nv));
  }
  return { rank, basis };
}

export interface Mobility {
  /** graus de liberdade do conjunto (sem contar diagonais e cabos) */
  dof: number;
  /** graus de liberdade da peça pega (0 = travada, 1 = caminho, 2 ou mais = livre) */
  hand: number;
  /** movimento inicial (todas as esferas) que mais mexe a mão */
  v0?: Float64Array;
  /** esferas que conseguem mexer nesse conjunto (índices do mecanismo) */
  moving?: number[];
}

/**
 * Graus de liberdade de verdade (movimentos finitos). A conta linear (núcleo da matriz de rigidez) acha também
 * "dobras" que só existem no infinitesimal (ex.: pórtico plano com RC90 nos esquadros parece poder torcer para fora
 * do plano). Cada direção do núcleo é testada: anda um pouco nela e projeta de volta nos vínculos; se o movimento
 * some na projeção, não é um grau de liberdade de verdade.
 */
export function mobility(mech: Mech, x: Float64Array, hand: number[], opts: { finite?: boolean } = {}): Mobility {
  const n = mech.ids.length;
  const colOf = new Array(n).fill(-1);
  let C = 0;
  mech.fixed.forEach((f, i) => !f && ((colOf[i] = C), (C += 3)));
  if (!C) return { dof: 0, hand: 0 };
  const { basis } = nullSpace(rigidityRows(mech, x, (i) => colOf[i]), C);
  if (!basis.length) return { dof: 0, hand: 0 };
  // estruturas muito grandes: fica a conta linear (o teste finito custaria caro)
  const finite = C <= 450 && opts.finite !== false;
  // teste finito de cada direção
  const eps = 0.1;
  const w = Float64Array.from(mech.fixed, (f) => (f ? 0 : 1));
  const moves: Float64Array[] = [];
  for (const b of basis) {
    const xt = x.slice();
    let nb = 0;
    for (let i = 0; i < n; i++) if (colOf[i] >= 0) for (let k = 0; k < 3; k++) nb = Math.max(nb, Math.abs(b[colOf[i] + k]));
    const s = eps / (nb || 1);
    for (let i = 0; i < n; i++) if (colOf[i] >= 0) for (let k = 0; k < 3; k++) xt[3 * i + k] += s * b[colOf[i] + k];
    if (finite) newtonProject(mech, xt, w);
    const d = new Float64Array(3 * n);
    for (let i = 0; i < 3 * n; i++) d[i] = (xt[i] - x[i]) / s;
    moves.push(d);
  }
  // posto dos movimentos que sobraram (tolerância: o que voltou mais de 70% não conta)
  const rankOf = (vecs: number[][]) => {
    const keep: number[][] = [];
    for (const v0 of vecs) {
      const v = [...v0];
      for (const k of keep) {
        const d = v.reduce((s, x, i) => s + x * k[i], 0);
        for (let i = 0; i < v.length; i++) v[i] -= d * k[i];
      }
      const nv = Math.hypot(...v);
      if (nv > 0.3) keep.push(v.map((x) => x / nv));
    }
    return keep;
  };
  const full = moves.map((d) => Array.from(d));
  const dofKeep = rankOf(full);
  const handIdx = hand.flatMap((i) => [3 * i, 3 * i + 1, 3 * i + 2]);
  const handVecs = moves.map((d) => handIdx.map((k) => d[k]));
  const scaleH = Math.max(1e-9, ...handVecs.map((v) => Math.hypot(...v)));
  const handKeep = rankOf(handVecs.map((v) => v.map((x) => x / Math.max(scaleH, 1e-9))).filter((v) => Math.hypot(...v) > 0.05).map((v) => v.map((x) => x * Math.min(1, 1 / Math.max(...v.map(Math.abs))))));
  // movimento que mais mexe a mão
  let v0: Float64Array | undefined;
  let best = 0;
  for (let j = 0; j < moves.length; j++) {
    const hm = Math.hypot(...handVecs[j]);
    if (hm > best) (best = hm), (v0 = moves[j]);
  }
  // quem consegue mexer (em algum movimento que sobreviveu à projeção): para comparar conjuntos
  const moving: number[] = [];
  if (best > 0.05) {
    const alive = moves.filter((d) => d.reduce((s, v) => Math.max(s, Math.abs(v)), 0) > 0.3);
    for (let i = 0; i < n; i++) {
      if (colOf[i] < 0) continue;
      if (alive.some((d) => Math.hypot(d[3 * i], d[3 * i + 1], d[3 * i + 2]) > 0.05)) moving.push(i);
    }
  }
  return { dof: dofKeep.length, hand: best > 0.05 ? Math.max(1, handKeep.length) : 0, v0: best > 0.05 ? v0 : undefined, moving };
}

/**
 * Leva a mão até o alvo mexendo o mínimo: primeiro só as esferas vizinhas da mão; se não chega, solta mais um
 * anel de esferas, e assim por diante. Devolve as posições e o quanto a mão ficou longe do alvo.
 */
export function dragTo(mech: Mech, x0: Float64Array, hand: number[], target: Vec3): { x: Float64Array; miss: number; err: number } {
  const n = mech.ids.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const link = (a: number, b: number) => (adj[a].push(b), adj[b].push(a));
  for (const d of mech.dists) link(d.a, d.b);
  for (const l of mech.lerps) (link(l.n, l.a), link(l.n, l.b));
  for (const r of mech.rigids) for (let i = 1; i < r.idx.length; i++) link(r.idx[0], r.idx[i]);
  const dist = new Array(n).fill(Infinity);
  const queue = [...hand];
  hand.forEach((h) => (dist[h] = 0));
  while (queue.length) {
    const k = queue.shift()!;
    for (const nb of adj[k]) if (dist[nb] === Infinity) (dist[nb] = dist[k] + 1), queue.push(nb);
  }
  const maxD = Math.max(1, ...dist.filter(Number.isFinite));
  let best: { x: Float64Array; miss: number; err: number } | null = null;
  // r = 0: só as esferas da própria peça; depois, um anel de vizinhas por vez
  for (let r = 0, shake = 0; r <= maxD; shake ? (r++, (shake = 0)) : (shake = 1)) {
    const w = Float64Array.from(dist, (d, i) => (mech.fixed[i] || d > r ? 0 : 1 / (1 + d) ** 2));
    const x = x0.slice();
    // segunda tentativa no mesmo anel: um empurrãozinho para sair da simetria (ex.: tudo num plano)
    if (shake) for (let i = 0; i < n; i++) if (w[i] > 0) for (let k = 0; k < 3; k++) x[3 * i + k] += 1e-3 * Math.sin(12.9898 * (3 * i + k + 1));
    for (let round = 0; round < 40; round++) {
      project(mech, x, w, 4, { idx: hand, target, k: 1 });
      project(mech, x, w, 20);
    }
    project(mech, x, w, 100);
    // acerto fino: a mão no alvo (se der) e os vínculos exatos
    const pinRows = {
      rows: (col: (i: number) => number, C: number) =>
        [0, 1, 2].map((k) => {
          const r = new Array(C).fill(0);
          for (const h of hand) if (col(h) >= 0) r[col(h) + k] = 1 / hand.length;
          return r;
        }),
      f: (xx: Float64Array) => sub(centerOf(xx, hand), target),
    };
    newtonProject(mech, x, w, pinRows, 15, 1e-4);
    const err = newtonProject(mech, x, w);
    const miss = len(sub(centerOf(x, hand), target));
    const cand = { x, miss, err };
    if (err < 1e-4 && (!best || best.err >= 1e-4 || miss < best.miss - 1e-3)) best = cand;
    if (err < 1e-4 && miss < 0.02) return cand;
  }
  return best ?? { x: x0.slice(), miss: len(sub(centerOf(x0, hand), target)), err: 0 };
}

// ---------- caminho (1 grau de liberdade) ----------

export interface PathSample {
  x: Float64Array;
  /** centro da mão */
  h: Vec3;
}


/**
 * Percorre o caminho da mão nos dois sentidos a partir de `x0` (continuação com passo `step` em módulos),
 * até fechar a volta, travar (ponto morto) ou andar demais. Devolve as amostras em ordem, com o índice do começo.
 */
export function tracePath(mech: Mech, x0: Float64Array, hand: number[], v0: Float64Array, step = 0.12, maxSteps = 900): { samples: PathSample[]; start: number; closed: boolean } {
  const w = weightsFrom(mech, hand);
  const h0 = centerOf(x0, hand);
  const hv = norm(centerOf(v0, hand));
  const run = (sign: number) => {
    const out: PathSample[] = [];
    let x = x0.slice();
    let prev = x0.slice();
    let dir = scale(hv, sign);
    for (let s = 0; s < maxSteps; s++) {
      const hPrev = centerOf(x, hand);
      // previsão: segue o último passo (ou o movimento inicial)
      const guess = x.slice();
      if (s === 0) {
        const vh = len(centerOf(v0, hand)) || 1;
        for (let i = 0; i < guess.length; i++) guess[i] += (sign * step * v0[i]) / vh;
      } else for (let i = 0; i < guess.length; i++) guess[i] += x[i] - prev[i];
      // correção: a mão a um passo do ponto anterior, na direção em que vinha
      const target = add(hPrev, scale(dir, step));
      for (let round = 0; round < 4; round++) {
        project(mech, guess, w, 6, { idx: hand, target, k: 1 });
        project(mech, guess, w, 20);
      }
      // acerto fino (Gauss–Newton): vínculos exatos com a mão a um passo do ponto anterior
      const d0 = dir;
      const arc = {
        rows: (col: (i: number) => number, C: number) => {
          const r = new Array(C).fill(0);
          for (const h of hand) if (col(h) >= 0) for (let k = 0; k < 3; k++) r[col(h) + k] = d0[k] / hand.length;
          return [r];
        },
        f: (xx: Float64Array) => [dot(sub(centerOf(xx, hand), hPrev), d0) - step],
      };
      const err = newtonProject(mech, guess, w, arc, 12);
      if (!(err < 1e-6)) break;
      const h = centerOf(guess, hand);
      const moved = sub(h, hPrev);
      const ml = len(moved);
      if (ml < step * 0.3) break; // travou (ponto morto)
      const nd = scale(moved, 1 / ml);
      if (dot(nd, dir) < -0.2) break; // voltou: ponto morto
      dir = nd;
      prev = x;
      x = guess;
      out.push({ x: guess, h });
      if (s > 12 && len(sub(h, h0)) < step * 0.8) return { out, closed: true };
    }
    return { out, closed: false };
  };
  const fwd = run(1);
  if (fwd.closed) return { samples: [{ x: x0.slice(), h: h0 }, ...fwd.out], start: 0, closed: true };
  const back = run(-1);
  return { samples: [...back.out.reverse(), { x: x0.slice(), h: h0 }, ...fwd.out], start: back.out.length, closed: false };
}

/** Modelo com as posições `x` (e as ligações acompanhando as molas). */
export function modelAt(model: Model, mech: Mech, x: Float64Array): { model: Model; moved: Set<string> } {
  const nodes = { ...model.nodes };
  const moved = new Set<string>();
  mech.ids.forEach((id, i) => {
    const p = get(x, i).map((v) => Math.round(v * 1e4) / 1e4 + 0) as Vec3;
    if (len(sub(p, model.nodes[id].pos)) > 1e-6) (nodes[id] = { ...model.nodes[id], pos: p }), moved.add(id);
  });
  const next: Model = { ...model, nodes };
  const connectors = { ...model.connectors };
  for (const { id, members } of mech.conns) {
    const c = model.connectors[id];
    if (!c || !moved.size) continue;
    const ms = members.map((k) => model.members[k]).filter(Boolean);
    if (c.code === "RC90" && !c.base && ms.length === 2) {
      connectors[id] = { ...c, dirs: ms.map((m) => directionFrom(next, m, c.node)) };
    } else if ((c.code === "CC" || c.code === "CC90") && ms.length === 2) {
      const ax = canonicalDir(directionFrom(next, ms[0], c.node));
      const side = c.side ? norm(sub(c.side, scale(ax, dot(c.side, ax)))) : undefined;
      connectors[id] = { ...c, dirs: [ax], ...(side && len(side) > 0.5 ? { side } : {}) };
    }
  }
  return { model: { ...next, connectors }, moved };
}

/** Diagonais e cabos esticados além do comprimento (só tração): nomes das peças. */
export function stretchedTies(mech: Mech, x: Float64Array, tol: number): string[] {
  return mech.ties.filter((t) => len(sub(get(x, t.b), get(x, t.a))) > t.L + tol).map((t) => t.member);
}

/** Barras que chegam em cada esfera (para os ângulos mínimos depois de mexer). */
export function barsAt(cat: Catalog, model: Model, node: string): Vec3[] {
  return membersAt(model, node).filter((m) => cat.pieces[m.code]?.type === "bar").map((m) => directionFrom(model, m, node));
}
