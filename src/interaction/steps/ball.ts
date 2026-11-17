// Ligação super leve (2.x, plano §11.7): com o botão LC ligado, clicar numa esfera do modelo a troca por LC;
// clicar numa LC a volta para C. Como o enrijecedor: o fantasma é o modelo já trocado, e o clique grava.
import * as THREE from "three";
import { catalog } from "../../core/catalog";
import { LIGHT_BALL, toggleBall } from "../../core/lightBalls";
import type { Model } from "../../core/model";
import { useApp } from "../../ui/store";
import { toWorld } from "../../render/units";
import type { Ctx } from "../ctx";

/** Esfera (só esferas: a GC tem a dela embutida) mais perto do cursor, com uma folga em volta. */
function ballUnder(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model): string | null {
  const right = new THREE.Vector3().setFromMatrixColumn(ctx.camera.matrixWorld, 0);
  let best: { id: string; d: number } | null = null;
  for (const n of Object.values(model.nodes)) {
    if (n.kind !== "sphere") continue;
    const w = toWorld(n.pos);
    const c = ctx.toScreen(w, rect);
    if (c.z > 1) continue;
    const e = ctx.toScreen(w.clone().add(right.clone().multiplyScalar(catalog.settings.esfera_diametro_mm / 2)), rect);
    const r = Math.max(12, 1.3 * Math.hypot(e.x - c.x, e.y - c.y));
    const d = Math.hypot(c.x - ev.clientX, c.y - ev.clientY);
    if (d <= r && (!best || d < best.d)) best = { id: n.id, d };
  }
  return best?.id ?? null;
}

export function ballStep(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model) {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  cmd.linkPick = null;
  cmd.linkGhost = null;
  const id = ballUnder(ctx, ev, rect, model);
  ctx.markHover(id); // a esfera sob o cursor fica destacada antes do clique
  if (!id) return st.setGhost(null, "Clique numa esfera para trocá-la por uma ligação super leve (LC); numa LC, volta para C. Esc sai.");
  const r = toggleBall(catalog, model, id);
  if (!r.model) return st.setGhost(null, r.error ?? null);
  const n = r.model.nodes[id];
  const part: Model = { ...r.model, nodes: { [id]: n }, members: {}, plates: {}, connectors: {} };
  st.setGhost(
    { kind: "group", model: r.model, ids: new Set(), part, keep: true, check: { ok: true, errors: [], warnings: [] } },
    r.to === LIGHT_BALL ? "Clique para trocar esta esfera por uma ligação super leve (LC)." : "Clique para voltar esta ligação super leve para a esfera C.",
  );
}
