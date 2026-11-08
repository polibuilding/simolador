import { useEffect, useMemo, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { buildSheets, heightText, levelsOf, newViewCell, newViewFrame, parseHeight, type SheetInput, type ViewSpec } from "../drawings/sheets";
import { profileLine, readProfile } from "./prefs";
import { sheetToSvg, sheetsToDxf, sheetsToPdf } from "../drawings/export";
import type { SheetLayout, SheetMeta, SheetPaper, SheetShow, SheetView } from "../core/serialization";
import { CUSTOM_MAX, CUSTOM_MIN, type Pt } from "../drawings/prims";
import { addPage, addView, deleteCut, moveToPage, nextCut, nextViewId, removePage, removeView, setViewScale, withLayout } from "../drawings/layout";
import { InsertBar, RestoreMenu, ScalePick, ViewPanel } from "./SheetTools";
import { useApp } from "./store";
import { boardsOf } from "../core/model";
import { boardName } from "../core/boards";
import { filterByBoards } from "../core/boards";
import { renderIso, renderView, type IsoImage } from "../render/snapshot";
import { loadLogos, type Logo } from "./logos";
import { Icon } from "./Toolbar";

const SCALES = [1, 2, 2.5, 5, 10, 20];
/** visualizações ligadas e desligadas na barra de cima (e no painel de cada desenho) */
const SHOW_KEYS: [keyof SheetShow, string, string][] = [
  ["dims", "Cotas", "Cotas"],
  ["axes", "Eixos", "Eixos e níveis"],
  ["labels", "Peças", "Indicações de peças (PILAR, LIGAÇÃO…)"],
  ["markers", "Vistas", "Indicações de vistas (A–D) e de cortes"],
  ["render", "Renderizada", "Desenhos renderizados (foto da cena 3D na escala do desenho); desligado = simplificado, em linhas"],
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
  const author = useMemo(() => profileLine(readProfile()), []);
  const input: SheetInput = useMemo(() => ({ cat: catalog, model, inventory, name, meta, author }), [model, inventory, name, meta]);
  // fotos dos desenhos renderizados, por pedido; a estrutura mudou: tira de novo
  const [renders, setRenders] = useState<Record<string, string | null>>({});
  useEffect(() => setRenders({}), [model]);
  const built = useMemo(() => buildSheets({ ...input, isoImage, logos, renders }), [input, isoImage, logos, renders]);
  useEffect(() => {
    const todo = built.renderRequests.filter((r) => !(r.key in renders));
    if (!todo.length) return;
    // uma foto por quadro, para a tela não travar; a seleção e os destaques da cena já saíram
    const id = requestAnimationFrame(() => {
      const r = todo[0];
      setRenders((cur) => ({ ...cur, [r.key]: renderView(r) }));
    });
    return () => cancelAnimationFrame(id);
  }, [built, renders]);
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
  const arm = (s: ViewSpec | null) => (setArmed(s), setGhost(null), setSelected(null), setCutting(null), setPicked([]));

  // ---------- cortes: dois cliques numa planta baixa ----------
  const [cutting, setCutting] = useState<{ a?: [number, number]; screen?: [number, number] } | null>(null);
  const [mouse, setMouse] = useState<[number, number] | null>(null);
  /** corte horizontal numa vista: a linha que segue o cursor (px na tela) e a altura dela (mm) */
  const [hcut, setHcut] = useState<{ x0: number; x1: number; y: number; h: number } | null>(null);
  const startCut = () => (setArmed(null), setGhost(null), setSelected(null), setMouse(null), setHcut(null), setPicked([]), setCutting(cutting ? null : {}));
  const MOD = catalog.settings.modulo_mm;
  /** altura (mm, de 5 em 5) sob o cursor, se ele estiver numa vista ou num corte; e a linha na tela */
  const sideHit = (e: React.PointerEvent) => {
    const g = (e.target as Element).closest('[data-group^="desenho:"]');
    const id = g?.getAttribute("data-group")?.slice("desenho:".length);
    const info = built.views.find((v) => v.view.id === id && v.toHeight);
    const p = paperPoint(e);
    if (!g || !info?.toHeight || !p) return null;
    const h = Math.max(0, Math.round(info.toHeight(p.at) / 5) * 5);
    // altura → ponto da folha (a conta é linear) → tela
    const a = info.toHeight([0, 0]);
    const b = info.toHeight([0, 1]);
    const py = (a - h) / (a - b);
    const r = g.getBoundingClientRect();
    return { h, x0: r.left, x1: r.right, y: p.r.top + py / p.k };
  };
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
    if (!w && !cutting.a) {
      // numa vista (A–D ou corte): um clique marca a altura e a planta baixa cortada vai para a mão
      const s2 = sideHit(e);
      if (s2) {
        setCutting(null);
        setHcut(null);
        setMouse(null);
        setArmed({ kind: "plan", level: s2.h, section: true });
        return;
      }
    }
    if (!w) return setNote(cutting.a ? "Clique numa planta baixa para marcar a linha de corte." : "Clique numa planta baixa (corte vertical) ou numa vista (planta baixa a uma altura).");
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
  /** apaga o corte: a linha nas plantas e os desenhos dele */
  const removeCut = (id: string) => {
    const name = meta.cuts?.find((c) => c.id === id)?.name ?? "corte";
    setSheet(deleteCut(useApp.getState().sheet, id));
    setArmed(null);
    setGhost(null);
    setSelected(null);
    setNote(`${name} apagado. Ctrl+Z desfaz.`);
  };
  const selInfo = built.views.find((v) => v.view.id === selected) ?? null;
  const armedName = armed
    ? armed.kind === "plan" && armed.section
      ? `a planta baixa a ${heightText(armed.level, armed.unit, MOD).replace("ALTURA = ", "")}`
      : armed.kind === "plan"
      ? `a planta ${(levels.find((l) => Math.abs(l.y - armed.level) < 0.5)?.name ?? "").toLowerCase().replace("pav. ", "")}`
      : armed.kind === "cut"
        ? `o ${(meta.cuts?.find((c) => c.id === armed.cut)?.name ?? "corte").toLowerCase()}`
        : armed.kind === "iso"
          ? `a isométrica ${armed.iso.split("").join("-")}`
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
      ...(armed.kind === "plan" ? { level: armed.level, ...(armed.section ? { section: true as const } : {}) } : armed.kind === "cut" ? { cut: armed.cut } : armed.kind === "iso" ? { iso: armed.iso } : {}),
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

  // ---------- seleção de vários (retângulo na prancha, como na montagem) ----------
  /** escolhidos: "b:<folha|bloco>" (desenho, título, tabela…) ou "l:<etiqueta>" (nome de peça, marcador de vista) */
  const [picked, setPicked] = useState<string[]>([]);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const boxStart = useRef<{ x: number; y: number; paper: Element; add: boolean } | null>(null);
  const keyOf = (el: Element) => {
    const tag = el.getAttribute("data-tag");
    return tag ? `l:${tag}` : `b:${built.paper}|${el.getAttribute("data-group")}`;
  };
  const elementsOf = (key: string): SVGGraphicsElement[] => {
    const [kind, rest] = [key.slice(0, 2), key.slice(2)];
    const q = kind === "l:" ? `[data-tag="${CSS.escape(rest)}"]` : `[data-group="${CSS.escape(rest.slice(rest.indexOf("|") + 1))}"]`;
    return [...document.querySelectorAll<SVGGraphicsElement>(`.sheet-paper ${q}`)];
  };
  const finishBox = (e: React.PointerEvent) => {
    const b = boxStart.current!;
    boxStart.current = null;
    setBox(null);
    const l = Math.min(b.x, e.clientX), r = Math.max(b.x, e.clientX), t = Math.min(b.y, e.clientY), bt = Math.max(b.y, e.clientY);
    if (r - l < 4 && bt - t < 4) return;
    // da esquerda para a direita: só o que fica todo dentro (janela); da direita para a esquerda: o que encosta (cruzamento)
    const win = e.clientX >= b.x;
    const hit = (el: Element) => {
      const q = el.getBoundingClientRect();
      return win ? q.left >= l && q.right <= r && q.top >= t && q.bottom <= bt : q.right >= l && q.left <= r && q.bottom >= t && q.top <= bt;
    };
    const keys = new Set(b.add ? picked : []);
    const groups = [...b.paper.querySelectorAll("[data-group]")].filter(hit);
    for (const g of groups) keys.add(keyOf(g));
    // nomes e marcadores só contam sozinhos (com o desenho deles escolhido, eles já andam junto)
    for (const el of b.paper.querySelectorAll("[data-tag]")) {
      const g = el.closest("[data-group]");
      if (g && groups.includes(g)) continue;
      if (hit(el)) keys.add(keyOf(el));
    }
    setPicked([...keys]);
    setSelected(null);
  };
  /** desenhos escolhidos (o bloco do desenho ou o título dele) */
  const pickedViews = () => [...new Set(picked.map((k) => /^b:[^|]*\|(?:desenho|titulo):(.+)$/.exec(k)?.[1]).filter((x): x is string => !!x))];
  const removePicked = () => {
    const ids = pickedViews().filter((id) => built.layout.views.some((v) => v.id === id));
    if (!ids.length) return setNote("Só os desenhos saem da prancha. Os títulos da capa e os nomes das peças ficam.");
    saveLayout(ids.reduce((l, id) => removeView(l, id), built.layout));
    setPicked([]);
    setNote(`${ids.length} desenho${ids.length > 1 ? "s" : ""} tirado${ids.length > 1 ? "s" : ""} da prancha. Ctrl+Z desfaz.`);
  };
  // destaque do desenho escolhido
  useEffect(() => {
    document.querySelectorAll(".sheet-paper .selected").forEach((el) => el.classList.remove("selected"));
    for (const k of picked) elementsOf(k).forEach((el) => el.classList.add("selected"));
    if (!selected) return;
    const q = CSS.escape(selected);
    document.querySelectorAll(`.sheet-paper [data-group="desenho:${q}"], .sheet-paper [data-group="titulo:${q}"]`).forEach((el) => el.classList.add("selected"));
  }, [svgs, selected, picked]);
  // Esc cancela a inserção e fecha o painel do desenho (antes de fechar as pranchas); Delete tira o desenho escolhido
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((t instanceof HTMLInputElement && t.type !== "checkbox") || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      if (document.querySelector(".sheet-pop")) return; // o menu aberto fecha primeiro
      if (e.key === "Escape" && (armed || selected || cutting || picked.length)) {
        e.stopPropagation();
        setArmed(null);
        setGhost(null);
        setSelected(null);
        setCutting(null);
        setMouse(null);
        setHcut(null);
        setPicked([]);
      } else if ((e.key === "Delete" || e.key === "Backspace") && picked.length) {
        e.preventDefault();
        removePicked();
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
    const view = built.layout.views.find((v) => v.id === id);
    if (field === "sub" && view?.kind === "plan" && view.section) {
      // planta cortada: o subtítulo é a altura do corte; mudar o número muda o desenho
      const h = parseHeight(value, MOD);
      if (!h || h.mm < 0) return setNote("Escreva a altura do corte, por exemplo 12,5 cm, 125 mm ou 8 M (módulos).");
      const layout = { ...built.layout, views: built.layout.views.map((v) => (v.id === id ? { ...v, level: Math.round(h.mm * 100) / 100, unit: h.unit } : v)) };
      const next = withLayout(cur, built.paper, layout);
      return setSheet({ ...next, views: { ...next.views, [id]: { ...next.views?.[id], sub: undefined } } });
    }
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
  const press = useRef<{
    el: SVGGraphicsElement | null; edit: Element | null; tag: string; kind: "label" | "block"; x: number; y: number; k: number;
    /** vários escolhidos andando juntos: cada elemento na tela e a chave da posição dele */
    multi?: { key: string; els: SVGGraphicsElement[]; axis: string | null }[];
  } | null>(null);
  /** marcador de vista: anda só no eixo dele */
  const along = (axis: string | null | undefined, dx: number, dy: number): [number, number] => (axis === "x" ? [dx, 0] : axis === "y" ? [0, dy] : [dx, dy]);
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
      const paper = target.closest(".sheet-paper");
      if (paper) {
        // papel vazio: começa o retângulo de seleção (Shift soma ao que já está escolhido)
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        boxStart.current = { x: e.clientX, y: e.clientY, paper, add: e.shiftKey };
        if (!e.shiftKey) setPicked([]);
        setSelected(null);
        return;
      }
      // clique fora dos desenhos fecha o painel do desenho
      if (!target.closest(".sheet-side")) (setSelected(null), setPicked([]));
      return;
    }
    if (e.shiftKey && el) {
      // Shift + clique: põe ou tira da seleção
      const key = keyOf(el);
      setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
      setSelected(null);
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
    if (el && picked.length > 1 && picked.includes(keyOf(el))) {
      press.current.multi = picked.map((key) => {
        const els = elementsOf(key);
        return { key, els, axis: els[0]?.getAttribute("data-axis") ?? null };
      });
      press.current.multi.forEach((m) => m.els.forEach((x) => x.classList.add("dragging")));
    }
    el?.classList.add("dragging");
  };
  const onMove = (e: React.PointerEvent) => {
    if (boxStart.current) {
      const b = boxStart.current;
      return setBox({ x0: b.x, y0: b.y, x1: e.clientX, y1: e.clientY });
    }
    if (cutting) {
      setMouse([e.clientX, e.clientY]);
      return setHcut(cutting.a || planHit(e) ? null : sideHit(e));
    }
    if (armed) {
      // contorno do desenho que vai entrar, seguindo o cursor
      const p = paperPoint(e);
      if (!p || p.sheet === 0) return setGhost(null);
      const c = newViewFrame(input, armed, used, p.at).body;
      return setGhost({ x: p.r.left + c.x / p.k, y: p.r.top + c.y / p.k, w: c.w / p.k, h: c.h / p.k });
    }
    const d = press.current;
    if (!d?.el) return;
    const dx = (e.clientX - d.x) * d.k;
    const dy = (e.clientY - d.y) * d.k;
    if (d.multi) {
      for (const m of d.multi) {
        const [mx, my] = along(m.axis, dx, dy);
        m.els.forEach((x) => x.setAttribute("transform", `translate(${mx} ${my})`));
      }
      return;
    }
    const [mx, my] = along(d.el.getAttribute("data-axis"), dx, dy);
    d.el.setAttribute("transform", `translate(${mx} ${my})`);
  };
  const onUp = (e: React.PointerEvent) => {
    if (boxStart.current) return finishBox(e);
    const d = press.current;
    press.current = null;
    if (!d) return;
    d.el?.classList.remove("dragging");
    d.multi?.forEach((m) => m.els.forEach((x) => x.classList.remove("dragging")));
    const dx = (e.clientX - d.x) * d.k;
    const dy = (e.clientY - d.y) * d.k;
    if (Math.hypot(dx, dy) < 0.3) {
      d.el?.removeAttribute("transform");
      d.multi?.forEach((m) => m.els.forEach((x) => x.removeAttribute("transform")));
      setPicked([]);
      // clique num desenho ou no título dele: abre o painel do desenho
      const g = d.kind === "block" ? d.tag.slice(d.tag.indexOf("|") + 1) : "";
      const m = /^(desenho|titulo):(.+)$/.exec(g);
      setSelected(m ? m[2] : null);
      if (d.edit) openEdit(d.edit);
      return;
    }
    if (!d.el) return;
    const cur = useApp.getState().sheet;
    const labels = { ...cur.labels };
    const blocks = { ...cur.blocks };
    const shift = (key: string, axis: string | null | undefined) => {
      const [mx, my] = along(axis, dx, dy);
      const map = key.startsWith("l:") ? labels : blocks;
      const k = key.slice(2);
      const prev = map[k] ?? [0, 0];
      map[k] = [prev[0] + mx, prev[1] + my];
    };
    if (d.multi) d.multi.forEach((m) => shift(m.key, m.axis));
    else shift(`${d.kind === "label" ? "l" : "b"}:${d.tag}`, d.el.getAttribute("data-axis"));
    // tudo numa mudança só (um Ctrl+Z desfaz o arraste inteiro)
    setSheet({ ...cur, labels, blocks });
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
              // "Renderizada" vem desligada; as outras, ligadas
              const on = k === "render" ? meta.show?.render === true : meta.show?.[k] !== false;
              return (
                <button key={k} className={on ? "on" : ""} aria-pressed={on} title={`${tip}: liga e desliga em todas as pranchas (menos nos desenhos com ajuste próprio)`} onClick={() => setMeta({ show: { ...meta.show, [k]: !on } })}>
                  {label}
                </button>
              );
            })}
          </div>
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
              const vector = buildSheets({ cat: catalog, model, inventory, name, meta, author }).sheets;
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
      {!empty && <InsertBar levels={levels} cuts={meta.cuts ?? []} armed={armed} onArm={arm} cutting={!!cutting} onCut={startCut} onDeleteCut={removeCut} />}
      {empty ? (
        <p className="sheets-empty">Monte a estrutura primeiro: as pranchas saem dela.</p>
      ) : (
        <div
          className={`sheets-list${armed || cutting ? " placing" : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => (setGhost(null), setMouse(null), setHcut(null))}
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
      {box && <div className={`select-box${box.x1 < box.x0 ? " crossing" : ""}`} style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />}
      {cutting && !cutting.a && hcut && (
        <svg className="sheet-cut-band" aria-hidden>
          <line x1={hcut.x0} y1={hcut.y} x2={hcut.x1} y2={hcut.y} />
          <text x={hcut.x1 + 6} y={hcut.y + 4}>{heightText(hcut.h, "cm", MOD).replace("ALTURA = ", "")}</text>
        </svg>
      )}
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
            selInfo.view.kind === "cut" ? () => removeCut(selInfo.view.cut!) : undefined
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
              : hcut
                ? `Clique para cortar a ${heightText(hcut.h, "cm", MOD).replace("ALTURA = ", "")} da chapa: sai uma planta baixa nessa altura. Esc cancela.`
                : "Numa planta baixa, clique no primeiro ponto da linha de corte. Numa vista, clique na altura para uma planta baixa cortada. Esc cancela."
            : armed
            ? `Clique na prancha onde vai ${armedName} (escala ${fmt(used)}). Esc cancela.`
            : picked.length
              ? `${picked.length} ${picked.length > 1 ? "itens escolhidos" : "item escolhido"}: arraste um deles para mover todos. Delete tira os desenhos da prancha; Esc limpa.`
            : selInfo
              ? `${selInfo.entry}: arraste para mudar de lugar. Delete tira da prancha; Esc fecha.`
              : "Clique num desenho para ajustar ou num título para editar. Arraste o que quiser mover; no papel vazio, arraste para escolher vários.")}
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
