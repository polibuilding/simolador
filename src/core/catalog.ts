// Catálogo de peças e estoque, lidos dos JSON gerados a partir de data/parametros.xlsx.
import catalogJson from "../../data/catalog.json";
import kitsJson from "../../data/kits.json";
import { applyConfig, checkConfig, emptyOverrides, isEmptyOverrides, sanitizeOverrides, type Overrides } from "./config";

/** cable = diagonal (Kit 1/2); rope = cabo de bolinhas (Kit 3); accessory = ligações, clipes e anéis de cabo (entram sozinhos); stiffener = enrijecedor */
export type PieceType = "node" | "support" | "connector" | "bar" | "cable" | "plate" | "ground" | "rope" | "accessory" | "stiffener";

export interface PieceDef {
  code: string;
  name: string;
  type: PieceType;
  spanM: number[] | null;
  geometry: Record<string, number | boolean | null>;
  status: string | null;
  notes: string | null;
  /** peso (g; no cabo, g por metro), das configurações avançadas; null = não informado */
  weightG?: number | null;
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
  /** menor ângulo (graus) entre uma mola presa na GC e a chapa; sem o parâmetro, 40 (= até 50° da vertical) */
  gc_angulo_minimo_base_graus: number;
  max_membros_por_plano: number;
  tolerancia_encaixe_mm: number;
  gc_encaixe_padrao: string;
  barra_desconto_mm: number;
  diagonal_desconto_mm: number;
  diagonal_terminal_mm: number;
  cabo_diametro_mm: number;
  placa_desconto_mm: number;
  placa_espessura_mm: number;
  rc90_cateto_mm: number;
  rc90_espessura_mm: number;
  prancha_escala: number | string;
  prancha_formato: string;
  prancha_projeto: string;
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

/** Catálogo da planilha (sem as configurações do usuário). */
export const baseCatalog: Catalog = buildCatalog(catalogJson, kitsJson);

// ---------- Configurações do usuário (menu da engrenagem) ----------
// Ficam no navegador e são aplicadas aqui, uma vez, na abertura do programa (todo o resto lê este catálogo).
// Proteção contra configurações que quebram o programa:
//   - valores fora dos limites são ignorados (sanitizeOverrides) e checagens cruzadas recusam o conjunto;
//   - ao aplicar, a tela marca CONFIG_TEST = "1" e recarrega; aqui ele vira "2"; o App, ao abrir sem erro, apaga.
//     Se a abertura anterior não chegou ao fim (ficou "2"), as configurações são deixadas de lado (modo seguro);
//   - ?padrao na URL abre com o padrão, sem apagar nada.
export const CONFIG_KEY = "simolador:config";
export const CONFIG_TEST = "simolador:config-teste";
export const CONFIG_OFF = "simolador:config-recusada";

export interface ConfigState {
  overrides: Overrides;
  /** havia configurações e elas valem agora */
  applied: boolean;
  /** abertura em modo seguro (a anterior travou com estas configurações) */
  safeMode: boolean;
  /** valores ignorados (fora dos limites ou desconhecidos) */
  rejected: string[];
  /** checagens cruzadas que falharam (configurações deixadas de lado) */
  problems: string[];
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function loadConfig(base: Catalog): { catalog: Catalog; state: ConfigState } {
  const state: ConfigState = { overrides: emptyOverrides(), applied: false, safeMode: false, rejected: [], problems: [] };
  const st = storage();
  if (!st) return { catalog: base, state };
  try {
    const raw = st.getItem(CONFIG_KEY);
    if (!raw) return { catalog: base, state };
    const { ov, rejected } = sanitizeOverrides(JSON.parse(raw), base);
    state.overrides = ov;
    state.rejected = rejected;
    if (typeof location !== "undefined" && /[?&]padrao\b/.test(location.search)) return { catalog: base, state };
    if (st.getItem(CONFIG_TEST) === "2") {
      // a última abertura com estas configurações não terminou: abre no padrão e guarda as recusadas à parte
      st.setItem(CONFIG_OFF, raw);
      st.removeItem(CONFIG_KEY);
      st.removeItem(CONFIG_TEST);
      state.safeMode = true;
      state.overrides = emptyOverrides();
      return { catalog: base, state };
    }
    if (isEmptyOverrides(ov)) return { catalog: base, state };
    const cat = applyConfig(base, ov);
    const problems = checkConfig(cat);
    if (problems.length) {
      state.problems = problems;
      return { catalog: base, state };
    }
    if (st.getItem(CONFIG_TEST) === "1") st.setItem(CONFIG_TEST, "2");
    state.applied = true;
    return { catalog: cat, state };
  } catch {
    state.problems = ["As configurações guardadas estavam ilegíveis."];
    return { catalog: base, state };
  }
}

const loaded = loadConfig(baseCatalog);
/** Catálogo em uso: a planilha com as configurações do usuário. */
export const catalog: Catalog = loaded.catalog;
export const configState: ConfigState = loaded.state;

/** Chamado pelo App quando a tela abriu sem erro: as configurações novas passaram no teste. */
export function markConfigBootOk() {
  try {
    storage()?.removeItem(CONFIG_TEST);
  } catch {
    /* nada */
  }
}

/** Converte módulos em milímetros. */
export const mm = (cat: Catalog, modules: number) => modules * cat.settings.modulo_mm;
