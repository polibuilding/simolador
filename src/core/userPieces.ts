// Base para a 2.x (Kit X, `plano-simolador.md` §11): peças criadas pelo usuário, numa camada por cima da planilha.
// Na 1.x nada aqui aparece na tela: as funções preparam o catálogo, os nomes (X2, X3), o aviso "fabricar" (X4),
// o bloqueio da exclusão (X5) e o arquivo .mola/.kit para quando o Kit X entrar.
// Sem peças do usuário, o catálogo e o programa ficam exatamente como na 1.10.
import type { Catalog, KitDef, PieceDef, PieceType } from "./catalog";
import type { Model, Vec3 } from "./model";

/** Kit X: o kit ajustável, sem limite, identificado pelo preto (§11). */
export const KIT_X = "X";
export const KIT_X_COLOR = "#000000";
/** cor das peças criadas e guardadas: cinza mais escuro que as peças de hoje (§11.3) */
export const USER_PIECE_COLOR = "#3a3f44";

/** Tipos de peça que o Kit X cria (barra, placa e ligação ajustáveis). */
const USER_TYPES: PieceType[] = ["bar", "plate", "connector"];

// ---------- nomes (X2, X3) ----------

const trim = (n: number, digits: number) => {
  const f = 10 ** digits;
  return String(Math.round(n * f) / f);
};

/** Precisão dos códigos: da planilha (Geral), com o padrão da decisão X2 (0.01 M e 0.1°). */
export const lengthStep = (cat: Catalog) => Number(cat.settings.kitx_precisao_comprimento_modulos) || 0.01;
export const angleStep = (cat: Catalog) => Number(cat.settings.kitx_precisao_angulo_graus) || 0.1;
const digitsOf = (step: number) => Math.max(0, Math.round(-Math.log10(step)));

/** Barra de `lenM` módulos: "B2.34" (ponto como separador, X2). */
export function barCode(cat: Catalog, lenM: number): string {
  return `B${trim(lenM, digitsOf(lengthStep(cat)))}`;
}

/** RC de `deg` graus: "RC45.2" (X2). */
export function rcCode(cat: Catalog, deg: number): string {
  return `RC${trim(deg, digitsOf(angleStep(cat)))}`;
}

/** Placa de `sides` lados: "P5"; se já existe, "P5-2", "P5-3"… (X3). */
export function plateCode(cat: Catalog, sides: number): string {
  const first = `P${sides}`;
  if (!cat.pieces[first]) return first;
  for (let i = 2; ; i++) if (!cat.pieces[`${first}-${i}`]) return `${first}-${i}`;
}

// ---------- barra fora das Barras de Comprimento Regulável (X4) ----------

/** Faixa das Barras de Comprimento Regulável à venda (módulos), da planilha; padrão: B3 a B12 (site da Mola, 07/11/2026). */
export function adjustableRange(cat: Catalog): [number, number] {
  const lo = Number(cat.settings.barra_ajustavel_min_modulos) || 3;
  const hi = Number(cat.settings.barra_ajustavel_max_modulos) || 12;
  return [lo, hi];
}

/** A barra de `lenM` módulos não sai das barras reguláveis do kit comercial: precisa ser fabricada (X4). */
export function mustFabricate(cat: Catalog, lenM: number): boolean {
  const [lo, hi] = adjustableRange(cat);
  const eps = lengthStep(cat) / 2;
  return lenM < lo - eps || lenM > hi + eps;
}

// ---------- validação ----------

const CODE_RE = /^[A-Z][A-Za-z0-9.\-]{0,15}$/;

