import { useEffect, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { useApp } from "./store";

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "estrutura"}.mola`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function StockPanel({ onClose }: { onClose: () => void }) {
  const inventory = useApp((s) => s.inventory);
  const setInventory = useApp((s) => s.setInventory);
  const setKit = (id: string, n: number) =>
    setInventory({ ...inventory, kits: { ...inventory.kits, [id]: Math.max(0, Math.min(20, n)) } });
  return (
    <div className="popover" role="dialog" aria-label="Estoque">
      <p className="popover-title">Quantas caixas vocês têm?</p>
      {Object.entries(catalog.kits).map(([id, k]) => (
        <label key={id} className="stock-row">
          <i className="kit-swatch" style={{ background: k.color ?? "#999" }} />
          <span>{k.name.replace("Mola Structural ", "")}</span>
          <span className="stepper">
            <button onClick={() => setKit(id, (inventory.kits[id] ?? 0) - 1)} aria-label={`Menos uma caixa do ${k.name}`}>−</button>
            <output>{inventory.kits[id] ?? 0}</output>
            <button onClick={() => setKit(id, (inventory.kits[id] ?? 0) + 1)} aria-label={`Mais uma caixa do ${k.name}`}>+</button>
          </span>
        </label>
      ))}
      <label className="stock-unlimited">
        <input
          type="checkbox"
          checked={inventory.unlimited}
          onChange={(e) => setInventory({ ...inventory, unlimited: e.target.checked })}
        />
        Sem limite de peças
      </label>
      <button className="popover-close" onClick={onClose}>Fechar</button>
    </div>
  );
}

/** Ícones simples (traço) da barra de cima */
const Ico = {
  file: <path d="M4 1.5h5l3 3v10H4zM9 1.5v3h3" />,
  undo: <path d="M5.5 4 2.5 7l3 3M2.5 7h7a3.5 3.5 0 0 1 0 7H7" />,
  redo: <path d="M10.5 4l3 3-3 3M13.5 7h-7a3.5 3.5 0 0 0 0 7H9" />,
  box: <path d="M2 5.5 8 2.5l6 3v6l-6 3-6-3zM2 5.5l6 3 6-3M8 8.5v6" />,
  sheet: <path d="M2 3.5h12v9H2zM2 10h12M9.5 10v2.5" />,
};
const Icon = ({ d }: { d: JSX.Element }) => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round">
    {d}
  </svg>
);

/** Grupo da barra de cima, com rótulo pequeno em cima */
function Group({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`tb-group ${className}`} role="group" aria-label={label}>
      <span className="tb-label">{label}</span>
      <div className="tb-row">{children}</div>
    </div>
  );
}

export function Toolbar() {
  const name = useApp((s) => s.name);
  const canUndo = useApp((s) => s.history.past.length > 0);
  const canRedo = useApp((s) => s.history.future.length > 0);
  const snap = useApp((s) => s.snap);
  const barMode = useApp((s) => s.barMode);
  const guides = useApp((s) => s.guides);
  const inventory = useApp((s) => s.inventory);
  const { setName, undo, redo, setSnap, setGuides, setBarMode, setSheetsOpen, newProject, load, serialize } = useApp.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = catalog.settings.passo_inclinacao_graus ?? 15;
  const kits = inventory.unlimited
    ? "sem limite"
    : Object.entries(inventory.kits).filter(([, c]) => c > 0).map(([k, c]) => `${c}× K${k}`).join(" + ") || "nenhum";

  const doNew = () => {
    const empty = Object.keys(useApp.getState().history.present.nodes).length === 0;
    if (empty || window.confirm("Começar uma estrutura nova? A atual pode ser recuperada com Desfazer.")) newProject();
  };
  const doSave = () => download(useApp.getState().name, serialize());
  const doOpen = () => fileRef.current?.click();
  useEffect(() => {
    const onSave = () => doSave();
    const onOpen = () => doOpen();
    document.addEventListener("simolador:salvar", onSave);
    document.addEventListener("simolador:abrir", onOpen);
    return () => {
      document.removeEventListener("simolador:salvar", onSave);
      document.removeEventListener("simolador:abrir", onOpen);
    };
  }, []);

  return (
    <header className="toolbar">
      <div className="brand" aria-label="siMOLAdor">
        si<span>MOLA</span>dor
      </div>
      <input className="project-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome da estrutura" title="Nome da estrutura (sai nas pranchas)" />

      <Group label="Projeto">
        <div className="menu">
          <button onClick={() => setFileOpen((o) => !o)} aria-expanded={fileOpen} aria-haspopup="menu">
            <Icon d={Ico.file} /> Arquivo <span className="caret">▾</span>
          </button>
          {fileOpen && (
            <div className="menu-list" role="menu" onMouseLeave={() => setFileOpen(false)}>
              <button role="menuitem" onClick={() => (setFileOpen(false), doNew())}>Novo</button>
              <button role="menuitem" onClick={() => (setFileOpen(false), doOpen())}>Abrir .mola… <kbd>Ctrl+O</kbd></button>
              <button role="menuitem" onClick={() => (setFileOpen(false), doSave())}>Salvar .mola <kbd>Ctrl+S</kbd></button>
            </div>
          )}
        </div>
        <button className="icon" onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer"><Icon d={Ico.undo} /></button>
        <button className="icon" onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Y)" aria-label="Refazer"><Icon d={Ico.redo} /></button>
        <input
          ref={fileRef}
          type="file"
          accept=".mola,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              load(JSON.parse(await f.text()));
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Não foi possível abrir o arquivo.");
            }
          }}
        />
      </Group>

      <Group label="Encaixe" className="snap-chips">
        <button aria-pressed={snap} className={snap ? "on" : ""} onClick={() => setSnap(!snap)}
          title="Verde: pontos onde a peça escolhida encaixa e grade da chapa para a GC. Desligado = GC livre (G).">
          <i className="dot green" /> Grade
        </button>
        <button aria-pressed={guides.blue} className={guides.blue ? "on" : ""} onClick={() => setGuides({ ...guides, blue: !guides.blue })}
          title="Azul: GC a um vão de barra (4, 6 ou 12 módulos) de outra GC, em X ou Z (V)">
          <i className="dot blue" /> Vão
        </button>
        <button aria-pressed={guides.yellow} className={guides.yellow ? "on" : ""} onClick={() => setGuides({ ...guides, yellow: !guides.yellow })}
          title="Vértices de triângulos (T). GC: amarelo = triângulo com duas GC. Barras: passe o cursor numa esfera; amarelo = triângulo (duas barras chegam no ponto), laranja = pirâmide ou treliça (três ou mais)">
          <i className="dot yellow" /> Triângulo
        </button>
      </Group>

      <Group label="Direção das barras" className="segmented">
        {([
          ["eixos", "Eixos", "Barras só nos eixos, como num pórtico (Shift: inclina uma barra) (1; I alterna)"],
          ["passo", `${step}°`, `Inclinadas em passos de ${step}° nos planos X, Y e Z (2; I alterna)`],
          ["livre", "Livre", "Qualquer direção 3D: a ponta segue o cursor e encaixa em esferas, triângulos e alturas existentes (treliças 3D, telhados) (3; I alterna)"],
        ] as const).map(([v, label, title]) => (
          <button key={v} role="radio" aria-checked={barMode === v} className={barMode === v ? "on" : ""} onClick={() => setBarMode(v)} title={title}>
            {label}
          </button>
        ))}
      </Group>

      <div className="tb-spacer" />

      <Group label="Peças disponíveis" className="stock">
        <button onClick={() => setStockOpen((o) => !o)} aria-expanded={stockOpen} title="Quantos kits de cada tipo vocês têm">
          <Icon d={Ico.box} /> {kits}
        </button>
        {stockOpen && <StockPanel onClose={() => setStockOpen(false)} />}
      </Group>
      <button className="primary" onClick={() => setSheetsOpen(true)} title="Plantas, vistas e capa (PDF, DXF, SVG)">
        <Icon d={Ico.sheet} /> Pranchas
      </button>
      {error && (
        <p className="toolbar-error" role="alert">
          {error} <button onClick={() => setError(null)}>Ok</button>
        </p>
      )}
    </header>
  );
}
