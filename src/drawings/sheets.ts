// Conjunto de pranchas (A3 ou A4) no padrão do Desafio Poli-USP 2022 (docs/plano-simolador.md, seção 6b):
// P_01 capa (isométrica + lista de peças) · P_02… plantas por pavimento (2×2 por folha) · vistas A e B · vistas C e D.
import type { Catalog } from "../core/catalog";
import type { InventoryConfig } from "../core/inventory";
import { usage } from "../core/inventory";
import { boardsOf, type Model } from "../core/model";
import type { SheetMeta } from "../core/serialization";
import { GRAY, PAPER, PEN, movePrim, type PaperName, type Prim, type Pt, type Sheet } from "./prims";
import { bounds, itemsFor, projector, world, type Item, type ViewId } from "./views";

export interface SheetInput {
  cat: Catalog;
  model: Model;
  inventory: InventoryConfig;
  name: string;
  meta: SheetMeta;
  scale?: number | "auto"; // n de 1:n
  date?: Date;
  /** foto isométrica renderizada para a capa; sem ela, a capa usa o desenho em linhas */
  isoImage?: { url: string; aspect: number } | null;
  /** tamanho da folha (padrão: A3) */
  paper?: PaperName;
  /** cotas (entre eixos, totais, alturas e cota dos níveis); padrão: ligadas */
  dims?: boolean;
  /** logos do carimbo (Mola e equipe), lado a lado no canto inferior esquerdo; sem elas, o hexágono */
  logos?: { url: string; aspect: number }[];
}

const SCALES = [1, 2, 2.5, 5, 10, 20];
const MARGIN = 10;
const TB_H = 16; // altura do carimbo
// folha atual (definida no começo de buildSheets)
let PAPER_NAME: PaperName = "A3";
let PG = PAPER.A3;
let AREA = { x0: MARGIN, y0: MARGIN, x1: PG.w - MARGIN, y1: PG.h - MARGIN - TB_H - 4 };
function setPaper(name: PaperName) {
  PAPER_NAME = name;
  PG = PAPER[name];
  AREA = { x0: MARGIN, y0: MARGIN, x1: PG.w - MARGIN, y1: PG.h - MARGIN - TB_H - 4 };
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
  "plate-v": "PAREDE",
  "plate-h": "LAJE",
};
const PLAN_LABELS: Item["kind"][] = ["base", "rc90", "cable", "plate-h", "plate-v", "cc"];
const ELEV_LABELS: Item["kind"][] = ["cable", "bar-v", "node", "rc90", "cc", "base", "plate-v"];

