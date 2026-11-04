// Kit 3: cabo (esferas e bolinhas de outros cabos) e enrijecedor.
import { catalog } from "../../core/catalog";
import { len, sub, type Model, type Vec3 } from "../../core/model";
import { validateRope, validateStiffener } from "../../core/rules";
import { ropeBalls, ropeChainOf, ropeInfo, ropeLink, ropeText, type RopeBall, type RopeEnd, type RopePick, type RopeRef } from "../../core/rope";
import { type Candidate } from "../../core/snapping";
import { useApp } from "../../ui/store";
import { toWorld } from "../../render/units";
import type { Ctx } from "../ctx";
import * as Q from "../queries";
import { sphereUnder } from "./bars";

// cabo (Kit 3): a bolinha de um cabo sob o cursor (K7); as referências (K8) puxam quando estão perto
export function ballUnder(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model, from?: Vec3): { ball: RopeBall; ref?: RopeRef } | null {
  const dpx = (p: Vec3) => {
    const q = ctx.toScreen(toWorld(p), rect);
    return q.z > 1 ? Infinity : Math.hypot(q.x - ev.clientX, q.y - ev.clientY);
  };
  let ref: { r: RopeRef; d: number } | null = null;
  for (const r of Q.ropeRefsFor(model, from)) {
    const d = dpx(r.pos);
    if (d < 14 && (!ref || d < ref.d)) ref = { r, d };
  }
  if (ref) return { ball: ref.r, ref: ref.r };
  let seg: { id: string; d: number } | null = null;
  for (const m of Object.values(model.members)) {
    if (catalog.pieces[m.code]?.type !== "rope") continue;
    const p = ctx.toScreen(toWorld(model.nodes[m.a].pos), rect);
    const q = ctx.toScreen(toWorld(model.nodes[m.b].pos), rect);
    if (p.z > 1 || q.z > 1) continue;
    const [dx, dy] = [q.x - p.x, q.y - p.y];
    const t = Math.max(0, Math.min(1, ((ev.clientX - p.x) * dx + (ev.clientY - p.y) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(p.x + t * dx - ev.clientX, p.y + t * dy - ev.clientY);
    if (d < 10 && (!seg || d < seg.d)) seg = { id: m.id, d };
  }
  if (!seg) return null;
  const balls = ropeBalls(catalog, model, seg.id);
  if (!balls.length) return null;
  return { ball: balls.reduce((x, y) => (dpx(x.pos) <= dpx(y.pos) ? x : y)) };
}

export function markBall(_ctx: Ctx, p: Vec3 | null) {
  const cur = useApp.getState().ballHover;
  if (cur !== p && !(cur && p && len(sub(cur, p)) < 1e-9)) useApp.setState({ ballHover: p });
}

// cabo (Kit 3): primeira ponta (linkFrom numa esfera, ropeBall numa bolinha de cabo) e a outra; o pedaço sai da
// distância entre elas, esticado. Ponta numa bolinha: o cabo novo é um pendural preso ali (K7).
export function ropeStep(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"]): boolean {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  cmd.linkPick = null;
  cmd.linkGhost = null;
  cmd.ballPick = null;
  const fromNode = st.linkFrom && model.nodes[st.linkFrom] ? st.linkFrom : null;
  const fromBall = !fromNode && st.ropeBall && model.members[st.ropeBall.member] ? st.ropeBall : null;
  const fromPos = fromNode ? model.nodes[fromNode].pos : fromBall?.pos;
  const on = sphereUnder(ctx, ev, rect, model, true);
  const hit = on ? null : ballUnder(ctx, ev, rect, model, fromPos);
  ctx.markHover(on); // a esfera sob o cursor fica destacada antes do clique
  markBall(ctx, hit?.ball.pos ?? null); // e a bolinha do cabo
  const started = !!(fromNode || fromBall);
  if (!on && !hit) {
    st.setGhost(null, started ? "Clique na outra ponta: uma esfera ou uma bolinha de outro cabo. Esc cancela." : "Clique numa esfera (ou numa bolinha de um cabo) e depois na outra ponta.");
    return true;
  }
  const chainOfBall = (b: RopeBall) => ropeChainOf(catalog, model, b.member);
  const ballText = (h: { ball: RopeBall; ref?: RopeRef }) => {
    const n = chainOfBall(h.ball)?.balls ?? 0;
    return `${h.ref ? `${h.ref.kind === "green" ? "Verde" : "Amarelo"}: ${h.ref.text} · ` : ""}bolinha ${h.ball.ball} de ${n} do cabo`;
  };
  const same = on ? on === fromNode : !!fromBall && len(sub(fromBall.pos, hit!.ball.pos)) < 1e-6;
  if (!started || same) {
    if (on) cmd.linkPick = on;
    else cmd.ballPick = hit!.ball;
    const what = on ? "nesta esfera" : `aqui (${ballText(hit!)})`;
    st.setGhost(null, started ? "Clique na outra ponta. Clique de novo nesta (ou Esc) cancela." : `Clique para prender o cabo ${what}; depois clique na outra ponta.`);
    return true;
  }
  const a: RopePick = fromNode ? { node: fromNode } : fromBall!;
  const b: RopePick = on ? { node: on } : hit!.ball;
  const r = ropeLink(model, code, a, b);
  const base: Model = { ...r.model, members: Object.fromEntries(Object.entries(r.model.members).filter(([k]) => k !== r.id)) };
  const check = validateRope(catalog, inv, base, r.a, r.b);
  const end = (id: string) => (r.model.nodes[id].kind === "clip" ? "tap" : "sphere") as RopeEnd;
  const info = ropeInfo(catalog, r.model.nodes[r.a].pos, r.model.nodes[r.b].pos, [end(r.a), end(r.b)]);
  cmd.linkGhost = { moved: 0 };
  const where = hit ? ` preso na ${ballText(hit)}` : fromBall ? " preso no outro cabo" : "";
  const text = check.ok && info ? `${r.clips.length ? "Pendural" : "Cabo"} de ${ropeText(info.balls, info.cutMm)}${where}. Clique para colocar.` : check.errors[0];
  if (!r.clips.length) {
    const cand: Candidate = { kind: "member", code, fromId: r.a, toPos: model.nodes[r.b].pos, check };
    st.setGhost({ kind: "cand", cand }, text);
  } else st.setGhost({ kind: "group", model: r.model, ids: new Set(r.clips), keep: true, check }, text);
  return true;
}

// enrijecedor (Kit 3): a mola mais perto do cursor; clicar põe (ou tira, se já tem)
export function stiffStep(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model, inv: ReturnType<typeof useApp.getState>["inventory"]) {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  cmd.linkPick = null;
  cmd.linkGhost = null;
  let best: { id: string; d: number } | null = null;
  for (const m of Object.values(model.members)) {
    if (catalog.pieces[m.code]?.type !== "bar") continue;
    const p = ctx.toScreen(toWorld(model.nodes[m.a].pos), rect);
    const q = ctx.toScreen(toWorld(model.nodes[m.b].pos), rect);
    if (p.z > 1 || q.z > 1) continue;
    const [dx, dy] = [q.x - p.x, q.y - p.y];
    const t = Math.max(0.12, Math.min(0.88, ((ev.clientX - p.x) * dx + (ev.clientY - p.y) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(p.x + t * dx - ev.clientX, p.y + t * dy - ev.clientY);
    if (d < 14 && (!best || d < best.d)) best = { id: m.id, d };
  }
  ctx.markHover(best?.id ?? null); // a mola sob o cursor fica destacada antes do clique
  if (!best) return st.setGhost(null, "Clique numa mola B6 ou B12 para pôr o enrijecedor (numa mola enrijecida, tira).");
  const m = model.members[best.id];
  const r = validateStiffener(catalog, inv, model, m.id);
  const next: Model = { ...model, members: { ...model.members, [m.id]: { ...m, stiff: !m.stiff || undefined } } };
  if (!next.members[m.id].stiff) delete next.members[m.id].stiff;
  const part: Model = { ...next, nodes: { [m.a]: model.nodes[m.a], [m.b]: model.nodes[m.b] }, members: { [m.id]: next.members[m.id] }, plates: {}, connectors: {} };
  st.setGhost(
    { kind: "group", model: next, ids: new Set(), part, keep: true, check: { ok: r.ok, errors: r.errors, warnings: [] } },
    r.ok ? (r.remove ? `Clique para tirar o enrijecedor desta ${m.code}.` : `Clique para pôr o enrijecedor ${r.code} nesta ${m.code}.`) : r.errors[0],
  );
}
