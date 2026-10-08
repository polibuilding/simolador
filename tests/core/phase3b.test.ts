import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory } from "../../src/core/inventory";
import { addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { overlappingNodes, validateMember } from "../../src/core/rules";
import { allCandidates, memberCandidates } from "../../src/core/snapping";

const inv = defaultInventory(catalog);
const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;

function pilares(...xz: [number, number][]): Model {
  let m = emptyModel();
  for (const [x, z] of xz) {
    m = addSupport(m, [x, 0, z]).model;
    m = addMember(m, "B6", id(m, [x, 0, z]), [x, 6, z]).model;
  }
  return m;
}

describe("defeito da imagem: barra inclinada que termina quase em cima de outra esfera", () => {
  it("B6 a 30° em planta saindo de (6,6,6) cai a 2,9 mm do topo do pilar (11,6,9): recusa", () => {
    const m = pilares([6, 6], [11, 9]);
    const to: Vec3 = [6 + 6 * Math.cos(Math.PI / 6), 6, 6 + 3].map((v) => Math.round(v * 1e4) / 1e4) as Vec3;
    const ck = validateMember(catalog, inv, m, "B6", id(m, [6, 6, 6]), to);
    expect(ck.ok).toBe(false);
    expect(ck.errors.join(" ")).toMatch(/esfera/);
  });
  it("barra que passa raspando por dentro de uma esfera (sem ser no eixo) é recusada", () => {
    // pilar em (9,0,3) e outro em (3,0,3.3) [livre]: a viga de (3,6,3) a (9,6,3) passa a 0 do topo; uma esfera a 0,3 M da linha também
    let m = pilares([3, 3]);
    m = addSupport(m, [6, 0, 3.3]).model;
    m = addMember(m, "B6", id(m, [6, 0, 3.3]), [6, 6, 3.3]).model;
    const ck = validateMember(catalog, inv, m, "B6", id(m, [3, 6, 3]), [9, 6, 3]);
    expect(ck.ok).toBe(false);
  });
  it("sem inclinação ligada, a barra só oferece os eixos (e o fechamento em esferas à distância exata)", () => {
    const m = pilares([3, 3], [9, 3]);
    const all = memberCandidates(catalog, inv, m, "B6", id(m, [3, 6, 3]), { inclined: false });
    expect(all.length).toBe(6);
    const withInc = memberCandidates(catalog, inv, m, "B6", id(m, [3, 6, 3]));
    expect(withInc.length).toBeGreaterThan(6);
    expect(allCandidates(catalog, inv, m, "B6", { inclined: false }).every((c) => c.kind !== "member" || !c.inclined || !!findNodeAt(m, c.toPos))).toBe(true);
  });
  it("modelos antigos: acha as esferas sobrepostas", () => {
    let m = pilares([6, 6], [11, 9]);
    m = addMember(m, "B6", id(m, [6, 6, 6]), [11.1962, 6, 9]).model; // como era feito antes da regra
    expect(overlappingNodes(catalog, m).length).toBe(1);
    expect(overlappingNodes(catalog, pilares([6, 6], [11, 9])).length).toBe(0);
  });
});