const fmtScale = (n: number) => `1/${String(n).replace(".", ",")}`;
const letters = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`);

// ---------------- níveis e eixos ----------------

export function levelsOf(model: Model, cat: Catalog) {
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
  const PW = cat.settings.chapa_modulos_x * W.M;
  const PD = cat.settings.chapa_modulos_y * W.M;
  return boardsOf(model).map((b) => {
    const x = b.x * W.M;
    const z = b.z * W.M;
    return [[x, -z], [x + PW, -z], [x + PW, -z - PD], [x, -z - PD]] as Pt[];
  });
}

function axesOf(model: Model, cat: Catalog) {
  const W = world(cat);
  const uniq = (arr: number[]) => [...new Set(arr.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  const xs = uniq(Object.values(model.nodes).map((n) => W.pos(n.pos)[0]));
  const zs = uniq(Object.values(model.nodes).map((n) => W.pos(n.pos)[2]));
  return { xs: xs.map((x, i) => ({ x, label: letters(i) })), zs: zs.map((z, i) => ({ z, label: String(i + 1) })) };
}

// ---------------- encaixe de uma vista numa célula ----------------

interface Placed {
  to: (q: [number, number]) => Pt;
  s: number; // escala (papel/real)
  box: { x0: number; x1: number; y0: number; y1: number }; // limites em papel
}

/** Centraliza os limites (mm reais) dentro da célula (mm papel). */
function place(b: ReturnType<typeof bounds>, cell: { x: number; y: number; w: number; h: number }, n: number): Placed {
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

function viewTitle(at: Pt, title: string, sub: string, n: number): Prim[] {
  return [
    txt(at, title, 4.4, { bold: true }),
    txt([at[0], at[1] + 5.2], sub, 3.3),
    txt([at[0], at[1] + 9.4], `ESCALA: ${fmtScale(n)}`, 2.3),
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

// ---------------- carimbo ----------------

function titleBlock(input: SheetInput, n: number, number: number, total: number, title: string): Prim[] {
  const y0 = PG.h - MARGIN - TB_H;
  const y1 = PG.h - MARGIN;
  const ym = (y0 + y1) / 2;
  const kc = (PG.w - 2 * MARGIN) / (PAPER.A3.w - 2 * MARGIN);
  const cols = [MARGIN, ...[46, 118, 176, 252, 330].map((x) => MARGIN + (x - MARGIN) * kc), PG.w - MARGIN];
  const out: Prim[] = [
    { t: "poly", pts: [[MARGIN, y0], [PG.w - MARGIN, y0], [PG.w - MARGIN, y1], [MARGIN, y1]], closed: true, fill: null, stroke: "#000", pen: PEN.frame, layer: "MOLA-CARIMBO" },
  ];
  for (const x of cols.slice(1, -1)) out.push({ t: "line", a: [x, y0], b: [x, y1], stroke: "#000", pen: PEN.part, layer: "MOLA-CARIMBO" });
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
  const T = (p: Pt, s: string, size: number, bold = false, anchor: "start" | "middle" | "end" = "start") =>
    txt(p, s, size, { bold, anchor, layer: "MOLA-CARIMBO" });
  out.push(T([cols[1] + 4, ym - 1.8], input.meta.line1, 2.1));
  out.push(T([cols[1] + 4, ym + 3.6], input.meta.line2, 2.1));
  out.push(T([cols[2] + 4, ym - 1.8], `ESCALA: ${fmtScale(n)}`, 2.1));
  out.push(T([cols[2] + 4, ym + 3.6], "MEDIDAS EM MILÍMETRO (mm)", 2.1));
  // escala gráfica (gerada pela escala real da folha)
  const real = niceLength(50 * n * kc);
  const len = real / n;
  const gx = cols[3] + (cols[4] - cols[3] - len) / 2;
  const gy = ym + 1.5;
  for (let i = 0; i < 4; i++) {
    const a = gx + (len * i) / 4;
    out.push({
      t: "poly", pts: [[a, gy - 0.9], [a + len / 4, gy - 0.9], [a + len / 4, gy], [a, gy]], closed: true,
      fill: i % 2 ? "#fff" : "#000", stroke: "#000", pen: PEN.thin, layer: "MOLA-CARIMBO",
    });
  }
  for (const i of [0, 2, 4]) out.push(T([gx + (len * i) / 4, gy - 2.4], String((real * i) / 4).replace(".", ","), 1.8, false, "middle"));
  out.push(T([gx + len + 1.5, gy - 0.1], "mm", 1.8));
  out.push(T([cols[4] + 4, ym - 3], "DESENHO:", 1.9));
  out.push(T([cols[4] + 8, ym + 3.8], input.name.toUpperCase(), 3.4, true));
  out.push(T([cols[5] + 10, ym + 1], title.toUpperCase(), 2.4));
  out.push(T([cols[6] - 4, ym + 2.6], `P_${String(number).padStart(2, "0")}/${String(total).padStart(2, "0")}`, 6.5, true, "end"));
  out.push(T([MARGIN, PG.h - 4], `FORMATO ${PAPER_NAME}`, 1.8));
  return out;
}

function niceLength(target: number) {
  const steps = [20, 40, 50, 100, 200, 250, 400, 500, 1000, 2000, 5000];
  return steps.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), steps[0]);
}

// ---------------- folhas ----------------

function planCells() {
  // A3: quatro plantas por folha; A4: uma por folha (para manter a escala)
  if (PAPER_NAME === "A4") return [{ x: AREA.x0, y: AREA.y0, w: AREA.x1 - AREA.x0, h: AREA.y1 - AREA.y0 }];
  const w = (AREA.x1 - AREA.x0) / 2;
  const h = (AREA.y1 - AREA.y0) / 2;
  return [0, 1, 2, 3].map((i) => ({ x: AREA.x0 + (i % 2) * w, y: AREA.y0 + Math.floor(i / 2) * h, w, h }));
}
function elevCells() {
  // A3: duas vistas por folha; A4: uma por folha
  const k = PAPER_NAME === "A4" ? 1 : 2;
  const w = (AREA.x1 - AREA.x0) / k;
  return Array.from({ length: k }, (_, i) => ({ x: AREA.x0 + i * w, y: AREA.y0, w, h: AREA.y1 - AREA.y0 }));
}

// espaço reservado dentro de cada célula (mm de papel)
const PLAN_PAD = { left: 14, right: 44, top: 14, bottom: 22 };
const ELEV_PAD = { left: 34, right: 52, top: 22, bottom: 34 };

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
    if (it.kind === "bar-v" || it.kind === "cable") return it.top !== undefined && Math.abs((it.top ?? 0) - (it.level ?? 0)) > 0.5 ? arrival(it.top) : near(it.level);
    if (it.kind === "plate-v") return near(it.level);
    if (it.kind === "rc90" || it.kind === "cc") return near(it.level);
    return false;
  });
}

/** Inclui o topo da chapa (v = 0) nos limites de uma vista. */
const withGround = (b: ReturnType<typeof bounds>) => ({ ...b, y0: Math.min(b.y0, 0) });

function computeScale(input: SheetInput): number {
  const fixed = input.scale ?? input.cat.settings.prancha_escala;
  if (typeof fixed === "number" && fixed > 0) return fixed;
  const { cat, model } = input;
  const W = world(cat);
  void W;
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

function inner(cell: { x: number; y: number; w: number; h: number }, pad: typeof PLAN_PAD) {
  return { x: cell.x + pad.left, y: cell.y + pad.top, w: cell.w - pad.left - pad.right, h: cell.h - pad.top - pad.bottom };
}

function planDrawing(input: SheetInput, n: number, lv: ReturnType<typeof levelsOf>[number], isGround: boolean, cell: ReturnType<typeof planCells>[number]): Prim[] {
  const { cat, model } = input;
  const W = world(cat);
  const items = planItems(cat, model, lv.y, isGround, levelsOf(model, cat).map((l) => l.y));
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
  out.push(...paint(items, P));
  // cotas entre eixos (em cima e à esquerda, junto das bolinhas) e totais (embaixo e à direita)
  if (input.dims !== false && xs.length > 1) {
    const px = xs.map((a) => P.to([a.x, 0]));
    const vals = xs.slice(1).map((a, i) => a.x - xs[i].x);
    out.push(...dimChainH(px, P.box.y0 - 3.2, vals));
    // total só quando há mais de um vão (com um só, repetiria o número); texto acima da linha, longe do marcador A
    if (vals.length > 1) out.push(...dimChainH([px[0], px[px.length - 1]], P.box.y1 + 5.5, [xs[xs.length - 1].x - xs[0].x]));
  }
  if (input.dims !== false && zs.length > 1) {
    const py = zs.map((a) => P.to([0, -a.z])[1]);
    const vals = zs.slice(1).map((a, i) => a.z - zs[i].z);
    out.push(...dimChainV(py, P.box.x0 - 3.2, vals));
    if (vals.length > 1) out.push(...dimChainV([py[0], py[py.length - 1]], P.box.x1 + 4, [zs[zs.length - 1].z - zs[0].z], true));
  }
  // marcadores de vista
  const mx = (P.box.x0 + P.box.x1) / 2;
  const my = (P.box.y0 + P.box.y1) / 2;
  out.push(...viewMarker([mx, P.box.y1 + 11], "up", "A"));
  out.push(...viewMarker([mx, P.box.y0 - 13], "down", "C"));
  out.push(...viewMarker([P.box.x0 - 13, my], "right", "B"));
  out.push(...viewMarker([cell.x + cell.w - 4, my], "left", "D"));
  out.push(...callouts(items, PLAN_LABELS, P, P.box.x1 + 12, P.box.y0, P.box.y1, `planta ${lv.planTitle.join(" ")}`, input.meta.labels));
  const key = lv.planTitle.join(" ");
  const title = viewTitle([cell.x + 2, cell.y + cell.h - 13], lv.planTitle[0], lv.planTitle[1], n);
  return [...tagged(out, `desenho:${key}`), ...tagged(title, `titulo:${key}`)];
}

function elevationDrawing(input: SheetInput, n: number, view: ViewId, cell: ReturnType<typeof elevCells>[number]): Prim[] {
  const { cat, model } = input;
  const pr = projector(view);
  const items = itemsFor(cat, model, pr);
  const b = withGround(bounds(items));
  const P = place(b, inner(cell, ELEV_PAD), n);
  const out: Prim[] = [];
  const x0 = P.box.x0 - 10;
  const x1 = P.box.x1 + 6;
  // níveis
  const levels = levelsOf(model, cat);
  for (const lv of levels) {
    const y = P.to([0, lv.y])[1];
    out.push(axisLine([x0 - 2, y], [x1, y]));
    out.push(txt([cell.x + 3, y + 0.8], lv.name, 2.3));
    if (input.dims !== false) out.push(txt([cell.x + 3, y + 3.6], `+${mmText(lv.y)}`, 1.9, { layer: "MOLA-COTA" }));
  }
  // cotas de altura: do topo da chapa a cada nível (à direita da estrutura)
  if (input.dims !== false) {
    const hs = [0, ...levels.map((l) => l.y)].filter((v, i, a) => i === 0 || v > a[i - 1] + 0.01);
    const ys = hs.map((h) => P.to([0, h])[1]).reverse();
    const vals = hs.slice(1).map((h, i) => h - hs[i]).reverse();
    out.push(...dimChainV(ys, P.box.x1 + 8, vals, true));
  }
  // eixos
  const { xs, zs } = axesOf(model, cat);
  const axes = view === "A" || view === "C" ? xs.map((a) => ({ h: pr.p([a.x, 0, 0])[0], label: a.label })) : zs.map((a) => ({ h: pr.p([0, 0, a.z])[0], label: a.label }));
  const top = P.box.y0 - 12;
  for (const a of axes) {
    const x = P.to([a.h, 0])[0];
    out.push(axisLine([x, top + 2.4], [x, P.box.y1 + 8]), ...bubble([x, top], a.label));
  }
  // cotas entre eixos (entre as bolinhas e a estrutura) e total (abaixo da chapa)
  const sorted = [...axes].sort((p, q) => P.to([p.h, 0])[0] - P.to([q.h, 0])[0]);
  if (input.dims !== false && sorted.length > 1) {
    const px = sorted.map((a) => P.to([a.h, 0]));
    const vals = sorted.slice(1).map((a, i) => Math.abs(a.h - sorted[i].h));
    out.push(...dimChainH(px, P.box.y0 - 7, vals));
    if (vals.length > 1) out.push(...dimChainH([px[0], px[px.length - 1]], P.to([0, 0])[1] + 6, [Math.abs(sorted[sorted.length - 1].h - sorted[0].h)], true));
  }
  out.push(...paint(items, P));
  // terreno (topo da chapa)
  const gy = P.to([0, 0])[1];
  out.push({ t: "line", a: [x0, gy], b: [x1 + 4, gy], stroke: "#000", pen: PEN.ground, layer: "MOLA-BASE" });
  out.push(...callouts(items, ELEV_LABELS, P, P.box.x1 + 20, P.box.y0, P.box.y1, `vista ${view}`, input.meta.labels));
  const title = viewTitle([cell.x + ELEV_PAD.left, cell.y + cell.h - 24], `VISTA - ${view}`, input.name.toUpperCase(), n);
  return [...tagged(out, `desenho:vista ${view}`), ...tagged(title, `titulo:vista ${view}`)];
}

function coverDrawing(input: SheetInput, n: number): Prim[] {
  const { cat, model, inventory } = input;
  const out: Prim[] = [];
  const W = world(cat);
  // isométrica à esquerda
  const pr = projector("iso");
  const items = itemsFor(cat, model, pr);
  // chapa
  const PW = cat.settings.chapa_modulos_x * W.M;
  const PD = cat.settings.chapa_modulos_y * W.M;
  const plates = boardsOf(model).map((bd) => {
    const x = bd.x * W.M;
    const z = bd.z * W.M;
    return { x, z, pts: [[x, 0, z], [x + PW, 0, z], [x + PW, 0, z + PD], [x, 0, z + PD]].map((w) => pr.p(w as [number, number, number])).map(([h, v]) => [h, v] as Pt) };
  });
  const b = bounds(items, plates.flatMap((p) => p.pts));
  const fs = PAPER_NAME === "A4" ? 0.8 : 1; // letras um pouco menores na A4
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
    for (let i = 0; i <= cat.settings.chapa_modulos_x; i += 1) {
      const a = pr.p([pl.x + i * W.M, 0, pl.z]);
      const c = pr.p([pl.x + i * W.M, 0, pl.z + PD]);
      iso.push({ t: "line", a: P.to([a[0], a[1]]), b: P.to([c[0], c[1]]), stroke: "#666", pen: PEN.thin, layer: "MOLA-BASE" });
    }
    for (let j = 0; j <= cat.settings.chapa_modulos_y; j += 1) {
      const a = pr.p([pl.x, 0, pl.z + j * W.M]);
      const c = pr.p([pl.x + PW, 0, pl.z + j * W.M]);
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
  const pr1 = PG.w - MARGIN;
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
  const used = usage(model);
  const codes = Object.keys(used).sort();
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
    total += used[code];
    if (i % 2) tab.push(rect(yy, rowH, "#f3f3f3"));
    tab.push(txt([colCode, mid(yy)], code, 3.2 * fs, { bold: true }));
    tab.push(txt([colName, mid(yy)], p?.name.replace(` ${code}`, "") ?? code, 3 * fs));
    tab.push(txt([colUsed, mid(yy) + 0.3], String(used[code]), 4 * fs, { anchor: "end", bold: true }));
    tab.push(txt([colStock, mid(yy)], inventory.unlimited ? "∞" : String(stock), 3 * fs, { anchor: "end", fill: "#555" }));
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
  out.push(...tagged(tab, "capa:tabela"));
  const d = input.date ?? new Date();
  out.push(txt([px, AREA.y1 - 2], `Gerado pelo siMOLAdor em ${d.toLocaleDateString("pt-BR")}`, 2 * fs, { fill: "#555" }));
  return out;
}

/** Monta todas as folhas. */
export function buildSheets(input: SheetInput): { sheets: Sheet[]; scale: number } {
  setPaper(input.paper ?? "A3");
  const n = computeScale(input);
  const levels = levelsOf(input.model, input.cat);
  const pages: { title: string; prims: Prim[] }[] = [];
  pages.push({ title: "Capa", prims: coverDrawing(input, n) });
  const cells = planCells();
  for (let i = 0; i < Math.max(1, levels.length); i += cells.length) {
    const prims = levels.slice(i, i + cells.length).flatMap((lv, k) => planDrawing(input, n, lv, i + k === 0, cells[k]));
    pages.push({ title: "Plantas", prims });
  }
  const ec = elevCells();
  const views: ViewId[] = ["A", "B", "C", "D"];
  for (let i = 0; i < views.length; i += ec.length) {
    const vs = views.slice(i, i + ec.length);
    pages.push({ title: vs.length > 1 ? `Vistas ${vs.join(" e ")}` : `Vista ${vs[0]}`, prims: vs.flatMap((v, k) => elevationDrawing(input, n, v, ec[k])) });
  }
  const total = pages.length;
  // blocos arrastados na tela (por folha A3/A4)
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
      ...titleBlock(input, n, i + 1, total, p.title),
    ],
  }));
  return { sheets, scale: n };
}
