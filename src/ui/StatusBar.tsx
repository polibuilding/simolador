import { catalog } from "../core/catalog";
import { useApp, useModel } from "./store";

// Rodapé no formato do carimbo das pranchas.
export function StatusBar() {
  const tool = useApp((s) => s.tool);
  const ghost = useApp((s) => s.ghost);
  const hint = useApp((s) => s.hint);
  const model = useModel();
  const pieces =
    Object.keys(model.nodes).length + Object.keys(model.members).length + Object.keys(model.plates).length + Object.keys(model.connectors).length;

  const toolText =
    tool.kind === "select"
      ? "Selecionar"
      : tool.kind === "moveGroup"
        ? "Mover estrutura"
        : `${tool.moving ? "Mover " : ""}${catalog.pieces[tool.code]?.name ?? tool.code}`;
  const ok = ghost ? (ghost.kind === "group" ? ghost.check.ok : ghost.cand.check.ok) : null;
  const state = ok === true ? "ok" : ok === false ? "bad" : hint ? "info" : "idle";
  const dragging = tool.kind !== "select" && tool.viaDrag;
  const message =
    hint ??
    (tool.kind === "select"
      ? "Esquerdo seleciona (arraste para um retângulo); direito gira a vista; Shift+direito move. Peça selecionada: arraste ou M move, R gira, Delete remove."
      : ok
        ? dragging
          ? "Solte para encaixar."
          : `Clique para encaixar. R gira;${tool.kind === "place" && catalog.pieces[tool.code]?.type === "bar" ? " Shift inclina a barra;" : ""} Esc para parar.`
        : "Leve a peça até um ponto verde ou até uma esfera.");

  return (
    <footer className="statusbar">
      <div className="cell logo" aria-hidden>
        <svg viewBox="0 0 32 32">
          <g fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 3 27 9.5v13L16 29 5 22.5v-13z" />
            <path d="M5 9.5 27 22.5M27 9.5 5 22.5M16 3v26" />
          </g>
        </svg>
      </div>
      <div className={`cell message ${state}`} role="status" aria-live="polite">
        {message}
      </div>
      <div className="cell">
        <small>Ferramenta</small>
        {toolText}
      </div>
      <div className="cell">
        <small>Peças na cena</small>
        {pieces}
      </div>
      <div className="cell">
        <small>Módulo</small>
        {catalog.settings.modulo_mm.toLocaleString("pt-BR")} mm
      </div>
    </footer>
  );
}
