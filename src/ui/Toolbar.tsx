import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { minKits, usage } from "../core/inventory";
import { ConfigPanel, LibraryPanel } from "./Config";
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

/**
 * Fecha um menu flutuante com Esc ou com um clique fora dele (inclusive no botão que o abriu,
 * que fica fora: o próprio botão volta a abrir/fechar).
 */
export function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const box = ref.current;
      const t = e.target as Node;
      if (!box || box.contains(t)) return;
      // o botão que abre o menu (irmão anterior) cuida de fechar sozinho
      if (box.parentElement?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [onClose]);
  return ref;
}

/** Kits que ainda vão entrar (aparecem no estoque, desativados). Somem da lista quando o kit entra no catálogo. */
const SOON = [
  { id: "3", name: "Kit 3", color: "#2F6FD6", tag: "em breve", note: "Kit 3 (azul): cabos, anéis, enrijecedores e duas chapas de base · em breve" },
  { id: "A", name: "Kit A", color: "#9A6BD0", tag: "2.x", note: "Kit A: entra com as versões 2.x (arquitetônica)" },
];

function StockPanel({ onClose }: { onClose: () => void }) {
  const ref = useDismiss(onClose);
  const inventory = useApp((s) => s.inventory);
  const setInventory = useApp((s) => s.setInventory);
  const setKit = (id: string, n: number) =>
    setInventory({ ...inventory, kits: { ...inventory.kits, [id]: Math.max(0, Math.min(20, n)) } });
  return (
    <div ref={ref} className="popover stock-pop" role="dialog" aria-label="Estoque">
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
      {SOON.filter((k) => !catalog.kits[k.id]).map((k) => (
        <div key={k.id} className="stock-row soon" title={k.note}>
          <i className="kit-swatch" style={{ background: k.color }} />
          <span>{k.name}</span>
          <span className="soon-tag">{k.tag}</span>
        </div>
      ))}
      <label className="stock-unlimited">
        <input
          type="checkbox"
          checked={inventory.unlimited}
          onChange={(e) => setInventory({ ...inventory, unlimited: e.target.checked })}
        />
        Sem limite de peças
      </label>
    </div>
  );
}

