import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { panelOpen, useApp } from "./store";

const svg = (d: JSX.Element) => (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const I = {
  fit: svg(<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />),
  ortho: svg(<path d="M3 5h8v8H3zM5 3h8v8" />),
  shadow: svg(<><circle cx="7" cy="6" r="3.2" /><path d="M3 13.5h10" strokeWidth="2.2" opacity=".45" /></>),
  render: svg(<><path d="M8 2l5.5 3v6L8 14l-5.5-3V5z" /><path d="M8 8l5.5-3M8 8v6M8 8L2.5 5" opacity=".6" /></>),
  inertia: svg(<path d="M2 8h7M6 5l3 3-3 3M11.5 4.5c1.5 1 1.5 6 0 7" />),
  keys: svg(<><rect x="1.5" y="4" width="13" height="8.5" rx="1.5" /><path d="M4 7h1M7 7h1M10 7h2M5 10h6" /></>),
};

function Toggle({ on, onClick, title, icon, text }: { on?: boolean; onClick: () => void; title: string; icon?: JSX.Element; text?: string }) {
  return (
    <button className={on ? "on" : ""} aria-pressed={on} onClick={onClick} title={title}>
      {icon}
      {text && <span className="txt">{text}</span>}
    </button>
  );
}

/** Barra de baixo, sobre a cena: encaixe, direção das barras e vista. */
export function Dock() {
  const snap = useApp((s) => s.snap);
  const guides = useApp((s) => s.guides);
  const barMode = useApp((s) => s.barMode);
  const ortho = useApp((s) => s.ortho);
  const shadows = useApp((s) => s.shadows);
  const render = useApp((s) => s.render);
  const inertia = useApp((s) => s.inertia);
  const st = useApp.getState();
  const step = catalog.settings.passo_inclinacao_graus ?? 15;
  // a barra fica só com ícones quando não cabe na parte visível da cena (entre a paleta e o resumo);
  // os textos encolhem com transição, junto com a paleta e o resumo deslizando
  const propsOpen = useApp(panelOpen);
  const mini = useApp((s) => s.paletteMini);
  const ref = useRef<HTMLElement>(null);
  const full = useRef(0);
  const [view, setView] = useState(0);
  useEffect(() => {
    const vp = ref.current?.parentElement;
    if (!vp) return;
    const ro = new ResizeObserver(() => setView(vp.clientWidth));
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);
  const wide = typeof window !== "undefined" && window.innerWidth > 900;
  const visible = view - (wide && !mini ? 210 : 0) - (wide && propsOpen ? 272 : 0);
  // sobra dos lados pelo menos o espaço dos eixos X, Y, Z (canto de baixo, à esquerda)
  const narrow = full.current > 0 && visible < full.current + 260;
  useLayoutEffect(() => {
    // largura da barra com os textos (medida quando estão à mostra)
    if (!narrow && ref.current) full.current = Math.max(full.current, ref.current.scrollWidth);
  });
  return (
    <nav ref={ref} className={`dock${narrow ? " narrow" : ""}`} aria-label="Encaixe, barras e vista" onPointerDown={(e) => e.stopPropagation()}>
      <span className="lbl">Encaixe</span>
      <Toggle on={snap} onClick={() => st.setSnap(!snap)} title="Grade: pontos verdes de encaixe e grade da chapa para a GC (G)" icon={<i className="dock-dot green" />} />
      <Toggle on={guides.blue} onClick={() => st.setGuides({ ...guides, blue: !guides.blue })} title="Vão: GC a um vão de barra de outra GC, em X ou Y (V)" icon={<i className="dock-dot blue" />} />
      <Toggle
        on={guides.yellow}
        onClick={() => st.setGuides({ ...guides, yellow: !guides.yellow })}
        title="Triângulo: amarelo = triângulo, laranja = pirâmide ou treliça; Tab percorre os pontos (T)"
        icon={<i className="dock-dot tri" />}
      />
      <span className="sep" />
      <span className="lbl">Barras</span>
      {([
        ["eixos", "Eixos", "Barras só nos eixos (Shift inclina uma barra) (1)"],
        ["passo", `${step.toLocaleString("pt-BR")}°`, `Inclinadas em passos de ${step.toLocaleString("pt-BR")}° (2)`],
        ["livre", "Livre", "Qualquer direção 3D, com encaixes em esferas, triângulos e alturas (3)"],
      ] as const).map(([v, label, title]) => (
        <button key={v} role="radio" aria-checked={barMode === v} className={`word${barMode === v ? " on" : ""}`} onClick={() => st.setBarMode(v)} title={`${title} · I alterna`}>
          {label}
        </button>
      ))}
      <span className="sep" />
      <span className="lbl">Vista</span>
      <Toggle onClick={() => st.setCamera("fit")} title="Enquadrar a estrutura (F)" icon={I.fit} text="Enquadrar" />
      <span className="sep thin" />
      <Toggle on={ortho} onClick={() => st.setOrtho(!ortho)} title="Vista paralela, sem perspectiva (P)" icon={I.ortho} text="Paralela" />
      <Toggle on={shadows} onClick={() => st.setShadows(!shadows)} title="Sombras" icon={I.shadow} text="Sombras" />
      <Toggle on={render} onClick={() => st.setRender(!render)} title="Renderização: metal com reflexos e hélice das molas (desligada: peças simples, mais leves)" icon={I.render} text="Render" />
      <Toggle on={inertia} onClick={() => st.setInertia(!inertia)} title="Inércia da vista: desliza um pouco depois de soltar o mouse; desligada, para na hora (B)" icon={I.inertia} text="Inércia" />
      <span className="sep thin" />
      <Toggle onClick={() => st.setHelpOpen(true)} title="Atalhos do teclado (? ou H)" icon={I.keys} />
    </nav>
  );
}
