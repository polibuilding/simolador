// O que muda na estrutura aberta se as configurações novas valerem (avisos antes de aplicar; nada é apagado).
import type { Catalog } from "../core/catalog";
import { boardAt, boardsOverlap } from "../core/boards";
import { boardsOf, directionFrom, dot, membersAt, norm, type Model } from "../core/model";

const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function angleViolations(cat: Catalog, model: Model): number {
  const min = cat.settings.angulo_minimo_membros_graus;
  let n = 0;
  for (const id of Object.keys(model.nodes)) {
    const bars = membersAt(model, id).filter((m) => cat.pieces[m.code]?.type === "bar").map((m) => directionFrom(model, m, id));
    let bad = false;
    for (let i = 0; i < bars.length && !bad; i++) {
      for (let j = i + 1; j < bars.length; j++) {
        const a = (Math.acos(Math.max(-1, Math.min(1, dot(bars[i], bars[j])))) * 180) / Math.PI;
        if (a < min - 0.5) bad = true;
      }
    }
    if (bad) n++;
  }
  return n;
}

function gcTiltViolations(cat: Catalog, model: Model): number {
  const min = Number(cat.settings.gc_angulo_minimo_base_graus ?? 40);
  let n = 0;
  for (const node of Object.values(model.nodes)) {
    if (node.kind !== "support") continue;
    for (const m of membersAt(model, node.id)) {
      if (cat.pieces[m.code]?.type !== "bar") continue;
      const d = norm(directionFrom(model, m, node.id));
      if ((Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180) / Math.PI < min - 0.5) n++;
    }
  }
  return n;
}

export function configImpact(oldCat: Catalog, newCat: Catalog, model: Model): string[] {
  const out: string[] = [];
  const a = oldCat.settings;
  const b = newCat.settings;
  if (a.modulo_mm !== b.modulo_mm) {
    out.push(`Tudo muda de tamanho junto: a B6 passa de ${fmt(6 * a.modulo_mm)} para ${fmt(6 * b.modulo_mm)} mm entre esferas. As posições (em módulos) ficam.`);
  }
  const boards = boardsOf(model);
  if (a.chapa_modulos_x !== b.chapa_modulos_x || a.chapa_modulos_y !== b.chapa_modulos_y) {
    const out1 = Object.values(model.nodes).filter((n) => n.kind === "support" && !boardAt(newCat, boards, n.pos[0], n.pos[2])).length;
    if (out1) out.push(`${out1} ${out1 === 1 ? "GC ficaria" : "GC ficariam"} fora da chapa (continuam no modelo; mova a estrutura para dentro).`);
    let over = 0;
    for (let i = 0; i < boards.length; i++) for (let j = i + 1; j < boards.length; j++) if (boardsOverlap(newCat, boards[i], boards[j])) over++;
    if (over) out.push(`${over} ${over === 1 ? "par de chapas ficaria" : "pares de chapas ficariam"} um por cima do outro: afaste as chapas depois.`);
  }
  if (a.angulo_minimo_membros_graus !== b.angulo_minimo_membros_graus) {
    const n = angleViolations(newCat, model) - angleViolations(oldCat, model);
    if (n > 0) out.push(`${n} ${n === 1 ? "esfera ficaria" : "esferas ficariam"} com molas mais juntas que o novo mínimo (continuam no modelo; peças novas seguem a regra).`);
  }
  if (a.gc_angulo_minimo_base_graus !== b.gc_angulo_minimo_base_graus) {
    const n = gcTiltViolations(newCat, model) - gcTiltViolations(oldCat, model);
    if (n > 0) out.push(`${n} ${n === 1 ? "mola na GC ficaria" : "molas nas GC ficariam"} mais deitadas que o novo mínimo (continuam no modelo).`);
  }
  if (a.passo_inclinacao_graus !== b.passo_inclinacao_graus) {
    out.push(`Barras inclinadas passam a andar de ${fmt(Number(b.passo_inclinacao_graus))}° em ${fmt(Number(b.passo_inclinacao_graus))}° (as já colocadas ficam).`);
  }
  return out;
}
