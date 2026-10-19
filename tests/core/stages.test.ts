import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { addConnector, addMember, addSupport, emptyModel, findNodeAt, len, sub, type Model, type Vec3 } from "../../src/core/model";
import { globalMoveAt, moveScopes } from "../../src/core/globalMove";
import { nodeMoveOptions, sphereRings } from "../../src/core/edit";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const dist = (m: Model, a: string, b: string) => len(sub(m.nodes[a].pos, m.nodes[b].pos));

/** pórtico simples do exemplo: GC em (3, 0, 3) e (9, 0, 3), pilares B6, viga B6 em cima */
function portico(): Model {
  let m = emptyModel();
  m = addSupport(m, [3, 0, 3]).model;
  m = addSupport(m, [9, 0, 3]).model;
  m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
  m = addMember(m, "B6", id(m, [9, 0, 3]), [9, 6, 3]).model;
  m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
  return m;
}

describe("edição por etapas (Espaço amplia)", () => {
  it("pórtico sem travas: 1ª etapa só a esfera; na 2ª o pórtico anda inteiro sem deformar", () => {
    const m = portico();
    const a = id(m, [3, 6, 3]);
    const b = id(m, [9, 6, 3]);
    const g1 = id(m, [3, 0, 3]);
    const g2 = id(m, [9, 0, 3]);
    const s = moveScopes(catalog, m, { kind: "node", id: a }, true);
    expect(s[0].kind).toBe("local");
    expect(s.length).toBe(2);
    // 2ª etapa: a forma da 1ª fica travada; sobra 1 grau de liberdade (o pórtico tomba inteiro em volta das GC)
    expect(s[1].hand).toBe(1);
    // o bloco travado: o canto, as vizinhas e a outra GC (senão giraria em volta da reta GC–outro canto)
    expect(new Set(s[1].frozen?.[0])).toEqual(new Set([a, b, g1, g2]));
    const g = globalMoveAt(catalog, m, { kind: "node", id: a }, s[1]);
    expect(g.mode).toBe("path");
    if (g.mode !== "path") return;
    const far = g.set.evalParam!(g.set.locus!.kind === "path" ? Math.min(20, g.set.locus!.pts.length - 1) : 0)!;
    expect(far.ids.has(a) && far.ids.has(b)).toBe(true);
    // o formato de pórtico não muda: as diagonais imaginárias (GC–canto oposto) ficam do mesmo tamanho
    expect(Math.abs(dist(far.model, g1, b) - dist(m, g1, b))).toBeLessThan(1e-3);
    expect(Math.abs(dist(far.model, g2, a) - dist(m, g2, a))).toBeLessThan(1e-3);
    expect(len(sub(far.model.nodes[a].pos, m.nodes[a].pos))).toBeGreaterThan(0.5);
  });
  it("sem a etapa anterior travada, a estrutura toda teria mais liberdade (arraste livre)", () => {
    const m = portico();
    const beam = Object.values(m.members).find((x) => m.nodes[x.a].pos[1] === 6 && m.nodes[x.b].pos[1] === 6)!;
    const s = moveScopes(catalog, m, { kind: "member", id: beam.id });
    // pegando a viga, a 1ª etapa já é o pórtico todo (nada travado antes)
    expect(s[0].frozen).toBeNull();
    expect(s[0].hand).toBeGreaterThanOrEqual(2);
  });
});

describe("Tab: circunferências da esfera de uma mola", () => {
  it("mola inclinada: mesma altura, mesmo rumo, horizontal e as duas verticais", () => {
    const r = sphereRings({ kind: "sphere", c: [0, 0, 0], r: 6 }, [3, 3 * Math.sqrt(3), 0]);
    expect(r.map((x) => x.label.split(" (")[0])).toEqual([
      "Circunferência na mesma altura", "Circunferência vertical no mesmo rumo", "Circunferência horizontal", "Circunferência vertical no plano Y–Z",
    ]);
    // a da mesma altura passa pela esfera e fica na altura dela
    expect(r[0].ring.p[1]).toBeCloseTo(3 * Math.sqrt(3), 6);
    expect(r[0].ring.h).toBeCloseTo(3, 6);
  });
});

describe("RC90 trava só o ângulo no plano dela (L10)", () => {
  it("canto do pórtico com RC90 no próprio nó: o nó continua andando no círculo", () => {
    let m = portico();
    m = addConnector(m, { code: "RC90", node: id(m, [3, 6, 3]), dirs: [[0, -1, 0], [1, 0, 0]] }).model;
    const set = nodeMoveOptions(catalog, m, id(m, [3, 6, 3]));
    expect(set.locked).toBeUndefined();
    expect(set.locus?.kind).toBe("circle");
  });
  it("RC90 no outro canto: o nó só fica nos pontos que mantêm aquele ângulo", () => {
    let m = portico();
    m = addConnector(m, { code: "RC90", node: id(m, [9, 6, 3]), dirs: [[0, -1, 0], [-1, 0, 0]] }).model;
    const set = nodeMoveOptions(catalog, m, id(m, [3, 6, 3]));
    expect(set.locked).toBeUndefined();
    expect(set.locus?.kind).toBe("points");
  });
  it("pilar com balanço e RC90 entre os dois: o pilar tomba de lado, sem tirar o balanço dos 90°", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
    m = addConnector(m, { code: "RC90", node: id(m, [3, 6, 3]), dirs: [[0, -1, 0], [1, 0, 0]] }).model;
    const set = nodeMoveOptions(catalog, m, id(m, [3, 6, 3]));
    expect(set.locked).toBeUndefined();
    expect(set.locus?.kind).toBe("circle");
    const ok = set.options.filter((o) => o.check.ok);
    expect(ok.length).toBeGreaterThan(0);
    // o topo fica no plano perpendicular ao balanço (x = 3): o pilar continua a 90° do balanço
    for (const o of ok) expect(Math.abs(o.pos[0] - 3)).toBeLessThan(1e-3);
  });
});
