// Movimento "global": pegar uma esfera, mola, diagonal ou placa e ver o que a estrutura deixa mexer junto.
// Usa o modelo cinemático (mechanism.ts): 0 graus de liberdade = travado; 1 = caminho azul/vermelho;
// 2 ou mais = arraste livre (mexe o mínimo para a peça chegar onde o cursor está).
import type { Catalog } from "./catalog";
import type { NodeMove, NodeMoveSet } from "./edit";
import {
  buildMech, dragTo, mechComponent, mobility, modelAt, newtonProject, positionsOf, stretchedTies, tracePath, weightsFrom, type Mech,
} from "./mechanism";
import { dot, len, membersAt, sub, type Model, type Vec3 } from "./model";
import { segmentHitsPlate, validateMovedModel } from "./rules";

export type MoveRef = { kind: "node" | "member" | "plate"; id: string };

export type GlobalMove =
  | { mode: "locked"; reason: string; dof: number }
  | { mode: "path"; dof: number; handle: Vec3; set: NodeMoveSet; trails: Vec3[][] }
  | { mode: "free"; dof: number; hand: number; handle: Vec3; drag: (target: Vec3) => NodeMove };

const handNodes = (model: Model, ref: MoveRef): string[] =>
  ref.kind === "node" ? [ref.id] : ref.kind === "member" ? (model.members[ref.id] ? [model.members[ref.id].a, model.members[ref.id].b] : []) : model.plates[ref.id]?.corners ?? [];

/** Peças cujo alinhamento interessa no Tab: a pega e as que chegam nas esferas dela. */
function trackedFor(cat: Catalog, model: Model, ref: MoveRef, nodes: string[]): string[] {
  const ids = new Set<string>();
  if (ref.kind === "member") ids.add(ref.id);
  for (const n of nodes) for (const m of membersAt(model, n)) if (cat.pieces[m.code]?.type === "bar") ids.add(m.id);
  return [...ids];
}

/** Regras depois de mexer: as de sempre (G12, colisões, chapa...), ângulo mínimo entre molas e diagonais/cabos esticados. */
export function checkMoved(cat: Catalog, base: Model, next: Model, moved: Set<string>, mech: Mech, x: Float64Array): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors = [...validateMovedModel(cat, next, moved).errors];
  const minA = cat.settings.angulo_minimo_membros_graus;
  // N3 nas esferas que mexeram e nas vizinhas delas
  const around = new Set<string>(moved);
  for (const id of moved) for (const m of membersAt(next, id)) (around.add(m.a), around.add(m.b));
  for (const at of around) {
    if (errors.length > 3) break;
    const bars = membersAt(next, at).filter((m) => cat.pieces[m.code]?.type === "bar");
    for (let i = 0; i < bars.length; i++) {
      for (let j = i + 1; j < bars.length; j++) {
        const u = sub(next.nodes[bars[i].a === at ? bars[i].b : bars[i].a].pos, next.nodes[at].pos);
        const v = sub(next.nodes[bars[j].a === at ? bars[j].b : bars[j].a].pos, next.nodes[at].pos);
        const ang = (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v))))) * 180) / Math.PI;
        if (ang < minA - 0.5) {
          errors.push(`Duas molas ficariam a ${ang.toFixed(0)}° numa esfera (mínimo ${minA}°).`);
          i = bars.length;
          break;
        }
      }
    }
  }
  // peças que mexeram não atravessam placas
  for (const m of Object.values(next.members)) {
    if (!moved.has(m.a) && !moved.has(m.b)) continue;
    const a = next.nodes[m.a].pos;
    const b = next.nodes[m.b].pos;
    if (Object.values(next.plates).some((p) => !p.corners.includes(m.a) && !p.corners.includes(m.b) && segmentHitsPlate(a, b, p.corners.map((id) => next.nodes[id].pos)))) {
      errors.push("Uma peça atravessaria uma placa.");
      break;
    }
  }
  // diagonais e cabos: só tração
  const tol = cat.settings.tolerancia_encaixe_mm / cat.settings.modulo_mm;
  const st = stretchedTies(mech, x, tol);
  if (st.length) {
    const m = base.members[st[0]];
    errors.push(`${cat.pieces[m.code]?.type === "rope" ? "O cabo" : `A ${m.code}`} esticaria: diagonais e cabos só trabalham à tração (seguram esse sentido).`);
  }
  const warnings: string[] = [];
  const slack = mech.ties.filter((t) => {
    const p = next.nodes[mech.ids[t.a]].pos;
    const q = next.nodes[mech.ids[t.b]].pos;
    return len(sub(q, p)) < t.L - tol;
  });
  if (slack.length) warnings.push(`${slack.length === 1 ? `A ${base.members[slack[0].member].code} fica frouxa` : `${slack.length} diagonais/cabos ficam frouxos`}.`);
  return { ok: !errors.length, errors: [...new Set(errors)], warnings };
}

