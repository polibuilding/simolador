import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { cleanSheet, fromFile, type SheetMeta } from "../../src/core/serialization";
import { buildSheets, heightText, parseHeight } from "../../src/drawings/sheets";
import { sheetToSvg } from "../../src/drawings/export";
import type { Prim } from "../../src/drawings/prims";

// pórtico simples: 2 GC, 2 esferas e 3 B6
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
const base: SheetMeta = { line1: "MOLA", line2: "DESAFIO" };
const build = (meta: Partial<SheetMeta> = {}) =>
  buildSheets({ cat: catalog, model: portico.model, inventory: portico.inventory, name: "Pórtico", meta: { ...base, ...meta } });
const texts = (prims: Prim[]) => prims.flatMap((p) => (p.t === "text" ? [p.s] : []));
const M = catalog.settings.modulo_mm;

describe("1.10.1: altura da planta cortada", () => {
  it("lê cm, mm, m e módulos; sem unidade é cm", () => {
    expect(parseHeight("12,5")).toEqual({ mm: 125, unit: "cm" });
    expect(parseHeight("ALTURA = 12,5 cm")).toEqual({ mm: 125, unit: "cm" });
    expect(parseHeight("125 mm")).toEqual({ mm: 125, unit: "cm" });
    expect(parseHeight("0,2 m")).toEqual({ mm: 200, unit: "cm" });
    expect(parseHeight("8 M", M)!.mm).toBeCloseTo(8 * M);
    expect(parseHeight("8 M", M)!.unit).toBe("M");
    expect(parseHeight("alto")).toBeNull();
  });
  it("escreve na unidade escolhida", () => {
    expect(heightText(125)).toBe("ALTURA = 12,5 cm");
    expect(heightText(8 * M, "M", M)).toBe("ALTURA = 8 M");
  });
});

describe("1.10.1: planta baixa cortada", () => {
  const auto = build().layout;
  const h = 60; // abaixo da viga (6 M ≈ 89 mm + base)
  const layout = { ...auto, views: [...auto.views, { id: "d1", kind: "plan" as const, section: true as const, level: h, page: 0, cell: { x: 20, y: 20, w: 150, h: 110 } }] };
  const built = build({ layouts: { A3: layout } });
  it("título PLANTA BAIXA e a altura no subtítulo; os pilares aparecem cortados", () => {
    const v = built.views.find((x) => x.view.id === "d1")!;
    expect(v.title).toBe("PLANTA BAIXA");
    expect(v.sub).toBe("ALTURA = 6 cm");
    expect(v.entry).toBe("PB +6 cm");
    const sheet = built.sheets[v.sheet];
    const body = sheet.prims.filter((p) => p.group === "desenho:d1");
    // seções dos dois pilares: círculos pretos do diâmetro da mola
    const cuts = body.filter((p) => p.t === "circle" && p.fill === "#000" && p.layer === "MOLA-BARRA");
    expect(cuts.length).toBe(2);
  });
  it("entra como andar a mais no esquema da capa; as vistas não ganham marca", () => {
    const cover = built.sheets[0].prims.filter((p) => p.group === "capa:pavimentos");
    const t = texts(cover);
    expect(t).toContain("PAV. TÉRREO");
    expect(t).toContain("COBERTURA");
    expect(t).toContain("PB +6 cm");
    // pavimentos tracejados
    expect(cover.filter((p) => p.t === "line" && p.dash).length).toBe(3);
    const elev = built.sheets.flatMap((s) => s.prims).filter((p) => p.group === "desenho:vista A");
    expect(texts(elev).some((s) => s.includes("6 cm"))).toBe(false);
  });
  it("o arquivo guarda a planta cortada e a unidade", () => {
    const meta = cleanSheet({ ...base, layouts: { A3: { ...layout, views: [...layout.views, { ...layout.views.at(-1)!, id: "d2", unit: "M" }] } } });
    const vs = meta!.layouts!.A3!.views;
    expect(vs.find((v) => v.id === "d1")?.section).toBe(true);
    expect(vs.find((v) => v.id === "d2")?.unit).toBe("M");
    const bad = cleanSheet({ ...base, layouts: { A3: { ...layout, views: [{ ...layout.views.at(-1)!, unit: "pé" }] } } });
    expect(bad!.layouts!.A3!.views.length).toBe(0);
  });
});

describe("1.10.1: marcadores de vista arrastáveis", () => {
  it("cada marcador é uma peça arrastável num eixo só, e a posição salva anda só nesse eixo", () => {
    const plan = (b: ReturnType<typeof build>) => b.sheets[1].prims.filter((p) => p.group?.startsWith("desenho:PLANTA BAIXA PAV. TÉRREO"));
    const tagA = "planta PLANTA BAIXA PAV. TÉRREO|vista A";
    const a0 = plan(build()).find((p) => p.handle === tagA && p.t === "poly");
    expect(a0?.handleAxis).toBe("y");
    const a1 = plan(build({ labels: { [tagA]: [7, 5] } })).find((p) => p.handle === tagA && p.t === "poly");
    if (a0?.t !== "poly" || a1?.t !== "poly") throw new Error("sem marcador");
    expect(a1.pts[0][0]).toBeCloseTo(a0.pts[0][0]); // o x não muda
    expect(a1.pts[0][1] - a0.pts[0][1]).toBeCloseTo(5);
    const svg = sheetToSvg(build().sheets[1], { interactive: true });
    expect(svg).toContain(`data-tag="${tagA}" data-axis="y"`);
    // no PDF/SVG baixado não há alças
    expect(sheetToSvg(build().sheets[1])).not.toContain("data-axis");
  });
});
