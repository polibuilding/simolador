// Arquivo .mola (1.10.0): versão do programa no arquivo e abertura de arquivo de formato mais novo.
import { describe, expect, it } from "vitest";
import { emptyModel } from "../../src/core/model";
import { fromFile, MolaFileError, toFile, VERSION } from "../../src/core/serialization";

const inv = { kits: { 1: 1 }, unlimited: false };

describe("arquivo .mola", () => {
  it("guarda a versão do programa que salvou", () => {
    const f = toFile(emptyModel(), inv, "Teste", 14.87, undefined, "1.10.0");
    expect(f.app).toBe("1.10.0");
    expect(f.version).toBe(VERSION);
    expect(toFile(emptyModel(), inv, "Teste", 14.87).app).toBeUndefined();
  });

  it("arquivo de formato mais novo: recusa com aviso, e abre quando pedido", () => {
    const raw = { ...toFile(emptyModel(), inv, "Novo", 14.87, undefined, "9.0.0"), version: VERSION + 1, coisaNova: [1, 2, 3] };
    let err: unknown;
    try {
      fromFile(raw);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MolaFileError);
    expect((err as MolaFileError).newer).toBe(true);
    expect((err as MolaFileError).message).toContain("9.0.0");
    const ok = fromFile(raw, { allowNewer: true });
    expect(ok.name).toBe("Novo");
  });

  it("arquivo que não é do siMOLAdor ou sem formato: erro comum", () => {
    expect(() => fromFile({ format: "outro" })).toThrow(MolaFileError);
    let e: MolaFileError | null = null;
    try {
      fromFile({ format: "simolador", nodes: [], members: [] });
    } catch (x) {
      e = x as MolaFileError;
    }
    expect(e?.newer).toBe(false);
  });

  it("arquivos antigos (formato 1, sem chapas nem carimbo) continuam abrindo", () => {
    const old = { format: "simolador", version: 1, savedAt: "2026-10-08", name: "Velho", moduleMm: 15, inventory: inv, nodes: [{ id: "n1", kind: "support", pos: [3, 0, 3] }], members: [], plates: [], connectors: [] };
    const f = fromFile(old);
    expect(Object.keys(f.model.nodes)).toEqual(["n1"]);
  });
});
