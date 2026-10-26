// Conjunto de pranchas no padrão do Desafio Poli-USP 2022 (docs/plano-simolador.md, seção 6b):
// capa (isométrica + lista de peças) · plantas por pavimento · vistas A–D · cortes.
// O arranjo nasce automático (plantas 2×2 por folha, vistas 2 por folha) e o usuário pode mexer nele: inserir, tirar
// e mudar desenhos de prancha. O arranjo mexido fica no carimbo do projeto (SheetMeta.layouts), por tamanho de folha.
import type { Catalog } from "../core/catalog";
import type { InventoryConfig } from "../core/inventory";
import { ropePlan } from "../core/rope";
import { minKits, usage } from "../core/inventory";
import { boardsOf, type Model, type Vec3 } from "../core/model";
import { boardCorners, fromBoardLocal } from "../core/boards";
import type { IsoCorner, SheetCut, SheetLayout, SheetMeta, SheetShow, SheetView } from "../core/serialization";
import { CUSTOM_MAX, CUSTOM_MIN, GRAY, PAPER, PEN, movePrim, type PaperName, type Prim, type Pt, type Sheet } from "./prims";
import { bounds, cutProjector, isoProjector, itemsFor, projector, world, type Item, type Projector, type ViewId } from "./views";

export interface SheetInput {
  cat: Catalog;
  model: Model;
  inventory: InventoryConfig;
  name: string;
  /** carimbo: título, folha, escala, o que mostrar, arranjo e cortes */
  meta: SheetMeta;
  date?: Date;
  /** foto isométrica renderizada para a capa; sem ela, a capa usa o desenho em linhas */
  isoImage?: { url: string; aspect: number } | null;
  /** logos do carimbo (Mola e equipe), lado a lado no canto inferior esquerdo; sem elas, o hexágono */
  logos?: { url: string; aspect: number }[];
}

/** Tudo ligado: o padrão da barra de cima. */
export const SHOW_ALL: SheetShow = { markers: true, labels: true, axes: true, dims: true };

const SCALES = [1, 2, 2.5, 5, 10, 20];
const MARGIN = 10;
const TB_H = 16; // altura do carimbo
const BAR_W = 12; // faixa da escala gráfica, na direita da folha
// folha atual (definida no começo de buildSheets)
let PAPER_NAME: PaperName = "A3";
let PG = { ...PAPER.A3 };
let AREA = { x0: MARGIN, y0: MARGIN, x1: PG.w - MARGIN - BAR_W, y1: PG.h - MARGIN - TB_H - 4 };

/** Tamanho da folha escolhida (a personalizada fica entre CUSTOM_MIN e CUSTOM_MAX). */
export function paperSize(meta: Pick<SheetMeta, "paper" | "custom">): { name: PaperName; w: number; h: number } {
  const name = meta.paper ?? "A3";
  if (name !== "custom") return { name, ...PAPER[name] };
  const clamp = (v: number) => Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(v)));
  return { name, w: clamp(meta.custom?.w ?? 420), h: clamp(meta.custom?.h ?? 297) };
}
function setPaper(meta: SheetMeta) {
  const p = paperSize(meta);
  PAPER_NAME = p.name;
  PG = { w: p.w, h: p.h };
  AREA = { x0: MARGIN, y0: MARGIN, x1: PG.w - MARGIN - BAR_W, y1: PG.h - MARGIN - TB_H - 4 };
}
/** marca as primitivas como um bloco arrastável */
const tagged = (prims: Prim[], group: string): Prim[] => prims.map((p) => (p.group ? p : { ...p, group }));

const LABEL: Partial<Record<Item["kind"], string>> = {
  "bar-v": "PILAR",
  node: "LIGAÇÃO",
  base: "LIGAÇÃO DE BASE",
  rc90: "LIGAÇÃO RÍGIDA",
  cc: "LIGAÇÃO CONTÍNUA",
  cable: "CONTRAVENTAMENTO",
  rope: "CABO",
  "plate-v": "PAREDE",
  "plate-h": "LAJE",
};
const PLAN_LABELS: Item["kind"][] = ["base", "rc90", "cable", "rope", "plate-h", "plate-v", "cc"];
const ELEV_LABELS: Item["kind"][] = ["cable", "rope", "bar-v", "node", "rc90", "cc", "base", "plate-v"];

