import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory } from "../../src/core/inventory";
import { addMember, addSupport, emptyModel, findNodeAt, len, sub, type Model, type Vec3 } from "../../src/core/model";
import { reachAction, reachPoint, supportReach } from "../../src/core/reach";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const inv = { ...defaultInventory(catalog), unlimited: true };

/** pilar B6 numa GC e uma viga B6 em balanço; da ponta da viga, uma B4 pendurada para baixo e para fora */
function balanco(): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
  m = addMember(m, "B6", id(m, [9, 6, 3]), [13.4721, 2, 3]).model;
  return m;
}

describe("GC perto da estrutura: onde uma mola chega até ela", () => {
  it("esfera a 6 M: ponto logo abaixo (B6 em pé); mola pendurada de 6 M: círculo de raio 0", () => {
    const m = balanco();
    const g = supportReach(catalog, inv, m);
    const below = g.filter((x) => x.kind === "bar" && x.sphere === id(m, [9, 6, 3]));
    expect(below.some((x) => x.code === "B6" && x.r === 0)).toBe(true);
    const swing = g.filter((x) => x.kind === "swing");
    expect(swing.length).toBe(1);
  });
  it("mola nova: GC + B6 até a esfera, numa ação", () => {
    const m = balanco();
    const g = supportReach(catalog, inv, m).find((x) => x.kind === "bar" && x.sphere === id(m, [9, 6, 3]) && x.code === "B6")!;
    const a = reachAction(catalog, inv, m, g, reachPoint(g, 0));
    expect(a.check.errors).toEqual([]);
    expect(Object.keys(a.model.members).length).toBe(4);
  });
  it("mola pendurada: a ponta desce e vira a GC (a mola não muda de tamanho)", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
    m = addMember(m, "B6", id(m, [9, 6, 3]), [15, 6, 3]).model; // ponta solta na horizontal
    // a ponta só pode descer se a esfera de cima estiver baixa o bastante: 6 M com B6 → em pé, logo abaixo
    const g = supportReach(catalog, inv, m).find((x) => x.kind === "swing")!;
    expect(g.r).toBe(0);
    const a = reachAction(catalog, inv, m, g, g.center);
    const e = a.model.nodes[g.end!];
    expect(e.kind).toBe("support");
    expect(len(sub(e.pos, a.model.nodes[g.sphere].pos))).toBeCloseTo(6, 3);
    // a ponta desce para dentro do pilar? não: fica logo abaixo da esfera de cima, em (9, 0, 3)
    expect(e.pos).toEqual([9, 0, 3]);
    expect(a.check.ok).toBe(true);
  });
});
