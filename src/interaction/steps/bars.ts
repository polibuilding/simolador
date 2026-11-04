// Barras: barra livre, pontos amarelos/laranja (triângulos) e ligar duas esferas com dois cliques.
import * as THREE from "three";
import { catalog } from "../../core/catalog";
import { AXES, add, boardsOf, findNodeAt, len, norm, rotDir, scale, sub, toDisp, type Model, type Vec3 } from "../../core/model";
import { frameRadAt } from "../../core/boards";
import { validateMember } from "../../core/rules";
import { inclinedDirs, type BarGuide, type Candidate } from "../../core/snapping";
import { useApp } from "../../ui/store";
import { M, toWorld } from "../../render/units";
import type { Ctx } from "../ctx";
import * as Q from "../queries";

const deg = (r: number) => Math.round((r * 180) / Math.PI);

// ---- barras livres: a ponta segue o cursor na esfera do comprimento da barra, com encaixes ----
export function freeBar(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"]) {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  const L = catalog.pieces[code].spanM![0];
  const tolM = catalog.settings.tolerancia_encaixe_mm / M;
  const nodes = Object.values(model.nodes);
  const dpx = (p: Vec3) => {
    const q = ctx.toScreen(toWorld(p), rect);
    return q.z > 1 ? Infinity : Math.hypot(q.x - ev.clientX, q.y - ev.clientY);
  };
  // esfera de partida: a que estiver sob o cursor (fica até outra esfera ser apontada sem fechar a barra)
  let anchor = cmd.freeAnchor ? model.nodes[cmd.freeAnchor] : undefined;
  if (cmd.freeHold && Math.hypot(ev.clientX - cmd.freeHold.x, ev.clientY - cmd.freeHold.y) > 30) cmd.freeHold = null;
  const near = cmd.freeHold ? undefined : nodes.map((n) => ({ n, d: dpx(n.pos) })).filter((x) => x.d < 16).sort((a, b) => a.d - b.d)[0];
  if (near && near.n.id !== anchor?.id) {
    const closes = anchor && Math.abs(len(sub(near.n.pos, anchor.pos)) - L) <= tolM;
    if (!closes) anchor = near.n;
  }
  cmd.freeAnchor = anchor?.id ?? null;
  if (!anchor) return st.setGhost(null, "Barra livre: passe o cursor numa esfera para começar e puxe em qualquer direção.");
  const A = anchor.pos;
  // ponto cru: onde o raio do cursor encontra a esfera de raio L em volta da partida
  const ray = ctx.rayAt(ev, rect);
  const C = toWorld(A);
  const hitW = ray.intersectSphere(new THREE.Sphere(C, L * M), new THREE.Vector3())
    ?? C.clone().add(ray.closestPointToPoint(C, new THREE.Vector3()).sub(C).setLength(L * M));
  const raw = ctx.toModule(hitW);
  type Snap = { pos: Vec3; d: number; label: string };
  const snaps: Snap[] = [];
  // 1) fechar numa esfera que está exatamente a L
  for (const n of nodes) {
    if (n.id === anchor.id || Math.abs(len(sub(n.pos, A)) - L) > tolM) continue;
    if (Object.values(model.members).some((m) => (m.a === anchor!.id && m.b === n.id) || (m.b === anchor!.id && m.a === n.id))) continue;
    const d = dpx(n.pos);
    if (d < 20) snaps.push({ pos: n.pos, d: d - 10, label: `fecha na esfera (${toDisp(n.pos).map((v) => +v.toFixed(2)).join("; ")})` });
  }
  // 2) eixos e passos de 15°
  const fr = frameRadAt(catalog, boardsOf(model), A[0], A[2]);
  for (const dir0 of [...AXES, ...inclinedDirs(15)]) {
    const dir = rotDir(dir0, fr);
    const p = add(A, scale(dir, L));
    const d = dpx(p);
    if (d < 9) snaps.push({ pos: p, d: d + 1, label: dir.filter((x) => Math.abs(x) > 1e-6).length === 1 ? "no eixo" : "passo de 15°" });
  }
  // 3) triângulo: ponta a um vão de barra de outra esfera (a próxima barra fecha nela)
  const spans = [...new Set(Object.values(catalog.pieces).filter((p) => p.type === "bar" && p.spanM).map((p) => p.spanM![0]))];
  for (const B of nodes) {
    if (B.id === anchor.id) continue;
    const v = sub(B.pos, A);
    const dAB = len(v);
    if (dAB < 1e-6 || dAB > L + Math.max(...spans)) continue;
    const u = scale(v, 1 / dAB);
    for (const sB of spans) {
      const x = (L * L - sB * sB + dAB * dAB) / (2 * dAB);
      const h2 = L * L - x * x;
      if (h2 <= 1e-6) continue;
      const pc = add(A, scale(u, x));
      const w = sub(raw, pc);
      const inPlane = sub(w, scale(u, w[0] * u[0] + w[1] * u[1] + w[2] * u[2]));
      if (len(inPlane) < 1e-6) continue;
      const q = add(pc, scale(norm(inPlane), Math.sqrt(h2)));
      const d = dpx(q);
      const name = Object.values(catalog.pieces).find((p) => p.type === "bar" && p.spanM?.[0] === sB)?.code ?? "";
      if (d < 12) snaps.push({ pos: q, d: d + 2, label: `fecha triângulo com a esfera (${toDisp(B.pos).map((t) => +t.toFixed(2)).join("; ")}) usando ${name}` });
    }
  }
  // 4) alturas que já existem
  const ys = [...new Set(nodes.map((n) => Math.round(n.pos[1] * 1e4) / 1e4))];
  const hd = norm([raw[0] - A[0], 0, raw[2] - A[2]]);
  for (const y of ys) {
    const dy = y - A[1];
    if (Math.abs(dy) >= L - 1e-6 || len(hd) < 1e-6) continue;
    const r = Math.sqrt(L * L - dy * dy);
    const q: Vec3 = [A[0] + hd[0] * r, y, A[2] + hd[2] * r];
    const d = dpx(q);
    if (d < 10) snaps.push({ pos: q, d: d + 3, label: `na altura z = ${+y.toFixed(2)} M` });
  }
  snaps.sort((a, b) => a.d - b.d);
  const pick = snaps[0];
  const end = (pick?.pos ?? raw).map((v) => Math.round(v * 1e4) / 1e4 + 0) as Vec3;
  const target = findNodeAt(model, end);
  const cand: Candidate = {
    kind: "member", code, fromId: anchor.id, toPos: target ? target.pos : end, inclined: true,
    check: validateMember(catalog, inv, model, code, anchor.id, target ? target.pos : end, { free: true }),
  };
  const dv = sub(end, A);
  const elev = deg(Math.asin(Math.max(-1, Math.min(1, dv[1] / L))));
  const azim = (deg(Math.atan2(-dv[2], dv[0])) + 360) % 360;
  const info = `${pick ? `${pick.label} · ` : ""}${elev}° com a horizontal, ${azim}° em planta · ponta em z = ${end[1].toFixed(2).replace(".", ",")} M`;
  st.setGhost({ kind: "cand", cand }, cand.check.ok ? `Livre: ${info}` : cand.check.errors[0]);
}

