// Contexto do posicionamento: câmera, tela e o estado de UM comando (Tab, ligação começada, barra livre, ponto da GC,
// retângulo). Todo estado de comando mora em `Cmd`: `freshCmd()` é o "zerar" que roda a cada troca de comando, então
// um campo novo aqui já nasce zerado na troca (era a sobra de estado que deixava o clique sem colocar a peça).
import * as THREE from "three";
import type { LocusCircle } from "../core/edit";
import type { RopeBall } from "../core/rope";
import type { Vec3 } from "../core/model";
import { BASE_Y, M } from "../render/units";
import { useApp } from "../ui/store";

export interface Cmd {
  /** GC: pontos disputados perto do cursor (o Tab recomeça quando mudam) */
  lastChoiceKey: string;
  /** GC perto da estrutura: o ponto do círculo (as opções do R recomeçam quando muda) */
  reachSpot: string;
  /** barra livre: esfera de partida e a esfera recém-criada que não vira partida até o cursor sair dela */
  freeAnchor: string | null;
  freeHold: { x: number; y: number } | null;
  /** Tab nos pontos amarelos e nas referências do caminho */
  triTab: { x: number; y: number; anchor: string | null } | null;
  nodeTab: { x: number; y: number; nodeId: string; pts: Vec3[]; labels: string[]; rings: (LocusCircle | null)[]; start: number } | null;
  /** só no movimento atual do cursor: esfera ou bolinha clicada para começar a ligação, e se o fantasma é uma ligação */
  linkPick: string | null;
  linkGhost: { moved: number } | null;
  ballPick: RopeBall | null;
  /** retângulo de seleção começado */
  boxStart: { x: number; y: number; shift: boolean } | null;
  /** ponto de encaixe atual (o R recomeça quando muda) */
  lastSpot: string | null;
}

export const freshCmd = (): Cmd => ({
  lastChoiceKey: "", reachSpot: "", freeAnchor: null, freeHold: null, triTab: null, nodeTab: null,
  linkPick: null, linkGhost: null, ballPick: null, boxStart: null, lastSpot: null,
});

export interface Ctx {
  camera: THREE.Camera;
  el: HTMLCanvasElement;
  cmd: Cmd;
  toScreen: (v: THREE.Vector3, rect: DOMRect) => { x: number; y: number; z: number };
  insideOf: (ev: PointerEvent, rect: DOMRect) => boolean;
  planeHit: (ev: PointerEvent, rect: DOMRect, yMm: number) => THREE.Vector3 | null;
  rayAt: (ev: PointerEvent, rect: DOMRect) => THREE.Ray;
  toModule: (w: THREE.Vector3) => Vec3;
  markHover: (id: string | null) => void;
}

export function makeCtx(camera: THREE.Camera, el: HTMLCanvasElement): Ctx {
  const raycaster = new THREE.Raycaster();
  const ndc = (ev: PointerEvent, rect: DOMRect) =>
    new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  return {
    camera,
    el,
    cmd: freshCmd(),
    toScreen: (v, rect) => {
      const p = v.clone().project(camera);
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height, z: p.z };
    },
    insideOf: (ev, rect) => ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom,
    planeHit: (ev, rect, yMm) => {
      raycaster.setFromCamera(ndc(ev, rect), camera);
      return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -yMm), new THREE.Vector3());
    },
    rayAt: (ev, rect) => {
      raycaster.setFromCamera(ndc(ev, rect), camera);
      return raycaster.ray.clone();
    },
    toModule: (w) => [w.x / M, (w.y - BASE_Y) / M, w.z / M],
    markHover: (id) => {
      if (useApp.getState().toolHover !== id) useApp.setState({ toolHover: id });
    },
  };
}
