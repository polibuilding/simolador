// Peças em 3D. Medidas vêm do catálogo (mm). Esferas, molas, GC e chapa são gerados por código.
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { catalog } from "../../core/catalog";
import { COLORS, PLATE_D, PLATE_W, M } from "../units";

export type Look = "normal" | "valid" | "invalid" | "selected" | "hover";

const s = catalog.settings;
export const SPHERE_R = s.esfera_diametro_mm / 2;
const BAR_R = s.barra_diametro_mm / 2;

export function useMaterial(look: Look, base: string, metal: number, rough: number) {
  return useMemo(() => {
    const ghost = look === "valid" || look === "invalid";
    const color =
      look === "valid" ? COLORS.valid : look === "invalid" ? COLORS.invalid
      : look === "selected" ? COLORS.select : look === "hover" ? COLORS.hover : base;
    return new THREE.MeshStandardMaterial({
      color,
      metalness: ghost ? 0 : metal,
      roughness: ghost ? 0.6 : rough,
      transparent: ghost,
      opacity: ghost ? 0.55 : 1,
      depthWrite: !ghost,
    });
  }, [look, base, metal, rough]);
}

export interface Pickable {
  onPick?: (e: ThreeEvent<MouseEvent>) => void;
  onHover?: (over: boolean) => void;
  onDown?: (e: ThreeEvent<PointerEvent>) => void;
}

export const pickProps = ({ onPick, onHover, onDown }: Pickable) => ({
  onClick: onPick,
  onPointerDown: onDown,
  onPointerOver: onHover ? (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), onHover(true)) : undefined,
  onPointerOut: onHover ? () => onHover(false) : undefined,
});

export function Sphere({ position, look = "normal", ...p }: { position: THREE.Vector3; look?: Look } & Pickable) {
  const mat = useMaterial(look, COLORS.steel, 0.95, 0.18);
  return (
    <mesh position={position} material={mat} castShadow {...pickProps(p)}>
      <sphereGeometry args={[SPHERE_R, 32, 24]} />
    </mesh>
  );
}

// ---------- Mola (hélice procedural) ----------

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(private length: number, private radius: number, private turns: number) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, (t - 0.5) * this.length, Math.sin(a) * this.radius);
  }
}

const springCache = new Map<number, THREE.BufferGeometry>();
function springGeometry(length: number) {
  const key = Math.round(length * 10);
  let g = springCache.get(key);
  if (!g) {
    const wire = 0.35;
    const turns = Math.max(8, Math.round(length / 1.25)); // passo visual ~1,25 mm (leve para o navegador)
    g = new THREE.TubeGeometry(new Helix(length, BAR_R - wire, turns), turns * 10, wire, 5, false);
    springCache.set(key, g);
  }
  return g;
}

const CAP_LEN = 5;
const Y = new THREE.Vector3(0, 1, 0);

/** Barra entre dois centros de esfera. O comprimento físico vem do catálogo (regra ou medido). */
export function Bar({
  a, b, code, look = "normal", ...p
}: { a: THREE.Vector3; b: THREE.Vector3; code: string; look?: Look } & Pickable) {
  const length = Number(catalog.pieces[code]?.geometry.lengthMm ?? a.distanceTo(b) - 2 * SPHERE_R);
  const springLen = Math.max(1, length - 2 * CAP_LEN);
  const { mid, quat } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    return {
      mid: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(Y, dir),
    };
  }, [a, b]);
  const springMat = useMaterial(look, COLORS.springSteel, 0.9, 0.35);
  const capMat = useMaterial(look, COLORS.cap, 0.8, 0.3);
  const hitMat = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  return (
    <group position={mid} quaternion={quat} {...pickProps(p)}>
      <mesh geometry={springGeometry(springLen)} material={springMat} castShadow />
      {[-1, 1].map((sgn) => (
        <mesh key={sgn} position={[0, sgn * (length / 2 - CAP_LEN / 2), 0]} material={capMat} castShadow>
          <cylinderGeometry args={[BAR_R, BAR_R, CAP_LEN, 16]} />
        </mesh>
      ))}
      {/* volume invisível, mais gordo, para facilitar o clique */}
      <mesh material={hitMat}>
        <cylinderGeometry args={[BAR_R + 2, BAR_R + 2, length, 8]} />
      </mesh>
    </group>
  );
}

/** Ligação de base (GC) com a esfera embutida. `position` = centro da esfera. */
export function GroundConnection({ position, look = "normal", ...p }: { position: THREE.Vector3; look?: Look } & Pickable) {
  const r = s.gc_diametro_mm / 2;
  const h = s.gc_altura_mm;
  const bodyMat = useMaterial(look, COLORS.plastic, 0.05, 0.55);
  const ringMat = useMaterial(look, "#b9bdc2", 0.05, 0.5);
  const base = new THREE.Vector3(position.x, 0, position.z);
  return (
    <group {...pickProps(p)}>
      <mesh position={[base.x, h / 2, base.z]} material={bodyMat} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, h, 48]} />
      </mesh>
      <mesh position={[base.x, h + 0.05, base.z]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
        <ringGeometry args={[SPHERE_R + 0.5, SPHERE_R + 3, 32]} />
      </mesh>
      <Sphere position={position} look={look === "normal" ? "normal" : look} />
    </group>
  );
}

/** Chapa de base preta com a grade de módulos, com o canto em (x, z) módulos. */
export function GroundPlate({
  id = "b1", x = 0, z = 0, rot = 0, highlight = false, selected = false, onPointerMove, onPointerOut, onClick,
}: {
  /** rot: giro em graus em torno do canto (x, z) */
  id?: string; x?: number; z?: number; rot?: number; highlight?: boolean; selected?: boolean;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const t = s.chapa_espessura_mm;
  const grid = useMemo(() => {
    const pts: number[] = [];
    const y = 0.06;
    for (let i = 0; i <= s.chapa_modulos_x; i++) pts.push(i * M, y, 0, i * M, y, PLATE_D);
    for (let j = 0; j <= s.chapa_modulos_y; j++) pts.push(0, y, j * M, PLATE_W, y, j * M);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  // vista por baixo: a chapa fica translúcida para não esconder a estrutura
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ camera }) => {
    const m = mat.current;
    if (!m) return;
    const below = camera.position.y < 0;
    if (m.transparent !== below) {
      m.transparent = below;
      m.opacity = below ? 0.22 : 1;
      m.depthWrite = !below;
      m.needsUpdate = true;
    }
  });
  return (
    <group position={[x * M, 0, z * M]} rotation={[0, (rot * Math.PI) / 180, 0]}>
      <mesh
        name={`chapa:${id}`}
        position={[PLATE_W / 2, -t / 2, PLATE_D / 2]}
        receiveShadow
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onClick={onClick}
      >
        <boxGeometry args={[PLATE_W, t, PLATE_D]} />
        <meshStandardMaterial ref={mat} color={highlight ? "#202529" : COLORS.plate} roughness={0.7} metalness={0.1} />
      </mesh>
      <lineSegments geometry={grid} raycast={() => null}>
        <lineBasicMaterial color={COLORS.grid} transparent opacity={highlight || selected ? 0.75 : 0.55} />
      </lineSegments>
      {selected && (
        // contorno da chapa selecionada
        <mesh position={[PLATE_W / 2, -t / 2 - 0.5, PLATE_D / 2]} raycast={() => null}>
          <boxGeometry args={[PLATE_W + 6, t + 0.6, PLATE_D + 6]} />
          <meshBasicMaterial color={COLORS.select} transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
