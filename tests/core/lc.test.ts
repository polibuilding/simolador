import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { available, defaultInventory, minKits, structureMass, usage } from "../../src/core/inventory";
import { LIGHT_BALL, lightBallCount, lightBallPacks, toggleBall } from "../../src/core/lightBalls";
import { addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { dropUnknownPieces, fromFile, toFile } from "../../src/core/serialization";
import { makeClip, pasteClip } from "../../src/core/clipboard";
import { validateMember } from "../../src/core/rules";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const inv = defaultInventory(catalog);

/** pórtico: 2 GC, 2 pilares B6, viga B6 (2 esferas) */
function portico(): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addSupport(m, [9, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [9, 0, 3]), [9, 6, 3]).model;
  return addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
}
const toLC = (m: Model, p: Vec3) => toggleBall(catalog, m, id(m, p)).model!;

describe("ligações super leves (LC, 2.x)", () => {
  it("esfera vira LC e volta; a GC não troca", () => {
    const m = portico();
    const r = toggleBall(catalog, m, id(m, [3, 6, 3]));
    expect(r.to).toBe(LIGHT_BALL);
    expect(r.model!.nodes[id(m, [3, 6, 3])].ball).toBe("LC");
    const back = toggleBall(catalog, r.model!, id(m, [3, 6, 3]));
    expect(back.to).toBe("C");
    expect(back.model!.nodes[id(m, [3, 6, 3])].ball).toBeUndefined();
    expect(toggleBall(catalog, m, id(m, [3, 0, 3])).error).toMatch(/GC/);
  });

  it("conta como LC (não gasta C), massa de 4,7 g, sem limite no estoque", () => {
    const m = toLC(portico(), [3, 6, 3]);
    const u = usage(m, catalog);
    expect(u.C).toBe(1);
    expect(u.LC).toBe(1);
    expect(available(catalog, inv, "LC")).toBe(Infinity);
    expect(available(catalog, { kits: { 1: 1 }, unlimited: false }, "LC")).toBe(Infinity);
    const c = structureMass(portico(), catalog).g;
    expect(structureMass(m, catalog).g).toBeCloseTo(c - 13.9 + 4.7, 6);
  });

  it("mínimo de kits: pacotes de 12, arredondando para cima", () => {
    let m = portico();
    const ids = Object.values(m.nodes).filter((n) => n.kind === "sphere").map((n) => n.id);
    for (const k of ids) m = toggleBall(catalog, m, k).model!;
    expect(lightBallPacks(catalog, m)).toBe(1);
    expect(minKits(catalog, usage(m, catalog)).kits.LC).toBe(1);
    // 15 LC → 2 pacotes
    const used = { ...usage(m, catalog), LC: 15 };
    expect(minKits(catalog, used).kits.LC).toBe(2);
    expect(minKits(catalog, { ...used, LC: 24 }).kits.LC).toBe(2);
    expect(minKits(catalog, { ...used, LC: 25 }).kits.LC).toBe(3);
    // sem LC, o pacote não entra
    expect(minKits(catalog, usage(portico(), catalog)).kits.LC).toBeUndefined();
  });

  it("a LC encaixa como a C: uma barra nova sai dela", () => {
    const m = toLC(portico(), [9, 6, 3]);
    expect(validateMember(catalog, inv, m, "B6", id(m, [9, 6, 3]), [15, 6, 3]).ok).toBe(true);
    expect(lightBallCount(m)).toBe(1);
  });

  it(".mola guarda a LC; arquivo antigo abre com C; código desconhecido volta a C", () => {
    const m = toLC(portico(), [3, 6, 3]);
    const f = JSON.parse(JSON.stringify(toFile(m, inv, "LC", catalog.settings.modulo_mm)));
    const back = fromFile(f).model;
    expect(back.nodes[id(m, [3, 6, 3])].ball).toBe("LC");
    f.nodes.find((n: { ball?: string }) => n.ball).ball = "XYZ";
    const odd = dropUnknownPieces(catalog, fromFile(f).model);
    expect(odd.dropped).toEqual(["XYZ"]);
    expect(odd.model.nodes[id(m, [3, 6, 3])].ball).toBeUndefined();
  });

  it("copiar e colar leva a LC junto", () => {
    const m = toLC(portico(), [3, 6, 3]);
    const clip = makeClip(m, Object.keys(m.members).map((k) => ({ kind: "member" as const, id: k })))!;
    expect(clip.nodes.some((n) => n.ball === "LC")).toBe(true);
    const r = pasteClip(catalog, { ...inv, unlimited: true }, m, clip, [6, 0, 9]);
    expect(lightBallCount(r.model)).toBe(2);
  });
});
