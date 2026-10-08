// Foto da cena 3D para a capa das pranchas: isométrica na mesma direção do desenho em linhas, fundo branco.
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import type { Model } from "../core/model";
import { PLATE_D, PLATE_W, toWorld } from "./units";

let ctx: { gl: THREE.WebGLRenderer; scene: THREE.Scene } | null = null;

/** Dentro do <Canvas>: guarda o renderizador e a cena para a foto. */
export function SnapshotHook() {
  const { gl, scene } = useThree();
  useEffect(() => {
    ctx = { gl, scene };
    return () => {
      ctx = null;
    };
  }, [gl, scene]);
  return null;
}

/** Mesma direção da isométrica das pranchas (views.ts): frente-direita-cima. */
const ISO_DIR = new THREE.Vector3(1, 0.9, 1.25).normalize();

export interface IsoImage {
  url: string;
  /** largura / altura */
  aspect: number;
}

/** Renderiza o modelo em isométrica (projeção paralela) e devolve um JPEG. Null se a cena não estiver pronta. */
export function renderIso(model: Model, widthPx = 2600): IsoImage | null {
  if (!ctx) return null;
  const { gl, scene } = ctx;
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), ISO_DIR).normalize();
  const up = new THREE.Vector3().crossVectors(ISO_DIR, right);
  // limites na tela: a chapa inteira e as esferas (com folga do raio)
  const pts: THREE.Vector3[] = [
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(PLATE_W, 0, 0), new THREE.Vector3(0, 0, PLATE_D), new THREE.Vector3(PLATE_W, 0, PLATE_D),
  ];
  for (const n of Object.values(model.nodes)) pts.push(toWorld(n.pos));
  let h0 = Infinity, h1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of pts) {
    const h = p.dot(right);
    const v = p.dot(up);
    h0 = Math.min(h0, h - 12); h1 = Math.max(h1, h + 12);
    v0 = Math.min(v0, v - 12); v1 = Math.max(v1, v + 12);
  }
  const padH = (h1 - h0) * 0.03;
  const padV = (v1 - v0) * 0.03;
  h0 -= padH; h1 += padH; v0 -= padV; v1 += padV;
  const aspect = (h1 - h0) / (v1 - v0);
  const W = Math.round(widthPx);
  const H = Math.min(4000, Math.round(W / aspect));

  const D = 8000;
  const cam = new THREE.OrthographicCamera(h0, h1, v1, v0, 1, 2 * D);
  cam.position.copy(ISO_DIR).multiplyScalar(D);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();

  // estado a restaurar
  const size = gl.getSize(new THREE.Vector2());
  const ratio = gl.getPixelRatio();
  const bg = scene.background;
  const plate = scene.getObjectByName("chapa") as THREE.Mesh | undefined;
  const pm = plate?.material as THREE.MeshStandardMaterial | undefined;
  const pmState = pm && { transparent: pm.transparent, opacity: pm.opacity, depthWrite: pm.depthWrite };
  try {
    scene.background = new THREE.Color("#ffffff");
    if (pm) (pm.transparent = false, pm.opacity = 1, pm.depthWrite = true, (pm.needsUpdate = true));
    gl.setPixelRatio(1);
    gl.setSize(W, H, false);
    gl.render(scene, cam);
    const url = gl.domElement.toDataURL("image/jpeg", 0.92);
    return { url, aspect: W / H };
  } finally {
    scene.background = bg;
    if (pm && pmState) Object.assign(pm, pmState, { needsUpdate: true });
    gl.setPixelRatio(ratio);
    gl.setSize(size.x, size.y, false);
  }
}
