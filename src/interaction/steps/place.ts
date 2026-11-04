// Peças comuns: ponto de encaixe e opções.
import { catalog } from "../../core/catalog";
import { type Model } from "../../core/model";
import { stockBlock } from "../../core/rules";
import { anchorPos, markerPos, type Candidate } from "../../core/snapping";
import { inclineOn, useApp } from "../../ui/store";
import { toWorld } from "../../render/units";
import type { Ctx } from "../ctx";
import * as Q from "../queries";

/** Demais peças: o ponto de encaixe mais perto do cursor e as opções dele (R alterna; puxar o cursor escolhe a direção). */
export function spotStep(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"]) {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  // ---- demais peças: ponto de encaixe mais próximo ----
  const inclined = inclineOn(st);
  const { spots } = Q.candidatesFor(model, code, inv, inclined);
  let best: { k: string; s: Q.Spot; d: number; z?: number } | null = null;
  for (const [k, s] of spots) {
    const valid = s.ends.some((c) => c.check.ok) || s.starts.some((c) => c.check.ok);
    if (!valid) continue;
    const sp = ctx.toScreen(toWorld(s.pos), rect);
    if (sp.z > 1) continue;
    const d = Math.hypot(sp.x - ev.clientX, sp.y - ev.clientY);
    if (d >= Q.SPOT_PX) continue;
    if (!best || d < best.d) best = { k, s, d, z: sp.z };
  }
  // pontos quase sobrepostos na tela (ex.: topo do pilar e GC na vista de topo): vale o mais perto da câmera
  if (best) {
    const b0 = ctx.toScreen(toWorld(best.s.pos), rect);
    for (const [k, s] of spots) {
      if (k === best.k || !(s.ends.some((c) => c.check.ok) || s.starts.some((c) => c.check.ok))) continue;
      const sp = ctx.toScreen(toWorld(s.pos), rect);
      if (sp.z < best.z! && Math.hypot(sp.x - b0.x, sp.y - b0.y) < 14) {
        best = { k, s, d: Math.hypot(sp.x - ev.clientX, sp.y - ev.clientY), z: sp.z };
      }
    }
  }
  if (!best) {
    const empty = !Object.keys(model.nodes).length;
    return st.setGhost(
      null,
      empty
        ? "Comece por uma ligação de base: as outras peças saem das esferas."
        : (stockBlock(catalog, inv, model, code) ?? "Leve o cursor até um ponto verde ou até uma esfera."),
    );
  }
  // Ponto sem esfera que é só a ponta de uma peça saindo de uma esfera próxima: vale a esfera (puxar a barra a partir dela).
  // Evita que, numa vista de frente, a ponta de uma viga que vai "para dentro" da tela roube o gesto.
  if (!best.s.starts.length) {
    const owners = new Set(best.s.ends.map((c) => (c.kind === "member" ? Q.key(model.nodes[c.fromId].pos) : "")));
    let near: { k: string; s: Q.Spot; d: number } | null = null;
    for (const [k, s] of spots) {
      if (!owners.has(k) || !s.starts.some((c) => c.check.ok)) continue;
      const sp = ctx.toScreen(toWorld(s.pos), rect);
      const d = Math.hypot(sp.x - ev.clientX, sp.y - ev.clientY);
      if (d < 70 && (!near || d < near.d)) near = { k, s, d };
    }
    if (near) best = near;
  }
  if (cmd.lastSpot !== best.k) {
    cmd.lastSpot = best.k;
    if (st.rotIndex) useApp.setState({ rotIndex: 0 });
  }
  // opções do ponto. Ordem padrão: subir a partir da esfera; depois fechar uma peça que termina nela; depois o resto.
  const ends = best.s.ends.filter((c) => c.check.ok);
  const starts = best.s.starts.filter((c) => c.check.ok).sort((a, b) => Q.dirRank(model, a) - Q.dirRank(model, b));
  const up = starts.filter((c) => Q.dirRank(model, c) === 0);
  let options = [...up, ...ends, ...starts.filter((c) => !up.includes(c))];
  // cursor deslocado do ponto: vence a opção que aponta para o lado do cursor (puxar a barra com o mouse)
  const spot = ctx.toScreen(toWorld(best.s.pos), rect);
  const off = [ev.clientX - spot.x, ev.clientY - spot.y];
  const offLen = Math.hypot(off[0], off[1]);
  // com inclinação ligada, direções bloqueadas também concorrem: o usuário vê em vermelho por que não dá
  const blocked = inclined ? best.s.starts.filter((c) => !c.check.ok && c.kind === "member" && c.inclined) : [];
  let shown: Candidate | null = null;
  if (offLen > 12 && options.length + blocked.length > 1) {
    const proj = new Map<Candidate, { v: number[]; L: number }>();
    for (const c of [...options, ...blocked]) {
      const other = c.kind === "member" ? (ends.includes(c) ? anchorPos(model, c)! : c.toPos) : markerPos(model, c);
      const o = ctx.toScreen(toWorld(other), rect);
      const v = [o.x - spot.x, o.y - spot.y];
      proj.set(c, { v, L: Math.hypot(v[0], v[1]) || 1 });
    }
    const maxL = Math.max(...[...proj.values()].map((p) => p.L));
    // alinhamento com o cursor, preferindo peças que aparecem inteiras na tela (no plano da vista)
    const score = (c: Candidate) => {
      const { v, L } = proj.get(c)!;
      const cos = (v[0] * off[0] + v[1] * off[1]) / (L * offLen);
      return cos * (0.55 + 0.45 * Math.min(1, L / maxL));
    };
    options = [...options].sort((a, b) => score(b) - score(a));
    const worst = blocked.sort((a, b) => score(b) - score(a))[0];
    if (worst && st.rotIndex === 0 && (!options.length || score(worst) > score(options[0]) + 0.01)) shown = worst;
  }
  if (shown) return st.setGhost({ kind: "cand", cand: shown }, [Q.angleText(model, shown), shown.check.errors[0]].filter(Boolean).join(": "));
  if (!options.length) return st.setGhost(null, "Nenhuma posição válida neste ponto.");
  const cand = options[useApp.getState().rotIndex % options.length];
  const n = options.length;
  const ang = Q.angleText(model, cand);
  const bar = catalog.pieces[code]?.type === "bar";
  st.setGhost(
    { kind: "cand", cand },
    inclined && bar
      ? `${ang ? `Inclinada a ${ang}` : "Na direção do eixo"}. Puxe o cursor para mudar o ângulo${useApp.getState().incline ? "" : "; solte o Shift para voltar aos eixos"}.`
      : n > 1
        ? `${n} opções neste ponto: R alterna.${bar ? " Shift: barra inclinada." : ""}`
        : null,
  );
}
