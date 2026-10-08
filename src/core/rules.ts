// Regras de encaixe. Numeração conforme docs/regras-de-encaixe.md.
// Nenhum número fixo aqui: tudo vem de catalog.settings (data/parametros.xlsx).
import type { Catalog } from "./catalog";
import { remaining, type InventoryConfig } from "./inventory";
import {
  DIR_TOL, EPS, UP, type Model, type Vec3, type Member, add, cross, dot, findNodeAt, len, membersAt,
  directionFrom, memberAlong, norm, plateKey, samePos, scale, sub,
} from "./model";

export interface Check {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const result = (errors: string[], warnings: string[] = []): Check => ({ ok: errors.length === 0, errors, warnings });
const typeOf = (cat: Catalog, code: string) => cat.pieces[code]?.type;
const isBarM = (cat: Catalog) => (m: Member) => typeOf(cat, m.code) === "bar";

function stockErrors(cat: Catalog, inv: InventoryConfig, model: Model, code: string): string[] {
  return remaining(cat, inv, model, code) < 1 ? [`Acabaram as ${code} do estoque.`] : [];
}

// ---------------- Ligação de base (GC) ----------------

export function validateSupport(cat: Catalog, inv: InventoryConfig, model: Model, pos: Vec3, ignore: Set<string> = new Set()): Check {
  const s = cat.settings;
  const errors: string[] = [];
  const [x, y, z] = pos;
  // G1: centro dentro da chapa, borda inclusive
  if (Math.abs(y) > EPS) errors.push("A ligação de base fica sobre a chapa.");
  if (x < -EPS || x > s.chapa_modulos_x + EPS || z < -EPS || z > s.chapa_modulos_y + EPS) {
    errors.push("O centro da ligação de base precisa ficar dentro da chapa.");
  }
  // G3: sem sobreposição com outra GC
  const minDistM = (s.gc_diametro_mm - s.tolerancia_encaixe_mm) / s.modulo_mm;
  for (const n of Object.values(model.nodes)) {
    if (n.kind !== "support" || ignore.has(n.id)) continue;
    if (len(sub(n.pos, pos)) < minDistM) {
      errors.push("Encosta em outra ligação de base.");
      break;
    }
  }
  const at = findNodeAt(model, pos);
  if (at && !ignore.has(at.id) && at.kind === "sphere") errors.push("Já existe uma esfera nesse ponto.");
  if (!ignore.size) errors.push(...stockErrors(cat, inv, model, "GC"));
  return result(errors);
}

// ---------------- Geometria auxiliar ----------------

function angleDeg(u: Vec3, v: Vec3) {
  const c = Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v))));
  return (Math.acos(c) * 180) / Math.PI;
}

/** N3: ângulo mínimo entre barras no mesmo nó (diagonais são cabos finos e não entram nesta regra). */
function angleErrors(cat: Catalog, model: Model, nodeId: string, dir: Vec3, where: string): string[] {
  const minA = cat.settings.angulo_minimo_membros_graus;
  for (const m of membersAt(model, nodeId)) {
    if (!isBarM(cat)(m)) continue;
    const a = angleDeg(directionFrom(model, m, nodeId), dir);
    if (a < minA - 0.5) return [`Ângulo de ${a.toFixed(0)}° com outra barra na ${where} (mínimo ${minA}°).`];
  }
  return [];
}

