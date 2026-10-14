import { describe, expect, it } from "vitest";
import { baseCatalog } from "../../src/core/catalog";
import { applyConfig, checkConfig, diffOverrides, emptyOverrides, sanitizeOverrides } from "../../src/core/config";
import { ropeInfo } from "../../src/core/rope";

describe("configurações do usuário", () => {
  it("só aceita campos conhecidos, números e dentro dos limites", () => {
    const { ov, rejected } = sanitizeOverrides(
      {
        settings: { modulo_mm: 20, angulo_minimo_membros_graus: 5, passo_inclinacao_graus: 13, chapa_modulos_x: 24.5, foo: 1, gc_angulo_minimo_base_graus: "30" },
        pieces: { B6: { lengthMm: 80, weightG: 3.5, cor: 2 }, XX: { lengthMm: 1 }, P6x6: { thicknessMm: -1 } },
      },
      baseCatalog,
    );
    expect(ov.settings).toEqual({ modulo_mm: 20 });
    expect(ov.pieces).toEqual({ B6: { lengthMm: 80, weightG: 3.5 } });
    expect(rejected.length).toBe(8);
  });

  it("lixo no armazenamento não quebra", () => {
    for (const raw of [null, 3, "x", [], { settings: 5, pieces: [1] }]) {
      expect(() => sanitizeOverrides(raw, baseCatalog)).not.toThrow();
    }
  });

  it("mudar o módulo recalcula as medidas das regras e mantém o resto", () => {
    const ov = emptyOverrides();
    ov.settings.modulo_mm = 20;
    const cat = applyConfig(baseCatalog, ov);
    expect(cat.settings.modulo_mm).toBe(20);
    expect(cat.pieces.B6.geometry.lengthMm).toBeCloseTo(6 * 20 - baseCatalog.settings.barra_desconto_mm, 2);
    expect(cat.pieces.P6x12.geometry.lengthMm).toBeCloseTo(12 * 20 - baseCatalog.settings.placa_desconto_mm, 2);
    expect(cat.pieces.D6x6.geometry.cableLengthMm).toBeCloseTo(Math.hypot(6, 6) * 20 - baseCatalog.settings.diagonal_desconto_mm, 2);
    expect(baseCatalog.settings.modulo_mm).toBe(14.87); // o catálogo da planilha não muda
    expect(checkConfig(cat)).toEqual([]);
  });

  it("chapa maior muda o vão da chapa (G)", () => {
    const ov = emptyOverrides();
    ov.settings.chapa_modulos_x = 24;
    const cat = applyConfig(baseCatalog, ov);
    expect(cat.pieces.G.spanM).toEqual([24, 12]);
    expect(cat.pieces.G.geometry.lengthMm).toBeCloseTo(24 * 14.87, 1);
  });

  it("medida e peso da peça pela tela", () => {
    const ov = emptyOverrides();
    ov.pieces.B6 = { lengthMm: 75, weightG: 4 };
    const cat = applyConfig(baseCatalog, ov);
    expect(cat.pieces.B6.geometry.lengthMm).toBe(75);
    expect(cat.pieces.B6.weightG).toBe(4);
  });

  it("checagens cruzadas recusam combinações sem sentido", () => {
    const tiny = emptyOverrides();
    tiny.settings.modulo_mm = 8;
    tiny.settings.barra_desconto_mm = 40; // B4: 4 × 8 − 40 < 0
    expect(checkConfig(applyConfig(baseCatalog, tiny)).join(" ")).toMatch(/B4/);
    const big = emptyOverrides();
    big.settings.esfera_diametro_mm = 40; // não cabe no vão da B4 (59 mm)? cabe; com módulo 9: 36 mm
    big.settings.modulo_mm = 9;
    expect(checkConfig(applyConfig(baseCatalog, big)).join(" ")).toMatch(/esfera/);
    const ball = emptyOverrides();
    ball.settings.cabo_bolinha_mm = 5;
    ball.settings.cabo_passo_mm = 3;
    expect(checkConfig(applyConfig(baseCatalog, ball)).join(" ")).toMatch(/bolinha/);
  });

  it("todos os extremos válidos de cada campo básico abrem sem erro nas contas", () => {
    for (const [k, v] of [["modulo_mm", 8], ["modulo_mm", 40], ["chapa_modulos_x", 6], ["chapa_modulos_y", 48], ["passo_inclinacao_graus", 45]] as const) {
      const ov = emptyOverrides();
      ov.settings[k] = v;
      const cat = applyConfig(baseCatalog, ov);
      expect(() => ropeInfo(cat, [0, 0, 0], [12, 0, 0])).not.toThrow();
    }
  });

  it("guarda só o que difere da planilha", () => {
    const d = emptyOverrides();
    d.settings.modulo_mm = 14.87;
    d.settings.angulo_minimo_membros_graus = 45;
    d.pieces.B6 = { lengthMm: Number(baseCatalog.pieces.B6.geometry.lengthMm), weightG: 3 };
    expect(diffOverrides(baseCatalog, d)).toEqual({ v: 1, settings: { angulo_minimo_membros_graus: 45 }, pieces: { B6: { weightG: 3 } } });
  });
});
