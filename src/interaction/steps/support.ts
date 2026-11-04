// GC: ponto de encaixe (grade, azul, amarelo) e GC perto da estrutura (círculos onde uma mola chega).
import * as THREE from "three";
import { catalog } from "../../core/catalog";
import { reachAction, reachPoint, type ReachGuide } from "../../core/reach";
import { boardsOf, type Model, type Vec3 } from "../../core/model";
import { supportCandidate, supportPosition, type SupportGuide } from "../../core/snapping";
import { useApp } from "../../ui/store";
import { M, toWorld } from "../../render/units";
import type { Ctx } from "../ctx";
import * as Q from "../queries";

const KIND_NAME = { grid: "Grade", blue: "Azul", yellow: "Amarelo" } as const;

export function pickSupport(ctx: Ctx, ev: PointerEvent, rect: DOMRect, hit: { x: number; z: number }, guides: SupportGuide[],): { pos: Vec3 | null; hint: string | null } {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  // distância na tela medida na altura da chapa, onde os pontos são desenhados
  const dist = (p: Vec3) => {
    const w = toWorld(p);
    w.y = 0.6;
    const sp = ctx.toScreen(w, rect);
    return Math.hypot(sp.x - ev.clientX, sp.y - ev.clientY);
  };
  type Choice = { pos: Vec3; kind: keyof typeof KIND_NAME; text: string | null; d: number };
  const enabled = guides.filter((g) => st.guides[g.kind]);
  // grade desligada e há pontos azuis/amarelos: a GC só vai para eles (raio maior)
  const exclusive = !st.snap && enabled.length > 0;
  const radius = exclusive ? Q.EXCLUSIVE_PX : Q.GUIDE_PX;
  const all: Choice[] = [];
  if (st.snap) {
    const g = supportPosition(catalog, hit, true, boardsOf(st.history.present));
    all.push({ pos: g, kind: "grid", text: null, d: dist(g) });
  }
  for (const g of enabled) {
    const d = dist(g.pos);
    if (d >= radius) continue;
    // mesmo ponto: amarelo > azul > grade (o que diz mais fica)
    const rank = { grid: 0, blue: 1, yellow: 2 } as const;
    const same = all.findIndex((c) => Math.hypot(c.pos[0] - g.pos[0], c.pos[2] - g.pos[2]) < 1e-3);
    if (same >= 0) {
      if (rank[all[same].kind] >= rank[g.kind]) continue;
      all.splice(same, 1);
    }
    all.push({ pos: g.pos, kind: g.kind, text: g.text, d });
  }
  if (!all.length) {
    if (exclusive) {
      const which = [st.guides.blue && "azul", st.guides.yellow && "amarelo"].filter(Boolean).join(" ou ");
      return { pos: null, hint: `Grade desligada: leve o cursor até um ponto ${which}.` };
    }
    const none = !st.snap && (st.guides.blue || st.guides.yellow);
    return { pos: supportPosition(catalog, hit, false, boardsOf(st.history.present)), hint: none ? "Ainda não há pontos azuis/amarelos: a GC vai livre. Coloque duas GC a um vão de barra para surgirem os triângulos." : null };
  }
  all.sort((a, b) => a.d - b.d);
  // pontos "disputados": os que estão quase tão perto quanto o mais perto
  const near = all.filter((c) => c.d < all[0].d + Q.GUIDE_PX);
  const pkey = near.map((c) => c.pos.join(",")).join("|");
  if (pkey !== cmd.lastChoiceKey) {
    cmd.lastChoiceKey = pkey;
    if (st.snapCycle) useApp.setState({ snapCycle: 0 });
  }
  const pick = near[useApp.getState().snapCycle % near.length];
  const tail = near.length > 1 ? ` (${near.length} pontos aqui: Tab alterna)` : "";
  if (pick.kind === "grid" && near.length === 1) return { pos: pick.pos, hint: null };
  return { pos: pick.pos, hint: `${KIND_NAME[pick.kind]}${pick.text ? `: ${pick.text}` : ""}${tail}` };
}

/**
 * GC perto da estrutura: o cursor perto de um círculo azul (ou do ponto logo abaixo de uma esfera) encaixa nele.
 * Clique: GC + mola nova até a esfera, ou a mola pendurada desce até a GC. R alterna para só a GC.
 */
const REACH_PX = 16;
export function reachStep(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model, inv: ReturnType<typeof useApp.getState>["inventory"]): boolean {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  const guides = Q.reachFor(model, inv);
  if (!guides.length) return false;
  const dpx = (p: Vec3) => {
    const q = ctx.toScreen(new THREE.Vector3(p[0] * M, 0.6, p[2] * M), rect);
    return q.z > 1 ? Infinity : Math.hypot(q.x - ev.clientX, q.y - ev.clientY);
  };
  let best: { g: ReachGuide; pos: Vec3; d: number } | null = null;
  for (const g of guides) {
    if (g.r === 0) {
      const d = dpx(g.center);
      if (d < REACH_PX && (!best || d < best.d - 2)) best = { g, pos: g.center, d };
      continue;
    }
    let bt = 0;
    let bd = Infinity;
    for (let k = 0; k < 180; k++) {
      const t = (k * Math.PI) / 90;
      const d = dpx(reachPoint(g, t));
      if (d < bd) (bd = d), (bt = t);
    }
    // passos de 15° em volta da esfera (os "redondos") puxam quando estão perto
    const t15 = Math.round(bt / (Math.PI / 12)) * (Math.PI / 12);
    const p15 = reachPoint(g, t15);
    const pos = dpx(p15) < 10 ? p15 : reachPoint(g, bt);
    const d = dpx(pos);
    if (d < REACH_PX && (!best || d < best.d)) best = { g, pos, d };
  }
  if (!best) return false;
  const pos = best.pos.map((v) => Math.round(v * 1e4) / 1e4 + 0) as Vec3;
  // todas as molas que chegam neste ponto (a pendurada primeiro: não gasta peça nova) e, por último, só a GC
  const here = guides
    .filter((g) => Math.abs(Math.hypot(pos[0] - g.center[0], pos[2] - g.center[2]) - g.r) < 1e-3)
    .sort((x, y) => (x.kind === "swing" ? 0 : 1) - (y.kind === "swing" ? 0 : 1));
  const n = here.length + 1;
  // outro ponto: as opções recomeçam
  const spotKey = `${pos[0].toFixed(2)},${pos[2].toFixed(2)}`;
  if (spotKey !== cmd.reachSpot) {
    cmd.reachSpot = spotKey;
    if (st.rotIndex) useApp.setState({ rotIndex: 0 });
  }
  const k = useApp.getState().rotIndex % n;
  const more = ` R: ${k + 1 < n ? "próxima opção" : "volta"} (${k + 1} de ${n}).`;
  if (k === here.length) {
    const cand = supportCandidate(catalog, inv, model, pos);
    st.setGhost({ kind: "cand", cand }, cand.check.ok ? `Só a GC.${more}` : cand.check.errors[0]);
    return true;
  }
  const g = here[k];
  const a = reachAction(catalog, inv, model, g, pos);
  const what = g.kind === "swing" ? `Clique: ${g.text} (a ponta vira a GC).` : `Clique: GC e ${g.text}.`;
  st.setGhost({ kind: "group", model: a.model, ids: a.ids, check: a.check, keep: true }, a.check.ok ? `${what}${more}` : `${a.check.errors[0].replace(/\.$/, "")}.${more}`);
  return true;
}
