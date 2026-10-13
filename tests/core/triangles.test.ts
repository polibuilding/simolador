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

  it("B6: nada fecha na GC inclinando mais de 40°; nada abaixo da chapa; ângulos pequenos ficam de fora", () => {
    const g = barTriangleGuides(catalog, inv, portico, "B6", "n3");
    // o triângulo equilátero com o pilar pediria uma mola a 60° da vertical saindo da GC
    expect(g.some((x) => x.closes.some((c) => c.fromId === "n1"))).toBe(false);
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

describe("pirâmides com molas diferentes (ângulo mínimo de 40°)", () => {
  const ring = (pts: [number, number][], code: string, y = 6): Model => {
    const nodes: Model["nodes"] = {};
    const members: Model["members"] = {};
    pts.forEach(([x, z], i) => (nodes[`c${i}`] = { id: `c${i}`, kind: "sphere", pos: [x, y, z] }));
    pts.forEach((_, i) => (members[`m${i}`] = { id: `m${i}`, code, a: `c${i}`, b: `c${(i + 1) % pts.length}` }));
    return empty(nodes, members);
  };
  const apexOf = (g: ReturnType<typeof barTriangleGuides>, n: number) => g.find((x) => x.pos[1] > 6 && x.closes.length === n - 1);

  it("base triangular de B6, lados de B4 (laranja, fecha nas três)", () => {
    const h = 3 * Math.sqrt(3);
    const m = ring([[0, 0], [6, 0], [3, h]], "B6");
    const g = barTriangleGuides(catalog, inv, m, "B4", "c0");
    const apex = apexOf(g, 3);
    expect(apex).toBeTruthy();
    expect(apex!.pos[1]).toBeCloseTo(6 + 2, 3); // altura √(16 − 12) = 2
  });

  it("base pequena e lados grandes: no topo, duas molas vizinhas fecham ângulo pequeno", () => {
    // B4 na base e B6 nos lados: 2·asen(2/6) = 38,9° entre as molas do topo, abaixo dos 40°
    const m = ring([[0, 0], [4, 0], [4, 4], [0, 4]], "B4");
    expect(apexOf(barTriangleGuides(catalog, inv, m, "B6", "c0"), 4)).toBeUndefined();
    // com o parâmetro em 38° (se o kit aceitar), a pirâmide aparece
    const cat38 = { ...catalog, settings: { ...catalog.settings, angulo_minimo_membros_graus: 38 } };
    const apex = apexOf(barTriangleGuides(cat38, inv, m, "B6", "c0"), 4);
    expect(apex).toBeTruthy();
    expect(apex!.pos[1]).toBeCloseTo(6 + Math.sqrt(36 - 8), 3);
  });
});
