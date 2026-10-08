// Conjunto de pranchas A3 no padrão do Desafio Poli-USP 2022 (docs/plano-simolador.md, seção 6b):
// P_01 capa (isométrica + lista de peças) · P_02… plantas por pavimento (2×2 por folha) · vistas A e B · vistas C e D.
import type { Catalog } from "../core/catalog";
import type { InventoryConfig } from "../core/inventory";
import { usage } from "../core/inventory";
import type { Model } from "../core/model";
import type { SheetMeta } from "../core/serialization";
import { A3, GRAY, PEN, type Prim, type Pt, type Sheet } from "./prims";
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
}

const SCALES = [1, 2, 2.5, 5, 10, 20];
const MARGIN = 10;
const TB_H = 16; // altura do carimbo
const AREA = { x0: MARGIN, y0: MARGIN, x1: A3.w - MARGIN, y1: A3.h - MARGIN - TB_H - 4 };

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

/** Chamadas: uma por tipo de peça, com linha até a coluna de textos à direita. */
function callouts(items: Item[], kinds: Item["kind"][], P: Placed, colX: number, yMin: number, yMax: number): Prim[] {
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
    const y = ys[i];
    const elbow: Pt = [colX - 8, y];
    out.push({ t: "line", a: p.at, b: elbow, stroke: "#000", pen: PEN.thin, layer: "MOLA-TEXTO" });
    out.push({ t: "line", a: elbow, b: [colX, y], stroke: "#000", pen: PEN.thin, layer: "MOLA-TEXTO" });
    out.push({ t: "circle", c: p.at, r: 0.45, fill: "#000", stroke: null, layer: "MOLA-TEXTO" });
    out.push(txt([colX + 1.5, y + 0.8], p.label, 2.2, { bold: true }));
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
  const y0 = A3.h - MARGIN - TB_H;
  const y1 = A3.h - MARGIN;
  const ym = (y0 + y1) / 2;
  const cols = [MARGIN, 26, 104, 170, 252, 330, A3.w - MARGIN];
  const out: Prim[] = [
    { t: "poly", pts: [[MARGIN, y0], [A3.w - MARGIN, y0], [A3.w - MARGIN, y1], [MARGIN, y1]], closed: true, fill: null, stroke: "#000", pen: PEN.frame, layer: "MOLA-CARIMBO" },
  ];
  for (const x of cols.slice(1, -1)) out.push({ t: "line", a: [x, y0], b: [x, y1], stroke: "#000", pen: PEN.part, layer: "MOLA-CARIMBO" });
  // logo da equipe (marca provisória: hexágono com diagonais; trocar por assets/logo/logo.svg)
  const c: Pt = [(cols[0] + cols[1]) / 2, ym];
  const hex: Pt[] = Array.from({ length: 6 }, (_, i) => [c[0] + 5 * Math.sin((i * Math.PI) / 3), c[1] - 5 * Math.cos((i * Math.PI) / 3)]);
  out.push({ t: "poly", pts: hex, closed: true, fill: null, stroke: "#000", pen: PEN.base, layer: "MOLA-CARIMBO" });
  out.push({ t: "line", a: hex[0], b: hex[3], stroke: "#000", pen: PEN.part, layer: "MOLA-CARIMBO" });
  out.push({ t: "line", a: hex[1], b: hex[4], stroke: "#000", pen: PEN.part, layer: "MOLA-CARIMBO" });
  out.push({ t: "line", a: hex[2], b: hex[5], stroke: "#000", pen: PEN.part, layer: "MOLA-CARIMBO" });
  const T = (p: Pt, s: string, size: number, bold = false, anchor: "start" | "middle" | "end" = "start") =>
    txt(p, s, size, { bold, anchor, layer: "MOLA-CARIMBO" });
  out.push(T([cols[1] + 4, ym - 1.8], input.meta.line1, 2.1));
  out.push(T([cols[1] + 4, ym + 3.6], input.meta.line2, 2.1));
  out.push(T([cols[2] + 4, ym - 1.8], `ESCALA: ${fmtScale(n)}`, 2.1));
  out.push(T([cols[2] + 4, ym + 3.6], "MEDIDAS EM MILÍMETRO (mm)", 2.1));
  // escala gráfica (gerada pela escala real da folha)
  const real = niceLength(50 * n);
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
  out.push(T([MARGIN, A3.h - 4], "FORMATO A3", 1.8));
  return out;
}

