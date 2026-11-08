// Dicionário dos idiomas (1.10.4): linhas completas, sem chaves repetidas, modelos válidos.
import { describe, expect, it } from "vitest";
import { PATTERNS, ROWS } from "../../src/ui/i18n-dict";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

describe("dicionário de idiomas", () => {
  it("cada linha tem português, inglês e espanhol", () => {
    for (const r of [...ROWS, ...PATTERNS]) {
      expect(r.length).toBe(3);
      for (const x of r) expect(x.trim().length).toBeGreaterThan(0);
    }
  });
  it("nenhum texto em português aparece duas vezes", () => {
    const keys = ROWS.map((r) => norm(r[0]));
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dup).toEqual([]);
  });
  it("os modelos compilam e usam só os grupos que capturam", () => {
    for (const [re, en, es] of PATTERNS) {
      const r = new RegExp(`^${re}$`);
      const groups = new RegExp(`${re}|`).exec("")!.length - 1;
      for (const t of [en, es]) for (const m of t.matchAll(/\$(\d)/g)) expect(Number(m[1])).toBeLessThanOrEqual(groups);
      expect(r).toBeInstanceOf(RegExp);
    }
  });
  it("exemplo: peça na paleta e dica com número", () => {
    const apply = (k: string, col: 1 | 2) => {
      for (const p of PATTERNS) {
        const m = new RegExp(`^${p[0]}$`).exec(k);
        if (m) return p[col].replace(/\$(\d)/g, (_, i) => m[Number(i)]);
      }
      return k;
    };
    expect(apply("2 opções neste ponto: R alterna.", 1)).toBe("2 options at this point: R switches.");
    expect(apply("Abrir o resumo · 86 peças", 2)).toBe("Abrir el resumen · 86 piezas");
  });
});