/** C1: o segmento não pode sobrepor um membro colinear nem atravessar um nó. */
function collisionErrors(cat: Catalog, model: Model, a: Vec3, b: Vec3, fromId: string, targetId?: string, cable = false): string[] {
  const s = cat.settings;
  const d = sub(b, a);
  const L = len(d);
  const u = scale(d, 1 / L);
  const onSegment = (p: Vec3) => {
    const w = sub(p, a);
    const t = dot(w, u);
    return { t, perp: len(sub(w, scale(u, t))) };
  };
  const mm = (v: number) => (v * s.modulo_mm).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  // C4: a esfera nova da ponta não pode cair em cima de outra (centros a menos de um diâmetro)
  if (!targetId) {
    const minD = s.esfera_diametro_mm / s.modulo_mm;
    for (const n of Object.values(model.nodes)) {
      if (n.id === fromId) continue;
      const gap = len(sub(n.pos, b));
      if (gap < minD) {
        const reach = len(sub(n.pos, a));
        return [
          `A ponta cairia a ${mm(gap)} mm de outra esfera. Para ligar nela, as esferas teriam de estar a ${mm(L)} mm; estão a ${mm(reach)} mm.`,
        ];
      }
    }
  }
  // C5: a peça não passa por dentro de uma esfera (folga = raio da esfera + raio da mola ou do cabo)
  const clear = (s.esfera_diametro_mm / 2 + (cable ? s.cabo_diametro_mm : s.barra_diametro_mm) / 2) / s.modulo_mm;
  for (const n of Object.values(model.nodes)) {
    if (n.id === fromId || n.id === targetId) continue;
    const { t, perp } = onSegment(n.pos);
    if (perp < clear && t > EPS && t < L - EPS) return ["A peça atravessaria uma esfera."];
  }
  for (const m of Object.values(model.members)) {
    const sp = onSegment(model.nodes[m.a].pos);
    const sq = onSegment(model.nodes[m.b].pos);
    if (sp.perp > 1e-3 || sq.perp > 1e-3) continue;
    const lo = Math.max(0, Math.min(sp.t, sq.t));
    const hi = Math.min(L, Math.max(sp.t, sq.t));
    if (hi - lo > EPS) return ["Já existe uma peça nesse trecho."];
  }
  return [];
}

/** Passo de inclinação das barras (graus); 0 = só nos eixos. */
export const inclineStep = (cat: Catalog) => {
  const v = Number(cat.settings.passo_inclinacao_graus ?? 15);
  return Number.isFinite(v) && v > 0 && v < 90 ? v : 0;
};

/** A direção está num plano da estrutura (uma componente nula) num ângulo múltiplo do passo? */
export function inStepPlane(cat: Catalog, v: Vec3): boolean {
  const zero = v.map((c) => Math.abs(c) < 1e-6);
  if (zero.filter(Boolean).length !== 1) return zero.filter(Boolean).length === 2; // eixo
  const [i, j] = [0, 1, 2].filter((k) => !zero[k]);
  const ang = (Math.atan2(v[j], v[i]) * 180) / Math.PI;
  const step = inclineStep(cat);
  if (!step) return false;
  const r = ((ang % step) + step) % step;
  return Math.min(r, step - r) < 0.2;
}

/**
 * Diagonal num painel inclinado: as pontas estão à distância da diagonal de um retângulo a × b
 * e existe uma esfera num dos outros cantos desse retângulo (lados a e b, a 90°).
 */
export function inclinedPanel(model: Model, p: Vec3, q: Vec3, a: number, b: number, tol: number): boolean {
  if (Math.abs(len(sub(q, p)) - Math.hypot(a, b)) > tol) return false;
  return Object.values(model.nodes).some((k) => {
    const u = sub(k.pos, p);
    const v = sub(q, k.pos);
    const lu = len(u);
    const lv = len(v);
    const sizes = (Math.abs(lu - a) <= tol && Math.abs(lv - b) <= tol) || (Math.abs(lu - b) <= tol && Math.abs(lv - a) <= tol);
    return sizes && Math.abs(dot(u, v)) / (lu * lv) < 1e-3;
  });
}

/** G6: nada deitado no nível da chapa (barras, diagonais ou placas horizontais em y = 0). */
const onGround = (...ps: Vec3[]) => ps.every((p) => Math.abs(p[1]) < EPS);

// ---------------- Barras e diagonais ----------------

