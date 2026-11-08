// Geometria das colisões: distâncias entre segmentos e o contorno da RC90 no espaço (em módulos).
import type { Catalog } from "./catalog";
import { add, cross, dot, len, norm, scale, sub, UP, type Vec3 } from "./model";

/** Menor distância entre os segmentos p1–q1 e p2–q2. */
export function segSegDist(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s: number;
  let t: number;
  if (a < 1e-12 && e < 1e-12) return len(r);
  if (a < 1e-12) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = dot(d1, r);
    if (e < 1e-12) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  return len(sub(add(p1, scale(d1, s)), add(p2, scale(d2, t))));
}

/** Distância do ponto ao segmento a–b. */
export function pointSegDist(p: Vec3, a: Vec3, b: Vec3): number {
  const d = sub(b, a);
  const L2 = dot(d, d);
  const t = L2 < 1e-12 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), d) / L2));
  return len(sub(p, add(a, scale(d, t))));
}

/** Contorno da RC90 (polígono plano, em módulos), igual ao desenho 3D. */
export function rc90Outline(cat: Catalog, at: Vec3, dirs: Vec3[], base?: boolean): Vec3[] {
  const s = cat.settings;
  const M = s.modulo_mm;
  const R = s.esfera_diametro_mm / 2;
  const a = s.barra_diametro_mm / 2;
  const leg = s.rc90_cateto_mm;
  const u = base ? dirs[1] : dirs[0];
  const v = base ? dirs[0] ?? UP : dirs[1];
  let pts: [number, number][];
  if (base) {
    const top = s.gc_altura_mm - s.gc_centro_esfera_mm;
    pts = [[a, top], [a + leg, top], [a, top + leg]];
  } else {
    pts = [[R * 0.8, a], [R + leg, a], [a, R + leg], [a, R * 0.8]];
  }
  return pts.map(([x, y]) => add(at, add(scale(u, x / M), scale(v, y / M))));
}

/** Encolhe o polígono rumo ao centro (`by` em módulos): encostar não é cruzar. */
function shrink(poly: Vec3[], by: number): Vec3[] {
  const c = scale(poly.reduce((acc, p) => add(acc, p), [0, 0, 0] as Vec3), 1 / poly.length);
  return poly.map((p) => {
    const w = sub(p, c);
    const L = len(w);
    return L <= by ? c : add(c, scale(w, (L - by) / L));
  });
}

const normalOf = (poly: Vec3[]) => norm(cross(sub(poly[1], poly[0]), sub(poly[poly.length - 1], poly[0])));

/** Base 2D do plano do polígono. */
function frame(poly: Vec3[]) {
  const n = normalOf(poly);
  const ex = norm(sub(poly[1], poly[0]));
  const ey = cross(n, ex);
  const o = poly[0];
  return { n, to2: (p: Vec3): [number, number] => [dot(sub(p, o), ex), dot(sub(p, o), ey)] };
}

/** Polígonos convexos 2D se sobrepõem (eixos separadores)? */
function overlap2D(A: [number, number][], B: [number, number][]): boolean {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i];
      const [x2, y2] = P[(i + 1) % P.length];
      const ax = [y1 - y2, x2 - x1];
      const proj = (Q: [number, number][]) => Q.map(([x, y]) => x * ax[0] + y * ax[1]);
      const pa = proj(A);
      const pb = proj(B);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
    }
  }
  return true;
}

/** O ponto (no plano) está dentro do polígono convexo 2D? */
function inside2D(P: [number, number][], q: [number, number]): boolean {
  let sign = 0;
  for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i];
    const [x2, y2] = P[(i + 1) % P.length];
    const c = (x2 - x1) * (q[1] - y1) - (y2 - y1) * (q[0] - x1);
    if (Math.abs(c) < 1e-9) return false;
    const sg = Math.sign(c);
    if (sign && sg !== sign) return false;
    sign = sg;
  }
  return true;
}

/** O segmento a–b passa pelo miolo do polígono plano convexo? */
export function segmentHitsPolygon(a: Vec3, b: Vec3, polyIn: Vec3[], margin = 0.03): boolean {
  const poly = shrink(polyIn, margin);
  const { n, to2 } = frame(poly);
  const P = poly.map(to2);
  const da = dot(sub(a, poly[0]), n);
  const db = dot(sub(b, poly[0]), n);
  const tol = 1e-4;
  if (Math.abs(da) < tol && Math.abs(db) < tol) {
    // no plano: o segmento vira um polígono "fino"
    const A = to2(a);
    const B = to2(b);
    if (inside2D(P, A) || inside2D(P, B)) return true;
    const w = 1e-6;
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * w;
    const ny = (dx / L) * w;
    return overlap2D(P, [[A[0] + nx, A[1] + ny], [B[0] + nx, B[1] + ny], [B[0] - nx, B[1] - ny], [A[0] - nx, A[1] - ny]]);
  }
  if (da * db > 0) return false;
  const t = Math.abs(da - db) < 1e-12 ? 0 : da / (da - db);
  return inside2D(P, to2(add(a, scale(sub(b, a), t))));
}

