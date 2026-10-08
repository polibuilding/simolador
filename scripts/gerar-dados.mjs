#!/usr/bin/env node
// siMOLAdor: gera data/catalog.json e data/kits.json a partir de data/parametros.xlsx.
//
// Uso:   npm run dados            (ou: node scripts/gerar-dados.mjs [entrada.xlsx] [pasta-saida])
// Requer: npm install exceljs
//
// As regras de medida ficam AQUI (as colunas de prévia da planilha são só conferência):
//   barra:    comprimento = vão × M − barra_desconto_mm
//   diagonal: centro a centro = √(a² + b²) × M ; cabo = c/c − diagonal_desconto_mm
//   placa:    lado = vão × M − placa_desconto_mm
//   chapa:    chapa_modulos_x × M  por  chapa_modulos_y × M
// Uma coluna "medido" preenchida na aba Peças substitui a regra só para aquela peça.

import ExcelJS from "exceljs";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(process.argv[2] ?? join(ROOT, "data", "parametros.xlsx"));
const OUTDIR = resolve(process.argv[3] ?? join(ROOT, "data"));

const TYPES = new Set(["node", "support", "connector", "bar", "cable", "plate", "ground"]);
const REQUIRED = [
  "modulo_mm", "esfera_diametro_mm", "barra_diametro_mm", "barra_desconto_mm",
  "diagonal_desconto_mm", "diagonal_terminal_mm", "cabo_diametro_mm",
  "placa_desconto_mm", "placa_espessura_mm", "gc_diametro_mm", "gc_altura_mm",
  "gc_centro_esfera_mm", "rc90_cateto_mm", "rc90_espessura_mm",
  "chapa_modulos_x", "chapa_modulos_y", "chapa_espessura_mm",
  "angulo_minimo_membros_graus", "max_membros_por_plano", "tolerancia_encaixe_mm",
];

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// Valor "cru" da célula: número, texto ou null. Fórmulas usam o resultado salvo.
function cellValue(cell) {
  let v = cell?.value;
  if (v && typeof v === "object") {
    if ("result" in v) v = v.result;
    else if ("richText" in v) v = v.richText.map((t) => t.text).join("");
    else if ("text" in v) v = v.text;
  }
  if (v === undefined || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) && /^-?[\d.,]+$/.test(s) ? n : s;
  }
  return v;
}

// Lê uma aba como lista de objetos, usando a linha 1 como cabeçalho.
function readTable(ws) {
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => (headers[col] = cellValue(c)));
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const obj = { _linha: n };
    headers.forEach((h, col) => h && (obj[h] = cellValue(row.getCell(col))));
    rows.push(obj);
  });
  return { headers: headers.filter(Boolean), rows };
}

function sheet(wb, name) {
  const ws = wb.getWorksheet(name);
  if (!ws) err(`Aba "${name}" não encontrada em ${INPUT}.`);
  return ws;
}

const round = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const positive = (v) => typeof v === "number" && v > 0;

