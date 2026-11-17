// Barra e tirante ajustáveis (2.x): clique numa esfera (ou GC) e depois em outra; a peça nasce com o comprimento
// entre as duas. Usa a mesma escolha de esfera da ligação de duas esferas (linkFrom na store, linkPick no comando).
import { catalog } from "../../core/catalog";
import { ADJ_TIE, adjustablePiece, ensureAdjustable } from "../../core/adjustable";
import { addMember, len, sub, type Model } from "../../core/model";
import { validateMember } from "../../core/rules";
import { adjustableModel } from "../../core/userPieces";
import { useApp } from "../../ui/store";
import type { Ctx } from "../ctx";
import { sphereUnder } from "./bars";

const fmtM = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function adjustStep(ctx: Ctx, ev: PointerEvent, rect: DOMRect, model: Model, tool: string) {
  const cmd = ctx.cmd;
  const st = useApp.getState();
  cmd.linkPick = null;
  cmd.linkGhost = null;
  const tie = tool === ADJ_TIE;
  const what = tie ? "o tirante ajustável" : "a barra ajustável";
  let on = sphereUnder(ctx, ev, rect, model, true);
  if (on && model.nodes[on].kind === "ring") on = null; // anel só recebe cabos
  ctx.markHover(on);
  const from = st.linkFrom && model.nodes[st.linkFrom] ? st.linkFrom : null;
  if (!from) {
    if (on) cmd.linkPick = on;
    return st.setGhost(null, on ? `Clique para começar ${what} nesta esfera.` : `Clique na esfera de onde sai ${what}; depois, na outra ponta.`);
  }
  if (!on || on === from) {
    if (on) cmd.linkPick = on; // clicar de novo na primeira cancela
    return st.setGhost(null, `Agora clique na outra esfera: ${what} terá o comprimento entre as duas (na mesma esfera, cancela).`);
  }
  const A = model.nodes[from].pos;
  const B = model.nodes[on].pos;
  const piece = adjustablePiece(catalog, tool, len(sub(B, A)));
  const L = piece.spanM![0];
  if (L < 1) return st.setGhost(null, `Curto demais (${fmtM(L)} M): ${what} precisa de pelo menos 1 módulo entre as esferas.`);
  ensureAdjustable(catalog, piece); // fica no catálogo da sessão; só entra no arquivo se for usada
  const check = validateMember(catalog, { ...st.inventory, unlimited: true }, model, piece.code, from, B, { free: true });
  const next = addMember(model, piece.code, from, B).model;
  const id = Object.keys(next.members).find((k) => !model.members[k])!;
  const part: Model = { ...next, nodes: { [from]: next.nodes[from], [on]: next.nodes[on] }, members: { [id]: next.members[id] }, plates: {}, connectors: {} };
  const mod = tie ? null : adjustableModel(catalog, L);
  const note = tie ? "fabricar" : mod ? `sai da regulável ${mod}` : "fora das reguláveis (B3 a B15): fabricar";
  st.setGhost(
    { kind: "group", model: next, ids: new Set(), part, keep: true, check: { ok: check.ok, errors: check.errors, warnings: [] } },
    check.ok ? `${piece.code}: ${tie ? "tirante" : "barra"} de ${fmtM(L)} M · ${note}. Clique para pôr.` : check.errors[0],
  );
}
