// Posicionar e mover peças.
// - Clique na paleta (fica armado) ou arraste da paleta para a cena.
// - As posições válidas viram "pontos de encaixe": a ponta de uma barra, o centro de uma placa, a esfera de uma ligação.
//   Passar o cursor perto de um ponto mostra a peça; R alterna entre as opções daquele ponto.
// - Passar o cursor sobre uma esfera existente também vale: mostra as peças que saem dela (R gira a direção).
// - Arrastar uma peça selecionada (ou M) a retira para mudar de lugar; uma GC ou esfera move a estrutura inteira.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { catalog } from "../core/catalog";
import { bodyMoveOptions, connectReach, locusStatus, moveGroup, nodeMoveOptions, sphereMeridianLimits, type BodyRef, type LocusStatus, type NodeMoveSet } from "../core/edit";
import { pasteClip, transformClip, type Clip, type PasteResult } from "../core/clipboard";
import { AXES, add, boardsOf, dot, findNodeAt, len, norm, rotDir, scale, sub, toDisp, type Model, type Vec3 } from "../core/model";
import { frameRadAt } from "../core/boards";
import { validateMember, validateRope, validateStiffener } from "../core/rules";
import { ropeInfo, ropeText, STIFF_TOOL } from "../core/rope";
import type { Sel } from "../core/edit";
import {
  allCandidates, anchorPos, barTriangleGuides, inclinedDirs, markerPos, supportCandidate, supportGuides, supportPosition,
  type BarGuide, type Candidate, type SupportGuide,
} from "../core/snapping";
import { componentOf } from "../core/model";
import { freeOn, inclineOn, panelOpen, useApp, workingModel, type Tool } from "../ui/store";
import { BASE_Y, M, toWorld } from "../render/units";
import { PROPS_W } from "../render/Scene";

const SPOT_PX = 46;
const CLICK_PX = 5;
const DRAG_PX = 6;
/** canto superior direito da cena ocupado pelo cubo de visualização */
const GIZMO_PX = 175;
/** canto inferior esquerdo ocupado pelos eixos X, Y, Z */
const AXES_PX = 120;

const key = (p: Vec3) => p.map((v) => v.toFixed(3)).join(",");

/** Preferência de direção para barras que saem de uma esfera: para cima, depois na horizontal, por último para baixo. */
function dirRank(model: Model, c: Candidate) {
  const a = anchorPos(model, c);
  if (!a || c.kind !== "member") return 0;
  const dy = c.toPos[1] - a[1];
  return dy > 0 ? 0 : dy === 0 ? 1 : 2;
}

/** Ângulo de uma barra inclinada, em palavras ("30° com a horizontal", "30° em planta"); null se estiver num eixo. */
function angleText(model: Model, c: Candidate): string | null {
  if (c.kind !== "member" || catalog.pieces[c.code]?.type !== "bar") return null;
  const v = sub(c.toPos, model.nodes[c.fromId].pos);
  const L = len(v);
  if (v.filter((x) => Math.abs(x) > 1e-6).length < 2) return null;
  const deg = (r: number) => Math.round((r * 180) / Math.PI);
  if (Math.abs(v[1]) < 1e-6) return `${deg(Math.atan2(Math.abs(v[2]), Math.abs(v[0])))}° em planta (a partir de X)`;
  return `${deg(Math.asin(Math.abs(v[1]) / L))}° com a horizontal`;
}

interface Spot {
  pos: Vec3;
  ends: Candidate[]; // candidatas que terminam/ficam neste ponto
  starts: Candidate[]; // barras/diagonais que saem deste ponto (esfera existente)
}

// cache das candidatas: recalcula só quando muda o modelo, a peça ou o estoque
let cache: { model: Model; code: string; inv: unknown; inclined: boolean; cands: Candidate[]; spots: Map<string, Spot> } | null = null;
export function candidatesFor(model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"], inclined = false) {
  if (cache && cache.model === model && cache.code === code && cache.inv === inv && cache.inclined === inclined) return cache;
  const cands = allCandidates(catalog, inv, model, code, { inclined });
  const spots = new Map<string, Spot>();
  const get = (p: Vec3) => {
    const k = key(p);
    let s = spots.get(k);
    if (!s) spots.set(k, (s = { pos: p, ends: [], starts: [] }));
    return s;
  };
  for (const c of cands) {
    // inclinada até um ponto novo: não vira ponto de encaixe (apareceria em toda parte); surge ao puxar o cursor da esfera
    const free = c.kind === "member" && c.inclined && !findNodeAt(model, c.toPos);
    if (!free) get(markerPos(model, c)).ends.push(c);
    const a = anchorPos(model, c);
    if (a) get(a).starts.push(c);
  }
  cache = { model, code, inv, inclined, cands, spots };
  return cache;
}

// guias da GC (pontos azuis e amarelos): recalcula quando muda o modelo, o estoque ou o que está sendo movido
let guideCache: { model: Model; inv: unknown; key: string; guides: SupportGuide[] } | null = null;
export function guidesFor(model: Model, inv: ReturnType<typeof useApp.getState>["inventory"], ignore: Set<string> = new Set()) {
  const key = [...ignore].sort().join(",");
  if (guideCache && guideCache.model === model && guideCache.inv === inv && guideCache.key === key) return guideCache.guides;
  guideCache = { model, inv, key, guides: supportGuides(catalog, inv, model, ignore) };
  return guideCache.guides;
}

// pontos amarelos de barras (triângulos a partir de uma esfera)
let barGuideCache: { model: Model; code: string; inv: unknown; anchor: string; guides: BarGuide[] } | null = null;
export function barGuidesFor(model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"], anchor: string) {
  const c = barGuideCache;
  if (c && c.model === model && c.code === code && c.inv === inv && c.anchor === anchor) return c.guides;
  barGuideCache = { model, code, inv, anchor, guides: barTriangleGuides(catalog, inv, model, code, anchor) };
  return barGuideCache.guides;
}

// ligação entre duas esferas (dois cliques): recalcula quando muda o modelo, a peça ou as esferas
let linkCache: { model: Model; code: string; inv: unknown; a: string; b: string; r: ReturnType<typeof connectReach> } | null = null;
function linkFor(model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"], a: string, b: string) {
  const c = linkCache;
  if (c && c.model === model && c.code === code && c.inv === inv && c.a === a && c.b === b) return c.r;
  linkCache = { model, code, inv, a, b, r: connectReach(catalog, inv, model, code, a, b) };
  return linkCache.r;
}

/** Peças novas de `full` em relação a `base` (para o fantasma): o modelo só com elas e os nós novos. */
function newPart(base: Model, full: Model): { part: Model; ids: Set<string> } {
  const members = Object.fromEntries(Object.entries(full.members).filter(([k]) => !base.members[k]));
  const used = new Set<string>();
  for (const m of Object.values(members)) (used.add(m.a), used.add(m.b));
  const nodes = Object.fromEntries(Object.entries(full.nodes).filter(([k]) => used.has(k)));
  return { part: { ...full, nodes, members, plates: {}, connectors: {} }, ids: new Set(Object.keys(nodes).filter((k) => !base.nodes[k])) };
}

/** distância na tela (px) para "pegar" um ponto amarelo de barra e para adotar a esfera de partida */
const TRI_PX = 14;
const TRI_ANCHOR_PX = 22;
/** depois do Tab, o cursor pode andar até aqui sem perder o ponto escolhido */
const TAB_PX = 40;

