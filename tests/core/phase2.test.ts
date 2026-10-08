import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { defaultInventory, usage } from "../../src/core/inventory";
import { addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { validateMember } from "../../src/core/rules";
import { allCandidates, applyCandidate, connectorCandidates, memberCandidates, plateCandidates } from "../../src/core/snapping";
import { moveGroup, removeSelection, rotateSelection } from "../../src/core/edit";
import { fromFile, toFile } from "../../src/core/serialization";

const inv = defaultInventory(catalog);
const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;

/** Cubo de um pavimento: 4 GC em (3,3),(9,3),(3,9),(9,9); 4 pilares B6; 4 vigas B6. */
function cubo(): Model {
  let m = emptyModel();
  const base: Vec3[] = [[3, 0, 3], [9, 0, 3], [9, 0, 9], [3, 0, 9]];
  for (const p of base) m = addSupport(m, p).model;
  for (const p of base) m = addMember(m, "B6", id(m, p), [p[0], 6, p[2]]).model;
  for (let i = 0; i < 4; i++) {
    const a = base[i];
    const b = base[(i + 1) % 4];
    m = addMember(m, "B6", id(m, [a[0], 6, a[2]]), [b[0], 6, b[2]]).model;
  }
  return m;
}

describe("regra da chapa (G6)", () => {
  it("bloqueia barra horizontal entre ligações de base", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addSupport(m, [9, 0, 3]).model;
    const c = validateMember(catalog, inv, m, "B6", id(m, [3, 0, 3]), [9, 0, 3]);
    expect(c.ok).toBe(false);
    expect(c.errors.join()).toMatch(/deitado na chapa/);
  });
});

describe("diagonais", () => {
  it("D6x6 só liga duas esferas existentes no vão 6×6", () => {
    const m = cubo();
    const from = id(m, [3, 0, 3]);
    const ok = memberCandidates(catalog, inv, m, "D6x6", from).filter((c) => c.check.ok);
    const ends = ok.map((c) => (c.kind === "member" ? c.toPos : null));
    expect(ends).toContainEqual([9, 6, 3]); // contraventamento da face da frente
    expect(ends).toContainEqual([3, 6, 9]); // face lateral
    expect(ends).not.toContainEqual([9, 0, 9]); // deitada na chapa
  });
  it("duas diagonais cruzadas (X) no mesmo vão são permitidas", () => {
    let m = cubo();
    m = addMember(m, "D6x6", id(m, [3, 0, 3]), [9, 6, 3]).model;
    expect(validateMember(catalog, inv, m, "D6x6", id(m, [9, 0, 3]), [3, 6, 3]).ok).toBe(true);
  });
});

describe("placas", () => {
  it("acha a laje 6×6 no topo do cubo e as paredes; nada deitado na chapa", () => {
    const m = cubo();
    const ok = plateCandidates(catalog, inv, m, "P6x6").filter((c) => c.check.ok);
    // topo (laje) + 4 paredes
    expect(ok).toHaveLength(5);
    const top = ok.find((c) => c.kind === "plate" && c.geom.corners.every((p) => p[1] === 6))!;
    const m2 = applyCandidate(m, top);
    expect(usage(m2).P6x6).toBe(1);
    expect(plateCandidates(catalog, inv, m2, "P6x6").filter((c) => c.check.ok)).toHaveLength(4);
  });
});

