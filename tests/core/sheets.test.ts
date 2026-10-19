import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { cleanSheet, fromFile, type SheetMeta } from "../../src/core/serialization";
import { buildSheets, newViewCell } from "../../src/drawings/sheets";
import type { Prim } from "../../src/drawings/prims";

// pórtico simples (examples/portico-simples.mola): 2 GC, 2 esferas e 3 B6
const portico = fromFile({
  format: "simolador",
  version: 1,
  name: "Pórtico simples",
  moduleMm: 14.87,
  inventory: { kits: { "1": 1, "2": 1 }, unlimited: false },
  nodes: [
    { id: "n1", kind: "support", pos: [3, 0, 3] },
    { id: "n2", kind: "support", pos: [9, 0, 3] },
    { id: "n3", kind: "sphere", pos: [3, 6, 3] },
    { id: "n5", kind: "sphere", pos: [9, 6, 3] },
  ],
  members: [
    { id: "m4", code: "B6", a: "n1", b: "n3" },
    { id: "m6", code: "B6", a: "n2", b: "n5" },
    { id: "m7", code: "B6", a: "n3", b: "n5" },
  ],
});

const base: SheetMeta = { line1: "MOLA STRUCTURAL MODEL", line2: "DESAFIO POLI-USP 2026" };
const build = (meta: Partial<SheetMeta> = {}) =>
  buildSheets({ cat: catalog, model: portico.model, inventory: portico.inventory, name: "Pórtico", meta: { ...base, ...meta } });
const texts = (prims: Prim[]) => prims.flatMap((p) => (p.t === "text" ? [p.s] : []));

describe("pranchas: carimbo", () => {
  it("número da folha sem P_, escala num quadro só dela e os desenhos da folha", () => {
    const { sheets } = build({ scale: 5 });
    expect(sheets.length).toBe(4); // capa, plantas, vistas A e B, vistas C e D
    const t = texts(sheets[1].prims);
    expect(t).toContain("02/04");
    expect(t.some((s) => s.startsWith("P_"))).toBe(false);
    expect(t).toContain("ESCALA: 1/5");
    expect(t.some((s) => s.includes("PB PAV. TÉRREO") && s.includes("PB COBERTURA"))).toBe(true);
    expect(texts(sheets[2].prims).some((s) => s.includes("VISTA-A") && s.includes("VISTA-B"))).toBe(true);
    // a capa não tem desenho em escala
    expect(texts(sheets[0].prims)).toContain("SEM ESCALA");
  });

  it("título e subtítulo iguais em todas as folhas e editáveis", () => {
    const { sheets } = build({ line1: "TORRE", line2: "EQUIPE 3" });
    for (const sh of sheets) {
      const title = sh.prims.find((p) => p.t === "text" && p.edit === "title");
      const sub = sh.prims.find((p) => p.t === "text" && p.edit === "sub");
      expect(title && title.t === "text" && title.s).toBe("TORRE");
      expect(title && title.t === "text" && title.bold).toBe(true);
      expect(sub && sub.t === "text" && sub.s).toBe("EQUIPE 3");
    }
  });

  it("kits usados no carimbo", () => {
    expect(texts(build().sheets[1].prims).some((s) => s.includes("KIT 1") && s.includes("KIT 2"))).toBe(true);
  });

  it("subtítulo de um desenho trocado aparece no título e no carimbo", () => {
    const { sheets } = build({ views: { "PLANTA BAIXA PAV. TÉRREO": { sub: "PAVIMENTO TIPO" } } });
    const t = texts(sheets[1].prims);
    expect(t).toContain("PAVIMENTO TIPO");
    expect(t.some((s) => s.includes("PB PAVIMENTO TIPO"))).toBe(true);
  });

  it("escala gráfica vertical, sem moldura, na direita da folha", () => {
    const { sheets, size } = build({ scale: 5 });
    const bar = sheets[1].prims.filter((p) => p.t === "poly" && p.layer === "MOLA-CARIMBO" && p.pts.length === 4 && p.pts[0][0] > size.w - 15);
    expect(bar.length).toBe(4);
    const [p] = bar;
    if (p.t !== "poly") throw new Error();
    const h = Math.abs(p.pts[2][1] - p.pts[0][1]);
    const w = Math.abs(p.pts[1][0] - p.pts[0][0]);
    expect(h).toBeGreaterThan(w); // vertical
  });
});

