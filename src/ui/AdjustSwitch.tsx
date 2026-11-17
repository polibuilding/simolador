// Chave "Ajustável" (plano §11.0, X10): liga as peças da 2.x. Na 1.x aparecia desativada ("em breve"); a partir
// da 2.0 (BETA) ela funciona. Por enquanto liga as ligações super leves (LC, §11.7); o Kit X (barra, tirante, placa
// e RC ajustáveis) entra nas próximas entregas da BETA. Fica lembrada no navegador (X11).
import { useApp } from "./store";

export function AdjustSwitch() {
  const on = useApp((s) => s.adjustable);
  const set = useApp((s) => s.setAdjustable);
  return (
    <div className="adjust-switch" onPointerDown={(e) => e.stopPropagation()}>
      <button
        className={`adjust-btn${on ? " on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label="Ajustável"
        onClick={() => set(!on)}
        title={
          on
            ? "Ajustável ligada: peças da 2.x (ligações super leves). Clique para desligar."
            : "Ajustável: liga as peças da 2.x. Por enquanto, as ligações super leves (LC); o Kit X (barra, tirante, placa e RC ajustáveis) vem nas próximas entregas da BETA."
        }
      >
        <span className="adjust-track" aria-hidden><span className="adjust-knob" /></span>
        <span className="adjust-txt">Ajustável</span>
      </button>
    </div>
  );
}
