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
  | { mode: "free"; dof: number; hand: number; handle: Vec3; drag: (target: Vec3) => NodeMove; reset: () => void };

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

/**
 * O que acontece ao pegar a peça `ref`: travada, caminho (1 grau de liberdade) ou livre.
 * `free`: só essas esferas podem mexer (um "conjunto" escolhido com o Tab); as outras ficam paradas como se fossem GC.
 */
export function globalMoveOptions(cat: Catalog, model: Model, ref: MoveRef, free?: Set<string> | null): GlobalMove {
  const nodes = handNodes(model, ref).filter((id) => model.nodes[id]);
  if (!nodes.length) return { mode: "locked", reason: "Peça não encontrada.", dof: 0 };
  const comp = mechComponent(cat, model, nodes);
  const hasSupport = [...comp].some((id) => model.nodes[id].kind === "support" && !nodes.includes(id));
  if (!hasSupport && !nodes.some((id) => model.nodes[id].kind === "support")) {
    return { mode: "locked", reason: "Essa estrutura não está presa em nenhuma GC: segure e arraste para mover a estrutura inteira.", dof: 0 };
  }
  const mech = buildMech(cat, model, comp);
  if (free) mech.ids.forEach((id, i) => !free.has(id) && (mech.fixed[i] = true));
  const x0 = positionsOf(model, mech);
  const hand = nodes.map((id) => mech.index.get(id)!).filter((i) => i !== undefined);
  if (!hand.some((i) => !mech.fixed[i])) return { mode: "locked", reason: "Essa peça está presa na chapa (GC) ou engastada por RC90 na base.", dof: 0 };
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
      reset: () => void (last = x0),
      drag: (target: Vec3) => {
        // começa do último lugar (mais estável); se ficar longe ou cair numa posição que não vale, tenta do começo
        // (sem isso, uma posição ruim "prendia" o arraste e nenhum clique valia até recarregar a página)
        const r1 = dragTo(mech, last, hand, target);
        let mv = evalX(r1.x);
        let r = r1;
        if (r1.miss > 0.05 || !mv.check.ok || r1.err > 1e-5) {
          const r0 = dragTo(mech, x0, hand, target);
          const mv0 = evalX(r0.x);
          const better = (mv0.check.ok && !mv.check.ok) || (mv0.check.ok === mv.check.ok && r0.miss < r1.miss - 1e-6);
          if (better) (r = r0), (mv = mv0);
        }
        last = r.err < 1e-5 && mv.check.ok ? r.x : x0;
        return mv;
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

/* ---------- conjuntos: o que mexe junto (Tab amplia) ---------- */

export interface MoveScope {
  /** local = "mover só o nó" (esfera); set = só as esferas de `free`; all = tudo até as GC */
  kind: "local" | "set" | "all";
  free: Set<string> | null;
  label: string;
  /** rótulo curto (rodapé) */
  short: string;
  /** graus de liberdade da peça nesse conjunto */
  hand: number;
  /** quantas esferas mexem */
  moving: number;
}

const scopeMemo = new WeakMap<Model, Map<string, MoveScope[]>>();
const moveMemo = new WeakMap<Model, Map<string, GlobalMove>>();

/**
 * Conjuntos que podem mexer quando se pega a peça, do menor ao maior: só a peça (as vizinhas paradas), um anel de
 * vizinhas por vez, cada "pavimento" (tudo daquela altura para cima) e a estrutura toda até as GC. O que fica fora
 * do conjunto fica parado, como se estivesse preso. Só ficam os conjuntos em que a peça mexe e que mexem um grupo
 * diferente do anterior (a mesma liberdade não aparece duas vezes).
 */
export function moveScopes(cat: Catalog, model: Model, ref: MoveRef, local = false): MoveScope[] {
  const key = `${ref.kind}:${ref.id}:${local ? 1 : 0}`;
  let memo = scopeMemo.get(model);
  if (!memo) scopeMemo.set(model, (memo = new Map()));
  const hit = memo.get(key);
  if (hit) return hit;
  const out = computeScopes(cat, model, ref, local);
  memo.set(key, out);
  return out;
}

function computeScopes(cat: Catalog, model: Model, ref: MoveRef, local: boolean): MoveScope[] {
  const nodes = handNodes(model, ref).filter((id) => model.nodes[id]);
  if (!nodes.length) return [];
  const comp = mechComponent(cat, model, nodes);
  const isSup = (id: string) => model.nodes[id].kind === "support";
  if (![...comp].some(isSup)) return [];
  const mech0 = buildMech(cat, model, comp);
  const x0 = positionsOf(model, mech0);
  const hand = nodes.map((id) => mech0.index.get(id)!).filter((i) => i !== undefined);
  if (!hand.some((i) => !mech0.fixed[i])) return [];
  // vizinhança: molas (não diagonais/cabos) e lados das placas, sem atravessar GC
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!comp.has(a) || !comp.has(b)) return;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (const m of Object.values(model.members)) {
    const t = cat.pieces[m.code]?.type;
    if (t !== "cable" && t !== "rope") link(m.a, m.b);
  }
  for (const p of Object.values(model.plates)) for (let i = 0; i < p.corners.length; i++) link(p.corners[i], p.corners[(i + 1) % p.corners.length]);
  const dist = new Map<string, number>();
  const queue = nodes.filter((id) => !isSup(id));
  queue.forEach((id) => dist.set(id, 0));
  while (queue.length) {
    const k = queue.shift()!;
    for (const nb of adj.get(k) ?? []) {
      if (dist.has(nb) || isSup(nb)) continue;
      dist.set(nb, dist.get(k)! + 1);
      queue.push(nb);
    }
  }
  const movable = [...comp].filter((id) => !isSup(id));
  // partes que ficariam soltas (sem caminho até uma GC por fora do conjunto) vão junto
  const close = (S: Set<string>) => {
    const reach = new Set<string>();
    const stack = [...comp].filter(isSup);
    stack.forEach((id) => reach.add(id));
    while (stack.length) {
      const k = stack.pop()!;
      if (S.has(k) && !isSup(k)) continue;
      for (const nb of adj.get(k) ?? []) if (!reach.has(nb) && !S.has(nb)) (reach.add(nb), stack.push(nb));
    }
    for (const id of movable) if (!reach.has(id)) S.add(id);
    return S;
  };
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const cands: { free: Set<string>; label: string; short: string; kind: MoveScope["kind"]; hop0?: boolean }[] = [];
  const maxD = Math.max(0, ...dist.values());
  // anéis de vizinhas: até o primeiro que mexe (a "próxima liberdade") e mais um; os pavimentos e o todo vêm depois
  let ringsAfter = -1;
  for (let k = 0; k <= maxD; k++) {
    if (ringsAfter >= 1) break;
    const S = close(new Set(movable.filter((id) => (dist.get(id) ?? Infinity) <= k)));
    cands.push({
      free: S, kind: "set", hop0: k === 0,
      label: k === 0 ? "só a peça (as vizinhas paradas)" : k === 1 ? "a peça e as esferas vizinhas" : `a peça e ${k} anéis de vizinhas`,
      short: k === 0 ? "só a peça" : k === 1 ? "+ vizinhas" : `+ ${k} anéis de vizinhas`,
    });
    if (ringsAfter >= 0) ringsAfter++;
    else {
      const fixed = mech0.fixed.map((f, i) => f || !S.has(mech0.ids[i]));
      if (hand.some((i) => !fixed[i]) && mobility({ ...mech0, fixed }, x0, hand, { finite: false }).hand) ringsAfter = 0;
    }
  }
  const handY = Math.min(...nodes.filter((id) => !isSup(id)).map((id) => model.nodes[id].pos[1]));
  const levels = [...new Set(movable.map((id) => +model.nodes[id].pos[1].toFixed(3)))].filter((h) => h > 1e-6 && h <= handY + 1e-6).sort((a, b) => b - a);
  for (const h of levels) {
    const S = close(new Set([...movable.filter((id) => model.nodes[id].pos[1] >= h - 1e-6), ...nodes.filter((id) => !isSup(id))]));
    cands.push({ free: S, kind: "set", label: `o pavimento: tudo de Z = ${fmt(h)} M para cima (o de baixo parado)`, short: `pavimento Z ≥ ${fmt(h)} M` });
  }
  cands.push({ free: new Set(movable), kind: "all", label: "a estrutura toda, até as GC", short: "estrutura toda" });
  // do menor ao maior; o "tudo" fica por último
  const order = cands.map((c, i) => ({ c, i })).sort((a, b) => (a.c.kind === "all" ? 1 : 0) - (b.c.kind === "all" ? 1 : 0) || a.c.free.size - b.c.free.size || a.i - b.i);
  const seenFree = new Set<string>();
  const seenMoving = new Set<string>();
  const out: MoveScope[] = [];
  if (local) {
    out.push({ kind: "local", free: null, label: "só a esfera (as molas dela giram em volta das vizinhas)", short: "só a esfera", hand: -1, moving: 1 });
  }
  for (const { c } of order) {
    const fk = [...c.free].sort().join(",");
    if (seenFree.has(fk) && c.kind !== "all") continue;
    seenFree.add(fk);
    const fixed = mech0.fixed.map((f, i) => f || !c.free.has(mech0.ids[i]));
    if (!hand.some((i) => !fixed[i])) continue;
    // conta linear primeiro (rápida); a de verdade (movimentos finitos) só nos que sobram
    const lin = mobility({ ...mech0, fixed }, x0, hand, { finite: false });
    if (!lin.hand) continue;
    const lk = `${(lin.moving ?? []).join(",")}`;
    if (seenMoving.has(`L|${lk}`) && c.kind !== "all") continue;
    seenMoving.add(`L|${lk}`);
    // conjuntos pequenos: confere com movimentos finitos (o linear às vezes vê dobras que não existem); nos grandes,
    // a conta de verdade fica para quando o conjunto é escolhido (o rodapé diz se trava)
    const small = fixed.filter((f) => !f).length <= 24;
    const mob = small ? mobility({ ...mech0, fixed }, x0, hand) : lin;
    if (!mob.hand) continue;
    const mk = `${mob.hand}|${(mob.moving ?? []).join(",")}`;
    const prev = out[out.length - 1];
    // mesmo tanto de esferas e mesma liberdade que o anterior: na prática, o mesmo conjunto
    if (prev && prev.kind !== "local" && c.kind !== "all" && prev.moving === (mob.moving ?? []).length && prev.hand === mob.hand) continue;
    // "só a esfera" já está no local: o mesmo grupo não repete
    if (local && c.hop0) {
      seenMoving.add(mk);
      continue;
    }
    if (seenMoving.has(mk)) {
      // a estrutura toda mexe o mesmo que um conjunto menor: troca o rótulo do último por "toda"
      if (c.kind === "all" && out.length && out[out.length - 1].kind === "set" && out[out.length - 1].moving === (mob.moving ?? []).length && out[out.length - 1].hand === mob.hand) {
        out[out.length - 1] = { ...out[out.length - 1], kind: "all", free: null, label: c.label, short: c.short };
      }
      continue;
    }
    seenMoving.add(mk);
    out.push({ kind: c.kind, free: c.kind === "all" ? null : c.free, label: c.label, short: c.short, hand: mob.hand, moving: (mob.moving ?? []).length });
  }
  return out;
}

/** Movimento da peça no conjunto `level` (guardado por modelo: o mesmo conjunto não recalcula o caminho). */
export function globalMoveAt(cat: Catalog, model: Model, ref: MoveRef, scope: MoveScope | null): GlobalMove {
  const key = `${ref.kind}:${ref.id}:${scope?.free ? [...scope.free].sort().join(",") : "*"}`;
  let memo = moveMemo.get(model);
  if (!memo) moveMemo.set(model, (memo = new Map()));
  let g = memo.get(key);
  if (!g) memo.set(key, (g = globalMoveOptions(cat, model, ref, scope?.free ?? null)));
  return g;
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
