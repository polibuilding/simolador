import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { addConnector, addMember, addSupport, emptyModel, findNodeAt, len, sub, type Model, type Vec3 } from "../../src/core/model";
import { nodeMoveOptions } from "../../src/core/edit";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const close = (a: Vec3, b: Vec3) => len(sub(a, b)) < 1e-3;

function pilarComBalanco(): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model; // viga em balanço: vai junto
  return m;
}

describe("mover só o nó", () => {
  it("pilar com balanço: o topo gira em torno da GC (passos de 15°) e o balanço vai junto", () => {
    const m = pilarComBalanco();
    const top = id(m, [3, 6, 3]);
    const { options, locked } = nodeMoveOptions(catalog, m, top);
    expect(locked).toBeUndefined();
    const k = 6 * Math.sin(Math.PI / 12);
    const want: Vec3 = [3 - k, 6 * Math.cos(Math.PI / 12), 3];
    const o = options.find((x) => close(x.pos, want.map((v) => Math.round(v * 1e4) / 1e4) as Vec3));
    expect(o?.check.ok).toBe(true);
    // a ponta do balanço andou o mesmo tanto
    const tip = Object.values(o!.model.nodes).find((n) => n.id !== top && n.kind === "sphere")!;
    expect(close(tip.pos, [9 - k, o!.pos[1], 3])).toBe(true);
    // o comprimento do pilar não muda
    expect(Math.abs(len(sub(o!.pos, [3, 0, 3])) - 6)).toBeLessThan(1e-3);
  });
  it("pórtico: o canto gira em torno do eixo GC–outro canto (círculo); há posições válidas", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addSupport(m, [9, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    m = addMember(m, "B6", id(m, [9, 0, 3]), [9, 6, 3]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
    const { options } = nodeMoveOptions(catalog, m, id(m, [3, 6, 3]));
    const ok = options.filter((o) => o.check.ok);
    expect(ok.length).toBeGreaterThan(0);
    for (const o of ok) {
      expect(Math.abs(len(sub(o.pos, [3, 0, 3])) - 6)).toBeLessThan(1e-3);
      expect(Math.abs(len(sub(o.pos, [9, 6, 3])) - 6)).toBeLessThan(1e-3);
    }
  });
  it("RC90 no canto trava o nó", () => {
    let m = pilarComBalanco();
    m = addConnector(m, { code: "RC90", node: id(m, [3, 6, 3]), dirs: [[0, -1, 0], [1, 0, 0]] }).model;
    // a RC90 está entre o pilar (vínculo) e o balanço: o ângulo do pilar no nó mudaria
    expect(nodeMoveOptions(catalog, m, id(m, [3, 6, 3])).locked).toMatch(/RC90/);
  });
  it("GC com pilar vertical não anda sozinha; esfera solta do resto pede Mover estrutura", () => {
    const m = pilarComBalanco();
    expect(nodeMoveOptions(catalog, m, id(m, [3, 0, 3])).locked).toBeTruthy();
  });
});
