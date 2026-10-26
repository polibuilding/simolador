import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { addMember, addSupport, emptyModel, findNodeAt, removeMember, removeNode, type Model, type Vec3 } from "../../src/core/model";
import { usage } from "../../src/core/inventory";
import { ballsPerRoll, ropeBalls, ropeChains, ropeInfo, ropeLink, ropeMinMm, ropePlan, ropeRefs, ropeSpec, type RopeBall } from "../../src/core/rope";
import { validateMember, validateRope, validateStiffener } from "../../src/core/rules";
import { nodeMoveOptions } from "../../src/core/edit";
import { fromFile, toFile } from "../../src/core/serialization";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const kit3 = { kits: { 3: 1 }, unlimited: false };

/** dois pilares B6 a `gap` módulos um do outro */
function pilares(gap: number): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addSupport(m, [3 + gap, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3 + gap, 0, 3]), [3 + gap, 6, 3]).model;
  return m;
}
const addRope = (m: Model, a: Vec3, b: Vec3) => {
  const r = addMember(m, "CABLE", id(m, a), b);
  return r.model;
};

describe("cabo (Kit 3)", () => {
  it("o pedaço sai da distância entre as esferas, descontando as ligações das pontas, em bolinhas", () => {
    const sp = ropeSpec(catalog);
    const info = ropeInfo(catalog, [0, 0, 0], [12, 0, 0])!;
    const M = catalog.settings.modulo_mm;
    expect(info.centerMm).toBeCloseTo(12 * M, 6);
    expect(info.chainMm).toBeCloseTo(12 * M - 2 * sp.end, 6);
    expect(info.balls).toBe(Math.floor(info.chainMm / sp.pitch) + 1);
    expect(info.slackMm).toBeGreaterThanOrEqual(0);
    expect(info.slackMm).toBeLessThan(sp.pitch);
    expect(ropeInfo(catalog, [0, 0, 0], [(ropeMinMm(catalog) - 1) / M, 0, 0])).toBeNull();
  });

  it("calibração da equipe (26/10): a diagonal de um quadrado de 12M × 12M pede 60 bolinhas", () => {
    expect(ropeInfo(catalog, [0, 6, 0], [12, 6, 12])!.balls).toBe(60);
  });

  it("liga duas esferas que já existem; curto demais, repetido ou na mesma esfera não", () => {
    const m = pilares(12);
    const a = id(m, [3, 6, 3]);
    const b = id(m, [15, 6, 3]);
    expect(validateRope(catalog, kit3, m, a, b).ok).toBe(true);
    expect(validateRope(catalog, kit3, m, a, a).ok).toBe(false);
    const perto = pilares(4);
    const r = validateRope(catalog, kit3, perto, id(perto, [3, 6, 3]), id(perto, [7, 6, 3]));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Curto demais/);
    const com = addRope(m, [3, 6, 3], [15, 6, 3]);
    expect(validateRope(catalog, kit3, com, a, b).errors[0]).toMatch(/Já existe/);
  });

  it("não sai colado numa mola (lugar da ligação de cabo) nem atravessa mola", () => {
    const m = pilares(12);
    // do topo de um pilar até a GC dele: colado no pilar (0°)
    const r = validateRope(catalog, kit3, m, id(m, [3, 6, 3]), id(m, [3, 0, 3]));
    expect(r.ok).toBe(false);
    // estai do topo de um pilar até a GC do outro: ok
    expect(validateRope(catalog, kit3, m, id(m, [3, 6, 3]), id(m, [15, 0, 3])).ok).toBe(true);
  });

  it("estoque: 2 ligações e 2 clipes por cabo; o cabo conta pelos rolos do plano de corte", () => {
    let m = pilares(12);
    m = addRope(m, [3, 6, 3], [15, 6, 3]);
    const u = usage(m, catalog);
    expect(u["CABLE-C"]).toBe(2);
    expect(u["CLIP-C"]).toBe(2);
    expect(u.CABLE).toBe(1);
    expect(u.CABLE ?? 0).toBeLessThanOrEqual(1);
    const plan = ropePlan(catalog, m);
    expect(plan.cuts).toHaveLength(1);
    expect(plan.rolls).toHaveLength(1);
    expect(plan.balls).toBeLessThan(ballsPerRoll(ropeSpec(catalog)));
    // sem Kit 3 no estoque, não há cabo
    const r = validateRope(catalog, { kits: { 1: 1 }, unlimited: false }, pilares(12), id(m, [3, 6, 3]), id(m, [15, 6, 3]));
    expect(r.errors.join(" ")).toMatch(/Kit 3/);
  });

  it("acabam as ligações de cabo: 24 por Kit 3 = 12 cabos", () => {
    // 13 pares de pilares lado a lado, um cabo em cada
    let m = emptyModel();
    for (let i = 0; i < 13; i++) {
      const z = i * 0.9;
      m = addSupport(m, [1, 0, z]).model;
      m = addSupport(m, [17, 0, z]).model;
      m = addMember(m, "B6", id(m, [1, 0, z]), [1, 6, z]).model;
      m = addMember(m, "B6", id(m, [17, 0, z]), [17, 6, z]).model;
    }
    for (let i = 0; i < 12; i++) m = addRope(m, [1, 6, i * 0.9], [17, 6, i * 0.9]);
    const r = validateRope(catalog, kit3, m, id(m, [1, 6, 12 * 0.9]), id(m, [17, 6, 12 * 0.9]));
    expect(r.errors.join(" ")).toMatch(/CABLE C/);
  });

  it("mover só o nó: o cabo não prende a esfera (estica junto)", () => {
    let m = pilares(12);
    m = addRope(m, [3, 6, 3], [15, 6, 3]);
    const set = nodeMoveOptions(catalog, m, id(m, [3, 6, 3]));
    expect(set.locked).toBeUndefined();
    expect(set.locus?.kind).toBe("sphere"); // só o pilar prende
  });
});