/** Confere uma peça vinda de fora (.mola ou .kit). Devolve a peça limpa ou o motivo de recusar. */
export function cleanUserPiece(raw: unknown): PieceDef | string {
  const p = raw as Partial<PieceDef> | null;
  if (!p || typeof p !== "object") return "peça ilegível";
  if (typeof p.code !== "string" || !CODE_RE.test(p.code)) return `código "${String(p?.code)}" inválido`;
  if (!USER_TYPES.includes(p.type as PieceType)) return `${p.code}: tipo "${String(p.type)}" não é de peça criada`;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const spanM = p.spanM == null ? null : Array.isArray(p.spanM) && p.spanM.length > 0 && p.spanM.length <= 2 && p.spanM.every((x) => num(x) && x > 0) ? [...p.spanM] : undefined;
  if (spanM === undefined) return `${p.code}: medidas inválidas`;
  const geometry: PieceDef["geometry"] = {};
  for (const [k, v] of Object.entries(p.geometry ?? {})) {
    if (!/^[a-z_][a-z0-9_]{0,40}$/.test(k)) continue;
    if (v === null || typeof v === "boolean" || num(v)) geometry[k] = v as number | boolean | null;
  }
  let outline: [number, number][] | undefined;
  if (p.outline !== undefined) {
    if (!Array.isArray(p.outline) || p.outline.length < 3 || p.outline.length > 200 || !p.outline.every((q) => Array.isArray(q) && q.length === 2 && num(q[0]) && num(q[1]))) {
      return `${p.code}: contorno da placa inválido`;
    }
    outline = p.outline.map((q) => [q[0], q[1]] as [number, number]);
  }
  if (p.type === "bar" && !spanM) return `${p.code}: barra sem comprimento`;
  const text = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : null);
  return {
    code: p.code,
    name: text(p.name, 60) || p.code,
    type: p.type as PieceType,
    spanM,
    geometry,
    status: text(p.status, 40),
    notes: text(p.notes, 400),
    origin: "user",
    ...(typeof p.parent === "string" && CODE_RE.test(p.parent) ? { parent: p.parent } : {}),
    ...(typeof p.color === "string" && /^#[0-9a-fA-F]{6}$/.test(p.color) ? { color: p.color } : {}),
    ...(outline ? { outline } : {}),
    ...(num(p.weightG) ? { weightG: p.weightG } : {}),
  };
}

// ---------- camada do usuário no catálogo ----------

export const isUserPiece = (cat: Catalog, code: string) => cat.pieces[code]?.origin === "user";
export const userPieces = (cat: Catalog): PieceDef[] => Object.values(cat.pieces).filter((p) => p.origin === "user");

/** Kit X no catálogo (criado na primeira peça do usuário): sem limite, preto. */
function kitX(cat: Catalog): KitDef {
  return (cat.kits[KIT_X] ??= { name: "Kit X", color: KIT_X_COLOR, pieces: {}, unlimited: true });
}

/**
 * Põe peças criadas no catálogo (e no Kit X). Peça com o código de uma da planilha é recusada (a planilha manda);
 * peça já guardada com o mesmo código é trocada pela nova. Devolve o que entrou e o que foi recusado (com o motivo).
 */
export function registerUserPieces(cat: Catalog, raw: unknown[] | undefined): { added: string[]; refused: string[] } {
  const added: string[] = [];
  const refused: string[] = [];
  for (const r of raw ?? []) {
    const p = cleanUserPiece(r);
    if (typeof p === "string") {
      refused.push(p);
      continue;
    }
    const cur = cat.pieces[p.code];
    if (cur && cur.origin !== "user") {
      refused.push(`${p.code} já é uma peça do kit`);
      continue;
    }
    cat.pieces[p.code] = p;
    const k = kitX(cat);
    cat.kits[KIT_X] = { ...k, pieces: { ...k.pieces, [p.code]: 1 } };
    added.push(p.code);
  }
  return { added, refused };
}

/** Onde a peça está na montagem (posições em módulos): uma bolinha preta em cada lugar (X5). */
export function pieceLocations(model: Model, code: string): Vec3[] {
  const at = (id: string) => model.nodes[id]?.pos;
  const mid = (ids: string[]): Vec3 => {
    const ps = ids.map(at).filter((p): p is Vec3 => !!p);
    const s = ps.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]] as Vec3, [0, 0, 0] as Vec3);
    return [s[0] / ps.length, s[1] / ps.length, s[2] / ps.length];
  };
  return [
    ...Object.values(model.members).filter((m) => m.code === code).map((m) => mid([m.a, m.b])),
    ...Object.values(model.plates).filter((p) => p.code === code).map((p) => mid(p.corners)),
    ...Object.values(model.connectors).filter((c) => c.code === code).map((c) => mid([c.node])),
  ];
}

/**
 * Tira uma peça criada do catálogo. Bloqueia se ela ainda está na montagem (X5): devolve onde ela está.
 * Peças da planilha nunca saem.
 */
