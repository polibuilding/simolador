import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../../src/core/model";
import { locusStatus, nodeMoveOptions, scanPath, sphereMeridianLimits } from "../../src/core/edit";

const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;

describe("caminho azul e vermelho", () => {
  it("scanPath acha os limites de um trecho e os pedaços em volta (fechado)", () => {
    const { arcs, limits } = scanPath((t) => t > 1 && t < 2, (t) => [t, 0, 0], 0, 2 * Math.PI, 72, true);
    expect(limits.map((l) => l.t)).toEqual([expect.closeTo(1, 2), expect.closeTo(2, 2)]);
    expect(arcs.filter((a) => a.ok)).toHaveLength(1);
    expect(arcs.filter((a) => !a.ok)).toHaveLength(1);
    const ok = arcs.find((a) => a.ok)!;
    expect(ok.t0).toBeCloseTo(1, 2);
    expect(ok.t1).toBeCloseTo(2, 2);
  });

  it("scanPath aberto: sem trocas, um pedaço só e nenhum limite", () => {
    const r = scanPath(() => true, (t) => [t, 0, 0], 0, Math.PI, 30, false);
    expect(r.limits).toHaveLength(0);
    expect(r.arcs).toEqual([{ t0: 0, t1: Math.PI, ok: true }]);
  });

  it("esfera de uma mola: embaixo da chapa e colado no pilar fica vermelho; o meridiano tem limites", () => {
    let m = emptyModel();
    m = addSupport(m, [3, 0, 3]).model;
    m = addMember(m, "B6", id(m, [3, 0, 3]), [3, 6, 3]).model;
    m = addMember(m, "B6", id(m, [3, 6, 3]), [9, 6, 3]).model;
    const tip = id(m, [9, 6, 3]);
    const set = nodeMoveOptions(catalog, m, tip);
    expect(set.locus?.kind).toBe("sphere");
    const st = locusStatus(set, { rows: 12, cols: 24 });
    const ok = st.grid!.ok;
    expect(ok.some(Boolean)).toBe(true);
    expect(ok.some((v) => !v)).toBe(true);
    // o meridiano pelo ponto atual (para o lado de +X) desce até onde a mola encosta no pilar (40°) ou na chapa
    const lim = sphereMeridianLimits(set, [9, 6, 3]);
    expect(lim.length).toBeGreaterThan(0);
    for (const p of lim) expect(set.evalAt!(p)?.check.ok).toBe(true);
  });
});
