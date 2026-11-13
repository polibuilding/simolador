// Diagonais, placas e ligações em 3D. Medidas do catálogo (CC e CC90: estimadas pelas fotos da equipe, 13/11/2026).
import { useMemo } from "react";
import * as THREE from "three";
import { catalog } from "../../core/catalog";
import { continuousOutline, continuousSize } from "../../core/shapes";
import { insetPolygon2, isRectangle, polyTo2D } from "../../core/geom";
import type { Vec3 } from "../../core/model";
import { COLORS } from "../units";
import { resolvedTheme } from "../../ui/prefs";

/** tema escuro: cabos e diagonais (finos e escuros) clareiam para não sumir no fundo grafite */
const DARK = resolvedTheme() === "dark";
import { pickProps, SPHERE_R, useMaterial, type Look, type Pickable } from "./pieces";
import { ropeSpec, segmentBallOffsets, sphereEnd, type RopeEnd } from "../../core/rope";
import { useEffect, useRef } from "react";

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

/**
 * Barriga de um cabo frouxo: o cabo (comprimento `nominal`, mm, entre os centros) com as pontas mais perto que isso pende
 * numa parábola. Flecha f tal que o comprimento do arco ≈ d + 8f²/(3d) = nominal. Devolve os pontos no sistema local do
 * cabo (eixo Y = da ponta a para a b, origem no meio), já com o lado "para baixo" do mundo; null se estiver esticado.
 */
export function sagCurve(a: THREE.Vector3, b: THREE.Vector3, nominal: number, inset: number): THREE.Vector3[] | null {
  const d = a.distanceTo(b);
  const slack = nominal - d;
  if (!(slack > Math.max(0.5, 0.004 * nominal))) return null;
  const di = Math.max(1, d - 2 * inset);
  const f = Math.sqrt((3 * di * Math.min(slack, 0.5 * nominal)) / 8);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  // "para baixo" perpendicular à corda (cabo em pé: para o lado)
  const down = new THREE.Vector3(0, -1, 0).addScaledVector(dir, dir.y);
  if (down.lengthSq() < 1e-6) down.set(1, 0, 0).addScaledVector(dir, -dir.x);
  down.normalize();
  // para o sistema local do grupo (quaternion que leva Y em `dir`)
  const inv = new THREE.Quaternion().setFromUnitVectors(Y, dir).invert();
  const dl = down.applyQuaternion(inv);
  const pts: THREE.Vector3[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = -di / 2 + di * t;
    pts.push(new THREE.Vector3(0, y, 0).addScaledVector(dl, 4 * f * t * (1 - t)));
  }
  return pts;
}