describe("cabo preso em cabo: pendurais (K7–K9)", () => {
  /** ponte: cabo principal entre os topos de dois pilares B6 a 12 M, e uma GC no meio, embaixo */
  function ponte() {
    let m = addRope(pilares(12), [3, 6, 3], [15, 6, 3]);
    m = addSupport(m, [9, 0, 3]).model;
    const main = Object.values(m.members).find((x) => x.code === "CABLE")!;
    return { m, main, gc: id(m, [9, 0, 3]) };
  }
  const pendural = (m: Model, ball: RopeBall, gc: string) => ropeLink(m, "CABLE", ball, { node: gc });

  it("as bolinhas do cabo e a referência verde na vertical da GC", () => {
    const { m, main } = ponte();
    const balls = ropeBalls(catalog, m, main.id);
    expect(balls.length).toBe(ropeChains(catalog, m)[0].balls);
    expect(balls[0].ball).toBe(1);
    const green = ropeRefs(catalog, m).filter((r) => r.kind === "green");
    expect(green).toHaveLength(1);
    expect(Math.abs(green[0].pos[0] - 9)).toBeLessThan(0.3);
    // o meio do cabo cai na mesma bolinha (vale a verde); com a primeira ponta embaixo de x = 7, a perpendicular é amarela
    expect(ropeRefs(catalog, m)).toHaveLength(1);
    const perp = ropeRefs(catalog, m, [7, 0, 3]).find((r) => /perpendicular/.test(r.text))!;
    expect(perp.kind).toBe("yellow");
    expect(Math.abs(perp.pos[0] - 7)).toBeLessThan(0.3);
  });

  it("pendural: o cabo principal continua um pedaço só, com o ponto de cabo na bolinha escolhida", () => {
    const { m, main, gc } = ponte();
    const before = ropeChains(catalog, m)[0];
    const ball = ropeRefs(catalog, m).find((r) => r.kind === "green")!;
    const r = pendural(m, ball, gc);
    expect(r.clips).toHaveLength(1);
    expect(r.model.nodes[r.a].kind).toBe("clip");
    const base = { ...r.model, members: Object.fromEntries(Object.entries(r.model.members).filter(([k]) => k !== r.id)) };
    expect(validateRope(catalog, kit3, base, r.a, r.b).ok).toBe(true);
    const chains = ropeChains(catalog, r.model);
    const principal = chains.find((c) => c.id === main.id)!;
    expect(principal.members).toHaveLength(2);
    expect(principal.balls).toBe(before.balls);
    expect(principal.points[0].ball).toBe(ball.ball);
    // pendural: uma ponta na GC (CABLE C + clip) e a outra no clip do ponto de cabo
    expect(chains.find((c) => c.id === r.id)!.ends).toEqual(["tap", "sphere"]);
    const u = usage(r.model, catalog);
    expect(u["CABLE-C"]).toBe(3);
    expect(u["CLIP-C"]).toBe(4);
    expect(u.C).toBe(2); // o ponto de cabo não é esfera
    expect(ropePlan(catalog, r.model).cuts).toHaveLength(2);
    // outra mola não entra no ponto de cabo; outro pendural na mesma bolinha também não
    expect(validateMember(catalog, kit3, r.model, "B6", r.a, [9, 12, 3]).ok).toBe(false);
    expect(validateRope(catalog, kit3, r.model, r.a, id(r.model, [3, 0, 3])).errors[0]).toMatch(/já prende/);
  });

  it("tirar o pendural junta o cabo de volta; tirar o cabo principal leva o pendural", () => {
    const { m, main, gc } = ponte();
    const r = pendural(m, ropeRefs(catalog, m).find((x) => x.kind === "green")!, gc);
    const sem = removeMember(r.model, r.id);
    expect(Object.values(sem.nodes).some((n) => n.kind === "clip")).toBe(false);
    const ropes = Object.values(sem.members).filter((x) => x.code === "CABLE");
    expect(ropes).toHaveLength(1);
    expect(ropes[0].chain).toBeUndefined();
    const semPrincipal = removeMember(r.model, main.id);
    expect(Object.values(semPrincipal.members).some((x) => x.code === "CABLE")).toBe(false);
    expect(Object.values(semPrincipal.nodes).some((n) => n.kind === "clip")).toBe(false);
    // apagar o ponto de cabo: sai o pendural, o cabo principal fica
    const semPonto = removeNode(r.model, r.a);
    expect(Object.values(semPonto.members).filter((x) => x.code === "CABLE")).toHaveLength(1);
  });

  it("o ponto de cabo anda na linha do pendural, bolinha a bolinha, e o cabo principal é recontado", () => {
    const { m, main, gc } = ponte();
    const r = pendural(m, ropeRefs(catalog, m).find((x) => x.kind === "green")!, gc);
    const set = nodeMoveOptions(catalog, r.model, r.a);
    expect(set.locked).toBeUndefined();
    expect(set.locus?.kind).toBe("path");
    const P = r.model.nodes[r.a].pos;
    const q = set.nearest!([P[0], P[1] - 3, P[2]])!;
    expect(q[0]).toBeCloseTo(P[0], 6);
    expect(q[1]).toBeLessThan(P[1]);
    const mv = set.evalAt!(q)!;
    expect(mv.check.ok).toBe(true);
    const antes = ropeChains(catalog, r.model);
    const depois = ropeChains(catalog, mv.model);
    expect(depois.find((c) => c.id === main.id)!.balls).toBeGreaterThan(antes.find((c) => c.id === main.id)!.balls);
    expect(depois.find((c) => c.id === r.id)!.balls).toBeLessThan(antes.find((c) => c.id === r.id)!.balls);
  });

  it("o arquivo .mola guarda o ponto de cabo e os trechos do mesmo cabo", () => {
    const { m, gc } = ponte();
    const r = pendural(m, ropeRefs(catalog, m).find((x) => x.kind === "green")!, gc);
    const back = fromFile(JSON.parse(JSON.stringify(toFile(r.model, kit3, "ponte", catalog.settings.modulo_mm)))).model;
    expect(back.nodes[r.a].kind).toBe("clip");
    expect(ropeChains(catalog, back).map((c) => c.balls).sort()).toEqual(ropeChains(catalog, r.model).map((c) => c.balls).sort());
  });
});

