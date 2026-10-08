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
  const gcMode = useApp((s) => s.gcMode);
  const { setName, undo, redo, setGcMode, newProject, load, serialize } = useApp.getState();
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
      <div className="segmented" role="radiogroup" aria-label="Encaixe da ligação de base">
        <span>Ligação de base</span>
        {(["grade", "livre"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={gcMode === m} className={gcMode === m ? "on" : ""} onClick={() => setGcMode(m)}>
            {m === "grade" ? "Na grade" : "Livre"}
          </button>
        ))}
      </div>
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
