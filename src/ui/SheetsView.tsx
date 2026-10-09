import { useEffect, useMemo, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { buildSheets } from "../drawings/sheets";
import { sheetToSvg, sheetsToDxf, sheetsToPdf } from "../drawings/export";
import { useApp } from "./store";
import { boardsOf } from "../core/model";
import { filterByBoards } from "../core/boards";
import { renderIso, type IsoImage } from "../render/snapshot";
import { loadLogos, type Logo } from "./logos";

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
  const fullModel = useApp((s) => s.history.present);
  const sheetBoards = useApp((s) => s.sheetBoards);
  const allBoards = boardsOf(fullModel);
  // chapas escolhidas (null = todas): as pranchas mostram só elas, na posição em que estão
  const model = useMemo(() => (sheetBoards ? filterByBoards(catalog, fullModel, sheetBoards) : fullModel), [fullModel, sheetBoards]);
  const toggleBoard = (id: string) => {
    const cur = sheetBoards ?? allBoards.map((b) => b.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (!next.length) return;
    useApp.getState().setSheetBoards(next.length === allBoards.length ? null : allBoards.map((b) => b.id).filter((x) => next.includes(x)));
  };
  const inventory = useApp((s) => s.inventory);
  const name = useApp((s) => s.name);
  const meta = useApp((s) => s.sheet);
  const { setSheet, setSheetsOpen } = useApp.getState();
  const [scale, setScale] = useState<"auto" | number>("auto");
  const [busy, setBusy] = useState<string | null>(null);

  // capa: foto 3D renderizada (padrão) ou o desenho em linhas
  const [cover, setCover] = useState<"foto" | "desenho">("foto");
  const [dims, setDims] = useState(true);
  const paper = meta.paper ?? "A3";
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
  // logos do carimbo (public/logos)
  const [logos, setLogos] = useState<Logo[]>([]);
  useEffect(() => {
    let alive = true;
    loadLogos().then((l) => alive && setLogos(l));
    return () => {
      alive = false;
    };
  }, []);
  const { sheets, scale: used } = useMemo(
    () => buildSheets({ cat: catalog, model, inventory, name, meta, scale, isoImage, logos, dims, paper }),
    [model, inventory, name, meta, scale, isoImage, logos, dims, paper],
  );
  const svgs = useMemo(() => sheets.map((sh) => sheetToSvg(sh, { interactive: true })), [sheets]);

  // arrastar etiquetas: durante o arraste só o texto anda; ao soltar, a posição vai para o carimbo/arquivo e a folha é redesenhada
  const drag = useRef<{ el: SVGGraphicsElement; tag: string; kind: "label" | "block"; x: number; y: number; k: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    const target = e.target as Element;
    const label = target.closest("[data-tag]") as SVGGraphicsElement | null;
    const block = label ? null : (target.closest("[data-group]") as SVGGraphicsElement | null);
    const el = label ?? block;
    const svg = el?.ownerSVGElement;
    if (!el || !svg) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const vbW = svg.viewBox.baseVal.width || 420;
    drag.current = {
      el, kind: label ? "label" : "block",
      tag: label ? label.getAttribute("data-tag")! : `${paper}|${block!.getAttribute("data-group")}`,
      x: e.clientX, y: e.clientY, k: vbW / svg.getBoundingClientRect().width,
    };
    el.classList.add("dragging");
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.el.setAttribute("transform", `translate(${(e.clientX - d.x) * d.k} ${(e.clientY - d.y) * d.k})`);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    d.el.classList.remove("dragging");
    const dx = (e.clientX - d.x) * d.k;
    const dy = (e.clientY - d.y) * d.k;
    if (Math.hypot(dx, dy) < 0.3) return d.el.removeAttribute("transform");
    const map = d.kind === "label" ? meta.labels : meta.blocks;
    const prev = map?.[d.tag] ?? [0, 0];
    const next = { ...map, [d.tag]: [prev[0] + dx, prev[1] + dy] as [number, number] };
    setSheet(d.kind === "label" ? { ...meta, labels: next } : { ...meta, blocks: next });
  };
  const moved = Object.keys(meta.labels ?? {}).length + Object.keys(meta.blocks ?? {}).filter((k) => k.startsWith(`${paper}|`)).length;
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
          Folha
          <select value={paper} onChange={(e) => setSheet({ ...meta, paper: e.target.value as "A3" | "A4" })}>
            <option value="A3">A3 (420 × 297)</option>
            <option value="A4">A4 (297 × 210)</option>
          </select>
        </label>
        <label>
          Capa
          <select value={cover} onChange={(e) => setCover(e.target.value as "foto" | "desenho")}>
            <option value="foto">Isométrica renderizada</option>
            <option value="desenho">Isométrica em linhas</option>
          </select>
        </label>
        {allBoards.length > 1 && (
          <div className="sheet-boards" role="group" aria-label="Chapas nas pranchas">
            <span>Chapas</span>
            <button className={!sheetBoards ? "on" : ""} onClick={() => useApp.getState().setSheetBoards(null)}>Todas</button>
            {allBoards.map((b) => (
              <button key={b.id} className={!sheetBoards || sheetBoards.includes(b.id) ? "on" : ""} onClick={() => toggleBoard(b.id)}>
                {b.id.slice(1)}
              </button>
            ))}
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={dims} onChange={(e) => setDims(e.target.checked)} />
          Cotas
        </label>
        {moved > 0 && (
          <button
            className="sheets-reset"
            onClick={() => setSheet({ ...meta, labels: {}, blocks: Object.fromEntries(Object.entries(meta.blocks ?? {}).filter(([k]) => !k.startsWith(`${paper}|`))) })}
            title="Volta etiquetas, desenhos, títulos e tabela para a posição automática"
          >
            Posições no automático
          </button>
        )}
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
              const vector = buildSheets({ cat: catalog, model, inventory, name, meta, scale, dims, paper }).sheets;
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
        <p className="sheets-tip">Arraste os desenhos, os títulos, a tabela da capa e os nomes das peças (PILAR, VIGA…) para mudar o lugar deles.</p>
      )}
      {!empty && (
        <div className="sheets-list" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
          {svgs.map((svg, i) => (
            <figure key={i} className="sheet">
              <div className="sheet-paper" dangerouslySetInnerHTML={{ __html: svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"') }} />
              <figcaption>
                P_{String(i + 1).padStart(2, "0")}: {sheets[i].title}
                <button
                  onClick={() => save(new Blob([sheetToSvg(sheets[i])], { type: "image/svg+xml" }), `${fileBase(name)}-P${String(i + 1).padStart(2, "0")}.svg`)}
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
