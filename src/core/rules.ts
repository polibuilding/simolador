// Regras de encaixe da fase 1. Numeração conforme docs/regras-de-encaixe.md.
// Nenhum número fixo aqui: tudo vem de catalog.settings (data/parametros.xlsx).
import type { Catalog } from "./catalog";
import { remaining, type InventoryConfig } from "./inventory";
import {
  EPS, type Model, type Vec3, dot, findNodeAt, len, membersAt, directionFrom, sub, scale,
} from "./model";

export interface Check {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const result = (errors: string[], warnings: string[] = []): Check => ({ ok: errors.length === 0, errors, warnings });

// ---------------- Ligação de base (GC) ----------------

export function validateSupport(cat: Catalog, inv: InventoryConfig, model: Model, pos: Vec3): Check {
  const s = cat.settings;
  const errors: string[] = [];
  const [x, y, z] = pos;
  // G1: centro dentro da chapa, borda inclusive
  if (Math.abs(y) > EPS) errors.push("A ligação de base fica sobre a chapa.");
  if (x < -EPS || x > s.chapa_modulos_x + EPS || z < -EPS || z > s.chapa_modulos_y + EPS) {
    errors.push("O centro da ligação de base precisa ficar dentro da chapa.");
  }
  // G3: sem sobreposição com outra GC
  const minDistM = s.gc_diametro_mm / s.modulo_mm - s.tolerancia_encaixe_mm / s.modulo_mm;
  for (const n of Object.values(model.nodes)) {
    if (n.kind !== "support") continue;
    if (len(sub(n.pos, pos)) < minDistM) {
      errors.push("Encosta em outra ligação de base.");
      break;
    }
  }
  // Não pode cair em cima de uma esfera já existente
  const at = findNodeAt(model, pos);
  if (at && at.kind === "sphere") errors.push("Já existe uma esfera nesse ponto.");
  // S2: estoque
  if (remaining(cat, inv, model, "GC") < 1) errors.push("Acabaram as ligações de base (GC) do estoque.");
  return result(errors);
}

// ---------------- Barras ----------------

function angleDeg(u: Vec3, v: Vec3) {
  const c = Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v))));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Ângulo mínimo (N3) entre a nova direção e os membros que já saem do nó. */
function angleErrors(cat: Catalog, model: Model, nodeId: string, dir: Vec3, where: string): string[] {
  const minA = cat.settings.angulo_minimo_membros_graus;
  for (const m of membersAt(model, nodeId)) {
    const a = angleDeg(directionFrom(model, m, nodeId), dir);
    if (a < minA - 0.5) return [`Ângulo de ${a.toFixed(0)}° com outra peça na ${where} (mínimo ${minA}°).`];
  }
  return [];
}

/** C1: o novo segmento não pode se sobrepor a um membro colinear nem atravessar um nó. */
function collisionErrors(model: Model, a: Vec3, b: Vec3, fromId: string, targetId?: string): string[] {
  const d = sub(b, a);
  const L = len(d);
  const u = scale(d, 1 / L);
  const onSegment = (p: Vec3) => {
    const w = sub(p, a);
    const t = dot(w, u);
    const perp = len(sub(w, scale(u, t)));
    return { t, perp };
  };
  for (const n of Object.values(model.nodes)) {
    if (n.id === fromId || n.id === targetId) continue;
    const { t, perp } = onSegment(n.pos);
    if (perp < 1e-3 && t > EPS && t < L - EPS) return ["A barra atravessaria uma esfera."];
  }
  for (const m of Object.values(model.members)) {
    const p = model.nodes[m.a].pos;
    const q = model.nodes[m.b].pos;
    const sp = onSegment(p);
    const sq = onSegment(q);
    if (sp.perp > 1e-3 || sq.perp > 1e-3) continue; // não colinear
    const lo = Math.max(0, Math.min(sp.t, sq.t));
    const hi = Math.min(L, Math.max(sp.t, sq.t));
    if (hi - lo > EPS) return ["Já existe uma peça nesse trecho."];
  }
  return [];
}

export function validateMember(
  cat: Catalog, inv: InventoryConfig, model: Model, code: string, fromId: string, toPos: Vec3,
): Check {
  const s = cat.settings;
  const piece = cat.pieces[code];
  const from = model.nodes[fromId];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!piece || piece.type !== "bar") return result([`Peça ${code} não é uma barra.`]);
  if (!from) return result(["Nó de origem não existe."]);

  const v = sub(toPos, from.pos);
  const L = len(v);
  if (L < EPS) return result(["A barra precisa de duas pontas diferentes."]);
  // B1: comprimento
  const span = piece.spanM?.[0] ?? 0;
  if (Math.abs(L - span) * s.modulo_mm > s.tolerancia_encaixe_mm) {
    errors.push(`A ${code} vence ${span} módulos; a distância é ${L.toFixed(2)}.`);
  }
  // B2: só nos eixos (modo grade, fases 1–3)
  const nonZero = v.filter((c) => Math.abs(c) > EPS).length;
  if (nonZero !== 1) errors.push("Nesta versão, barras só nas direções dos eixos (X, Y ou Z).");
  // Abaixo da chapa
  if (toPos[1] < -EPS) errors.push("A barra iria para baixo da chapa.");

  const target = findNodeAt(model, toPos);
  const dir = scale(v, 1 / L);
  errors.push(...angleErrors(cat, model, fromId, dir, "origem"));
  if (target) {
    if (target.id === fromId) errors.push("As duas pontas estão no mesmo nó.");
    errors.push(...angleErrors(cat, model, target.id, scale(dir, -1), "outra ponta"));
  }
  errors.push(...collisionErrors(model, from.pos, toPos, fromId, target?.id));

  // S2: estoque
  if (remaining(cat, inv, model, code) < 1) errors.push(`Acabaram as ${code} do estoque.`);
  if (!target && remaining(cat, inv, model, "C") < 1) errors.push("Acabaram as esferas (C) do estoque.");

  if (!target && toPos[1] < EPS) warnings.push("Esfera apoiada direto na chapa, sem ligação de base.");
  return result(errors, warnings);
}
