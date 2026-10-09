// Gera examples/torre-triangular.mola: torre de base triangular (B6), dois pavimentos, placa numa face
// e contraventamento em altura (diagonais em faces inclinadas em relação às vistas).
import { writeFileSync } from "node:fs";
import { catalog } from "../src/core/catalog";
import { defaultInventory } from "../src/core/inventory";
import { addMember, addPlate, addSupport, emptyModel, findNodeAt, type Model, type Vec3 } from "../src/core/model";
import { validateMember, validatePlate } from "../src/core/rules";
import { toFile } from "../src/core/serialization";

const inv = { ...defaultInventory(catalog), kits: { 1: 2, 2: 2 } };
const id = (m: Model, p: Vec3) => findNodeAt(m, p)!.id;
const h = 5.1962;
const base: Vec3[] = [[6, 0, 3], [12, 0, 3], [9, 0, 3 + h]];
let m = emptyModel();
const bar = (code: string, a: Vec3, b: Vec3) => {
  const ck = validateMember(catalog, inv, m, code, id(m, a), b);
  if (!ck.ok) throw new Error(`${code} ${a} → ${b}: ${ck.errors[0]}`);
  m = addMember(m, code, id(m, a), b).model;
};
for (const p of base) m = addSupport(m, p).model;
for (const p of base) for (const y of [0, 6]) bar("B6", [p[0], y, p[2]], [p[0], y + 6, p[2]]);
for (const y of [6, 12]) for (let i = 0; i < 3; i++) {
  const a = base[i], b = base[(i + 1) % 3];
  bar("B6", [a[0], y, a[2]], [b[0], y, b[2]]);
}
// placa no painel de baixo de uma face (a viga do meio impede uma P6x12 inteira)
{
  const corners = [id(m, base[0]), id(m, base[1]), id(m, [12, 6, 3]), id(m, [6, 6, 3])] as [string, string, string, string];
  const ck = validatePlate(catalog, inv, m, "P6x6", { corners: corners.map((c) => m.nodes[c].pos) as never, normal: [0, 0, 1] });
  if (!ck.ok) throw new Error(ck.errors[0]);
  m = addPlate(m, "P6x6", corners).model;
}
// contraventamento das outras duas faces (inclinadas em relação às vistas A–D)
for (const [a, b] of [[base[1], base[2]], [base[2], base[0]]] as [Vec3, Vec3][]) {
  bar("D6x6", [a[0], 0, a[2]], [b[0], 6, b[2]]);
  bar("D6x6", [a[0], 12, a[2]], [b[0], 6, b[2]]);
}
writeFileSync("examples/torre-triangular.mola", JSON.stringify(toFile(m, inv, "Torre triangular", catalog.settings.modulo_mm), null, 2));
console.log("ok", Object.keys(m.members).length, "peças lineares");
