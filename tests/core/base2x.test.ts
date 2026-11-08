// Base para a 2.x (1.10.2): catálogo em camadas, peças criadas no .mola e no .kit, kit sem limite, placa de N cantos.
// Também confere que, sem peças criadas, tudo fica como na 1.10.
import { describe, expect, it } from "vitest";
import { baseCatalog, catalog, type Catalog } from "../../src/core/catalog";
import { available, defaultInventory, minKits } from "../../src/core/inventory";
import { emptyModel, type Model, type Vec3 } from "../../src/core/model";
import { buildMech, mechComponent, mobility, positionsOf } from "../../src/core/mechanism";
import { fromFile, toFile } from "../../src/core/serialization";
import { insetPolygon2, isConvex2, isPlanar, isRectangle, isSimple2, polyNormal } from "../../src/core/geom";
import { segmentHitsPlate } from "../../src/core/rules";
import {
  adjustableRange, barCode, tieCode, fromKitFile, KIT_X, mustFabricate, pieceLocations, plateCode, rcCode, registerUserPieces,
  removeUserPiece, toKitFile, userPiecesUsed, withUserPieces,
} from "../../src/core/userPieces";
import { buildSheets } from "../../src/drawings/sheets";

/** cópia do catálogo para cada teste (o do programa não muda) */
const fresh = (): Catalog => ({ ...catalog, pieces: { ...catalog.pieces }, kits: { ...catalog.kits } });

const userBar = { code: "B2.34", name: "Barra B2.34", type: "bar", spanM: [2.34], geometry: {}, status: null, notes: null, parent: "B4" };
// pentágono regular de raio 4 M, de pé no plano x–y, acima da chapa
const penta: Vec3[] = Array.from({ length: 5 }, (_, i) => {
  const a = Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return [6 + 4 * Math.cos(a), 6 + 4 * Math.sin(a), 3] as Vec3;
});
const userPlate = { code: "P5", name: "Placa P5", type: "plate", spanM: null, geometry: {}, status: null, notes: null, outline: penta.map((p) => [p[0], p[1]]) };

function pentaModel(code = "P5"): Model {
  const m = emptyModel();
  penta.forEach((pos, i) => (m.nodes[`n${i + 1}`] = { id: `n${i + 1}`, kind: "sphere", pos }));
  m.plates.p6 = { id: "p6", code, corners: ["n1", "n2", "n3", "n4", "n5"] };
  m.nextId = 7;
  return m;
}

describe("sem peças criadas, nada muda", () => {
  it("o catálogo do programa é uma cópia: peças e kits iguais aos da planilha", () => {
    expect(Object.keys(catalog.pieces).sort()).toEqual(Object.keys(baseCatalog.pieces).sort());
    expect(Object.keys(catalog.kits).sort()).toEqual(Object.keys(baseCatalog.kits).sort());
    expect(catalog.pieces).not.toBe(baseCatalog.pieces);
    expect(Object.values(catalog.pieces).some((p) => p.origin === "user")).toBe(false);
  });
  it("o .mola sem peças criadas não ganha o campo novo", () => {
    const f = toFile(emptyModel(), defaultInventory(catalog), "x", 14.87, undefined, undefined, userPiecesUsed(catalog, emptyModel()));
    expect("pieces" in f).toBe(false);
  });
  it("paleta: os grupos de sempre", () => {
    const groups = [{ title: "Barras", codes: ["B4", "B6", "B12"] }];
    expect(withUserPieces(groups, catalog, { bar: "Barras" })).toBe(groups);
  });
});

describe("nomes das peças criadas (X2, X3) e barra que precisa ser fabricada (X4)", () => {
  it("códigos com ponto e a precisão da planilha", () => {
    expect(barCode(catalog, 2.3449)).toBe("B2.34");
    expect(barCode(catalog, 7)).toBe("B7");
    expect(rcCode(catalog, 45.24)).toBe("RC45.2");
    const cat = fresh();
    expect(plateCode(cat, 5)).toBe("P5");
    registerUserPieces(cat, [userPlate]);
    expect(plateCode(cat, 5)).toBe("P5-2");
  });
  it("fora de B3–B12 precisa ser fabricada", () => {
    expect(adjustableRange(catalog)).toEqual([3, 12]);
    expect(mustFabricate(catalog, 2.34)).toBe(true);
    expect(mustFabricate(catalog, 3)).toBe(false);
    expect(mustFabricate(catalog, 12)).toBe(false);
    expect(mustFabricate(catalog, 12.5)).toBe(true);
  });
});