export function validateMember(
  cat: Catalog, inv: InventoryConfig, model: Model, code: string, fromId: string, toPos: Vec3,
): Check {
  const s = cat.settings;
  const piece = cat.pieces[code];
  const from = model.nodes[fromId];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!piece || (piece.type !== "bar" && piece.type !== "cable")) return result([`${code} não é barra nem diagonal.`]);
  if (!from) return result(["Nó de origem não existe."]);
  const cable = piece.type === "cable";

  const v = sub(toPos, from.pos);
  const L = len(v);
  if (L < EPS) return result(["A peça precisa de duas pontas diferentes."]);
  const tolM = s.tolerancia_encaixe_mm / s.modulo_mm;
  const absC = v.map(Math.abs);
  const nonZero = absC.filter((c) => c > EPS);

  if (!cable) {
    const span = piece.spanM?.[0] ?? 0;
    if (Math.abs(L - span) > tolM) errors.push(`A ${code} vence ${span} módulos; a distância é ${L.toFixed(2)}.`); // B1
    // B2: eixos, inclinação em passos (num plano da estrutura) ou fechando numa esfera existente
    if (nonZero.length !== 1 && !findNodeAt(model, toPos) && !inStepPlane(cat, v)) {
      errors.push(inclineStep(cat) ? `Barra inclinada só em passos de ${inclineStep(cat)}° nos planos da estrutura, ou fechando numa esfera.` : "Barra só na direção dos eixos, ou fechando numa esfera.");
    }
  } else {
    // D1: só no vão nominal, num plano ortogonal
    const [a, b] = piece.spanM ?? [0, 0];
    const sorted = [...nonZero].sort((p, q) => p - q);
    const want = [a, b].sort((p, q) => p - q);
    const ortho = nonZero.length === 2 && Math.abs(sorted[0] - want[0]) <= tolM && Math.abs(sorted[1] - want[1]) <= tolM;
    if (!ortho && !(findNodeAt(model, toPos) && inclinedPanel(model, from.pos, toPos, a, b, tolM))) {
      errors.push(`A ${code} só vale num vão de ${a} × ${b} módulos.`);
    }
  }
  if (toPos[1] < -EPS) errors.push("A peça iria para baixo da chapa.");
  if (onGround(from.pos, toPos)) errors.push("Nada pode ficar deitado na chapa: comece pelos pilares."); // G6

  const target = findNodeAt(model, toPos);
  if (cable && !target) errors.push("A diagonal liga duas esferas que já existem."); // D5
  const dir = scale(v, 1 / L);
  if (!cable) errors.push(...angleErrors(cat, model, fromId, dir, "origem"));
  if (target) {
    if (target.id === fromId) errors.push("As duas pontas estão no mesmo nó.");
    if (!cable) errors.push(...angleErrors(cat, model, target.id, scale(dir, -1), "outra ponta"));
  }
  errors.push(...collisionErrors(cat, model, from.pos, toPos, fromId, target?.id, cable));
  // lado de esfera ocupado por CC/CC90
  const sideTaken = (nodeId: string, d: Vec3) =>
    Object.values(model.connectors).some((c) => c.node === nodeId && c.side && samePos(c.side, d, DIR_TOL));
  if (sideTaken(fromId, dir) || (target && sideTaken(target.id, scale(dir, -1)))) {
    errors.push("Esse lado da esfera está ocupado por uma ligação contínua.");
  }

  errors.push(...stockErrors(cat, inv, model, code));
  if (!target && remaining(cat, inv, model, "C") < 1) errors.push("Acabaram as esferas (C) do estoque.");
  if (!target && toPos[1] < EPS) warnings.push("Esfera apoiada direto na chapa, sem ligação de base.");
  return result(errors, warnings);
}

// ---------------- Placas ----------------

export interface PlateGeom {
  corners: [Vec3, Vec3, Vec3, Vec3]; // origem, origem+u·a, origem+u·a+v·b, origem+v·b
  normal: Vec3;
}

/** Ordem dos cantos ao redor do retângulo. */
export function plateCorners(origin: Vec3, u: Vec3, a: number, v: Vec3, b: number): PlateGeom {
  const p1 = add(origin, scale(u, a));
  const p3 = add(origin, scale(v, b));
  return { corners: [origin, p1, add(p1, scale(v, b)), p3], normal: norm(cross(u, v)) };
}

