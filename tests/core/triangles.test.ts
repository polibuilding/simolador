import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { barTriangleGuides } from "../../src/core/snapping";
import type { Model } from "../../src/core/model";

const inv = { kits: { 1: 4, 2: 4 }, unlimited: true };
const empty = (nodes: Model["nodes"], members: Model["members"] = {}): Model =>
  ({ nodes, members, plates: {}, connectors: {}, nextId: 100 }) as unknown as Model;

describe("pontos amarelos de barras (triângulos)", () => {
  // pórtico: dois pilares B6 e viga B12 no topo (y = 6)
  const portico = empty(
    {
      n1: { id: "n1", kind: "support", pos: [0, 0, 0] },
      n2: { id: "n2", kind: "support", pos: [12, 0, 0] },
      n3: { id: "n3", kind: "sphere", pos: [0, 6, 0] },
      n4: { id: "n4", kind: "sphere", pos: [12, 6, 0] },
    },
    {
      m1: { id: "m1", code: "B6", a: "n1", b: "n3" },
      m2: { id: "m2", code: "B6", a: "n2", b: "n4" },
      m3: { id: "m3", code: "B12", a: "n3", b: "n4" },
    },
  );

  it("B12 do topo do pilar: vértice do triângulo equilátero acima da viga, com as duas barras", () => {
    const g = barTriangleGuides(catalog, inv, portico, "B12", "n3");
    const top = g.find((x) => Math.abs(x.pos[0] - 6) < 1e-3 && Math.abs(x.pos[1] - (6 + 6 * Math.sqrt(3))) < 1e-3 && Math.abs(x.pos[2]) < 1e-3);
    expect(top).toBeTruthy();
    expect(top!.text).toMatch(/equilátero de B12/);
    expect(top!.closes).toEqual([{ code: "B12", fromId: "n4" }]);
    expect(Object.keys(top!.model.members).length).toBe(5);
  });

  it("B6: triângulo equilátero com o pilar; nada abaixo da chapa; ângulos < 45° ficam de fora", () => {
    const g = barTriangleGuides(catalog, inv, portico, "B6", "n3");
    expect(g.some((x) => /equilátero de B6 com a esfera \(0; 0; 0\)/.test(x.text))).toBe(true);
    // 6–6–12 é degenerado e 6–12–12 faria 29° com a viga na outra ponta
    expect(g.some((x) => x.closes.some((c) => c.fromId === "n4"))).toBe(false);
    for (const x of g) expect(x.bar.check.ok).toBe(true);
    for (const x of g) expect(x.pos[1]).toBeGreaterThan(0.4);
    expect(barTriangleGuides(catalog, inv, portico, "B4", "n3")).toEqual([]);
  });

  it("isósceles: B12 até um ponto a B6 da outra esfera (sem viga entre elas)", () => {
    const semViga = { ...portico, members: { m1: portico.members.m1, m2: portico.members.m2 } };
    const g = barTriangleGuides(catalog, inv, semViga, "B12", "n3");
    expect(g.some((x) => /isósceles B12–B6–B12/.test(x.text))).toBe(true);
  });

  it("pirâmide sobre um quadrado 6 × 6: ápice a 6 dos cantos", () => {
    const q = empty({
      a: { id: "a", kind: "sphere", pos: [0, 6, 0] },
      b: { id: "b", kind: "sphere", pos: [6, 6, 0] },
      c: { id: "c", kind: "sphere", pos: [6, 6, 6] },
      d: { id: "d", kind: "sphere", pos: [0, 6, 6] },
    }, {
      m1: { id: "m1", code: "B6", a: "a", b: "b" },
      m2: { id: "m2", code: "B6", a: "b", b: "c" },
      m3: { id: "m3", code: "B6", a: "c", b: "d" },
      m4: { id: "m4", code: "B6", a: "d", b: "a" },
    });
    const g = barTriangleGuides(catalog, inv, q, "B6", "a");
    const apex = g.find((x) => Math.abs(x.pos[0] - 3) < 1e-3 && Math.abs(x.pos[2] - 3) < 1e-3 && x.pos[1] > 6);
    expect(apex).toBeTruthy();
    expect(apex!.pos[1]).toBeCloseTo(6 + Math.sqrt(18), 3);
    expect(apex!.closes.length).toBeGreaterThanOrEqual(2);
  });
});
