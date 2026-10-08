import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { Placement } from "../interaction/Placement";
import { useApp, useModel } from "../ui/store";
import { Bar, GroundConnection, GroundPlate, Sphere, type Look } from "./pieces/pieces";
import { PLATE_D, PLATE_W, toWorld } from "./units";

function ModelView() {
  const model = useModel();
  const selection = useApp((s) => s.selection);
  const hoverId = useApp((s) => s.hoverId);
  const selecting = useApp((s) => s.tool.kind === "select");
  const { select, setHover } = useApp.getState();

  const look = (id: string): Look =>
    selection?.id === id ? "selected" : selecting && hoverId === id ? "hover" : "normal";
  const handlers = (kind: "node" | "member", id: string) =>
    selecting
      ? {
          onPick: (e: { delta: number; stopPropagation: () => void }) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            select({ kind, id });
          },
          onHover: (over: boolean) => setHover(over ? id : null),
        }
      : {};

  const nodes = Object.values(model.nodes);
  const positions = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, toWorld(n.pos)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model.nodes],
  );

  return (
    <group>
      {nodes.map((n) =>
        n.kind === "support" ? (
          <GroundConnection key={n.id} position={positions[n.id]} look={look(n.id)} {...handlers("node", n.id)} />
        ) : (
          <Sphere key={n.id} position={positions[n.id]} look={look(n.id)} {...handlers("node", n.id)} />
        ),
      )}
      {Object.values(model.members).map((m) => (
        <Bar key={m.id} a={positions[m.a]} b={positions[m.b]} code={m.code} look={look(m.id)} {...handlers("member", m.id)} />
      ))}
    </group>
  );
}

function GhostView() {
  const ghost = useApp((s) => s.ghost);
  const model = useModel();
  if (!ghost) return null;
  const look: Look = ghost.check.ok ? "valid" : "invalid";
  const end = toWorld(ghost.toPos);
  if (!ghost.fromId) return <GroundConnection position={end} look={look} />;
  const from = model.nodes[ghost.fromId];
  if (!from) return null;
  const hasNode = Object.values(model.nodes).some(
    (n) => Math.abs(n.pos[0] - ghost.toPos[0]) + Math.abs(n.pos[1] - ghost.toPos[1]) + Math.abs(n.pos[2] - ghost.toPos[2]) < 1e-4,
  );
  return (
    <group>
      <Bar a={toWorld(from.pos)} b={end} code={ghost.code} look={look} />
      {!hasNode && <Sphere position={end} look={look} />}
    </group>
  );
}

export function Scene() {
  const select = useApp((s) => s.select);
  const target: [number, number, number] = [PLATE_W / 2, 40, PLATE_D / 2];
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [PLATE_W / 2 + 230, 260, PLATE_D / 2 + 330], fov: 35, near: 1, far: 5000 }}
      onPointerMissed={() => select(null)}
      gl={{ preserveDrawingBuffer: true }}
    >
      <color attach="background" args={["#eef1f0"]} />
      <fog attach="fog" args={["#eef1f0", 900, 2200]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[PLATE_W / 2 + 150, 420, PLATE_D / 2 + 220]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[PLATE_W / 2, -3.01, PLATE_D / 2]} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <shadowMaterial opacity={0.12} />
      </mesh>
      <GroundPlate />
      <ModelView />
      <GhostView />
      <Placement />
      <OrbitControls makeDefault target={target} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={60} maxDistance={1600} />
    </Canvas>
  );
}
