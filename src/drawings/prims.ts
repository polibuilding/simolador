// Primitivas de desenho em milímetros de papel (origem no canto superior esquerdo da folha A3, y para baixo).
// O mesmo desenho vira SVG (tela e PDF) e DXF (AutoCAD).

export type Pt = [number, number];

export type Layer =
  | "MOLA-ESFERA" | "MOLA-BARRA" | "MOLA-PLACA" | "MOLA-LIGACAO" | "MOLA-EIXO" | "MOLA-TEXTO" | "MOLA-CARIMBO"
  | "MOLA-BASE" | "MOLA-DIAGONAL";

export interface Style {
  layer: Layer;
  pen?: number; // espessura em mm
  fill?: string | null; // cinza, ex. "#bababa"
  stroke?: string | null;
  dash?: "center" | "hidden";
}

export type Prim =
  | ({ t: "line"; a: Pt; b: Pt } & Style)
  | ({ t: "poly"; pts: Pt[]; closed: boolean } & Style)
  | ({ t: "circle"; c: Pt; r: number } & Style)
  | ({ t: "text"; p: Pt; s: string; size: number; bold?: boolean; anchor?: "start" | "middle" | "end"; rot?: number } & Style)
  /** imagem (foto renderizada da capa); o DXF ignora */
  | ({ t: "image"; x: number; y: number; w: number; h: number; href: string } & Style);

export interface Sheet {
  number: number;
  total: number;
  title: string;
  prims: Prim[];
}

export const A3 = { w: 420, h: 297 };

// Tons de cinza das pranchas do Desafio 2022
export const GRAY = {
  node: "#bababa", // 0,73
  light: "#dbdbdb", // 0,86
  dark: "#757575", // 0,46
  faint: "#c9c9c9",
};

// Penas (mm no papel)
export const PEN = { thin: 0.1, part: 0.2, base: 0.3, ground: 0.5, frame: 0.6 };
