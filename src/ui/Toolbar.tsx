import { useRef, useState } from "react";
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

export function Toolbar() {
  const name = useApp((s) => s.name);
  const canUndo = useApp((s) => s.history.past.length > 0);
  const canRedo = useApp((s) => s.history.future.length > 0);
  const snap = useApp((s) => s.snap);
  const incline = useApp((s) => s.incline);
  const guides = useApp((s) => s.guides);
  const { setName, undo, redo, setSnap, setGuides, setIncline, setSheetsOpen, newProject, load, serialize } = useApp.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <header className="toolbar">
      <div className="brand" aria-label="siMOLAdor">
        si<span>MOLA</span>dor
      </div>
      <input
        className="project-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nome da estrutura"
      />
      <nav className="tool-group" aria-label="Arquivo">
        <button
          onClick={() => {
            const empty = Object.keys(useApp.getState().history.present.nodes).length === 0;
            if (empty || window.confirm("Começar uma estrutura nova? A atual pode ser recuperada com Desfazer.")) newProject();
          }}
        >
          Novo
        </button>
        <button onClick={() => fileRef.current?.click()}>Abrir</button>
        <button onClick={() => download(name, serialize())}>Salvar .mola</button>
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
      </nav>
      <nav className="tool-group" aria-label="Edição">
        <button onClick={undo} disabled={!canUndo} title="Ctrl+Z">Desfazer</button>
        <button onClick={redo} disabled={!canRedo} title="Ctrl+Y">Refazer</button>
      </nav>
      <div className="snap-chips" role="group" aria-label="Pontos de encaixe">
        <span>Encaixe</span>
        <button
          aria-pressed={snap}
          className={snap ? "on" : ""}
          onClick={() => setSnap(!snap)}
          title="Verde: pontos onde a peça escolhida encaixa e grade da chapa para a GC. Desligado = livre."
        >
          <i className="dot green" /> Grade
        </button>
        <button
          aria-pressed={guides.blue}
          className={guides.blue ? "on" : ""}
          onClick={() => setGuides({ ...guides, blue: !guides.blue })}
          title="Azul: GC a um vão de barra (4, 6 ou 12 módulos) de outra GC, em X ou Z"
        >
          <i className="dot blue" /> Vão
        </button>
        <button
          aria-pressed={guides.yellow}
          className={guides.yellow ? "on" : ""}
          onClick={() => setGuides({ ...guides, yellow: !guides.yellow })}
          title="Amarelo: GC no vértice de um triângulo de barras com duas GC"
        >
          <i className="dot yellow" /> Triângulo
        </button>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Barras">
        <span>Barras</span>
        {[false, true].map((v) => (
          <button
            key={String(v)}
            role="radio"
            aria-checked={incline === v}
            className={incline === v ? "on" : ""}
            onClick={() => setIncline(v)}
            title={
              v
                ? `Barras inclinadas em passos de ${catalog.settings.passo_inclinacao_graus ?? 15}°: puxe o cursor para escolher o ângulo (I alterna; Shift inverte enquanto pressionado)`
                : "Barras só nos eixos, como num pórtico; segure Shift para inclinar uma barra (I alterna)"
            }
          >
            {v ? "Inclinadas" : "Nos eixos"}
          </button>
        ))}
      </div>
      <button className="primary" onClick={() => setSheetsOpen(true)}>Gerar pranchas</button>
      <div className="stock">
        <button onClick={() => setStockOpen((o) => !o)} aria-expanded={stockOpen}>Estoque</button>
        {stockOpen && <StockPanel onClose={() => setStockOpen(false)} />}
      </div>
      {error && (
        <p className="toolbar-error" role="alert">
          {error} <button onClick={() => setError(null)}>Ok</button>
        </p>
      )}
    </header>
  );
}
