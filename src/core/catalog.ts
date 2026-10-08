// Catálogo de peças e estoque, lidos dos JSON gerados a partir de data/parametros.xlsx.
import catalogJson from "../../data/catalog.json";
import kitsJson from "../../data/kits.json";

export type PieceType = "node" | "support" | "connector" | "bar" | "cable" | "plate" | "ground";

export interface PieceDef {
  code: string;
  name: string;
  type: PieceType;
  spanM: number[] | null;
  geometry: Record<string, number | boolean | null>;
  status: string | null;
  notes: string | null;
}

export interface KitDef {
  name: string;
  color: string | null;
  pieces: Record<string, number>;
}

export interface Settings {
  modulo_mm: number;
  esfera_diametro_mm: number;
  barra_diametro_mm: number;
  gc_diametro_mm: number;
  gc_altura_mm: number;
  gc_centro_esfera_mm: number;
  chapa_modulos_x: number;
  chapa_modulos_y: number;
  chapa_espessura_mm: number;
  angulo_minimo_membros_graus: number;
  max_membros_por_plano: number;
  tolerancia_encaixe_mm: number;
  gc_encaixe_padrao: string;
  [k: string]: number | string;
}

export interface Catalog {
  settings: Settings;
  pieces: Record<string, PieceDef>;
  kits: Record<string, KitDef>;
}

export function buildCatalog(cat: unknown, kits: unknown): Catalog {
  const c = cat as { settings: Settings; pieces: PieceDef[] };
  const k = kits as { kits: Record<string, KitDef> };
  const pieces: Record<string, PieceDef> = {};
  for (const p of c.pieces) pieces[p.code] = p;
  return { settings: c.settings, pieces, kits: k.kits };
}

export const catalog: Catalog = buildCatalog(catalogJson, kitsJson);

/** Converte módulos em milímetros. */
export const mm = (cat: Catalog, modules: number) => modules * cat.settings.modulo_mm;