export function Cable({ a, b, look = "normal", nominal, ...p }: { a: THREE.Vector3; b: THREE.Vector3; look?: Look; nominal?: number } & Pickable) {
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
  const cable = useMaterial(look, DARK ? "#b4bcc1" : "#3b4146", 0.6, 0.4);
  const cap = useMaterial(look, COLORS.cap, 0.8, 0.3);
  const hit = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  const inner = len - 2 * (SPHERE_R + term);
  // frouxo (as pontas ficaram mais perto que o comprimento da diagonal): pende com barriga
  const sag = useMemo(() => {
    const pts = nominal ? sagCurve(a, b, nominal, SPHERE_R + term) : null;
    return pts ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, r, 6, false) : null;
  }, [a, b, nominal, r, term]);
  useEffect(() => () => sag?.dispose(), [sag]);
  return (
    <group position={mid} quaternion={quat} {...pickProps(p)}>
      {sag ? (
        <mesh material={cable} geometry={sag} />
      ) : (
        <mesh material={cable}>
          <cylinderGeometry args={[r, r, Math.max(1, inner), 8]} />
        </mesh>
      )}
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

// ---------- Cabo do Kit 3 (corrente de bolinhas) ----------

/**
 * Cabo entre dois centros de esfera (mm): em cada ponta a ligação de cabo (mola curta com ímã + anel) e o clip;
 * no meio, as bolinhas no passo do cabo. A sobra de menos de uma bolinha fica no esticador (dividida nas pontas).
 */
export function Rope({ a, b, ends = ["sphere", "sphere"], look = "normal", ...p }: { a: THREE.Vector3; b: THREE.Vector3; ends?: [RopeEnd, RopeEnd]; look?: Look } & Pickable) {
  const sp = ropeSpec(catalog);
  const conn = Number(s.cabo_ligacao_mm ?? 16);
  const clip = Number(s.cabo_clip_mm ?? 9);
  const ringR = 1.5;
  const [ea, eb] = ends;
  const { mid, quat, len, balls, first } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const L = dir.length();
    const offs = segmentBallOffsets(sp, L, ea, eb);
    return {
      mid: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize()),
      len: L,
      balls: offs.length,
      first: -L / 2 + (offs[0] ?? 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, sp.pitch, sp.end, sp.tap, sp.multi, sp.ringP, sp.ringM, ea, eb]);
  const steel = useMaterial(look, "#aeb5bb", 0.9, 0.25);
  const dark = useMaterial(look, DARK ? "#a9b2b8" : "#7c858c", 0.85, 0.3);
  const hit = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < balls; i++) ref.current?.setMatrixAt(i, m.makeTranslation(0, first + i * sp.pitch, 0));
    if (ref.current) (ref.current.count = balls), (ref.current.instanceMatrix.needsUpdate = true);
  }, [balls, first, sp.pitch]);
  const springLen = conn - 2 * ringR;
  const chainLen = Math.max(0.1, (balls - 1) * sp.pitch);
  return (
    <group position={mid} quaternion={quat} {...pickProps(p)}>
      {/* bolinhas e o arame que as une */}
      <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, balls)]} material={steel} frustumCulled={false} castShadow>
        <sphereGeometry args={[sp.ball / 2, 10, 8]} />
      </instancedMesh>
      <mesh position={[0, first + chainLen / 2, 0]} material={dark}>
        <cylinderGeometry args={[0.28, 0.28, chainLen, 5]} />
      </mesh>
      {[-1, 1].map((sg) => {
        const end = sg < 0 ? ea : eb;
        if (end === "pass") return null; // o cabo passa pelo ponto de cabo: só bolinhas
        if (end === "tap") {
          // pendural: o clip do ponto de cabo segura a bolinha da ponta
          return (
            <mesh key={sg} position={[0, sg * (len / 2 - sp.tap / 2), 0]} material={dark}>
              <boxGeometry args={[2.2, Math.max(0.5, sp.tap - 1), 2.2]} />
            </mesh>
          );
        }
        if (end === "ring-p" || end === "ring-m") {
          // anel: só o clip de cabo, preso no anel
          const r0 = (end === "ring-m" ? sp.ringM : sp.ringP) - clip;
          return (
            <mesh key={sg} position={[0, sg * (len / 2 - r0 - clip / 2 + 0.5), 0]} material={dark}>
              <boxGeometry args={[2.6, clip - 1.5, 2.6]} />
            </mesh>
          );
        }
        // clip de múltiplos cabos: um pouco maior que o simples
        const clipLen = end === "multi" ? sp.multi - SPHERE_R - conn : clip;
        // da superfície da esfera para dentro do cabo
        const at = (d: number) => sg * (len / 2 - SPHERE_R - d);
        return (
          <group key={sg}>
            {/* ligação de cabo (CABLE C): mola curta com ímã encostado na esfera */}
            <mesh position={[0, at(springLen / 2), 0]} material={dark}>
              <cylinderGeometry args={[2, 2, springLen, 12]} />
            </mesh>
            {/* anel da CABLE C */}
            <mesh position={[0, at(conn - ringR), 0]} rotation={[0, 0, Math.PI / 2]} material={steel}>
              <torusGeometry args={[ringR, 0.35, 6, 14]} />
            </mesh>
            {/* clip de cabo (CABLE CLIP C) ou de múltiplos cabos (M CABLE CLIP C, mais largo) */}
            <mesh position={[0, at(conn + clipLen / 2 - 1), 0]} material={dark}>
              <boxGeometry args={[end === "multi" ? 3.4 : 2.6, clipLen - 1.5, end === "multi" ? 3.4 : 2.6]} />
            </mesh>
          </group>
        );
      })}
      <mesh material={hit}>
        <cylinderGeometry args={[3.5, 3.5, Math.max(1, len - (sphereEnd(ea) ? SPHERE_R : 0) - (sphereEnd(eb) ? SPHERE_R : 0)), 6]} />
      </mesh>
    </group>
  );
}

