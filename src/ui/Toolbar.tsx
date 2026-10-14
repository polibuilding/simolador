import { useEffect, useMemo, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { minKits, usage } from "../core/inventory";
import { useApp, useModel } from "./store";

/** "2× K1 + 1× K2" */
export const kitsText = (kits: Record<string, number>) =>
  Object.entries(kits).filter(([, c]) => c > 0).map(([k, c]) => `${c}× K${k}`).join(" + ");

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
  /** engrenagem (desenho no estilo Lucide, licença ISC) */
  gear: (
    <g transform="scale(0.6667)" strokeWidth="1.9">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </g>
  ),
  /** simulação: onda (resposta da estrutura) com o "play" de rodar */
  sim: (
    <>
      <path d="M1.5 8.5c1.2-3.6 2.4-3.6 3.6 0s2.4 3.6 3.6 0" />
      <path d="M10.8 4.6l3.7 3.4-3.7 3.4z" fill="currentColor" />
    </>
  ),
};
export const Icon = ({ d }: { d: JSX.Element }) => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round">
    {d}
  </svg>
);

/** Logos pequenas (public/logos) e o nome do programa. Sem as imagens, só o nome. */
function Brand() {
  const [ok, setOk] = useState<Record<string, boolean>>({ "logo-mola": true, "logo-grupo": true });
  return (
    <div className="brand" aria-label="siMOLAdor">
      {(["logo-mola", "logo-grupo"] as const).map((n) =>
        ok[n] ? (
          <img key={n} src={`${import.meta.env.BASE_URL}logos/${n}.png`} alt={n === "logo-mola" ? "Mola" : "Poli Building"} onError={() => setOk((o) => ({ ...o, [n]: false }))} />
        ) : null,
      )}
      <span className="brand-name">si<b>MOLA</b>dor</span>
    </div>
  );
}

/** Configurações (por enquanto só mostra os valores internos; as opções entram depois). */
function ConfigPanel({ onClose }: { onClose: () => void }) {
  const s = catalog.settings;
  const f = (n: number) => n.toLocaleString("pt-BR");
  return (
    <div className="popover left" role="dialog" aria-label="Configurações">
      <p className="popover-title">Configurações</p>
      <p className="popover-text">As configurações do programa vão ficar aqui. Por enquanto, os valores usados (vêm de <code>data/parametros.xlsx</code>):</p>
      <dl className="config-list">
        <div><dt>Módulo</dt><dd>{f(s.modulo_mm)} mm</dd></div>
        <div><dt>Ângulo mínimo entre molas</dt><dd>{f(s.angulo_minimo_membros_graus)}°</dd></div>
        <div><dt>Mola na GC (mínimo com a chapa)</dt><dd>{f(Number(s.gc_angulo_minimo_base_graus ?? 40))}°</dd></div>
        <div><dt>Passo das inclinadas</dt><dd>{f(Number(s.passo_inclinacao_graus ?? 15))}°</dd></div>
        <div><dt>Chapa</dt><dd>{s.chapa_modulos_x} × {s.chapa_modulos_y} módulos</dd></div>
      </dl>
      <button className="popover-close" onClick={onClose}>Fechar</button>
    </div>
  );
}

export function Toolbar() {
  const name = useApp((s) => s.name);
  const canUndo = useApp((s) => s.history.past.length > 0);
  const canRedo = useApp((s) => s.history.future.length > 0);
  const inventory = useApp((s) => s.inventory);
  const { setName, undo, redo, setSheetsOpen, newProject, load, serialize } = useApp.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const model = useModel();
  // modo sem limite: quantas caixas, no mínimo, a estrutura pede
  const need = useMemo(() => (inventory.unlimited ? minKits(catalog, usage(model)) : null), [inventory.unlimited, model]);
  const kits = need
    ? need.total ? `sem limite · mín. ${kitsText(need.kits)}` : "sem limite"
    : kitsText(inventory.kits) || "nenhum";

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
      <div className="tb-left">
        <Brand />
        <div className="menu">
          <button className="ghost" onClick={() => setFileOpen((o) => !o)} aria-expanded={fileOpen} aria-haspopup="menu">
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
        <div className="menu">
          <button className="icon ghost" onClick={() => setConfigOpen((o) => !o)} aria-expanded={configOpen} title="Configurações" aria-label="Configurações">
            <Icon d={Ico.gear} />
          </button>
          {configOpen && <ConfigPanel onClose={() => setConfigOpen(false)} />}
        </div>
        <span className="tb-sep" />
        <button className="icon ghost" onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer"><Icon d={Ico.undo} /></button>
        <button className="icon ghost" onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Y)" aria-label="Refazer"><Icon d={Ico.redo} /></button>
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
      </div>

      <input className="project-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do projeto" title="Nome do projeto (sai nas pranchas e no arquivo)" spellCheck={false} />

      <div className="tb-right">
        <div className="stock">
          <button className="ghost" onClick={() => setStockOpen((o) => !o)} aria-expanded={stockOpen} title="Peças disponíveis: quantos kits de cada tipo vocês têm">
            <Icon d={Ico.box} /> {kits}
          </button>
          {stockOpen && <StockPanel onClose={() => setStockOpen(false)} />}
        </div>
        <button className="primary" onClick={() => setSheetsOpen(true)} title="Plantas, vistas e capa (PDF, DXF, SVG)">
          <Icon d={Ico.sheet} /> Pranchas
        </button>
        <div className="menu">
          <button className="primary" onClick={() => setSimOpen((o) => !o)} aria-expanded={simOpen} title="Simular a estrutura (em breve)">
            <Icon d={Ico.sim} /> Simolar
          </button>
          {simOpen && (
            <div className="popover right" role="dialog" aria-label="Simolar">
              <p className="popover-title">Simolar · em breve</p>
              <p className="popover-text">
                Aqui vai entrar a simulação da estrutura montada: deformação, estaticidade e estabilidade (a linha 3.x, "de engenharia").
              </p>
              <button className="popover-close" onClick={() => setSimOpen(false)}>Fechar</button>
            </div>
          )}
        </div>
      </div>
      {error && (
        <p className="toolbar-error" role="alert">
          {error} <button onClick={() => setError(null)}>Ok</button>
        </p>
      )}
    </header>
  );
}
