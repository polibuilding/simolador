// Edição por pares (2.x, equipe 17/11/2026): com duas peças selecionadas, o painel da direita mostra e muda a relação
// entre elas, para montar geodésicas e formas sabendo os ângulos.
// - Duas molas com uma esfera em comum: o ângulo entre elas. A segunda selecionada gira em torno da esfera comum, no
//   plano das duas, levando junto o que está pendurado nela (o "galho" que só se liga ao resto por essa esfera).
// - Duas GCs: a distância e o ângulo da reta entre elas (a partir do eixo X, visto de cima). A primeira fica; a
//   segunda (com a estrutura só dela) anda. E "completar o polígono regular" de N lados a partir desse lado.
import type { Catalog } from "./catalog";
import type { InventoryConfig } from "./inventory";
import { addSupport, cross, dot, len, membersAt, norm, round4, sub, add, type Model, type Vec3 } from "./model";
import { validateMovedModel, validateSupport } from "./rules";

const DEG = Math.PI / 180;

/** Gira o vetor v em torno do eixo unitário k (fórmula de Rodrigues). */
export function rotateAbout(v: Vec3, k: Vec3, rad: number): Vec3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const kxv = cross(k, v);
  const kdv = dot(k, v);
  return [0, 1, 2].map((i) => v[i] * c + kxv[i] * s + k[i] * kdv * (1 - c)) as Vec3;
}

/** Nós que se alcançam a partir de `start` sem passar por `block`. */
function reach(model: Model, start: string, block: string): Set<string> {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    for (const m of membersAt(model, id)) {
      const o = m.a === id ? m.b : m.a;
      if (o === block || seen.has(o)) continue;
      seen.add(o);
      stack.push(o);
    }
    for (const p of Object.values(model.plates)) {
      if (!p.corners.includes(id)) continue;
      for (const o of p.corners) if (o !== block && !seen.has(o)) (seen.add(o), stack.push(o));
    }
  }
  return seen;
}

const isBar = (cat: Catalog, code: string) => cat.pieces[code]?.type === "bar";

/** Duas molas com uma esfera em comum: o nó comum, as outras pontas e o ângulo (graus). */
export function barPair(cat: Catalog, model: Model, idA: string, idB: string) {
  const A = model.members[idA];
  const B = model.members[idB];
  if (!A || !B || !isBar(cat, A.code) || !isBar(cat, B.code)) return null;
  const common = [A.a, A.b].find((n) => n === B.a || n === B.b);
  if (!common) return null;
  const farA = A.a === common ? A.b : A.a;
  const farB = B.a === common ? B.b : B.a;
  const c = model.nodes[common].pos;
  const u = sub(model.nodes[farA].pos, c);
  const v = sub(model.nodes[farB].pos, c);
  const cos = Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v))));
  return { common, farA, farB, angle: Math.acos(cos) / DEG };
}

/** Muda o ângulo entre duas molas: a segunda gira em torno da esfera comum, no plano das duas. */
export function setBarAngle(cat: Catalog, model: Model, idA: string, idB: string, deg: number): { model?: Model; error?: string } {
  const pr = barPair(cat, model, idA, idB);
  if (!pr) return { error: "As duas molas precisam ter uma esfera em comum." };
  if (!(deg > 0 && deg <= 180)) return { error: "Use um ângulo entre 0° e 180°." };
  const branch = reach(model, pr.farB, pr.common);
  if (branch.has(pr.farA) || [...branch].some((k) => model.nodes[k].kind === "support")) {
    return { error: "A segunda mola não gira sozinha: o que está preso nela volta para o resto da estrutura (um anel fechado ou uma GC). Solte essa ligação ou escolha a outra mola como segunda." };
  }
  const c = model.nodes[pr.common].pos;
  const u = sub(model.nodes[pr.farA].pos, c);
  const v = sub(model.nodes[pr.farB].pos, c);
  let k = cross(u, v);
  if (len(k) < 1e-9) k = Math.abs(u[1]) < 0.9 * len(u) ? cross(u, [0, 1, 0]) : cross(u, [1, 0, 0]); // alinhadas: gira no plano vertical
  k = norm(k);
  const rad = (deg - pr.angle) * DEG;
  // ligação no nó comum presa à segunda mola (RC90, CC) não deixa girar
  const dirB = norm(v);
  const held = Object.values(model.connectors).find((x) => x.node === pr.common && x.dirs.some((d) => Math.abs(dot(d, dirB)) > 0.999));
  if (held) return { error: `Tem uma ${held.code} prendendo a segunda mola nesse nó: tire-a para mudar o ângulo.` };
  const nodes = { ...model.nodes };
  for (const id of branch) nodes[id] = { ...nodes[id], pos: round4(add(c, rotateAbout(sub(nodes[id].pos, c), k, rad))) };
  const connectors = { ...model.connectors };
  for (const x of Object.values(model.connectors)) {
    if (!branch.has(x.node)) continue;
    connectors[x.id] = { ...x, dirs: x.dirs.map((d) => norm(rotateAbout(d, k, rad))), ...(x.side ? { side: norm(rotateAbout(x.side, k, rad)) } : {}) };
  }
  const next: Model = { ...model, nodes, connectors };
  const ck = validateMovedModel(cat, next, branch);
  return ck.ok ? { model: next } : { error: ck.errors[0] };
}

