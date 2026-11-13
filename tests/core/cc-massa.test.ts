import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { continuousOutline, continuousSize } from "../../src/core/shapes";
import { structureMass, usage } from "../../src/core/inventory";
import { addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";

const R = catalog.settings.esfera_diametro_mm / 2;
const a = catalog.settings.barra_diametro_mm / 2;

/** ponto dentro do polígono (raio par-ímpar) */
function inside(poly: [number, number][], [x, y]: [number, number]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

describe("CC e CC90 pelas fotos da equipe (13/11/2026)", () => {
  it("CC: trapézio nas molas, recorte em V tangente à esfera e fundo encostado nela", () => {
    const { length, width } = continuousSize(catalog, "CC");
    const pts = continuousOutline(catalog, "CC");
    expect(Math.max(...pts.map((p) => Math.abs(p[0])))).toBeCloseTo(length / 2, 6);
    expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(a, 6);
    expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(a + width, 6);
    // o fundo do V fica na superfície da esfera, e os lados do V a 45° a tangenciam
    expect(pts.filter((p) => Math.abs(p[1] - R) < 1e-9)).toHaveLength(2);
    for (const [u, v] of pts) expect(Math.hypot(u, v)).toBeGreaterThanOrEqual(R - 1e-9);
    const side = pts.find((p) => p[1] === a && Math.abs(p[0]) < length / 2 - 1)!;
    const corner = pts.find((p) => p[1] === R && Math.sign(p[0]) === Math.sign(side[0]))!;
    const d = Math.abs(side[0] * corner[1] - side[1] * corner[0]) / Math.hypot(corner[0] - side[0], corner[1] - side[1]);
    expect(d).toBeCloseTo(R, 6);
    // nenhum ponto da esfera fica dentro da peça
    for (let k = 0; k < 360; k += 3) {
      const t = (k * Math.PI) / 180;
      expect(inside(pts, [Math.cos(t) * R * 0.999, Math.sin(t) * R * 0.999])).toBe(false);
    }
  });

  it("CC90: a fenda passa pela CC (em cruz) sem que as peças se cruzem, e fica fora da esfera", () => {
    const cc = continuousSize(catalog, "CC");
    const pts = continuousOutline(catalog, "CC90");
    expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(a + continuousSize(catalog, "CC90").width, 6);
    // no plano da CC90, a CC ocupa |u| ≤ espessura/2, do fundo dela (esfera) até a borda de fora (a + largura)
    for (let u = -cc.thickness / 2; u <= cc.thickness / 2; u += 0.5) {
      for (let v = R; v <= a + cc.width; v += 0.5) expect(inside(pts, [u, v])).toBe(false);
    }
    for (let k = 0; k < 360; k += 3) {
      const t = (k * Math.PI) / 180;
      expect(inside(pts, [Math.cos(t) * R * 0.999, Math.sin(t) * R * 0.999])).toBe(false);
    }
    // e a CC90 apoia nas molas transversais dos dois lados
    expect(pts.filter((p) => Math.abs(p[1] - a) < 1e-9).length).toBeGreaterThanOrEqual(4);
  });
});

describe("massas (pesagens da equipe, 13/11/2026)", () => {
  const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
  it("as peças dos Kits 1 e 2 têm massa", () => {
    for (const c of ["C", "GC", "RC90", "CC", "CC90", "B4", "B6", "B12", "D4x6", "D6x6", "D6x12", "P6x6", "P6x12", "G"]) {
      expect(catalog.pieces[c].weightG).toBeGreaterThan(0);
    }
    expect(catalog.pieces.C.weightG).toBeCloseTo(13.9, 6);
  });

  it("massa da estrutura = soma das peças usadas; o que não tem massa fica listado", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addSupport(m, [9, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    m = addMember(m, "B6", id(m, [9, 0, 3]), [9, 6, 3]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
    const u = usage(m, catalog);
    const r = structureMass(m, catalog);
    expect(r.missing).toEqual([]);
    expect(r.g).toBeCloseTo(u.GC * 31.75 + u.C * 13.9 + u.B6 * 4.75, 6);
    const comCabo = addMember(m, "CABLE", id(m, [3, 6, 3]), [9, 0, 3]).model;
    const r2 = structureMass(comCabo, catalog);
    expect(r2.g).toBeCloseTo(r.g, 6);
    expect(r2.missing).toEqual(expect.arrayContaining(["CABLE"]));
  });
});
