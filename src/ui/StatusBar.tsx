import { catalog } from "../core/catalog";
import { useApp } from "./store";
import { EDITION, VERSION, VERSION_SHORT } from "../version";

/** Dica da ferramenta: texto pequeno direto no fundo da cena, acima da barra de baixo. */
export function HintLine() {
  const tool = useApp((s) => s.tool);
  const ghost = useApp((s) => s.ghost);
  const hint = useApp((s) => s.hint);
  const ok = ghost ? (ghost.kind === "group" ? ghost.check.ok : ghost.cand.check.ok) : null;
  const state = ok === false ? "bad" : "info";
  const dragging = tool.kind !== "select" && tool.viaDrag;
  const message =
    hint ??
    (tool.kind === "select"
      ? "Esquerdo seleciona (arraste para um retângulo); direito gira a vista; Shift+direito move. ? mostra os atalhos."
      : ok
        ? dragging
          ? "Solte para encaixar."
          : `Clique para encaixar. R gira;${tool.kind === "place" && catalog.pieces[tool.code]?.type === "bar" ? " Shift inclina a barra;" : ""} Esc para parar.`
        : "Leve a peça até um ponto verde ou até uma esfera.");
  return (
    <p className={`hint-line ${state}`} role="status" aria-live="polite">
      {message}
    </p>
  );
}

/** Versão, bem de leve no canto inferior direito. */
export function VersionTag() {
  return (
    <span className="version-tag" title={`siMOLAdor ${VERSION}${EDITION ? ` · versão ${EDITION}` : ""}`}>
      v{VERSION_SHORT}
    </span>
  );
}
