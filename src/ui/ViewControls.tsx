import { useApp } from "./store";

/** Embaixo do cubo de visualização: Enquadrar, inércia da vista e atalhos. */
export function ViewControls() {
  const setCamera = useApp((s) => s.setCamera);
  const inertia = useApp((s) => s.inertia);
  const setInertia = useApp((s) => s.setInertia);
  const setHelpOpen = useApp((s) => s.setHelpOpen);
  return (
    <nav className="view-controls" aria-label="Câmera">
      <button onClick={() => setCamera("fit")} title="Enquadrar: mostra a estrutura inteira (F)" aria-label="Enquadrar (F)">
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span>Enquadrar</span>
      </button>
      <button
        aria-pressed={inertia}
        className={inertia ? "" : "firm"}
        onClick={() => setInertia(!inertia)}
        title={inertia ? "Inércia ligada: a vista desliza um pouco depois de soltar o mouse. Clique para a vista parar na hora (B)." : "Vista firme: para assim que você solta o mouse. Clique para ligar a inércia (B)."}
      >
        <svg viewBox="0 0 16 16" aria-hidden>
          {inertia ? (
            <path d="M2 8h7M6 5l3 3-3 3M11 4.5c1.5 1 1.5 6 0 7M13.5 3c2 2 2 8 0 10" fill="none" stroke="currentColor" strokeWidth="1.4" />
          ) : (
            <path d="M2 8h8M7 5l3 3-3 3M12.5 3v10" fill="none" stroke="currentColor" strokeWidth="1.6" />
          )}
        </svg>
        <span>{inertia ? "Inércia" : "Vista firme"}</span>
      </button>
      <button onClick={() => setHelpOpen(true)} title="Atalhos do teclado (? ou H)">
        <svg viewBox="0 0 16 16" aria-hidden>
          <rect x="1.5" y="4" width="13" height="8.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M4 7h1M7 7h1M10 7h2M5 10h6" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <span>Atalhos</span>
      </button>
    </nav>
  );
}
