import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory, usage } from "../../src/core/inventory";
import { addRing, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { ballsPerRoll, kit3Usage, nodeEnd, ropeChains, ropeLink, ropePlan, ropeSpec } from "../../src/core/rope";
import { validateMember, validateRing, validateRope } from "../../src/core/rules";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const inv = { ...defaultInventory(catalog), unlimited: true };
const rope = (m: Model, a: string, b: string) => ropeLink(m, "CABLE", { node: a }, { node: b }).model;

describe("anel de cabo (K10)", () => {
  it("fica no ar, recebe cabos e conta como RING-P", () => {
    let m = emptyModel();
    for (const p of [[0, 0, 0], [12, 0, 0], [6, 0, 10]] as Vec3[]) m = addSupport(m, p).model;
    expect(validateRing(catalog, inv, m, [6, 6, 3], "RING-P").ok).toBe(true);
    expect(validateRing(catalog, inv, m, [6, 0.2, 3], "RING-P").ok).toBe(false);
    const r = addRing(m, [6, 6, 3], "RING-P");
    m = r.model;
    for (const p of [[0, 0, 0], [12, 0, 0], [6, 0, 10]] as Vec3[]) {
      expect(validateRope(catalog, inv, m, id(m, p), r.id).ok).toBe(true);
      m = rope(m, id(m, p), r.id);
    }
    expect(nodeEnd(m, r.id)).toBe("ring-p");
    const u = usage(m, catalog);
    expect(u["RING-P"]).toBe(1);
    expect(u["C"] ?? 0).toBe(0);
    // 3 cabos: 3 CABLE C (nas GC) e 6 clips (3 nas GC + 3 no anel)
    expect(u["CABLE-C"]).toBe(3);
    expect(u["CLIP-C"]).toBe(6);
    // anel não recebe molas
    expect(validateMember(catalog, inv, m, "B6", r.id, [6, 12, 3]).ok).toBe(false);
  });
});

describe("clip de múltiplos cabos", () => {
  it("3 cabos numa GC com clip múltiplo: 1 CABLE C + 1 M CABLE CLIP C nessa ponta", () => {
    let m = emptyModel();
    for (const p of [[0, 0, 0], [12, 0, 0], [0, 0, 10], [12, 0, 10]] as Vec3[]) m = addSupport(m, p).model;
    const r = addRing(m, [6, 6, 5], "RING-M");
    m = r.model;
    for (const p of [[0, 0, 0], [12, 0, 0], [0, 0, 10]] as Vec3[]) m = rope(m, id(m, p), r.id);
    const g = id(m, [12, 0, 10]);
    m = rope(m, g, id(m, [12, 0, 0]));
    m = rope(m, g, id(m, [0, 0, 10]));
    m = rope(m, g, r.id);
    const before = kit3Usage(catalog, m);
    m = { ...m, nodes: { ...m.nodes, [g]: { ...m.nodes[g], mclip: true } } };
    const after = kit3Usage(catalog, m);
    expect(after["MCLIP-C"]).toBe(1);
    expect(before["CABLE-C"]! - after["CABLE-C"]!).toBe(2);
    expect(before["CLIP-C"]! - after["CLIP-C"]!).toBe(3);
    expect(ropeChains(catalog, m).some((c) => c.ends.includes("multi"))).toBe(true);
  });
});

describe("plano de corte: emenda e sem cortar", () => {
  const cap = ballsPerRoll(ropeSpec(catalog));
  const fake = (balls: number[], uncut: number[] = []) => {
    // modelo sem cabos; os pedaços entram como `extra` um a um
    const m = emptyModel();
    return { m, balls, uncut };
  };
  it("pedaço maior que um rolo vira duas partes com uma emenda", () => {
    const { m } = fake([]);
    const p = ropePlan(catalog, m, { id: "x", balls: cap + 50, cutMm: (cap + 50) * 3.15 });
    expect(p.rolls.length).toBe(2);
    expect(p.splices).toBe(1);
    expect(p.rolls.flat().filter((c) => c.id === "x").map((c) => c.part)).toEqual([1, 2]);
  });
  it("cabo sem cortar ocupa um rolo só para ele", () => {
    let m = emptyModel();
    m = addSupport(m, [0, 0, 0]).model;
    m = addSupport(m, [12, 0, 0]).model;
    m = rope(m, id(m, [0, 0, 0]), id(m, [12, 0, 0]));
    const mid = Object.keys(m.members)[0];
    m = { ...m, members: { ...m.members, [mid]: { ...m.members[mid], uncut: true } } };
    const p = ropePlan(catalog, m, { id: "y", balls: 10, cutMm: 31.5 });
    expect(p.rolls.length).toBe(2);
    expect(p.rolls[0][0].uncut).toBe(true);
  });
});
