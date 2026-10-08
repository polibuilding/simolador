import { useEffect, useMemo, useState } from "react";
import { catalog } from "../core/catalog";
import { buildSheets } from "../drawings/sheets";
import { sheetToSvg, sheetsToDxf, sheetsToPdf } from "../drawings/export";
import { useApp } from "./store";
import { renderIso, type IsoImage } from "../render/snapshot";

const SCALES = [1, 2, 2.5, 5, 10];

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const fileBase = (name: string) => name.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-") || "estrutura";

/** Pranchas: capa, plantas por pavimento e vistas A–D, no padrão do Desafio 2022. */
export function SheetsView() {
  const model = useApp((s) => s.history.present);
  const inventory = useApp((s) => s.inventory);
  const name = useApp((s) => s.name);
  const meta = useApp((s) => s.sheet);
  const { setSheet, setSheetsOpen } = useApp.getState();
  const [scale, setScale] = useState<"auto" | number>("auto");
  const [busy, setBusy] = useState<string | null>(null);

  // capa: foto 3D renderizada (padrão) ou o desenho em linhas
  const [cover, setCover] = useState<"foto" | "desenho">("foto");
  const [iso, setIso] = useState<IsoImage | null>(null);
  useEffect(() => {
    if (cover !== "foto") return;
    let alive = true;
    // espera a cena 3D tirar a seleção/destaques antes da foto
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (alive) setIso(renderIso(model));
      }),
    );
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [model, cover]);
  const isoImage = cover === "foto" ? iso : null;
  const { sheets, scale: used } = useMemo(
    () => buildSheets({ cat: catalog, model, inventory, name, meta, scale, isoImage }),
    [model, inventory, name, meta, scale, isoImage],
  );
  const svgs = useMemo(() => sheets.map(sheetToSvg), [sheets]);
  const empty = Object.keys(model.nodes).length === 0;

  return (
    <div className="sheets" role="dialog" aria-label="Pranchas">
      <header className="sheets-bar">
        <h2>Pranchas</h2>
        <label>
          Escala
          <select value={String(scale)} onChange={(e) => setScale(e.target.value === "auto" ? "auto" : Number(e.target.value))}>
            <option value="auto">Automática ({`1/${String(used).replace(".", ",")}`})</option>
            {SCALES.map((n) => (
              <option key={n} value={n}>{`1/${String(n).replace(".", ",")}`}</option>
            ))}
          </select>
        </label>
        <label>
          Carimbo, linha 1
          <input value={meta.line1} onChange={(e) => setSheet({ ...meta, line1: e.target.value })} />
        </label>
        <label>
          Linha 2
          <input value={meta.line2} onChange={(e) => setSheet({ ...meta, line2: e.target.value })} />
        </label>
        <label>
          Capa
          <select value={cover} onChange={(e) => setCover(e.target.value as "foto" | "desenho")}>
            <option value="foto">Isométrica renderizada</option>
            <option value="desenho">Isométrica em linhas</option>
          </select>
        </label>
        <div className="sheets-actions">
          <button
            className="primary"
            disabled={empty || !!busy}
            onClick={async () => {
              setBusy("Gerando PDF…");
              try {
                save(await sheetsToPdf(sheets), `${fileBase(name)}-pranchas.pdf`);
              } finally {
                setBusy(null);
              }
            }}
          >
            Baixar PDF
          </button>
          <button
            disabled={empty}
            onClick={() => {
              // DXF não leva imagem: a capa vai com a isométrica em linhas
              const vector = buildSheets({ cat: catalog, model, inventory, name, meta, scale }).sheets;
              save(new Blob([sheetsToDxf(vector)], { type: "application/dxf" }), `${fileBase(name)}-pranchas.dxf`);
            }}
            title="Todas as folhas lado a lado, em mm de papel, com camadas MOLA-*"
          >
            Baixar DXF
          </button>
          <button onClick={() => setSheetsOpen(false)}>Voltar à montagem</button>
        </div>
      </header>
      {busy && <p className="sheets-busy" role="status">{busy}</p>}
      {empty ? (
        <p className="sheets-empty">Monte a estrutura primeiro: as pranchas saem dela.</p>
      ) : (
        <div className="sheets-list">
          {svgs.map((svg, i) => (
            <figure key={i} className="sheet">
              <div className="sheet-paper" dangerouslySetInnerHTML={{ __html: svg.replace(/width="420mm" height="297mm"/, 'width="100%"') }} />
              <figcaption>
                P_{String(i + 1).padStart(2, "0")}: {sheets[i].title}
                <button
                  onClick={() => save(new Blob([svg], { type: "image/svg+xml" }), `${fileBase(name)}-P${String(i + 1).padStart(2, "0")}.svg`)}
                >
                  SVG desta folha
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
