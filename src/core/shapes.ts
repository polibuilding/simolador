// Contornos das ligações (mm), usados igual na cena 3D e nas pranchas.
import type { Catalog } from "./catalog";

/**
 * CC / CC90 no plano (u = eixo do par de barras que a peça trava, v = lado da esfera), a partir do centro da esfera.
 * CC: trapézio baixo sobre a esfera, apoiado nas duas molas alinhadas.
 * CC90: ponte por cima da CC (mesmo lado); as hastes descem e encostam nas molas transversais.
 */
export function continuousOutline(cat: Catalog, code: string): [number, number][] {
  const R = cat.settings.esfera_diametro_mm / 2;
  const a = cat.settings.barra_diametro_mm / 2; // face da mola
  if (code === "CC90") {
    const L = R + 12;
    const leg = 4;
    const top = a + 5 + 1 + 3.5; // a CC vai até a + 5
    const inner = top - 3.5;
    return [[-L, a], [-L, top], [L, top], [L, a], [L - leg, a], [L - leg, inner], [-L + leg, inner], [-L + leg, a]];
  }
  const L = R + 14;
  return [[-L, a], [L, a], [L - 4, a + 5], [-L + 4, a + 5]];
}