async function main() {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(INPUT);
  } catch (e) {
    console.error(`Não consegui abrir ${INPUT}: ${e.message}`);
    process.exit(1);
  }

  // ---------- Geral ----------
  const P = {};
  const pStatus = {};
  const wsG = sheet(wb, "Geral");
  if (wsG) {
    for (const r of readTable(wsG).rows) {
      const k = r["Parâmetro"];
      if (!k || r["Valor"] == null && r["Unid."] == null && r["Descrição"] == null) continue; // linhas de seção
      if (k in P) err(`Geral, linha ${r._linha}: parâmetro "${k}" repetido.`);
      P[k] = r["Valor"];
      pStatus[k] = r["Status"] ?? null;
      if (r["Status"] === "estimado" || r["Status"] === "a medir") warn(`Geral: ${k} = ${r["Valor"]} ainda é "${r["Status"]}".`);
    }
    for (const k of REQUIRED) {
      if (!(k in P)) err(`Geral: falta o parâmetro "${k}".`);
      else if (!positive(P[k])) err(`Geral: "${k}" precisa ser um número maior que zero (está "${P[k]}").`);
    }
  }
  const M = P.modulo_mm;

  // ---------- Peças ----------
  const pieces = [];
  const codes = new Set();
  const wsP = sheet(wb, "Peças");
  if (wsP && errors.length === 0) {
    for (const r of readTable(wsP).rows) {
      const code = r["Código"];
      if (!code) continue;
      const where = `Peças, linha ${r._linha} (${code})`;
      if (codes.has(code)) err(`${where}: código repetido.`);
      codes.add(code);
      const type = r["Tipo"];
      if (!TYPES.has(type)) { err(`${where}: tipo "${type}" inválido. Use: ${[...TYPES].join(", ")}.`); continue; }

      const a = r["Vão A (M)"], b = r["Vão B (M)"];
      const mLen = r["Comprimento medido"], mWid = r["Largura medida"], mHgt = r["Altura/espessura medida"];
      for (const [label, v] of [["Comprimento medido", mLen], ["Largura medida", mWid], ["Altura/espessura medida", mHgt]]) {
        if (v != null && !positive(v)) err(`${where}: "${label}" precisa ser número > 0 (está "${v}").`);
      }
      const needSpan = (n) => {
        if (!Number.isInteger(a) || a <= 0) err(`${where}: "Vão A (M)" precisa ser inteiro > 0.`);
        if (n === 2 && (!Number.isInteger(b) || b <= 0)) err(`${where}: "Vão B (M)" precisa ser inteiro > 0.`);
      };
      const src = (measured) => (measured != null ? "medido" : "regra");
      let spanM = null, geometry = {}, sources = {};

      switch (type) {
        case "node":
          geometry = { diameterMm: P.esfera_diametro_mm };
          break;
        case "support":
          geometry = { diameterMm: mLen ?? P.gc_diametro_mm, heightMm: mHgt ?? P.gc_altura_mm, sphereCenterAboveGroundMm: P.gc_centro_esfera_mm, hasSphere: true };
          break;
        case "connector":
          if (code === "RC90") {
            geometry = { legMm: mLen ?? P.rc90_cateto_mm, thicknessMm: mWid ?? P.rc90_espessura_mm };
          } else {
            geometry = { lengthMm: mLen, widthMm: mWid, heightMm: mHgt };
            if (mLen == null || mWid == null || mHgt == null) warn(`${where}: medidas incompletas; o programa usará um formato provisório.`);
          }
          break;
        case "bar":
          needSpan(1);
          spanM = [a];
          geometry = {
            centerToCenterMm: round(a * M),
            lengthMm: round(mLen ?? a * M - P.barra_desconto_mm),
            diameterMm: mWid ?? P.barra_diametro_mm,
          };
          sources = { lengthMm: src(mLen) };
          break;
        case "cable": {
          needSpan(2);
          spanM = [a, b];
          const cc = Math.hypot(a, b) * M;
          geometry = {
            centerToCenterMm: round(cc),
            cableLengthMm: round(mLen ?? cc - P.diagonal_desconto_mm),
            cableDiameterMm: mWid ?? P.cabo_diametro_mm,
            terminalMm: P.diagonal_terminal_mm,
          };
          sources = { cableLengthMm: src(mLen) };
          break;
        }
        case "plate":
          needSpan(2);
          spanM = [a, b];
          geometry = {
            lengthMm: round(mLen ?? a * M - P.placa_desconto_mm),
            widthMm: round(mWid ?? b * M - P.placa_desconto_mm),
            thicknessMm: mHgt ?? P.placa_espessura_mm,
          };
          sources = { lengthMm: src(mLen), widthMm: src(mWid), thicknessMm: mHgt != null ? "medido" : pStatus.placa_espessura_mm };
          break;
        case "ground":
          spanM = [P.chapa_modulos_x, P.chapa_modulos_y];
          geometry = {
            lengthMm: round(mLen ?? P.chapa_modulos_x * M),
            widthMm: round(mWid ?? P.chapa_modulos_y * M),
            thicknessMm: mHgt ?? P.chapa_espessura_mm,
          };
          break;
      }
      for (const [k, v] of Object.entries(geometry)) {
        if (typeof v === "number" && !(v > 0)) err(`${where}: medida calculada "${k}" = ${v}; confira os descontos em Geral.`);
      }
      if (r["Status"] === "a medir") warn(`${where}: status "a medir".`);
      pieces.push({
        code, name: r["Nome"] ?? code, type, spanM, geometry,
        ...(Object.keys(sources).length ? { sources } : {}),
        behavior: r["Comportamento"] ?? null,
        status: r["Status"] ?? null,
        notes: r["Observações"] ?? null,
      });
    }
  }

  // ---------- Kits e Estoque ----------
  const kits = {};
  const wsK = sheet(wb, "Kits");
  if (wsK) {
    for (const r of readTable(wsK).rows) {
      const id = r["Kit"];
      if (id == null || typeof id !== "number") continue;
      kits[id] = { name: r["Nome"] ?? `Kit ${id}`, color: r["Cor"] ?? null, officialCount: r["Peças (site oficial)"] ?? null, pieces: {} };
    }
  }
  const wsE = sheet(wb, "Estoque");
  if (wsE) {
    const { headers, rows } = readTable(wsE);
    const kitCols = headers.filter((h) => /^Kit\s+\d+$/i.test(String(h)));
    for (const h of kitCols) {
      const id = Number(String(h).match(/\d+/)[0]);
      if (!kits[id]) err(`Estoque: coluna "${h}" sem linha correspondente na aba Kits.`);
    }
    for (const r of rows) {
      const code = r["Código"];
      if (!code || code === "Total" || String(code).startsWith("Conferir")) continue;
      if (!codes.has(code)) err(`Estoque, linha ${r._linha}: código "${code}" não existe na aba Peças.`);
      for (const h of kitCols) {
        const id = Number(String(h).match(/\d+/)[0]);
        const q = r[h] ?? 0;
        if (!Number.isInteger(q) || q < 0) { err(`Estoque, linha ${r._linha} (${code}), ${h}: quantidade "${q}" inválida.`); continue; }
        if (kits[id] && q > 0) kits[id].pieces[code] = q;
      }
    }
    for (const [id, k] of Object.entries(kits)) {
      const total = Object.values(k.pieces).reduce((s, q) => s + q, 0);
      k.totalCount = total;
      if (k.officialCount != null && total !== k.officialCount) warn(`Kit ${id}: soma do estoque = ${total}, site oficial = ${k.officialCount}.`);
    }
  }

  // ---------- Saída ----------
  for (const w of warnings) console.warn(`aviso: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`ERRO: ${e}`);
    console.error(`\n${errors.length} erro(s). Nada foi gravado. Corrija ${INPUT} e rode de novo.`);
    process.exit(1);
  }

  const stamp = { generatedBy: "scripts/gerar-dados.mjs", source: "data/parametros.xlsx", generatedAt: new Date().toISOString(), doNotEdit: "Arquivo gerado. Edite data/parametros.xlsx e rode npm run dados." };
  const settings = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v]));
  const catalog = { _meta: stamp, schemaVersion: 2, units: { moduleMm: M }, settings, pieces };
  const kitsOut = { _meta: stamp, schemaVersion: 2, kits };

  await mkdir(OUTDIR, { recursive: true });
  await writeFile(join(OUTDIR, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n", "utf8");
  await writeFile(join(OUTDIR, "kits.json"), JSON.stringify(kitsOut, null, 2) + "\n", "utf8");
  console.log(`ok: ${pieces.length} peças, ${Object.keys(kits).length} kits → ${join(OUTDIR, "catalog.json")} e kits.json (${warnings.length} aviso(s)).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