// ---- pontos amarelos de barras: vértices de triângulos com esferas vizinhas (botão Triângulo) ----
// A esfera sob o cursor vira a partida e fica até outra esfera ser apontada; perto de um ponto amarelo,
// o fantasma mostra o triângulo inteiro (R: só a barra).
export function triangleStep(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"]): boolean {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  const dpx = (p: Vec3) => {
    const q = ctx.toScreen(toWorld(p), rect);
    return q.z > 1 ? Infinity : Math.hypot(q.x - ev.clientX, q.y - ev.clientY);
  };
  const anchor = st.triAnchor && model.nodes[st.triAnchor] ? st.triAnchor : null;
  // Tab: percorre os pontos da esfera de partida, do mais perto do cursor (onde o Tab foi apertado) ao mais longe;
  // mexer o cursor mais de Q.TAB_PX volta ao normal
  if (st.snapCycle && !cmd.triTab) cmd.triTab = { x: ev.clientX, y: ev.clientY, anchor };
  if (cmd.triTab && (!st.snapCycle || cmd.triTab.anchor !== anchor || Math.hypot(ev.clientX - cmd.triTab.x, ev.clientY - cmd.triTab.y) > Q.TAB_PX)) {
    cmd.triTab = null;
    if (st.snapCycle) useApp.setState({ snapCycle: 0 });
  }
  if (anchor) {
    const guides = Q.barGuidesFor(model, code, inv, anchor);
    let best: { g: BarGuide; d: number } | null = null;
    let tabInfo = "";
    if (cmd.triTab && guides.length) {
      const from = cmd.triTab;
      const at = (p: Vec3) => {
        const q = ctx.toScreen(toWorld(p), rect);
        return q.z > 1 ? Infinity : Math.hypot(q.x - from.x, q.y - from.y);
      };
      const order = [...guides].sort((a, b) => at(a.pos) - at(b.pos));
      const n = order.length;
      const i = ((((useApp.getState().snapCycle - 1) % n) + n) % n);
      best = { g: order[i], d: 0 };
      tabInfo = ` (ponto ${i + 1} de ${n}: Tab próximo, Shift+Tab volta)`;
    } else {
      for (const g of guides) {
        const d = dpx(g.pos);
        if (d < Q.TRI_PX && (!best || d < best.d)) best = { g, d };
      }
      if (best) tabInfo = ` Tab percorre os ${guides.length} pontos.`;
    }
    if (best) {
      const g = best.g;
      const k = `tri:${anchor}:${Q.key(g.pos)}`;
      if (cmd.lastSpot !== k) {
        cmd.lastSpot = k;
        if (st.rotIndex) useApp.setState({ rotIndex: 0 });
      }
      const fmt = (p: Vec3) => `(${toDisp(p).map((v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })).join("; ")})`;
      const count = new Map<string, number>();
      for (const c of g.closes) count.set(c.code, (count.get(c.code) ?? 0) + 1);
      const closes = [...count].map(([c, n]) => (n > 1 ? `${n}× ${c}` : c)).join(" + ");
      const nTxt = g.closes.length > 1 ? `as ${g.closes.length} barras que fecham (${closes})` : `a ${closes} que fecha`;
      if (useApp.getState().rotIndex % 2 === 0) {
        const { part, ids } = Q.newPart(model, g.model);
        st.setGhost(
          { kind: "group", model: g.model, ids, part, keep: true, check: { ok: true, errors: [], warnings: [] } },
          `${g.closes.length > 1 ? "Laranja" : "Amarelo"}: ${g.text}. Clique: a ${code} e ${nTxt}. R: só a ${code}.${tabInfo}`,
        );
      } else {
        st.setGhost({ kind: "cand", cand: g.bar }, `${g.closes.length > 1 ? "Laranja" : "Amarelo"}: só a ${code} até ${fmt(g.pos)} (${g.text}). R: com ${nTxt.replace(/ que fecham?/, "")}.${tabInfo}`);
      }
      return true;
    }
  }
  // esfera perto do cursor: vira a partida dos pontos amarelos
  let near: { id: string; d: number } | null = null;
  for (const n of Object.values(model.nodes)) {
    const d = dpx(n.pos);
    if (d < Q.TRI_ANCHOR_PX && (!near || d < near.d)) near = { id: n.id, d };
  }
  if (near && near.id !== anchor) useApp.setState({ triAnchor: near.id });
  else if (!anchor && st.triAnchor) useApp.setState({ triAnchor: null });
  return false;
}

