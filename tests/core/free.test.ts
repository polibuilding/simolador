import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory } from "../../src/core/inventory";
import { addMember, addSupport, emptyModel, findNodeAt, len, sub, type Model, type Vec3 } from "../../src/core/model";
import { validateMember } from "../../src/core/rules";
import { nodeMoveNearest } from "../../src/core/edit";

const inv = { ...defaultInventory(catalog), unlimited: true };
const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;

describe("barras livres e coordenada Y", () => {
  it("modo Livre aceita uma direção 3D qualquer (fora dos planos e dos passos de 15°)", () => {
    let m = emptyModel();
    m = addSupport(m, [6, 0, 6]).model;
    m = addMember(m, "B6", id(m, [6, 0, 6]), [6, 6, 6]).model;
    const d: Vec3 = [0.5, 0.6, 0.4];
    const k = 6 / Math.hypot(...d);
    const to = d.map((v, i) => Math.round(([6, 6, 6][i] + v * k) * 1e4) / 1e4) as Vec3;
    expect(validateMember(catalog, inv, m, "B6", id(m, [6, 6, 6]), to).ok).toBe(false);
    expect(validateMember(catalog, inv, m, "B6", id(m, [6, 6, 6]), to, { free: true }).ok).toBe(true);
  });
  it("Y no painel: a cumeeira sobe até onde as barras deixam (ponto possível mais perto)", () => {
    // viga em balanço do topo de um pilar: a ponta livre gira em volta do topo
    let m = emptyModel();
    m = addSupport(m, [6, 0, 6]).model;
    m = addMember(m, "B6", id(m, [6, 0, 6]), [6, 6, 6]).model;
    m = addMember(m, "B6", id(m, [6, 6, 6]), [12, 6, 6]).model;
    const r = nodeMoveNearest(catalog, m, id(m, [12, 6, 6]), [11, 9, 6]);
    expect(r.error).toBeUndefined();
    expect(Math.abs(len(sub(r.move!.pos, [6, 6, 6])) - 6)).toBeLessThan(1e-3);
    expect(r.move!.pos[1]).toBeGreaterThan(6);
  });
});
