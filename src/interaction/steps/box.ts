// Seleção por retângulo.
import { type Vec3 } from "../../core/model";
import type { Sel } from "../../core/edit";
import { useApp } from "../../ui/store";
import { toWorld } from "../../render/units";
import type { Ctx } from "../ctx";

// ---- seleção por retângulo ----
export function boxSelect(ctx: Ctx, b: { x0: number; y0: number; x1: number; y1: number }, add: boolean) {
  const rect = ctx.el.getBoundingClientRect();
  const model = useApp.getState().history.present;
  const crossing = b.x1 < b.x0; // da direita para a esquerda: o que tocar; da esquerda para a direita: só o que está inteiro dentro
  const [x0, x1] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)];
  const [y0, y1] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
  const inside = (p: Vec3) => {
    const s = ctx.toScreen(toWorld(p), rect);
    return s.z < 1 && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
  };
  const along = (a: Vec3, c: Vec3, n = 8) => Array.from({ length: n + 1 }, (_, i) => [0, 1, 2].map((k) => a[k] + ((c[k] - a[k]) * i) / n) as Vec3);
  const test = (pts: Vec3[]) => (crossing ? pts.some(inside) : pts.every(inside));
  const out: Sel[] = [];
  for (const n of Object.values(model.nodes)) if (test([n.pos])) out.push({ kind: "node", id: n.id });
  for (const m of Object.values(model.members)) if (test(along(model.nodes[m.a].pos, model.nodes[m.b].pos))) out.push({ kind: "member", id: m.id });
  for (const p of Object.values(model.plates)) {
    const c = p.corners.map((id) => model.nodes[id].pos);
    if (test([...c, ...along(c[0], c[2], 4), ...along(c[1], c[3], 4)])) out.push({ kind: "plate", id: p.id });
  }
  for (const c of Object.values(model.connectors)) if (test([model.nodes[c.node].pos])) out.push({ kind: "connector", id: c.id });
  useApp.getState().setMulti(out, add);
  useApp.setState({ hint: out.length ? `${out.length} peças selecionadas.` : "Nenhuma peça no retângulo." });
}
