// Projeção ortográfica do modelo nas plantas e vistas A–D, com os símbolos das pranchas do Desafio 2022.
import type { Catalog } from "../core/catalog";
import { type Model, type Vec3, cross, norm, sub } from "../core/model";
import { GRAY, PEN, type Prim, type Pt } from "./prims";

export type ViewId = "A" | "B" | "C" | "D" | "plan" | "iso";

/** Vetores da vista em coordenadas do mundo (mm): h = direita no papel, v = para cima, d = em direção a quem olha. */
const VIEW: Record<"A" | "B" | "C" | "D", { h: Vec3; d: Vec3 }> = {
  A: { h: [1, 0, 0], d: [0, 0, 1] }, // olhando para −z (frente)
  B: { h: [0, 0, 1], d: [-1, 0, 0] }, // olhando para +x (esquerda)
  C: { h: [-1, 0, 0], d: [0, 0, -1] }, // fundos
  D: { h: [0, 0, -1], d: [1, 0, 0] }, // direita
};

export interface Projector {
  id: ViewId;
  /** mundo (mm) → [h, v, profundidade] (mm reais; v para cima; profundidade maior = mais perto) */
  p: (w: Vec3) => [number, number, number];
  depthAxis: Vec3;
}

export function projector(id: ViewId): Projector {
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (id === "plan") return { id, p: (w) => [w[0], -w[2], w[1]], depthAxis: [0, 1, 0] };
  if (id === "iso") {
    // vista de frente-direita-cima
    const c = norm([1, 0.9, 1.25]);
    const r = norm(cross([0, 1, 0], c));
    const u = cross(c, r);
    return { id, p: (w) => [dot(w, r), dot(w, u), dot(w, c)], depthAxis: c };
  }
  const { h, d } = VIEW[id];
  return { id, p: (w) => [dot(w, h), w[1], dot(w, d)], depthAxis: d };
}

/** Elemento desenhável: forma 2D (mm reais) + profundidade para a ordem de pintura. */
export interface Item {
  depth: number;
  order: number; // desempate: placas < barras < cabos < ligações < esferas
  kind: "plate-h" | "plate-v" | "bar-v" | "bar-h" | "cable" | "node" | "base" | "rc90" | "cc";
  anchor: [number, number]; // ponto para a chamada
  draw: (to: (q: [number, number]) => Pt, s: number) => Prim[];
  level?: number; // y (mm) do elemento, para plantas
}

export interface World {
  M: number;
  baseY: number; // altura do centro da esfera da GC acima da chapa
  R: number; // raio da esfera
  pos: (p: Vec3) => Vec3; // módulos → mm
}

export function world(cat: Catalog): World {
  const s = cat.settings;
  const M = s.modulo_mm;
  const baseY = s.gc_centro_esfera_mm;
  return { M, baseY, R: s.esfera_diametro_mm / 2, pos: (p) => [p[0] * M, baseY + p[1] * M, p[2] * M] };
}

const add2 = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul2 = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const len2 = (a: Pt) => Math.hypot(a[0], a[1]);
const sub2 = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];

/** Retângulo 2D ao redor de um segmento, com espessura total `w` (mm reais). */
function segRect(a: Pt, b: Pt, w: number): Pt[] {
  const d = sub2(b, a);
  const L = len2(d) || 1;
  const n: Pt = [(-d[1] / L) * (w / 2), (d[0] / L) * (w / 2)];
  return [add2(a, n), add2(b, n), sub2(b, n), sub2(a, n)];
}

/** Forma plana 3D (polígono) vista na projeção: de frente vira polígono; de lado vira um retângulo fino. */
function planar(pr: Projector, pts3: Vec3[], normal: Vec3, thickness: number): Pt[] {
  const facing = Math.abs(normal[0] * pr.depthAxis[0] + normal[1] * pr.depthAxis[1] + normal[2] * pr.depthAxis[2]) > 0.3;
  const q = pts3.map((w) => pr.p(w)).map(([h, v]) => [h, v] as Pt);
  if (facing) return q;
  // de lado: o polígono vira um segmento; desenha a espessura
  let best: [Pt, Pt] = [q[0], q[0]];
  let bestL = -1;
  for (const a of q) for (const b of q) if (len2(sub2(a, b)) > bestL) (bestL = len2(sub2(a, b))), (best = [a, b]);
  return segRect(best[0], best[1], thickness);
}

