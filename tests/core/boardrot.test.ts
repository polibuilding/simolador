import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import {
  addBoard, boardAsModel, boardAt, boardCenter, boardName, boardsGap, frameRadAt, fromBoardLocal, moveBoards, renameBoard,
  rotateBoard, setBoardCenter, setBoardsGap,
} from "../../src/core/boards";
import { addMember, addSupport, boardsOf, emptyModel, type Model, type Vec3 } from "../../src/core/model";
import { validateMember } from "../../src/core/rules";
import { memberCandidates, supportPosition } from "../../src/core/snapping";

const inv = { kits: { 1: 4, 2: 4 }, unlimited: true };
const two = (): Model => addBoard(catalog, emptyModel(), "b1", "+x").model!;

describe("chapas independentes", () => {
  it("a chapa nova não fica presa à que a gerou; nome e centro", () => {
    let m = two();
    expect(boardsOf(m)[1].attach).toBeUndefined();
    m = renameBoard(m, "b2", "  Torre leste ");
    expect(boardName(boardsOf(m)[1])).toBe("Torre leste");
    expect(boardName(boardsOf(renameBoard(m, "b2", ""))[1])).toBe("Chapa 2");
    const r = setBoardCenter(catalog, m, "b2", 30.5, 9.25);
    expect(r.error).toBeUndefined();
    expect(boardCenter(catalog, boardsOf(r.model!)[1])).toEqual([30.5, 9.25]);
  });

  it("distância entre chapas selecionadas (não modular), em cadeia", () => {
    let m = addBoard(catalog, two(), "b2", "+x").model!;
    const r = setBoardsGap(catalog, m, ["b1", "b2", "b3"], 3.5);
    expect(r.error).toBeUndefined();
    m = r.model!;
    const [b1, b2, b3] = boardsOf(m);
    expect(boardsGap(catalog, b1, b2).gap).toBeCloseTo(3.5, 6);
    expect(boardsGap(catalog, b2, b3).gap).toBeCloseTo(3.5, 6);
    expect(b3.x).toBeCloseTo(18 * 2 + 3.5 * 2, 6);
    // mover pelas setas: desloca no eixo da chapa
    const mv = moveBoards(catalog, m, ["b3"], [0, 2.25]);
    expect(boardsOf(mv.model!)[2].z).toBeCloseTo(2.25, 6);
    expect(moveBoards(catalog, m, ["b2"], [-4, 0]).error).toMatch(/encostaria/);
  });

  it("giro: a grade, o encaixe da GC e os eixos das barras giram junto", () => {
    const r = rotateBoard(catalog, setBoardsGap(catalog, two(), ["b1", "b2"], 6).model!, "b2", 20);
    expect(r.error).toBeUndefined();
    let m = r.model!;
    const b2 = boardsOf(m).find((b) => b.id === "b2")!;
    expect(b2.rot).toBe(20);
    const [gx, gz] = fromBoardLocal(b2, 2, 3);
    const p = supportPosition(catalog, { x: gx + 0.2, z: gz - 0.3 }, true, boardsOf(m));
    expect(p[0]).toBeCloseTo(gx, 3);
    expect(p[2]).toBeCloseTo(gz, 3);
    expect(boardAt(catalog, boardsOf(m), gx, gz)?.id).toBe("b2");
    expect(frameRadAt(catalog, boardsOf(m), gx, gz)).toBeCloseTo((20 * Math.PI) / 180, 6);
    const s = addSupport(m, p);
    m = s.model;
    const top: Vec3 = [p[0], 6, p[2]];
    m = addMember(m, "B6", s.id, top).model;
    const topId = Object.values(m.nodes).find((n) => n.pos[1] === 6)!.id;
    const ex = fromBoardLocal(b2, 1, 0);
    const dir: Vec3 = [ex[0] - b2.x, 0, ex[1] - b2.z];
    const beamEnd: Vec3 = [top[0] + 6 * dir[0], 6, top[2] + 6 * dir[2]];
    expect(validateMember(catalog, inv, m, "B6", topId, beamEnd).ok).toBe(true);
    expect(validateMember(catalog, inv, m, "B6", topId, [top[0] + 6, 6, top[2]]).ok).toBe(false);
    const cands = memberCandidates(catalog, inv, m, "B6", topId);
    expect(cands.some((c) => c.kind === "member" && Math.hypot(c.toPos[0] - beamEnd[0], c.toPos[2] - beamEnd[2]) < 1e-3 && c.check.ok)).toBe(true);
  });

  it("a estrutura gira com a chapa e volta reta ao exportar", () => {
    let m = two();
    const s = addSupport(m, [21, 0, 3]);
    m = addMember(s.model, "B6", s.id, [21, 6, 3]).model;
    const r = rotateBoard(catalog, m, "b2", 90);
    expect(r.error).toBeUndefined();
    const gc = Object.values(r.model!.nodes).find((n) => n.kind === "support")!;
    // (21, 3) é o ponto (3, 3) da chapa 2; girada 90° em torno do centro (27, 6) vai para (24, 12)
    expect(gc.pos[0]).toBeCloseTo(24, 3);
    expect(gc.pos[2]).toBeCloseTo(12, 3);
    const flat = boardAsModel(catalog, r.model!, "b2");
    const g2 = Object.values(flat.nodes).find((n) => n.kind === "support")!;
    expect(g2.pos[0]).toBeCloseTo(3, 3);
    expect(g2.pos[2]).toBeCloseTo(3, 3);
  });

  it("girar encostada: a chapa se afasta o mínimo para não bater", () => {
    const r = rotateBoard(catalog, two(), "b2", 20);
    expect(r.error).toBeUndefined();
    expect(r.note).toMatch(/afastou/);
    const [b1, b2] = boardsOf(r.model!);
    expect(boardsGap(catalog, b1, b2).gap).toBeGreaterThan(0);
  });
});

describe("arquivo .mola", () => {
  it("guarda e lê o giro e o nome da chapa", async () => {
    const { toFile, fromFile } = await import("../../src/core/serialization");
    let m = rotateBoard(catalog, setBoardsGap(catalog, two(), ["b1", "b2"], 2.5).model!, "b2", 25).model!;
    m = renameBoard(m, "b2", "Anexo");
    const back = fromFile(JSON.parse(JSON.stringify(toFile(m, inv, "t", 14.87)))).model;
    expect(boardsOf(back)[1].rot).toBe(25);
    expect(boardsOf(back)[1].name).toBe("Anexo");
  });
});