describe("pranchas: folha e arranjo", () => {
  it("A2 e folha personalizada", () => {
    expect(build({ paper: "A2" }).size).toEqual({ w: 594, h: 420 });
    expect(build({ paper: "custom", custom: { w: 500, h: 350 } }).size).toEqual({ w: 500, h: 350 });
    // fora dos limites: fica no limite
    expect(build({ paper: "custom", custom: { w: 50, h: 9000 } }).size).toEqual({ w: 150, h: 1500 });
  });

  it("A4: uma planta por folha", () => {
    const { sheets } = build({ paper: "A4" });
    expect(sheets.length).toBe(1 + 2 + 4);
  });

  it("desenho inserido com escala própria: a folha com duas escalas fica INDICADA", () => {
    const auto = build({ scale: 5 });
    const extra = { id: "v1", kind: "A" as const, page: 0, n: 10, cell: newViewCell({ cat: catalog, model: portico.model, inventory: portico.inventory, name: "", meta: base }, { kind: "A" }, 10, [300, 200]) };
    const layout = { pages: auto.layout.pages, views: [...auto.layout.views, extra] };
    const { sheets } = build({ scale: 5, layouts: { A3: layout } });
    expect(texts(sheets[1].prims)).toContain("ESCALA: INDICADA");
    // mudar a escala geral não muda o desenho com escala própria
    const again = build({ scale: 2, layouts: { A3: layout } });
    expect(again.views.find((v) => v.view.id === "v1")?.n).toBe(10);
    expect(again.views.find((v) => v.view.id !== "v1")?.n).toBe(2);
  });

  it("visualizações desligadas na barra de cima somem; desenho com ajuste próprio não muda", () => {
    const layer = (prims: Prim[], l: string) => prims.filter((p) => p.layer === l && p.group?.startsWith("desenho:")).length;
    const on = build();
    expect(layer(on.sheets[1].prims, "MOLA-COTA")).toBeGreaterThan(0);
    expect(layer(on.sheets[1].prims, "MOLA-EIXO")).toBeGreaterThan(0);
    const off = build({ show: { dims: false, axes: false, labels: false, markers: false } });
    expect(layer(off.sheets[1].prims, "MOLA-COTA")).toBe(0);
    expect(layer(off.sheets[1].prims, "MOLA-EIXO")).toBe(0);
    expect(texts(off.sheets[1].prims)).not.toContain("VISTA");
    const local = build({
      show: { dims: false },
      views: { "PLANTA BAIXA PAV. TÉRREO": { show: { dims: true, axes: true, labels: true, markers: true } } },
    });
    const ground = local.sheets[1].prims.filter((p) => p.group === "desenho:PLANTA BAIXA PAV. TÉRREO");
    const top = local.sheets[1].prims.filter((p) => p.group === "desenho:PLANTA DE COBERTURA");
    expect(ground.some((p) => p.layer === "MOLA-COTA")).toBe(true);
    expect(top.some((p) => p.layer === "MOLA-COTA")).toBe(false);
  });
});

describe("carimbo no arquivo .mola", () => {
  it("guarda o que é válido e descarta o resto", () => {
    const s = cleanSheet({
      line1: "A", line2: 3, paper: "A2", scale: -1, show: { dims: false },
      layouts: { A3: { pages: 2, views: [{ id: "x", kind: "plan", page: 0, level: 10, cell: { x: 0, y: 0, w: 10, h: 10 } }, { id: "y", kind: "Z", page: 0, cell: {} }] } },
      cuts: [{ id: "c1", name: "Corte 1", a: [0, 0], b: [10, 0] }, { id: "c2", a: [0] }],
      views: { x: { title: "T", show: { dims: false } } },
    });
    expect(s?.line1).toBe("A");
    expect(s?.line2).toBe("");
    expect(s?.paper).toBe("A2");
    expect(s?.scale).toBeUndefined();
    expect(s?.show).toEqual({ markers: true, labels: true, axes: true, dims: false });
    expect(s?.layouts?.A3?.views.map((v) => v.id)).toEqual(["x"]);
    expect(s?.cuts?.map((c) => c.id)).toEqual(["c1"]);
    expect(s?.views?.x).toEqual({ title: "T", show: { markers: true, labels: true, axes: true, dims: false } });
    expect(cleanSheet(null)).toBeUndefined();
  });
});
