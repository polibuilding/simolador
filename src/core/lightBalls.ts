// Ligações Super Leves — LC (2.x, plano §11.7; equipe 17/11/2026). Esfera do mesmo tamanho e do mesmo ímã da C,
// com ≈ 4,7 g (a C tem 13,9 g) e preta. Vendidas à parte, 12 por pacote; no estoque não têm limite, e o mínimo de kits
// diz quantos pacotes comprar. No modelo, uma esfera vira LC pelo campo `ball` do nó: encaixes e regras são os da C.
import { LIGHT_BALL, type Catalog } from "./catalog";
import type { Model } from "./model";

export { LIGHT_BALL };

/** Esfera vira ligação super leve, ou volta a ser C. Só esferas (a GC tem a esfera embutida; clips e anéis são do cabo). */
export function toggleBall(cat: Catalog, model: Model, nodeId: string): { model?: Model; error?: string; to?: "C" | typeof LIGHT_BALL } {
  const n = model.nodes[nodeId];
  if (!n) return { error: "Esse nó não existe mais." };
  if (n.kind !== "sphere") return { error: n.kind === "support" ? "A GC tem a esfera embutida: troque as esferas de cima." : "Só as esferas viram ligação super leve." };
  if (!cat.pieces[LIGHT_BALL]) return { error: "A ligação super leve (LC) não está no catálogo." };
  const light = n.ball === LIGHT_BALL;
  const node = { ...n };
  if (light) delete node.ball;
  else node.ball = LIGHT_BALL;
  return { model: { ...model, nodes: { ...model.nodes, [nodeId]: node } }, to: light ? "C" : LIGHT_BALL };
}

/** Quantas esferas do modelo são ligações super leves. */
export function lightBallCount(model: Model): number {
  return Object.values(model.nodes).filter((n) => n.kind === "sphere" && n.ball === LIGHT_BALL).length;
}

/** Pacotes de ligações super leves que o modelo pede (arredonda para cima). */
export function lightBallPacks(cat: Catalog, model: Model): number {
  const per = Number(cat.settings.lc_pacote_unidades) || 12;
  return Math.ceil(lightBallCount(model) / per);
}
