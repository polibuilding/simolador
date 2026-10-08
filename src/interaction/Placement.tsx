// Posicionar peças: clique na paleta (fica armado) ou arraste da paleta para a cena.
// Barras: acha o nó mais próximo do cursor na tela e, entre as 6 direções, a ponta mais próxima do cursor.
// GC: projeta o cursor na chapa e encaixa na grade (ou livre).
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { catalog } from "../core/catalog";
import { memberCandidates, supportCheck, supportPosition } from "../core/snapping";
import { useApp } from "../ui/store";
import { fromWorldOnPlate, toWorld } from "../render/units";

const NODE_PICK_PX = 120;
const CLICK_PX = 5;

export function Placement() {
  const { camera, gl } = useThree();
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const plate = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const toScreen = (v: THREE.Vector3, rect: DOMRect) => {
      const p = v.clone().project(camera);
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    };

    const update = (ev: PointerEvent) => {
      const st = useApp.getState();
      if (st.tool.kind !== "place") return;
      const rect = el.getBoundingClientRect();
      const inside = ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      if (!inside) return st.setGhost(null, st.tool.viaDrag ? "Solte a peça sobre a cena." : null);
      const code = st.tool.code;
      const model = st.history.present;

      if (code === "GC") {
        const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.ray.intersectPlane(plate, new THREE.Vector3());
        if (!hit) return st.setGhost(null, "Aponte para a chapa.");
        const pos = supportPosition(catalog, fromWorldOnPlate(hit), st.gcMode);
        const check = supportCheck(catalog, st.inventory, model, pos);
        return st.setGhost({ code, toPos: pos, check }, check.errors[0] ?? null);
      }

      // barra: de todos os nós, as 6 direções; vence a ponta cuja projeção fica mais perto do cursor.
      // Candidatas válidas têm preferência (peso 1,35 nas inválidas).
      const nodes = Object.values(model.nodes);
      if (!nodes.length) return st.setGhost(null, "Comece por uma ligação de base: as barras saem das esferas.");
      let pick: ReturnType<typeof memberCandidates>[number] | null = null;
      let pickD = Infinity;
      for (const n of nodes) {
        for (const c of memberCandidates(catalog, st.inventory, model, code, n.id)) {
          const sp = toScreen(toWorld(c.toPos), rect);
          const d = Math.hypot(sp.x - ev.clientX, sp.y - ev.clientY) * (c.check.ok ? 1 : 1.35);
          if (d < pickD) (pick = c), (pickD = d);
        }
      }
      if (!pick || pickD > NODE_PICK_PX) {
        return st.setGhost(null, "Leve o cursor até onde a barra deve terminar, perto de uma esfera.");
      }
      st.setGhost({ code, fromId: pick.fromId, toPos: pick.toPos, check: pick.check }, pick.check.errors[0] ?? null);
    };

    const onDown = (ev: PointerEvent) => {
      if (ev.target === el) down.current = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = (ev: PointerEvent) => {
      const st = useApp.getState();
      if (st.tool.kind !== "place") return;
      const rect = el.getBoundingClientRect();
      const inside = ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      if (st.tool.viaDrag) {
        if (inside) st.commitGhost();
        st.disarm();
        return;
      }
      const d = down.current;
      down.current = null;
      if (!inside || !d || Math.hypot(d.x - ev.clientX, d.y - ev.clientY) > CLICK_PX) return; // foi giro de câmera
      update(ev);
      useApp.getState().commitGhost();
    };

    // Gancho de teste/depuração: projeta uma posição do modelo (módulos) para a tela.
    (window as unknown as Record<string, unknown>).__simolador = {
      store: useApp,
      project: (p: [number, number, number]) => toScreen(toWorld(p), el.getBoundingClientRect()),
      projectPlate: (x: number, z: number) =>
        toScreen(new THREE.Vector3(x * catalog.settings.modulo_mm, 0, z * catalog.settings.modulo_mm), el.getBoundingClientRect()),
    };

    window.addEventListener("pointermove", update);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [camera, gl]);

  return null;
}
