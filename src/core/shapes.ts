// Contornos das ligações (mm), usados igual na cena 3D e nas pranchas.
import type { Catalog } from "./catalog";

/** Medidas da CC e da CC90 (planilha; sem elas, as estimadas pelas fotos da equipe de 13/11/2026). */
export function continuousSize(cat: Catalog, code: string): { length: number; width: number; thickness: number } {
  const g = cat.pieces[code]?.geometry ?? {};
  const num = (v: unknown, d: number) => (typeof v === "number" && v > 0 ? v : d);
  const tall = code === "CC90";
  return {
    length: num(g.lengthMm, tall ? 45.5 : 44),
    width: num(g.widthMm, tall ? 13 : 9.6),
    thickness: num(g.heightMm, 6),
  };
}

/**
 * CC / CC90 no plano (u = eixo do par de barras que a peça trava, v = lado da esfera), a partir do centro da esfera.
 * As duas são trapézios com as pontas a 45°: o lado maior apoia nas duas molas (v = raio da mola) e o menor fica para
 * fora. No meio do lado maior, um recorte em V abraça a esfera (os lados a 45° tangenciam a esfera).
 * CC: o fundo do V é reto e encosta na esfera (ímã).
 * CC90: o fundo do V vira uma fenda da espessura da CC; ela vai por cima da CC, em cruz (no plano do outro par de molas),
 * e a fenda chega até a borda de fora da CC.
 */
export function continuousOutline(cat: Catalog, code: string): [number, number][] {
  const R = cat.settings.esfera_diametro_mm / 2;
  const a = cat.settings.barra_diametro_mm / 2; // face da mola
  const { length, width } = continuousSize(cat, code);
  const h = length / 2;
  const top = a + width;
  const chamfer = Math.min(width, h * 0.9);
  const outer: [number, number][] = [[h, a], [h - chamfer, top], [-h + chamfer, top], [-h, a]];
  const tangent = R * Math.SQRT2; // reta a 45° tangente à esfera: |u| + v = R·√2
  const mouth = tangent - a; // meia boca do V na face das molas
  if (R <= a + 0.1 || mouth >= h - 1) return [[-h, a], ...outer.slice(0, 3)];
  if (code === "CC90") {
    const cc = continuousSize(cat, "CC");
    const slot = cc.thickness / 2 + 0.2; // meia fenda, com folga
    const slotTop = Math.min(a + cc.width, top - 1); // até a borda de fora da CC
    const shoulder = Math.max(a, tangent - slot);
    return [[-h, a], [-mouth, a], [-slot, shoulder], [-slot, slotTop], [slot, slotTop], [slot, shoulder], [mouth, a], ...outer.slice(0, 3)];
  }
  const flat = tangent - R; // meio fundo reto (encosta na esfera)
  return [[-h, a], [-mouth, a], [-flat, R], [flat, R], [mouth, a], ...outer.slice(0, 3)];
}