describe("enrijecedor (Kit 3)", () => {
  it("B6 → BS6, B12 → BS12; B4 e diagonal não; clicar de novo tira", () => {
    let m = pilares(12);
    const bar = Object.values(m.members).find((x) => x.code === "B6")!;
    const r = validateStiffener(catalog, kit3, m, bar.id);
    expect(r.ok).toBe(true);
    expect(r.code).toBe("BS6");
    m = { ...m, members: { ...m.members, [bar.id]: { ...bar, stiff: true } } };
    expect(usage(m, catalog).BS6).toBe(1);
    expect(validateStiffener(catalog, kit3, m, bar.id).remove).toBe(true);
    let n = emptyModel();
    n = addSupport(n, [3, 0, 3]).model;
    n = addMember(n, "B4", id(n, [3, 0, 3]), [3, 4, 3]).model;
    const b4 = Object.values(n.members)[0];
    expect(validateStiffener(catalog, kit3, n, b4.id).errors[0]).toMatch(/B4/);
  });

  it("estoque: 3 BS6 por Kit 3", () => {
    let m = emptyModel();
    for (let i = 0; i < 4; i++) {
      m = addSupport(m, [2 + i * 4, 0, 3]).model;
      m = addMember(m, "B6", id(m, [2 + i * 4, 0, 3]), [2 + i * 4, 6, 3]).model;
    }
    const bars = Object.values(m.members);
    for (const b of bars.slice(0, 3)) m = { ...m, members: { ...m.members, [b.id]: { ...b, stiff: true } } };
    expect(validateStiffener(catalog, kit3, m, bars[3].id).ok).toBe(false);
  });
});
