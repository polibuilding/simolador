import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { connectReach } from "../../src/core/edit";
import { len, sub, type Model } from "../../src/core/model";
import { validateMovedModel } from "../../src/core/rules";

const inv = { kits: { 1: 4, 2: 4 }, unlimited: true };
const mk = (nodes: Record<string, [number, number, number]>, members: [string, string, string][] = [], connectors: Model["connectors"] = {}): Model =>
  ({
    nodes: Object.fromEntries(Object.entries(nodes).map(([id, pos]) => [id, { id, kind: pos[1] === 0 ? "support" : "sphere", pos }])),
    members: Object.fromEntries(members.map(([code, a, b], i) => [`m${i}`, { id: `m${i}`, code, a, b }])),
    plates: {}, connectors, nextId: 100,
  }) as unknown as Model;

describe("ligar duas esferas (dois cliques)", () => {
  it("na distância certa: só liga", () => {
    const m = mk({ g1: [0, 0, 0], t1: [0, 6, 0], g2: [6, 0, 0], t2: [6, 6, 0] }, [["B6", "g1", "t1"], ["B6", "g2", "t2"]]);
    const r = connectReach(catalog, inv, m, "B6", "t1", "t2");
    expect(r.error).toBeUndefined();
    expect(r.moved).toBe(0);
    expect(Object.keys(r.model!.members).length).toBe(3);
  });

  it("longe: a segunda esfera gira no pilar até a mola caber", () => {
    // pilares a 8 M: a viga B6 não cabe; o topo do segundo pilar inclina para dentro
    const m = mk({ g1: [0, 0, 0], t1: [0, 6, 0], g2: [8, 0, 0], t2: [8, 6, 0] }, [["B6", "g1", "t1"], ["B6", "g2", "t2"]]);
    const r = connectReach(catalog, inv, m, "B6", "t1", "t2");
    expect(r.error).toBeUndefined();
    const t2 = r.model!.nodes.t2.pos;
    expect(len(sub(t2, [0, 6, 0]))).toBeCloseTo(6, 3); // viga com 6 M
    expect(len(sub(t2, [8, 0, 0]))).toBeCloseTo(6, 3); // pilar continua com 6 M
    expect(r.moved!).toBeGreaterThan(0.5);
    expect(validateMovedModel(catalog, r.model!, new Set(Object.keys(r.model!.nodes))).ok).toBe(true);
  });

  it("travada: RC90 no pilar só deixa tombar de lado (L10), sem chegar perto; perto demais da primeira não dá", () => {
    const m = mk({ g1: [0, 0, 0], t1: [0, 6, 0], g2: [8, 0, 0], t2: [8, 6, 0], x: [14, 6, 0] }, [["B6", "g1", "t1"], ["B6", "g2", "t2"], ["B6", "t2", "x"]], {
      k: { id: "k", code: "RC90", node: "t2", dirs: [[0, -1, 0], [1, 0, 0]] },
    } as unknown as Model["connectors"]);
    expect(connectReach(catalog, inv, m, "B6", "t1", "t2").error).toMatch(/não deixam ela chegar/);
    // B12 entre topos a 4 M um do outro, com B4 no pilar curto: não alcança
    const m2 = mk({ g1: [0, 0, 0], t1: [0, 4, 0], g2: [2, 0, 0], t2: [2, 4, 0] }, [["B4", "g1", "t1"], ["B4", "g2", "t2"]]);
    expect(connectReach(catalog, inv, m2, "B12", "t1", "t2").error).toBeTruthy();
  });
});