/** Ponto de cabo (K7): o CABLE CLIP C que prende a bolinha do cabo principal pelo furo do meio. */
/** Anel de cabo (CABLE R) no ar: um aro de aço, pequeno (RING-P) ou médio (RING-M), virado para a câmera. */
export function RopeRing({ position, code, look = "normal", ...p }: { position: THREE.Vector3; code?: string; look?: Look } & Pickable) {
  const mat = useMaterial(look, "#9aa3aa", 0.95, 0.2);
  const hit = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  const d = Number((catalog.pieces[code ?? "RING-P"]?.geometry as { lengthMm?: number } | undefined)?.lengthMm ?? 10);
  return (
    <group position={position} {...pickProps(p)}>
      <mesh material={mat} castShadow rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[d / 2, 0.9, 10, 28]} />
      </mesh>
      <mesh material={hit}>
        <sphereGeometry args={[Math.max(6, d / 2 + 2), 10, 8]} />
      </mesh>
    </group>
  );
}

export function RopeClip({ position, look = "normal", ...p }: { position: THREE.Vector3; look?: Look } & Pickable) {
  const mat = useMaterial(look, DARK ? "#a3acb2" : "#5d666d", 0.85, 0.3);
  const hit = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  return (
    <group position={position} {...pickProps(p)}>
      <mesh material={mat} castShadow>
        <boxGeometry args={[3.6, 3.6, 3.6]} />
      </mesh>
      <mesh material={hit}>
        <sphereGeometry args={[5, 10, 8]} />
      </mesh>
    </group>
  );
}

// ---------- Placa ----------

/** Placa entre 4 cantos (centros das esferas, em mm), na ordem ao redor do retângulo. */
export function PlateMesh(props: { corners: THREE.Vector3[]; code: string; look?: Look } & Pickable) {
  // placas do kit (retângulos) seguem pelo desenho de sempre; outro formato (placa ajustável da 2.x), pelo polígono
  const rect = isRectangle(props.corners.map((c) => [c.x, c.y, c.z] as Vec3), 1e-2);
  return rect ? <RectPlateMesh {...props} /> : <PolygonPlateMesh {...props} />;
}

function PolygonPlateMesh({ corners, code, look = "normal", ...p }: { corners: THREE.Vector3[]; code: string; look?: Look } & Pickable) {
  const piece = catalog.pieces[code];
  const t = Number(piece?.geometry.thicknessMm ?? s.placa_espessura_mm);
  const { geom, matrix } = useMemo(() => {
    const f = polyTo2D(corners.map((c) => [c.x, c.y, c.z] as Vec3));
    const inset = insetPolygon2(f.pts, s.placa_desconto_mm / 2);
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(inset.map(([x, y]) => new THREE.Vector2(x, y))), { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.ex), new THREE.Vector3(...f.ey), new THREE.Vector3(...f.n)).setPosition(new THREE.Vector3(...f.origin));
    return { geom: g, matrix: m };
  }, [corners, t]);
  const mat = useMaterial(look, piece?.color ?? "#e4e7e9", 0.02, 0.6);
  return <mesh geometry={geom} material={mat} matrix={matrix} matrixAutoUpdate={false} castShadow receiveShadow {...pickProps(p)} />;
}

function RectPlateMesh({ corners, code, look = "normal", ...p }: { corners: THREE.Vector3[]; code: string; look?: Look } & Pickable) {
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
  const mat = useMaterial(look, piece?.color ?? "#e4e7e9", 0.02, 0.6);
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
  g.translate(0, 0, -depth / 2); // centrada no plano das barras
  return g;
}

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

/** CC / CC90: CC sobre a esfera, nas duas molas alinhadas; CC90 em cruz por cima dela, nas molas do outro par (a fenda passa pela CC). */
export function ContinuousConnector({
  at, axis, side: sideIn, code, look = "normal", ...p
}: { at: THREE.Vector3; axis: Vec3; side?: Vec3; code: string; look?: Look } & Pickable) {
  const tall = code === "CC90";
  const { matrix, geom } = useMemo(() => {
    const u = v3(axis);
    // lado da esfera onde a peça fica (escolhido ao colocar; arquivos antigos: para cima, ou +x em pilares)
    const side = sideIn ? v3(sideIn) : Math.abs(axis[1]) > 0.5 ? new THREE.Vector3(1, 0, 0) : Y.clone();
    return { matrix: basis(at, u, side), geom: extruded(continuousOutline(catalog, code), continuousSize(catalog, code).thickness) };
  }, [at, axis, tall, sideIn]);
  const mat = useMaterial(look, tall ? "#c4c9cd" : "#d6dadd", 0.05, 0.5);
  return <mesh geometry={geom} material={mat} matrix={matrix} matrixAutoUpdate={false} castShadow {...pickProps(p)} />;
}
