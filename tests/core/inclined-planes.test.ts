import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory, usage } from "../../src/core/inventory";
import { addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { applyCandidate, connectorCandidates, memberCandidates, plateCandidates } from "../../src/core/snapping";

const inv = defaultInventory(catalog);
const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const r4 = (v: Vec3) => v.map((x) => Math.round(x * 1e4) / 1e4 + 0) as Vec3;
const k = 6 * Math.SQRT1_2;

/** Pórtico com um quadro inclinado a 45° saindo da viga: A(3,6,3) B(9,6,3) A' B' (no plano inclinado, sobe em Y e avança em Z). */
function quadroInclinado(): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addSupport(m, [9, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [9, 0, 3]), [9, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3, 6, 3]), r4([3, 6 + k, 3 + k])).model;
  m = addMember(m, "B6", id(m, [9, 6, 3]), r4([9, 6 + k, 3 + k])).model;
  m = addMember(m, "B6", id(m, r4([3, 6 + k, 3 + k])), r4([9, 6 + k, 3 + k])).model;
  return m;
}

describe("planos inclinados", () => {
  it("placa P6x6 no quadro inclinado a 45°", () => {
    const m = quadroInclinado();
    const cs = plateCandidates(catalog, inv, m, "P6x6");
    const inc = cs.filter((c) => c.kind === "plate" && c.geom.corners.some((p) => p[2] > 3.5));
    expect(inc.length).toBe(1);
    expect(inc[0].check.ok).toBe(true);
    const m2 = applyCandidate(m, inc[0]);
    expect(usage(m2).P6x6).toBe(1);
    // a mesma placa de novo: recusada
    expect(plateCandidates(catalog, inv, m2, "P6x6").find((c) => c.kind === "plate" && c.geom.corners.some((p) => p[2] > 3.5))?.check.ok).toBe(false);
  });
  it("RC90 no canto entre a viga e a barra inclinada", () => {
    const m = quadroInclinado();
    const cs = connectorCandidates(catalog, inv, m, "RC90", id(m, [3, 6, 3]));
    const inc = cs.filter((c) => c.kind === "connector" && c.spec.dirs.some((d) => Math.abs(d[2]) > 0.5 && Math.abs(d[1]) > 0.5));
    expect(inc.length).toBe(1);
    expect(inc[0].check.ok).toBe(true);
  });
  it("diagonal D6x6 no painel inclinado (canto a 90° existe)", () => {
    const m = quadroInclinado();
    const cs = memberCandidates(catalog, inv, m, "D6x6", id(m, [3, 6, 3]));
    const to = r4([9, 6 + k, 3 + k]);
    const c = cs.find((x) => x.kind === "member" && Math.abs(x.toPos[0] - to[0]) < 1e-3 && Math.abs(x.toPos[1] - to[1]) < 1e-3);
    expect(c?.check.ok).toBe(true);
  });
  it("CC num par de barras inclinadas alinhadas: 4 lados", () => {
    let m = quadroInclinado();
    const a1 = r4([3, 6 + k, 3 + k]);
    m = addMember(m, "B6", id(m, a1), r4([3, 6 + 2 * k, 3 + 2 * k])).model;
    const cs = connectorCandidates(catalog, inv, m, "CC", id(m, a1));
    // um lado tem a barra transversal (A'B', +X): sobram 3
    expect(cs.filter((c) => c.check.ok).length).toBe(3);
  });
});

import { supportGuides } from "../../src/core/snapping";
describe("guias da ligação de base", () => {
  it("azul a 6 M nos eixos; amarelo no vértice do triângulo equilátero de B6", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    const g1 = supportGuides(catalog, inv, m);
    expect(g1.filter((g) => g.kind === "blue").map((g) => g.pos.join(","))).toContain("9,0,3");
    expect(g1.some((g) => g.kind === "yellow")).toBe(false);
    m = addSupport(m, [9, 0, 3]).model;
    const y = supportGuides(catalog, inv, m).filter((g) => g.kind === "yellow");
    // (6; 3 + 5,196) — o de (6; 3 − 5,196) cai fora da chapa
    expect(y.map((g) => g.pos)).toEqual([[6, 0, 8.1962]]);
    expect(y[0].text).toMatch(/equilátero de B6/);
  });
});
