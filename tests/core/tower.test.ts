import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory } from "../../src/core/inventory";
import { addMember, addPlate, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { validateMember } from "../../src/core/rules";

const inv = { ...defaultInventory(catalog), unlimited: true };
const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const h = 5.1962;

describe("torre triangular com placa (contraventamento em altura)", () => {
  it("diagonal D6x6 do topo da placa até a esfera do terceiro pilar (mais baixo) vale", () => {
    let m = emptyModel();
    for (const p of [[3, 0, 3], [9, 0, 3], [6, 0, 3 + h]] as Vec3[]) m = addSupport(m, p).model;
    m = addMember(m, "B12", id(m, [3, 0, 3]), [3, 12, 3]).model;
    m = addMember(m, "B12", id(m, [9, 0, 3]), [9, 12, 3]).model;
    m = addMember(m, "B6", id(m, [6, 0, 3 + h]), [6, 6, 3 + h]).model;
    m = addMember(m, "B6", id(m, [3, 12, 3]), [9, 12, 3]).model;
    m = addPlate(m, "P6x12", [id(m, [3, 0, 3]), id(m, [9, 0, 3]), id(m, [9, 12, 3]), id(m, [3, 12, 3])]).model;
    for (const top of [[3, 12, 3], [9, 12, 3]] as Vec3[]) {
      expect(validateMember(catalog, inv, m, "D6x6", id(m, top), [6, 6, 3 + h]).ok).toBe(true);
    }
    // e uma diagonal de comprimento errado continua recusada
    expect(validateMember(catalog, inv, m, "D4x6", id(m, [3, 12, 3]), [6, 6, 3 + h]).ok).toBe(false);
  });
  it("peça repetida entre as mesmas esferas: mensagem clara", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    const r = validateMember(catalog, inv, m, "B6", id(m, [3, 0, 3]), [3, 6, 3]);
    expect(r.errors[0]).toMatch(/Já existe uma peça entre/);
  });
});