describe("tirante ajustável (X8)", () => {
  it("código Tx e guardado como a diagonal de um vão L × 0 (as contas da diagonal servem)", () => {
    expect(tieCode(catalog, 5.8312)).toBe("T5.83");
    const cat = fresh();
    const r = registerUserPieces(cat, [{ code: "T5.83", name: "Tirante T5.83", type: "cable", spanM: [5.83], geometry: {}, status: null, notes: null, parent: "D6x6" }]);
    expect(r.added).toEqual(["T5.83"]);
    expect(cat.pieces["T5.83"].spanM).toEqual([5.83, 0]);
    expect(Math.hypot(...(cat.pieces["T5.83"].spanM as [number, number]))).toBeCloseTo(5.83);
    expect(registerUserPieces(cat, [{ code: "T1", type: "cable", spanM: null }]).refused.length).toBe(1);
  });
});

describe("camada do usuário no catálogo", () => {
  it("entra no catálogo e no Kit X (sem limite); peça da planilha não é trocada", () => {
    const cat = fresh();
    const r = registerUserPieces(cat, [userBar, { ...userBar, code: "B6" }, { code: "lixo" }]);
    expect(r.added).toEqual(["B2.34"]);
    expect(r.refused.length).toBe(2);
    expect(cat.pieces["B2.34"].origin).toBe("user");
    expect(cat.pieces.B6.origin).toBeUndefined();
    expect(cat.kits[KIT_X].unlimited).toBe(true);
    expect(catalog.pieces["B2.34"]).toBeUndefined(); // o catálogo do programa não mudou
  });
  it("na paleta, logo abaixo da peça que a gerou", () => {
    const cat = fresh();
    registerUserPieces(cat, [userBar, userPlate]);
    const g = withUserPieces([{ title: "Barras", codes: ["B4", "B6"] }, { title: "Placas", codes: ["P6x6"] }], cat, { bar: "Barras", plate: "Placas" });
    expect(g[0].codes).toEqual(["B4", "B2.34", "B6"]);
    expect(g[1].codes).toEqual(["P6x6", "P5"]);
  });
  it("excluir: bloqueia se está na montagem e diz onde (X5)", () => {
    const cat = fresh();
    registerUserPieces(cat, [userPlate]);
    const m = pentaModel();
    const r = removeUserPiece(cat, "P5", m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.where.length).toBe(1);
    expect(pieceLocations(m, "P5")[0][2]).toBeCloseTo(3);
    expect(removeUserPiece(cat, "P5", emptyModel()).ok).toBe(true);
    expect(cat.pieces.P5).toBeUndefined();
    expect(cat.kits[KIT_X].pieces.P5).toBeUndefined();
    expect(removeUserPiece(cat, "B6", emptyModel()).ok).toBe(false); // peça da planilha nunca sai
  });
  it("arquivo .kit: ida e volta, com as peças inválidas de fora", () => {
    const cat = fresh();
    registerUserPieces(cat, [userBar, userPlate]);
    const kit = JSON.parse(JSON.stringify(toKitFile(cat, "Minhas peças", undefined, "1.10.2")));
    kit.pieces.push({ code: "ruim", type: "bar" });
    const back = fromKitFile(kit);
    expect(back.name).toBe("Minhas peças");
    expect(back.pieces.map((p) => p.code)).toEqual(["B2.34", "P5"]);
    expect(back.refused.length).toBe(1);
    expect(() => fromKitFile({ format: "simolador" })).toThrow();
  });
});

describe("estoque com kit sem limite", () => {
  it("disponível sem limite só com uma caixa do kit; 0 caixas = 0 (nunca NaN)", () => {
    const cat = fresh();
    registerUserPieces(cat, [userBar]);
    expect(available(cat, { kits: { "1": 1, [KIT_X]: 0 }, unlimited: false }, "B2.34")).toBe(0);
    expect(available(cat, { kits: { "1": 1, [KIT_X]: 1 }, unlimited: false }, "B2.34")).toBe(Infinity);
    expect(available(cat, { kits: { "1": 1, [KIT_X]: 1 }, unlimited: false }, "B6")).toBe(available(catalog, { kits: { "1": 1 }, unlimited: false }, "B6"));
  });
  it("menor conjunto de kits: uma caixa do Kit X basta para as peças criadas", () => {
    const cat = fresh();
    registerUserPieces(cat, [userBar]);
    const r = minKits(cat, { B6: 3, "B2.34": 40 });
    expect(r.kits[KIT_X]).toBe(1);
    expect(r.missing).toEqual([]);
    // sem peças criadas, a conta é a de sempre
    expect(minKits(cat, { B6: 3 })).toEqual(minKits(catalog, { B6: 3 }));
  });
});