export function removeUserPiece(cat: Catalog, code: string, model: Model): { ok: true } | { ok: false; reason: string; where: Vec3[] } {
  if (!isUserPiece(cat, code)) return { ok: false, reason: `${code} não é uma peça criada.`, where: [] };
  const where = pieceLocations(model, code);
  if (where.length) return { ok: false, reason: `${code} ainda está na montagem (${where.length} ${where.length > 1 ? "lugares" : "lugar"}).`, where };
  delete cat.pieces[code];
  const k = cat.kits[KIT_X];
  if (k) {
    const { [code]: _gone, ...rest } = k.pieces;
    cat.kits[KIT_X] = { ...k, pieces: rest };
  }
  return { ok: true };
}

/** Peças criadas que a montagem usa: vão dentro do .mola, para ele abrir igual em outro computador. */
export function userPiecesUsed(cat: Catalog, model: Model): PieceDef[] {
  const codes = new Set<string>([
    ...Object.values(model.members).map((m) => m.code),
    ...Object.values(model.plates).map((p) => p.code),
    ...Object.values(model.connectors).map((c) => c.code),
  ]);
  return [...codes].filter((c) => isUserPiece(cat, c)).sort().map((c) => cat.pieces[c]);
}

// ---------- arquivo .kit (§11.4) ----------

export const KIT_FORMAT = "simolador-kit";
export const KIT_VERSION = 1;

export interface KitFile {
  format: typeof KIT_FORMAT;
  version: number;
  /** versão do programa que salvou */
  app?: string;
  name: string;
  savedAt?: string;
  pieces: PieceDef[];
}

/** Monta o .kit com as peças criadas (todas, ou só as dos códigos dados). */
export function toKitFile(cat: Catalog, name: string, codes?: string[], app?: string): KitFile {
  const pieces = userPieces(cat).filter((p) => !codes || codes.includes(p.code)).sort((a, b) => a.code.localeCompare(b.code));
  return { format: KIT_FORMAT, version: KIT_VERSION, ...(app ? { app } : {}), name: name.trim() || "Kit X", savedAt: new Date().toISOString(), pieces };
}

/** Lê um .kit: confere o formato e cada peça (as inválidas ficam de fora, com o motivo). */
export function fromKitFile(raw: unknown): { name: string; pieces: PieceDef[]; refused: string[] } {
  const f = raw as Partial<KitFile> | null;
  if (!f || f.format !== KIT_FORMAT) throw new Error("Este arquivo não é um catálogo de peças (.kit) do siMOLAdor.");
  if (typeof f.version !== "number" || f.version > KIT_VERSION) throw new Error("Catálogo de peças de uma versão mais nova do siMOLAdor.");
  if (!Array.isArray(f.pieces)) throw new Error("Catálogo de peças sem a lista de peças.");
  const pieces: PieceDef[] = [];
  const refused: string[] = [];
  for (const r of f.pieces) {
    const p = cleanUserPiece(r);
    if (typeof p === "string") refused.push(p);
    else pieces.push(p);
  }
  return { name: typeof f.name === "string" && f.name.trim() ? f.name.trim().slice(0, 60) : "Kit X", pieces, refused };
}

// ---------- paleta (§11.3) ----------

/**
 * Põe as peças criadas nos grupos de sempre da paleta: logo abaixo da peça que as gerou (`parent`) ou, se ela não
 * está no grupo, no fim do grupo do tipo delas. Sem peças criadas, devolve os grupos como vieram.
 */
export function withUserPieces<G extends { title: string; codes: string[] }>(groups: G[], cat: Catalog, groupOfType: Partial<Record<PieceType, string>>): G[] {
  const mine = userPieces(cat);
  if (!mine.length) return groups;
  const placed = new Set<string>();
  const out = groups.map((g) => {
    const codes: string[] = [];
    for (const c of g.codes) {
      codes.push(c);
      for (const p of mine) if (p.parent === c && !placed.has(p.code)) (codes.push(p.code), placed.add(p.code));
    }
    return { ...g, codes };
  });
  for (const p of mine) {
    if (placed.has(p.code)) continue;
    const g = out.find((x) => x.title === groupOfType[p.type]);
    if (g) (g.codes.push(p.code), placed.add(p.code));
  }
  return out;
}