/** Itens do modelo vistos de uma direção. */
export function itemsFor(cat: Catalog, model: Model, pr: Projector): Item[] {
  const s = cat.settings;
  const W = world(cat);
  const R = W.R;
  const items: Item[] = [];
  const P = (id: string) => W.pos(model.nodes[id].pos);
  const typeOf = (code: string) => cat.pieces[code]?.type;
  const poly = (pts: Pt[], fill: string | null, layer: Prim["layer"], pen = PEN.part): Item["draw"] =>
    (to) => [{ t: "poly", pts: pts.map(to), closed: true, fill, stroke: "#000", pen, layer }];

  // ligações de base e esferas
  for (const n of Object.values(model.nodes)) {
    const w = W.pos(n.pos);
    const [h, v, d] = pr.p(w);
    if (n.kind === "support") {
      const r = s.gc_diametro_mm / 2;
      if (pr.id === "plan") {
        items.push({
          depth: 0, order: 0, kind: "base", anchor: [h + r * 0.7, v - r * 0.7], level: w[1],
          draw: (to, k) => [
            { t: "circle", c: to([h, v]), r: r * k, fill: GRAY.node, stroke: "#000", pen: PEN.base, layer: "MOLA-BASE" },
            { t: "circle", c: to([h, v]), r: (R + 2.5) * k, fill: null, stroke: "#000", pen: PEN.thin, layer: "MOLA-BASE" },
          ],
        });
      } else if (pr.id === "iso") {
        const gh = s.gc_altura_mm;
        const ring = (y: number) => Array.from({ length: 28 }, (_, i) => {
          const a = (i / 28) * Math.PI * 2;
          const q = pr.p([w[0] + Math.cos(a) * r, y, w[2] + Math.sin(a) * r]);
          return [q[0], q[1]] as Pt;
        });
        const top = ring(gh);
        const bottom = ring(0);
        // silhueta: casca convexa de topo + base
        const hull = convexHull([...top, ...bottom]);
        items.push({
          depth: d - r, order: 0, kind: "base", anchor: [h, v],
          draw: (to) => [
            { t: "poly", pts: hull.map(to), closed: true, fill: GRAY.node, stroke: "#000", pen: PEN.base, layer: "MOLA-BASE" },
            { t: "poly", pts: top.map(to), closed: true, fill: GRAY.light, stroke: "#000", pen: PEN.thin, layer: "MOLA-BASE" },
          ],
        });
      } else {
        const gh = s.gc_altura_mm;
        items.push({
          depth: d + 0.01, order: 4, kind: "base", anchor: [h + r * 0.8, gh / 2],
          draw: (to, k) => [
            { t: "circle", c: to([h, v]), r: R * k, fill: GRAY.node, stroke: "#000", pen: PEN.part, layer: "MOLA-ESFERA" },
            { t: "poly", pts: [[h - r, 0], [h + r, 0], [h + r, gh], [h - r, gh]].map((q) => to(q as Pt)), closed: true, fill: GRAY.node, stroke: "#000", pen: PEN.base, layer: "MOLA-BASE" },
          ],
        });
      }
    }
    if (n.kind === "support" && pr.id !== "plan") continue; // a GC já desenha a esfera embutida
    items.push({
      depth: d, order: 5, kind: "node", anchor: [h + R * 0.7, v + R * 0.7], level: w[1],
      draw: (to, k) => [{ t: "circle", c: to([h, v]), r: R * k, fill: GRAY.node, stroke: "#000", pen: PEN.part, layer: "MOLA-ESFERA" }],
    });
  }

  // barras e diagonais
  for (const m of Object.values(model.members)) {
    const a = P(m.a);
    const b = P(m.b);
    const [ah, av, ad] = pr.p(a);
    const [bh, bv, bd] = pr.p(b);
    const a2: Pt = [ah, av];
    const b2: Pt = [bh, bv];
    const L = len2(sub2(b2, a2));
    if (L < 1) continue; // de topo: escondida atrás da esfera
    const u = mul2(sub2(b2, a2), 1 / L);
    const depth = (ad + bd) / 2;
    const level = Math.min(a[1], b[1]);
    if (typeOf(m.code) === "cable") {
      // nas vistas, diagonal vista de lado (plano dela de topo) some atrás das barras, como nas pranchas de 2022
      const dw = norm(sub(b, a));
      if (pr.id !== "plan" && pr.id !== "iso" && Math.abs(dw[0] * pr.depthAxis[0] + dw[1] * pr.depthAxis[1] + dw[2] * pr.depthAxis[2]) > 0.1) continue;
      const t = s.diagonal_terminal_mm;
      // encurtamento proporcional ao que aparece da diagonal nesta vista
      const L3 = Math.hypot(...sub(b, a));
      const kk = L / L3;
      const p1 = add2(a2, mul2(u, (R + t / 2) * kk));
      const p2 = sub2(b2, mul2(u, (R + t / 2) * kk));
      const diamond = (c: Pt): Pt[] => [[c[0], c[1] + t * 0.7], [c[0] + t * 0.7, c[1]], [c[0], c[1] - t * 0.7], [c[0] - t * 0.7, c[1]]];
      items.push({
        depth, order: 3, kind: "cable", anchor: mul2(add2(p1, p2), 0.5), level,
        draw: (to) => [
          { t: "line", a: to(p1), b: to(p2), stroke: "#000", pen: PEN.thin * 1.5, layer: "MOLA-DIAGONAL" },
          { t: "poly", pts: diamond(p1).map(to), closed: true, fill: GRAY.light, stroke: "#000", pen: PEN.thin, layer: "MOLA-DIAGONAL" },
          { t: "poly", pts: diamond(p2).map(to), closed: true, fill: GRAY.light, stroke: "#000", pen: PEN.thin, layer: "MOLA-DIAGONAL" },
        ],
      });
      continue;
    }
    const vertical = Math.abs(a[1] - b[1]) > 1;
    const rect = segRect(add2(a2, mul2(u, R * 0.6)), sub2(b2, mul2(u, R * 0.6)), s.barra_diametro_mm);
    items.push({
      depth, order: 2, kind: vertical ? "bar-v" : "bar-h", anchor: mul2(add2(a2, b2), 0.5), level,
      draw: poly(rect, GRAY.light, "MOLA-BARRA"),
    });
  }

  // placas
  for (const p of Object.values(model.plates)) {
    const c = p.corners.map(P);
    const u = norm(sub(c[1], c[0]));
    const v = norm(sub(c[3], c[0]));
    const n = norm(cross(u, v));
    const center = c.reduce((acc, q) => [acc[0] + q[0] / 4, acc[1] + q[1] / 4, acc[2] + q[2] / 4] as Vec3, [0, 0, 0] as Vec3);
    const hu = Math.hypot(...sub(c[1], c[0])) / 2 - s.placa_desconto_mm / 2;
    const hv = Math.hypot(...sub(c[3], c[0])) / 2 - s.placa_desconto_mm / 2;
    const ch = Math.min(8, hu / 3, hv / 3);
    const at = (x: number, y: number): Vec3 => [center[0] + u[0] * x + v[0] * y, center[1] + u[1] * x + v[1] * y, center[2] + u[2] * x + v[2] * y];
    const outline3 = [at(-hu + ch, -hv), at(hu - ch, -hv), at(hu, -hv + ch), at(hu, hv - ch), at(hu - ch, hv), at(-hu + ch, hv), at(-hu, hv - ch), at(-hu, -hv + ch)];
    const horizontal = Math.abs(n[1]) > 0.5;
    const pts = planar(pr, outline3, n, Number(cat.pieces[p.code]?.geometry.thicknessMm ?? s.placa_espessura_mm));
    const [, , d] = pr.p(center);
    const facing = pts.length > 4;
    const wallInPlan = pr.id === "plan" && !horizontal;
    items.push({
      depth: d - 0.5, order: 1, kind: horizontal ? "plate-h" : "plate-v",
      anchor: [pr.p(center)[0], pr.p(center)[1]], level: Math.min(...c.map((q) => q[1])),
      draw: poly(pts, wallInPlan ? GRAY.dark : facing ? GRAY.light : GRAY.light, "MOLA-PLACA", wallInPlan ? PEN.ground : PEN.part),
    });
  }

  // ligações
  for (const cn of Object.values(model.connectors)) {
    const at = P(cn.node);
    const [, , d] = pr.p(at);
    const shift = (x: Vec3, ux: Vec3, k1: number, uy: Vec3, k2: number): Vec3 => [
      x[0] + ux[0] * k1 + uy[0] * k2, x[1] + ux[1] * k1 + uy[1] * k2, x[2] + ux[2] * k1 + uy[2] * k2,
    ];
    let pts3: Vec3[];
    let n: Vec3;
    let kind: Item["kind"] = "cc";
    if (cn.code === "RC90") {
      kind = "rc90";
      const leg = s.rc90_cateto_mm;
      const ux = cn.base ? cn.dirs[1] : cn.dirs[0];
      const uy = cn.base ? cn.dirs[0] : cn.dirs[1];
      n = norm(cross(ux, uy));
      const a = s.barra_diametro_mm / 2;
      if (cn.base) {
        const top = s.gc_altura_mm - s.gc_centro_esfera_mm;
        pts3 = [shift(at, ux, a, uy, top), shift(at, ux, a + leg, uy, top), shift(at, ux, a, uy, top + leg)];
      } else {
        const r0 = R * 0.8;
        const r1 = R + leg;
        pts3 = [shift(at, ux, r0, uy, a), shift(at, ux, r1, uy, a), shift(at, ux, a, uy, r1), shift(at, ux, a, uy, r0)];
      }
    } else {
      const ax = cn.dirs[0];
      const side: Vec3 = Math.abs(ax[1]) > 0.5 ? [1, 0, 0] : [0, 1, 0];
      n = norm(cross(ax, side));
      const Lc = R + 14;
      const tall = cn.code === "CC90";
      const b0 = tall ? R + 1.5 : s.barra_diametro_mm / 2;
      const h = tall ? 9 : 5;
      pts3 = [shift(at, ax, -Lc, side, b0), shift(at, ax, Lc, side, b0), shift(at, ax, Lc - 4, side, b0 + h), shift(at, ax, -Lc + 4, side, b0 + h)];
    }
    const pts = planar(pr, pts3, n, s.rc90_espessura_mm);
    const mid = pts.reduce((acc, q) => add2(acc, mul2(q, 1 / pts.length)), [0, 0] as Pt);
    items.push({ depth: d + 0.2, order: 4, kind, anchor: mid, level: at[1], draw: poly(pts, GRAY.node, "MOLA-LIGACAO") });
  }
  return items;
}

/** Limites (mm reais, h e v) dos itens de uma vista. */
export function bounds(items: Item[], extra: Pt[] = []) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const take = (q: Pt) => {
    x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
  };
  for (const it of items) {
    for (const pr of it.draw((q) => q, 1)) {
      if (pr.t === "line") (take(pr.a), take(pr.b));
      else if (pr.t === "poly") pr.pts.forEach(take);
      else if (pr.t === "circle") (take([pr.c[0] - pr.r, pr.c[1] - pr.r]), take([pr.c[0] + pr.r, pr.c[1] + pr.r]));
    }
  }
  extra.forEach(take);
  if (!Number.isFinite(x0)) return { x0: 0, x1: 1, y0: 0, y1: 1 };
  return { x0, x1, y0, y1 };
}

/** Casca convexa (Andrew). */
export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const crossZ = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
