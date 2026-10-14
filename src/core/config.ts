// Configurações do usuário: mudam parâmetros do programa (módulo, ângulos, chapa, medidas e pesos das peças)
// por cima do catálogo que vem de data/parametros.xlsx.
//
// Robustez (para o programa não quebrar):
// - cada valor tem limites; o que vier fora (ou não for número) é ignorado na carga e recusado na tela;
// - checagens cruzadas (molas com comprimento positivo, esfera menor que o menor vão...) bloqueiam o "Aplicar";
// - as medidas derivadas das regras (mola = vão × M − desconto...) são recalculadas; as medidas medidas ficam;
// - a aplicação é pura (devolve um catálogo novo) e quem carrega (catalog.ts) cai no padrão se algo der errado.
import type { Catalog, PieceDef, Settings } from "./catalog";

export interface Field {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  int?: boolean;
  /** valores permitidos (lista fechada) */
  options?: number[];
  help?: string;
}

/** Básicas: no menu da engrenagem. */
export const BASIC_FIELDS: Field[] = [
  { key: "modulo_mm", label: "Módulo", unit: "mm", min: 8, max: 40, step: 0.01, help: "Distância entre as linhas da grade: a B6 vence 6 módulos." },
  { key: "angulo_minimo_membros_graus", label: "Ângulo mínimo entre molas", unit: "°", min: 15, max: 90, step: 1 },
  { key: "gc_angulo_minimo_base_graus", label: "Mola na GC: mínimo com a chapa", unit: "°", min: 0, max: 85, step: 1 },
  { key: "passo_inclinacao_graus", label: "Passo das inclinadas", unit: "°", min: 5, max: 45, options: [5, 7.5, 10, 15, 22.5, 30, 45] },
  { key: "chapa_modulos_x", label: "Chapa: comprimento", unit: "módulos", min: 6, max: 48, int: true },
  { key: "chapa_modulos_y", label: "Chapa: largura", unit: "módulos", min: 6, max: 48, int: true },
];

/** Avançadas: medidas gerais e do Kit 3. */
export const MEASURE_FIELDS: Field[] = [
  { key: "esfera_diametro_mm", label: "Esfera: diâmetro", unit: "mm", min: 5, max: 40, step: 0.1 },
  { key: "barra_diametro_mm", label: "Mola: diâmetro", unit: "mm", min: 2, max: 15, step: 0.1 },
  { key: "barra_desconto_mm", label: "Mola: desconto (comprimento = vão × M − desconto)", unit: "mm", min: 0, max: 40, step: 0.1 },
  { key: "diagonal_desconto_mm", label: "Diagonal: desconto do cabo", unit: "mm", min: 0, max: 60, step: 0.1 },
  { key: "diagonal_terminal_mm", label: "Diagonal: terminal", unit: "mm", min: 1, max: 15, step: 0.1 },
  { key: "cabo_diametro_mm", label: "Diagonal: diâmetro do cabo", unit: "mm", min: 0.3, max: 4, step: 0.1 },
  { key: "placa_desconto_mm", label: "Placa: desconto do lado", unit: "mm", min: 0, max: 30, step: 0.1 },
  { key: "placa_espessura_mm", label: "Placa: espessura", unit: "mm", min: 1, max: 15, step: 0.1 },
  { key: "gc_diametro_mm", label: "GC: diâmetro", unit: "mm", min: 15, max: 80, step: 0.1 },
  { key: "gc_altura_mm", label: "GC: altura", unit: "mm", min: 3, max: 30, step: 0.1 },
  { key: "gc_centro_esfera_mm", label: "GC: centro da esfera acima da chapa", unit: "mm", min: 2, max: 30, step: 0.1 },
  { key: "rc90_cateto_mm", label: "RC90: lado maior", unit: "mm", min: 5, max: 40, step: 0.1 },
  { key: "rc90_espessura_mm", label: "RC90: espessura", unit: "mm", min: 2, max: 15, step: 0.1 },
  { key: "chapa_espessura_mm", label: "Chapa: espessura", unit: "mm", min: 1, max: 10, step: 0.1 },
  { key: "tolerancia_encaixe_mm", label: "Tolerância de encaixe", unit: "mm", min: 0.05, max: 3, step: 0.05 },
];

