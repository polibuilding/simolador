import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { available, defaultInventory, usage } from "../../src/core/inventory";
import { addMember, addSupport, emptyModel, removeMember, removeNode, type Model, type Vec3 } from "../../src/core/model";
import { stockBlock, validateMember, validateSupport } from "../../src/core/rules";
import { memberCandidates, supportPosition } from "../../src/core/snapping";
import { fromFile, toFile, MolaFileError } from "../../src/core/serialization";
import { createHistory, push, redo, undo } from "../../src/core/history";

const inv = defaultInventory(catalog);

/** Pórtico simples: 2 GC a 6M, 2 pilares B6, 1 viga B6. */
function portico(): Model {
  let m = emptyModel();
  let r = addSupport(m, [3, 0, 3]); m = r.model; const g1 = r.id;
  r = addSupport(m, [9, 0, 3]); m = r.model; const g2 = r.id;
  r = addMember(m, "B6", g1, [3, 6, 3]); m = r.model;
  r = addMember(m, "B6", g2, [9, 6, 3]); m = r.model;
  const top1 = Object.values(m.nodes).find((n) => n.pos[0] === 3 && n.pos[1] === 6)!.id;
  r = addMember(m, "B6", top1, [9, 6, 3]); m = r.model;
  return m;
}

describe("catálogo e estoque", () => {
  it("lê o catálogo gerado da planilha", () => {
    expect(catalog.settings.modulo_mm).toBeGreaterThan(14);
    expect(catalog.pieces.B6.spanM).toEqual([6]);
    expect(catalog.pieces.B12.type).toBe("bar");
  });
  it("soma estoque de 1 Kit 1 + 1 Kit 2 e respeita várias caixas (Q03)", () => {
    expect(available(catalog, { kits: { "1": 1, "2": 1 }, unlimited: false }, "B6")).toBe(54);
    expect(available(catalog, inv, "B6")).toBe(84); // padrão: uma caixa de cada kit (1, 2 e 3)
    expect(available(catalog, { kits: { "1": 2, "2": 0 }, unlimited: false }, "B6")).toBe(48);
    expect(available(catalog, { kits: {}, unlimited: true }, "B6")).toBe(Infinity);
  });
});

describe("pórtico do manual", () => {
  it("monta com a contagem certa e reaproveita o nó existente", () => {
    const m = portico();
    expect(usage(m)).toEqual({ GC: 2, C: 2, B6: 3 });
    expect(Object.keys(m.members)).toHaveLength(3);
  });
  it("remove barra e as esferas que ficam soltas", () => {
    let m = portico();
    const viga = Object.values(m.members).find((x) => m.nodes[x.a].pos[1] === 6 && m.nodes[x.b].pos[1] === 6)!;
    m = removeMember(m, viga.id);
    expect(usage(m)).toEqual({ GC: 2, C: 2, B6: 2 });
    const pilar = Object.values(m.members)[0];
    m = removeMember(m, pilar.id);
    expect(usage(m).C).toBe(1); // a esfera do topo desse pilar sumiu
    const gc = Object.values(m.nodes).find((n) => n.kind === "support")!;
    m = removeNode(m, gc.id);
    expect(Object.values(m.nodes).filter((n) => n.kind === "support")).toHaveLength(1);
  });
});

