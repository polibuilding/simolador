// Mexer peças: caminho azul, arraste livre, mover a estrutura, colar.
import * as THREE from "three";
import { catalog } from "../../core/catalog";
import { locusCirclePoint, moveGroup, nearestOnRing, type LocusCircle } from "../../core/edit";
import { pasteClip, transformClip } from "../../core/clipboard";
import { add, len, scale, sub, toDisp, type Vec3 } from "../../core/model";
import { componentOf } from "../../core/model";
import { scopeTag, useApp } from "../../ui/store";
import { BASE_Y, M, toWorld } from "../../render/units";
import type { Ctx } from "../ctx";
import * as Q from "../queries";
import { pickSupport } from "./support";

/** Mexer peças: caminho azul (mover só o nó, etapas), arraste livre, mover a estrutura e colar. */
export function moveStep(ctx: Ctx, ev: PointerEvent, rect: DOMRect): void {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  const tool = st.tool;
  // ---- mover só o nó (duplo clique na esfera) ou girar o conjunto (duplo clique numa mola, diagonal ou placa):
  //      desliza pelo caminho possível (esfera, círculo ou pontos) ----
  // ---- conjunto livre (2 ou mais graus de liberdade): a peça segue o cursor e o resto mexe o mínimo ----
  if (tool.kind === "moveBody" && Q.globalFor(st.history.present, tool).mode !== "path") {
    const g = Q.globalFor(st.history.present, tool);
    const tag = scopeTag(st.history.present, tool);
    if (g.mode === "locked") return void st.setGhost(null, g.reason + tag);
    if (g.mode !== "free") return;
    const ray = ctx.rayAt(ev, rect);
    const H = toWorld(g.handle);
    const nrm = ctx.camera.getWorldDirection(new THREE.Vector3());
    const hit = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, H), new THREE.Vector3());
    if (!hit) return;
    const mv = g.drag(ctx.toModule(hit));
    const moved = len(sub(mv.pos, g.handle)).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    return void st.setGhost(
      { kind: "group", model: mv.model, ids: mv.ids, check: mv.check },
      mv.check.ok
        ? `Clique para deixar aqui (a peça anda ${moved} M; mexem ${mv.ids.size} ${mv.ids.size === 1 ? "esfera" : "esferas"}).${mv.check.warnings[0] ? ` ${mv.check.warnings[0]}` : ""}${tag}`
        : `${mv.check.errors[0]}${tag}`,
    );
  }
  if (tool.kind === "moveNode" || tool.kind === "moveBody") {
    const present = st.history.present;
    const path = Q.pathFor(present, tool);
    if (!path) return void st.disarm();
    const { set, start, lift, key: pathKey } = path;
    const body = tool.kind === "moveBody";
    if (set.locked) return void st.setGhost(null, set.locked);
    const dpx = (p: Vec3) => {
      const w = toWorld(p);
      if (lift) w.y = 0.6;
      const q = ctx.toScreen(w, rect);
      return q.z > 1 ? Infinity : Math.hypot(q.x - ev.clientX, q.y - ev.clientY);
    };
    // Tab (ou → / ←): percorre as referências do caminho. Num ponto, mexer o cursor mais de Q.TAB_PX volta ao normal;
    // numa circunferência, a esfera desliza nela seguindo o cursor (até o próximo Tab ou Esc)
    const tabIndex = (tab: NonNullable<typeof cmd.nodeTab>, c: number) => {
      const n = tab.pts.length;
      return (((tab.start + (c > 0 ? c - 1 : c)) % n) + n) % n;
    };
    const onRing = !!cmd.nodeTab && cmd.nodeTab.pts.length > 0 && !!cmd.nodeTab.rings[tabIndex(cmd.nodeTab, st.snapCycle)];
    if (cmd.nodeTab && (!st.snapCycle || cmd.nodeTab.nodeId !== pathKey || (!onRing && Math.hypot(ev.clientX - cmd.nodeTab.x, ev.clientY - cmd.nodeTab.y) > Q.TAB_PX))) {
      cmd.nodeTab = null;
      useApp.setState({ ...(st.snapCycle ? { snapCycle: 0 } : {}), nodeLimits: null });
    }
    const loc = set.locus;
    let tabInfo = "";
    let pick: Vec3 | null = null;
    if (useApp.getState().snapCycle && loc) {
      if (!cmd.nodeTab) {
        // na esfera, os limites são os do meridiano que passa pelo cursor
        let toward: Vec3 = start;
        if (loc.kind === "sphere") {
          const ray = ctx.rayAt(ev, rect);
          const C = toWorld(loc.c);
          const hit = ray.intersectSphere(new THREE.Sphere(C, loc.r * M), new THREE.Vector3());
          if (hit) toward = ctx.toModule(hit);
        }
        const stops = Q.tabStops(present, tool, set, pathKey, toward, start);
        const pts = stops.map((x) => x.pos);
        // começa pela referência mais perto do cursor (circunferência: o ponto dela mais perto)
        const ringPx = (r: LocusCircle) => Math.min(...Array.from({ length: 72 }, (_, k) => dpx(locusCirclePoint(r, (k * Math.PI) / 36))));
        const px = stops.map((x) => (x.ring ? ringPx(x.ring) : dpx(x.pos)));
        let first = 0;
        px.forEach((d, i) => { if (d < px[first]) first = i; });
        cmd.nodeTab = { x: ev.clientX, y: ev.clientY, nodeId: pathKey, pts, labels: stops.map((x) => x.label), rings: stops.map((x) => x.ring ?? null), start: first };
      }
      const n = cmd.nodeTab.pts.length;
      if (!n) {
        cmd.nodeTab = null;
        useApp.setState({ snapCycle: 0, nodeLimits: null });
        return void st.setGhost(null, "Esse caminho não tem limites nem posições na horizontal/vertical.");
      }
      const i = tabIndex(cmd.nodeTab, useApp.getState().snapCycle);
      const ring = cmd.nodeTab.rings[i];
      if (ring) {
        // a esfera desliza na circunferência: o ponto dela mais perto do cursor (na tela)
        let bd = Infinity;
        for (let k = 0; k < 360; k++) {
          const q = locusCirclePoint(ring, (k * Math.PI) / 180);
          const d = dpx(q);
          if (d < bd) (bd = d), (pick = q);
        }
        // encaixa nas posições redondas que caem na circunferência
        for (const o of set.options) if (o.check.ok && dpx(o.pos) < 14 && len(sub(nearestOnRing(ring, o.pos), o.pos)) < 1e-3) pick = o.pos;
      } else pick = cmd.nodeTab.pts[i];
      const cur = useApp.getState().nodeLimits;
      if (!cur || cur.i !== i || cur.pts !== cmd.nodeTab.pts) useApp.setState({ nodeLimits: { pts: cmd.nodeTab.pts, i, rings: cmd.nodeTab.rings } });
      tabInfo = ` ${cmd.nodeTab.labels[i]} (${i + 1} de ${n}): Tab próximo, Shift+Tab volta.`;
    }
    // 1) posições "redondas" (eixos, passos de 15°) perto do cursor: encaixa nelas
    let best = 14;
    if (!pick) {
      for (const o of set.options) {
        const d = dpx(o.pos);
        if (o.check.ok && d < best) (best = d), (pick = o.pos);
      }
    }
    // 2) contínuo, pelo caminho
    if (!pick && loc) {
      if (loc.kind === "sphere") {
        const ray = ctx.rayAt(ev, rect);
        const C = toWorld(loc.c);
        const hit = ray.intersectSphere(new THREE.Sphere(C, loc.r * M), new THREE.Vector3())
          ?? C.clone().add(ray.closestPointToPoint(C, new THREE.Vector3()).sub(C).setLength(loc.r * M));
        pick = ctx.toModule(hit);
      } else if (loc.kind === "circle") {
        let bd = Infinity;
        for (let k = 0; k < 360; k++) {
          const t = (k * Math.PI) / 180;
          const q = add(loc.p, add(scale(loc.e1, loc.h * Math.cos(t)), scale(loc.e2, loc.h * Math.sin(t))));
          const d = dpx(q);
          if (d < bd) (bd = d), (pick = q);
        }
      } else {
        let bd = 80;
        for (const q of loc.pts) {
          const d = dpx(q);
          if (d < bd) (bd = d), (pick = q);
        }
      }
      if (pick && set.nearest) pick = set.nearest(pick) ?? pick;
    }
    const o = pick && set.evalAt ? set.evalAt(pick) : null;
    if (!o) return void st.setGhost(null, body ? "Leve o cursor pelo caminho azul: é por ali que o conjunto pode andar." : "Leve o cursor pelo caminho azul: é por ali que a esfera pode andar.");
    const f = (p: Vec3) => `(${toDisp(p).map((v) => +v.toFixed(2)).join("; ")})`;
    const moved = len(sub(o.pos, start)).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const tag = scopeTag(present, tool);
    const tabHint = (tabInfo || " Tab: referências do caminho.") + tag;
    const what = body
      ? `Clique para deixar aqui (a peça anda ${moved} M; mexem ${o.ids.size} ${o.ids.size === 1 ? "esfera" : "esferas"}).${o.check.warnings[0] ? ` ${o.check.warnings[0]}` : ""}`
      : `Clique para deixar o nó em ${f(o.pos)} (anda ${moved} M).`;
    return void st.setGhost(
      { kind: "group", model: o.model, ids: o.ids, check: o.check },
      o.check.ok
        ? `${what}${tabHint}`
        : `${o.check.errors[0]}${tabInfo || " Tab pula para os limites do trecho azul."}${tag}`,
    );
  }

  // ---- mover estrutura ----
  if (tool.kind === "moveGroup") {
    const node = st.history.present.nodes[tool.nodeId];
    if (!node) return void st.disarm();
    const hit = ctx.planeHit(ev, rect, BASE_Y + node.pos[1] * M);
    if (!hit) return;
    const xz = { x: hit.x / M, z: hit.z / M };
    const guides = node.kind === "support" && !tool.turns ? Q.guidesFor(st.history.present, st.inventory, componentOf(st.history.present, tool.nodeId)) : [];
    const choice = pickSupport(ctx, ev, rect, xz, guides);
    if (!choice.pos) return void st.setGhost(null, choice.hint);
    const target = choice.pos;
    const delta: Vec3 = [target[0] - node.pos[0], 0, target[2] - node.pos[2]];
    const r = moveGroup(catalog, st.history.present, tool.nodeId, delta, tool.turns);
    return void st.setGhost({ kind: "group", model: r.model, ids: r.ids, check: r.check }, r.check.errors[0] ?? choice.hint);
  }

  // ---- colar / mover várias peças: a âncora segue o cursor (na grade) ----
  if (tool.kind === "paste") {
    const base = tool.moving ? tool.moving.base : st.history.present;
    const clip = transformClip(tool.clip, tool.turns, tool.mirrorX, tool.mirrorZ);
    const y = clip.anchor[1] + tool.dy;
    if (y < 0) return void st.setGhost(null, "Abaixo da chapa: ↑ sobe.");
    const hit = ctx.planeHit(ev, rect, BASE_Y + y * M);
    if (!hit) return;
    const r2 = (v: number) => (st.snap ? Math.round(v) : Math.round(v * 100) / 100);
    const target: Vec3 = [r2(hit.x / M), y, r2(hit.z / M)];
    const pkey = `${target.join(",")}|${tool.turns}|${tool.mirrorX}|${tool.mirrorZ}|${tool.dy}`;
    let r = Q.paste.cache?.base === base && Q.paste.cache.clip === tool.clip && Q.paste.cache.key === pkey ? Q.paste.cache.r : null;
    if (!r) {
      r = pasteClip(catalog, st.inventory, base, clip, target);
      Q.paste.cache = { base, clip: tool.clip, key: pkey, r };
    }
    const turn = tool.turns % 4 ? ` · girada ${(tool.turns % 4) * 90}°` : "";
    const flip = tool.mirrorX || tool.mirrorZ ? ` · espelhada em ${[tool.mirrorX && "X", tool.mirrorZ && "Y"].filter(Boolean).join(" e ")}` : "";
    const info = `${r.added} peças · altura ${tool.dy > 0 ? "+" : ""}${tool.dy} M${turn}${flip}. ↑/↓ altura (Shift: 6 M), R gira, X/Y espelha.`;
    return void st.setGhost({ kind: "group", model: r.model, ids: r.newNodes, check: r.check, part: r.part }, r.check.ok ? info : r.check.errors[0]);
  }
}
