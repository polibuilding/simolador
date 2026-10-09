import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory, usage } from "../../src/core/inventory";
import { addConnector, addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { cutSelection, makeClip, pasteClip, repeatClip, transformClip } from "../../src/core/clipboard";
import type { Sel } from "../../src/core/edit";

const inv = { ...defaultInventory(catalog), kits: { 1: 2, 2: 2 } };
const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const all = (m: Model): Sel[] => [
  ...Object.keys(m.nodes).map((k) => ({ kind: "node" as const, id: k })),
  ...Object.keys(m.members).map((k) => ({ kind: "member" as const, id: k })),
  ...Object.keys(m.plates).map((k) => ({ kind: "plate" as const, id: k })),
  ...Object.keys(m.connectors).map((k) => ({ kind: "connector" as const, id: k })),
];
function portico(x0 = 0): Model {
  let m = emptyModel();
  m = addSupport(m, [x0, 0, 3]).model;
  m = addSupport(m, [x0 + 6, 0, 3]).model;
  m = addMember(m, "B6", id(m, [x0, 0, 3]), [x0, 6, 3]).model;
  m = addMember(m, "B6", id(m, [x0 + 6, 0, 3]), [x0 + 6, 6, 3]).model;
  m = addMember(m, "B6", id(m, [x0, 6, 3]), [x0 + 6, 6, 3]).model;
  return m;
}

describe("copiar e colar", () => {
  it("repetir um vão 2 vezes em X: os pilares do meio são compartilhados", () => {
    const m = portico();
    const clip = makeClip(m, all(m))!;
    const r = repeatClip(catalog, inv, m, clip, [6, 0, 0], 2);
    expect(r.error).toBeNull();
    expect(usage(r.model)).toEqual({ GC: 4, C: 4, B6: 7 });
  });
  it("empilhar um pavimento: GC colada no alto vira esfera e se une ao topo dos pilares", () => {
    const m = portico();
    const clip = makeClip(m, all(m))!;
    const r = pasteClip(catalog, inv, m, clip, [clip.anchor[0], 6, clip.anchor[2]]);
    expect(r.check.ok).toBe(true);
    expect(usage(r.model)).toEqual({ GC: 2, C: 4, B6: 6 });
  });
  it("colar em cima do original não acrescenta nada", () => {
    const m = portico();
    const clip = makeClip(m, all(m))!;
    expect(pasteClip(catalog, inv, m, clip, clip.anchor).check.ok).toBe(false);
  });
  it("espelhar em X leva junto a direção da RC90", () => {
    let m = portico();
    m = addConnector(m, { code: "RC90", node: id(m, [0, 6, 3]), dirs: [[1, 0, 0], [0, -1, 0]] }).model;
    const clip = transformClip(makeClip(m, all(m))!, 0, true, false);
    expect(clip.connectors[0].dirs[0]).toEqual([-1, 0, 0]);
  });
  it("mover a seleção: corta e cola 6 módulos para o lado", () => {
    const m = portico();
    const sels = all(m);
    const clip = makeClip(m, sels)!;
    const base = cutSelection(m, sels);
    expect(Object.keys(base.nodes).length).toBe(0);
    const r = pasteClip(catalog, inv, base, clip, [clip.anchor[0] + 6, 0, clip.anchor[2]]);
    expect(r.check.ok).toBe(true);
    expect(findNodeAt(r.model, [12, 6, 3])).toBeTruthy();
  });
});