describe("regras", () => {
  it("G1/G3: ligação de base dentro da chapa e sem encostar em outra", () => {
    const m = portico();
    expect(validateSupport(catalog, inv, m, [0, 0, 0]).ok).toBe(true); // borda vale (E18)
    expect(validateSupport(catalog, inv, m, [19, 0, 0]).ok).toBe(false);
    expect(validateSupport(catalog, inv, m, [4, 0, 3]).ok).toBe(false); // encosta na GC em (3,3)
    expect(validateSupport(catalog, inv, m, [6, 0, 3]).ok).toBe(true); // 3M ≈ 44,6 mm ≥ 44
  });
  it("B1/B2: comprimento e direção", () => {
    const m = portico();
    const top = Object.values(m.nodes).find((n) => n.pos[0] === 3 && n.pos[1] === 6)!.id;
    expect(validateMember(catalog, inv, m, "B6", top, [3, 6, 9]).ok).toBe(true);
    expect(validateMember(catalog, inv, m, "B6", top, [3, 6, 8]).ok).toBe(false);
    expect(validateMember(catalog, inv, m, "B6", top, [9, 12, 3]).ok).toBe(false);
  });
  it("C1: não sobrepõe nem atravessa", () => {
    const m = portico();
    const g = Object.values(m.nodes).find((n) => n.kind === "support" && n.pos[0] === 3)!.id;
    expect(validateMember(catalog, inv, m, "B6", g, [3, 6, 3]).ok).toBe(false); // já existe
    expect(validateMember(catalog, inv, m, "B12", g, [3, 12, 3]).ok).toBe(false); // atravessa a esfera
  });
  it("não vai para baixo da chapa", () => {
    const m = portico();
    const g = Object.values(m.nodes).find((n) => n.kind === "support")!.id;
    expect(validateMember(catalog, inv, m, "B6", g, [3, -6, 3]).ok).toBe(false);
  });
  it("S2: estoque esgotado bloqueia", () => {
    const m = portico();
    const g = Object.values(m.nodes).find((n) => n.kind === "support")!.id;
    const semB6 = { kits: { "1": 0, "2": 0 }, unlimited: false };
    expect(validateMember(catalog, semB6, m, "B6", g, [3, 6, 9]).errors.join()).toMatch(/Acabaram/);
  });
  it("S4: sem esferas, a barra só liga esferas que já existem, e o motivo é dito", () => {
    // 1 Kit 1 = 12 C: quatro pilares de três B6 usam todas
    const kit1 = { kits: { "1": 1, "2": 0, "3": 0 }, unlimited: false };
    let m = emptyModel();
    const tops: string[] = [];
    for (const [x, z] of [[3, 3], [9, 3], [9, 9], [3, 9]]) {
      let r = addSupport(m, [x, 0, z]); m = r.model;
      for (let y = 6; y <= 18; y += 6) {
        const from = Object.values(m.nodes).find((n) => n.pos[0] === x && n.pos[2] === z && n.pos[1] === y - 6)!.id;
        r = addMember(m, "B6", from, [x, y, z]); m = r.model;
      }
      tops.push(Object.values(m.nodes).find((n) => n.pos[0] === x && n.pos[2] === z && n.pos[1] === 18)!.id);
    }
    expect(usage(m).C).toBe(12);
    expect(validateMember(catalog, kit1, m, "B6", tops[0], [3, 24, 3]).errors.join()).toMatch(/esferas \(C\)/);
    expect(validateMember(catalog, kit1, m, "B6", tops[0], [9, 18, 3]).ok).toBe(true); // viga entre dois topos
    expect(stockBlock(catalog, kit1, m, "B6")).toMatch(/esferas \(C\).*só entra ligando/);
    expect(stockBlock(catalog, kit1, m, "D6x6")).toBeNull(); // a diagonal não leva esfera
    expect(stockBlock(catalog, { kits: { "1": 0 }, unlimited: false }, m, "B6")).toMatch(/Acabaram as B6/);
    expect(stockBlock(catalog, { kits: {}, unlimited: true }, m, "B6")).toBeNull();
    expect(stockBlock(catalog, inv, m, "B6")).toBeNull();
  });
  it("candidatos: do topo do pilar, os 6 eixos (mais inclinadas), só as válidas passam", () => {
    const m = portico();
    const top = Object.values(m.nodes).find((n) => n.pos[0] === 3 && n.pos[1] === 6)!.id;
    const c = memberCandidates(catalog, inv, m, "B6", top).filter((x) => !(x.kind === "member" && x.inclined));
    expect(c).toHaveLength(6);
    const ok = c.filter((x) => x.check.ok).map((x) => (x.kind === "member" ? x.toPos : null));
    expect(ok).toContainEqual([3, 12, 3] as Vec3);
    expect(ok).not.toContainEqual([9, 6, 3] as Vec3); // viga já existe
    expect(ok).not.toContainEqual([3, 0, 3] as Vec3); // pilar já existe
  });
  it("encaixe da GC: grade arredonda, livre não", () => {
    expect(supportPosition(catalog, { x: 3.4, z: 2.6 }, true)).toEqual([3, 0, 3]);
    expect(supportPosition(catalog, { x: 3.4, z: 2.6 }, false)).toEqual([3.4, 0, 2.6]);
    expect(supportPosition(catalog, { x: 25, z: -2 }, true)).toEqual([18, 0, 0]);
  });
});

describe("arquivo .mola e histórico", () => {
  it("salva e abre sem perder nada", () => {
    const m = portico();
    const f = JSON.parse(JSON.stringify(toFile(m, inv, "Pórtico", 14.87)));
    const back = fromFile(f);
    expect(back.model.nodes).toEqual(m.nodes);
    expect(back.model.members).toEqual(m.members);
    expect(back.model.nextId).toBeGreaterThanOrEqual(m.nextId);
    expect(() => fromFile({ format: "outro" })).toThrow(MolaFileError);
  });
  it("desfaz e refaz", () => {
    let h = createHistory(emptyModel());
    h = push(h, portico());
    expect(Object.keys(h.present.members)).toHaveLength(3);
    h = undo(h);
    expect(Object.keys(h.present.members)).toHaveLength(0);
    h = redo(h);
    expect(Object.keys(h.present.members)).toHaveLength(3);
  });
});

import { minKits } from "../../src/core/inventory";
describe("kits mínimos (modo sem limite)", () => {
  it("cobre as peças com o menor número de caixas", () => {
    // 18 B4 só existem no Kit 2; 40 B6 = 24 (K1) + 30 (K2) ou 2× K2
    expect(minKits(catalog, { B4: 18 }).kits).toEqual({ 2: 1 });
    expect(minKits(catalog, { B6: 40, B12: 6 }).total).toBe(2);
    expect(minKits(catalog, { C: 40 }).total).toBe(3); // 12 + 18 por caixa
    expect(minKits(catalog, {}).total).toBe(0);
  });
});

describe("arquivo com peça desconhecida", () => {
  it("a peça sai do modelo, com o código para o aviso; o resto fica", async () => {
    const { dropUnknownPieces } = await import("../../src/core/serialization");
    const { catalog } = await import("../../src/core/catalog");
    const model = {
      nodes: { n1: { id: "n1", kind: "support", pos: [0, 0, 0] }, n2: { id: "n2", kind: "sphere", pos: [0, 6, 0] } },
      members: { m1: { id: "m1", code: "B6", a: "n1", b: "n2" }, m2: { id: "m2", code: "XPTO", a: "n1", b: "n2" } },
      plates: {},
      connectors: {},
    } as never;
    const r = dropUnknownPieces(catalog, model);
    expect(r.dropped).toEqual(["XPTO"]);
    expect(Object.keys((r.model as { members: object }).members)).toEqual(["m1"]);
    expect(dropUnknownPieces(catalog, r.model).model).toBe(r.model);
  });
});
