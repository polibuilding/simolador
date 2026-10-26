import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { cleanSheet, fromFile, type SheetMeta } from "../../src/core/serialization";
import { buildSheets, newViewCell } from "../../src/drawings/sheets";
import type { Prim } from "../../src/drawings/prims";
import { addPage, deleteCut, moveToPage, nextCut, nextViewId, removePage, removeView, setViewScale } from "../../src/drawings/layout";

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

describe("pranchas: mexer no arranjo", () => {
  it("tirar um pavimento repetido, mudar uma vista de prancha e excluir a prancha que ficou vazia", () => {
    const auto = build();
    expect(auto.manual).toBe(false);
    let l = removeView(auto.layout, "PLANTA DE COBERTURA");
    l = moveToPage(l, "vista C", 0);
    l = moveToPage(l, "vista D", 1);
    const mid = build({ layouts: { A3: l } });
    expect(mid.manual).toBe(true);
    expect(mid.sheets.map((s) => s.title)).toEqual(["Capa", "PB PAV. TÉRREO · VISTA-C", "VISTA-A · VISTA-B · VISTA-D", "Prancha vazia"]);
    l = removePage(l, 2);
    expect(build({ layouts: { A3: l } }).sheets.length).toBe(3);
    // prancha com desenho não sai
    expect(removePage(l, 0)).toBe(l);
  });

  it("prancha nova, escala própria e ids sem repetir", () => {
    const auto = build();
    let l = addPage(auto.layout);
    expect(l.pages).toBe(auto.layout.pages + 1);
    const id = nextViewId({ ...base, layouts: { A4: { pages: 1, views: [{ id: "d3", kind: "A", page: 0, cell: { x: 0, y: 0, w: 1, h: 1 } }] } } });
    expect(id).toBe("d4");
    l = moveToPage(l, "vista A", l.pages); // "Nova prancha"
    expect(l.pages).toBe(auto.layout.pages + 2);
    l = setViewScale(l, "vista A", 10);
    const b = build({ scale: 5, layouts: { A3: l } });
    expect(b.views.find((v) => v.view.id === "vista A")?.n).toBe(10);
    l = setViewScale(l, "vista A", undefined);
    expect(build({ scale: 5, layouts: { A3: l } }).views.find((v) => v.view.id === "vista A")?.n).toBe(5);
    expect(nextCut([{ id: "c2", name: "Corte 2", a: [0, 0], b: [1, 0] }])).toEqual({ id: "c3", name: "Corte 3" });
  });

  it("o arranjo mexido vale só para o tamanho de folha em que foi feito", () => {
    const l = removeView(build().layout, "vista A");
    expect(build({ layouts: { A3: l } }).views.some((v) => v.view.id === "vista A")).toBe(false);
    expect(build({ paper: "A4", layouts: { A3: l } }).views.some((v) => v.view.id === "vista A")).toBe(true);
  });
});

describe("pranchas: isométricas", () => {
  it("as 4 isométricas entram como desenho sem escala e não mudam a escala do carimbo", () => {
    const auto = build({ scale: 5 });
    const cell = newViewCell({ cat: catalog, model: portico.model, inventory: portico.inventory, name: "", meta: base }, { kind: "iso", iso: "CB" }, 10, [300, 200]);
    const views = (["AD", "DC", "CB", "BA"] as const).map((iso, i) => ({ id: `d${i + 1}`, kind: "iso" as const, iso, page: auto.layout.pages, n: 10, cell }));
    const b = build({ scale: 5, layouts: { A3: { pages: auto.layout.pages + 1, views: [...auto.layout.views, ...views] } } });
    const sh = b.sheets[b.sheets.length - 1];
    expect(sh.title).toBe("ISO A-D · ISO D-C · ISO C-B · ISO B-A");
    const t = texts(sh.prims);
    expect(t).toContain("ISOMÉTRICA C-B");
    expect(t.filter((s) => s === "SEM ESCALA").length).toBe(5); // 4 títulos + o carimbo
    // as quatro são diferentes (cada uma de um canto)
    const shape = (id: string) => JSON.stringify(sh.prims.filter((p) => p.group === `desenho:${id}` && p.layer === "MOLA-BARRA").map((p) => (p.t === "poly" ? p.pts.map((q) => q.map(Math.round)) : 0)));
    expect(new Set(["d1", "d2", "d3", "d4"].map(shape)).size).toBe(4);
    // num .mola, só cantos conhecidos
    const clean = cleanSheet({ ...base, layouts: { A3: { pages: 1, views: [{ ...views[0] }, { ...views[1], iso: "XX" }] } } });
    expect(clean?.layouts?.A3?.views.map((v) => v.id)).toEqual(["d1"]);
  });
});

