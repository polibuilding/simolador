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