export const fmtScale = (n: number) => `1/${String(n).replace(".", ",")}`;
const letters = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`);

// ---------------- níveis e eixos ----------------

export interface Level {
  y: number;
  name: string;
  planTitle: [string, string];
}

export function levelsOf(model: Model, cat: Catalog): Level[] {
  const W = world(cat);
  const r = (y: number) => Math.round(y * 100) / 100;
  const Y = (id: string) => r(W.pos(model.nodes[id].pos)[1]);
  // pavimento = nível com viga ou laje (nós soltos de barras inclinadas não viram planta); mais o térreo e o topo
  const set = new Set<number>();
  for (const m of Object.values(model.members)) if (cat.pieces[m.code]?.type === "bar" && Y(m.a) === Y(m.b)) set.add(Y(m.a));
  for (const p of Object.values(model.plates)) {
    const ys = p.corners.map(Y);
    if (ys.every((y) => y === ys[0])) set.add(ys[0]);
  }
  const all = Object.values(model.nodes).map((n) => r(W.pos(n.pos)[1]));
  if (all.length) (set.add(Math.min(...all)), set.add(Math.max(...all)));
  const ys = [...set].sort((a, b) => a - b);
  return ys.map((y, i) => ({
    y,
    name: i === 0 ? "PAV. TÉRREO" : i === ys.length - 1 && ys.length > 1 ? "COBERTURA" : `${i}º PAVIMENTO`,
    planTitle: i === ys.length - 1 && ys.length > 1 ? ["PLANTA DE", "COBERTURA"] : ["PLANTA BAIXA", i === 0 ? "PAV. TÉRREO" : `${i}º PAVIMENTO`],
  }));
}

/** Contorno de cada chapa em planta (mm, h = x, v = −z). */
function boardFrames(model: Model, cat: Catalog): Pt[][] {
  const W = world(cat);
  return boardsOf(model).map((b) => boardCorners(cat, b).map(([x, z]) => [x * W.M, -z * W.M] as Pt));
}

function axesOf(model: Model, cat: Catalog) {
  const W = world(cat);
  const uniq = (arr: number[]) => [...new Set(arr.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  const xs = uniq(Object.values(model.nodes).map((n) => W.pos(n.pos)[0]));
  const zs = uniq(Object.values(model.nodes).map((n) => W.pos(n.pos)[2]));
  return { xs: xs.map((x, i) => ({ x, label: letters(i) })), zs: zs.map((z, i) => ({ z, label: String(i + 1) })) };
}

// ---------------- encaixe de uma vista num quadro ----------------

type Cell = SheetView["cell"];

interface Placed {
  to: (q: [number, number]) => Pt;
  s: number; // escala (papel/real)
  box: { x0: number; x1: number; y0: number; y1: number }; // limites em papel
}

/** Centraliza os limites (mm reais) dentro do quadro (mm papel). */
function place(b: ReturnType<typeof bounds>, cell: Cell, n: number): Placed {
  const s = 1 / n;
  const cx = cell.x + cell.w / 2;
  const cy = cell.y + cell.h / 2;
  const bx = (b.x0 + b.x1) / 2;
  const by = (b.y0 + b.y1) / 2;
  const to = (q: [number, number]): Pt => [cx + (q[0] - bx) * s, cy - (q[1] - by) * s];
  const p0 = to([b.x0, b.y1]);
  const p1 = to([b.x1, b.y0]);
  return { to, s, box: { x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1] } };
}

const paint = (items: Item[], P: Placed): Prim[] =>
  [...items].sort((a, b) => a.depth - b.depth || a.order - b.order).flatMap((it) => it.draw(P.to, P.s));

// ---------------- anotações ----------------

const txt = (p: Pt, s: string, size: number, o: Partial<Extract<Prim, { t: "text" }>> = {}): Prim => ({
  t: "text", p, s, size, layer: "MOLA-TEXTO", fill: "#000", ...o,
});

function bubble(c: Pt, label: string): Prim[] {
  return [
    { t: "circle", c, r: 2.4, fill: "#fff", stroke: "#000", pen: PEN.part, layer: "MOLA-EIXO" },
    txt([c[0], c[1] + 0.95], label, 2.6, { bold: true, anchor: "middle", layer: "MOLA-EIXO" }),
  ];
}

const axisLine = (a: Pt, b: Pt): Prim => ({ t: "line", a, b, stroke: "#8a8a8a", pen: PEN.thin, dash: "center", layer: "MOLA-EIXO" });

// ---------------- cotas ----------------
const mmText = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const tick = (c: Pt): Prim => ({ t: "line", a: [c[0] - 0.9, c[1] + 0.9], b: [c[0] + 0.9, c[1] - 0.9], stroke: "#000", pen: PEN.part, layer: "MOLA-COTA" });
/** Corrente de cotas horizontal na altura y (papel): pontos em x (papel) e valores reais entre eles (mm). */
function dimChainH(xs: Pt[], y: number, values: number[], below = false): Prim[] {
  if (xs.length < 2) return [];
  const out: Prim[] = [{ t: "line", a: [xs[0][0] - 1.2, y], b: [xs[xs.length - 1][0] + 1.2, y], stroke: "#000", pen: PEN.thin, layer: "MOLA-COTA" }];
  xs.forEach((p) => {
    out.push(tick([p[0], y]));
    out.push({ t: "line", a: [p[0], y - 1.4], b: [p[0], y + 1.4], stroke: "#000", pen: PEN.thin, layer: "MOLA-COTA" });
  });
  for (let i = 0; i < xs.length - 1; i++) {
    const w = xs[i + 1][0] - xs[i][0];
    if (w < 7.5) continue; // vão estreito demais para o número
    out.push(txt([(xs[i][0] + xs[i + 1][0]) / 2, below ? y + 2.8 : y - 0.8], mmText(values[i]), 2, { anchor: "middle", layer: "MOLA-COTA" }));
  }
  return out;
}
/** Corrente de cotas vertical em x (papel). `ys` em ordem de cima para baixo na folha. */
function dimChainV(ys: number[], x: number, values: number[], right = false): Prim[] {
  if (ys.length < 2) return [];
  const out: Prim[] = [{ t: "line", a: [x, ys[0] - 1.2], b: [x, ys[ys.length - 1] + 1.2], stroke: "#000", pen: PEN.thin, layer: "MOLA-COTA" }];
  ys.forEach((y) => {
    out.push(tick([x, y]));
    out.push({ t: "line", a: [x - 1.4, y], b: [x + 1.4, y], stroke: "#000", pen: PEN.thin, layer: "MOLA-COTA" });
  });
  for (let i = 0; i < ys.length - 1; i++) {
    const h = ys[i + 1] - ys[i];
    if (h < 7.5) continue;
    const ty = (ys[i] + ys[i + 1]) / 2;
    const tx = right ? x + 2.6 : x - 0.8;
    out.push(txt([tx, ty], mmText(values[i]), 2, { anchor: "middle", rot: right ? 90 : -90, layer: "MOLA-COTA" }));
  }
  return out;
}

/** Chamadas: uma por tipo de peça, com linha até a coluna de textos à direita. */
function callouts(
  items: Item[], kinds: Item["kind"][], P: Placed, colX: number, yMin: number, yMax: number,
  key = "", moved: Record<string, [number, number]> = {},
): Prim[] {
  const picks: { label: string; at: Pt }[] = [];
  for (const k of kinds) {
    const cand = items.filter((i) => i.kind === k);
    if (!cand.length || !LABEL[k]) continue;
    cand.sort((a, b) => b.depth - a.depth || b.anchor[0] - a.anchor[0]);
    picks.push({ label: LABEL[k]!, at: P.to(cand[0].anchor) });
  }
  picks.sort((a, b) => a.at[1] - b.at[1]);
  // posições dos textos: na altura da peça, com 6 mm de folga entre eles e dentro de [yMin, yMax]
  const GAP = 6;
  const ys = picks.map((p) => Math.min(yMax, Math.max(yMin, p.at[1])));
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + GAP);
  const over = ys.length ? ys[ys.length - 1] - yMax : 0;
  if (over > 0) for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i] - (i === ys.length - 1 ? over : 0), i < ys.length - 1 ? ys[i + 1] - GAP : Infinity);
  const out: Prim[] = [];
  picks.forEach((p, i) => {
    // etiqueta arrastada na tela: desloca o texto e o cotovelo; a ponta continua na peça
    const tag = `${key}|${p.label}`;
    const [dx, dy] = moved[tag] ?? [0, 0];
    const y = ys[i] + dy;
    const cx = colX + dx;
    const elbow: Pt = [cx - 8, y];
    out.push({ t: "line", a: p.at, b: elbow, stroke: "#000", pen: PEN.thin, layer: "MOLA-TEXTO" });
    out.push({ t: "line", a: elbow, b: [cx, y], stroke: "#000", pen: PEN.thin, layer: "MOLA-TEXTO" });
    out.push({ t: "circle", c: p.at, r: 0.45, fill: "#000", stroke: null, layer: "MOLA-TEXTO" });
    out.push(txt([cx + 1.5, y + 0.8], p.label, 2.2, { bold: true, tag }));
  });
  return out;
}

/** Título do desenho: nome, subtítulo (os dois se editam clicando na tela) e escala. */
function viewTitle(at: Pt, title: string, sub: string, n: number | null, id: string): Prim[] {
  return [
    txt(at, title, 4.4, { bold: true, edit: `vt:${id}` }),
    txt([at[0], at[1] + 5.2], sub, 3.3, { edit: `vs:${id}` }),
    txt([at[0], at[1] + 9.4], n === null ? "SEM ESCALA" : `ESCALA: ${fmtScale(n)}`, 2.3),
  ];
}

/** Marcador de vista: triângulo apontando para a planta com "VISTA" e a letra. */
function viewMarker(c: Pt, dir: "up" | "down" | "left" | "right", letter: string): Prim[] {
  const k = 4.2;
  const tri: Record<string, Pt[]> = {
    up: [[c[0] - k * 1.6, c[1] + k * 0.6], [c[0] + k * 1.6, c[1] + k * 0.6], [c[0], c[1] - k * 0.8]],
    down: [[c[0] - k * 1.6, c[1] - k * 0.6], [c[0] + k * 1.6, c[1] - k * 0.6], [c[0], c[1] + k * 0.8]],
    left: [[c[0] + k * 0.6, c[1] - k * 1.6], [c[0] + k * 0.6, c[1] + k * 1.6], [c[0] - k * 0.8, c[1]]],
    right: [[c[0] - k * 0.6, c[1] - k * 1.6], [c[0] - k * 0.6, c[1] + k * 1.6], [c[0] + k * 0.8, c[1]]],
  };
  const vertical = dir === "up" || dir === "down";
  const lt: Pt = vertical ? [c[0], c[1] + (dir === "up" ? 0.4 : -0.4)] : [c[0] + (dir === "left" ? 0.3 : -0.3), c[1] + 0.9];
  const vt: Pt = vertical ? [c[0], c[1] + (dir === "up" ? 5.6 : -3.6)] : [c[0] + (dir === "left" ? 4.8 : -4.8), c[1] + 0.9];
  return [
    { t: "poly", pts: tri[dir], closed: true, fill: "#fff", stroke: "#000", pen: PEN.part, layer: "MOLA-TEXTO" },
    txt(lt, letter, 2.4, { bold: true, anchor: "middle" }),
    txt(vt, "VISTA", 1.6, { anchor: "middle", ...(vertical ? {} : { rot: dir === "left" ? -90 : 90 }) }),
  ];
}

// ---------------- textos que precisam caber num quadro ----------------

/** Largura aproximada (mm) de um texto em Arial, em maiúsculas. */
const textW = (s: string, size: number, bold = false) => s.length * size * (bold ? 0.66 : 0.6);

/** Quebra os itens em linhas de no máximo `maxW` mm, separados por " · ". */
function wrap(entries: string[], maxW: number, size: number, sep = "  ·  "): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const e of entries) {
    const cand = cur ? cur + sep + e : e;
    if (!cur || textW(cand, size) <= maxW) cur = cand;
    else (lines.push(cur), (cur = e));
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Linhas e tamanho de letra para os itens caberem em `maxW` × `maxH` (diminui a letra até `min`). */
function fitBlock(entries: string[], maxW: number, maxH: number, size0: number, min = 1.5) {
  let size = size0;
  for (;;) {
    const lines = wrap(entries, maxW, size);
    if ((lines.length * size * 1.35 <= maxH && lines.every((l) => textW(l, size) <= maxW)) || size * 0.9 < min) {
      const max = Math.max(1, Math.floor(maxH / (size * 1.35)));
      return { size, lines: lines.length > max ? [...lines.slice(0, max - 1), `${lines[max - 1]} …`] : lines };
    }
    size *= 0.9;
  }
}

/** Texto numa linha: diminui a letra até caber em `maxW`. */
const fitSize = (s: string, maxW: number, size: number, bold = false, min = 1.6) =>
  Math.max(min, Math.min(size, (maxW / Math.max(1, textW(s, size, bold))) * size));

// ---------------- carimbo ----------------

interface PageInfo {
  number: number;
  total: number;
  /** nomes curtos dos desenhos da prancha ("PB 1º PAVIMENTO", "VISTA-A"…) */
  entries: string[];
  /** escalas dos desenhos da prancha (vazio: sem escala, como a capa) */
  scales: number[];
}

/** Kits usados: os do estoque; no modo sem limite, o menor conjunto que cobre as peças. */
function kitLines(input: SheetInput): string[] {
  const { cat, inventory, model } = input;
  const kits = inventory.unlimited ? minKits(cat, usage(model, cat)).kits : inventory.kits;
  const short = (k: string) => (cat.kits[k]?.name ?? `Kit ${k}`).replace(/^mola structural\s*/i, "").toUpperCase();
  return Object.entries(kits).filter(([, c]) => c > 0).map(([k, c]) => `${c > 1 ? `${c}× ` : ""}${short(k)}`);
}

function titleBlock(input: SheetInput, pg: PageInfo): Prim[] {
  const y0 = PG.h - MARGIN - TB_H;
  const y1 = PG.h - MARGIN;
  const ym = (y0 + y1) / 2;
  const kc = (PG.w - 2 * MARGIN) / (PAPER.A3.w - 2 * MARGIN);
  // quadros (medidas da A3, proporcionais nas outras folhas): logos · título · desenhos · kits · escala · folha
  const cols = [MARGIN, ...[46, 160, 268, 318, 362].map((x) => MARGIN + (x - MARGIN) * kc), PG.w - MARGIN];
  const out: Prim[] = [
    { t: "poly", pts: [[MARGIN, y0], [PG.w - MARGIN, y0], [PG.w - MARGIN, y1], [MARGIN, y1]], closed: true, fill: null, stroke: "#000", pen: PEN.base, layer: "MOLA-CARIMBO" },
  ];
  for (const x of cols.slice(1, -1)) out.push({ t: "line", a: [x, y0], b: [x, y1], stroke: "#000", pen: PEN.thin, layer: "MOLA-CARIMBO" });
  // logos (public/logos: Mola e equipe, lado a lado); sem arquivos, a marca provisória (hexágono)
  const logos = (input.logos ?? []).slice(0, 2);
  if (logos.length) {
    const pad = 1.6;
    const slotW = (cols[1] - cols[0] - pad * (logos.length + 1)) / logos.length;
    const slotH = TB_H - 2 * pad;
    logos.forEach((lg, i) => {
      const w = Math.min(slotW, slotH * lg.aspect);
      const h = w / lg.aspect;
      const x = cols[0] + pad + i * (slotW + pad) + (slotW - w) / 2;
      out.push({ t: "image", x, y: ym - h / 2, w, h, href: lg.url, layer: "MOLA-CARIMBO" });
    });
  } else {
    const c: Pt = [(cols[0] + cols[1]) / 2, ym];
    const hex: Pt[] = Array.from({ length: 6 }, (_, i) => [c[0] + 5 * Math.sin((i * Math.PI) / 3), c[1] - 5 * Math.cos((i * Math.PI) / 3)]);
    out.push({ t: "poly", pts: hex, closed: true, fill: null, stroke: "#000", pen: PEN.base, layer: "MOLA-CARIMBO" });
    out.push({ t: "line", a: hex[0], b: hex[3], stroke: "#000", pen: PEN.part, layer: "MOLA-CARIMBO" });
    out.push({ t: "line", a: hex[1], b: hex[4], stroke: "#000", pen: PEN.part, layer: "MOLA-CARIMBO" });
    out.push({ t: "line", a: hex[2], b: hex[5], stroke: "#000", pen: PEN.part, layer: "MOLA-CARIMBO" });
  }
  const T = (p: Pt, s: string, size: number, o: Partial<Extract<Prim, { t: "text" }>> = {}) => txt(p, s, size, { layer: "MOLA-CARIMBO", ...o });
  const field = (i: number, s: string) => T([cols[i] + 1.6, y0 + 2.6], s, 1.5, { fill: "#6b6b6b" });
  const inner = (i: number) => cols[i + 1] - cols[i] - 3.2;
  // título (maior, em negrito) e subtítulo: os mesmos em todas as pranchas; editam-se clicando neles
  const { line1, line2 } = input.meta;
  out.push(T([cols[1] + 3, ym + 0.4], line1, fitSize(line1, inner(1) - 1.6, 4.2, true), { bold: true, edit: "title" }));
  out.push(T([cols[1] + 3, ym + 5], line2, fitSize(line2, inner(1) - 1.6, 2.4), { edit: "sub" }));
  // desenhos da prancha, agrupados para caber no quadro
  out.push(field(2, "DESENHOS"));
  const dw = fitBlock(pg.entries.length ? pg.entries : ["—"], inner(2), TB_H - 5.2, 2.2);
  dw.lines.forEach((l, i) => out.push(T([cols[2] + 1.6, y0 + 5.6 + dw.size * (0.75 + 1.35 * i)], l, dw.size, { bold: true })));
  // kits usados
  out.push(field(3, "KITS"));
  const kits = kitLines(input);
  const kw = fitBlock(kits.length ? kits : ["—"], inner(3), TB_H - 5.2, 2.2);
  kw.lines.forEach((l, i) => out.push(T([cols[3] + 1.6, y0 + 5.6 + kw.size * (0.75 + 1.35 * i)], l, kw.size, { bold: true })));
  // escala numérica: uma só, ou "INDICADA" quando a prancha tem mais de uma
  const sc = [...new Set(pg.scales)];
  const scTxt = sc.length === 0 ? "SEM ESCALA" : sc.length > 1 ? "ESCALA: INDICADA" : `ESCALA: ${fmtScale(sc[0])}`;
  out.push(T([cols[4] + 1.6, ym + 1], scTxt, fitSize(scTxt, inner(4), 2.6, true), { bold: true }));
  out.push(T([cols[4] + 1.6, y1 - 2], "MEDIDAS EM MILÍMETRO (mm)", fitSize("MEDIDAS EM MILÍMETRO (mm)", inner(4), 1.5), { fill: "#6b6b6b" }));
  // número da folha
  out.push(field(5, `FOLHA ${PAPER_NAME === "custom" ? `${PG.w} × ${PG.h}` : PAPER_NAME}`));
  const num = `${String(pg.number).padStart(2, "0")}/${String(pg.total).padStart(2, "0")}`;
  out.push(T([cols[6] - 2.4, ym + 4.2], num, fitSize(num, inner(5), 6.5, true), { bold: true, anchor: "end" }));
  return out;
}

function niceLength(target: number) {
  const steps = [20, 40, 50, 100, 200, 250, 400, 500, 1000, 2000, 5000];
  return steps.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), steps[0]);
}

/** Escala gráfica vertical na direita da folha, uma por escala da prancha, sem moldura. */
function scaleBars(scales: number[]): Prim[] {
  const out: Prim[] = [];
  let x = PG.w - MARGIN - 1.2;
  for (const n of [...new Set(scales)].sort((a, b) => a - b)) {
    const real = niceLength(50 * n);
    const len = real / n;
    const yb = AREA.y1;
    const yt = yb - len;
    for (let i = 0; i < 4; i++) {
      const a = yb - (len * (i + 1)) / 4;
      out.push({
        t: "poly", pts: [[x, a], [x + 1.2, a], [x + 1.2, a + len / 4], [x, a + len / 4]], closed: true,
        fill: i % 2 ? "#fff" : "#000", stroke: "#000", pen: PEN.thin, layer: "MOLA-CARIMBO",
      });
    }
    for (const i of [0, 2, 4]) out.push(txt([x - 0.9, yb - (len * i) / 4 + 0.6], String((real * i) / 4).replace(".", ","), 1.7, { anchor: "end", layer: "MOLA-CARIMBO" }));
    out.push(txt([x + 1.2, yt - 3.6], fmtScale(n), 1.8, { bold: true, anchor: "end", layer: "MOLA-CARIMBO" }));
    out.push(txt([x + 1.2, yt - 1.5], "mm", 1.6, { anchor: "end", fill: "#6b6b6b", layer: "MOLA-CARIMBO" }));
    x -= 11;
  }
  return out;
}

// ---------------- quadros do arranjo automático ----------------

function grid() {
  return { cols: AREA.x1 - AREA.x0 >= 300 ? 2 : 1, rows: AREA.y1 - AREA.y0 >= 200 ? 2 : 1 };
}
function planCells(): Cell[] {
  // folhas grandes: quatro plantas (2×2); A4: uma por folha (para manter a escala)
  const { cols, rows } = grid();
  const w = (AREA.x1 - AREA.x0) / cols;
  const h = (AREA.y1 - AREA.y0) / rows;
  return Array.from({ length: cols * rows }, (_, i) => ({ x: AREA.x0 + (i % cols) * w, y: AREA.y0 + Math.floor(i / cols) * h, w, h }));
}
function elevCells(): Cell[] {
  // folhas grandes: duas vistas lado a lado; A4: uma por folha
  const { cols } = grid();
  const w = (AREA.x1 - AREA.x0) / cols;
  return Array.from({ length: cols }, (_, i) => ({ x: AREA.x0 + i * w, y: AREA.y0, w, h: AREA.y1 - AREA.y0 }));
}

// espaço reservado dentro de cada quadro (mm de papel)
const PLAN_PAD = { left: 14, right: 44, top: 14, bottom: 22 };
const ELEV_PAD = { left: 34, right: 52, top: 22, bottom: 34 };

function inner(cell: Cell, pad: typeof PLAN_PAD) {
  return { x: cell.x + pad.left, y: cell.y + pad.top, w: cell.w - pad.left - pad.right, h: cell.h - pad.top - pad.bottom };
}

function planItems(cat: Catalog, model: Model, levelY: number, isGround: boolean, levels: number[] = []): Item[] {
  const all = itemsFor(cat, model, projector("plan"));
  const near = (y?: number) => y !== undefined && Math.abs(y - levelY) < 0.5;
  // peça inclinada: aparece na planta do primeiro nível em que ela chega (o da ponta de cima ou o seguinte)
  const arrival = (top?: number) => {
    if (top === undefined) return false;
    const lv = levels.find((y) => y >= top - 0.5);
    return lv !== undefined ? Math.abs(lv - levelY) < 0.5 : near(top);
  };
  return all.filter((it) => {
    if (it.kind === "base") return isGround;
    if (it.kind === "node") return near(it.level);
    if (it.kind === "plate-h" || it.kind === "bar-h") return near(it.level);
    if (it.kind === "bar-v" || it.kind === "cable" || it.kind === "rope") return it.top !== undefined && Math.abs((it.top ?? 0) - (it.level ?? 0)) > 0.5 ? arrival(it.top) : near(it.level);
    if (it.kind === "plate-v") return near(it.level);
    if (it.kind === "rc90" || it.kind === "cc") return near(it.level);
    return false;
  });
}

/** Inclui o topo da chapa (v = 0) nos limites de uma vista. */
const withGround = (b: ReturnType<typeof bounds>) => ({ ...b, y0: Math.min(b.y0, 0) });

function computeScale(input: SheetInput): number {
  const fixed = input.meta.scale ?? input.cat.settings.prancha_escala;
  if (typeof fixed === "number" && fixed > 0) return fixed;
  const { cat, model } = input;
  const plan = bounds(itemsFor(cat, model, projector("plan")), boardFrames(model, cat).flat());
  const pc = planCells()[0];
  const ec = elevCells()[0];
  const elev = (["A", "B"] as ViewId[]).map((v) => withGround(bounds(itemsFor(cat, model, projector(v)))));
  for (const n of SCALES) {
    const s = 1 / n;
    const planOk = (plan.x1 - plan.x0) * s <= pc.w - PLAN_PAD.left - PLAN_PAD.right && (plan.y1 - plan.y0) * s <= pc.h - PLAN_PAD.top - PLAN_PAD.bottom;
    const elevOk = elev.every((b) => (b.x1 - b.x0) * s <= ec.w - ELEV_PAD.left - ELEV_PAD.right && (b.y1 - b.y0) * s <= ec.h - ELEV_PAD.top - ELEV_PAD.bottom);
    if (planOk && elevOk) return n;
  }
  return SCALES[SCALES.length - 1];
}

// ---------------- desenhos ----------------

interface Ctx {
  input: SheetInput;
  levels: Level[];
  cuts: SheetCut[];
}

/** Chave das etiquetas arrastadas de um desenho (a mesma das versões anteriores para plantas e vistas). */
const labelKey = (v: SheetView) => (v.kind === "plan" ? `planta ${v.id}` : v.id);

/** Linha de corte na planta: traço e ponto, pontas grossas e setas para o lado que se vê, com o número do corte. */
function cutLine(cut: SheetCut, P: Placed): Prim[] {
  const A = P.to([cut.a[0], -cut.a[1]]);
  const B = P.to([cut.b[0], -cut.b[1]]);
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (L < 0.5) return [];
  const u: Pt = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]; // ao longo da linha, no papel
  const w: Pt = [u[1], -u[0]]; // para onde se olha (no papel, z do mundo cresce para baixo)
  const at = (p: Pt, k: number, dir: Pt): Pt => [p[0] + dir[0] * k, p[1] + dir[1] * k];
  const a0 = at(A, -4, u);
  const b0 = at(B, 4, u);
  const label = /\d+/.exec(cut.name)?.[0] ?? cut.name;
  const out: Prim[] = [
    { t: "line", a: a0, b: b0, stroke: "#000", pen: PEN.thin, dash: "center", layer: "MOLA-EIXO" },
    { t: "line", a: a0, b: at(a0, 5, u), stroke: "#000", pen: PEN.ground, layer: "MOLA-TEXTO" },
    { t: "line", a: b0, b: at(b0, -5, u), stroke: "#000", pen: PEN.ground, layer: "MOLA-TEXTO" },
  ];
  for (const e of [a0, b0]) {
    const tip = at(e, 5, w);
    const side = (k: number): Pt => at(at(tip, -1.8, w), k, u);
    out.push({ t: "line", a: e, b: tip, stroke: "#000", pen: PEN.part, layer: "MOLA-TEXTO" });
    out.push({ t: "poly", pts: [tip, side(0.9), side(-0.9)], closed: true, fill: "#000", stroke: "#000", pen: PEN.thin, layer: "MOLA-TEXTO" });
    const t = at(at(e, 2.4, w), e === a0 ? -2.6 : 2.6, u);
    out.push(txt([t[0], t[1] + 1], label, 2.8, { bold: true, anchor: "middle" }));
  }
  return out;
}

/**
 * Corte numa vista que olha ao longo da linha dele (vista transversal): o plano do corte aparece de lado, como uma
 * linha vertical, com as pontas grossas, as setas para o lado que se vê e o número.
 */
function cutLineSide(cut: SheetCut, P: Placed, pr: Projector): Prim[] {
  const L = Math.hypot(cut.b[0] - cut.a[0], cut.b[1] - cut.a[1]);
  if (L < 1e-6) return [];
  const u: Vec3 = [(cut.b[0] - cut.a[0]) / L, 0, (cut.b[1] - cut.a[1]) / L];
  if (Math.abs(pr.p(u)[0]) > 1e-3) return []; // a vista não olha ao longo da linha
  const x = P.to([pr.p([cut.a[0], 0, cut.a[1]])[0], 0])[0];
  const look = Math.sign(pr.p([u[2], 0, -u[0]])[0]) || 1; // para onde o corte olha, no papel
  const top = P.box.y0 - 6;
  const bottom = P.to([0, 0])[1] + 5;
  const label = /\d+/.exec(cut.name)?.[0] ?? cut.name;
  const out: Prim[] = [
    { t: "line", a: [x, top], b: [x, bottom], stroke: "#000", pen: PEN.thin, dash: "center", layer: "MOLA-EIXO" },
    { t: "line", a: [x, top], b: [x, top + 5], stroke: "#000", pen: PEN.ground, layer: "MOLA-TEXTO" },
    { t: "line", a: [x, bottom], b: [x, bottom - 5], stroke: "#000", pen: PEN.ground, layer: "MOLA-TEXTO" },
  ];
  for (const y of [top, bottom]) {
    const tip: Pt = [x + 5 * look, y];
    out.push({ t: "line", a: [x, y], b: tip, stroke: "#000", pen: PEN.part, layer: "MOLA-TEXTO" });
    out.push({ t: "poly", pts: [tip, [tip[0] - 1.8 * look, y - 0.9], [tip[0] - 1.8 * look, y + 0.9]], closed: true, fill: "#000", stroke: "#000", pen: PEN.thin, layer: "MOLA-TEXTO" });
    out.push(txt([x + 2.6 * look, y === top ? y - 1.6 : y + 3.8], label, 2.8, { bold: true, anchor: "middle" }));
  }
  return out;
}

function planDrawing(ctx: Ctx, v: SheetView, n: number, sh: SheetShow): { prims: Prim[]; P: Placed } {
  const { cat, model } = ctx.input;
  const W = world(cat);
  const cell = v.cell;
  const levelY = v.level ?? 0;
  const isGround = ctx.levels.length > 0 && Math.abs(ctx.levels[0].y - levelY) < 0.5;
  const items = planItems(cat, model, levelY, isGround, ctx.levels.map((l) => l.y));
  const frames = boardFrames(model, cat);
  const b = bounds([], frames.flat());
  const P = place(b, inner(cell, PLAN_PAD), n);
  const out: Prim[] = [];
  // contorno de cada chapa: grosso no térreo, fino nas outras plantas
  for (const frame of frames) {
    out.push({ t: "poly", pts: frame.map((q) => P.to(q)), closed: true, fill: null, stroke: isGround ? "#000" : GRAY.faint, pen: isGround ? PEN.ground : PEN.thin, layer: "MOLA-BASE" });
  }
  // ligações de base apagadas nas plantas de cima
  if (!isGround) {
    for (const nd of Object.values(model.nodes)) {
      if (nd.kind !== "support") continue;
      const w = W.pos(nd.pos);
      out.push({ t: "circle", c: P.to([w[0], -w[2]]), r: (cat.settings.gc_diametro_mm / 2) * P.s, fill: null, stroke: GRAY.faint, pen: PEN.thin, layer: "MOLA-BASE" });
    }
  }
  // eixos
  const { xs, zs } = axesOf(model, cat);
  if (sh.axes) {
    const top = P.box.y0 - 7;
    const bottom = P.box.y1 + 3;
    const left = P.box.x0 - 7;
    const right = P.box.x1 + 3;
    for (const a of xs) {
      const x = P.to([a.x, 0])[0];
      out.push(axisLine([x, top + 2.4], [x, bottom]), ...bubble([x, top], a.label));
    }
    for (const a of zs) {
      const y = P.to([0, -a.z])[1];
      out.push(axisLine([left + 2.4, y], [right, y]), ...bubble([left, y], a.label));
    }
  }
  out.push(...paint(items, P));
  // cotas entre eixos (em cima e à esquerda, junto das bolinhas) e totais (embaixo e à direita)
  if (sh.dims && xs.length > 1) {
    const px = xs.map((a) => P.to([a.x, 0]));
    const vals = xs.slice(1).map((a, i) => a.x - xs[i].x);
    out.push(...dimChainH(px, P.box.y0 - 3.2, vals));
    // total só quando há mais de um vão (com um só, repetiria o número); texto acima da linha, longe do marcador A
    if (vals.length > 1) out.push(...dimChainH([px[0], px[px.length - 1]], P.box.y1 + 5.5, [xs[xs.length - 1].x - xs[0].x]));
  }
  if (sh.dims && zs.length > 1) {
    const py = zs.map((a) => P.to([0, -a.z])[1]);
    const vals = zs.slice(1).map((a, i) => a.z - zs[i].z);
    out.push(...dimChainV(py, P.box.x0 - 3.2, vals));
    if (vals.length > 1) out.push(...dimChainV([py[0], py[py.length - 1]], P.box.x1 + 4, [zs[zs.length - 1].z - zs[0].z], true));
  }
  // marcadores de vista e linhas de corte
  if (sh.markers) {
    const mx = (P.box.x0 + P.box.x1) / 2;
    const my = (P.box.y0 + P.box.y1) / 2;
    out.push(...viewMarker([mx, P.box.y1 + 11], "up", "A"));
    out.push(...viewMarker([mx, P.box.y0 - 13], "down", "C"));
    out.push(...viewMarker([P.box.x0 - 13, my], "right", "B"));
    out.push(...viewMarker([cell.x + cell.w - 4, my], "left", "D"));
    for (const c of ctx.cuts) out.push(...cutLine(c, P));
  }
  if (sh.labels) out.push(...callouts(items, PLAN_LABELS, P, P.box.x1 + 12, P.box.y0, P.box.y1, labelKey(v), ctx.input.meta.labels));
  return { prims: out, P };
}

/** Vista (A–D) ou corte: projeção de lado com níveis, eixos, cotas de altura e terreno. */
function elevationDrawing(ctx: Ctx, v: SheetView, n: number, sh: SheetShow, pr: Projector, model: Model, axes: { h: number; label: string }[], extra: Item[] = []): Prim[] {
  const { cat } = ctx.input;
  const cell = v.cell;
  const items = [...itemsFor(cat, model, pr), ...extra];
  const b = withGround(bounds(items));
  const P = place(b, inner(cell, ELEV_PAD), n);
  const out: Prim[] = [];
  const x0 = P.box.x0 - 10;
  const x1 = P.box.x1 + 6;
  // níveis
  for (const lv of ctx.levels) {
    const y = P.to([0, lv.y])[1];
    if (sh.axes) {
      out.push(axisLine([x0 - 2, y], [x1, y]));
      out.push(txt([cell.x + 3, y + 0.8], lv.name, 2.3));
    }
    if (sh.dims) out.push(txt([cell.x + 3, y + (sh.axes ? 3.6 : 0.8)], `+${mmText(lv.y)}`, 1.9, { layer: "MOLA-COTA" }));
  }
  // cotas de altura: do topo da chapa a cada nível (à direita da estrutura)
  if (sh.dims) {
    const hs = [0, ...ctx.levels.map((l) => l.y)].filter((h, i, a) => i === 0 || h > a[i - 1] + 0.01);
    const ys = hs.map((h) => P.to([0, h])[1]).reverse();
    const vals = hs.slice(1).map((h, i) => h - hs[i]).reverse();
    out.push(...dimChainV(ys, P.box.x1 + 8, vals, true));
  }
  // eixos
  if (sh.axes) {
    const top = P.box.y0 - 12;
    for (const a of axes) {
      const x = P.to([a.h, 0])[0];
      out.push(axisLine([x, top + 2.4], [x, P.box.y1 + 8]), ...bubble([x, top], a.label));
    }
  }
  // cotas entre eixos (entre as bolinhas e a estrutura) e total (abaixo da chapa)
  const sorted = [...axes].sort((p, q) => p.h - q.h);
  if (sh.dims && sorted.length > 1) {
    const px = sorted.map((a) => P.to([a.h, 0]));
    const vals = sorted.slice(1).map((a, i) => Math.abs(a.h - sorted[i].h));
    out.push(...dimChainH(px, P.box.y0 - 7, vals));
    if (vals.length > 1) out.push(...dimChainH([px[0], px[px.length - 1]], P.to([0, 0])[1] + 6, [Math.abs(sorted[sorted.length - 1].h - sorted[0].h)], true));
  }
  out.push(...paint(items, P));
  // terreno (topo da chapa)
  const gy = P.to([0, 0])[1];
  out.push({ t: "line", a: [x0, gy], b: [x1 + 4, gy], stroke: "#000", pen: PEN.ground, layer: "MOLA-BASE" });
  // cortes vistos de lado (esta vista olha ao longo da linha deles)
  if (sh.markers) for (const c of ctx.cuts) if (c.id !== v.cut) out.push(...cutLineSide(c, P, pr));
  if (sh.labels) out.push(...callouts(items, ELEV_LABELS, P, P.box.x1 + 20, P.box.y0, P.box.y1, labelKey(v), ctx.input.meta.labels));
  return out;
}

function sideAxes(ctx: Ctx, pr: Projector, h: Vec3) {
  const { xs, zs } = axesOf(ctx.input.model, ctx.input.cat);
  if (Math.abs(h[0]) > 0.999) return xs.map((a) => ({ h: pr.p([a.x, 0, 0])[0], label: a.label }));
  if (Math.abs(h[2]) > 0.999) return zs.map((a) => ({ h: pr.p([0, 0, a.z])[0], label: a.label }));
  return [];
}

const SIDE_H: Record<"A" | "B" | "C" | "D", Vec3> = { A: [1, 0, 0], B: [0, 0, 1], C: [-1, 0, 0], D: [0, 0, -1] };

/** Isométrica de cada canto: de que lado de x e de z fica quem olha (A = frente, +z; D = direita, +x). */
const ISO_SIDE: Record<IsoCorner, [number, number]> = { AD: [1, 1], DC: [1, -1], CB: [-1, -1], BA: [-1, 1] };
const isoProj = (c: IsoCorner = "AD") => isoProjector(...ISO_SIDE[c]);

/** Itens e contorno das chapas de uma isométrica (mm reais na projeção). */
function isoParts(cat: Catalog, model: Model, corner?: IsoCorner) {
  const W = world(cat);
  const pr = isoProj(corner);
  const items = itemsFor(cat, model, pr);
  const boards = boardsOf(model).map((bd) => boardCorners(cat, bd).map(([x, z]) => pr.p([x * W.M, 0, z * W.M])).map(([h, v]) => [h, v] as Pt));
  return { pr, items, boards, b: bounds(items, boards.flat()) };
}

const ISO_PAD = { left: 10, right: 44, top: 10, bottom: 22 };

/** Isométrica (sem escala): chapas, peças e as indicações de peças. */
function isoDrawing(ctx: Ctx, v: SheetView, n: number, sh: SheetShow): Prim[] {
  const { cat, model } = ctx.input;
  const { items, boards, b } = isoParts(cat, model, v.iso);
  const P = place(b, inner(v.cell, ISO_PAD), n);
  const out: Prim[] = boards.map((pts) => ({ t: "poly", pts: pts.map((q) => P.to(q)), closed: true, fill: "#f2f2f2", stroke: "#000", pen: PEN.base, layer: "MOLA-BASE" }) as Prim);
  out.push(...paint(items, P));
  if (sh.labels) out.push(...callouts(items, ELEV_LABELS, P, P.box.x1 + 14, P.box.y0, P.box.y1, labelKey(v), ctx.input.meta.labels));
  return out;
}

/** Título e subtítulo padrão de um desenho. */
function defaultTitle(ctx: Ctx, v: SheetView): [string, string] {
  const name = ctx.input.name.toUpperCase();
  if (v.kind === "plan") {
    const lv = ctx.levels.find((l) => Math.abs(l.y - (v.level ?? 0)) < 0.5);
    return lv ? [...lv.planTitle] : ["PLANTA BAIXA", `NÍVEL +${mmText(v.level ?? 0)}`];
  }
  if (v.kind === "cut") return [(ctx.cuts.find((c) => c.id === v.cut)?.name ?? "CORTE").toUpperCase(), name];
  if (v.kind === "iso") return [`ISOMÉTRICA ${(v.iso ?? "AD").split("").join("-")}`, name];
  return [`VISTA - ${v.kind}`, name];
}

/** Título e subtítulo de um desenho, com o que o usuário escreveu por cima do padrão. */
function titlesOf(ctx: Ctx, v: SheetView): [string, string] {
  const [t, s] = defaultTitle(ctx, v);
  const o = ctx.input.meta.views?.[v.id];
  return [o?.title?.trim() ? o.title : t, o?.sub?.trim() ? o.sub : s];
}

/** Nome curto para o carimbo: "PB 1º PAVIMENTO", "VISTA-A", "CORTE 1". */
function entryOf(v: SheetView, title: string, sub: string) {
  const t = title.toUpperCase().trim();
  if (v.kind === "plan") return `${t.replace(/^PLANTA( BAIXA| DE)?(?=\s|$)/, "PB")} ${sub.toUpperCase()}`.trim();
  if (v.kind === "cut") return t;
  if (v.kind === "iso") return t.replace(/^ISOMÉTRICA/, "ISO");
  return t.replace(/\s*-\s*/, "-");
}

/** O que um desenho mostra: o da barra de cima ou, sem "global", o dele. */
const showOf = (meta: SheetMeta, id: string): SheetShow => meta.views?.[id]?.show ?? { ...SHOW_ALL, ...meta.show };

/** Desenho completo de uma vista: o bloco do desenho e o do título (arrastáveis). */
function viewDrawing(ctx: Ctx, v: SheetView, nGlobal: number): { prims: Prim[]; entry: string; n: number; scaled: boolean; P?: Placed } | null {
  const n = v.n ?? nGlobal;
  const sh = showOf(ctx.input.meta, v.id);
  const [title, sub] = titlesOf(ctx, v);
  const { cat, model } = ctx.input;
  let body: Prim[];
  let titleAt: Pt;
  let placed: Placed | undefined;
  if (v.kind === "plan") {
    const d = planDrawing(ctx, v, n, sh);
    body = d.prims;
    placed = d.P;
    titleAt = [v.cell.x + 2, v.cell.y + v.cell.h - 13];
  } else if (v.kind === "cut") {
    const cut = ctx.cuts.find((c) => c.id === v.cut);
    if (!cut) return null;
    const cm = cutModel(cat, model, cut);
    body = elevationDrawing(ctx, v, n, sh, cm.pr, cm.model, sideAxes(ctx, cm.pr, cm.h), cm.sections);
    titleAt = [v.cell.x + ELEV_PAD.left, v.cell.y + v.cell.h - 24];
  } else if (v.kind === "iso") {
    body = isoDrawing(ctx, v, n, sh);
    titleAt = [v.cell.x + 2, v.cell.y + v.cell.h - 13];
  } else {
    const pr = projector(v.kind);
    body = elevationDrawing(ctx, v, n, sh, pr, model, sideAxes(ctx, pr, SIDE_H[v.kind]));
    titleAt = [v.cell.x + ELEV_PAD.left, v.cell.y + v.cell.h - 24];
  }
  return {
    // a isométrica não fica em escala verdadeira (os três eixos encurtam): "SEM ESCALA"
    prims: [...tagged(body, `desenho:${v.id}`), ...tagged(viewTitle(titleAt, title, sub, v.kind === "iso" ? null : n, v.id), `titulo:${v.id}`)],
    entry: entryOf(v, title, sub),
    n,
    scaled: v.kind !== "iso",
    P: placed,
  };
}

// ---------------- cortes ----------------

/**
 * Modelo visto num corte: fica o que está na linha de corte ou atrás dela (do lado para onde se olha).
 * Barras atravessadas pela linha aparecem como a seção cortada (círculo preto).
 */
function cutModel(cat: Catalog, model: Model, cut: SheetCut) {
  const W = world(cat);
  const h: Vec3 = [cut.b[0] - cut.a[0], 0, cut.b[1] - cut.a[1]];
  const pr = cutProjector(h);
  const d = pr.depthAxis;
  const d0 = cut.a[0] * d[0] + cut.a[1] * d[2];
  const off = (w: Vec3) => w[0] * d[0] + w[2] * d[2] - d0; // > 0: entre a linha e quem olha (sai do corte)
  const keepN = new Set(Object.values(model.nodes).filter((nd) => off(W.pos(nd.pos)) <= W.R + 0.5).map((nd) => nd.id));
  const out: Model = { ...model, nodes: {}, members: {}, plates: {}, connectors: {} };
  for (const id of keepN) out.nodes[id] = model.nodes[id];
  const sections: Item[] = [];
  const barD = cat.settings.barra_diametro_mm;
  for (const m of Object.values(model.members)) {
    if (keepN.has(m.a) && keepN.has(m.b)) {
      out.members[m.id] = m;
      continue;
    }
    if (cat.pieces[m.code]?.type !== "bar") continue;
    const a = W.pos(model.nodes[m.a].pos);
    const b = W.pos(model.nodes[m.b].pos);
    const oa = off(a);
    const ob = off(b);
    if (oa * ob >= 0) continue;
    const t = oa / (oa - ob);
    const q: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const [qh, qv, qd] = pr.p(q);
    sections.push({
      depth: qd + 1, order: 6, kind: "bar-h", anchor: [qh, qv],
      draw: (to, k) => [{ t: "circle", c: to([qh, qv]), r: (barD / 2) * k, fill: "#000", stroke: "#000", pen: PEN.part, layer: "MOLA-BARRA" }],
    });
  }
  for (const p of Object.values(model.plates)) if (p.corners.every((c) => keepN.has(c))) out.plates[p.id] = p;
  for (const c of Object.values(model.connectors)) if (keepN.has(c.node)) out.connectors[c.id] = c;
  return { model: out, pr, h, sections };
}

// ---------------- capa ----------------

function coverDrawing(input: SheetInput, n: number): Prim[] {
  const { cat, model, inventory } = input;
  const out: Prim[] = [];
  const W = world(cat);
  // isométrica à esquerda
  const pr = projector("iso");
  const items = itemsFor(cat, model, pr);
  // chapa
  const plates = boardsOf(model).map((bd) => {
    // grade da chapa nos eixos dela (chapa girada: a grade gira junto)
    const loc = (i: number, j: number) => {
      const [wx, wz] = fromBoardLocal(bd, i, j);
      return pr.p([wx * W.M, 0, wz * W.M]);
    };
    return { loc, pts: boardCorners(cat, bd).map(([cx, cz]) => pr.p([cx * W.M, 0, cz * W.M])).map(([h, v]) => [h, v] as Pt) };
  });
  const b = bounds(items, plates.flatMap((p) => p.pts));
  const fs = PG.w < 330 ? 0.8 : 1; // letras um pouco menores na A4
  const isoW = (AREA.x1 - AREA.x0) * 0.58;
  const cell = { x: AREA.x0 + 4, y: AREA.y0 + 26 * fs, w: isoW, h: AREA.y1 - AREA.y0 - 34 * fs };
  const iso: Prim[] = [];
  const img = input.isoImage;
  if (img) {
    // foto renderizada, centrada na área da isométrica
    const w = Math.min(cell.w, cell.h * img.aspect);
    const h = w / img.aspect;
    iso.push({ t: "image", x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h, href: img.url, layer: "MOLA-BASE" });
  }
  const fit = Math.max((b.x1 - b.x0) / cell.w, (b.y1 - b.y0) / cell.h);
  const P = place(b, cell, fit);
  for (const pl of img ? [] : plates) {
    iso.push({ t: "poly", pts: pl.pts.map((q) => P.to(q)), closed: true, fill: "#2b2b2b", stroke: "#000", pen: PEN.part, layer: "MOLA-BASE" });
    const NX = cat.settings.chapa_modulos_x;
    const NZ = cat.settings.chapa_modulos_y;
    for (let i = 0; i <= NX; i += 1) {
      const a = pl.loc(i, 0);
      const c = pl.loc(i, NZ);
      iso.push({ t: "line", a: P.to([a[0], a[1]]), b: P.to([c[0], c[1]]), stroke: "#666", pen: PEN.thin, layer: "MOLA-BASE" });
    }
    for (let j = 0; j <= NZ; j += 1) {
      const a = pl.loc(0, j);
      const c = pl.loc(NX, j);
      iso.push({ t: "line", a: P.to([a[0], a[1]]), b: P.to([c[0], c[1]]), stroke: "#666", pen: PEN.thin, layer: "MOLA-BASE" });
    }
  }
  if (!img) iso.push(...paint(items, P));
  out.push(...tagged(iso, "capa:isometrica"));
  // título
  out.push(...tagged([
    txt([AREA.x0 + 4, AREA.y0 + 10 * fs], input.name.toUpperCase(), 9 * fs, { bold: true }),
    txt([AREA.x0 + 4, AREA.y0 + 17 * fs], `${input.meta.line1}  |  ${input.meta.line2}`, 3 * fs),
  ], "capa:titulo"));

  // painel à direita: dados e lista de peças (tabela grande)
  const px = AREA.x0 + isoW + 14;
  const pr1 = AREA.x1;
  const dados: Prim[] = [];
  let y = AREA.y0 + 12 * fs;
  const H = (arr: Prim[], s: string) => {
    arr.push(txt([px, y], s, 3.4 * fs, { bold: true }));
    arr.push({ t: "line", a: [px, y + 1.8 * fs], b: [pr1, y + 1.8 * fs], stroke: "#000", pen: PEN.part, layer: "MOLA-TEXTO" });
    y += 7.5 * fs;
  };
  const row = (a: string, bTxt: string) => {
    dados.push(txt([px, y], a, 2.6 * fs));
    dados.push(txt([pr1, y], bTxt, 2.6 * fs, { anchor: "end", bold: true }));
    y += 5 * fs;
  };
  const nodes = Object.values(model.nodes).map((nd) => W.pos(nd.pos));
  const span = (k: 0 | 1 | 2) => (nodes.length ? Math.max(...nodes.map((p) => p[k])) - Math.min(...nodes.map((p) => p[k])) : 0);
  const f0 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  H(dados, "DADOS DA ESTRUTURA");
  row("Planta (entre centros)", `${f0(span(0))} × ${f0(span(2))} mm`);
  row("Altura (entre centros)", `${f0(span(1))} mm`);
  row("Níveis", String(levelsOf(model, cat).length));
  row("Escala das plantas e vistas", fmtScale(n));
  row("Módulo", `${cat.settings.modulo_mm.toLocaleString("pt-BR")} mm`);
  out.push(...tagged(dados, "capa:dados"));

  // tabela: faixa de cabeçalho, linhas zebradas, quantidades em destaque, total em faixa escura
  y += 5 * fs;
  const tab: Prim[] = [];
  H(tab, "LISTA DE PEÇAS");
  const used = usage(model, cat);
  const codes = Object.keys(used).sort();
  const plan = ropePlan(cat, model);
  const rowH = 7 * fs;
  const colCode = px + 2;
  const colName = px + 20 * fs;
  const colUsed = pr1 - 30 * fs;
  const colStock = pr1 - 2;
  const top = y - 2;
  const rect = (y0: number, h: number, fill: string): Prim => ({ t: "poly", pts: [[px, y0], [pr1, y0], [pr1, y0 + h], [px, y0 + h]], closed: true, fill, stroke: null, layer: "MOLA-TEXTO" });
  tab.push(rect(top, rowH, "#e3e3e3"));
  const mid = (y0: number) => y0 + rowH / 2 + 1.1 * fs;
  tab.push(txt([colCode, mid(top)], "CÓDIGO", 2.5 * fs, { bold: true }));
  tab.push(txt([colName, mid(top)], "PEÇA", 2.5 * fs, { bold: true }));
  tab.push(txt([colUsed, mid(top)], "USADAS", 2.5 * fs, { bold: true, anchor: "end" }));
  tab.push(txt([colStock, mid(top)], "NO ESTOQUE", 2.5 * fs, { bold: true, anchor: "end" }));
  let yy = top + rowH;
  let total = 0;
  codes.forEach((code, i) => {
    const p = cat.pieces[code];
    const stock = Object.entries(inventory.kits).reduce((s2, [k, cnt]) => s2 + (cat.kits[k]?.pieces[code] ?? 0) * cnt, 0);
    // cabo: conta os pedaços; o nome traz o total em cm e bolinhas
    const rope = code === "CABLE";
    const qty = rope ? plan.cuts.length : used[code];
    total += qty;
    if (i % 2) tab.push(rect(yy, rowH, "#f3f3f3"));
    tab.push(txt([colCode, mid(yy)], code, 3.2 * fs, { bold: true }));
    const cm = (mm: number) => (mm / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    tab.push(txt([colName, mid(yy)], rope ? `Cabo: ${cm(plan.mm)} cm | ${plan.balls} bolinhas` : p?.name.replace(` ${code}`, "") ?? code, 3 * fs));
    tab.push(txt([colUsed, mid(yy) + 0.3], String(qty), 4 * fs, { anchor: "end", bold: true }));
    tab.push(txt([colStock, mid(yy)], inventory.unlimited ? "∞" : rope ? `${stock} rolo${stock === 1 ? "" : "s"}` : String(stock), 3 * fs, { anchor: "end", fill: "#555" }));
    yy += rowH;
  });
  tab.push(rect(yy, rowH * 1.15, "#1d1d1d"));
  tab.push(txt([colCode, mid(yy) + 0.5], "TOTAL DE PEÇAS", 3.2 * fs, { bold: true, fill: "#fff" }));
  tab.push(txt([colUsed, mid(yy) + 0.8], String(total), 4.4 * fs, { anchor: "end", bold: true, fill: "#fff" }));
  yy += rowH * 1.15;
  tab.push({ t: "poly", pts: [[px, top], [pr1, top], [pr1, yy], [px, yy]], closed: true, fill: null, stroke: "#000", pen: PEN.part, layer: "MOLA-TEXTO" });
  for (const x of [colName - 2, colUsed - 16 * fs, colUsed + 3]) tab.push({ t: "line", a: [x, top], b: [x, yy - rowH * 1.15], stroke: "#bdbdbd", pen: PEN.thin, layer: "MOLA-TEXTO" });
  yy += 7 * fs;
  const kitTxt = inventory.unlimited
    ? "Sem limite de peças"
    : Object.entries(inventory.kits).filter(([, c]) => c > 0).map(([k, c]) => `${c}× ${cat.kits[k]?.name ?? `Kit ${k}`}`).join("; ");
  tab.push(txt([px, yy], `Kits: ${kitTxt || "—"}`, 2.5 * fs));
  // cortes do cabo: o que tirar de cada rolo (maiores primeiro)
  if (plan.cuts.length) {
    const order = new Map(plan.cuts.map((c, i) => [c.id, i + 1]));
    plan.rolls.forEach((r, i) => {
      yy += 4.2 * fs;
      const list = r.map((c) => `${order.get(c.id)}) ${c.balls}`).join(" · ");
      tab.push(txt([px, yy], `Cortes do cabo, rolo ${i + 1} (bolinhas): ${list}`, 2.5 * fs));
    });
  }
  out.push(...tagged(tab, "capa:tabela"));
  const d = input.date ?? new Date();
  out.push(txt([px, AREA.y1 - 2], `Gerado pelo siMOLAdor em ${d.toLocaleDateString("pt-BR")}`, 2 * fs, { fill: "#555" }));
  return out;
}

// ---------------- arranjo ----------------

/** Arranjo automático: plantas por pavimento (2×2 por folha) e vistas A–D (2 por folha), como no Desafio 2022. */
function autoLayout(ctx: Ctx): SheetLayout {
  const views: SheetView[] = [];
  let page = 0;
  const pc = planCells();
  ctx.levels.forEach((lv, i) => {
    views.push({ id: lv.planTitle.join(" "), kind: "plan", level: lv.y, page: page + Math.floor(i / pc.length), cell: pc[i % pc.length] });
  });
  page += Math.ceil(ctx.levels.length / pc.length);
  const ec = elevCells();
  (["A", "B", "C", "D"] as const).forEach((k, i) => {
    views.push({ id: `vista ${k}`, kind: k, page: page + Math.floor(i / ec.length), cell: ec[i % ec.length] });
  });
  page += Math.ceil(4 / ec.length);
  return { pages: page, views };
}

/** Desenho na tela: o que o painel lateral precisa saber dele. */
export interface ViewInfo {
  view: SheetView;
  /** folha (0 = capa) */
  sheet: number;
  title: string;
  sub: string;
  entry: string;
  n: number;
  /** segue a barra de cima (global) */
  global: boolean;
  show: SheetShow;
  /** planta: ponto da folha (mm de papel) → ponto do mundo [x, z] (mm), já com o desenho arrastado */
  toWorld?: (p: Pt) => [number, number];
}

export interface BuiltSheets {
  sheets: Sheet[];
  /** escala geral (n de 1:n) */
  scale: number;
  /** arranjo em uso (o mexido pelo usuário ou o automático) */
  layout: SheetLayout;
  /** o arranjo foi mexido pelo usuário */
  manual: boolean;
  views: ViewInfo[];
  paper: PaperName;
  size: { w: number; h: number };
}

/** Monta todas as folhas. */
export function buildSheets(input: SheetInput): BuiltSheets {
  setPaper(input.meta);
  const n = computeScale(input);
  const ctx: Ctx = { input, levels: levelsOf(input.model, input.cat), cuts: input.meta.cuts ?? [] };
  const saved = input.meta.layouts?.[PAPER_NAME];
  const layout = saved ?? autoLayout(ctx);
  const pages: { title: string; prims: Prim[]; entries: string[]; scales: number[] }[] = [];
  pages.push({ title: "Capa", prims: coverDrawing(input, n), entries: ["ISOMÉTRICA", "LISTA DE PEÇAS"], scales: [] });
  const views: ViewInfo[] = [];
  for (let p = 0; p < layout.pages; p++) {
    const page = { title: "", prims: [] as Prim[], entries: [] as string[], scales: [] as number[] };
    for (const v of layout.views) {
      if (Math.min(v.page, layout.pages - 1) !== p) continue;
      const d = viewDrawing(ctx, v, n);
      if (!d) continue;
      page.prims.push(...d.prims);
      page.entries.push(d.entry);
      if (d.scaled) page.scales.push(d.n);
      const [title, sub] = titlesOf(ctx, v);
      const o = input.meta.views?.[v.id];
      const P = d.P;
      const off = input.meta.blocks?.[`${PAPER_NAME}|desenho:${v.id}`] ?? [0, 0];
      // inverso de place(): papel → planta (h = x, v = −z)
      const toWorld = P
        ? (q: Pt): [number, number] => {
            const c = P.to([0, 0]);
            return [(q[0] - off[0] - c[0]) / P.s, (q[1] - off[1] - c[1]) / P.s];
          }
        : undefined;
      views.push({ view: v, sheet: p + 1, title, sub, entry: d.entry, n: d.n, global: !o?.show, show: showOf(input.meta, v.id), toWorld });
    }
    page.title = page.entries.join(" · ") || "Prancha vazia";
    pages.push(page);
  }
  const total = pages.length;
  // blocos arrastados na tela (por tamanho de folha)
  const moved = input.meta.blocks ?? {};
  const sheets = pages.map((p, i) => ({
    number: i + 1,
    total,
    title: p.title,
    paper: PAPER_NAME,
    size: { ...PG },
    prims: [
      ...p.prims.map((q) => {
        const off = q.group ? moved[`${PAPER_NAME}|${q.group}`] : undefined;
        return off ? movePrim(q, off[0], off[1]) : q;
      }),
      ...(p.scales.length ? scaleBars(p.scales) : []),
      ...titleBlock(input, { number: i + 1, total, entries: p.entries, scales: p.scales }),
    ],
  }));
  return { sheets, scale: n, layout, manual: !!saved, views, paper: PAPER_NAME, size: { ...PG } };
}

/** O que inserir: planta de um pavimento, vista A–D ou corte. */
export type ViewSpec =
  | { kind: "plan"; level: number }
  | { kind: "A" | "B" | "C" | "D" }
  | { kind: "cut"; cut: string }
  | { kind: "iso"; iso: IsoCorner };

/** Quadro de um desenho novo com o centro em `at` (mm de papel), na escala 1:n. */
export function newViewCell(input: SheetInput, spec: ViewSpec, n: number, at: Pt): Cell {
  return newViewFrame(input, spec, n, at).cell;
}

/** Quadro de um desenho novo e a área que o desenho em si ocupa (sem as margens de cotas, eixos e título). */
export function newViewFrame(input: SheetInput, spec: ViewSpec, n: number, at: Pt): { cell: Cell; body: Cell } {
  const { cat, model } = input;
  let b: ReturnType<typeof bounds>;
  if (spec.kind === "plan") b = bounds([], boardFrames(model, cat).flat());
  else if (spec.kind === "cut") {
    const cut = (input.meta.cuts ?? []).find((c) => c.id === spec.cut);
    const cm = cut ? cutModel(cat, model, cut) : null;
    b = withGround(bounds(cm ? [...itemsFor(cat, cm.model, cm.pr), ...cm.sections] : []));
  } else if (spec.kind === "iso") b = isoParts(cat, model, spec.iso).b;
  else b = withGround(bounds(itemsFor(cat, model, projector(spec.kind))));
  const pad = spec.kind === "plan" ? PLAN_PAD : spec.kind === "iso" ? ISO_PAD : ELEV_PAD;
  const w = (b.x1 - b.x0) / n;
  const h = (b.y1 - b.y0) / n;
  const m = 4; // folga em volta
  return {
    cell: { x: at[0] - w / 2 - pad.left - m, y: at[1] - h / 2 - pad.top - m, w: w + pad.left + pad.right + 2 * m, h: h + pad.top + pad.bottom + 2 * m },
    body: { x: at[0] - w / 2, y: at[1] - h / 2, w, h },
  };
}
