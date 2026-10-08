import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { usage } from "../../src/core/inventory";
import { validateMember } from "../../src/core/rules";
import { fromFile } from "../../src/core/serialization";
import { removeMember } from "../../src/core/model";

const dir = join(__dirname, "../../examples");

describe("exemplos em examples/", () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mola"))) {
    it(`${f} abre e cada barra respeita as regras`, () => {
      const { model, inventory } = fromFile(JSON.parse(readFileSync(join(dir, f), "utf8")));
      expect(Object.keys(model.nodes).length).toBeGreaterThan(0);
      // cada barra, retirada e recolocada, tem que ser válida
      for (const m of Object.values(model.members)) {
        const without = removeMember(model, m.id);
        const from = without.nodes[m.a] ? m.a : m.b;
        const to = model.nodes[from === m.a ? m.b : m.a].pos;
        expect(validateMember(catalog, inventory, without, m.code, from, to).errors).toEqual([]);
      }
    });
  }
  it("pórtico simples tem 2 GC, 2 esferas e 3 B6", () => {
    const { model } = fromFile(JSON.parse(readFileSync(join(dir, "portico-simples.mola"), "utf8")));
    expect(usage(model)).toEqual({ GC: 2, C: 2, B6: 3 });
  });
});