export const ROPE_FIELDS: Field[] = [
  { key: "cabo_passo_mm", label: "Cabo: distância entre bolinhas", unit: "mm", min: 1, max: 10, step: 0.01, help: "Conte as bolinhas em 10 cm e divida 100 mm pela contagem." },
  { key: "cabo_bolinha_mm", label: "Cabo: diâmetro da bolinha", unit: "mm", min: 0.5, max: 8, step: 0.1 },
  { key: "cabo_rolo_mm", label: "Cabo: comprimento do rolo", unit: "mm", min: 500, max: 20000, step: 1 },
  { key: "cabo_ligacao_mm", label: "CABLE C: da esfera à ponta do anel", unit: "mm", min: 3, max: 60, step: 0.1 },
  { key: "cabo_clip_mm", label: "CABLE CLIP C: do anel à bolinha", unit: "mm", min: 2, max: 40, step: 0.1 },
  { key: "cabo_ajuste_mm", label: "CABLE C: ajuste do esticador", unit: "mm", min: 0, max: 20, step: 0.1 },
  { key: "cabo_angulo_minimo_graus", label: "Cabo: ângulo mínimo com outra peça na esfera", unit: "°", min: 0, max: 60, step: 1 },
  { key: "enrijecedor_diametro_mm", label: "Enrijecedor: diâmetro", unit: "mm", min: 6.5, max: 20, step: 0.1 },
];

export const ALL_FIELDS = [...BASIC_FIELDS, ...MEASURE_FIELDS, ...ROPE_FIELDS];
const FIELD = new Map(ALL_FIELDS.map((f) => [f.key, f]));

/** Medidas editáveis de cada peça (Avançadas > Peças). `weightG` = peso (g; no cabo, g por metro). */
export interface PieceField {
  key: string;
  label: string;
  min: number;
  max: number;
}
const LEN = (label = "Comprimento"): PieceField => ({ key: "lengthMm", label, min: 0.5, max: 2000 });
const W = (label = "Largura"): PieceField => ({ key: "widthMm", label, min: 0.5, max: 2000 });
const H = (label = "Espessura"): PieceField => ({ key: "thicknessMm", label, min: 0.2, max: 100 });
const WEIGHT: PieceField = { key: "weightG", label: "Peso", min: 0, max: 5000 };

export function pieceFields(p: PieceDef): PieceField[] {
  switch (p.type) {
    case "bar": return [LEN("Comprimento da mola"), WEIGHT];
    case "cable": return [{ key: "cableLengthMm", label: "Comprimento do cabo", min: 0.5, max: 2000 }, WEIGHT];
    case "plate": return [LEN(), W(), H(), WEIGHT];
    case "stiffener": return [LEN(), { key: "diameterMm", label: "Diâmetro", min: 1, max: 40 }, WEIGHT];
    case "accessory": return [LEN("Tamanho"), WEIGHT];
    case "rope": return [{ ...WEIGHT, label: "Peso (g/m)" }];
    case "connector":
      return p.code === "RC90"
        ? [{ key: "legMm", label: "Lado maior", min: 2, max: 60 }, H(), WEIGHT]
        : [LEN(), W(), { key: "heightMm", label: "Altura", min: 0.5, max: 60 }, WEIGHT];
    default: return [WEIGHT];
  }
}

export interface Overrides {
  v: 1;
  settings: Record<string, number>;
  pieces: Record<string, Record<string, number>>;
}
export const emptyOverrides = (): Overrides => ({ v: 1, settings: {}, pieces: {} });

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Valor válido para o campo? (mensagem de erro, ou null) */
export function fieldError(f: Field, v: number): string | null {
  if (!Number.isFinite(v)) return "número";
  if (f.int && !Number.isInteger(v)) return "número inteiro";
  if (f.options && !f.options.includes(v)) return `um de: ${f.options.join(", ")}`;
  if (v < f.min || v > f.max) return `entre ${f.min} e ${f.max}`;
  return null;
}
export function pieceFieldError(f: PieceField, v: number): string | null {
  if (!Number.isFinite(v)) return "número";
  if (v < f.min || v > f.max) return `entre ${f.min} e ${f.max}`;
  return null;
}

