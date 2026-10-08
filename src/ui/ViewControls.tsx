import { useApp } from "./store";

/** "Enquadrar" ao lado do cubo de visualização (o cubo fica na própria cena). */
export function ViewControls() {
  const setCamera = useApp((s) => s.setCamera);
  return (
    <nav className="view-controls" aria-label="Câmera">
      <button onClick={() => setCamera("fit")} title="Mostra a estrutura inteira (F)">
        Enquadrar
      </button>
    </nav>
  );
}