/** Duas placas no mesmo plano (qualquer orientação) se sobrepõem? Eixos separadores = lados das duas. */
function platesOverlap(a: Vec3[], b: Vec3[]): boolean {
  const n = norm(cross(sub(a[1], a[0]), sub(a[3], a[0])));
  const n2 = norm(cross(sub(b[1], b[0]), sub(b[3], b[0])));
  if (Math.abs(Math.abs(dot(n, n2)) - 1) > DIR_TOL || Math.abs(dot(n, sub(b[0], a[0]))) > 1e-3) return false;
  const axes = [sub(a[1], a[0]), sub(a[3], a[0]), sub(b[1], b[0]), sub(b[3], b[0])].map(norm);
  return axes.every((ax) => {
    const pa = a.map((p) => dot(p, ax));
    const pb = b.map((p) => dot(p, ax));
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > 1e-3;
  });
}

/** Quatro pontos formam um retângulo a × b (em qualquer orientação), na ordem ao redor? */
export function isRect(c: Vec3[], a: number, b: number, tol: number): boolean {
  const u = sub(c[1], c[0]);
  const v = sub(c[3], c[0]);
  const lu = len(u);
  const lv = len(v);
  const sizes = (Math.abs(lu - a) <= tol && Math.abs(lv - b) <= tol) || (Math.abs(lu - b) <= tol && Math.abs(lv - a) <= tol);
  return sizes && Math.abs(dot(u, v)) / (lu * lv) < 1e-3 && len(sub(add(c[0], add(u, v)), c[2])) <= tol;
}

export function validatePlate(cat: Catalog, inv: InventoryConfig, model: Model, code: string, g: PlateGeom, ignoreId?: string): Check {
  const s = cat.settings;
  const errors: string[] = [];
  const warnings: string[] = [];
  const piece = cat.pieces[code];
  if (!piece || piece.type !== "plate") return result([`${code} não é placa.`]);
  const nodes = g.corners.map((c) => findNodeAt(model, c));
  if (nodes.some((n) => !n)) errors.push("A placa precisa de uma esfera em cada um dos 4 cantos."); // P1
  if (g.corners.some((c) => c[1] < -EPS)) errors.push("A placa iria para baixo da chapa.");
  if (onGround(...g.corners)) errors.push("Nada pode ficar deitado na chapa."); // G6
  if (nodes.every(Boolean)) {
    const key = plateKey(nodes.map((n) => n!.id));
    const [A, B] = piece.spanM ?? [0, 0];
    if (!isRect(g.corners, A, B, s.tolerancia_encaixe_mm / s.modulo_mm)) errors.push(`A ${code} precisa de 4 esferas num retângulo de ${A} × ${B} módulos.`); // P1
    for (const p of Object.values(model.plates)) {
      if (p.id === ignoreId) continue;
      if (plateKey(p.corners) === key) {
        errors.push("Já existe uma placa nesse vão."); // P4
        break;
      }
      if (platesOverlap(g.corners, p.corners.map((id) => model.nodes[id].pos))) {
        errors.push("Encosta em outra placa no mesmo plano.");
        break;
      }
    }
    // P3: barras do contorno recomendadas
    const ids = nodes.map((n) => n!.id);
    const edges = [0, 1, 2, 3].filter((i) => {
      const a = ids[i];
      const b = ids[(i + 1) % 4];
      return !Object.values(model.members).some((m) => isBarM(cat)(m) && ((m.a === a && m.b === b) || (m.a === b && m.b === a)));
    });
    if (edges.length) warnings.push("Placa sem barras em todo o contorno: menos estável.");
  }
  if (!ignoreId) errors.push(...stockErrors(cat, inv, model, code));
  return result(errors, warnings);
}

// ---------------- Ligações ----------------

export interface ConnectorSpec {
  code: string;
  node: string;
  dirs: Vec3[];
  base?: boolean;
  side?: Vec3;
}

const sameDirs = (a: Vec3[], b: Vec3[]) =>
  a.length === b.length && a.every((d) => b.some((e) => samePos(d, e, DIR_TOL)));