/** Limpa o que veio do armazenamento: só campos conhecidos e dentro dos limites. */
export function sanitizeOverrides(raw: unknown, base: Catalog): { ov: Overrides; rejected: string[] } {
  const ov = emptyOverrides();
  const rejected: string[] = [];
  if (!raw || typeof raw !== "object") return { ov, rejected };
  const r = raw as { settings?: unknown; pieces?: unknown };
  if (r.settings && typeof r.settings === "object") {
    for (const [k, v] of Object.entries(r.settings as Record<string, unknown>)) {
      const f = FIELD.get(k);
      const n = num(v);
      if (!f || n === null || fieldError(f, n)) rejected.push(f ? f.label : k);
      else ov.settings[k] = n;
    }
  }
  if (r.pieces && typeof r.pieces === "object") {
    for (const [code, fields] of Object.entries(r.pieces as Record<string, unknown>)) {
      const p = base.pieces[code];
      if (!p || !fields || typeof fields !== "object") {
        rejected.push(code);
        continue;
      }
      const allowed = new Map(pieceFields(p).map((f) => [f.key, f]));
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
        const f = allowed.get(k);
        const n = num(v);
        if (!f || n === null || pieceFieldError(f, n)) rejected.push(`${code} · ${f?.label ?? k}`);
        else (ov.pieces[code] ??= {})[k] = n;
      }
    }
  }
  return { ov, rejected };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Medidas que saem das regras (as mesmas do scripts/gerar-dados.mjs), para um tipo de peça. */
function ruled(p: PieceDef, s: Settings): Record<string, number | boolean | null> {
  const M = s.modulo_mm;
  const [a = 0, b = 0] = p.spanM ?? [];
  switch (p.type) {
    case "node": return { diameterMm: s.esfera_diametro_mm };
    case "support": return { diameterMm: s.gc_diametro_mm, heightMm: s.gc_altura_mm, sphereCenterAboveGroundMm: s.gc_centro_esfera_mm };
    case "bar": return { centerToCenterMm: r2(a * M), lengthMm: r2(a * M - s.barra_desconto_mm), diameterMm: s.barra_diametro_mm };
    case "cable": {
      const cc = Math.hypot(a, b) * M;
      return { centerToCenterMm: r2(cc), cableLengthMm: r2(cc - s.diagonal_desconto_mm), cableDiameterMm: s.cabo_diametro_mm, terminalMm: s.diagonal_terminal_mm };
    }
    case "plate": return { lengthMm: r2(a * M - s.placa_desconto_mm), widthMm: r2(b * M - s.placa_desconto_mm), thicknessMm: s.placa_espessura_mm };
    case "ground": return { lengthMm: r2(s.chapa_modulos_x * M), widthMm: r2(s.chapa_modulos_y * M), thicknessMm: s.chapa_espessura_mm };
    case "connector": return p.code === "RC90" ? { legMm: s.rc90_cateto_mm, thicknessMm: s.rc90_espessura_mm } : {};
    case "stiffener": return { lengthMm: r2(a * M - s.barra_desconto_mm), diameterMm: Number(s.enrijecedor_diametro_mm ?? 9) };
    case "rope":
      return {
        pitchMm: Number(s.cabo_passo_mm), ballMm: Number(s.cabo_bolinha_mm), rollMm: Number(s.cabo_rolo_mm),
        connectionMm: Number(s.cabo_ligacao_mm), clipMm: Number(s.cabo_clip_mm), adjustMm: Number(s.cabo_ajuste_mm ?? 0),
      };
    case "accessory":
      return p.code === "CABLE-C" ? { lengthMm: Number(s.cabo_ligacao_mm) } : p.code === "CLIP-C" ? { lengthMm: Number(s.cabo_clip_mm) } : {};
    default: return {};
  }
}

/**
 * Catálogo com as configurações aplicadas (não mexe no `base`). Medidas que vinham das regras são recalculadas
 * com os parâmetros novos; as que foram medidas na planilha ficam; as da tela (peças) substituem as duas.
 */
