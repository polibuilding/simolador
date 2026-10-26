import { useEffect, useMemo, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { buildSheets, levelsOf, newViewCell, newViewFrame, type SheetInput, type ViewSpec } from "../drawings/sheets";
import { sheetToSvg, sheetsToDxf, sheetsToPdf } from "../drawings/export";
import type { SheetLayout, SheetMeta, SheetPaper, SheetShow, SheetView } from "../core/serialization";
import { CUSTOM_MAX, CUSTOM_MIN, type Pt } from "../drawings/prims";
import { addPage, addView, deleteCut, moveToPage, nextCut, nextViewId, removePage, removeView, setViewScale, withLayout } from "../drawings/layout";
import { InsertTools, RestoreMenu, ScalePick, ViewPanel } from "./SheetTools";
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
  undo: <path d="M5.5 4 2.5 7l3 3M2.5 7h7a3.5 3.5 0 0 1 0 7H7" />,
  redo: <path d="M10.5 4l3 3-3 3M13.5 7h-7a3.5 3.5 0 0 0 0 7H9" />,
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
  const canUndo = useApp((s) => s.sheetPast.length > 0);
  const canRedo = useApp((s) => s.sheetFuture.length > 0);
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
  const input: SheetInput = useMemo(() => ({ cat: catalog, model, inventory, name, meta }), [model, inventory, name, meta]);
  const built = useMemo(() => buildSheets({ ...input, isoImage, logos }), [input, isoImage, logos]);
  const { sheets, scale: used } = built;
  const svgs = useMemo(() => sheets.map((sh) => sheetToSvg(sh, { interactive: true })), [sheets]);
  const levels = useMemo(() => levelsOf(model, catalog), [model]);

  // ---------- arranjo: inserir, tirar e mudar desenhos de prancha ----------
  /** grava o arranjo do tamanho de folha atual (a partir daí ele deixa de ser automático) */
  const saveLayout = (l: SheetLayout) => setSheet(withLayout(useApp.getState().sheet, built.paper, l));
  const [armed, setArmed] = useState<ViewSpec | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(id);
  }, [note]);
  const arm = (s: ViewSpec | null) => (setArmed(s), setGhost(null), setSelected(null), setCutting(null));

  // ---------- cortes: dois cliques numa planta baixa ----------
  const [cutting, setCutting] = useState<{ a?: [number, number]; screen?: [number, number] } | null>(null);
  const [mouse, setMouse] = useState<[number, number] | null>(null);
  const startCut = () => (setArmed(null), setGhost(null), setSelected(null), setMouse(null), setCutting(cutting ? null : {}));
  /** ponto do mundo [x, z] (mm) sob o cursor, se ele estiver numa planta */
  const planHit = (e: React.PointerEvent): [number, number] | null => {
    const g = (e.target as Element).closest('[data-group^="desenho:"]');
    const id = g?.getAttribute("data-group")?.slice("desenho:".length);
    const info = built.views.find((v) => v.view.id === id && v.toWorld);
    const p = paperPoint(e);
    return info?.toWorld && p ? info.toWorld(p.at) : null;
  };
  /** encaixa em meio módulo; o segundo ponto puxa para a horizontal ou a vertical do primeiro */
  const snapCut = (w: [number, number], a?: [number, number]): [number, number] => {
    const M = catalog.settings.modulo_mm / 2;
    const q: [number, number] = [Math.round(w[0] / M) * M, Math.round(w[1] / M) * M];
    if (a) {
      const dx = Math.abs(q[0] - a[0]);
      const dz = Math.abs(q[1] - a[1]);
      if (dz < dx * 0.14) q[1] = a[1];
      else if (dx < dz * 0.14) q[0] = a[0];
    }
    return q;
  };
  const cutClick = (e: React.PointerEvent) => {
    if (!cutting) return;
    const w = planHit(e);
    if (!w) return setNote("Clique numa planta baixa para marcar a linha de corte.");
    if (!cutting.a) return setCutting({ a: snapCut(w), screen: [e.clientX, e.clientY] });
    const a = cutting.a;
    const b = snapCut(w, a);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) return setNote("Os dois pontos do corte precisam ser diferentes.");
    const cur = useApp.getState().sheet;
    const { id, name } = nextCut(cur.cuts);
    setSheet({ ...cur, cuts: [...(cur.cuts ?? []), { id, name, a, b }] });
    setCutting(null);
    setMouse(null);
    // o corte pronto vai direto para a mão: o próximo clique numa prancha coloca o desenho dele
    setArmed({ kind: "cut", cut: id });
  };
  const selInfo = built.views.find((v) => v.view.id === selected) ?? null;
  const armedName = armed
    ? armed.kind === "plan"
      ? `a planta ${(levels.find((l) => Math.abs(l.y - armed.level) < 0.5)?.name ?? "").toLowerCase().replace("pav. ", "")}`
      : armed.kind === "cut"
        ? `o ${(meta.cuts?.find((c) => c.id === armed.cut)?.name ?? "corte").toLowerCase()}`
        : `a vista ${armed.kind}`
    : "";

  /** ponto da folha (mm de papel) sob o cursor, e o número da folha */
  const paperPoint = (e: React.PointerEvent) => {
    const el = (e.target as Element).closest(".sheet-paper");
    const fig = el?.closest("figure");
    const svg = el?.querySelector("svg");
    if (!el || !fig || !svg) return null;
    const r = svg.getBoundingClientRect();
    const k = built.size.w / r.width;
    return { sheet: Number((fig as HTMLElement).dataset.sheet), at: [(e.clientX - r.left) * k, (e.clientY - r.top) * k] as Pt, r, k };
  };
  const placeAt = (e: React.PointerEvent) => {
    const p = paperPoint(e);
    if (!armed || !p) return;
    if (p.sheet === 0) return setNote("A capa não recebe desenhos: clique numa das outras pranchas.");
    const cell = newViewCell(input, armed, used, p.at);
    const v: SheetView = {
      id: nextViewId(meta, [built.layout]), kind: armed.kind, page: p.sheet - 1, cell, n: used,
      ...(armed.kind === "plan" ? { level: armed.level } : armed.kind === "cut" ? { cut: armed.cut } : {}),
    };
    saveLayout(addView(built.layout, v));
    setArmed(null);
    setGhost(null);
    setSelected(v.id);
  };
  const removeSelected = () => {
    if (!selInfo) return;
    saveLayout(removeView(built.layout, selInfo.view.id));
    setSelected(null);
  };
  // destaque do desenho escolhido
  useEffect(() => {
    document.querySelectorAll(".sheet-paper .selected").forEach((el) => el.classList.remove("selected"));
    if (!selected) return;
    const q = CSS.escape(selected);
    document.querySelectorAll(`.sheet-paper [data-group="desenho:${q}"], .sheet-paper [data-group="titulo:${q}"]`).forEach((el) => el.classList.add("selected"));
  }, [svgs, selected]);
  // Esc cancela a inserção e fecha o painel do desenho (antes de fechar as pranchas); Delete tira o desenho escolhido
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((t instanceof HTMLInputElement && t.type !== "checkbox") || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      if (document.querySelector(".sheet-pop")) return; // o menu aberto fecha primeiro
      if (e.key === "Escape" && (armed || selected || cutting)) {
        e.stopPropagation();
        setArmed(null);
        setGhost(null);
        setSelected(null);
        setCutting(null);
        setMouse(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selInfo) {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

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
    setViewText(e.key.slice(3), e.key.startsWith("vt:") ? "title" : "sub", e.value);
  };
  /** título/subtítulo de um desenho: vazio volta ao padrão */
  const setViewText = (id: string, field: "title" | "sub", value: string) => {
    const cur = useApp.getState().sheet;
    setSheet({ ...cur, views: { ...cur.views, [id]: { ...cur.views?.[id], [field]: value.trim() ? value : undefined } } });
  };
  /** o que o desenho mostra (`undefined`: volta a seguir a barra de cima) */
  const setViewShow = (id: string, show: SheetShow | undefined) => {
    const cur = useApp.getState().sheet;
    setSheet({ ...cur, views: { ...cur.views, [id]: { ...cur.views?.[id], show } } });
  };

  // ---------- arrastar e clicar ----------
  // arrastar: durante o arraste só o bloco anda; ao soltar, a posição vai para o carimbo/arquivo e a folha é redesenhada.
  // clicar sem arrastar num texto editável abre a edição dele.
  const press = useRef<{ el: SVGGraphicsElement | null; edit: Element | null; tag: string; kind: "label" | "block"; x: number; y: number; k: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (armed) return placeAt(e);
    if (cutting) return cutClick(e);
    const target = e.target as Element;
    const edit = target.closest("[data-edit]");
    const label = target.closest("[data-tag]") as SVGGraphicsElement | null;
    const block = label ? null : (target.closest("[data-group]") as SVGGraphicsElement | null);
    const el = label ?? block;
    const svg = (el ?? edit) && (target as SVGGraphicsElement).ownerSVGElement;
    if (!svg) {
      // clique fora dos desenhos fecha o painel do desenho
      if (!target.closest(".sheet-side")) setSelected(null);
      return;
    }
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
    if (cutting) return setMouse([e.clientX, e.clientY]);
    if (armed) {
      // contorno do desenho que vai entrar, seguindo o cursor
      const p = paperPoint(e);
      if (!p || p.sheet === 0) return setGhost(null);
      const c = newViewFrame(input, armed, used, p.at).body;
      return setGhost({ x: p.r.left + c.x / p.k, y: p.r.top + c.y / p.k, w: c.w / p.k, h: c.h / p.k });
    }
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
      // clique num desenho ou no título dele: abre o painel do desenho
      const g = d.kind === "block" ? d.tag.slice(d.tag.indexOf("|") + 1) : "";
      const m = /^(desenho|titulo):(.+)$/.exec(g);
      setSelected(m ? m[2] : null);
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
          <button className="icon ghost" onClick={() => useApp.getState().undoSheet()} disabled={!canUndo} title="Desfazer nas pranchas (Ctrl+Z)" aria-label="Desfazer">
            <Icon d={Ico.undo} />
          </button>
          <button className="icon ghost" onClick={() => useApp.getState().redoSheet()} disabled={!canRedo} title="Refazer nas pranchas (Ctrl+Y)" aria-label="Refazer">
            <Icon d={Ico.redo} />
          </button>
        </div>
        <div className="sb-mid">
          <div className="sb-field">
            <span>Escala</span>
            <ScalePick value={scale} current={used} scales={SCALES} autoLabel={`Automática (${fmt(used)})`} onChange={(v) => setMeta({ scale: v })} />
          </div>
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
          <InsertTools levels={levels} cuts={meta.cuts ?? []} armed={armed} onArm={arm} cutting={!!cutting} onCut={startCut} />
        </div>
        <div className="sb-right">
          <RestoreMenu
            paper={built.paper === "custom" ? `${built.size.w} × ${built.size.h}` : built.paper}
            layout={built.manual}
            positions={moved > 0}
            onLayout={() => {
              const cur = useApp.getState().sheet;
              const layouts = { ...cur.layouts };
              delete layouts[built.paper];
              setSheet({ ...cur, layouts });
              setSelected(null);
              setNote("Desenhos das pranchas no automático. Ctrl+Z desfaz.");
            }}
            onPositions={() => {
              const cur = useApp.getState().sheet;
              setSheet({ ...cur, labels: {}, blocks: Object.fromEntries(Object.entries(cur.blocks ?? {}).filter(([k]) => !k.startsWith(`${built.paper}|`))) });
              setNote("Posições no automático. Ctrl+Z desfaz.");
            }}
          />
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
      <div className="sheets-body">
      {empty ? (
        <p className="sheets-empty">Monte a estrutura primeiro: as pranchas saem dela.</p>
      ) : (
        <div
          className={`sheets-list${armed || cutting ? " placing" : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => (setGhost(null), setMouse(null))}
          onScroll={() => {
            if (editing) commitEdit(editing);
            // a linha elástica do corte perde a referência na tela
            if (cutting?.screen) setCutting({ a: cutting.a });
          }}
        >
          {svgs.map((svg, i) => {
            const empty = i > 0 && !built.views.some((v) => v.sheet === i);
            return (
              <figure key={i} className="sheet" data-sheet={i}>
                <div className="sheet-paper" dangerouslySetInnerHTML={{ __html: svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"') }} />
                <figcaption>
                  <span>
                    <b>{two(i + 1)}/{two(sheets.length)}</b> {sheets[i].title}
                  </span>
                  <span>
                    {empty && (
                      <button className="ghost" onClick={() => saveLayout(removePage(built.layout, i - 1))} title="Tira esta prancha vazia">
                        Excluir prancha
                      </button>
                    )}
                    <button
                      className="ghost"
                      onClick={() => save(new Blob([sheetToSvg(sheets[i])], { type: "image/svg+xml" }), `${fileBase(name)}-${two(i + 1)}.svg`)}
                      title="Baixar esta folha em SVG"
                    >
                      SVG
                    </button>
                  </span>
                </figcaption>
              </figure>
            );
          })}
          <button className="sheet-add" onClick={() => saveLayout(addPage(built.layout))} title="Prancha em branco no fim, para inserir desenhos">
            + Prancha em branco
          </button>
        </div>
      )}
      {ghost && <div className="sheet-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }} />}
      {cutting?.screen && mouse && (
        <svg className="sheet-cut-band" aria-hidden>
          <line x1={cutting.screen[0]} y1={cutting.screen[1]} x2={mouse[0]} y2={mouse[1]} />
          <circle cx={cutting.screen[0]} cy={cutting.screen[1]} r="3.5" />
        </svg>
      )}
      {selInfo && !armed && (
        <ViewPanel
          info={selInfo}
          general={used}
          pages={built.layout.pages}
          scales={SCALES}
          onText={(field, v) => setViewText(selInfo.view.id, field, v)}
          onScale={(n) => saveLayout(setViewScale(built.layout, selInfo.view.id, n))}
          onPage={(p) => saveLayout(moveToPage(built.layout, selInfo.view.id, p))}
          onShow={(s) => setViewShow(selInfo.view.id, s)}
          onRemove={removeSelected}
          onDeleteCut={
            selInfo.view.kind === "cut"
              ? () => {
                  setSheet(deleteCut(useApp.getState().sheet, selInfo.view.cut!));
                  setSelected(null);
                }
              : undefined
          }
          onClose={() => setSelected(null)}
        />
      )}
      </div>
      <p className={`sheets-hint${note ? " bad" : ""}`} role="status">
        {busy ??
          note ??
          (cutting
            ? cutting.a
              ? "Clique no segundo ponto da linha de corte. O corte olha para a esquerda de quem vai do 1º ao 2º ponto."
              : "Clique no primeiro ponto da linha de corte, numa planta baixa. Esc cancela."
            : armed
            ? `Clique na prancha onde vai ${armedName} (escala ${fmt(used)}). Esc cancela.`
            : selInfo
              ? `${selInfo.entry}: arraste para mudar de lugar. Delete tira da prancha; Esc fecha.`
              : "Clique num desenho para ajustar; clique num título para editar. Arraste desenhos, títulos e nomes das peças.")}
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
