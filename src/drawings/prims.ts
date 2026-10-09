// Primitivas de desenho em milímetros de papel (origem no canto superior esquerdo da folha, y para baixo).
// O mesmo desenho vira SVG (tela e PDF) e DXF (AutoCAD).

export type Pt = [number, number];

export type Layer =
  | "MOLA-ESFERA" | "MOLA-BARRA" | "MOLA-PLACA" | "MOLA-LIGACAO" | "MOLA-EIXO" | "MOLA-TEXTO" | "MOLA-CARIMBO"
  | "MOLA-BASE" | "MOLA-DIAGONAL" | "MOLA-COTA";

export interface Style {
  layer: Layer;
  /** bloco arrastável da folha (desenho, título, tabela…); a posição fica salva no carimbo do projeto */
  group?: string;
  pen?: number; // espessura em mm
  fill?: string | null; // cinza, ex. "#bababa"
  stroke?: string | null;
  dash?: "center" | "hidden";
}

export type Prim =
  | ({ t: "line"; a: Pt; b: Pt } & Style)
  | ({ t: "poly"; pts: Pt[]; closed: boolean } & Style)
  | ({ t: "circle"; c: Pt; r: number } & Style)
  /** `tag`: etiqueta arrastável na tela (chave da posição salva) */
  | ({ t: "text"; p: Pt; s: string; size: number; bold?: boolean; anchor?: "start" | "middle" | "end"; rot?: number; tag?: string } & Style)
  /** imagem (foto renderizada da capa); o DXF ignora */
  | ({ t: "image"; x: number; y: number; w: number; h: number; href: string } & Style);

export type PaperName = "A3" | "A4";
export const PAPER: Record<PaperName, { w: number; h: number }> = { A3: { w: 420, h: 297 }, A4: { w: 297, h: 210 } };
/** compatibilidade: tamanho padrão */
export const A3 = PAPER.A3;

export interface Sheet {
  number: number;
  total: number;
  title: string;
  prims: Prim[];
  paper: PaperName;
  size: { w: number; h: number };
}

/** Desloca uma primitiva (mm de papel). */
export function movePrim(p: Prim, dx: number, dy: number): Prim {
  const m = (q: Pt): Pt => [q[0] + dx, q[1] + dy];
  switch (p.t) {
    case "line": return { ...p, a: m(p.a), b: m(p.b) };
    case "poly": return { ...p, pts: p.pts.map(m) };
    case "circle": return { ...p, c: m(p.c) };
    case "text": return { ...p, p: m(p.p) };
    case "image": return { ...p, x: p.x + dx, y: p.y + dy };
  }
}

// Tons de cinza das pranchas do Desafio 2022
export const GRAY = {
  node: "#bababa", // 0,73
  light: "#dbdbdb", // 0,86
  dark: "#757575", // 0,46
  faint: "#c9c9c9",
};

// Penas (mm no papel)
export const PEN = { thin: 0.1, part: 0.2, base: 0.3, ground: 0.5, frame: 0.6 };