export function applyConfig(base: Catalog, ov: Overrides): Catalog {
  const settings = { ...base.settings, ...ov.settings } as Settings;
  // a chapa também tem vão (G)
  const pieces: Record<string, PieceDef> = {};
  for (const [code, p] of Object.entries(base.pieces)) {
    const before = ruled(p, base.settings);
    const after = ruled(p.type === "ground" ? { ...p, spanM: [settings.chapa_modulos_x, settings.chapa_modulos_y] } : p, settings);
    const geometry = { ...p.geometry };
    for (const [k, v] of Object.entries(after)) {
      const was = p.geometry[k];
      // só recalcula o que era da regra (igual ao valor da regra com os parâmetros da planilha)
      const fromRule = was == null || (typeof was === "number" && typeof before[k] === "number" && Math.abs(was - (before[k] as number)) < 0.02);
      if (fromRule && v != null && !(typeof v === "number" && !Number.isFinite(v))) geometry[k] = v;
    }
    const mine = ov.pieces[code] ?? {};
    let weightG = (p as PieceDef & { weightG?: number | null }).weightG ?? null;
    for (const [k, v] of Object.entries(mine)) {
      if (k === "weightG") weightG = v;
      else geometry[k] = v;
    }
    pieces[code] = {
      ...p,
      ...(p.type === "ground" ? { spanM: [settings.chapa_modulos_x, settings.chapa_modulos_y] } : {}),
      geometry,
      weightG,
    } as PieceDef;
  }
  return { settings, pieces, kits: base.kits };
}

/** Checagens cruzadas que deixariam o programa sem sentido (bloqueiam o Aplicar). */
export function checkConfig(cat: Catalog): string[] {
  const s = cat.settings;
  const out: string[] = [];
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  for (const f of ALL_FIELDS) {
    const v = Number(s[f.key]);
    if (s[f.key] == null) continue; // parâmetro que a planilha não tem: o programa usa o padrão interno
    const e = fieldError(f, v);
    if (e) out.push(`${f.label}: precisa ser ${e}.`);
  }
  const bars = Object.values(cat.pieces).filter((p) => p.type === "bar" && p.spanM);
  const minSpan = Math.min(...bars.map((p) => p.spanM![0]), Infinity);
  if (Number.isFinite(minSpan) && s.esfera_diametro_mm >= minSpan * s.modulo_mm) {
    out.push(`A esfera (${fmt(s.esfera_diametro_mm)} mm) não cabe no menor vão (${fmt(minSpan * s.modulo_mm)} mm): aumente o módulo ou diminua a esfera.`);
  }
  if (s.barra_diametro_mm >= s.esfera_diametro_mm) out.push("A mola precisa ser mais fina que a esfera.");
  for (const p of Object.values(cat.pieces)) {
    for (const k of ["lengthMm", "cableLengthMm", "widthMm"]) {
      const v = p.geometry[k];
      if (typeof v === "number" && !(v > 0)) out.push(`${p.code}: ${k === "widthMm" ? "largura" : "comprimento"} ficaria ${fmt(v)} mm (precisa ser maior que zero).`);
    }
  }
  if (Number(s.cabo_bolinha_mm ?? 0) > Number(s.cabo_passo_mm ?? Infinity)) out.push("A bolinha do cabo não pode ser maior que a distância entre bolinhas.");
  if (s.tolerancia_encaixe_mm >= s.modulo_mm / 4) out.push("A tolerância de encaixe precisa ser bem menor que o módulo.");
  if (s.gc_diametro_mm >= Math.min(s.chapa_modulos_x, s.chapa_modulos_y) * s.modulo_mm) out.push("A GC não cabe na chapa.");
  return [...new Set(out)];
}

/** Só o que difere do catálogo da planilha (para guardar). */
export function diffOverrides(base: Catalog, draft: Overrides): Overrides {
  const out = emptyOverrides();
  for (const [k, v] of Object.entries(draft.settings)) if (Number(base.settings[k]) !== v) out.settings[k] = v;
  for (const [code, fields] of Object.entries(draft.pieces)) {
    const p = base.pieces[code] as (PieceDef & { weightG?: number | null }) | undefined;
    if (!p) continue;
    for (const [k, v] of Object.entries(fields)) {
      const was = k === "weightG" ? p.weightG : p.geometry[k];
      if (was !== v) (out.pieces[code] ??= {})[k] = v;
    }
  }
  return out;
}

export const isEmptyOverrides = (o: Overrides) => !Object.keys(o.settings).length && !Object.keys(o.pieces).length;
