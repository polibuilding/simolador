import { useApp } from "./store";

/** "Enquadrar" discreto, embaixo do cubo de visualização (o cubo fica na própria cena). */
export function ViewControls() {
  const setCamera = useApp((s) => s.setCamera);
  return (
    <nav className="view-controls" aria-label="Câmera">
      <button onClick={() => setCamera("fit")} title="Enquadrar: mostra a estrutura inteira (F)" aria-label="Enquadrar (F)">
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span>Enquadrar</span>
      </button>
    </nav>
  );
}
