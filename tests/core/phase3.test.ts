import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory, usage } from "../../src/core/inventory";
import { addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { validateMember } from "../../src/core/rules";
import { applyCandidate, connectorCandidates, memberCandidates } from "../../src/core/snapping";
import { removeMany } from "../../src/core/edit";
import { fromFile, toFile } from "../../src/core/serialization";

const inv = defaultInventory(catalog);
const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;

/** Pórtico: GC (3,3) e (9,3), pilares B6, viga B6 no topo. */
function portico(): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addSupport(m, [9, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [9, 0, 3]), [9, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
  return m;
}

describe("barras inclinadas", () => {
  it("triângulo equilátero de B6 sobre a viga: inclinada a 60° e fechamento na esfera", () => {
    let m = portico();
    const a = id(m, [3, 6, 3]);
    const h = 6 * Math.sin(Math.PI / 3);
    const apex: Vec3 = [6, Math.round((6 + h) * 1e4) / 1e4, 3];
    const c = memberCandidates(catalog, inv, m, "B6", a).find((x) => x.kind === "member" && Math.abs(x.toPos[0] - 6) < 1e-3 && Math.abs(x.toPos[1] - apex[1]) < 1e-3);
    expect(c && c.check.ok).toBe(true);
    m = applyCandidate(m, c!);
    // a partir da outra ponta da viga, a barra fecha no ápice (esfera existente)
    const close = memberCandidates(catalog, inv, m, "B6", id(m, [9, 6, 3])).find((x) => x.kind === "member" && !!findNodeAt(m, x.toPos) && Math.abs(x.toPos[1] - apex[1]) < 1e-3);
    expect(close?.check.ok).toBe(true);
    m = applyCandidate(m, close!);
    expect(usage(m)).toEqual({ GC: 2, C: 3, B6: 5 });
  });
  it("inclinação fora do passo de 15° é recusada; ângulo menor que 45° com outra barra também", () => {
    const m = portico();
    const a = id(m, [3, 6, 3]);
    const t = 10 * (Math.PI / 180);
    expect(validateMember(catalog, inv, m, "B6", a, [3 + 6 * Math.cos(t), 6 + 6 * Math.sin(t), 3]).ok).toBe(false);
    const t30 = Math.PI / 6; // 30° da viga: passo válido, mas a 30° da viga → bloqueia (N3)
    const r = validateMember(catalog, inv, m, "B6", a, [3 + 6 * Math.cos(t30), 6 + 6 * Math.sin(t30), 3]);
    expect(r.errors.join()).toMatch(/Ângulo/);
  });
  it("arquivo guarda posições inclinadas", () => {
    let m = portico();
    const a = id(m, [3, 6, 3]);
    m = applyCandidate(m, memberCandidates(catalog, inv, m, "B6", a).find((x) => x.kind === "member" && x.inclined && x.check.ok)!);
    const back = fromFile(JSON.parse(JSON.stringify(toFile(m, inv, "x", 14.87))));
    expect(back.model.nodes).toEqual(m.nodes);
  });
});

describe("CC e CC90: lados da esfera", () => {
  it("viga contínua sem nada transversal: CC nos 4 lados", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
    m = addMember(m, "B6", id(m, [9, 6, 3]), [15, 6, 3]).model;
    // nó do meio (9,6,3): só o par em x
    const cc = connectorCandidates(catalog, inv, m, "CC", id(m, [9, 6, 3])).filter((x) => x.check.ok);
    expect(cc).toHaveLength(4);
  });
  it("barra transversal ocupa um lado; CC90 vai no mesmo lado da CC", () => {
    let m = emptyModel();
    m = addSupport(m, [9, 0, 6]).model;
    m = addMember(m, "B6", id(m, [9, 0, 6]), [9, 6, 6]).model;
    const c = id(m, [9, 6, 6]);
    for (const p of [[3, 6, 6], [15, 6, 6], [9, 6, 0], [9, 6, 12]] as Vec3[]) m = addMember(m, "B6", c, p).model;
    const cc = connectorCandidates(catalog, inv, m, "CC", c).filter((x) => x.check.ok);
    // par x: lados ±y e ±z; ±z têm barras, −y tem o pilar → só +y. Igual para o par z.
    expect(cc).toHaveLength(2);
    m = applyCandidate(m, cc[0]);
    const cc90 = connectorCandidates(catalog, inv, m, "CC90", c).filter((x) => x.check.ok);
    expect(cc90).toHaveLength(1);
    expect(cc90[0].kind === "connector" && cc90[0].spec.side).toEqual([0, 1, 0]);
    // com a CC no lado de cima, não dá para subir um pilar desse nó
    expect(validateMember(catalog, inv, m, "B6", c, [9, 12, 6]).errors.join()).toMatch(/ocupado/);
  });
});

describe("remover várias", () => {
  it("remove barras e nós selecionados juntos, sem erro com o que já sumiu", () => {
    const m = portico();
    const sels = [...Object.keys(m.members).map((k) => ({ kind: "member" as const, id: k })), ...Object.keys(m.nodes).map((k) => ({ kind: "node" as const, id: k }))];
    const r = removeMany(m, sels);
    expect(Object.keys(r.nodes)).toHaveLength(0);
    expect(Object.keys(r.members)).toHaveLength(0);
  });
});
