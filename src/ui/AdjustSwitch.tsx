// Chave "Ajustável" (plano §11.0, X10): liga as peças ajustáveis e o Kit X. Funciona na 2.x; na 1.x aparece
// desativada ("em breve"), como o Simolar. Clicar explica o que ela vai fazer.
import { useState } from "react";
import { useDismiss } from "./Toolbar";

function AdjustInfo({ onClose }: { onClose: () => void }) {
  const ref = useDismiss(onClose);
  return (
    <div ref={ref} className="popover adjust-pop" role="dialog" aria-label="Ajustável">
      <p className="popover-title">Ajustável · em breve</p>
      <p className="popover-text">
        Liga o <b>Kit X</b> e as peças ajustáveis: barra, tirante, placa e RC de qualquer medida. Só a barra existe à venda (as reguláveis da Mola);
        as outras o siMOLAdor dimensiona para fabricar. As peças que valerem a pena viram o kit do seu grupo.
      </p>
      <p className="popover-text">Chega com a linha 2.x (arquitetônica). Desligada, o programa continua como hoje.</p>
    </div>
  );
}

export function AdjustSwitch() {
  const [open, setOpen] = useState(false);
  return (
    <div className="adjust-switch">
      <button
        className="adjust-btn"
        role="switch"
        aria-checked={false}
        aria-disabled
        aria-label="Ajustável (em breve)"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Ajustável: peças ajustáveis e Kit X (em breve, versões 2.x)"
      >
        <span className="adjust-track" aria-hidden><span className="adjust-knob" /></span>
        <span className="adjust-txt">Ajustável</span>
        <span className="soon-tag">em breve</span>
      </button>
      {open && <AdjustInfo onClose={() => setOpen(false)} />}
    </div>
  );
}
