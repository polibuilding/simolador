// Fundação perto de uma estrutura que já existe: onde pôr a GC para ligar uma mola que chega até o chão.
// - "bar": uma mola nova da GC até uma esfera baixa (a esfera a até um vão de mola do chão);
// - "swing": uma mola pendurada (a ponta solta, só com ela) gira em volta da outra ponta e desce até a GC.
// Nos dois casos a mola faz pelo menos `gc_angulo_minimo_base_graus` com a chapa (G12): o lugar da GC é um círculo
// na chapa em volta da esfera (raio √(L² − h²)), ou um ponto logo abaixo dela quando a mola fica em pé.
import type { Catalog } from "./catalog";
import { remaining, type InventoryConfig } from "./inventory";
import { addMember, len, membersAt, sub, type Model, type Vec3 } from "./model";
import { validateMember, validateMovedModel, validateSupport, type Check } from "./rules";
import { addSupport } from "./model";

export interface ReachGuide {
  kind: "bar" | "swing";
  /** centro do círculo, na chapa (y = 0) */
  center: Vec3;
  r: number;
  code: string;
  /** esfera de cima (a que recebe a mola nova, ou em volta da qual a mola pendurada gira) */
  sphere: string;
  /** swing: a ponta solta e a mola */
  end?: string;
  member?: string;
  text: string;
}

const fmtP = (p: Vec3) => `(${[p[0], p[2], p[1]].map((v) => +v.toFixed(2)).join("; ")})`;

export function supportReach(cat: Catalog, inv: InventoryConfig, model: Model): ReachGuide[] {
  const s = cat.settings;
  const tol = s.tolerancia_encaixe_mm / s.modulo_mm;
  const sinMin = Math.sin((s.gc_angulo_minimo_base_graus * Math.PI) / 180) - 1e-6;
  const bars = Object.values(cat.pieces).filter((p) => p.type === "bar" && p.spanM).map((p) => ({ code: p.code, L: p.spanM![0] }));
  const out: ReachGuide[] = [];
  const inPlate = (id: string) => Object.values(model.plates).some((p) => p.corners.includes(id));
  for (const S of Object.values(model.nodes)) {
    if (S.kind !== "sphere") continue;
    const h = S.pos[1];
    if (h <= tol) continue;
    const center: Vec3 = [S.pos[0], 0, S.pos[2]];
    // mola nova da GC até a esfera
    for (const b of bars) {
      if (h > b.L + tol || h / b.L < sinMin || remaining(cat, inv, model, b.code) < 1) continue;
      const r = Math.sqrt(Math.max(0, b.L * b.L - h * h));
      out.push({ kind: "bar", center, r: r < tol ? 0 : r, code: b.code, sphere: S.id, text: `cabe uma ${b.code} até a esfera ${fmtP(S.pos)}` });
    }
    // mola pendurada nesta esfera: a ponta solta desce até a GC
    for (const m of membersAt(model, S.id)) {
      if (cat.pieces[m.code]?.type !== "bar") continue;
      const eId = m.a === S.id ? m.b : m.a;
      const E = model.nodes[eId];
      if (!E || E.kind === "support" || membersAt(model, eId).length !== 1 || inPlate(eId)) continue;
      const L = len(sub(E.pos, S.pos));
      if (h > L + tol || h / L < sinMin) continue;
      const r = Math.sqrt(Math.max(0, L * L - h * h));
      out.push({ kind: "swing", center, r: r < tol ? 0 : r, code: m.code, sphere: S.id, end: eId, member: m.id, text: `a ${m.code} pendurada em ${fmtP(S.pos)} desce até aqui` });
    }
  }
  return out;
}

/** Ponto do círculo no ângulo t (a partir de +X, anti-horário visto de cima). */
export const reachPoint = (g: ReachGuide, t: number): Vec3 => [g.center[0] + g.r * Math.cos(t), 0, g.center[2] + g.r * Math.sin(t)];

/**
 * A GC em `pos` (num círculo de `g`) e a mola: nova (bar) ou a pendurada, que gira até a GC (swing).
 * Devolve o modelo com tudo, as esferas novas/mexidas e a verificação.
 */
export function reachAction(cat: Catalog, inv: InventoryConfig, model: Model, g: ReachGuide, pos: Vec3): { model: Model; ids: Set<string>; check: Check } {
  const p: Vec3 = [pos[0], 0, pos[2]];
  if (g.kind === "bar") {
    const ck0 = validateSupport(cat, inv, model, p);
    const { model: m1, id } = addSupport(model, p);
    const S = model.nodes[g.sphere];
    const ck1 = validateMember(cat, inv, m1, g.code, id, S.pos, { free: true });
    const next = addMember(m1, g.code, id, S.pos).model;
    const errors = [...ck0.errors, ...ck1.errors];
    return { model: next, ids: new Set([id]), check: { ok: !errors.length, errors, warnings: [...ck0.warnings, ...ck1.warnings] } };
  }
  // swing: a ponta solta vira a GC (a esfera da GC é a ponta da mola)
  const E = g.end!;
  const without: Model = {
    ...model,
    nodes: Object.fromEntries(Object.entries(model.nodes).filter(([k]) => k !== E)),
    members: Object.fromEntries(Object.entries(model.members).filter(([, m]) => m.a !== E && m.b !== E)),
  };
  const ck0 = validateSupport(cat, inv, without, p);
  const connectors = Object.fromEntries(Object.entries(model.connectors).filter(([, c]) => c.node !== E));
  const next: Model = { ...model, connectors, nodes: { ...model.nodes, [E]: { ...model.nodes[E], kind: "support", pos: p } } };
  // a mola continua do mesmo tamanho (o círculo garante); confere as regras de quem mexeu
  const ck1 = validateMovedModel(cat, next, new Set([E]));
  const L0 = len(sub(model.nodes[E].pos, model.nodes[g.sphere].pos));
  const L1 = len(sub(p, model.nodes[g.sphere].pos));
  const errors = [...ck0.errors, ...ck1.errors];
  if (Math.abs(L1 - L0) > cat.settings.tolerancia_encaixe_mm / cat.settings.modulo_mm) errors.push("A mola não chega até aqui.");
  return { model: next, ids: new Set([E]), check: { ok: !errors.length, errors: [...new Set(errors)], warnings: [...ck0.warnings, ...ck1.warnings] } };
}