describe("ligações", () => {
  it("RC90 nos cantos a 90° e na GC com pilar", () => {
    const m = cubo();
    const top = connectorCandidates(catalog, inv, m, "RC90", id(m, [3, 6, 3])).filter((c) => c.check.ok);
    expect(top).toHaveLength(3); // pilar+viga x, pilar+viga z, viga x+viga z
    const gc = connectorCandidates(catalog, inv, m, "RC90", id(m, [3, 0, 3])).filter((c) => c.check.ok);
    expect(gc).toHaveLength(4); // um de cada lado do pilar
  });
  it("CC exige barras alinhadas; CC90 vai por cima da CC no par perpendicular", () => {
    let m = emptyModel();
    m = addSupport(m, [9, 0, 6]).model;
    m = addMember(m, "B6", id(m, [9, 0, 6]), [9, 6, 6]).model;
    const c = id(m, [9, 6, 6]);
    for (const p of [[3, 6, 6], [15, 6, 6], [9, 6, 0], [9, 6, 12]] as Vec3[]) m = addMember(m, "B6", c, p).model;
    expect(connectorCandidates(catalog, inv, m, "CC90", c).filter((x) => x.check.ok)).toHaveLength(0);
    const cc = connectorCandidates(catalog, inv, m, "CC", c).filter((x) => x.check.ok);
    expect(cc).toHaveLength(2); // eixo x ou eixo z
    m = applyCandidate(m, cc[0]);
    expect(connectorCandidates(catalog, inv, m, "CC", c).filter((x) => x.check.ok)).toHaveLength(0);
    const cc90 = connectorCandidates(catalog, inv, m, "CC90", c).filter((x) => x.check.ok);
    expect(cc90).toHaveLength(1);
    m = applyCandidate(m, cc90[0]);
    // tirar a CC derruba a CC90 junto
    const ccId = Object.values(m.connectors).find((x) => x.code === "CC")!.id;
    expect(Object.keys(removeSelection(m, { kind: "connector", id: ccId }).connectors)).toHaveLength(0);
  });
});

describe("editar", () => {
  it("girar uma barra muda a direção e mantém a contagem", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    const top = id(m, [3, 6, 3]);
    m = addMember(m, "B6", top, [9, 6, 3]).model;
    const viga = Object.values(m.members).find((x) => x.b !== top && x.a === top)!;
    const r = rotateSelection(catalog, inv, m, { kind: "member", id: viga.id });
    expect(r.model).toBeTruthy();
    expect(usage(r.model!)).toEqual(usage(m));
    expect(findNodeAt(r.model!, [9, 6, 3])).toBeUndefined();
  });
  it("mover a estrutura pela GC leva tudo junto e respeita a chapa", () => {
    const m = cubo();
    const g = id(m, [3, 0, 3]);
    const ok = moveGroup(catalog, m, g, [2, 0, 1], 0);
    expect(ok.check.ok).toBe(true);
    expect(findNodeAt(ok.model, [11, 6, 10])).toBeTruthy();
    const fora = moveGroup(catalog, m, g, [12, 0, 0], 0);
    expect(fora.check.ok).toBe(false);
    const girado = moveGroup(catalog, m, g, [0, 0, 0], 1);
    expect(girado.check.ok).toBe(true);
    // o cubo gira em torno do próprio centro (6, 6): os cantos caem nos mesmos pontos
    expect(findNodeAt(girado.model, [9, 0, 9])).toBeTruthy();
    // uma estrutura em L girada muda de lugar
    let l = emptyModel();
    l = addSupport(l, [3, 0, 3]).model;
    l = addSupport(l, [9, 0, 3]).model;
    l = addMember(l, "B6", id(l, [3, 0, 3]), [3, 6, 3]).model;
    l = addMember(l, "B6", id(l, [9, 0, 3]), [9, 6, 3]).model;
    l = addMember(l, "B6", id(l, [3, 6, 3]), [9, 6, 3]).model;
    const gl = moveGroup(catalog, l, id(l, [3, 0, 3]), [0, 0, 0], 1);
    expect(gl.check.ok).toBe(true);
    expect(findNodeAt(gl.model, [6, 0, 6])).toBeTruthy();
    expect(findNodeAt(gl.model, [6, 0, 0])).toBeTruthy();
  });
  it("marcadores: candidatas de GC cobrem toda a grade", () => {
    expect(allCandidates(catalog, inv, emptyModel(), "GC")).toHaveLength(19 * 13);
  });
  it("arquivo v2 guarda placas e ligações", () => {
    let m = cubo();
    m = applyCandidate(m, plateCandidates(catalog, inv, m, "P6x6").find((c) => c.check.ok)!);
    m = applyCandidate(m, connectorCandidates(catalog, inv, m, "RC90", id(m, [3, 6, 3])).find((c) => c.check.ok)!);
    const back = fromFile(JSON.parse(JSON.stringify(toFile(m, inv, "x", 14.87))));
    expect(back.model.plates).toEqual(m.plates);
    expect(back.model.connectors).toEqual(m.connectors);
  });
});
