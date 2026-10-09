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

import { addConnector as addC } from "../../src/core/model";
import { connectorCandidates } from "../../src/core/snapping";
describe("CC em vários lados", () => {
  it("viga contínua sobre pilar: CC em cima e nos dois lados ao mesmo tempo; embaixo não (pilar)", () => {
    let m = emptyModel();
    m = addSupport(m, [6, 0, 3]).model;
    m = addMember(m, "B6", id(m, [6, 0, 3]), [6, 6, 3]).model;
    m = addMember(m, "B6", id(m, [6, 6, 3]), [0, 6, 3]).model;
    m = addMember(m, "B6", id(m, [6, 6, 3]), [12, 6, 3]).model;
    const n = id(m, [6, 6, 3]);
    for (const side of [[0, 1, 0], [0, 0, 1], [0, 0, -1]] as Vec3[]) {
      const c = connectorCandidates(catalog, inv, m, "CC", n).find((x) => x.kind === "connector" && x.spec.side!.join() === side.join());
      expect(c?.check.ok).toBe(true);
      if (c?.kind !== "connector") throw new Error("sem CC");
      m = addC(m, c.spec).model;
    }
    expect(Object.keys(m.connectors).length).toBe(3);
    const left = connectorCandidates(catalog, inv, m, "CC", n).filter((x) => x.check.ok);
    expect(left.length).toBe(0); // os três lados ocupados; o de baixo tem o pilar
  });
});

describe("ligação × placa (L8)", () => {
  it("RC90 não vai no canto onde a parede encosta, e a parede não entra num canto com RC90", () => {
    const m = parede();
    const wall = [id(m, [3, 0, 3]), id(m, [9, 0, 3]), id(m, [9, 6, 3]), id(m, [3, 6, 3])] as [string, string, string, string];
    const withPlate = addPlate(m, "P6x6", wall).model;
    const r = validateConnector(catalog, inv, withPlate, { code: "RC90", node: id(m, [3, 6, 3]), dirs: [[1, 0, 0], [0, -1, 0]] });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/placa/);
    const withRc = addConnector(m, { code: "RC90", node: id(m, [3, 6, 3]), dirs: [[1, 0, 0], [0, -1, 0]] }).model;
    expect(plateCandidates(catalog, inv, withRc, "P6x6")[0]?.check.ok).toBe(false);
  });
  it("CC do lado da parede não cabe; nos outros lados, sim", () => {
    let m = emptyModel();
    m = addSupport(m, [6, 0, 3]).model;
    m = addMember(m, "B6", id(m, [6, 0, 3]), [6, 6, 3]).model;
    m = addMember(m, "B6", id(m, [6, 6, 3]), [0, 6, 3]).model;
    m = addMember(m, "B6", id(m, [6, 6, 3]), [12, 6, 3]).model;
    m = addMember(m, "B6", id(m, [6, 6, 3]), [6, 12, 3]).model;
    m = addMember(m, "B6", id(m, [12, 6, 3]), [12, 12, 3]).model;
    m = addMember(m, "B6", id(m, [6, 12, 3]), [12, 12, 3]).model;
    m = addPlate(m, "P6x6", [id(m, [6, 6, 3]), id(m, [12, 6, 3]), id(m, [12, 12, 3]), id(m, [6, 12, 3])]).model;
    const n = id(m, [6, 6, 3]);
    // em cima tem barra (L6); dos lados ±Z a parede não atrapalha
    expect(validateConnector(catalog, inv, m, { code: "CC", node: n, dirs: [[1, 0, 0]], side: [0, 0, 1] }).ok).toBe(true);
    // sem a barra de cima, o lado +Y fica livre de barra mas a parede ocupa
    const noTop = { ...m, members: Object.fromEntries(Object.entries(m.members).filter(([, x]) => !(x.a === n && m.nodes[x.b].pos[1] === 12))) };
    const r = validateConnector(catalog, inv, noTop, { code: "CC", node: n, dirs: [[1, 0, 0]], side: [0, 1, 0] });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/placa/);
  });
});