describe("pranchas: cortes", () => {
  // pórtico em x = 3..9 M, z = 3 M; corte ao longo de x, passando no meio da viga (olha para −z)
  const M = catalog.settings.modulo_mm;
  const along = { id: "c1", name: "Corte 1", a: [0, 3 * M] as [number, number], b: [12 * M, 3 * M] as [number, number] };
  // corte ao longo de z, no meio da viga (x = 6 M): a viga atravessa o plano
  const across = { id: "c2", name: "Corte 2", a: [6 * M, 0] as [number, number], b: [6 * M, 6 * M] as [number, number] };
  const withCut = (cut: typeof along) => {
    const auto = build({ cuts: [cut] });
    const v = { id: "d1", kind: "cut" as const, cut: cut.id, page: auto.layout.pages, cell: { x: 50, y: 30, w: 200, h: 200 } };
    return build({ cuts: [cut], layouts: { A3: { pages: auto.layout.pages + 1, views: [...auto.layout.views, v] } } });
  };

  it("linha de corte nas plantas, com o número; some com as indicações de vistas desligadas", () => {
    const plans = (b: ReturnType<typeof build>) => b.sheets[1].prims.filter((p) => p.group === "desenho:PLANTA BAIXA PAV. TÉRREO");
    const arrows = (ps: Prim[]) => ps.filter((p) => p.t === "poly" && p.pts.length === 3 && p.fill === "#000").length;
    const on = plans(build({ cuts: [along] }));
    expect(arrows(on)).toBe(2);
    expect(on.some((p) => p.t === "line" && p.dash === "center" && p.stroke === "#000" && p.layer === "MOLA-EIXO" && Math.abs(p.a[1] - p.b[1]) < 1e-6 && Math.abs(p.a[0] - p.b[0]) > 30)).toBe(true);
    const off = plans(build({ cuts: [along], show: { markers: false } }));
    expect(arrows(off)).toBe(0);
  });

  it("desenho do corte: o que está atrás da linha; barra atravessada vira seção preta", () => {
    const b = withCut(across);
    const sh = b.sheets[b.sheets.length - 1];
    expect(sh.title).toBe("CORTE 2");
    const body = sh.prims.filter((p) => p.group === "desenho:d1");
    // a viga cortada: um círculo preto com o diâmetro da barra
    const r = catalog.settings.barra_diametro_mm / 2 / b.scale;
    expect(body.some((p) => p.t === "circle" && p.fill === "#000" && Math.abs(p.r - r) < 1e-6)).toBe(true);
    // o pilar de x = 3 M fica na frente da linha (some) e o de x = 9 M fica atrás (aparece)
    const bars = body.filter((p) => p.layer === "MOLA-BARRA" && p.t === "poly");
    expect(bars.length).toBe(1);
  });

  it("corte ao longo do pórtico: tudo na linha aparece", () => {
    const b = withCut(along);
    const body = b.sheets[b.sheets.length - 1].prims.filter((p) => p.group === "desenho:d1");
    expect(body.filter((p) => p.layer === "MOLA-BARRA" && p.t === "poly").length).toBe(3);
  });

  it("corte indicado nas vistas que olham ao longo da linha dele", () => {
    const arrows = (sheet: number, group: string, b = build({ cuts: [along] })) =>
      b.sheets[sheet].prims.filter((p) => p.group === group && p.t === "poly" && p.pts.length === 3 && p.fill === "#000").length;
    // corte ao longo de x: aparece de lado nas vistas B e D, não em A e C
    expect(arrows(2, "desenho:vista B")).toBe(2);
    expect(arrows(3, "desenho:vista D")).toBe(2);
    expect(arrows(2, "desenho:vista A")).toBe(0);
    expect(arrows(2, "desenho:vista B", build({ cuts: [along], show: { markers: false } }))).toBe(0);
    // corte ao longo de z: de lado na vista A
    const b = withCut(across);
    expect(b.sheets[2].prims.filter((p) => p.group === "desenho:vista A" && p.t === "poly" && p.pts.length === 3 && p.fill === "#000").length).toBe(2);
  });

  it("apagar o corte tira a linha e os desenhos dele", () => {
    const b = withCut(across);
    const meta = deleteCut({ ...base, cuts: [across], layouts: { A3: b.layout } }, "c2");
    expect(meta.cuts).toEqual([]);
    expect(meta.layouts?.A3?.views.some((v) => v.kind === "cut")).toBe(false);
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