describe(".mola com peças criadas", () => {
  it("vão junto no arquivo e voltam; placa de 5 cantos só se a peça veio no arquivo", () => {
    const cat = fresh();
    registerUserPieces(cat, [userPlate]);
    const m = pentaModel();
    const file = JSON.parse(JSON.stringify(toFile(m, defaultInventory(cat), "Penta", 14.87, undefined, "1.10.2", userPiecesUsed(cat, m))));
    expect(file.pieces.map((p: { code: string }) => p.code)).toEqual(["P5"]);
    const back = fromFile(file);
    expect(back.model.plates.p6.corners.length).toBe(5);
    expect(back.pieces.length).toBe(1);
    const other = fresh();
    expect(registerUserPieces(other, back.pieces).added).toEqual(["P5"]);
    // sem a peça no arquivo, 5 cantos é arquivo inválido (como antes)
    delete file.pieces;
    expect(() => fromFile(file)).toThrow(/cantos/);
  });
});

describe("placa de qualquer formato", () => {
  it("contas de polígono", () => {
    expect(isPlanar(penta)).toBe(true);
    expect(isPlanar([...penta.slice(0, 4), [6, 6, 3.5]])).toBe(false);
    expect(Math.abs(polyNormal(penta)[2])).toBeCloseTo(1);
    expect(isRectangle([[0, 0, 0], [6, 0, 0], [6, 6, 0], [0, 6, 0]])).toBe(true);
    expect(isRectangle([[0, 0, 0], [6, 0, 0], [5, 6, 0], [1, 6, 0]], 1e-2)).toBe(false);
    expect(isConvex2([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]])).toBe(false);
    expect(isSimple2([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]])).toBe(true);
    expect(isSimple2([[0, 0], [4, 4], [4, 0], [0, 4]])).toBe(false);
    const sq = insetPolygon2([[0, 0], [10, 0], [10, 10], [0, 10]], 1);
    expect(sq).toEqual([[1, 1], [9, 1], [9, 9], [1, 9]].map(([x, y]) => [expect.closeTo(x), expect.closeTo(y)]));
  });
  it("uma mola atravessando a placa de 5 cantos é vista; passando ao lado, não", () => {
    expect(segmentHitsPlate([6, 6, 0], [6, 6, 6], penta)).toBe(true);
    expect(segmentHitsPlate([20, 6, 0], [20, 6, 6], penta)).toBe(false);
    // retângulo do kit: mesma resposta de antes
    const rect: Vec3[] = [[0, 0, 0], [6, 0, 0], [6, 6, 0], [0, 6, 0]];
    expect(segmentHitsPlate([3, 3, -1], [3, 3, 1], rect)).toBe(true);
    expect(segmentHitsPlate([0.1, 3, -1], [0.1, 3, 1], rect)).toBe(false);
  });
  it("a placa de 5 cantos é um corpo rígido (como a placa do kit)", () => {
    const cat = fresh();
    registerUserPieces(cat, [userPlate]);
    const m = pentaModel();
    const ids = mechComponent(cat, m, ["n1"]);
    const mech = buildMech(cat, m, ids);
    const r = mobility(mech, positionsOf(m, mech), [mech.index.get("n1")!]);
    // as mesmas liberdades de um retângulo solto (só o movimento do corpo inteiro)
    const q = emptyModel();
    const rect: Vec3[] = [[0, 2, 0], [6, 2, 0], [6, 8, 0], [0, 8, 0]];
    rect.forEach((pos, i) => (q.nodes[`n${i + 1}`] = { id: `n${i + 1}`, kind: "sphere", pos }));
    q.plates.p5 = { id: "p5", code: "P6x6", corners: ["n1", "n2", "n3", "n4"] };
    const mq = buildMech(catalog, q, mechComponent(catalog, q, ["n1"]));
    const rq = mobility(mq, positionsOf(q, mq), [mq.index.get("n1")!]);
    expect(r.dof).toBe(rq.dof);
  });
  it("as pranchas desenham a placa de 5 cantos", () => {
    const cat = fresh();
    registerUserPieces(cat, [userPlate]);
    const built = buildSheets({ cat, model: pentaModel(), inventory: defaultInventory(cat), name: "Penta", meta: { line1: "A", line2: "B" } });
    const vA = built.sheets.flatMap((s) => s.prims).filter((p) => p.group === "desenho:vista A" && p.t === "poly" && p.layer === "MOLA-PLACA");
    expect(vA.length).toBeGreaterThan(0);
    if (vA[0].t === "poly") expect(vA[0].pts.length).toBe(5);
  });
});