// colar: recalcula só quando muda a posição na grade, o giro, o espelho ou a altura
let pasteCache: { base: Model; clip: Clip; key: string; r: PasteResult } | null = null;

// opções de "mover só o nó" (recalcula quando muda o modelo ou o nó)
let nodeMoveCache: { model: Model; nodeId: string; r: ReturnType<typeof nodeMoveOptions> } | null = null;
export function nodeOptionsFor(model: Model, nodeId: string) {
  if (nodeMoveCache && nodeMoveCache.model === model && nodeMoveCache.nodeId === nodeId) return nodeMoveCache.r;
  nodeMoveCache = { model, nodeId, r: nodeMoveOptions(catalog, model, nodeId) };
  return nodeMoveCache.r;
}

// giro do conjunto em torno das GC (duplo clique numa mola, diagonal ou placa)
let bodyCache: { model: Model; key: string; r: ReturnType<typeof bodyMoveOptions> } | null = null;
export function bodyOptionsFor(model: Model, ref: BodyRef) {
  const key = `${ref.kind}:${ref.id}`;
  if (bodyCache && bodyCache.model === model && bodyCache.key === key) return bodyCache.r;
  bodyCache = { model, key, r: bodyMoveOptions(catalog, model, ref) };
  return bodyCache.r;
}

/** Caminho de quem anda pelo azul: a esfera (mover só o nó) ou o conjunto (giro em torno das GC). */
export function pathFor(model: Model, tool: Tool): { set: NodeMoveSet; start: Vec3; lift: boolean; key: string } | null {
  if (tool.kind === "moveNode") {
    const n = model.nodes[tool.nodeId];
    if (!n) return null;
    return { set: nodeOptionsFor(model, tool.nodeId), start: n.pos, lift: n.kind === "support", key: `n:${tool.nodeId}` };
  }
  if (tool.kind === "moveBody") {
    const set = bodyOptionsFor(model, tool.ref);
    return { set, start: set.handle, lift: false, key: `b:${tool.ref.kind}:${tool.ref.id}` };
  }
  return null;
}

// trechos azuis e vermelhos do caminho (recalcula quando muda o modelo ou quem anda)
let locusCache: { model: Model; key: string; r: LocusStatus } | null = null;
export function locusStatusFor(model: Model, key: string, set: NodeMoveSet): LocusStatus {
  if (locusCache && locusCache.model === model && locusCache.key === key) return locusCache.r;
  locusCache = { model, key, r: locusStatus(set) };
  return locusCache.r;
}

/** A GC sendo colocada/movida "puxa" para um ponto-guia perto do cursor (na tela), em qualquer modo de encaixe. */
const GUIDE_PX = 18;
/** com a grade desligada, os pontos azuis/amarelos puxam a GC de mais longe */
const EXCLUSIVE_PX = 90;