/** O que acontece ao pegar a peça `ref`: travada, caminho (1 grau de liberdade) ou livre. */
export function globalMoveOptions(cat: Catalog, model: Model, ref: MoveRef): GlobalMove {
  const nodes = handNodes(model, ref).filter((id) => model.nodes[id]);
  if (!nodes.length) return { mode: "locked", reason: "Peça não encontrada.", dof: 0 };
  const comp = mechComponent(cat, model, nodes);
  const hasSupport = [...comp].some((id) => model.nodes[id].kind === "support" && !nodes.includes(id));
  if (!hasSupport && !nodes.some((id) => model.nodes[id].kind === "support")) {
    return { mode: "locked", reason: "Essa estrutura não está presa em nenhuma GC: segure e arraste para mover a estrutura inteira.", dof: 0 };
  }
  const mech = buildMech(cat, model, comp);
  const x0 = positionsOf(model, mech);
  const hand = nodes.map((id) => mech.index.get(id)!).filter((i) => i !== undefined);
  const free = hand.filter((i) => !mech.fixed[i]);
  if (!free.length) return { mode: "locked", reason: "Essa peça está presa na chapa (GC) ou engastada por RC90 na base.", dof: 0 };
  const mob = mobility(mech, x0, hand);
  const handle = hand.reduce((s, i) => [s[0] + x0[3 * i] / hand.length, s[1] + x0[3 * i + 1] / hand.length, s[2] + x0[3 * i + 2] / hand.length] as Vec3, [0, 0, 0] as Vec3);
  const locks = mech.locks;
  if (mob.hand === 0 || !mob.v0) {
    const what = [
      locks.rc90 && `${locks.rc90} RC90 nos esquadros`,
      locks.rc90base && `${locks.rc90base} RC90 na base`,
      locks.cc && `${locks.cc} CC nas emendas`,
      locks.plates && `${locks.plates} ${locks.plates === 1 ? "placa" : "placas"}`,
    ].filter(Boolean).join(", ");
    return { mode: "locked", reason: `Travado: o conjunto não deixa essa peça mexer${what ? ` (${what})` : ""}. M leva a peça para outro lugar.`, dof: mob.dof };
  }
  const tracked = trackedFor(cat, model, ref, nodes);
  const evalX = (x: Float64Array): NodeMove => {
    const { model: next, moved } = modelAt(model, mech, x);
    const check = checkMoved(cat, model, next, moved, mech, x);
    const h = hand.reduce((s, i) => [s[0] + x[3 * i] / hand.length, s[1] + x[3 * i + 1] / hand.length, s[2] + x[3 * i + 2] / hand.length] as Vec3, [0, 0, 0] as Vec3);
    return { pos: h, model: next, ids: moved, check };
  };

  if (mob.hand >= 2) {
    let last = x0;
    return {
      mode: "free", dof: mob.dof, hand: mob.hand, handle,
      drag: (target: Vec3) => {
        // começa do último lugar (mais estável) e, se ficar longe, tenta do começo
        let r = dragTo(mech, last, hand, target);
        if (r.miss > 0.05) {
          const r0 = dragTo(mech, x0, hand, target);
          if (r0.miss < r.miss) r = r0;
        }
        if (r.err < 1e-5) last = r.x;
        return evalX(r.x);
      },
    };
  }

  // 1 grau de liberdade: percorre o caminho
  const path = tracePath(mech, x0, hand, mob.v0);
  const pts = path.samples.map((s) => s.h);
  const cache = new Map<number, NodeMove>();
  const sampleMove = (i: number) => {
    let mv = cache.get(i);
    if (!mv) cache.set(i, (mv = evalX(path.samples[i].x)));
    return mv;
  };
  const nearestIndex = (q: Vec3) => {
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = len(sub(p, q));
      if (d < bd) (bd = d), (best = i);
    });
    return best;
  };
  const w = weightsFrom(mech, hand);
  const evalParam = (t: number): NodeMove | null => {
    const n = path.samples.length;
    if (!n) return null;
    const tt = path.closed ? ((t % n) + n) % n : Math.max(0, Math.min(n - 1, t));
    const i = Math.floor(tt);
    const f = tt - i;
    if (f < 1e-9) return sampleMove(i);
    const j = (i + 1) % n;
    const xa = path.samples[i].x;
    const xb = path.samples[j].x;
    const x = xa.map((v, k) => v + (xb[k] - v) * f);
    newtonProject(mech, x, w, undefined, 8);
    return evalX(x);
  };
  // rastro das esferas da peça (para ver o "cilindro" que ela varre)
  const trails = hand.filter((i) => !mech.fixed[i]).map((i) => path.samples.filter((_, k) => k % 2 === 0).map((s) => [s.x[3 * i], s.x[3 * i + 1], s.x[3 * i + 2]] as Vec3));
  const set: NodeMoveSet = {
    options: [],
    evalAt: (q) => (pts.length ? sampleMove(nearestIndex(q)) : null),
    nearest: (q) => (pts.length ? pts[nearestIndex(q)] : null),
    locus: { kind: "path", pts, closed: path.closed },
    tracked,
    evalParam,
  };
  return { mode: "path", dof: mob.dof, handle, set, trails };
}