/** Esfera sob o cursor: dentro do desenho dela na tela (mínimo 9 px). `skipClip`: sem os pontos de cabo. */
export function sphereUnder(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model, skipClip = false): string | null {
  const right = new THREE.Vector3().setFromMatrixColumn(ctx.camera.matrixWorld, 0);
  let best: { id: string; d: number } | null = null;
  for (const n of Object.values(model.nodes)) {
    if (skipClip && n.kind === "clip") continue;
    const w = toWorld(n.pos);
    const c = ctx.toScreen(w, rect);
    if (c.z > 1) continue;
    const e = ctx.toScreen(w.clone().add(right.clone().multiplyScalar(catalog.settings.esfera_diametro_mm / 2)), rect);
    const r = Math.max(9, Math.hypot(e.x - c.x, e.y - c.y));
    const d = Math.hypot(c.x - ev.clientX, c.y - ev.clientY);
    if (d <= r && (!best || d < best.d)) best = { id: n.id, d };
  }
  return best?.id ?? null;
}

// ---- ligar duas esferas (dois cliques): a segunda anda até a mola caber ----
export function linkStep(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"]): boolean {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  cmd.linkPick = null;
  cmd.linkGhost = null;
  const on = sphereUnder(ctx, ev, rect, model);
  if (!on) return false;
  const fmt = (p: Vec3) => `(${toDisp(p).map((v) => +v.toFixed(2)).join("; ")})`;
  const from = st.linkFrom && model.nodes[st.linkFrom] ? st.linkFrom : null;
  if (!from || on === from) {
    cmd.linkPick = on;
    st.setGhost(
      null,
      from
        ? `Primeira esfera ${fmt(model.nodes[from].pos)}: clique na outra esfera. Clique de novo nesta (ou Esc) cancela.`
        : "Clique para começar a ligação nesta esfera; depois clique na outra esfera. Ou leve o cursor até um ponto verde, amarelo ou laranja.",
    );
    return true;
  }
  const r = Q.linkFor(model, code, inv, from, on);
  if (!r.model) {
    st.setGhost(null, r.error ?? "Não dá para ligar essas esferas.");
    return true;
  }
  cmd.linkGhost = { moved: r.moved ?? 0 };
  const moved = r.moved ? ` A segunda esfera anda ${(r.moved).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} M e as molas dela giram para a ${code} caber.` : "";
  st.setGhost(
    { kind: "group", model: r.model, ids: r.ids ?? new Set([on]), keep: true, check: { ok: true, errors: [], warnings: [] } },
    `Clique para ligar ${fmt(model.nodes[from].pos)} a ${fmt(model.nodes[on].pos)} com a ${code}.${moved}`,
  );
  return true;
}
