import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory } from "../../src/core/inventory";
import { addConnector, addMember, addPlate, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { validateConnector, validateMember } from "../../src/core/rules";
import { plateCandidates } from "../../src/core/snapping";
import { rotateSelection, selAfter } from "../../src/core/edit";

const inv = defaultInventory(catalog);
const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;

/** Parede 6×6: GC (3,3) e (9,3), pilares e viga. */
function parede(): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addSupport(m, [9, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [9, 0, 3]), [9, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
  return m;
}

describe("conflitos", () => {
  it("RC90 não vai no canto por onde sai uma diagonal, e vice-versa", () => {
    let m = parede();
    m = addMember(m, "D6x6", id(m, [3, 6, 3]), [9, 0, 3]).model; // sai do topo esquerdo, para baixo e para a direita
    const top = id(m, [3, 6, 3]);
    const corner = validateConnector(catalog, inv, m, { code: "RC90", node: top, dirs: [[1, 0, 0], [0, -1, 0]] });
    expect(corner.ok).toBe(false);
    expect(corner.errors.join()).toMatch(/diagonal/);
    // no topo direito a diagonal não sai: o canto está livre
    expect(validateConnector(catalog, inv, m, { code: "RC90", node: id(m, [9, 6, 3]), dirs: [[-1, 0, 0], [0, -1, 0]] }).ok).toBe(true);
    let m2 = parede();
    m2 = addConnector(m2, { code: "RC90", node: id(m2, [3, 6, 3]), dirs: [[1, 0, 0], [0, -1, 0]] }).model;
    expect(validateMember(catalog, inv, m2, "D6x6", id(m2, [3, 6, 3]), [9, 0, 3]).ok).toBe(false);
  });
  it("placa e diagonal não dividem o mesmo vão", () => {
    const m = parede();
    const withPlate = addPlate(m, "P6x6", [id(m, [3, 0, 3]), id(m, [9, 0, 3]), id(m, [9, 6, 3]), id(m, [3, 6, 3])]).model;
    expect(validateMember(catalog, inv, withPlate, "D6x6", id(withPlate, [3, 6, 3]), [9, 0, 3]).ok).toBe(false);
    const withCable = addMember(m, "D6x6", id(m, [3, 6, 3]), [9, 0, 3]).model;
    const p = plateCandidates(catalog, inv, withCable, "P6x6")[0];
    expect(p?.check.ok).toBe(false);
  });
  it("barra não atravessa placa", () => {
    let m = parede();
    m = addPlate(m, "P6x6", [id(m, [3, 0, 3]), id(m, [9, 0, 3]), id(m, [9, 6, 3]), id(m, [3, 6, 3])]).model;
    m = addSupport(m, [6, 0, 0]).model;
    m = addMember(m, "B4", id(m, [6, 0, 0]), [6, 4, 0]).model;
    const r = validateMember(catalog, inv, m, "B6", id(m, [6, 4, 0]), [6, 4, 6]); // fura a parede em (6, 4, 3)
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/placa/);
  });
});

describe("R contínuo", () => {
  it("a peça girada continua selecionável para o próximo R", () => {
    const m = parede();
    const beam = Object.values(m.members).find((x) => m.nodes[x.a].pos[1] === 6 && m.nodes[x.b].pos[1] === 6)!;
    // viga solta numa ponta: tira o pilar direito
    let free = emptyModel();
    free = addSupport(free, [3, 0, 3]).model;
    free = addMember(free, "B6", id(free, [3, 0, 3]), [3, 6, 3]).model;
    free = addMember(free, "B6", id(free, [3, 6, 3]), [9, 6, 3]).model;
    const b = Object.values(free.members).find((x) => free.nodes[x.b].pos[0] === 9)!;
    let sel = { kind: "member" as const, id: b.id };
    const seen = new Set<string>();
    let cur = free;
    for (let i = 0; i < 4; i++) {
      const r = rotateSelection(catalog, inv, cur, sel, { inclined: false });
      expect(r.model).toBeTruthy();
      const next = selAfter(cur, r.model!, sel);
      expect(next).not.toBeNull();
      const mm = r.model!.members[next!.id];
      seen.add(r.model!.nodes[mm.b].pos.join(","));
      cur = r.model!;
      sel = next as typeof sel;
    }
    expect(seen.size).toBeGreaterThan(1);
    void beam;
  });
});
