import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { catalog } from "../core/catalog";
import type { Model, Vec3 } from "../core/model";
import { markerPos, type Candidate } from "../core/snapping";
import { candidatesFor, Placement } from "../interaction/Placement";
import { useApp, useModel, workingModel } from "../ui/store";
import type { Sel } from "../core/edit";
import { Bar, GroundConnection, GroundPlate, Sphere, type Look } from "./pieces/pieces";
import { Cable, ContinuousConnector, PlateMesh, RigidConnector } from "./pieces/more";
import { COLORS, PLATE_D, PLATE_W, toWorld } from "./units";

const typeOf = (code: string) => catalog.pieces[code]?.type;

/** Desenha um modelo. `lookOf` decide a aparência de cada peça; `interactive` liga seleção e arraste. */
function ModelGroup({
  model, lookOf, interactive, hidden,
}: { model: Model; lookOf: (id: string) => Look; interactive: boolean; hidden?: Set<string> }) {
  const { select, setHover, setPendingDrag } = useApp.getState();
  const selection = useApp((s) => s.selection);
  const handlers = (kind: Sel["kind"], id: string) =>
    interactive
      ? {
          onPick: (e: { delta: number; stopPropagation: () => void }) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            select({ kind, id });
          },
          onHover: (over: boolean) => setHover(over ? id : null),
          onDown: (e: { button: number; stopPropagation: () => void; nativeEvent: PointerEvent }) => {
            // arrastar a peça já selecionada = mover
            if (e.button === 0 && selection?.id === id) {
              e.stopPropagation();
              setPendingDrag({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            }
          },
        }
      : {};

  const pos = useMemo(() => Object.fromEntries(Object.values(model.nodes).map((n) => [n.id, toWorld(n.pos)])), [model.nodes]);

  return (
    <group>
      {Object.values(model.nodes).filter((n) => !hidden?.has(n.id)).map((n) =>
        n.kind === "support" ? (
          <GroundConnection key={n.id} position={pos[n.id]} look={lookOf(n.id)} {...handlers("node", n.id)} />
        ) : (
          <Sphere key={n.id} position={pos[n.id]} look={lookOf(n.id)} {...handlers("node", n.id)} />
        ),
      )}
      {Object.values(model.members).map((m) =>
        typeOf(m.code) === "cable" ? (
          <Cable key={m.id} a={pos[m.a]} b={pos[m.b]} look={lookOf(m.id)} {...handlers("member", m.id)} />
        ) : (
          <Bar key={m.id} a={pos[m.a]} b={pos[m.b]} code={m.code} look={lookOf(m.id)} {...handlers("member", m.id)} />
        ),
      )}
      {Object.values(model.plates).map((p) => (
        <PlateMesh key={p.id} corners={p.corners.map((c) => pos[c])} code={p.code} look={lookOf(p.id)} {...handlers("plate", p.id)} />
      ))}
      {Object.values(model.connectors).map((c) =>
        c.code === "RC90" ? (
          <RigidConnector key={c.id} at={pos[c.node]} dirs={c.dirs} base={c.base} look={lookOf(c.id)} {...handlers("connector", c.id)} />
        ) : (
          <ContinuousConnector key={c.id} at={pos[c.node]} axis={c.dirs[0]} code={c.code} look={lookOf(c.id)} {...handlers("connector", c.id)} />
        ),
      )}
    </group>
  );
}

function ModelView() {
  const model = useModel();
  const selection = useApp((s) => s.selection);
  const hoverId = useApp((s) => s.hoverId);
  const selecting = useApp((s) => s.tool.kind === "select");
  const groupGhost = useApp((s) => (s.ghost?.kind === "group" ? s.ghost : null));
  const lookOf = (id: string): Look =>
    groupGhost?.ids.has(id) ? "normal" : selection?.id === id ? "selected" : selecting && hoverId === id ? "hover" : "normal";
  // durante "mover estrutura", a estrutura original some e aparece o fantasma
  const shown = useMemo(() => {
    if (!groupGhost) return model;
    const keep = (nid: string) => !groupGhost.ids.has(nid);
    return {
      ...model,
      nodes: Object.fromEntries(Object.entries(model.nodes).filter(([k]) => keep(k))),
      members: Object.fromEntries(Object.entries(model.members).filter(([, m]) => keep(m.a) && keep(m.b))),
      plates: Object.fromEntries(Object.entries(model.plates).filter(([, p]) => p.corners.every(keep))),
      connectors: Object.fromEntries(Object.entries(model.connectors).filter(([, c]) => keep(c.node))),
    };
  }, [model, groupGhost]);
  return <ModelGroup model={shown} lookOf={lookOf} interactive={selecting} />;
}

function candidateModel(base: Model, c: Candidate): { model: Model } {
  // modelo mínimo só com a peça fantasma (e os nós que ela usa)
  const m: Model = { nodes: {}, members: {}, plates: {}, connectors: {}, nextId: 1 };
  const node = (p: Vec3, id: string) => (m.nodes[id] = { id, kind: "sphere", pos: p });
  if (c.kind === "support") m.nodes.g = { id: "g", kind: "support", pos: c.pos };
  if (c.kind === "member") {
    node(base.nodes[c.fromId].pos, "ga");
    node(c.toPos, "gb");
    m.members.g = { id: "g", code: c.code, a: "ga", b: "gb" };
  }
  if (c.kind === "plate") {
    c.geom.corners.forEach((p, i) => node(p, `g${i}`));
    m.plates.g = { id: "g", code: c.code, corners: ["g0", "g1", "g2", "g3"] };
  }
  if (c.kind === "connector") {
    node(base.nodes[c.spec.node].pos, "gn");
    m.connectors.g = { id: "g", code: c.spec.code, node: "gn", dirs: c.spec.dirs, base: c.spec.base };
  }
  return { model: m };
}

function GhostView() {
  const ghost = useApp((s) => s.ghost);
  const base = useModel();
  if (!ghost) return null;
  if (ghost.kind === "group") {
    const look: Look = ghost.check.ok ? "valid" : "invalid";
    return <ModelGroup model={ghost.model} lookOf={() => look} interactive={false} />;
  }
  const look: Look = ghost.cand.check.ok ? "valid" : "invalid";
  const { model } = candidateModel(base, ghost.cand);
  // esferas que já existem não são redesenhadas: só a peça nova (e a esfera nova da ponta)
  const existing = new Set(Object.values(base.nodes).map((n) => n.pos.join(",")));
  const hidden = new Set(Object.values(model.nodes).filter((n) => n.id !== "g" && existing.has(n.pos.join(","))).map((n) => n.id));
  return <ModelGroup model={model} lookOf={() => look} interactive={false} hidden={hidden} />;
}

/** Pontos verdes: onde a peça escolhida pode encaixar (só com o encaixe ligado). */
function Markers() {
  const tool = useApp((s) => s.tool);
  const snap = useApp((s) => s.snap);
  const inventory = useApp((s) => s.inventory);
  const model = useApp((s) => workingModel(s));
  const ref = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const code = tool.kind === "place" ? tool.code : null;
  const { dots, rings } = useMemo(() => {
    if (!code || !snap) return { dots: [] as THREE.Vector3[], rings: [] as THREE.Vector3[] };
    const inv = tool.kind === "place" && tool.moving ? { ...inventory, unlimited: true } : inventory;
    const { cands } = candidatesFor(model, code, inv);
    const occupied = new Set(Object.values(model.nodes).map((n) => n.pos.join(",")));
    const seen = new Set<string>();
    const dots: THREE.Vector3[] = [];
    const rings: THREE.Vector3[] = [];
    for (const c of cands) {
      if (!c.check.ok) continue;
      const p = markerPos(model, c);
      const k = p.join(",");
      if (seen.has(k)) continue;
      seen.add(k);
      const w = toWorld(p);
      if (c.kind === "support") w.y = 0.4;
      (occupied.has(k) ? rings : dots).push(w);
    }
    return { dots, rings };
  }, [code, snap, model, inventory, tool]);

  useEffect(() => {
    const m = new THREE.Matrix4();
    dots.forEach((p, i) => ref.current?.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    if (ref.current) (ref.current.count = dots.length), (ref.current.instanceMatrix.needsUpdate = true);
    rings.forEach((p, i) => ringRef.current?.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    if (ringRef.current) (ringRef.current.count = rings.length), (ringRef.current.instanceMatrix.needsUpdate = true);
  }, [dots, rings]);

  const max = 2000;
  return (
    <group raycast={() => null}>
      <instancedMesh ref={ref} args={[undefined, undefined, max]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[2.6, 12, 8]} />
        <meshBasicMaterial color={COLORS.valid} transparent opacity={0.85} depthTest={false} />
      </instancedMesh>
      <instancedMesh ref={ringRef} args={[undefined, undefined, max]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[10.5, 20, 14]} />
        <meshBasicMaterial color={COLORS.valid} transparent opacity={0.28} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

/** Câmera: enquadrar a estrutura e vistas prontas (A = frente, B = esquerda, topo). */
function CameraRig() {
  const cmd = useApp((s) => s.camera);
  const { camera, controls } = useThree();
  useEffect(() => {
    if (!controls) return;
    const ctl = controls as unknown as { target: THREE.Vector3; update: () => void };
    const model = useApp.getState().history.present;
    const box = new THREE.Box3(new THREE.Vector3(0, -3, 0), new THREE.Vector3(PLATE_W, 20, PLATE_D));
    for (const n of Object.values(model.nodes)) box.expandByPoint(toWorld(n.pos));
    box.expandByScalar(25);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const dist = radius / Math.sin(fov / 2);
    const dirs: Record<string, THREE.Vector3> = {
      iso: new THREE.Vector3(0.62, 0.62, 0.9),
      fit: camera.position.clone().sub(ctl.target),
      front: new THREE.Vector3(0, 0.05, 1),
      side: new THREE.Vector3(-1, 0.05, 0),
      top: new THREE.Vector3(0, 1, 0.0001),
    };
    const dir = dirs[cmd.view].normalize();
    ctl.target.copy(center);
    camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
    camera.updateProjectionMatrix();
    ctl.update();
  }, [cmd, camera, controls]);
  return null;
}

export function Scene() {
  const select = useApp((s) => s.select);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [PLATE_W / 2 + 230, 260, PLATE_D / 2 + 330], fov: 35, near: 1, far: 60000 }}
      onPointerMissed={() => select(null)}
      gl={{ preserveDrawingBuffer: true }}
    >
      <color attach="background" args={["#eef1f0"]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[PLATE_W / 2 + 150, 520, PLATE_D / 2 + 220]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-500}
        shadow-camera-right={500}
        shadow-camera-top={800}
        shadow-camera-bottom={-500}
        shadow-camera-far={3000}
        shadow-bias={-0.0004}
      />
      <Environment resolution={256}>
        {/* fundo claro do "estúdio": dá o tom prateado ao aço */}
        <mesh scale={100} raycast={() => null}>
          <sphereGeometry args={[1, 32, 16]} />
          <meshBasicMaterial color="#9ea6aa" side={THREE.BackSide} />
        </mesh>
        <Lightformer intensity={2} position={[0, 5, -9]} scale={[10, 10, 1]} />
        <Lightformer intensity={1.2} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer intensity={1.2} position={[10, 1, 0]} rotation-y={-Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[PLATE_W / 2, -3.01, PLATE_D / 2]} receiveShadow raycast={() => null}>
        <planeGeometry args={[8000, 8000]} />
        <shadowMaterial opacity={0.12} />
      </mesh>
      <GroundPlate />
      <ModelView />
      <GhostView />
      <Markers />
      <Placement />
      <CameraRig />
      <OrbitControls
        makeDefault
        target={[PLATE_W / 2, 40, PLATE_D / 2]}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={40}
        maxDistance={12000}
        screenSpacePanning
      />
    </Canvas>
  );
}
