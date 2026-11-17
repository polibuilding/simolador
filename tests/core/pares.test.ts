import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory } from "../../src/core/inventory";
import { addMember, addSupport, emptyModel, findNodeAt, len, sub, type Model, type Vec3 } from "../../src/core/model";
import { barPair, completePolygon, gcPair, setBarAngle, setGcPair } from "../../src/core/pairs";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const inv = { ...defaultInventory(catalog), kits: { 1: 3, 2: 2 } };

describe("edição por pares (2.x)", () => {
  it("ângulo entre duas molas: a segunda gira em volta da esfera comum, com o que está pendurado nela", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model; // pilar
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model; // viga em balanço
    m = addMember(m, "B4", id(m, [9, 6, 3]), [13, 6, 3]).model; // pendurada na viga
    const [pilar, viga] = Object.keys(m.members);
    expect(barPair(catalog, m, pilar, viga)!.angle).toBeCloseTo(90, 6);
    const r = setBarAngle(catalog, m, pilar, viga, 108); // ângulo interno do pentágono
    expect(r.error).toBeUndefined();
    const m2 = r.model!;
    expect(barPair(catalog, m2, pilar, viga)!.angle).toBeCloseTo(108, 2);
    // a mola pendurada foi junto, sem mudar de tamanho
    const end = Object.values(m2.members)[2];
    expect(len(sub(m2.nodes[end.a].pos, m2.nodes[end.b].pos))).toBeCloseTo(4, 3);
    // a primeira (pilar) não mexeu
    expect(m2.nodes[id(m, [3, 6, 3])].pos).toEqual([3, 6, 3]);
  });

  it("molas que fecham um anel não giram sozinhas", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addSupport(m, [9, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    m = addMember(m, "B6", id(m, [9, 0, 3]), [9, 6, 3]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
    const [pilar, , viga] = Object.keys(m.members);
    expect(setBarAngle(catalog, m, pilar, viga, 100).error).toMatch(/não gira sozinha/);
  });

  it("duas GCs: distância e ângulo; a segunda anda", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addSupport(m, [9, 0, 3]).model;
    const [g1, g2] = Object.keys(m.nodes);
    expect(gcPair(m, g1, g2)).toMatchObject({ dist: 6, angle: 0 });
    const r = setGcPair(catalog, m, g1, g2, 5, 36);
    expect(r.error).toBeUndefined();
    const p = gcPair(r.model!, g1, g2)!;
    expect(p.dist).toBeCloseTo(5, 3);
    expect(p.angle).toBeCloseTo(36, 2);
  });

  it("completa um decágono regular de bases a partir de um lado", () => {
    let m = emptyModel();
    m = addSupport(m, [4, 0, 1]).model;
    m = addSupport(m, [7, 0, 1]).model; // lado de 3 M (com 4 M, o decágono não cabe na chapa)
    const [g1, g2] = Object.keys(m.nodes);
    const r = completePolygon(catalog, inv, m, g1, g2, 10, true);
    expect(r.error).toBeUndefined();
    expect(r.added).toBe(8);
    const gcs = Object.values(r.model!.nodes).map((n) => n.pos);
    // todos os lados iguais e o polígono fecha
    for (let i = 0; i < 10; i++) expect(len(sub(gcs[(i + 1) % 10], gcs[i]))).toBeCloseTo(3, 2);
  });
});
