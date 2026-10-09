import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { catalog } from "../../src/core/catalog";
import { validateConnector, validateMember, validateMovedModel } from "../../src/core/rules";
import { fromFile } from "../../src/core/serialization";
import type { Model } from "../../src/core/model";

const inv = { kits: { 1: 4, 2: 4 }, unlimited: true };
const mk = (nodes: Record<string, [number, number, number]>, members: [string, string, string][] = [], connectors: Model["connectors"] = {}): Model =>
  ({
    nodes: Object.fromEntries(Object.entries(nodes).map(([id, pos]) => [id, { id, kind: pos[1] === 0 ? "support" : "sphere", pos }])),
    members: Object.fromEntries(members.map(([code, a, b], i) => [`m${i}`, { id: `m${i}`, code, a, b }])),
    plates: {}, connectors, nextId: 100,
  }) as unknown as Model;

describe("cruzamentos", () => {
  it("C7: barra não cruza outra barra (em X, em alturas iguais)", () => {
    const m = mk({ a: [0, 3, 3], b: [6, 3, 3], c: [3, 3, 0] }, [["B6", "a", "b"]]);
    const r = validateMember(catalog, inv, m, "B6", "c", [3, 3, 6], { free: true });
    expect(r.errors).toContain("A barra cruzaria outra barra.");
    // um módulo acima passa
    expect(validateMember(catalog, inv, mk({ a: [0, 3, 3], b: [6, 3, 3], c: [3, 4, 0] }, [["B6", "a", "b"]]), "B6", "c", [3, 4, 6], { free: true }).ok).toBe(true);
  });

  it("C7: duas diagonais podem se cruzar em X; diagonal não cruza barra", () => {
    const sq = mk({ a: [0, 6, 0], b: [6, 6, 0], c: [6, 12, 0], d: [0, 12, 0] }, [["B6", "a", "b"], ["B6", "b", "c"], ["B6", "c", "d"], ["B6", "d", "a"], ["D6x6", "a", "c"]]);
    expect(validateMember(catalog, inv, sq, "D6x6", "b", [0, 12, 0]).errors).not.toContain("A diagonal cruzaria uma barra.");
    const withBar = mk({ a: [0, 6, 0], b: [6, 6, 0], c: [6, 12, 0], d: [0, 12, 0], e: [3, 6, 0], f: [3, 12, 0] }, [["B6", "e", "f"]]);
    expect(validateMember(catalog, inv, withBar, "D6x6", "a", [6, 12, 0]).errors).toContain("A diagonal cruzaria uma barra.");
  });

  it("C6: a esfera nova não cai no meio de uma barra", () => {
    const m = mk({ a: [0, 3, 3], b: [6, 3, 3], c: [3, 3, -1] }, [["B6", "a", "b"]]);
    expect(validateMember(catalog, inv, m, "B4", "c", [3, 3, 3]).errors[0]).toMatch(/esfera ficaria em cima de uma barra/);
  });

  it("L9: barra não passa por dentro de uma RC90; RC90 não cruza RC90", () => {
    const m = mk({ o: [0, 6, 0], x: [6, 6, 0], y: [0, 12, 0] }, [["B6", "o", "x"], ["B6", "o", "y"]], {
      k1: { id: "k1", code: "RC90", node: "o", dirs: [[1, 0, 0], [0, 1, 0]] },
    } as unknown as Model["connectors"]);
    const s = Math.SQRT1_2 * 6;
    expect(validateMember(catalog, inv, m, "B6", "o", [s, 6 + s, 0], { free: true }).errors).toContain("A barra passaria por dentro de uma RC90.");
    // RC90 em canto perpendicular que divide a mola +x: só encosta, vale
    const m2 = mk({ o: [0, 6, 0], x: [6, 6, 0], y: [0, 12, 0], z: [0, 6, 6] }, [["B6", "o", "x"], ["B6", "o", "y"], ["B6", "o", "z"]], {
      k1: { id: "k1", code: "RC90", node: "o", dirs: [[1, 0, 0], [0, 1, 0]] },
    } as unknown as Model["connectors"]);
    expect(validateConnector(catalog, inv, m2, { code: "RC90", node: "o", dirs: [[1, 0, 0], [0, 0, 1]] }).ok).toBe(true);
    // RC90 no plano da barra inclinada a 45°: cruza a primeira
    const m3 = mk({ o: [0, 6, 0], x: [6, 6, 0], y: [0, 12, 0], p: [s, 6 + s, 0], q: [-s, 6 + s, 0] }, [["B6", "o", "x"], ["B6", "o", "y"], ["B6", "o", "p"], ["B6", "o", "q"]], {
      k1: { id: "k1", code: "RC90", node: "o", dirs: [[1, 0, 0], [0, 1, 0]] },
    } as unknown as Model["connectors"]);
    const d1: [number, number, number] = [Math.SQRT1_2, Math.SQRT1_2, 0];
    const d2: [number, number, number] = [-Math.SQRT1_2, Math.SQRT1_2, 0];
    expect(validateConnector(catalog, inv, m3, { code: "RC90", node: "o", dirs: [d1, d2] }).errors).toContain("Essa RC90 cruzaria outra RC90.");
  });

  it("os exemplos continuam válidos", () => {
    for (const f of fs.readdirSync("examples").filter((x) => x.endsWith(".mola"))) {
      const model = fromFile(JSON.parse(fs.readFileSync(`examples/${f}`, "utf8"))).model;
      const r = validateMovedModel(catalog, model, new Set(Object.keys(model.nodes)));
      expect([f, r.errors]).toEqual([f, []]);
    }
  });
});