/** Duas GCs: distância (módulos) e ângulo da reta da primeira para a segunda, a partir do eixo X (visto de cima). */
export function gcPair(model: Model, g1: string, g2: string) {
  const a = model.nodes[g1];
  const b = model.nodes[g2];
  if (!a || !b || a.kind !== "support" || b.kind !== "support") return null;
  const dx = b.pos[0] - a.pos[0];
  const dz = b.pos[2] - a.pos[2];
  return { dist: Math.hypot(dx, dz), angle: Math.atan2(dz, dx) / DEG };
}

/** Põe a segunda GC (e a estrutura só dela) na distância e no ângulo pedidos; a primeira fica. */
export function setGcPair(cat: Catalog, model: Model, g1: string, g2: string, dist: number, deg: number): { model?: Model; error?: string } {
  const cur = gcPair(model, g1, g2);
  if (!cur) return { error: "Selecione duas GCs." };
  if (!(dist > 0)) return { error: "A distância precisa ser maior que zero." };
  const moved = reach(model, g2, "");
  if (moved.has(g1)) return { error: "As duas GCs estão ligadas pela mesma estrutura: a segunda não anda sozinha." };
  const others = [...moved].filter((k) => k !== g2 && model.nodes[k].kind === "support");
  if (others.length) return { error: "A estrutura da segunda GC está presa em outra GC: ela não anda sozinha." };
  const a = model.nodes[g1].pos;
  const target: Vec3 = [a[0] + dist * Math.cos(deg * DEG), 0, a[2] + dist * Math.sin(deg * DEG)];
  const d = sub(target, model.nodes[g2].pos);
  const nodes = { ...model.nodes };
  for (const id of moved) nodes[id] = { ...nodes[id], pos: round4(add(nodes[id].pos, [d[0], 0, d[2]])) };
  const next: Model = { ...model, nodes };
  const ck = validateMovedModel(cat, next, moved);
  return ck.ok ? { model: next } : { error: ck.errors[0] };
}

/**
 * Completa o polígono regular de `n` lados que tem o lado da primeira GC para a segunda: põe as GCs que faltam,
 * à esquerda (sentido anti-horário, visto de cima) ou à direita.
 */
export function completePolygon(cat: Catalog, inv: InventoryConfig, model: Model, g1: string, g2: string, n: number, left: boolean): { model?: Model; error?: string; added?: number } {
  const pr = gcPair(model, g1, g2);
  if (!pr) return { error: "Selecione duas GCs." };
  if (!(Number.isInteger(n) && n >= 3 && n <= 60)) return { error: "Use de 3 a 60 lados." };
  const turn = ((left ? 1 : -1) * 2 * Math.PI) / n;
  let m = model;
  let p = model.nodes[g2].pos;
  let dir = pr.angle * DEG;
  let added = 0;
  for (let i = 2; i < n; i++) {
    dir += turn;
    const q = round4([p[0] + pr.dist * Math.cos(dir), 0, p[2] + pr.dist * Math.sin(dir)]);
    const ck = validateSupport(cat, inv, m, q);
    if (!ck.ok) return { error: `Vértice ${i + 1} de ${n}: ${ck.errors[0]}` };
    m = addSupport(m, q).model;
    added++;
    p = q;
  }
  return { model: m, added };
}