function niceLength(target: number) {
  const steps = [20, 40, 50, 100, 200, 250, 400, 500, 1000, 2000, 5000];
  return steps.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), steps[0]);
}

// ---------------- folhas ----------------

function planCells() {
  const w = (AREA.x1 - AREA.x0) / 2;
  const h = (AREA.y1 - AREA.y0) / 2;
  return [0, 1, 2, 3].map((i) => ({ x: AREA.x0 + (i % 2) * w, y: AREA.y0 + Math.floor(i / 2) * h, w, h }));
}
function elevCells() {
  const w = (AREA.x1 - AREA.x0) / 2;
  return [0, 1].map((i) => ({ x: AREA.x0 + i * w, y: AREA.y0, w, h: AREA.y1 - AREA.y0 }));
}

// espaço reservado dentro de cada célula (mm de papel)
const PLAN_PAD = { left: 14, right: 44, top: 14, bottom: 22 };
const ELEV_PAD = { left: 34, right: 52, top: 22, bottom: 34 };

function planItems(cat: Catalog, model: Model, levelY: number, isGround: boolean): Item[] {
  const all = itemsFor(cat, model, projector("plan"));
  const near = (y?: number) => y !== undefined && Math.abs(y - levelY) < 0.5;
  return all.filter((it) => {
    if (it.kind === "base") return isGround;
    if (it.kind === "node") return near(it.level);
    if (it.kind === "plate-h" || it.kind === "bar-h" || it.kind === "bar-v") return near(it.level); // bar-v: só as inclinadas aparecem (pilares ficam de topo)
    if (it.kind === "plate-v" || it.kind === "cable") return near(it.level);
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
  const plateBox = { x0: 0, x1: cat.settings.chapa_modulos_x * W.M, y0: -cat.settings.chapa_modulos_y * W.M, y1: 0 };
  const plan = bounds(itemsFor(cat, model, projector("plan")), [[plateBox.x0, plateBox.y0], [plateBox.x1, plateBox.y1]]);
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
  const PW = cat.settings.chapa_modulos_x * W.M;
  const PD = cat.settings.chapa_modulos_y * W.M;
  const items = planItems(cat, model, lv.y, isGround);
  const frame: Pt[] = [[0, 0], [PW, 0], [PW, -PD], [0, -PD]];
  const b = bounds([], frame);
  const P = place(b, inner(cell, PLAN_PAD), n);
  const out: Prim[] = [];
  // contorno da chapa: grosso no térreo, fino nas outras plantas
  out.push({ t: "poly", pts: frame.map((q) => P.to(q as [number, number])), closed: true, fill: null, stroke: isGround ? "#000" : GRAY.faint, pen: isGround ? PEN.ground : PEN.thin, layer: "MOLA-BASE" });
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
  // marcadores de vista
  const mx = (P.box.x0 + P.box.x1) / 2;
  const my = (P.box.y0 + P.box.y1) / 2;
  out.push(...viewMarker([mx, P.box.y1 + 11], "up", "A"));
  out.push(...viewMarker([mx, P.box.y0 - 13], "down", "C"));
  out.push(...viewMarker([P.box.x0 - 13, my], "right", "B"));
  out.push(...viewMarker([cell.x + cell.w - 4, my], "left", "D"));
  out.push(...callouts(items, PLAN_LABELS, P, P.box.x1 + 12, P.box.y0, P.box.y1));
  out.push(...viewTitle([cell.x + 2, cell.y + cell.h - 13], lv.planTitle[0], lv.planTitle[1], n));
  return out;
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
  for (const lv of levelsOf(model, cat)) {
    const y = P.to([0, lv.y])[1];
    out.push(axisLine([x0 - 2, y], [x1, y]));
    out.push(txt([cell.x + 3, y + 0.8], lv.name, 2.3));
  }
  // eixos
  const { xs, zs } = axesOf(model, cat);
  const axes = view === "A" || view === "C" ? xs.map((a) => ({ h: pr.p([a.x, 0, 0])[0], label: a.label })) : zs.map((a) => ({ h: pr.p([0, 0, a.z])[0], label: a.label }));
  const top = P.box.y0 - 12;
  for (const a of axes) {
    const x = P.to([a.h, 0])[0];
    out.push(axisLine([x, top + 2.4], [x, P.box.y1 + 8]), ...bubble([x, top], a.label));
  }
  out.push(...paint(items, P));
  // terreno (topo da chapa)
  const gy = P.to([0, 0])[1];
  out.push({ t: "line", a: [x0, gy], b: [x1 + 4, gy], stroke: "#000", pen: PEN.ground, layer: "MOLA-BASE" });
  out.push(...callouts(items, ELEV_LABELS, P, P.box.x1 + 20, P.box.y0, P.box.y1));
  out.push(...viewTitle([cell.x + ELEV_PAD.left, cell.y + cell.h - 24], `VISTA - ${view}`, input.name.toUpperCase(), n));
  return out;
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
  const plate = [[0, 0, 0], [PW, 0, 0], [PW, 0, PD], [0, 0, PD]].map((w) => pr.p(w as [number, number, number])).map(([h, v]) => [h, v] as Pt);
  const b = bounds(items, plate);
  const cell = { x: AREA.x0 + 4, y: AREA.y0 + 26, w: 250, h: AREA.y1 - AREA.y0 - 34 };
  const img = input.isoImage;
  if (img) {
    // foto renderizada, centrada na área da isométrica
    const w = Math.min(cell.w, cell.h * img.aspect);
    const h = w / img.aspect;
    out.push({ t: "image", x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h, href: img.url, layer: "MOLA-BASE" });
  }
  const fit = Math.max((b.x1 - b.x0) / cell.w, (b.y1 - b.y0) / cell.h);
  const P = place(b, cell, fit);
  if (!img) out.push({ t: "poly", pts: plate.map((q) => P.to(q as [number, number])), closed: true, fill: "#2b2b2b", stroke: "#000", pen: PEN.part, layer: "MOLA-BASE" });
  for (let i = 0; i <= cat.settings.chapa_modulos_x && !img; i += 1) {
    const a = pr.p([i * W.M, 0, 0]);
    const c = pr.p([i * W.M, 0, PD]);
    out.push({ t: "line", a: P.to([a[0], a[1]]), b: P.to([c[0], c[1]]), stroke: "#666", pen: PEN.thin, layer: "MOLA-BASE" });
  }
  for (let j = 0; j <= cat.settings.chapa_modulos_y && !img; j += 1) {
    const a = pr.p([0, 0, j * W.M]);
    const c = pr.p([PW, 0, j * W.M]);
    out.push({ t: "line", a: P.to([a[0], a[1]]), b: P.to([c[0], c[1]]), stroke: "#666", pen: PEN.thin, layer: "MOLA-BASE" });
  }
  if (!img) out.push(...paint(items, P));
  // título
  out.push(txt([AREA.x0 + 4, AREA.y0 + 10], input.name.toUpperCase(), 9, { bold: true }));
  out.push(txt([AREA.x0 + 4, AREA.y0 + 17], `${input.meta.line1}  |  ${input.meta.line2}`, 3));
  // painel à direita
  const px = 285;
  let y = AREA.y0 + 12;
  const H = (s: string) => {
    out.push(txt([px, y], s, 3.2, { bold: true }));
    out.push({ t: "line", a: [px, y + 1.6], b: [A3.w - MARGIN, y + 1.6], stroke: "#000", pen: PEN.part, layer: "MOLA-TEXTO" });
    y += 7;
  };
  const row = (a: string, bTxt: string, c?: string) => {
    out.push(txt([px, y], a, 2.4));
    out.push(txt([c ? px + 78 : A3.w - MARGIN, y], bTxt, 2.4, { anchor: "end", bold: true }));
    if (c) out.push(txt([A3.w - MARGIN, y], c, 2.4, { anchor: "end" }));
    y += 4.8;
  };
  const nodes = Object.values(model.nodes).map((nd) => W.pos(nd.pos));
  const span = (k: 0 | 1 | 2) => (nodes.length ? Math.max(...nodes.map((p) => p[k])) - Math.min(...nodes.map((p) => p[k])) : 0);
  const f0 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  H("DADOS DA ESTRUTURA");
  row("Planta (entre centros)", `${f0(span(0))} × ${f0(span(2))} mm`);
  row("Altura (entre centros)", `${f0(span(1))} mm`);
  row("Níveis", String(levelsOf(model, cat).length));
  row("Escala das plantas e vistas", fmtScale(n));
  row("Módulo", `${cat.settings.modulo_mm.toLocaleString("pt-BR")} mm`);
  y += 4;
  H("LISTA DE PEÇAS");
  const used = usage(model);
  out.push(txt([px, y], "Código", 2.2, { bold: true }));
  out.push(txt([px + 18, y], "Peça", 2.2, { bold: true }));
  out.push(txt([px + 78, y], "Usadas", 2.2, { bold: true, anchor: "end" }));
  out.push(txt([A3.w - MARGIN, y], "No estoque", 2.2, { bold: true, anchor: "end" }));
  y += 5;
  let total = 0;
  for (const code of Object.keys(used).sort()) {
    const p = cat.pieces[code];
    const stock = Object.entries(inventory.kits).reduce((s2, [k, cnt]) => s2 + (cat.kits[k]?.pieces[code] ?? 0) * cnt, 0);
    total += used[code];
    out.push(txt([px, y], code, 2.3, { bold: true }));
    out.push(txt([px + 18, y], p?.name.replace(` ${code}`, "") ?? code, 2.3));
    out.push(txt([px + 78, y], String(used[code]), 2.3, { anchor: "end", bold: true }));
    out.push(txt([A3.w - MARGIN, y], inventory.unlimited ? "∞" : String(stock), 2.3, { anchor: "end" }));
    y += 4.4;
  }
  out.push({ t: "line", a: [px, y - 2.6], b: [A3.w - MARGIN, y - 2.6], stroke: "#000", pen: PEN.thin, layer: "MOLA-TEXTO" });
  out.push(txt([px, y + 1], "Total", 2.4, { bold: true }));
  out.push(txt([px + 78, y + 1], String(total), 2.4, { anchor: "end", bold: true }));
  y += 10;
  H("KITS");
  const kitTxt = inventory.unlimited
    ? "Sem limite de peças"
    : Object.entries(inventory.kits).filter(([, c]) => c > 0).map(([k, c]) => `${c}× ${cat.kits[k]?.name ?? `Kit ${k}`}`).join("; ");
  out.push(txt([px, y], kitTxt || "—", 2.4));
  y += 10;
  const d = input.date ?? new Date();
  out.push(txt([px, AREA.y1 - 2], `Gerado pelo siMOLAdor em ${d.toLocaleDateString("pt-BR")}`, 2, { fill: "#555" }));
  return out;
}

/** Monta todas as folhas. */
export function buildSheets(input: SheetInput): { sheets: Sheet[]; scale: number } {
  const n = computeScale(input);
  const levels = levelsOf(input.model, input.cat);
  const pages: { title: string; prims: Prim[] }[] = [];
  pages.push({ title: "Capa", prims: coverDrawing(input, n) });
  for (let i = 0; i < Math.max(1, levels.length); i += 4) {
    const cells = planCells();
    const prims = levels.slice(i, i + 4).flatMap((lv, k) => planDrawing(input, n, lv, i + k === 0, cells[k]));
    pages.push({ title: "Plantas", prims });
  }
  const ec = elevCells();
  pages.push({ title: "Vistas A e B", prims: [...elevationDrawing(input, n, "A", ec[0]), ...elevationDrawing(input, n, "B", ec[1])] });
  pages.push({ title: "Vistas C e D", prims: [...elevationDrawing(input, n, "C", ec[0]), ...elevationDrawing(input, n, "D", ec[1])] });
  const total = pages.length;
  const sheets = pages.map((p, i) => ({
    number: i + 1,
    total,
    title: p.title,
    prims: [...p.prims, ...titleBlock(input, n, i + 1, total, p.title)],
  }));
  return { sheets, scale: n };
}
