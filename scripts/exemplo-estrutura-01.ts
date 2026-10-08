// Reconstrói a "Estrutura 01" do Desafio Poli-USP 2022 (pranchas em sheets/ no Drive) e grava examples/estrutura-01-desafio-2022.mola.
// Uso: npx vite-node scripts/exemplo-estrutura-01.ts
import { writeFileSync } from "node:fs";
import { catalog } from "../src/core/catalog";
import { defaultInventory } from "../src/core/inventory";
import { addMember, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../src/core/model";
import { validateMember } from "../src/core/rules";
import { applyCandidate, connectorCandidates, plateCandidates } from "../src/core/snapping";
import { toFile } from "../src/core/serialization";

const inv = defaultInventory(catalog);
const A = 3, B = 9, C = 15; // eixos A, B, C (módulos)
const ROWS = [3, 9]; // eixos 1 e 2
let m: Model = emptyModel();
const id = (p: Vec3) => {
  const n = findNodeAt(m, p);
  if (!n) throw new Error(`sem nó em ${p}`);
  return n.id;
};
const bar = (code: string, from: Vec3, to: Vec3) => {
  const c = validateMember(catalog, inv, m, code, id(from), to);
  if (!c.ok) throw new Error(`${code} ${from}→${to}: ${c.errors.join("; ")}`);
  m = addMember(m, code, id(from), to).model;
};

for (const z of ROWS) for (const x of [A, B, C]) m = addSupport(m, [x, 0, z]).model;
for (const z of ROWS) {
  // pilares
  bar("B6", [A, 0, z], [A, 6, z]); bar("B6", [A, 6, z], [A, 12, z]); bar("B6", [A, 12, z], [A, 18, z]);
  bar("B6", [B, 0, z], [B, 6, z]); bar("B6", [B, 6, z], [B, 12, z]);
  bar("B6", [C, 0, z], [C, 6, z]); bar("B12", [C, 6, z], [C, 18, z]);
  // vigas na direção x
  bar("B6", [A, 6, z], [B, 6, z]); bar("B6", [B, 6, z], [C, 6, z]);
  bar("B6", [A, 12, z], [B, 12, z]);
  bar("B12", [A, 18, z], [C, 18, z]);
  // contraventamento
  bar("D6x6", [A, 0, z], [B, 6, z]); bar("D6x6", [B, 0, z], [A, 6, z]);
  bar("D6x6", [A, 6, z], [B, 12, z]); bar("D6x6", [B, 6, z], [A, 12, z]);
  bar("D6x6", [A, 18, z], [B, 12, z]); bar("D6x6", [C, 18, z], [B, 12, z]);
}
// vigas na direção z
for (const y of [6, 12, 18]) bar("B6", [A, y, 3], [A, y, 9]);
for (const y of [6, 12]) bar("B6", [B, y, 3], [B, y, 9]);
for (const y of [6, 18]) bar("B6", [C, y, 3], [C, y, 9]);

// placas: lajes A–B e B–C no 1º, A–B no 2º, A–C na cobertura; parede em C do 1º à cobertura
const plate = (code: string, test: (ps: Vec3[]) => boolean) => {
  const c = plateCandidates(catalog, inv, m, code).find((x) => x.kind === "plate" && x.check.ok && test(x.geom.corners));
  if (!c) throw new Error(`placa ${code} não encontrada`);
  m = applyCandidate(m, c);
};
const allY = (ps: Vec3[], y: number) => ps.every((p) => p[1] === y);
const xs = (ps: Vec3[]) => [Math.min(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[0]))];
plate("P6x6", (ps) => allY(ps, 6) && xs(ps)[0] === A && xs(ps)[1] === B);
plate("P6x6", (ps) => allY(ps, 6) && xs(ps)[0] === B && xs(ps)[1] === C);
plate("P6x6", (ps) => allY(ps, 12) && xs(ps)[0] === A && xs(ps)[1] === B);
plate("P6x12", (ps) => allY(ps, 18) && xs(ps)[0] === A && xs(ps)[1] === C);
plate("P6x12", (ps) => ps.every((p) => p[0] === C) && Math.min(...ps.map((p) => p[1])) === 6);

// ligações rígidas
const rc = (at: Vec3, pick: (dirs: Vec3[], base?: boolean) => boolean) => {
  const c = connectorCandidates(catalog, inv, m, "RC90", id(at)).find((x) => x.kind === "connector" && x.check.ok && pick(x.spec.dirs, x.spec.base));
  if (!c) throw new Error(`RC90 em ${at} não encontrada`);
  m = applyCandidate(m, c);
};
const has = (dirs: Vec3[], d: Vec3) => dirs.some((e) => e[0] === d[0] && e[1] === d[1] && e[2] === d[2]);
for (const z of ROWS) {
  const toOther: Vec3 = z === 3 ? [0, 0, 1] : [0, 0, -1];
  // na base dos pilares A e C, uma de cada lado (±z)
  for (const x of [A, C]) for (const side of [[0, 0, 1], [0, 0, -1]] as Vec3[]) rc([x, 0, z], (d, base) => !!base && has(d, side));
  // pórtico do eixo A: cantos pilar × viga em z
  rc([A, 6, z], (d) => has(d, [0, -1, 0]) && has(d, toOther));
  rc([A, 6, z], (d) => has(d, [0, 1, 0]) && has(d, toOther));
  rc([A, 12, z], (d) => has(d, [0, -1, 0]) && has(d, toOther));
  rc([A, 12, z], (d) => has(d, [0, 1, 0]) && has(d, toOther));
  rc([A, 18, z], (d) => has(d, [0, -1, 0]) && has(d, toOther));
  // eixo C, no 1º pavimento, embaixo da viga
  rc([C, 6, z], (d) => has(d, [0, -1, 0]) && has(d, toOther));
}

const file = toFile(m, inv, "Estrutura 01", catalog.settings.modulo_mm, { line1: "MOLA STRUCTURAL MODEL", line2: "DESAFIO POLI-USP 2022" });
writeFileSync(new URL("../examples/estrutura-01-desafio-2022.mola", import.meta.url), JSON.stringify(file, null, 2) + "\n");
const count: Record<string, number> = {};
for (const n of Object.values(m.nodes)) count[n.kind === "support" ? "GC" : "C"] = (count[n.kind === "support" ? "GC" : "C"] ?? 0) + 1;
for (const x of [...Object.values(m.members), ...Object.values(m.plates), ...Object.values(m.connectors)]) count[x.code] = (count[x.code] ?? 0) + 1;
console.log("ok", count);
