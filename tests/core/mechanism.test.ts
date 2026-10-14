import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { addConnector, addMember, addPlate, addSupport, emptyModel, findNodeAt, len, sub, type Model, type Vec3 } from "../../src/core/model";
import { buildMech, dragTo, mechComponent, mobility, modelAt, positionsOf, tracePath } from "../../src/core/mechanism";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;

function portico(): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addSupport(m, [9, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [9, 0, 3]), [9, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
  return m;
}
const rc90 = (m: Model, at: Vec3, d1: Vec3, d2: Vec3) => addConnector(m, { code: "RC90", node: id(m, at), dirs: [d1, d2] }).model;
const mob = (m: Model, hand: Vec3[]) => {
  const ids = mechComponent(catalog, m, hand.map((p) => id(m, p)));
  const mech = buildMech(catalog, m, ids);
  const x = positionsOf(m, mech);
  return { mech, x, r: mobility(mech, x, hand.map((p) => mech.index.get(id(m, p))!)) };
};

describe("graus de liberdade (esferas = rótulas; RC90, CC e placas travam)", () => {
  it("pórtico sem ligações: 3 graus (balança no plano, tomba para fora e torce)", () => {
    expect(mob(portico(), [[3, 6, 3], [9, 6, 3]]).r.dof).toBe(3);
  });
  it("pórtico com RC90 nos dois esquadros de cima: só tomba em torno da linha das GC (1)", () => {
    let m = portico();
    m = rc90(m, [3, 6, 3], [0, -1, 0], [1, 0, 0]);
    m = rc90(m, [9, 6, 3], [0, -1, 0], [-1, 0, 0]);
    const { r } = mob(m, [[3, 6, 3], [9, 6, 3]]);
    expect(r.dof).toBe(1);
    expect(r.hand).toBe(1);
  });
  it("e com RC90 na base das duas GC: travado", () => {
    let m = portico();
    m = rc90(m, [3, 6, 3], [0, -1, 0], [1, 0, 0]);
    m = rc90(m, [9, 6, 3], [0, -1, 0], [-1, 0, 0]);
    m = addConnector(m, { code: "RC90", node: id(m, [3, 0, 3]), dirs: [[0, 1, 0], [1, 0, 0]], base: true }).model;
    m = addConnector(m, { code: "RC90", node: id(m, [9, 0, 3]), dirs: [[0, 1, 0], [-1, 0, 0]], base: true }).model;
    expect(mob(m, [[3, 6, 3], [9, 6, 3]]).r.dof).toBe(0);
  });
  it("placa no pórtico: trava o esquadro, mas o conjunto ainda tomba em torno das GC (1)", () => {
    let m = portico();
    m = addPlate(m, "P6x6", [id(m, [3, 0, 3]), id(m, [9, 0, 3]), id(m, [9, 6, 3]), id(m, [3, 6, 3])]).model;
    expect(mob(m, [[3, 6, 3], [9, 6, 3]]).r.dof).toBe(1);
  });
  it("diagonal não conta (só tração): o pórtico continua com 3", () => {
    let m = portico();
    m = addMember(m, "D6x6", id(m, [3, 0, 3]), [9, 6, 3]).model;
    expect(mob(m, [[3, 6, 3], [9, 6, 3]]).r.dof).toBe(3);
  });
  it("CC na emenda: a viga de dois trechos não dobra no meio", () => {
    // pilar + viga em dois trechos (B6 + B6) em balanço: sem CC, o meio dobra; com CC, não
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
    m = addMember(m, "B6", id(m, [9, 6, 3]), [15, 6, 3]).model;
    const sem = mob(m, [[15, 6, 3]]).r.dof;
    const com = addConnector(m, { code: "CC", node: id(m, [9, 6, 3]), dirs: [[1, 0, 0]], side: [0, 1, 0] }).model;
    expect(mob(com, [[15, 6, 3]]).r.dof).toBe(sem - 2);
  });
});

describe("mexer o conjunto", () => {
  it("pórtico com placa: o caminho é o círculo em torno da linha das GC e nada muda de tamanho", () => {
    let m = portico();
    m = addPlate(m, "P6x6", [id(m, [3, 0, 3]), id(m, [9, 0, 3]), id(m, [9, 6, 3]), id(m, [3, 6, 3])]).model;
    const { mech, x, r } = mob(m, [[3, 6, 3], [9, 6, 3]]);
    const hand = [mech.index.get(id(m, [3, 6, 3]))!, mech.index.get(id(m, [9, 6, 3]))!];
    const path = tracePath(mech, x, hand, r.v0!);
    expect(path.closed).toBe(true);
    expect(path.samples.length).toBeGreaterThan(200);
    for (const s of path.samples.filter((_, i) => i % 20 === 0)) {
      const mm = modelAt(m, mech, s.x).model;
      for (const b of Object.values(mm.members)) expect(len(sub(mm.nodes[b.a].pos, mm.nodes[b.b].pos))).toBeCloseTo(6, 3);
      // centro da viga a 6 do eixo
      expect(Math.hypot(s.h[1], s.h[2] - 3)).toBeCloseTo(6, 2);
    }
  });

  it("arrastar livre: a ponta de um balanço sem CC dobra no meio e o pilar fica", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
    m = addConnector(m, { code: "RC90", node: id(m, [3, 6, 3]), dirs: [[0, -1, 0], [1, 0, 0]] }).model;
    m = addMember(m, "B6", id(m, [9, 6, 3]), [15, 6, 3]).model;
    const ids = mechComponent(catalog, m, [id(m, [15, 6, 3])]);
    const mech = buildMech(catalog, m, ids);
    const x = positionsOf(m, mech);
    const tip = mech.index.get(id(m, [15, 6, 3]))!;
    const r = dragTo(mech, x, [tip], [14, 9, 3]);
    expect(r.err).toBeLessThan(1e-4);
    expect(r.miss).toBeLessThan(0.02);
    const mm = modelAt(m, mech, r.x).model;
    expect(len(sub(mm.nodes[id(m, [3, 6, 3])].pos, [3, 6, 3]))).toBeLessThan(1e-6); // o topo do pilar não mexe
  });
});
