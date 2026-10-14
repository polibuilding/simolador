import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { addConnector, addMember, addPlate, addSupport, emptyModel, findNodeAt, len, sub, type Model, type Vec3 } from "../../src/core/model";
import { bodyMoveOptions } from "../../src/core/edit";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;

/** pórtico B6 com placa P6x6 no meio: duas GC, dois pilares, viga no topo */
function porticoComPlaca(): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addSupport(m, [9, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [9, 0, 3]), [9, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
  m = addPlate(m, "P6x6", [id(m, [3, 0, 3]), id(m, [9, 0, 3]), id(m, [9, 6, 3]), id(m, [3, 6, 3])]).model;
  return m;
}
const beam = (m: Model) => Object.values(m.members).find((x) => m.nodes[x.a].pos[1] === 6 && m.nodes[x.b].pos[1] === 6)!;

describe("girar o conjunto em torno das GC (duplo clique numa mola)", () => {
  it("pórtico com placa em duas GC: gira em torno da linha entre as GC (círculo do meio da viga)", () => {
    const m = porticoComPlaca();
    const set = bodyMoveOptions(catalog, m, { kind: "member", id: beam(m).id });
    expect(set.locked).toBeUndefined();
    expect(set.anchors).toHaveLength(2);
    expect(set.ids.size).toBe(2);
    expect(set.locus?.kind).toBe("circle");
    // inclina 30° para +z: os topos vão junto, as molas não mudam de tamanho, a placa continua retângulo
    const t = Math.PI / 6;
    const target: Vec3 = [6, 6 * Math.cos(t), 3 + 6 * Math.sin(t)];
    const mv = set.evalAt!(target)!;
    expect(mv.check.ok).toBe(true);
    const top = mv.model.nodes[id(m, [3, 6, 3])].pos;
    expect(top[1]).toBeCloseTo(6 * Math.cos(t), 3);
    expect(top[2]).toBeCloseTo(3 + 6 * Math.sin(t), 3);
    for (const x of Object.values(mv.model.members)) {
      expect(len(sub(mv.model.nodes[x.a].pos, mv.model.nodes[x.b].pos))).toBeCloseTo(6, 3);
    }
  });

  it("deitado demais: a mola na GC passa do limite (G12) e o caminho fica vermelho ali", () => {
    const m = porticoComPlaca();
    const set = bodyMoveOptions(catalog, m, { kind: "member", id: beam(m).id });
    const t = (60 * Math.PI) / 180; // 30° com a chapa < 40°
    const mv = set.evalAt!([6, 6 * Math.cos(t), 3 + 6 * Math.sin(t)])!;
    expect(mv.check.ok).toBe(false);
  });

  it("uma GC só (pilar com balanço): gira em volta dela (esfera)", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
    const b = Object.values(m.members).find((x) => m.nodes[x.b].pos[0] === 9)!;
    const set = bodyMoveOptions(catalog, m, { kind: "member", id: b.id });
    expect(set.locus?.kind).toBe("sphere");
    expect(set.pivot).toEqual([3, 0, 3]);
  });

  it("três GC fora de uma linha, ou RC90 na base: travado", () => {
    let m = porticoComPlaca();
    m = addSupport(m, [3, 0, 9]).model;
    m = addMember(m, "B6", id(m, [3, 0, 9]), [3, 6, 9]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [3, 6, 9]).model;
    expect(bodyMoveOptions(catalog, m, { kind: "member", id: beam(m).id }).locked).toMatch(/fora de uma linha/);
    let n = porticoComPlaca();
    n = addConnector(n, { code: "RC90", node: id(n, [3, 0, 3]), dirs: [[0, 1, 0], [1, 0, 0]], base: true }).model;
    expect(bodyMoveOptions(catalog, n, { kind: "member", id: beam(n).id }).locked).toMatch(/RC90/);
  });

  it("sem GC: não gira (arrastar move a estrutura)", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    const col = Object.values(m.members)[0];
    // a coluna toca a GC: o conjunto é só o topo, apoiado na GC
    expect(bodyMoveOptions(catalog, m, { kind: "member", id: col.id }).locked).toBeUndefined();
  });
});
