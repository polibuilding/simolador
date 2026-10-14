import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { usage } from "../../src/core/inventory";
import { ballsPerRoll, ropeInfo, ropeMinMm, ropePlan, ropeSpec } from "../../src/core/rope";
import { validateRope, validateStiffener } from "../../src/core/rules";
import { nodeMoveOptions } from "../../src/core/edit";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const kit3 = { kits: { 3: 1 }, unlimited: false };

/** dois pilares B6 a `gap` módulos um do outro */
function pilares(gap: number): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addSupport(m, [3 + gap, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3 + gap, 0, 3]), [3 + gap, 6, 3]).model;
  return m;
}
const addRope = (m: Model, a: Vec3, b: Vec3) => {
  const r = addMember(m, "CABLE", id(m, a), b);
  return r.model;
};

describe("cabo (Kit 3)", () => {
  it("o pedaço sai da distância entre as esferas, descontando as ligações das pontas, em bolinhas", () => {
    const sp = ropeSpec(catalog);
    const info = ropeInfo(catalog, [0, 0, 0], [12, 0, 0])!;
    const M = catalog.settings.modulo_mm;
    expect(info.centerMm).toBeCloseTo(12 * M, 6);
    expect(info.chainMm).toBeCloseTo(12 * M - 2 * sp.end, 6);
    expect(info.balls).toBe(Math.floor(info.chainMm / sp.pitch) + 1);
    expect(info.slackMm).toBeGreaterThanOrEqual(0);
    expect(info.slackMm).toBeLessThan(sp.pitch);
    expect(ropeInfo(catalog, [0, 0, 0], [(ropeMinMm(catalog) - 1) / M, 0, 0])).toBeNull();
  });

  it("liga duas esferas que já existem; curto demais, repetido ou na mesma esfera não", () => {
    const m = pilares(12);
    const a = id(m, [3, 6, 3]);
    const b = id(m, [15, 6, 3]);
    expect(validateRope(catalog, kit3, m, a, b).ok).toBe(true);
    expect(validateRope(catalog, kit3, m, a, a).ok).toBe(false);
    const perto = pilares(4);
    const r = validateRope(catalog, kit3, perto, id(perto, [3, 6, 3]), id(perto, [7, 6, 3]));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Curto demais/);
    const com = addRope(m, [3, 6, 3], [15, 6, 3]);
    expect(validateRope(catalog, kit3, com, a, b).errors[0]).toMatch(/Já existe/);
  });

  it("não sai colado numa mola (lugar da ligação de cabo) nem atravessa mola", () => {
    const m = pilares(12);
    // do topo de um pilar até a GC dele: colado no pilar (0°)
    const r = validateRope(catalog, kit3, m, id(m, [3, 6, 3]), id(m, [3, 0, 3]));
    expect(r.ok).toBe(false);
    // estai do topo de um pilar até a GC do outro: ok
    expect(validateRope(catalog, kit3, m, id(m, [3, 6, 3]), id(m, [15, 0, 3])).ok).toBe(true);
  });

  it("estoque: 2 ligações e 2 clipes por cabo; o cabo conta pelos rolos do plano de corte", () => {
    let m = pilares(12);
    m = addRope(m, [3, 6, 3], [15, 6, 3]);
    const u = usage(m, catalog);
    expect(u["CABLE-C"]).toBe(2);
    expect(u["CLIP-C"]).toBe(2);
    expect(u.CABLE).toBe(1);
    expect(u.CABLE ?? 0).toBeLessThanOrEqual(1);
    const plan = ropePlan(catalog, m);
    expect(plan.cuts).toHaveLength(1);
    expect(plan.rolls).toHaveLength(1);
    expect(plan.balls).toBeLessThan(ballsPerRoll(ropeSpec(catalog)));
    // sem Kit 3 no estoque, não há cabo
    const r = validateRope(catalog, { kits: { 1: 1 }, unlimited: false }, pilares(12), id(m, [3, 6, 3]), id(m, [15, 6, 3]));
    expect(r.errors.join(" ")).toMatch(/Kit 3/);
  });

  it("acabam as ligações de cabo: 24 por Kit 3 = 12 cabos", () => {
    // 13 pares de pilares lado a lado, um cabo em cada
    let m = emptyModel();
    for (let i = 0; i < 13; i++) {
      const z = i * 0.9;
      m = addSupport(m, [1, 0, z]).model;
      m = addSupport(m, [17, 0, z]).model;
      m = addMember(m, "B6", id(m, [1, 0, z]), [1, 6, z]).model;
      m = addMember(m, "B6", id(m, [17, 0, z]), [17, 6, z]).model;
    }
    for (let i = 0; i < 12; i++) m = addRope(m, [1, 6, i * 0.9], [17, 6, i * 0.9]);
    const r = validateRope(catalog, kit3, m, id(m, [1, 6, 12 * 0.9]), id(m, [17, 6, 12 * 0.9]));
    expect(r.errors.join(" ")).toMatch(/CABLE C/);
  });

  it("mover só o nó: o cabo não prende a esfera (estica junto)", () => {
    let m = pilares(12);
    m = addRope(m, [3, 6, 3], [15, 6, 3]);
    const set = nodeMoveOptions(catalog, m, id(m, [3, 6, 3]));
    expect(set.locked).toBeUndefined();
    expect(set.locus?.kind).toBe("sphere"); // só o pilar prende
  });
});

describe("enrijecedor (Kit 3)", () => {
  it("B6 → BS6, B12 → BS12; B4 e diagonal não; clicar de novo tira", () => {
    let m = pilares(12);
    const bar = Object.values(m.members).find((x) => x.code === "B6")!;
    const r = validateStiffener(catalog, kit3, m, bar.id);
    expect(r.ok).toBe(true);
    expect(r.code).toBe("BS6");
    m = { ...m, members: { ...m.members, [bar.id]: { ...bar, stiff: true } } };
    expect(usage(m, catalog).BS6).toBe(1);
    expect(validateStiffener(catalog, kit3, m, bar.id).remove).toBe(true);
    let n = emptyModel();
    n = addSupport(n, [3, 0, 3]).model;
    n = addMember(n, "B4", id(n, [3, 0, 3]), [3, 4, 3]).model;
    const b4 = Object.values(n.members)[0];
    expect(validateStiffener(catalog, kit3, n, b4.id).errors[0]).toMatch(/B4/);
  });

  it("estoque: 3 BS6 por Kit 3", () => {
    let m = emptyModel();
    for (let i = 0; i < 4; i++) {
      m = addSupport(m, [2 + i * 4, 0, 3]).model;
      m = addMember(m, "B6", id(m, [2 + i * 4, 0, 3]), [2 + i * 4, 6, 3]).model;
    }
    const bars = Object.values(m.members);
    for (const b of bars.slice(0, 3)) m = { ...m, members: { ...m.members, [b.id]: { ...b, stiff: true } } };
    expect(validateStiffener(catalog, kit3, m, bars[3].id).ok).toBe(false);
  });
});
