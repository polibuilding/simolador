import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { addConnector, addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { globalMoveAt, moveScopes } from "../../src/core/globalMove";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const bar = (m: Model, a: Vec3, b: Vec3) => addMember(m, "B6", id(m, a), b).model;

/** dois pavimentos: 4 pilares até 6, vigas em 6, mais 4 pilares até 12, vigas em 12 */
function predio(): Model {
  let m = emptyModel();
  const c: [number, number][] = [[0, 0], [6, 0], [6, 6], [0, 6]];
  for (const [x, z] of c) m = addSupport(m, [x, 0, z]).model;
  for (const y of [6, 12]) {
    for (const [x, z] of c) m = bar(m, [x, y - 6, z], [x, y, z]);
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = c[i];
      const [x2, z2] = c[(i + 1) % 4];
      m = addMember(m, "B6", id(m, [x1, y, z1]), [x2, y, z2]).model;
    }
  }
  return m;
}

describe("conjuntos que mexem (Tab amplia)", () => {
  it("viga do pavimento de cima: só a peça, vizinhas, o pavimento de cima e o prédio todo", () => {
    const m = predio();
    const beam = Object.values(m.members).find((b) => m.nodes[b.a].pos[1] === 12 && m.nodes[b.b].pos[1] === 12)!;
    const s = moveScopes(catalog, m, { kind: "member", id: beam.id });
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s[0].moving).toBeLessThan(s[s.length - 1].moving);
    const top = s.find((x) => x.label.includes("Z = 12"));
    expect(top).toBeTruthy();
    expect(top!.moving).toBe(4);
    expect(s[s.length - 1].kind).toBe("all");
    expect(s[s.length - 1].moving).toBe(8);
    // no pavimento de cima, mexer a viga deixa o de baixo onde está
    const g = globalMoveAt(catalog, m, { kind: "member", id: beam.id }, top!);
    expect(g.mode).not.toBe("locked");
    if (g.mode === "free") {
      const mv = g.drag([g.handle[0] + 1, g.handle[1], g.handle[2] + 0.5]);
      for (const n of Object.values(m.nodes)) if (n.pos[1] <= 6) expect(mv.model.nodes[n.id].pos).toEqual(n.pos);
      expect(mv.ids.size).toBeGreaterThan(0);
    }
  });
  it("esfera: primeiro o 'mover só o nó', depois os conjuntos", () => {
    const m = predio();
    const s = moveScopes(catalog, m, { kind: "node", id: id(m, [0, 12, 0]) }, true);
    expect(s[0].kind).toBe("local");
    expect(s.length).toBeGreaterThan(1);
  });
  it("pórtico travado por RC90 na base: nenhum conjunto mexe", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addSupport(m, [9, 0, 3]).model;
    m = bar(m, [3, 0, 3], [3, 6, 3]);
    m = bar(m, [9, 0, 3], [9, 6, 3]);
    m = bar(m, [3, 6, 3], [9, 6, 3]);
    m = addConnector(m, { code: "RC90", node: id(m, [3, 6, 3]), dirs: [[0, -1, 0], [1, 0, 0]] }).model;
    m = addConnector(m, { code: "RC90", node: id(m, [9, 6, 3]), dirs: [[0, -1, 0], [-1, 0, 0]] }).model;
    m = addConnector(m, { code: "RC90", node: id(m, [3, 0, 3]), dirs: [[0, 1, 0], [1, 0, 0]], base: true }).model;
    m = addConnector(m, { code: "RC90", node: id(m, [9, 0, 3]), dirs: [[0, 1, 0], [-1, 0, 0]], base: true }).model;
    const beam = Object.values(m.members).find((b) => m.nodes[b.a].pos[1] === 6 && m.nodes[b.b].pos[1] === 6)!;
    expect(moveScopes(catalog, m, { kind: "member", id: beam.id })).toEqual([]);
  });
});
