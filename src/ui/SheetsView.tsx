import { useEffect, useMemo, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { buildSheets } from "../drawings/sheets";
import { sheetToSvg, sheetsToDxf, sheetsToPdf } from "../drawings/export";
import type { SheetMeta, SheetPaper, SheetShow } from "../core/serialization";
import { CUSTOM_MAX, CUSTOM_MIN } from "../drawings/prims";
import { useApp } from "./store";
import { boardsOf } from "../core/model";
import { boardName } from "../core/boards";
import { filterByBoards } from "../core/boards";
import { renderIso, type IsoImage } from "../render/snapshot";
import { loadLogos, type Logo } from "./logos";
import { Icon } from "./Toolbar";

const SCALES = [1, 2, 2.5, 5, 10, 20];
/** visualizações ligadas e desligadas na barra de cima (e no painel de cada desenho) */
const SHOW_KEYS: [keyof SheetShow, string, string][] = [
  ["dims", "Cotas", "Cotas"],
  ["axes", "Eixos", "Eixos e níveis"],
  ["labels", "Peças", "Indicações de peças (PILAR, LIGAÇÃO…)"],
  ["markers", "Vistas", "Indicações de vistas (A–D) e de cortes"],
];

/** Largura × altura da folha personalizada: grava ao sair do campo ou com Enter. */
function CustomSize({ w, h, onChange }: { w: number; h: number; onChange: (w: number, h: number) => void }) {
  const [vw, setVw] = useState(String(w));
  const [vh, setVh] = useState(String(h));
  useEffect(() => (setVw(String(w)), setVh(String(h))), [w, h]);
  const commit = () => {
    const nw = Number(vw.replace(",", "."));
    const nh = Number(vh.replace(",", "."));
    if (Number.isFinite(nw) && Number.isFinite(nh) && nw > 0 && nh > 0) onChange(nw, nh);
    else (setVw(String(w)), setVh(String(h)));
  };
  const props = {
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && commit(),
    inputMode: "numeric" as const,
    title: `Entre ${CUSTOM_MIN} e ${CUSTOM_MAX} mm`,
  };
  return (
    <span className="sb-size">
      <input value={vw} onChange={(e) => setVw(e.target.value)} aria-label="Largura da folha (mm)" {...props} />
      ×
      <input value={vh} onChange={(e) => setVh(e.target.value)} aria-label="Altura da folha (mm)" {...props} />
      mm
    </span>
  );
}
const fmt = (n: number) => `1/${String(n).replace(".", ",")}`;
const two = (n: number) => String(n).padStart(2, "0");

const Ico = {
  back: <path d="M9.5 3.5 5 8l4.5 4.5" />,
  download: <path d="M8 2v8M4.75 6.75 8 10l3.25-3.25M2.5 11v2.5h11V11" />,
};

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const fileBase = (name: string) => name.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-") || "estrutura";

/** Texto da prancha sendo editado no lugar (posição na tela, em px). */
interface Editing {
  key: string;
  value: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font: number;
  bold: boolean;
}

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
  /** muda só uma parte do carimbo (sempre a partir do estado atual) */
  const setMeta = (patch: Partial<SheetMeta>) => setSheet({ ...useApp.getState().sheet, ...patch });
  const scale = meta.scale ?? "auto";
  const [busy, setBusy] = useState<string | null>(null);

  // capa: foto 3D renderizada (padrão) ou o desenho em linhas
  const [cover, setCover] = useState<"foto" | "desenho">("foto");
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
  const built = useMemo(
    () => buildSheets({ cat: catalog, model, inventory, name, meta, isoImage, logos }),
    [model, inventory, name, meta, isoImage, logos],
  );
  const { sheets, scale: used } = built;
  const svgs = useMemo(() => sheets.map((sh) => sheetToSvg(sh, { interactive: true })), [sheets]);

  // ---------- textos editáveis na própria prancha (título e subtítulo do carimbo e dos desenhos) ----------
  const [editing, setEditing] = useState<Editing | null>(null);
  // Enter e Esc fecham a edição; o blur que vem depois (o campo some) não grava de novo
  const editDone = useRef(false);
  const valueOf = (key: string) => {
    if (key === "title") return meta.line1;
    if (key === "sub") return meta.line2;
    const v = built.views.find((x) => x.view.id === key.slice(3));
    return key.startsWith("vt:") ? (v?.title ?? "") : (v?.sub ?? "");
  };
  const openEdit = (g: Element) => {
    const key = g.getAttribute("data-edit")!;
    const text = g.querySelector("text");
    const hit = g.querySelector("rect");
    const svg = (g as SVGGraphicsElement).ownerSVGElement;
    if (!text || !hit || !svg) return;
    const r = hit.getBoundingClientRect();
    const k = svg.getBoundingClientRect().width / (svg.viewBox.baseVal.width || 420); // px por mm
    const font = Math.max(12, Number(text.getAttribute("font-size")) * k);
    editDone.current = false;
    setEditing({ key, value: valueOf(key), x: r.left, y: r.top, w: Math.max(r.width, 180), h: Math.max(r.height, font * 1.4), font, bold: text.getAttribute("font-weight") === "700" });
  };
  const commitEdit = (e: Editing) => {
    if (editDone.current) return;
    editDone.current = true;
    setEditing(null);
    if (e.value === valueOf(e.key)) return;
    if (e.key === "title") return setMeta({ line1: e.value });
    if (e.key === "sub") return setMeta({ line2: e.value });
    // título/subtítulo de um desenho: vazio volta ao padrão
    const id = e.key.slice(3);
    const field = e.key.startsWith("vt:") ? "title" : "sub";
    const cur = useApp.getState().sheet;
    const o = { ...cur.views?.[id], [field]: e.value.trim() ? e.value : undefined };
    setSheet({ ...cur, views: { ...cur.views, [id]: o } });
  };

  // ---------- arrastar e clicar ----------
  // arrastar: durante o arraste só o bloco anda; ao soltar, a posição vai para o carimbo/arquivo e a folha é redesenhada.
  // clicar sem arrastar num texto editável abre a edição dele.
  const press = useRef<{ el: SVGGraphicsElement | null; edit: Element | null; tag: string; kind: "label" | "block"; x: number; y: number; k: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    const edit = target.closest("[data-edit]");
    const label = target.closest("[data-tag]") as SVGGraphicsElement | null;
    const block = label ? null : (target.closest("[data-group]") as SVGGraphicsElement | null);
    const el = label ?? block;
    const svg = (el ?? edit) && (target as SVGGraphicsElement).ownerSVGElement;
    if (!svg) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const vbW = svg.viewBox.baseVal.width || 420;
    press.current = {
      el, edit, kind: label ? "label" : "block",
      tag: label ? label.getAttribute("data-tag")! : block ? `${built.paper}|${block.getAttribute("data-group")}` : "",
      x: e.clientX, y: e.clientY, k: vbW / svg.getBoundingClientRect().width,
    };
    el?.classList.add("dragging");
  };
  const onMove = (e: React.PointerEvent) => {
    const d = press.current;
    if (!d?.el) return;
    d.el.setAttribute("transform", `translate(${(e.clientX - d.x) * d.k} ${(e.clientY - d.y) * d.k})`);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = press.current;
    press.current = null;
    if (!d) return;
    d.el?.classList.remove("dragging");
    const dx = (e.clientX - d.x) * d.k;
    const dy = (e.clientY - d.y) * d.k;
    if (Math.hypot(dx, dy) < 0.3) {
      d.el?.removeAttribute("transform");
      if (d.edit) openEdit(d.edit);
      return;
    }
    if (!d.el) return;
    const cur = useApp.getState().sheet;
    const map = d.kind === "label" ? cur.labels : cur.blocks;
    const prev = map?.[d.tag] ?? [0, 0];
    const next = { ...map, [d.tag]: [prev[0] + dx, prev[1] + dy] as [number, number] };
    setSheet(d.kind === "label" ? { ...cur, labels: next } : { ...cur, blocks: next });
  };
  const moved = Object.keys(meta.labels ?? {}).length + Object.keys(meta.blocks ?? {}).filter((k) => k.startsWith(`${built.paper}|`)).length;
  const empty = Object.keys(model.nodes).length === 0;

  return (
    <div className="sheets" role="dialog" aria-label="Pranchas">
      <header className="sheets-bar">
        <div className="sb-left">
          <button className="ghost" onClick={() => setSheetsOpen(false)} title="Voltar à montagem (Esc)">
            <Icon d={Ico.back} /> Montagem
          </button>
          <span className="tb-sep" />
          <span className="sb-title">Pranchas</span>
        </div>
        <div className="sb-mid">
          <label className="sb-field">
            <span>Escala</span>
            <select value={String(scale)} onChange={(e) => setMeta({ scale: e.target.value === "auto" ? "auto" : Number(e.target.value) })}>
              <option value="auto">Automática ({fmt(used)})</option>
              {SCALES.map((n) => (
                <option key={n} value={n}>{fmt(n)}</option>
              ))}
            </select>
          </label>
          <div className="sb-field">
            <span>Folha</span>
            <select value={paper} onChange={(e) => setMeta({ paper: e.target.value as SheetPaper })} aria-label="Tamanho da folha">
              <option value="A2">A2</option>
              <option value="A3">A3</option>
              <option value="A4">A4</option>
              <option value="custom">Personalizada</option>
            </select>
            {paper === "custom" && <CustomSize w={built.size.w} h={built.size.h} onChange={(w, h) => setMeta({ custom: { w, h } })} />}
          </div>
          <label className="sb-field">
            <span>Capa</span>
            <select value={cover} onChange={(e) => setCover(e.target.value as "foto" | "desenho")}>
              <option value="foto">Renderizada</option>
              <option value="desenho">Em linhas</option>
            </select>
          </label>
          {allBoards.length > 1 && (
            <div className="sb-field sheet-boards" role="group" aria-label="Chapas nas pranchas">
              <span>Chapas</span>
              <button className={!sheetBoards ? "on" : ""} onClick={() => useApp.getState().setSheetBoards(null)}>Todas</button>
              {allBoards.map((b) => (
                <button key={b.id} className={!sheetBoards || sheetBoards.includes(b.id) ? "on" : ""} onClick={() => toggleBoard(b.id)} title={boardName(b)}>
                  {b.name ? boardName(b) : b.id.slice(1)}
                </button>
              ))}
            </div>
          )}
          <div className="sb-field sb-toggles" role="group" aria-label="Mostrar nos desenhos (todas as pranchas)">
            <span>Mostrar</span>
            {SHOW_KEYS.map(([k, label, tip]) => {
              const on = meta.show?.[k] !== false;
              return (
                <button key={k} className={on ? "on" : ""} aria-pressed={on} title={`${tip}: liga e desliga em todas as pranchas (menos nos desenhos com ajuste próprio)`} onClick={() => setMeta({ show: { ...meta.show, [k]: !on } })}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="sb-right">
          {moved > 0 && (
            <button
              className="ghost"
              onClick={() => setMeta({ labels: {}, blocks: Object.fromEntries(Object.entries(meta.blocks ?? {}).filter(([k]) => !k.startsWith(`${built.paper}|`))) })}
              title="Volta etiquetas, desenhos, títulos e tabela para a posição automática"
            >
              Posições no automático
            </button>
          )}
          <button
            className="ghost"
            disabled={empty}
            onClick={() => {
              // DXF não leva imagem: a capa vai com a isométrica em linhas
              const vector = buildSheets({ cat: catalog, model, inventory, name, meta }).sheets;
              save(new Blob([sheetsToDxf(vector)], { type: "application/dxf" }), `${fileBase(name)}-pranchas.dxf`);
            }}
            title="Todas as folhas lado a lado, em mm de papel, com camadas MOLA-*"
          >
            DXF
          </button>
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
            <Icon d={Ico.download} /> PDF
          </button>
        </div>
      </header>
      {empty ? (
        <p className="sheets-empty">Monte a estrutura primeiro: as pranchas saem dela.</p>
      ) : (
        <div className="sheets-list" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onScroll={() => editing && commitEdit(editing)}>
          {svgs.map((svg, i) => (
            <figure key={i} className="sheet">
              <div className="sheet-paper" dangerouslySetInnerHTML={{ __html: svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"') }} />
              <figcaption>
                <span>
                  <b>{two(i + 1)}/{two(sheets.length)}</b> {sheets[i].title}
                </span>
                <button
                  className="ghost"
                  onClick={() => save(new Blob([sheetToSvg(sheets[i])], { type: "image/svg+xml" }), `${fileBase(name)}-${two(i + 1)}.svg`)}
                  title="Baixar esta folha em SVG"
                >
                  SVG
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="sheets-hint" role="status">
        {busy ?? "Clique no título, no subtítulo ou no nome de um desenho para editar. Arraste desenhos, títulos e nomes das peças para mudar de lugar."}
      </p>
      {editing && (
        <input
          className="sheet-edit"
          autoFocus
          value={editing.value}
          style={{ left: editing.x, top: editing.y, width: editing.w, height: editing.h, fontSize: editing.font, fontWeight: editing.bold ? 700 : 400 }}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => commitEdit(editing)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit(editing);
            if (e.key === "Escape") {
              editDone.current = true;
              setEditing(null);
            }
          }}
          aria-label="Editar texto da prancha"
          spellCheck={false}
        />
      )}
    </div>
  );
}
