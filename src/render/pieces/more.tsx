// Diagonais, placas e ligações em 3D. Medidas do catálogo; CC e CC90 ainda sem medidas (formato provisório).
import { useMemo } from "react";
import * as THREE from "three";
import { catalog } from "../../core/catalog";
import type { Vec3 } from "../../core/model";
import { COLORS } from "../units";
import { pickProps, SPHERE_R, useMaterial, type Look, type Pickable } from "./pieces";

const s = catalog.settings;
const BAR_R = s.barra_diametro_mm / 2;
const Y = new THREE.Vector3(0, 1, 0);
const v3 = (d: Vec3) => new THREE.Vector3(d[0], d[1], d[2]);

/** Matriz com eixos locais x→u, y→v, z→u×v, origem em `at`. */
function basis(at: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3) {
  const w = new THREE.Vector3().crossVectors(u, v);
  return new THREE.Matrix4().makeBasis(u, v, w).setPosition(at);
}

// ---------- Diagonal (cabo fino com terminais) ----------

export function Cable({ a, b, look = "normal", ...p }: { a: THREE.Vector3; b: THREE.Vector3; look?: Look } & Pickable) {
  const term = s.diagonal_terminal_mm;
  const r = Math.max(0.5, s.cabo_diametro_mm / 2);
  const { mid, quat, len } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a);
    return {
      mid: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize()),
      len: dir.length(),
    };
  }, [a, b]);
  const cable = useMaterial(look, "#3b4146", 0.6, 0.4);
  const cap = useMaterial(look, COLORS.cap, 0.8, 0.3);
  const hit = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  const inner = len - 2 * (SPHERE_R + term);
  return (
    <group position={mid} quaternion={quat} {...pickProps(p)}>
      <mesh material={cable}>
        <cylinderGeometry args={[r, r, Math.max(1, inner), 8]} />
      </mesh>
      {[-1, 1].map((sg) => (
        <mesh key={sg} position={[0, sg * (len / 2 - SPHERE_R - term / 2), 0]} rotation={[0, Math.PI / 4, 0]} material={cap}>
          <boxGeometry args={[term, term, term]} />
        </mesh>
      ))}
      <mesh material={hit}>
        <cylinderGeometry args={[3.5, 3.5, Math.max(1, len - 2 * SPHERE_R), 6]} />
      </mesh>
    </group>
  );
}

// ---------- Placa ----------

/** Placa entre 4 cantos (centros das esferas, em mm), na ordem ao redor do retângulo. */
export function PlateMesh({ corners, code, look = "normal", ...p }: { corners: THREE.Vector3[]; code: string; look?: Look } & Pickable) {
  const piece = catalog.pieces[code];
  const desconto = s.placa_desconto_mm;
  const t = Number(piece?.geometry.thicknessMm ?? s.placa_espessura_mm);
  const { matrix, su, sv } = useMemo(() => {
    const [c0, c1, , c3] = corners;
    const u = new THREE.Vector3().subVectors(c1, c0);
    const v = new THREE.Vector3().subVectors(c3, c0);
    const center = corners.reduce((acc, c) => acc.add(c), new THREE.Vector3()).multiplyScalar(0.25);
    return { matrix: basis(center, u.clone().normalize(), v.clone().normalize()), su: u.length() - desconto, sv: v.length() - desconto };
  }, [corners, desconto]);
  const mat = useMaterial(look, "#e4e7e9", 0.02, 0.6);
  const geom = useMemo(() => {
    // retângulo com cantos chanfrados (onde a placa encosta nas esferas)
    const c = Math.min(8, su / 6, sv / 6);
    const shape = new THREE.Shape();
    const x = su / 2;
    const y = sv / 2;
    shape.moveTo(-x + c, -y);
    shape.lineTo(x - c, -y);
    shape.lineTo(x, -y + c);
    shape.lineTo(x, y - c);
    shape.lineTo(x - c, y);
    shape.lineTo(-x + c, y);
    shape.lineTo(-x, y - c);
    shape.lineTo(-x, -y + c);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2);
    return g;
  }, [su, sv, t]);
  return (
    <mesh geometry={geom} material={mat} matrix={matrix} matrixAutoUpdate={false} castShadow receiveShadow {...pickProps(p)} />
  );
}

// ---------- Ligações ----------

function extruded(points: [number, number][], depth: number) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** RC90: trapézio no canto entre duas peças a 90° (ou entre a GC e o pilar). */
export function RigidConnector({
  at, dirs, base, look = "normal", ...p
}: { at: THREE.Vector3; dirs: Vec3[]; base?: boolean; look?: Look } & Pickable) {
  const leg = s.rc90_cateto_mm;
  const t = s.rc90_espessura_mm;
  const { matrix, geom } = useMemo(() => {
    // base: x = lado da GC, y = para cima; normal: x = dirs[0], y = dirs[1]
    const u = v3(base ? dirs[1] : dirs[0]);
    const v = v3(base ? dirs[0] : dirs[1]);
    const a = BAR_R;
    let pts: [number, number][];
    if (base) {
      const top = s.gc_altura_mm - s.gc_centro_esfera_mm; // topo da GC em relação ao centro da esfera
      pts = [[a, top], [a + leg, top], [a, top + leg]];
    } else {
      const r0 = SPHERE_R * 0.8;
      const r1 = SPHERE_R + leg;
      pts = [[r0, a], [r1, a], [a, r1], [a, r0]];
    }
    return { matrix: basis(at, u, v), geom: extruded(pts, t) };
  }, [at, dirs, base, leg, t]);
  const mat = useMaterial(look, "#cfd3d6", 0.05, 0.5);
  return <mesh geometry={geom} material={mat} matrix={matrix} matrixAutoUpdate={false} castShadow {...pickProps(p)} />;
}

/** CC / CC90 (formato provisório até as medidas): ponte sobre a esfera, ao longo do eixo do par de barras. */
export function ContinuousConnector({
  at, axis, side: sideIn, code, look = "normal", ...p
}: { at: THREE.Vector3; axis: Vec3; side?: Vec3; code: string; look?: Look } & Pickable) {
  const tall = code === "CC90";
  const { matrix, geom } = useMemo(() => {
    const u = v3(axis);
    // lado da esfera onde a peça fica (escolhido ao colocar; arquivos antigos: para cima, ou +x em pilares)
    const side = sideIn ? v3(sideIn) : Math.abs(axis[1]) > 0.5 ? new THREE.Vector3(1, 0, 0) : Y.clone();
    const L = SPHERE_R + 14;
    const base = tall ? SPHERE_R + 1.5 : BAR_R;
    const h = tall ? 9 : 5;
    const pts: [number, number][] = [[-L, base], [L, base], [L - 4, base + h], [-L + 4, base + h]];
    return { matrix: basis(at, u, side), geom: extruded(pts, 6) };
  }, [at, axis, tall, sideIn]);
  const mat = useMaterial(look, tall ? "#c4c9cd" : "#d6dadd", 0.05, 0.5);
  return <mesh geometry={geom} material={mat} matrix={matrix} matrixAutoUpdate={false} castShadow {...pickProps(p)} />;
}
