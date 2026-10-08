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
import { moveGroup } from "../core/edit";
import { findNodeAt, type Model, type Vec3 } from "../core/model";
import type { Sel } from "../core/edit";
import {
  allCandidates, anchorPos, markerPos, supportCandidate, supportPosition, type Candidate,
} from "../core/snapping";
import { useApp, workingModel } from "../ui/store";
import { BASE_Y, M, toWorld } from "../render/units";

const SPOT_PX = 46;
const CLICK_PX = 5;
const DRAG_PX = 6;
/** canto superior direito da cena ocupado pelo cubo de visualização */
const GIZMO_PX = 175;

const key = (p: Vec3) => p.map((v) => v.toFixed(3)).join(",");

/** Preferência de direção para barras que saem de uma esfera: para cima, depois na horizontal, por último para baixo. */
function dirRank(model: Model, c: Candidate) {
  const a = anchorPos(model, c);
  if (!a || c.kind !== "member") return 0;
  const dy = c.toPos[1] - a[1];
  return dy > 0 ? 0 : dy === 0 ? 1 : 2;
}

interface Spot {
  pos: Vec3;
  ends: Candidate[]; // candidatas que terminam/ficam neste ponto
  starts: Candidate[]; // barras/diagonais que saem deste ponto (esfera existente)
}

// cache das candidatas: recalcula só quando muda o modelo, a peça ou o estoque
let cache: { model: Model; code: string; inv: unknown; cands: Candidate[]; spots: Map<string, Spot> } | null = null;
export function candidatesFor(model: Model, code: string, inv: ReturnType<typeof useApp.getState>["inventory"]) {
  if (cache && cache.model === model && cache.code === code && cache.inv === inv) return cache;
  const cands = allCandidates(catalog, inv, model, code);
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
  cache = { model, code, inv, cands, spots };
  return cache;
}

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

    const inGizmo = (ev: PointerEvent, rect: DOMRect) => ev.clientX > rect.right - GIZMO_PX && ev.clientY < rect.top + GIZMO_PX;

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
          st.startMove(true);
        } else return;
      }
      const tool = useApp.getState().tool;
      if (tool.kind === "select") return;
      if (!insideOf(ev, rect)) return st.setGhost(null, tool.viaDrag ? "Solte a peça sobre a cena." : st.hint);
      const model = workingModel(useApp.getState());

      // ---- mover estrutura ----
      if (tool.kind === "moveGroup") {
        const node = st.history.present.nodes[tool.nodeId];
        if (!node) return st.disarm();
        const hit = planeHit(ev, rect, BASE_Y + node.pos[1] * M);
        if (!hit) return;
        const target = supportPosition(catalog, { x: hit.x / M, z: hit.z / M }, st.snap);
        const delta: Vec3 = [target[0] - node.pos[0], 0, target[2] - node.pos[2]];
        const r = moveGroup(catalog, st.history.present, tool.nodeId, delta, tool.turns);
        return st.setGhost({ kind: "group", model: r.model, ids: r.ids, check: r.check }, r.check.errors[0] ?? null);
      }

      const code = tool.code;
      const inv = tool.moving ? { ...st.inventory, unlimited: true } : st.inventory;

      // ---- ligação de base ----
      if (catalog.pieces[code]?.type === "support") {
        const hit = planeHit(ev, rect, 0);
        if (!hit) return st.setGhost(null, "Aponte para a chapa.");
        const pos = supportPosition(catalog, { x: hit.x / M, z: hit.z / M }, st.snap);
        const cand = supportCandidate(catalog, inv, model, pos);
        return st.setGhost({ kind: "cand", cand }, cand.check.ok ? null : cand.check.errors[0]);
      }

      // ---- demais peças: ponto de encaixe mais próximo ----
      const { spots } = candidatesFor(model, code, inv);
      let best: { k: string; s: Spot; d: number } | null = null;
      for (const [k, s] of spots) {
        const valid = s.ends.some((c) => c.check.ok) || s.starts.some((c) => c.check.ok);
        if (!valid) continue;
        const sp = toScreen(toWorld(s.pos), rect);
        if (sp.z > 1) continue;
        const d = Math.hypot(sp.x - ev.clientX, sp.y - ev.clientY);
        if (d < SPOT_PX && (!best || d < best.d)) best = { k, s, d };
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
      if (offLen > 12 && options.length > 1) {
        const proj = new Map<Candidate, { v: number[]; L: number }>();
        for (const c of options) {
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
      }
      const cand = options[useApp.getState().rotIndex % options.length];
      const n = options.length;
      st.setGhost({ kind: "cand", cand }, n > 1 ? `${n} opções neste ponto: R alterna.` : null);
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
        if (!ok && (now.tool.kind === "moveGroup" || (now.tool.kind === "place" && now.tool.moving))) {
          now.disarm(); // movimento cancelado: nada mudou
          now.setGhost(null, "Movimento cancelado: o lugar não era válido.");
        } else if (now.tool.kind !== "select") now.disarm();
        return;
      }
      const d = down.current;
      down.current = null;
      if (!inside || !d || Math.hypot(d.x - ev.clientX, d.y - ev.clientY) > CLICK_PX) return; // foi giro de câmera
      update(ev);
      useApp.getState().commitGhost();
      // depois de colocar, recalcula o fantasma no mesmo lugar
      update(ev);
    };

    // Gancho de teste/depuração: projeta posições do modelo (módulos) para a tela.
    (window as unknown as Record<string, unknown>).__simolador = {
      store: useApp,
      project: (p: Vec3) => toScreen(toWorld(p), el.getBoundingClientRect()),
      projectPlate: (x: number, z: number) => toScreen(new THREE.Vector3(x * M, 0, z * M), el.getBoundingClientRect()),
    };

    // R também atualiza o fantasma sem mexer o mouse
    let lastEv: PointerEvent | null = null;
    const track = (ev: PointerEvent) => ((lastEv = ev), update(ev));
    const unsub = useApp.subscribe((s, p) => {
      if (lastEv && (s.rotIndex !== p.rotIndex || (s.tool.kind === "moveGroup" && p.tool.kind === "moveGroup" && s.tool.turns !== p.tool.turns) || s.history !== p.history || s.snap !== p.snap)) {
        update(lastEv);
      }
    });

    window.addEventListener("pointermove", track);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      unsub();
      window.removeEventListener("pointermove", track);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [camera, gl]);

  return null;
}