/** Ícones simples (traço) da barra de cima */
const Ico = {
  file: <path d="M4 1.5h5l3 3v10H4zM9 1.5v3h3" />,
  /** novo: folha com + */
  fileNew: <path d="M4 1.5h5l3 3v10H4zM9 1.5v3h3M8 7.5v4.5M5.75 9.75h4.5" />,
  /** abrir: pasta */
  open: <path d="M1.5 4.5v8.5h11.5l1.5-6H4L2.5 13M1.5 4.5V3h4.5l1.5 1.5h5V7" />,
  /** salvar: seta para baixo na bandeja */
  save: <path d="M8 2v8M4.75 6.75 8 10l3.25-3.25M2.5 11v2.5h11V11" />,
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
  /** biblioteca: livros na estante */
  library: <path d="M2.5 2.5v11M5.5 2.5v11M8.5 3.2l3.2 10.1M2 13.5h12" />,
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

/**
 * Símbolo do siMOLAdor: o hexágono do Mola (seis triângulos em volta do centro), com os triângulos
 * alternando o azul e o amarelo da Poli Building. Por enquanto só no ícone da aba (public/favicon.svg).
 */
export function SoftwareMark({ size = 22 }: { size?: number }) {
  // hexágono de vértice para cima, centro (16, 16)
  const V = [[16, 3], [27.3, 9.5], [27.3, 22.5], [16, 29], [4.7, 22.5], [4.7, 9.5]] as const;
  const tri = (i: number) => `M16 16L${V[i][0]} ${V[i][1]}L${V[(i + 1) % 6][0]} ${V[(i + 1) % 6][1]}Z`;
  return (
    <svg className="soft-mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      {V.map((_, i) => <path key={i} d={tri(i)} fill={i % 2 ? "#F6B035" : "#165078"} />)}
      <g fill="none" stroke="#1d2422" strokeWidth="1.6" strokeLinejoin="round">
        <path d={`M${V.map((v) => v.join(" ")).join("L")}Z`} />
        <path d="M16 3V29M4.7 9.5 27.3 22.5M27.3 9.5 4.7 22.5" />
      </g>
      {[...V, [16, 16] as const].map(([x, y], k) => <circle key={k} cx={x} cy={y} r="1.9" fill="#1d2422" />)}
    </svg>
  );
}

/** Logos do Mola e da Poli Building (links) e o nome do programa. */
function Brand() {
  const [ok, setOk] = useState<Record<string, boolean>>({ "logo-mola": true, "logo-grupo": true });
  const links = {
    "logo-mola": { href: "https://br.molamodel.com/", alt: "Mola Model", title: "Mola Structural Model (abre o site)" },
    "logo-grupo": { href: "https://www.instagram.com/polibuilding/?hl=pt-br", alt: "Poli Building", title: "Poli Building no Instagram" },
  } as const;
  return (
    <div className="brand">
      {(["logo-mola", "logo-grupo"] as const).map((n) =>
        ok[n] ? (
          <a key={n} className="brand-logo" href={links[n].href} target="_blank" rel="noopener noreferrer" title={links[n].title}>
            <img src={`${import.meta.env.BASE_URL}logos/${n}.png`} alt={links[n].alt} onError={() => setOk((o) => ({ ...o, [n]: false }))} />
          </a>
        ) : null,
      )}
      <span className="brand-sep" aria-hidden />
      <span className="brand-app" aria-label="siMOLAdor">
        <span className="brand-name">si<b>MOLA</b>dor</span>
      </span>
    </div>
  );
}

/** Simolar (em breve). */
function SimPanel({ onClose }: { onClose: () => void }) {
  const ref = useDismiss(onClose);
  return (
    <div ref={ref} className="popover right" role="dialog" aria-label="Simolar">
      <p className="popover-title">Simolar · em breve</p>
      <p className="popover-text">Aqui vai entrar a simulação da estrutura montada: deformação, estaticidade e estabilidade (a linha 3.x, "de engenharia").</p>
    </div>
  );
}

function ConfigMenu({ onClose }: { onClose: () => void }) {
  const ref = useDismiss(onClose);
  return <ConfigPanel onClose={onClose} dismissRef={ref} />;
}

function LibraryMenu({ onClose }: { onClose: () => void }) {
  const ref = useDismiss(onClose);
  return <LibraryPanel onClose={onClose} dismissRef={ref} />;
}

export function Toolbar() {
  const name = useApp((s) => s.name);
  const canUndo = useApp((s) => s.history.past.length > 0);
  const canRedo = useApp((s) => s.history.future.length > 0);
  const inventory = useApp((s) => s.inventory);
  const { setName, undo, redo, setSheetsOpen, newProject, load, serialize } = useApp.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const closeLib = useCallback(() => setLibOpen(false), []);
  const closeStock = useCallback(() => setStockOpen(false), []);
  const closeConfig = useCallback(() => setConfigOpen(false), []);
  const closeSim = useCallback(() => setSimOpen(false), []);
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
        <span className="file-tools" role="group" aria-label="Arquivo .mola">
          <span className="file-ext" aria-hidden>.mola</span>
          <button className="icon ghost" onClick={doNew} title="Novo" aria-label="Novo"><Icon d={Ico.fileNew} /></button>
          <button className="icon ghost" onClick={doOpen} title="Abrir .mola (Ctrl+O)" aria-label="Abrir"><Icon d={Ico.open} /></button>
          <button className="icon ghost" onClick={doSave} title="Salvar .mola (Ctrl+S)" aria-label="Salvar"><Icon d={Ico.save} /></button>
        </span>
        <div className="menu">
          <button className="icon ghost" onClick={() => setConfigOpen((o) => !o)} aria-expanded={configOpen} title="Configurações" aria-label="Configurações">
            <Icon d={Ico.gear} />
          </button>
          {configOpen && <ConfigMenu onClose={closeConfig} />}
        </div>
        <div className="menu">
          <button className="icon ghost lib-btn" onClick={() => setLibOpen((o) => !o)} aria-expanded={libOpen} title="Biblioteca de modelos (em breve; por enquanto, os exemplos)" aria-label="Biblioteca">
            <Icon d={Ico.library} />
          </button>
          {libOpen && <LibraryMenu onClose={closeLib} />}
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
          {stockOpen && <StockPanel onClose={closeStock} />}
        </div>
        <button className="primary" onClick={() => setSheetsOpen(true)} title="Plantas, vistas e capa (PDF, DXF, SVG)">
          <Icon d={Ico.sheet} /> Pranchas
        </button>
        <div className="menu">
          <button className="primary" onClick={() => setSimOpen((o) => !o)} aria-expanded={simOpen} title="Simular a estrutura (em breve)">
            <Icon d={Ico.sim} /> Simolar
          </button>
          {simOpen && <SimPanel onClose={closeSim} />}
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