export function validateConnector(cat: Catalog, inv: InventoryConfig, model: Model, spec: ConnectorSpec): Check {
  const errors: string[] = [];
  const n = model.nodes[spec.node];
  if (!n) return result(["Escolha uma esfera."]);
  const existing = Object.values(model.connectors).filter((c) => c.node === spec.node);
  const barAlong = (d: Vec3) => !!memberAlong(model, spec.node, d, isBarM(cat));
  if (spec.code === "RC90") {
    if (spec.base) {
      if (n.kind !== "support" || !barAlong(UP)) errors.push("Na ligação de base, a RC90 precisa de um pilar subindo."); // L3
    } else if (spec.dirs.length !== 2 || Math.abs(dot(spec.dirs[0], spec.dirs[1])) > DIR_TOL || !spec.dirs.every(barAlong)) {
      errors.push("A RC90 vai no canto entre duas barras a 90°."); // L1
    }
    if (existing.some((c) => c.code === "RC90" && !!c.base === !!spec.base && sameDirs(c.dirs, spec.dirs))) {
      errors.push("Esse canto já tem uma RC90."); // L2
    }
  } else if (spec.code === "CC" || spec.code === "CC90") {
    const ax = spec.dirs[0];
    if (!ax || !barAlong(ax) || !barAlong(scale(ax, -1))) errors.push(`A ${spec.code} precisa de duas barras alinhadas no nó.`);
    const side = spec.side;
    if (!side || Math.abs(dot(side, ax)) > DIR_TOL) errors.push("Escolha um lado da esfera perpendicular às barras.");
    else if (barAlong(side)) errors.push("Esse lado tem uma barra transversal: a ligação não cabe."); // L6
    const cc = existing.filter((c) => c.code === "CC");
    if (spec.code === "CC" && cc.length) errors.push("Essa esfera já tem uma CC; para travar o outro par, use a CC90."); // L4
    if (spec.code === "CC90") {
      const base = cc.find((c) => Math.abs(dot(c.dirs[0], ax)) < DIR_TOL && (!c.side || !side || samePos(c.side, side, DIR_TOL)));
      if (!base) errors.push("A CC90 vai por cima de uma CC, no mesmo lado, travando o par perpendicular."); // L5
      if (existing.some((c) => c.code === "CC90")) errors.push("Essa esfera já tem uma CC90.");
    }
  } else {
    errors.push(`${spec.code} não é uma ligação.`);
  }
  errors.push(...stockErrors(cat, inv, model, spec.code));
  return result(errors);
}

/** Depois de mover ou girar uma estrutura: tudo continua válido? */
export function validateMovedModel(cat: Catalog, model: Model, moved: Set<string>): Check {
  const errors: string[] = [];
  for (const id of moved) {
    const n = model.nodes[id];
    if (n.pos[1] < -EPS) errors.push("A estrutura iria para baixo da chapa.");
    if (n.kind === "support") {
      const c = validateSupport(cat, { kits: {}, unlimited: true }, model, n.pos, moved);
      errors.push(...c.errors);
    }
    for (const o of Object.values(model.nodes)) {
      if (o.id !== id && !moved.has(o.id) && len(sub(o.pos, n.pos)) < cat.settings.esfera_diametro_mm / cat.settings.modulo_mm) {
        errors.push("Bateria em outra esfera.");
      }
    }
  }
  for (const m of Object.values(model.members)) {
    if (!moved.has(m.a) && !moved.has(m.b)) continue;
    const a = model.nodes[m.a].pos;
    const b = model.nodes[m.b].pos;
    if (onGround(a, b)) errors.push("Uma peça ficaria deitada na chapa.");
    const others = { ...model, members: Object.fromEntries(Object.entries(model.members).filter(([k]) => k !== m.id)) };
    errors.push(...collisionErrors(cat, others, a, b, m.a, m.b, cat.pieces[m.code]?.type === "cable"));
  }
  return result([...new Set(errors)]);
}

/** Pares de esferas sobrepostas (centros a menos de um diâmetro): defeito de modelos feitos antes da regra C4. */
export function overlappingNodes(cat: Catalog, model: Model): [string, string][] {
  const minD = cat.settings.esfera_diametro_mm / cat.settings.modulo_mm;
  const ns = Object.values(model.nodes);
  const out: [string, string][] = [];
  for (let i = 0; i < ns.length; i++) {
    for (let j = i + 1; j < ns.length; j++) if (len(sub(ns[i].pos, ns[j].pos)) < minD) out.push([ns[i].id, ns[j].id]);
  }
  return out;
}