/** Texto curto da mobilidade de uma peça (painel). */
export function mobilityText(g: GlobalMove): string {
  if (g.mode === "locked") return g.reason.startsWith("Travado") ? "travada (o conjunto não deixa mexer)" : g.reason;
  if (g.mode === "path") return "1 grau de liberdade: anda num caminho";
  return `livre: ${g.hand} graus de liberdade aqui`;
}

/** Mobilidade de uma peça sem traçar o caminho (para o painel): 0 = travada, 1 = caminho, 2+ = livre. */
export function pieceMobility(cat: Catalog, model: Model, ref: MoveRef): { hand: number; dof: number; free: boolean } | null {
  const nodes = handNodes(model, ref).filter((id) => model.nodes[id]);
  if (!nodes.length) return null;
  const comp = mechComponent(cat, model, nodes);
  if (![...comp].some((id) => model.nodes[id].kind === "support")) return { hand: 6, dof: 6, free: true };
  const mech = buildMech(cat, model, comp);
  const x = positionsOf(model, mech);
  const hand = nodes.map((id) => mech.index.get(id)!).filter((i) => i !== undefined && !mech.fixed[i]);
  if (!hand.length) return { hand: 0, dof: 0, free: false };
  const m = mobility(mech, x, hand);
  return { hand: m.hand, dof: m.dof, free: false };
}

export interface PartMobility {
  nodes: number;
  supports: number;
  dof: number;
}

/**
 * Graus de liberdade de cada parte da estrutura (as GC separam as partes: são fixas). Diagonais e cabos não entram
 * (seguram só um sentido). Partes sem GC aparecem com `supports: 0` (soltas).
 */
export function structureMobility(cat: Catalog, model: Model): PartMobility[] {
  const seen = new Set<string>();
  const out: PartMobility[] = [];
  for (const n of Object.values(model.nodes)) {
    if (seen.has(n.id) || n.kind === "support") continue;
    const comp = mechComponent(cat, model, [n.id]);
    for (const id of comp) if (model.nodes[id].kind !== "support") seen.add(id);
    const supports = [...comp].filter((id) => model.nodes[id].kind === "support").length;
    if (!supports) {
      out.push({ nodes: comp.size, supports: 0, dof: 6 });
      continue;
    }
    const mech = buildMech(cat, model, comp);
    out.push({ nodes: comp.size - supports, supports, dof: mobility(mech, positionsOf(model, mech), []).dof });
  }
  return out;
}
