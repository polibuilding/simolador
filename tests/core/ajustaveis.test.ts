import { describe, expect, it } from "vitest";
import { buildCatalog } from "../../src/core/catalog";
import catalogJson from "../../data/catalog.json";
import kitsJson from "../../data/kits.json";
import { ADJ_BAR, ADJ_TIE, adjustableNeeds, adjustablePiece, ensureAdjustable } from "../../src/core/adjustable";
import { defaultInventory, minKits, usage } from "../../src/core/inventory";
import { addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { validateMember } from "../../src/core/rules";
import { fromFile, toFile } from "../../src/core/serialization";
import { registerUserPieces, userPiecesUsed } from "../../src/core/userPieces";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const fresh = () => buildCatalog(catalogJson, kitsJson); // catálogo próprio (as peças criadas não vazam entre testes)

function dois(): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addSupport(m, [8, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  return addMember(m, "B6", id(m, [8, 0, 3]), [8, 6, 3]).model;
}

describe("barra e tirante ajustáveis (2.x)", () => {
  it("código, regulável e massa pela distância", () => {
    const cat = fresh();
    const b = adjustablePiece(cat, ADJ_BAR, 5.123);
    expect(b.code).toBe("B5.12");
    expect(b.spanM).toEqual([5.12]);
    expect(b.notes).toBe("regulável A.B4-B6");
    expect(b.color).toBe("#000000");
    expect(adjustablePiece(cat, ADJ_BAR, 16).notes).toBe("fabricar");
    const t = adjustablePiece(cat, ADJ_TIE, 7.211);
    expect(t.code).toBe("T7.21");
    expect(t.type).toBe("cable");
    expect(t.spanM).toEqual([7.21, 0]);
  });

  it("liga duas esferas a 5 M com uma barra ajustável, que vale como barra", () => {
    const cat = fresh();
    const m = dois();
    const p = adjustablePiece(cat, ADJ_BAR, 5);
    ensureAdjustable(cat, p);
    const inv = { ...defaultInventory(cat), unlimited: true };
    expect(validateMember(cat, inv, m, p.code, id(m, [3, 6, 3]), [8, 6, 3], { free: true }).ok).toBe(true);
    const m2 = addMember(m, p.code, id(m, [3, 6, 3]), [8, 6, 3]).model;
    expect(usage(m2, cat).B5).toBe(1);
    const need = adjustableNeeds(cat, m2);
    expect(need).toMatchObject({ bars: 1, packs: 1, fabricate: 0, ties: 0 });
    expect(need.perModel["A.B4-B6"]).toBe(1);
    // o Kit X não entra na conta dos kits à venda, mas as peças criadas não ficam "sem kit"
    expect(minKits(cat, usage(m2, cat)).missing).toEqual([]);
  });

  it("pacotes de reguláveis: 2 de cada modelo por pacote", () => {
    const cat = fresh();
    let m = emptyModel();
    for (let i = 0; i < 3; i++) {
      m = addSupport(m, [3, 0, 3 + i * 3]).model;
      m = addSupport(m, [8, 0, 3 + i * 3]).model;
    }
    const p = adjustablePiece(cat, ADJ_BAR, 5);
    ensureAdjustable(cat, p);
    for (let i = 0; i < 3; i++) m = addMember(m, p.code, id(m, [3, 0, 3 + i * 3]), [8, 0, 3 + i * 3]).model;
    expect(adjustableNeeds(cat, m).packs).toBe(2); // 3 do mesmo modelo → 2 pacotes
  });

  it("o .mola leva as peças ajustáveis usadas e elas voltam ao abrir", () => {
    const cat = fresh();
    const m = dois();
    const p = adjustablePiece(cat, ADJ_TIE, 5);
    ensureAdjustable(cat, p);
    const m2 = addMember(m, p.code, id(m, [3, 0, 3]), [8, 6, 3].map((v, i) => (i === 1 ? 0 : v)) as Vec3).model;
    const file = JSON.parse(JSON.stringify(toFile(m2, defaultInventory(cat), "aj", cat.settings.modulo_mm, undefined, "2.0.0-beta.2", userPiecesUsed(cat, m2))));
    expect(file.pieces.map((x: { code: string }) => x.code)).toEqual(["T5"]);
    const cat2 = fresh();
    const back = fromFile(file);
    expect(registerUserPieces(cat2, back.pieces).added).toEqual(["T5"]);
    expect(cat2.pieces.T5.parent).toBe(ADJ_TIE);
  });
});