export function Placement() {
  const { camera, gl, controls } = useThree();
  const down = useRef<{ x: number; y: number } | null>(null);
  const lastSpot = useRef<string | null>(null);

  // trava a câmera enquanto arrasta uma peça
  useEffect(
    () =>
      useApp.subscribe((s) => {
        const dragging = (s.tool.kind !== "select" && s.tool.viaDrag) || !!s.pendingDrag;
        if (controls) (controls as unknown as { enabled: boolean }).enabled = !dragging;
      }),
    [controls],
  );

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();

    const toScreen = (v: THREE.Vector3, rect: DOMRect) => {
      const p = v.clone().project(camera);
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height, z: p.z };
    };
    const insideOf = (ev: PointerEvent, rect: DOMRect) =>
      ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
    const planeHit = (ev: PointerEvent, rect: DOMRect, yMm: number) => {
      const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -yMm), new THREE.Vector3());
    };

    // ---- GC: ponto de encaixe (grade, azul, amarelo): vale o mais perto do cursor; Tab alterna entre os sobrepostos ----
    let lastChoiceKey = "";
    const KIND_NAME = { grid: "Grade", blue: "Azul", yellow: "Amarelo" } as const;
    const pickSupport = (
      ev: PointerEvent, rect: DOMRect, hit: { x: number; z: number }, guides: SupportGuide[],
    ): { pos: Vec3 | null; hint: string | null } => {
      const st = useApp.getState();
      // distância na tela medida na altura da chapa, onde os pontos são desenhados
      const dist = (p: Vec3) => {
        const w = toWorld(p);
        w.y = 0.6;
        const sp = toScreen(w, rect);
        return Math.hypot(sp.x - ev.clientX, sp.y - ev.clientY);
      };
      type Choice = { pos: Vec3; kind: keyof typeof KIND_NAME; text: string | null; d: number };
      const enabled = guides.filter((g) => st.guides[g.kind]);
      // grade desligada e há pontos azuis/amarelos: a GC só vai para eles (raio maior)
      const exclusive = !st.snap && enabled.length > 0;
      const radius = exclusive ? EXCLUSIVE_PX : GUIDE_PX;
      const all: Choice[] = [];
      if (st.snap) {
        const g = supportPosition(catalog, hit, true, boardsOf(st.history.present));
        all.push({ pos: g, kind: "grid", text: null, d: dist(g) });
      }
      for (const g of enabled) {
        const d = dist(g.pos);
        if (d >= radius) continue;
        // mesmo ponto: amarelo > azul > grade (o que diz mais fica)
        const rank = { grid: 0, blue: 1, yellow: 2 } as const;
        const same = all.findIndex((c) => Math.hypot(c.pos[0] - g.pos[0], c.pos[2] - g.pos[2]) < 1e-3);
        if (same >= 0) {
          if (rank[all[same].kind] >= rank[g.kind]) continue;
          all.splice(same, 1);
        }
        all.push({ pos: g.pos, kind: g.kind, text: g.text, d });
      }
      if (!all.length) {
        if (exclusive) {
          const which = [st.guides.blue && "azul", st.guides.yellow && "amarelo"].filter(Boolean).join(" ou ");
          return { pos: null, hint: `Grade desligada: leve o cursor até um ponto ${which}.` };
        }
        const none = !st.snap && (st.guides.blue || st.guides.yellow);
        return { pos: supportPosition(catalog, hit, false, boardsOf(st.history.present)), hint: none ? "Ainda não há pontos azuis/amarelos: a GC vai livre. Coloque duas GC a um vão de barra para surgirem os triângulos." : null };
      }
      all.sort((a, b) => a.d - b.d);
      // pontos "disputados": os que estão quase tão perto quanto o mais perto
      const near = all.filter((c) => c.d < all[0].d + GUIDE_PX);
      const key = near.map((c) => c.pos.join(",")).join("|");
      if (key !== lastChoiceKey) {
        lastChoiceKey = key;
        if (st.snapCycle) useApp.setState({ snapCycle: 0 });
      }
      const pick = near[useApp.getState().snapCycle % near.length];
      const tail = near.length > 1 ? ` (${near.length} pontos aqui: Tab alterna)` : "";
      if (pick.kind === "grid" && near.length === 1) return { pos: pick.pos, hint: null };
      return { pos: pick.pos, hint: `${KIND_NAME[pick.kind]}${pick.text ? `: ${pick.text}` : ""}${tail}` };
    };

    // ---- barras livres: a ponta segue o cursor na esfera do comprimento da barra, com encaixes ----
    let freeAnchor: string | null = null;
    /** logo depois de encaixar, a esfera nova (sob o cursor) não vira partida até o cursor sair dali */
    let freeHold: { x: number; y: number } | null = null;
    const rayAt = (ev: PointerEvent, rect: DOMRect) => {
      const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.clone();
    };
    const toModule = (w: THREE.Vector3): Vec3 => [w.x / M, (w.y - BASE_Y) / M, w.z / M];
    const deg = (r: number) => Math.round((r * 180) / Math.PI);
    const freeBar = (ev: PointerEvent, rect: DOMRect, model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"]) => {
      const st = useApp.getState();
      const L = catalog.pieces[code].spanM![0];
      const tolM = catalog.settings.tolerancia_encaixe_mm / M;
      const nodes = Object.values(model.nodes);
      const dpx = (p: Vec3) => {
        const q = toScreen(toWorld(p), rect);
        return q.z > 1 ? Infinity : Math.hypot(q.x - ev.clientX, q.y - ev.clientY);
      };
      // esfera de partida: a que estiver sob o cursor (fica até outra esfera ser apontada sem fechar a barra)
      let anchor = freeAnchor ? model.nodes[freeAnchor] : undefined;
      if (freeHold && Math.hypot(ev.clientX - freeHold.x, ev.clientY - freeHold.y) > 30) freeHold = null;
      const near = freeHold ? undefined : nodes.map((n) => ({ n, d: dpx(n.pos) })).filter((x) => x.d < 16).sort((a, b) => a.d - b.d)[0];
      if (near && near.n.id !== anchor?.id) {
        const closes = anchor && Math.abs(len(sub(near.n.pos, anchor.pos)) - L) <= tolM;
        if (!closes) anchor = near.n;
      }
      freeAnchor = anchor?.id ?? null;
      if (!anchor) return st.setGhost(null, "Barra livre: passe o cursor numa esfera para começar e puxe em qualquer direção.");
      const A = anchor.pos;
      // ponto cru: onde o raio do cursor encontra a esfera de raio L em volta da partida
      const ray = rayAt(ev, rect);
      const C = toWorld(A);
      const hitW = ray.intersectSphere(new THREE.Sphere(C, L * M), new THREE.Vector3())
        ?? C.clone().add(ray.closestPointToPoint(C, new THREE.Vector3()).sub(C).setLength(L * M));
      const raw = toModule(hitW);
      type Snap = { pos: Vec3; d: number; label: string };
      const snaps: Snap[] = [];
      // 1) fechar numa esfera que está exatamente a L
      for (const n of nodes) {
        if (n.id === anchor.id || Math.abs(len(sub(n.pos, A)) - L) > tolM) continue;
        if (Object.values(model.members).some((m) => (m.a === anchor!.id && m.b === n.id) || (m.b === anchor!.id && m.a === n.id))) continue;
        const d = dpx(n.pos);
        if (d < 20) snaps.push({ pos: n.pos, d: d - 10, label: `fecha na esfera (${toDisp(n.pos).map((v) => +v.toFixed(2)).join("; ")})` });
      }
      // 2) eixos e passos de 15°
      const fr = frameRadAt(catalog, boardsOf(model), A[0], A[2]);
      for (const dir0 of [...AXES, ...inclinedDirs(15)]) {
        const dir = rotDir(dir0, fr);
        const p = add(A, scale(dir, L));
        const d = dpx(p);
        if (d < 9) snaps.push({ pos: p, d: d + 1, label: dir.filter((x) => Math.abs(x) > 1e-6).length === 1 ? "no eixo" : "passo de 15°" });
      }
      // 3) triângulo: ponta a um vão de barra de outra esfera (a próxima barra fecha nela)
      const spans = [...new Set(Object.values(catalog.pieces).filter((p) => p.type === "bar" && p.spanM).map((p) => p.spanM![0]))];
      for (const B of nodes) {
        if (B.id === anchor.id) continue;
        const v = sub(B.pos, A);
        const dAB = len(v);
        if (dAB < 1e-6 || dAB > L + Math.max(...spans)) continue;
        const u = scale(v, 1 / dAB);
        for (const sB of spans) {
          const x = (L * L - sB * sB + dAB * dAB) / (2 * dAB);
          const h2 = L * L - x * x;
          if (h2 <= 1e-6) continue;
          const pc = add(A, scale(u, x));
          const w = sub(raw, pc);
          const inPlane = sub(w, scale(u, w[0] * u[0] + w[1] * u[1] + w[2] * u[2]));
          if (len(inPlane) < 1e-6) continue;
          const q = add(pc, scale(norm(inPlane), Math.sqrt(h2)));
          const d = dpx(q);
          const name = Object.values(catalog.pieces).find((p) => p.type === "bar" && p.spanM?.[0] === sB)?.code ?? "";
          if (d < 12) snaps.push({ pos: q, d: d + 2, label: `fecha triângulo com a esfera (${toDisp(B.pos).map((t) => +t.toFixed(2)).join("; ")}) usando ${name}` });
        }
      }
      // 4) alturas que já existem
      const ys = [...new Set(nodes.map((n) => Math.round(n.pos[1] * 1e4) / 1e4))];
      const hd = norm([raw[0] - A[0], 0, raw[2] - A[2]]);
      for (const y of ys) {
        const dy = y - A[1];
        if (Math.abs(dy) >= L - 1e-6 || len(hd) < 1e-6) continue;
        const r = Math.sqrt(L * L - dy * dy);
        const q: Vec3 = [A[0] + hd[0] * r, y, A[2] + hd[2] * r];
        const d = dpx(q);
        if (d < 10) snaps.push({ pos: q, d: d + 3, label: `na altura z = ${+y.toFixed(2)} M` });
      }
      snaps.sort((a, b) => a.d - b.d);
      const pick = snaps[0];
      const end = (pick?.pos ?? raw).map((v) => Math.round(v * 1e4) / 1e4 + 0) as Vec3;
      const target = findNodeAt(model, end);
      const cand: Candidate = {
        kind: "member", code, fromId: anchor.id, toPos: target ? target.pos : end, inclined: true,
        check: validateMember(catalog, inv, model, code, anchor.id, target ? target.pos : end, { free: true }),
      };
      const dv = sub(end, A);
      const elev = deg(Math.asin(Math.max(-1, Math.min(1, dv[1] / L))));
      const azim = (deg(Math.atan2(-dv[2], dv[0])) + 360) % 360;
      const info = `${pick ? `${pick.label} · ` : ""}${elev}° com a horizontal, ${azim}° em planta · ponta em z = ${end[1].toFixed(2).replace(".", ",")} M`;
      st.setGhost({ kind: "cand", cand }, cand.check.ok ? `Livre: ${info}` : cand.check.errors[0]);
    };

    // ---- pontos amarelos de barras: vértices de triângulos com esferas vizinhas (botão Triângulo) ----
    // A esfera sob o cursor vira a partida e fica até outra esfera ser apontada; perto de um ponto amarelo,
    // o fantasma mostra o triângulo inteiro (R: só a barra).
    let triTab: { x: number; y: number; anchor: string | null } | null = null;
    let nodeTab: { x: number; y: number; nodeId: string; pts: Vec3[]; start: number } | null = null;
    const triangleStep = (ev: PointerEvent, rect: DOMRect, model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"]): boolean => {
      const st = useApp.getState();
      const dpx = (p: Vec3) => {
        const q = toScreen(toWorld(p), rect);
        return q.z > 1 ? Infinity : Math.hypot(q.x - ev.clientX, q.y - ev.clientY);
      };
      const anchor = st.triAnchor && model.nodes[st.triAnchor] ? st.triAnchor : null;
      // Tab: percorre os pontos da esfera de partida, do mais perto do cursor (onde o Tab foi apertado) ao mais longe;
      // mexer o cursor mais de TAB_PX volta ao normal
      if (st.snapCycle && !triTab) triTab = { x: ev.clientX, y: ev.clientY, anchor };
      if (triTab && (!st.snapCycle || triTab.anchor !== anchor || Math.hypot(ev.clientX - triTab.x, ev.clientY - triTab.y) > TAB_PX)) {
        triTab = null;
        if (st.snapCycle) useApp.setState({ snapCycle: 0 });
      }
      if (anchor) {
        const guides = barGuidesFor(model, code, inv, anchor);
        let best: { g: BarGuide; d: number } | null = null;
        let tabInfo = "";
        if (triTab && guides.length) {
          const from = triTab;
          const at = (p: Vec3) => {
            const q = toScreen(toWorld(p), rect);
            return q.z > 1 ? Infinity : Math.hypot(q.x - from.x, q.y - from.y);
          };
          const order = [...guides].sort((a, b) => at(a.pos) - at(b.pos));
          const n = order.length;
          const i = ((((useApp.getState().snapCycle - 1) % n) + n) % n);
          best = { g: order[i], d: 0 };
          tabInfo = ` (ponto ${i + 1} de ${n}: Tab próximo, Shift+Tab volta)`;
        } else {
          for (const g of guides) {
            const d = dpx(g.pos);
            if (d < TRI_PX && (!best || d < best.d)) best = { g, d };
          }
          if (best) tabInfo = ` Tab percorre os ${guides.length} pontos.`;
        }
        if (best) {
          const g = best.g;
          const k = `tri:${anchor}:${key(g.pos)}`;
          if (lastSpot.current !== k) {
            lastSpot.current = k;
            if (st.rotIndex) useApp.setState({ rotIndex: 0 });
          }
          const fmt = (p: Vec3) => `(${toDisp(p).map((v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })).join("; ")})`;
          const count = new Map<string, number>();
          for (const c of g.closes) count.set(c.code, (count.get(c.code) ?? 0) + 1);
          const closes = [...count].map(([c, n]) => (n > 1 ? `${n}× ${c}` : c)).join(" + ");
          const nTxt = g.closes.length > 1 ? `as ${g.closes.length} barras que fecham (${closes})` : `a ${closes} que fecha`;
          if (useApp.getState().rotIndex % 2 === 0) {
            const { part, ids } = newPart(model, g.model);
            st.setGhost(
              { kind: "group", model: g.model, ids, part, keep: true, check: { ok: true, errors: [], warnings: [] } },
              `${g.closes.length > 1 ? "Laranja" : "Amarelo"}: ${g.text}. Clique: a ${code} e ${nTxt}. R: só a ${code}.${tabInfo}`,
            );
          } else {
            st.setGhost({ kind: "cand", cand: g.bar }, `${g.closes.length > 1 ? "Laranja" : "Amarelo"}: só a ${code} até ${fmt(g.pos)} (${g.text}). R: com ${nTxt.replace(/ que fecham?/, "")}.${tabInfo}`);
          }
          return true;
        }
      }
      // esfera perto do cursor: vira a partida dos pontos amarelos
      let near: { id: string; d: number } | null = null;
      for (const n of Object.values(model.nodes)) {
        const d = dpx(n.pos);
        if (d < TRI_ANCHOR_PX && (!near || d < near.d)) near = { id: n.id, d };
      }
      if (near && near.id !== anchor) useApp.setState({ triAnchor: near.id });
      else if (!anchor && st.triAnchor) useApp.setState({ triAnchor: null });
      return false;
    };

    // ---- ligar duas esferas (dois cliques): a segunda anda até a mola caber ----
    /** esfera clicada agora (a primeira, ou de novo a primeira para cancelar) */
    let linkPick: string | null = null;
    /** o fantasma atual é uma ligação entre duas esferas */
    let linkGhost: { moved: number } | null = null;
    /** Esfera sob o cursor: dentro do desenho dela na tela (mínimo 9 px). */
    const sphereUnder = (ev: PointerEvent, rect: DOMRect, model: Model): string | null => {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      let best: { id: string; d: number } | null = null;
      for (const n of Object.values(model.nodes)) {
        const w = toWorld(n.pos);
        const c = toScreen(w, rect);
        if (c.z > 1) continue;
        const e = toScreen(w.clone().add(right.clone().multiplyScalar(catalog.settings.esfera_diametro_mm / 2)), rect);
        const r = Math.max(9, Math.hypot(e.x - c.x, e.y - c.y));
        const d = Math.hypot(c.x - ev.clientX, c.y - ev.clientY);
        if (d <= r && (!best || d < best.d)) best = { id: n.id, d };
      }
      return best?.id ?? null;
    };
    const linkStep = (ev: PointerEvent, rect: DOMRect, model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"]): boolean => {
      const st = useApp.getState();
      linkPick = null;
      linkGhost = null;
      const on = sphereUnder(ev, rect, model);
      if (!on) return false;
      const fmt = (p: Vec3) => `(${toDisp(p).map((v) => +v.toFixed(2)).join("; ")})`;
      const from = st.linkFrom && model.nodes[st.linkFrom] ? st.linkFrom : null;
      if (!from || on === from) {
        linkPick = on;
        st.setGhost(
          null,
          from
            ? `Primeira esfera ${fmt(model.nodes[from].pos)}: clique na outra esfera. Clique de novo nesta (ou Esc) cancela.`
            : "Clique para começar a ligação nesta esfera; depois clique na outra esfera. Ou leve o cursor até um ponto verde, amarelo ou laranja.",
        );
        return true;
      }
      const r = linkFor(model, code, inv, from, on);
      if (!r.model) {
        st.setGhost(null, r.error ?? "Não dá para ligar essas esferas.");
        return true;
      }
      linkGhost = { moved: r.moved ?? 0 };
      const moved = r.moved ? ` A segunda esfera anda ${(r.moved).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} M e as molas dela giram para a ${code} caber.` : "";
      st.setGhost(
        { kind: "group", model: r.model, ids: r.ids ?? new Set([on]), keep: true, check: { ok: true, errors: [], warnings: [] } },
        `Clique para ligar ${fmt(model.nodes[from].pos)} a ${fmt(model.nodes[on].pos)} com a ${code}.${moved}`,
      );
      return true;
    };

    const markHover = (id: string | null) => {
      if (useApp.getState().toolHover !== id) useApp.setState({ toolHover: id });
    };

    // cabo (Kit 3): primeira esfera (linkFrom) e a outra; o pedaço sai da distância entre elas
    const ropeStep = (ev: PointerEvent, rect: DOMRect, model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"]): boolean => {
      const st = useApp.getState();
      linkPick = null;
      linkGhost = null;
      const on = sphereUnder(ev, rect, model);
      markHover(on); // a esfera sob o cursor fica destacada antes do clique
      const from = st.linkFrom && model.nodes[st.linkFrom] ? st.linkFrom : null;
      if (!on) {
        st.setGhost(null, from ? "Clique na esfera da outra ponta do cabo. Esc cancela." : "Clique na esfera de uma ponta do cabo e depois na da outra.");
        return true;
      }
      if (!from || on === from) {
        linkPick = on;
        st.setGhost(null, from ? "Clique na esfera da outra ponta. Clique de novo nesta (ou Esc) cancela." : "Clique para prender o cabo nesta esfera; depois clique na outra.");
        return true;
      }
      const check = validateRope(catalog, inv, model, from, on);
      const info = ropeInfo(catalog, model.nodes[from].pos, model.nodes[on].pos);
      const cand: Candidate = { kind: "member", code, fromId: from, toPos: model.nodes[on].pos, check };
      linkGhost = { moved: 0 };
      st.setGhost(
        { kind: "cand", cand },
        check.ok && info ? `Cabo de ${ropeText(info.balls, info.cutMm)}. Clique para colocar.` : check.errors[0],
      );
      return true;
    };

    // enrijecedor (Kit 3): a mola mais perto do cursor; clicar põe (ou tira, se já tem)
    const stiffStep = (ev: PointerEvent, rect: DOMRect, model: Model, inv: ReturnType<typeof useApp.getState>["inventory"]) => {
      const st = useApp.getState();
      linkPick = null;
      linkGhost = null;
      let best: { id: string; d: number } | null = null;
      for (const m of Object.values(model.members)) {
        if (catalog.pieces[m.code]?.type !== "bar") continue;
        const p = toScreen(toWorld(model.nodes[m.a].pos), rect);
        const q = toScreen(toWorld(model.nodes[m.b].pos), rect);
        if (p.z > 1 || q.z > 1) continue;
        const [dx, dy] = [q.x - p.x, q.y - p.y];
        const t = Math.max(0.12, Math.min(0.88, ((ev.clientX - p.x) * dx + (ev.clientY - p.y) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(p.x + t * dx - ev.clientX, p.y + t * dy - ev.clientY);
        if (d < 14 && (!best || d < best.d)) best = { id: m.id, d };
      }
      markHover(best?.id ?? null); // a mola sob o cursor fica destacada antes do clique
      if (!best) return st.setGhost(null, "Clique numa mola B6 ou B12 para pôr o enrijecedor (numa mola enrijecida, tira).");
      const m = model.members[best.id];
      const r = validateStiffener(catalog, inv, model, m.id);
      const next: Model = { ...model, members: { ...model.members, [m.id]: { ...m, stiff: !m.stiff || undefined } } };
      if (!next.members[m.id].stiff) delete next.members[m.id].stiff;
      const part: Model = { ...next, nodes: { [m.a]: model.nodes[m.a], [m.b]: model.nodes[m.b] }, members: { [m.id]: next.members[m.id] }, plates: {}, connectors: {} };
      st.setGhost(
        { kind: "group", model: next, ids: new Set(), part, keep: true, check: { ok: r.ok, errors: r.errors, warnings: [] } },
        r.ok ? (r.remove ? `Clique para tirar o enrijecedor desta ${m.code}.` : `Clique para pôr o enrijecedor ${r.code} nesta ${m.code}.`) : r.errors[0],
      );
    };

    const inGizmo = (ev: PointerEvent, rect: DOMRect) => {
      const s = useApp.getState();
      const off = panelOpen(s) ? PROPS_W : 0; // painel aberto: o cubo se afasta
      return (ev.clientX > rect.right - off - GIZMO_PX && ev.clientX < rect.right - off && ev.clientY < rect.top + GIZMO_PX) || // cubo de vistas
      (ev.clientX < rect.left + AXES_PX && ev.clientY > rect.bottom - AXES_PX); // eixos X, Y, Z
    };

    // ---- seleção por retângulo ----
    let boxStart: { x: number; y: number; shift: boolean } | null = null;
    const boxSelect = (b: { x0: number; y0: number; x1: number; y1: number }, add: boolean) => {
      const rect = el.getBoundingClientRect();
      const model = useApp.getState().history.present;
      const crossing = b.x1 < b.x0; // da direita para a esquerda: o que tocar; da esquerda para a direita: só o que está inteiro dentro
      const [x0, x1] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)];
      const [y0, y1] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
      const inside = (p: Vec3) => {
        const s = toScreen(toWorld(p), rect);
        return s.z < 1 && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
      };
      const along = (a: Vec3, c: Vec3, n = 8) => Array.from({ length: n + 1 }, (_, i) => [0, 1, 2].map((k) => a[k] + ((c[k] - a[k]) * i) / n) as Vec3);
      const test = (pts: Vec3[]) => (crossing ? pts.some(inside) : pts.every(inside));
      const out: Sel[] = [];
      for (const n of Object.values(model.nodes)) if (test([n.pos])) out.push({ kind: "node", id: n.id });
      for (const m of Object.values(model.members)) if (test(along(model.nodes[m.a].pos, model.nodes[m.b].pos))) out.push({ kind: "member", id: m.id });
      for (const p of Object.values(model.plates)) {
        const c = p.corners.map((id) => model.nodes[id].pos);
        if (test([...c, ...along(c[0], c[2], 4), ...along(c[1], c[3], 4)])) out.push({ kind: "plate", id: p.id });
      }
      for (const c of Object.values(model.connectors)) if (test([model.nodes[c.node].pos])) out.push({ kind: "connector", id: c.id });
      useApp.getState().setMulti(out, add);
      useApp.setState({ hint: out.length ? `${out.length} peças selecionadas.` : "Nenhuma peça no retângulo." });
    };

    const update = (ev: PointerEvent) => {
      const st = useApp.getState();
      const rect = el.getBoundingClientRect();
      if (boxStart && st.tool.kind === "select") {
        if (st.box || Math.hypot(ev.clientX - boxStart.x, ev.clientY - boxStart.y) > DRAG_PX) {
          st.setBox({ x0: boxStart.x, y0: boxStart.y, x1: ev.clientX, y1: ev.clientY });
        }
        return;
      }

      // arrastar uma peça selecionada → começa a mover
      if (st.tool.kind === "select" && st.pendingDrag) {
        if (Math.hypot(ev.clientX - st.pendingDrag.x, ev.clientY - st.pendingDrag.y) > DRAG_PX) {
          st.setPendingDrag(null);
          // arrastar uma peça: a estrutura inteira; Alt + arrastar um nó: só o nó
          if (ev.altKey && st.selection?.kind === "node") st.startMoveNode(true);
          else if (st.multi.length) st.startMoveSelection();
          else st.startMoveStructure(true);
        } else return;
      }
      const tool = useApp.getState().tool;
      if (tool.kind === "select") return;
      const offScene = !insideOf(ev, rect) || (!tool.viaDrag && !!(ev.target as HTMLElement | null)?.closest?.(".props, .dock, .summary-tab, .palette, .palette-mini-wrap"));
      if (offScene && st.toolHover) markHover(null);
      if (!insideOf(ev, rect)) return st.setGhost(null, tool.viaDrag ? "Solte a peça sobre a cena." : st.hint);
      // cursor sobre o painel da direita, a barra de baixo ou a aba do resumo (por cima da cena): sem fantasma
      if (!tool.viaDrag && (ev.target as HTMLElement | null)?.closest?.(".props, .dock, .summary-tab")) return st.setGhost(null, st.hint);
      const model = workingModel(useApp.getState());

      // ---- mover só o nó (duplo clique na esfera) ou girar o conjunto (duplo clique numa mola, diagonal ou placa):
      //      desliza pelo caminho possível (esfera, círculo ou pontos) ----
      if (tool.kind === "moveNode" || tool.kind === "moveBody") {
        const present = st.history.present;
        const path = pathFor(present, tool);
        if (!path) return st.disarm();
        const { set, start, lift, key: pathKey } = path;
        const body = tool.kind === "moveBody";
        if (set.locked) return st.setGhost(null, set.locked);
        const dpx = (p: Vec3) => {
          const w = toWorld(p);
          if (lift) w.y = 0.6;
          const q = toScreen(w, rect);
          return q.z > 1 ? Infinity : Math.hypot(q.x - ev.clientX, q.y - ev.clientY);
        };
        // Tab: pula entre os limites azul ↔ vermelho do caminho (mexer o cursor mais de TAB_PX volta ao normal)
        if (nodeTab && (!st.snapCycle || nodeTab.nodeId !== pathKey || Math.hypot(ev.clientX - nodeTab.x, ev.clientY - nodeTab.y) > TAB_PX)) {
          nodeTab = null;
          useApp.setState({ ...(st.snapCycle ? { snapCycle: 0 } : {}), nodeLimits: null });
        }
        const loc = set.locus;
        let tabInfo = "";
        let pick: Vec3 | null = null;
        if (useApp.getState().snapCycle && loc) {
          if (!nodeTab) {
            // na esfera, os limites são os do meridiano que passa pelo cursor
            let toward: Vec3 = start;
            if (loc.kind === "sphere") {
              const ray = rayAt(ev, rect);
              const C = toWorld(loc.c);
              const hit = ray.intersectSphere(new THREE.Sphere(C, loc.r * M), new THREE.Vector3());
              if (hit) toward = toModule(hit);
            }
            const pts = loc.kind === "sphere" ? sphereMeridianLimits(set, toward) : locusStatusFor(present, pathKey, set).limits;
            let first = 0;
            pts.forEach((p, i) => { if (dpx(p) < dpx(pts[first])) first = i; });
            nodeTab = { x: ev.clientX, y: ev.clientY, nodeId: pathKey, pts, start: first };
          }
          const n = nodeTab.pts.length;
          if (!n) {
            nodeTab = null;
            useApp.setState({ snapCycle: 0, nodeLimits: null });
            return st.setGhost(null, "Esse caminho não tem limites: é todo azul (ou todo vermelho).");
          }
          const c = useApp.getState().snapCycle;
          const i = (((nodeTab.start + (c > 0 ? c - 1 : c)) % n) + n) % n;
          pick = nodeTab.pts[i];
          const cur = useApp.getState().nodeLimits;
          if (!cur || cur.i !== i || cur.pts !== nodeTab.pts) useApp.setState({ nodeLimits: { pts: nodeTab.pts, i } });
          tabInfo = ` Limite ${i + 1} de ${n}: Tab próximo, Shift+Tab volta.`;
        }
        // 1) posições "redondas" (eixos, passos de 15°) perto do cursor: encaixa nelas
        let best = 14;
        if (!pick) {
          for (const o of set.options) {
            const d = dpx(o.pos);
            if (o.check.ok && d < best) (best = d), (pick = o.pos);
          }
        }
        // 2) contínuo, pelo caminho
        if (!pick && loc) {
          if (loc.kind === "sphere") {
            const ray = rayAt(ev, rect);
            const C = toWorld(loc.c);
            const hit = ray.intersectSphere(new THREE.Sphere(C, loc.r * M), new THREE.Vector3())
              ?? C.clone().add(ray.closestPointToPoint(C, new THREE.Vector3()).sub(C).setLength(loc.r * M));
            pick = toModule(hit);
          } else if (loc.kind === "circle") {
            let bd = Infinity;
            for (let k = 0; k < 360; k++) {
              const t = (k * Math.PI) / 180;
              const q = add(loc.p, add(scale(loc.e1, loc.h * Math.cos(t)), scale(loc.e2, loc.h * Math.sin(t))));
              const d = dpx(q);
              if (d < bd) (bd = d), (pick = q);
            }
          } else {
            let bd = 80;
            for (const q of loc.pts) {
              const d = dpx(q);
              if (d < bd) (bd = d), (pick = q);
            }
          }
          if (pick && set.nearest) pick = set.nearest(pick) ?? pick;
        }
        const o = pick && set.evalAt ? set.evalAt(pick) : null;
        if (!o) return st.setGhost(null, body ? "Leve o cursor pelo caminho azul: é por ali que o conjunto pode girar." : "Leve o cursor pelo caminho azul: é por ali que a esfera pode andar.");
        const f = (p: Vec3) => `(${toDisp(p).map((v) => +v.toFixed(2)).join("; ")})`;
        const moved = len(sub(o.pos, start)).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
        const tabHint = tabInfo || (locusStatusFor(present, pathKey, set).limits.length || loc?.kind === "sphere" ? " Tab pula para os limites." : "");
        let what = `Clique para deixar o nó em ${f(o.pos)} (anda ${moved} M).`;
        if (body) {
          const bs = set as ReturnType<typeof bodyMoveOptions>;
          const ctr = bs.axis ? add(bs.axis.a, scale(norm(sub(bs.axis.b, bs.axis.a)), dot(sub(start, bs.axis.a), norm(sub(bs.axis.b, bs.axis.a))))) : bs.pivot!;
          const ang = (Math.acos(Math.max(-1, Math.min(1, dot(norm(sub(start, ctr)), norm(sub(o.pos, ctr)))))) * 180) / Math.PI;
          what = `Clique para deixar o conjunto girado ${ang.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}° ${bs.axis ? "em torno da linha das GC" : "em volta da GC"}.`;
        }
        return st.setGhost(
          { kind: "group", model: o.model, ids: o.ids, check: o.check },
          o.check.ok
            ? `${what}${tabHint}`
            : `${o.check.errors[0]}${tabInfo || " Tab pula para os limites do trecho azul."}`,
        );
      }

      // ---- mover estrutura ----
      if (tool.kind === "moveGroup") {
        const node = st.history.present.nodes[tool.nodeId];
        if (!node) return st.disarm();
        const hit = planeHit(ev, rect, BASE_Y + node.pos[1] * M);
        if (!hit) return;
        const xz = { x: hit.x / M, z: hit.z / M };
        const guides = node.kind === "support" && !tool.turns ? guidesFor(st.history.present, st.inventory, componentOf(st.history.present, tool.nodeId)) : [];
        const choice = pickSupport(ev, rect, xz, guides);
        if (!choice.pos) return st.setGhost(null, choice.hint);
        const target = choice.pos;
        const delta: Vec3 = [target[0] - node.pos[0], 0, target[2] - node.pos[2]];
        const r = moveGroup(catalog, st.history.present, tool.nodeId, delta, tool.turns);
        return st.setGhost({ kind: "group", model: r.model, ids: r.ids, check: r.check }, r.check.errors[0] ?? choice.hint);
      }

      // ---- colar / mover várias peças: a âncora segue o cursor (na grade) ----
      if (tool.kind === "paste") {
        const base = tool.moving ? tool.moving.base : st.history.present;
        const clip = transformClip(tool.clip, tool.turns, tool.mirrorX, tool.mirrorZ);
        const y = clip.anchor[1] + tool.dy;
        if (y < 0) return st.setGhost(null, "Abaixo da chapa: ↑ sobe.");
        const hit = planeHit(ev, rect, BASE_Y + y * M);
        if (!hit) return;
        const r2 = (v: number) => (st.snap ? Math.round(v) : Math.round(v * 100) / 100);
        const target: Vec3 = [r2(hit.x / M), y, r2(hit.z / M)];
        const key = `${target.join(",")}|${tool.turns}|${tool.mirrorX}|${tool.mirrorZ}|${tool.dy}`;
        let r = pasteCache?.base === base && pasteCache.clip === tool.clip && pasteCache.key === key ? pasteCache.r : null;
        if (!r) {
          r = pasteClip(catalog, st.inventory, base, clip, target);
          pasteCache = { base, clip: tool.clip, key, r };
        }
        const turn = tool.turns % 4 ? ` · girada ${(tool.turns % 4) * 90}°` : "";
        const flip = tool.mirrorX || tool.mirrorZ ? ` · espelhada em ${[tool.mirrorX && "X", tool.mirrorZ && "Y"].filter(Boolean).join(" e ")}` : "";
        const info = `${r.added} peças · altura ${tool.dy > 0 ? "+" : ""}${tool.dy} M${turn}${flip}. ↑/↓ altura (Shift: 6 M), R gira, X/Y espelha.`;
        return st.setGhost({ kind: "group", model: r.model, ids: r.newNodes, check: r.check, part: r.part }, r.check.ok ? info : r.check.errors[0]);
      }

      const code = tool.code;
      const inv = tool.moving ? { ...st.inventory, unlimited: true } : st.inventory;

      // ---- Kit 3: enrijecedor (clique numa mola) e cabo (clique numa esfera e depois em outra) ----
      if (code === STIFF_TOOL) return stiffStep(ev, rect, model, inv);
      if (catalog.pieces[code]?.type === "rope") return void ropeStep(ev, rect, model, code, inv);

      // ---- ligação de base ----
      if (catalog.pieces[code]?.type === "support") {
        const hit = planeHit(ev, rect, 0);
        if (!hit) return st.setGhost(null, "Aponte para a chapa.");
        const choice = pickSupport(ev, rect, { x: hit.x / M, z: hit.z / M }, guidesFor(model, inv));
        if (!choice.pos) return st.setGhost(null, choice.hint);
        const cand = supportCandidate(catalog, inv, model, choice.pos);
        return st.setGhost({ kind: "cand", cand }, cand.check.ok ? choice.hint : cand.check.errors[0]);
      }

      // ---- barras: pontos amarelos (triângulos) ----
      if (catalog.pieces[code]?.type === "bar" && st.guides.yellow && !tool.moving) {
        if (triangleStep(ev, rect, model, code, inv)) return;
      } else if (st.triAnchor) useApp.setState({ triAnchor: null });

      // ---- ligar duas esferas: clique numa esfera e depois em outra ----
      const ptype = catalog.pieces[code]?.type;
      if ((ptype === "bar" || ptype === "cable") && !tool.moving && !tool.viaDrag) {
        if (linkStep(ev, rect, model, code, inv)) return;
      } else if (st.linkFrom) useApp.setState({ linkFrom: null });

      // ---- barras no modo Livre ----
      if (freeOn(st) && catalog.pieces[code]?.type === "bar") return freeBar(ev, rect, model, code, inv);

      // ---- demais peças: ponto de encaixe mais próximo ----
      const inclined = inclineOn(st);
      const { spots } = candidatesFor(model, code, inv, inclined);
      let best: { k: string; s: Spot; d: number; z?: number } | null = null;
      for (const [k, s] of spots) {
        const valid = s.ends.some((c) => c.check.ok) || s.starts.some((c) => c.check.ok);
        if (!valid) continue;
        const sp = toScreen(toWorld(s.pos), rect);
        if (sp.z > 1) continue;
        const d = Math.hypot(sp.x - ev.clientX, sp.y - ev.clientY);
        if (d >= SPOT_PX) continue;
        if (!best || d < best.d) best = { k, s, d, z: sp.z };
      }
      // pontos quase sobrepostos na tela (ex.: topo do pilar e GC na vista de topo): vale o mais perto da câmera
      if (best) {
        const b0 = toScreen(toWorld(best.s.pos), rect);
        for (const [k, s] of spots) {
          if (k === best.k || !(s.ends.some((c) => c.check.ok) || s.starts.some((c) => c.check.ok))) continue;
          const sp = toScreen(toWorld(s.pos), rect);
          if (sp.z < best.z! && Math.hypot(sp.x - b0.x, sp.y - b0.y) < 14) {
            best = { k, s, d: Math.hypot(sp.x - ev.clientX, sp.y - ev.clientY), z: sp.z };
          }
        }
      }
      if (!best) {
        const empty = !Object.keys(model.nodes).length;
        return st.setGhost(
          null,
          empty
            ? "Comece por uma ligação de base: as outras peças saem das esferas."
            : "Leve o cursor até um ponto verde ou até uma esfera.",
        );
      }
      // Ponto sem esfera que é só a ponta de uma peça saindo de uma esfera próxima: vale a esfera (puxar a barra a partir dela).
      // Evita que, numa vista de frente, a ponta de uma viga que vai "para dentro" da tela roube o gesto.
      if (!best.s.starts.length) {
        const owners = new Set(best.s.ends.map((c) => (c.kind === "member" ? key(model.nodes[c.fromId].pos) : "")));
        let near: { k: string; s: Spot; d: number } | null = null;
        for (const [k, s] of spots) {
          if (!owners.has(k) || !s.starts.some((c) => c.check.ok)) continue;
          const sp = toScreen(toWorld(s.pos), rect);
          const d = Math.hypot(sp.x - ev.clientX, sp.y - ev.clientY);
          if (d < 70 && (!near || d < near.d)) near = { k, s, d };
        }
        if (near) best = near;
      }
      if (lastSpot.current !== best.k) {
        lastSpot.current = best.k;
        if (st.rotIndex) useApp.setState({ rotIndex: 0 });
      }
      // opções do ponto. Ordem padrão: subir a partir da esfera; depois fechar uma peça que termina nela; depois o resto.
      const ends = best.s.ends.filter((c) => c.check.ok);
      const starts = best.s.starts.filter((c) => c.check.ok).sort((a, b) => dirRank(model, a) - dirRank(model, b));
      const up = starts.filter((c) => dirRank(model, c) === 0);
      let options = [...up, ...ends, ...starts.filter((c) => !up.includes(c))];
      // cursor deslocado do ponto: vence a opção que aponta para o lado do cursor (puxar a barra com o mouse)
      const spot = toScreen(toWorld(best.s.pos), rect);
      const off = [ev.clientX - spot.x, ev.clientY - spot.y];
      const offLen = Math.hypot(off[0], off[1]);
      // com inclinação ligada, direções bloqueadas também concorrem: o usuário vê em vermelho por que não dá
      const blocked = inclined ? best.s.starts.filter((c) => !c.check.ok && c.kind === "member" && c.inclined) : [];
      let shown: Candidate | null = null;
      if (offLen > 12 && options.length + blocked.length > 1) {
        const proj = new Map<Candidate, { v: number[]; L: number }>();
        for (const c of [...options, ...blocked]) {
          const other = c.kind === "member" ? (ends.includes(c) ? anchorPos(model, c)! : c.toPos) : markerPos(model, c);
          const o = toScreen(toWorld(other), rect);
          const v = [o.x - spot.x, o.y - spot.y];
          proj.set(c, { v, L: Math.hypot(v[0], v[1]) || 1 });
        }
        const maxL = Math.max(...[...proj.values()].map((p) => p.L));
        // alinhamento com o cursor, preferindo peças que aparecem inteiras na tela (no plano da vista)
        const score = (c: Candidate) => {
          const { v, L } = proj.get(c)!;
          const cos = (v[0] * off[0] + v[1] * off[1]) / (L * offLen);
          return cos * (0.55 + 0.45 * Math.min(1, L / maxL));
        };
        options = [...options].sort((a, b) => score(b) - score(a));
        const worst = blocked.sort((a, b) => score(b) - score(a))[0];
        if (worst && st.rotIndex === 0 && (!options.length || score(worst) > score(options[0]) + 0.01)) shown = worst;
      }
      if (shown) return st.setGhost({ kind: "cand", cand: shown }, [angleText(model, shown), shown.check.errors[0]].filter(Boolean).join(": "));
      if (!options.length) return st.setGhost(null, "Nenhuma posição válida neste ponto.");
      const cand = options[useApp.getState().rotIndex % options.length];
      const n = options.length;
      const ang = angleText(model, cand);
      const bar = catalog.pieces[code]?.type === "bar";
      st.setGhost(
        { kind: "cand", cand },
        inclined && bar
          ? `${ang ? `Inclinada a ${ang}` : "Na direção do eixo"}. Puxe o cursor para mudar o ângulo${useApp.getState().incline ? "" : "; solte o Shift para voltar aos eixos"}.`
          : n > 1
            ? `${n} opções neste ponto: R alterna.${bar ? " Shift: barra inclinada." : ""}`
            : null,
      );
    };

    const onDown = (ev: PointerEvent) => {
      if (ev.target !== el) return;
      down.current = { x: ev.clientX, y: ev.clientY };
      const st = useApp.getState();
      // botão esquerdo em modo seleção: começa um retângulo (a não ser que esteja arrastando uma peça selecionada)
      if (ev.button === 0 && st.tool.kind === "select" && !st.pendingDrag && !inGizmo(ev, el.getBoundingClientRect())) {
        boxStart = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey };
      }
    };
    const onUp = (ev: PointerEvent) => {
      const st = useApp.getState();
      if (st.pendingDrag) st.setPendingDrag(null);
      if (boxStart) {
        const b = st.box;
        const shift = boxStart.shift;
        boxStart = null;
        if (b) {
          st.setBox(null);
          boxSelect(b, shift);
        }
        return;
      }
      if (st.tool.kind === "select") return;
      const rect = el.getBoundingClientRect();
      if (inGizmo(ev, rect) && !st.tool.viaDrag) return; // clique no cubo de visualização
      const inside = insideOf(ev, rect);
      if (st.tool.viaDrag) {
        update(ev);
        const ok = inside && useApp.getState().commitGhost();
        const now = useApp.getState();
        if (!ok && (now.tool.kind === "moveGroup" || now.tool.kind === "moveNode" || now.tool.kind === "moveBody" || ((now.tool.kind === "place" || now.tool.kind === "paste") && now.tool.moving))) {
          now.disarm(); // movimento cancelado: nada mudou
          now.setGhost(null, "Movimento cancelado: o lugar não era válido.");
        } else if (now.tool.kind !== "select") now.disarm();
        return;
      }
      const d = down.current;
      down.current = null;
      if (!inside || !d || Math.hypot(d.x - ev.clientX, d.y - ev.clientY) > CLICK_PX) return; // foi giro de câmera
      clickAt(ev);
    };

    /** Clique da colocação (também o Enter, no lugar do cursor). */
    const clickAt = (ev: PointerEvent) => {
      update(ev);
      // clique numa esfera: escolhe a primeira da ligação (ou cancela, se for a mesma)
      if (linkPick) {
        const cur = useApp.getState().linkFrom;
        useApp.setState({ linkFrom: cur === linkPick ? null : linkPick });
        update(ev);
        return;
      }
      const wasLink = linkGhost;
      const ok = useApp.getState().commitGhost();
      if (ok && (wasLink || useApp.getState().linkFrom)) useApp.setState({ linkFrom: null });
      // depois de colocar, recalcula o fantasma no mesmo lugar
      update(ev);
      if (ok && wasLink) {
        useApp.setState({ hint: wasLink.moved ? `Ligado. A segunda esfera andou ${wasLink.moved.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} M e as molas dela giraram (Ctrl+Z desfaz).` : "Ligado." });
      }
    };

    // Gancho de teste/depuração: projeta posições do modelo (módulos) para a tela.
    (window as unknown as Record<string, unknown>).__simolador = {
      store: useApp,
      project: (p: Vec3) => toScreen(toWorld(p), el.getBoundingClientRect()),
      projectPlate: (x: number, z: number) => toScreen(new THREE.Vector3(x * M, 0, z * M), el.getBoundingClientRect()),
      cameraY: () => camera.position.y,
      catalog,
    };

    // R também atualiza o fantasma sem mexer o mouse
    let lastEv: PointerEvent | null = null;
    const track = (ev: PointerEvent) => ((lastEv = ev), update(ev));

    // Enter = clique: colocando uma peça (ou movendo), vale no lugar do cursor; selecionando, pega a peça sob o cursor
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      // botão com foco: só os da paleta e da barra de baixo cedem o Enter para a cena (os outros continuam valendo)
      if (t?.tagName === "BUTTON") {
        if (!t.closest(".palette, .palette-mini-wrap, .dock")) return;
        t.blur();
      }
      const st = useApp.getState();
      if (st.sheetsOpen || st.helpOpen || st.settingsOpen) return;
      if (st.tool.kind !== "select") {
        if (!lastEv || !insideOf(lastEv, el.getBoundingClientRect())) return;
        ev.preventDefault();
        if (st.tool.viaDrag) useApp.setState({ tool: { ...st.tool, viaDrag: false } as typeof st.tool });
        clickAt(lastEv);
        return;
      }
      const id = st.hoverId;
      if (!id) return;
      const m = st.history.present;
      const kind = m.nodes[id] ? "node" : m.members[id] ? "member" : m.plates[id] ? "plate" : m.connectors[id] ? "connector" : null;
      if (!kind) return;
      ev.preventDefault();
      st.select({ kind, id });
    };
    const unsub = useApp.subscribe((s, p) => {
      if (s.tool !== p.tool && s.triAnchor && !(s.tool.kind === "place" && p.tool.kind === "place" && s.tool.code === p.tool.code)) {
        useApp.setState({ triAnchor: null });
      }
      if (s.tool !== p.tool && s.linkFrom && !(s.tool.kind === "place" && p.tool.kind === "place" && s.tool.code === p.tool.code)) {
        useApp.setState({ linkFrom: null });
      }
      // mover só o nó: ao sair ou depois de mexer, o Tab recomeça
      if ((s.history !== p.history || s.tool !== p.tool) && (nodeTab || s.nodeLimits) && (p.tool.kind === "moveNode" || p.tool.kind === "moveBody")) {
        nodeTab = null;
        useApp.setState({ snapCycle: 0, nodeLimits: null });
        return;
      }
      // depois de colocar a peça, o Tab recomeça do ponto mais perto
      if ((s.history !== p.history || s.tool !== p.tool) && s.snapCycle && s.tool.kind === "place" && catalog.pieces[s.tool.code]?.type === "bar") {
        triTab = null;
        useApp.setState({ snapCycle: 0 });
        return;
      }
      if (s.history !== p.history || s.tool !== p.tool || s.barMode !== p.barMode) {
        freeAnchor = null;
        freeHold = s.history !== p.history && lastEv ? { x: lastEv.clientX, y: lastEv.clientY } : null;
      }
      if (lastEv && (s.linkFrom !== p.linkFrom || s.rotIndex !== p.rotIndex || s.barMode !== p.barMode || (s.tool !== p.tool && s.tool.kind === "paste") || s.snapCycle !== p.snapCycle || s.guides !== p.guides || inclineOn(s) !== inclineOn(p) || (s.tool.kind === "moveGroup" && p.tool.kind === "moveGroup" && s.tool.turns !== p.tool.turns) || s.history !== p.history || s.snap !== p.snap)) {
        update(lastEv);
      }
    });

    window.addEventListener("pointermove", track);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      unsub();
      window.removeEventListener("pointermove", track);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [camera, gl]);

  return null;
}
