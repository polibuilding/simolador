// Posições candidatas para encaixe.
import type { Catalog } from "./catalog";
import type { InventoryConfig } from "./inventory";
import { add, scale, type Model, type Vec3 } from "./model";
import { validateMember, validateSupport, type Check } from "./rules";

export const AXIS_DIRS: Vec3[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export interface MemberCandidate {
  fromId: string;
  toPos: Vec3;
  check: Check;
}

/** Para uma barra saindo de um nó: as 6 posições nos eixos, já validadas. */
export function memberCandidates(
  cat: Catalog, inv: InventoryConfig, model: Model, code: string, fromId: string,
): MemberCandidate[] {
  const span = cat.pieces[code]?.spanM?.[0] ?? 0;
  const from = model.nodes[fromId];
  if (!from || !span) return [];
  return AXIS_DIRS.map((d) => {
    const toPos = add(from.pos, scale(d, span));
    return { fromId, toPos, check: validateMember(cat, inv, model, code, fromId, toPos) };
  });
}

/** Ligação de base: ponto da chapa (em módulos) → posição encaixada (grade) ou livre. */
export function supportPosition(cat: Catalog, point: { x: number; z: number }, mode: "grade" | "livre"): Vec3 {
  const s = cat.settings;
  const clampX = (v: number) => Math.min(s.chapa_modulos_x, Math.max(0, v));
  const clampZ = (v: number) => Math.min(s.chapa_modulos_y, Math.max(0, v));
  if (mode === "grade") return [clampX(Math.round(point.x)), 0, clampZ(Math.round(point.z))];
  const r = (v: number) => Math.round(v * 100) / 100;
  return [r(point.x), 0, r(point.z)];
}

export function supportCheck(cat: Catalog, inv: InventoryConfig, model: Model, pos: Vec3): Check {
  return validateSupport(cat, inv, model, pos);
}
