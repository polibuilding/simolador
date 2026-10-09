import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory } from "../../src/core/inventory";
import { addMember, addSupport, boardsOf, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { addBoard, boardAsModel, boardGap, filterByBoards, removeBoard, setBoardGap } from "../../src/core/boards";
import { validateMember, validateSupport } from "../../src/core/rules";
import { supportPosition } from "../../src/core/snapping";

const inv = defaultInventory(catalog);
const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const pilar = (m: Model, x: number, z: number) => {
  m = addSupport(m, [x, 0, z]).model;
  return addMember(m, "B6", id(m, [x, 0, z]), [x, 6, z]).model;
};

describe("várias chapas", () => {
  it("chapa ao lado em +X: GC vale nela; distância muda e leva a estrutura junto", () => {
    let m = addBoard(catalog, emptyModel(), "b1", "+x").model!;
    expect(boardsOf(m).map((b) => [b.id, b.x, b.z])).toEqual([["b1", 0, 0], ["b2", 18, 0]]);
    expect(validateSupport(catalog, inv, m, [25, 0, 6]).ok).toBe(true);
    expect(validateSupport(catalog, inv, m, [40, 0, 6]).ok).toBe(false);
    m = pilar(m, 25, 6);
    const r = setBoardGap(catalog, m, "b2", 6);
    expect(r.error).toBeUndefined();
    expect(boardGap(catalog, r.model!, boardsOf(r.model!)[1])).toBe(6);
    expect(findNodeAt(r.model!, [31, 6, 6])).toBeTruthy();
    // grade da chapa 2 começa no canto dela
    expect(supportPosition(catalog, { x: 24.6, z: 3.2 }, true, boardsOf(r.model!))).toEqual([25, 0, 3]);
  });
  it("viga entre pilares de chapas diferentes (a 6 M): liga as duas e trava a distância", () => {
    let m = addBoard(catalog, emptyModel(), "b1", "+x").model!;
    m = setBoardGap(catalog, m, "b2", 6).model!;
    m = pilar(m, 18, 6);
    m = pilar(m, 24, 6);
    expect(validateMember(catalog, inv, m, "B6", id(m, [18, 6, 6]), [24, 6, 6]).ok).toBe(true);
    m = addMember(m, "B6", id(m, [18, 6, 6]), [24, 6, 6]).model;
    expect(setBoardGap(catalog, m, "b2", 4).error).toMatch(/liga esta chapa/);
    expect(removeBoard(catalog, m, "b2").error).toMatch(/liga esta chapa/);
    // pranchas só da chapa 1: leva a estrutura inteira que se apoia nela (com a ponte)
    expect(Object.keys(filterByBoards(catalog, m, ["b1"]).nodes).length).toBe(4);
  });
  it("exportar a chapa: estrutura vai para o canto (0, 0); apagar a chapa leva o que está só nela", () => {
    let m = addBoard(catalog, emptyModel(), "b1", "+z").model!;
    m = pilar(m, 3, 3);
    m = pilar(m, 5, 15);
    const only2 = boardAsModel(catalog, m, "b2");
    expect(Object.values(only2.nodes).map((n) => n.pos.join(";")).sort()).toEqual(["5;0;3", "5;6;3"]);
    const r = removeBoard(catalog, m, "b2");
    expect(Object.keys(r.model!.nodes).length).toBe(2);
    expect(boardsOf(r.model!).length).toBe(1);
  });
});