/** Dois polígonos planos convexos se cruzam (encostar não conta)? */
export function polygonsCross(Ain: Vec3[], Bin: Vec3[], margin = 0.03): boolean {
  const A = shrink(Ain, margin);
  const B = shrink(Bin, margin);
  const na = normalOf(A);
  const nb = normalOf(B);
  if (Math.abs(dot(na, nb)) > 1 - 1e-6) {
    if (Math.abs(dot(sub(B[0], A[0]), na)) > 1e-4) return false; // planos paralelos separados
    const { to2 } = frame(A);
    return overlap2D(A.map(to2), B.map(to2));
  }
  const edges = (P: Vec3[]) => P.map((p, i) => [p, P[(i + 1) % P.length]] as const);
  return edges(A).some(([p, q]) => segmentHitsPolygon(p, q, B, 0)) || edges(B).some(([p, q]) => segmentHitsPolygon(p, q, A, 0));
}

// ---------- placas de qualquer formato (base para a placa ajustável da 2.x, X7) ----------
// As placas do kit são retângulos e seguem pelo caminho de sempre (`isRectangle`). Só uma placa que não é
// retângulo (vinda de um .mola com peça criada) usa as contas de polígono abaixo.

/** Centro (média dos cantos). */
export const polyCenter = (ps: Vec3[]): Vec3 => scale(ps.reduce((acc, p) => add(acc, p), [0, 0, 0] as Vec3), 1 / ps.length);

/** Normal do polígono plano pelo método de Newell (vale para qualquer número de cantos e para côncavos). */
export function polyNormal(ps: Vec3[]): Vec3 {
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    const b = ps[(i + 1) % ps.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return len(n) < 1e-12 ? [0, 1, 0] : norm(n);
}

/** Todos os cantos no mesmo plano (X7: a placa é sempre plana)? `tol` em módulos. */
export function isPlanar(ps: Vec3[], tol = 1e-3): boolean {
  if (ps.length < 3) return false;
  const n = polyNormal(ps);
  const c = polyCenter(ps);
  return ps.every((p) => Math.abs(dot(sub(p, c), n)) <= tol);
}

/**
 * Quatro cantos em retângulo, na ordem ao redor (as placas do kit). `tol` é relativa (vale em módulos ou em mm):
 * o cosseno entre os lados e o erro do 4º canto, dividido pelo lado maior, ficam abaixo dela.
 */
export function isRectangle(ps: Vec3[], tol = 1e-6): boolean {
  if (ps.length !== 4) return false;
  const u = sub(ps[1], ps[0]);
  const v = sub(ps[3], ps[0]);
  const lu = len(u);
  const lv = len(v);
  if (lu < 1e-9 || lv < 1e-9) return false;
  return Math.abs(dot(u, v)) <= tol * lu * lv && len(sub(add(ps[0], add(u, v)), ps[2])) <= tol * Math.max(lu, lv);
}

/** Polígono 2D convexo (cantos em ordem, sem três seguidos alinhados contando como quebra)? */
export function isConvex2(P: [number, number][]): boolean {
  let sign = 0;
  for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i];
    const [x2, y2] = P[(i + 1) % P.length];
    const [x3, y3] = P[(i + 2) % P.length];
    const c = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2);
    if (Math.abs(c) < 1e-12) continue;
    if (sign && Math.sign(c) !== sign) return false;
    sign = Math.sign(c);
  }
  return sign !== 0;
}

/** Os lados não se cruzam (polígono simples; côncavo pode)? */
export function isSimple2(P: [number, number][]): boolean {
  const n = P.length;
  const cross2 = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) {
    const a = P[i];
    const b = P[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // lados vizinhos pelo fecho
      const c = P[j];
      const d = P[(j + 1) % n];
      const d1 = cross2(a, b, c);
      const d2 = cross2(a, b, d);
      const d3 = cross2(c, d, a);
      const d4 = cross2(c, d, b);
      if (d1 * d2 < 0 && d3 * d4 < 0) return false;
    }
  }
  return true;
}

/** Cantos no plano do polígono, em coordenadas 2D (origem no 1º canto, x ao longo do 1º lado). */
export function polyTo2D(ps: Vec3[]): { pts: [number, number][]; origin: Vec3; ex: Vec3; ey: Vec3; n: Vec3 } {
  const n = polyNormal(ps);
  const ex = norm(sub(ps[1], ps[0]));
  const ey = cross(n, ex);
  const o = ps[0];
  return { pts: ps.map((p) => [dot(sub(p, o), ex), dot(sub(p, o), ey)]), origin: o, ex, ey, n };
}

/**
 * Recua cada lado do polígono convexo 2D `d` para dentro (a folga entre a placa e as esferas): cada canto novo é o
 * cruzamento dos dois lados recuados. Em polígono côncavo o resultado é aproximado (a confirmar com a placa côncava, X7).
 */
export function insetPolygon2(P: [number, number][], d: number): [number, number][] {
  const n = P.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1];
  const s = area >= 0 ? 1 : -1; // anti-horário: para dentro é a esquerda
  const lines = P.map((a, i) => {
    const b = P[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / L) * s;
    const ny = ((b[0] - a[0]) / L) * s;
    return { a: [a[0] + nx * d, a[1] + ny * d] as [number, number], dir: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] as [number, number] };
  });
  return P.map((_, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const det = l1.dir[0] * l2.dir[1] - l1.dir[1] * l2.dir[0];
    if (Math.abs(det) < 1e-9) return l2.a;
    const t = ((l2.a[0] - l1.a[0]) * l2.dir[1] - (l2.a[1] - l1.a[1]) * l2.dir[0]) / det;
    return [l1.a[0] + l1.dir[0] * t, l1.a[1] + l1.dir[1] * t];
  });
}
