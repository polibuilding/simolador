import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, GizmoHelper, GizmoViewport, Lightformer, Line, OrbitControls } from "@react-three/drei";
import { GizmoHelper as CubeHelperRaw } from "./gizmo/CubeHelper";
import { GizmoViewcube as ViewCubeRaw } from "./gizmo/ViewCube";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { catalog } from "../core/catalog";
import { boardsOf, componentOf, type Model, type Vec3 } from "../core/model";
import { markerPos, type Candidate } from "../core/snapping";
import { boardCorners } from "../core/boards";
import { barGuidesFor, candidatesFor, globalFor, guidesFor, locusStatusFor, nodeOptionsFor, pathFor, Placement } from "../interaction/Placement";
import { locusCirclePoint, locusSpherePoint } from "../core/edit";
import { panelOpen, useApp, useDisplayModel, useModel, inclineOn, workingModel } from "../ui/store";
import type { Sel } from "../core/edit";
import { Bar, GroundConnection, Sphere, type Look } from "./pieces/pieces";
import { Cable, ContinuousConnector, PlateMesh, RigidConnector, Rope } from "./pieces/more";
import { COLORS, M, PLATE_D, PLATE_W, toWorld } from "./units";
import { Boards } from "./Boards";
import { SnapshotHook } from "./snapshot";

const typeOf = (code: string) => catalog.pieces[code]?.type;

/** Desenha um modelo. `lookOf` decide a aparência de cada peça; `interactive` liga seleção e arraste. */
function ModelGroup({
  model, lookOf, interactive, hidden,
}: { model: Model; lookOf: (id: string) => Look; interactive: boolean; hidden?: Set<string> }) {
  const { select, toggleMulti, setHover, setPendingDrag } = useApp.getState();
  const selection = useApp((s) => s.selection);
  const handlers = (kind: Sel["kind"], id: string) =>
    interactive
      ? {
          onPick: (e: { delta: number; stopPropagation: () => void; nativeEvent: MouseEvent }) => {
            if (e.delta > 4) return;
            // colocando peças: o clique é da colocação (ligar esferas, pontos), não seleciona
            if (useApp.getState().tool.kind !== "select") return;
            e.stopPropagation();
            if (e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) toggleMulti({ kind, id });
            else select({ kind, id });
          },
          onHover: (over: boolean) => setHover(over ? id : null),
          onDown: (e: { button: number; stopPropagation: () => void; nativeEvent: PointerEvent }) => {
            // segurar e arrastar uma peça = mover a estrutura dela (a peça já fica selecionada)
            const st = useApp.getState();
            if (e.button !== 0 || st.tool.kind !== "select") return;
            const n = e.nativeEvent;
            if (n.shiftKey || n.ctrlKey || n.metaKey) return;
            e.stopPropagation();
            const inMulti = st.multi.some((x) => x.id === id);
            if (!inMulti && selection?.id !== id) select({ kind, id });
            setPendingDrag({ x: n.clientX, y: n.clientY });
          },
          onDouble: (e: { stopPropagation: () => void }) => {
            // duplo clique: move só esta peça (esfera: pelo caminho possível; barra, placa, ligação: para outro lugar)
            const st = useApp.getState();
            if (st.tool.kind !== "select") return;
            e.stopPropagation();
            st.setPendingDrag(null);
            select({ kind, id });
            // esfera: só ela anda; mola, diagonal ou placa: o conjunto gira em torno das GC; ligação: vai para outro lugar
            // ligação: vai para outro lugar; o resto: a peça anda e a estrutura acompanha (ou trava)
            if (kind === "connector") useApp.getState().startMove(false);
            else useApp.getState().startMoveBody();
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
        ) : typeOf(m.code) === "rope" ? (
          <Rope key={m.id} a={pos[m.a]} b={pos[m.b]} look={lookOf(m.id)} {...handlers("member", m.id)} />
        ) : (
          <Bar key={m.id} a={pos[m.a]} b={pos[m.b]} code={m.code} stiff={!!m.stiff} look={lookOf(m.id)} {...handlers("member", m.id)} />
        ),
      )}
      {Object.values(model.plates).map((p) => (
        <PlateMesh key={p.id} corners={p.corners.map((c) => pos[c])} code={p.code} look={lookOf(p.id)} {...handlers("plate", p.id)} />
      ))}
      {Object.values(model.connectors).map((c) =>
        c.code === "RC90" ? (
          <RigidConnector key={c.id} at={pos[c.node]} dirs={c.dirs} base={c.base} look={lookOf(c.id)} {...handlers("connector", c.id)} />
        ) : (
          <ContinuousConnector key={c.id} at={pos[c.node]} axis={c.dirs[0]} side={c.side} code={c.code} look={lookOf(c.id)} {...handlers("connector", c.id)} />
        ),
      )}
    </group>
  );
}

function ModelView() {
  const model = useDisplayModel();
  const selection = useApp((s) => s.selection);
  const multi = useApp((s) => s.multi);
  const hoverId = useApp((s) => s.hoverId);
  const toolHover = useApp((s) => s.toolHover);
  const selecting = useApp((s) => s.tool.kind === "select");
  const groupGhost = useApp((s) => (s.ghost?.kind === "group" ? s.ghost : null));
  const multiIds = useMemo(() => new Set(multi.map((x) => x.id)), [multi]);
  const lookOf = (id: string): Look =>
    groupGhost?.ids.has(id)
      ? "normal"
      : selection?.id === id || multiIds.has(id)
        ? "selected"
        : (selecting && hoverId === id) || toolHover === id
          ? "hover"
          : "normal";
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
    m.connectors.g = { id: "g", code: c.spec.code, node: "gn", dirs: c.spec.dirs, base: c.spec.base, side: c.spec.side };
  }
  return { model: m };
}

function GhostView() {
  const ghost = useApp((s) => s.ghost);
  const base = useModel();
  if (!ghost) return null;
  if (ghost.kind === "group" && ghost.part) {
    // colar: só as peças novas; esferas que já existem não são redesenhadas
    const look: Look = ghost.check.ok ? "valid" : "invalid";
    const old = new Set(Object.keys(ghost.part.nodes).filter((k) => !ghost.ids.has(k)));
    return <ModelGroup model={ghost.part} lookOf={() => look} interactive={false} hidden={old} />;
  }
  if (ghost.kind === "group") {
    const look: Look = ghost.check.ok ? "valid" : "invalid";
    // só o que se move (e as barras presas a ele); as esferas fixas nas pontas já estão na cena
    const ids = ghost.ids;
    const g = ghost.model;
    const members = Object.fromEntries(Object.entries(g.members).filter(([, m]) => ids.has(m.a) || ids.has(m.b)));
    // placas que se mexem (algum canto anda): por exemplo, a placa apoiada em duas GC girando junto com o pórtico
    const plates = Object.fromEntries(Object.entries(g.plates).filter(([, p]) => p.corners.some((c) => ids.has(c))));
    const used = new Set<string>([...ids]);
    for (const m of Object.values(members)) (used.add(m.a), used.add(m.b));
    for (const p of Object.values(plates)) p.corners.forEach((c) => used.add(c));
    const part: Model = {
      ...g,
      nodes: Object.fromEntries(Object.entries(g.nodes).filter(([k]) => used.has(k))),
      members,
      plates,
      connectors: Object.fromEntries(Object.entries(g.connectors).filter(([, c]) => ids.has(c.node))),
    };
    const fixedEnds = new Set([...used].filter((k) => !ids.has(k)));
    return <ModelGroup model={part} lookOf={() => look} interactive={false} hidden={fixedEnds} />;
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
  const inclined = useApp(inclineOn);
  const model = useApp((s) => workingModel(s));
  const ref = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const blueRef = useRef<THREE.InstancedMesh>(null);
  const yellowRef = useRef<THREE.InstancedMesh>(null);
  const orangeRef = useRef<THREE.InstancedMesh>(null);
  const code = tool.kind === "place" ? tool.code : null;
  // GC: pontos azuis (a um vão de barra de outra GC) e amarelos (vértice de triângulo), nos dois modos de encaixe
  const present = useApp((s) => s.history.present);
  const show = useApp((s) => s.guides);
  const triAnchor = useApp((s) => s.triAnchor);
  const { blue, yellow, orange = [], guideKeys } = useMemo((): { blue: THREE.Vector3[]; yellow: THREE.Vector3[]; orange?: THREE.Vector3[]; guideKeys: Set<string> } => {
    const empty = { blue: [] as THREE.Vector3[], yellow: [] as THREE.Vector3[], orange: [] as THREE.Vector3[], guideKeys: new Set<string>() };
    let guides;
    // barras: pontos amarelos da esfera de partida (vértices de triângulos com esferas vizinhas)
    if (code && catalog.pieces[code]?.type === "bar" && tool.kind === "place" && !tool.moving) {
      if (!show.yellow || !triAnchor || !model.nodes[triAnchor]) return empty;
      const g = barGuidesFor(model, code, inventory, triAnchor);
      return {
        blue: [],
        yellow: g.filter((x) => x.closes.length < 2).map((x) => toWorld(x.pos)),
        orange: g.filter((x) => x.closes.length >= 2).map((x) => toWorld(x.pos)),
        guideKeys: new Set(g.map((x) => x.pos.join(","))),
      };
    }
    if (code && catalog.pieces[code]?.type === "support") {
      const inv = tool.kind === "place" && tool.moving ? { ...inventory, unlimited: true } : inventory;
      guides = guidesFor(model, inv);
    } else if (tool.kind === "moveGroup" && present.nodes[tool.nodeId]?.kind === "support" && !tool.turns) {
      guides = guidesFor(present, inventory, componentOf(present, tool.nodeId));
    } else return empty;
    const lift = (p: Vec3) => {
      const w = toWorld(p);
      w.y = 0.6;
      return w;
    };
    const on = guides.filter((g) => show[g.kind]);
    return {
      // ponto que é azul e amarelo ao mesmo tempo: desenha só o amarelo
      blue: on.filter((g) => g.kind === "blue" && !(show.yellow && guides!.some((y) => y.kind === "yellow" && y.pos.join() === g.pos.join()))).map((g) => lift(g.pos)),
      yellow: on.filter((g) => g.kind === "yellow").map((g) => lift(g.pos)),
      guideKeys: new Set(on.map((g) => g.pos.join(","))),
    };
  }, [code, model, present, inventory, tool, show, triAnchor]);
  const { dots, rings } = useMemo(() => {
    if (tool.kind === "moveNode") {
      // mover só o nó: o caminho azul já mostra onde ela pode ir; com caminho contínuo, as posições "redondas"
      // continuam valendo como encaixe, mas sem pontos verdes; só sem caminho (travada em pontos) eles aparecem
      if (nodeOptionsFor(present, tool.nodeId).locus?.kind !== "points") return { dots: [] as THREE.Vector3[], rings: [] as THREE.Vector3[] };
      const node = present.nodes[tool.nodeId];
      const { options } = nodeOptionsFor(present, tool.nodeId);
      const dots = options.filter((o) => o.check.ok).map((o) => {
        const w = toWorld(o.pos);
        if (node?.kind === "support") w.y = 0.4;
        return w;
      });
      return { dots, rings: [] as THREE.Vector3[] };
    }
    if (!code || !snap) return { dots: [] as THREE.Vector3[], rings: [] as THREE.Vector3[] };
    const inv = tool.kind === "place" && tool.moving ? { ...inventory, unlimited: true } : inventory;
    const { cands } = candidatesFor(model, code, inv, inclined);
    const occupied = new Set(Object.values(model.nodes).map((n) => n.pos.join(",")));
    const seen = new Set<string>();
    const dots: THREE.Vector3[] = [];
    const rings: THREE.Vector3[] = [];
    for (const c of cands) {
      if (!c.check.ok) continue;
      if (c.kind === "member" && c.inclined && !occupied.has(c.toPos.join(","))) continue; // inclinadas livres: sem ponto
      const p = markerPos(model, c);
      const k = p.join(",");
      if (seen.has(k) || guideKeys.has(k)) continue;
      seen.add(k);
      const w = toWorld(p);
      if (c.kind === "support") w.y = 0.4;
      (occupied.has(k) ? rings : dots).push(w);
    }
    return { dots, rings };
  }, [code, snap, model, inventory, tool, inclined, guideKeys, present]);

  useEffect(() => {
    const m = new THREE.Matrix4();
    dots.forEach((p, i) => ref.current?.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    if (ref.current) (ref.current.count = dots.length), (ref.current.instanceMatrix.needsUpdate = true);
    rings.forEach((p, i) => ringRef.current?.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    if (ringRef.current) (ringRef.current.count = rings.length), (ringRef.current.instanceMatrix.needsUpdate = true);
    for (const [r, list] of [[blueRef, blue], [yellowRef, yellow], [orangeRef, orange]] as const) {
      list.forEach((p, i) => r.current?.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
      if (r.current) (r.current.count = list.length), (r.current.instanceMatrix.needsUpdate = true);
    }
  }, [dots, rings, blue, yellow, orange]);

  const max = 2000;
  return (
    <group raycast={() => null}>
      <instancedMesh ref={ref} args={[undefined, undefined, max]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[2.6, 12, 8]} />
        <meshBasicMaterial color={COLORS.valid} transparent opacity={0.85} depthTest={false} />
      </instancedMesh>
      <instancedMesh ref={blueRef} args={[undefined, undefined, 400]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[3.6, 14, 10]} />
        <meshBasicMaterial color={COLORS.guideBlue} transparent opacity={0.95} depthTest={false} />
      </instancedMesh>
      <instancedMesh ref={yellowRef} args={[undefined, undefined, 400]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[3.6, 14, 10]} />
        <meshBasicMaterial color={COLORS.guideYellow} transparent opacity={0.95} depthTest={false} />
      </instancedMesh>
      <instancedMesh ref={orangeRef} args={[undefined, undefined, 400]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[4.2, 14, 10]} />
        <meshBasicMaterial color={COLORS.guideOrange} transparent opacity={0.95} depthTest={false} />
      </instancedMesh>
      <instancedMesh ref={ringRef} args={[undefined, undefined, max]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[10.5, 20, 14]} />
        <meshBasicMaterial color={COLORS.valid} transparent opacity={0.28} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

/** Halo azul na esfera em destaque: a primeira de uma ligação (dois cliques) ou a que está andando sozinha. */
function LinkMark() {
  const from = useApp((s) => s.linkFrom ?? (s.tool.kind === "moveNode" ? s.tool.nodeId : null));
  const model = useApp((s) => workingModel(s));
  const n = from ? model.nodes[from] : null;
  if (!n) return null;
  return (
    <mesh position={toWorld(n.pos)} raycast={() => null} renderOrder={5}>
      <sphereGeometry args={[12, 24, 16]} />
      <meshBasicMaterial color={COLORS.select} transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
}

/** pedaços seguidos de uma linha com a mesma cor (azul = pode, vermelho = não pode) */
function runs(pts: THREE.Vector3[], ok: boolean[]): { pts: THREE.Vector3[]; ok: boolean }[] {
  const out: { pts: THREE.Vector3[]; ok: boolean }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const last = out[out.length - 1];
    if (last && last.ok === ok[i]) last.pts.push(pts[i]);
    else {
      // emenda: o pedaço novo começa no meio do caminho entre os dois pontos
      if (last) {
        const mid = pts[i - 1].clone().lerp(pts[i], 0.5);
        last.pts.push(mid);
        out.push({ pts: [mid, pts[i]], ok: ok[i] });
      } else out.push({ pts: [pts[i]], ok: ok[i] });
    }
  }
  return out.filter((r) => r.pts.length > 1);
}

/**
 * Caminho possível da esfera que anda sozinha: esfera (uma mola), círculo tracejado (duas) ou pontos.
 * Azul onde ela pode ficar; vermelho onde alguma regra não deixa (ângulo, cruzamento, chapa...).
 * Os limites entre os dois são os pontos para onde o Tab pula.
 */
function NodeLocusView() {
  const tool = useApp((s) => s.tool);
  const present = useApp((s) => s.history.present);
  const tabbed = useApp((s) => s.nodeLimits);
  const path = useMemo(() => pathFor(present, tool), [present, tool]);
  const set = path?.set ?? null;
  const status = useMemo(() => (path && !path.set.locked ? locusStatusFor(present, path.key, path.set) : null), [path, present]);
  const loc = set && !set.locked ? set.locus : undefined;
  const lift = !!path?.lift;
  // conjunto andando num caminho: o rastro das esferas da peça (bem de leve; mostra o "cilindro" que ela varre)
  const trails = useMemo(() => {
    if (tool.kind !== "moveBody") return null;
    const g = globalFor(present, tool.ref);
    return g.mode === "path" ? g.trails.map((t) => t.map(toWorld)) : null;
  }, [tool, present]);
  const w = (p: Vec3) => {
    const v = toWorld(p);
    if (lift) v.y = 0.6;
    return v;
  };
  const circle = useMemo(() => {
    if (loc?.kind !== "circle" || !status?.arcs) return null;
    return status.arcs.map((a) => {
      const n = Math.max(2, Math.ceil(((a.t1 - a.t0) * 180) / Math.PI / 2));
      return { ok: a.ok, pts: Array.from({ length: n + 1 }, (_, k) => w(locusCirclePoint(loc, a.t0 + ((a.t1 - a.t0) * k) / n))) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, status, lift]);
  const sphere = useMemo(() => {
    if (loc?.kind !== "sphere" || !status?.grid) return null;
    const { rows, cols, ok } = status.grid;
    const pos: number[] = [];
    const col: number[] = [];
    const blue = new THREE.Color(COLORS.select);
    const red = new THREE.Color(COLORS.invalid);
    const vtx: THREE.Vector3[] = [];
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= cols; j++) {
        const v = toWorld(locusSpherePoint(loc, (i * Math.PI) / rows, (j * 2 * Math.PI) / cols));
        vtx.push(v);
        pos.push(v.x, v.y, v.z);
        const good = ok[i * (cols + 1) + j];
        const c = good ? blue : red;
        col.push(c.r, c.g, c.b, good ? 0.07 : 0.2);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j;
        const b = a + cols + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4)); // com transparência: o vermelho aparece mais
    geo.setIndex(idx);
    // três anéis: o do meio (horizontal) e dois verticais, pintados pelos mesmos pontos da grade
    const at = (i: number, j: number) => ({ p: vtx[i * (cols + 1) + j], ok: ok[i * (cols + 1) + j] });
    const ringOf = (list: { p: THREE.Vector3; ok: boolean }[]) => runs(list.map((x) => x.p), list.map((x) => x.ok));
    const eq = Array.from({ length: cols + 1 }, (_, j) => at(rows / 2, j));
    const mer = (j1: number, j2: number) => [...Array.from({ length: rows + 1 }, (_, i) => at(i, j1)), ...Array.from({ length: rows }, (_, i) => at(rows - 1 - i, j2))];
    return { geo, rings: [...ringOf(eq), ...ringOf(mer(0, cols / 2)), ...ringOf(mer(cols / 4, (3 * cols) / 4))] };
  }, [loc, status]);
  useEffect(() => () => sphere?.geo.dispose(), [sphere]);
  if (!loc || !status) return null;
  // pontos-limite (para onde o Tab pula): os do círculo sempre; os da esfera, quando o Tab está em uso
  const limits = tabbed?.pts ?? (loc.kind === "circle" || loc.kind === "path" ? status.limits : []);
  const limitDots = limits.map((p, i) => (
    <mesh key={`l${i}`} position={w(p)} raycast={() => null} renderOrder={6}>
      <sphereGeometry args={[tabbed && tabbed.i === i ? 4.6 : 3, 16, 12]} />
      <meshBasicMaterial color={COLORS.select} transparent opacity={tabbed && tabbed.i !== i ? 0.55 : 0.95} depthTest={false} />
    </mesh>
  ));
  if (loc.kind === "sphere" && sphere) {
    return (
      <group raycast={() => null}>
        <mesh geometry={sphere.geo} raycast={() => null} renderOrder={4}>
          <meshBasicMaterial vertexColors transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {sphere.rings.map((r, i) => (
          <Line key={i} points={r.pts} color={r.ok ? COLORS.select : COLORS.invalid} lineWidth={1.2} dashed dashSize={4} gapSize={3} transparent opacity={r.ok ? 0.6 : 0.7} />
        ))}
        {limitDots}
      </group>
    );
  }
  if (loc.kind === "circle" && circle) {
    return (
      <group raycast={() => null}>
        {circle.map((a, i) => (
          <Line key={i} points={a.pts} color={a.ok ? COLORS.select : COLORS.invalid} lineWidth={2} dashed dashSize={5} gapSize={3.5} transparent opacity={a.ok ? 1 : 0.75} />
        ))}
        {limitDots}
      </group>
    );
  }
  if (loc.kind === "path" && status.pathOk) {
    const pts = loc.pts.map(w);
    const segs = runs(loc.closed ? [...pts, pts[0]] : pts, loc.closed ? [...status.pathOk, status.pathOk[0]] : status.pathOk);
    return (
      <group raycast={() => null}>
        {trails?.map((t, i) => t.length > 1 && <Line key={`t${i}`} points={t} color={COLORS.select} lineWidth={1} dashed dashSize={3} gapSize={4} transparent opacity={0.3} />)}
        {segs.map((r, i) => (
          <Line key={i} points={r.pts} color={r.ok ? COLORS.select : COLORS.invalid} lineWidth={2} dashed dashSize={5} gapSize={3.5} transparent opacity={r.ok ? 1 : 0.75} />
        ))}
        {limitDots}
      </group>
    );
  }
  if (loc.kind === "points") {
    return (
      <group raycast={() => null}>
        {loc.pts.map((p, i) => (
          <mesh key={i} position={w(p)} raycast={() => null}>
            <sphereGeometry args={[4, 16, 12]} />
            <meshBasicMaterial color={status.pointsOk?.[i] === false ? COLORS.invalid : COLORS.select} transparent opacity={0.8} depthTest={false} />
          </mesh>
        ))}
      </group>
    );
  }
  return null;
}

/** Chapas (nas pranchas de algumas chapas, só elas aparecem, para a foto da capa). */
function BoardsView() {
  const model = useDisplayModel();
  return <Boards model={model} />;
}

/** Câmera: enquadrar a estrutura e vistas prontas (A = frente, B = esquerda, topo). */
function CameraRig() {
  const cmd = useApp((s) => s.camera);
  const { camera, controls, size } = useThree();
  useEffect(() => {
    if (!controls) return;
    const ctl = controls as unknown as { target: THREE.Vector3; update: () => void };
    const model = useApp.getState().history.present;
    const box = new THREE.Box3();
    for (const b of boardsOf(model)) {
      for (const [x, z] of boardCorners(catalog, b)) {
        box.expandByPoint(new THREE.Vector3(x * M, -3, z * M));
        box.expandByPoint(new THREE.Vector3(x * M, 20, z * M));
      }
    }
    for (const n of Object.values(model.nodes)) box.expandByPoint(toWorld(n.pos));
    box.expandByScalar(25);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const fov = (FOV * Math.PI) / 180;
    const dist = radius / Math.sin(fov / 2);
    const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
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
    if (ortho) {
      // paralela: o zoom faz a esfera que envolve a estrutura caber na tela
      const c = camera as THREE.OrthographicCamera;
      c.zoom = Math.min(size.width, size.height) / (2 * radius);
    }
    camera.updateProjectionMatrix();
    ctl.update();
  }, [cmd, camera, controls]);
  return null;
}

// cópias do drei sem tipos: props livres
const CubeHelper = CubeHelperRaw as unknown as React.FC<Record<string, unknown> & { children?: React.ReactNode }>;
const ViewCube = ViewCubeRaw as unknown as React.FC<Record<string, unknown>>;

/** largura do painel da direita (por cima da cena), em px: o cubo de vistas se afasta dele */
export const PROPS_W = 272;

/** largura da paleta de peças (por cima da cena, à esquerda), em px */
export const PALETTE_W = 210;
/** duração da troca paleta ⇄ menu pequeno (igual à transição do CSS) */
const SLIDE_MS = 260;

/** Número que vai até o alvo suavemente (ease-out), para acompanhar a paleta abrindo e fechando. */
function useEased(target: number, ms = SLIDE_MS) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    if (from === target) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      cur.current = from + (target - from) * (1 - (1 - k) ** 3);
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** quanto da esquerda da cena a paleta cobre agora (anima junto com ela) */
function usePaletteInset() {
  const mini = useApp((s) => s.paletteMini);
  return useEased(mini ? 0 : PALETTE_W);
}

/** quanto da direita da cena o resumo cobre agora (anima junto com ele) */
function usePropsInset() {
  const open = useApp(panelOpen);
  return useEased(open ? PROPS_W : 0);
}

/**
 * A paleta e o resumo ficam por cima da cena (a cena não muda de tamanho ao abrir/fechar). Para a estrutura
 * continuar no meio da parte visível, a imagem desliza meia largura para o lado (view offset da câmera),
 * acompanhando a animação.
 */
function PaletteShift() {
  const left = usePaletteInset();
  const right = usePropsInset();
  const inset = left - right;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera | THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  useFrame(() => {
    const off = -inset / 2;
    const v = camera.view;
    if (v && v.enabled && v.offsetX === off && v.fullWidth === size.width && v.fullHeight === size.height && v.width === size.width) return;
    if (inset === 0 && (!v || !v.enabled)) return;
    if (inset === 0) camera.clearViewOffset();
    else camera.setViewOffset(size.width, size.height, off, 0, size.width, size.height);
  }, -1);
  return null;
}

/** Eixos X, Y, Z no canto de baixo, à esquerda, fora da paleta. */
function AxisGizmo() {
  const inset = usePaletteInset();
  return (
    <GizmoHelper alignment="bottom-left" margin={[62 + inset, 62]} renderPriority={2}>
      {/* Z é a altura: o eixo vertical da cena se chama Z (azul) e o de profundidade, Y (verde) */}
      <GizmoViewport axisColors={["#e5484d", "#3d8bff", "#19a974"]} labels={["X", "Z", "Y"]} labelColor="#ffffff" axisHeadScale={0.95} font="bold 17px Arial" />
    </GizmoHelper>
  );
}

/** abertura da câmera em perspectiva (graus) */
const FOV = 35;

/**
 * Vista paralela × perspectiva: troca a câmera da cena mantendo a direção, o alvo e o tamanho aparente
 * (a altura visível no alvo é a mesma nas duas).
 */
function Projection() {
  const ortho = useApp((s) => s.ortho);
  const set = useThree((s) => s.set);
  const get = useThree((s) => s.get);
  const controls = useThree((s) => s.controls);
  const pending = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    const { camera: prev, size } = get();
    const ctl = get().controls as unknown as { target: THREE.Vector3 } | null;
    const target = ctl ? ctl.target.clone() : new THREE.Vector3(PLATE_W / 2, 40, PLATE_D / 2);
    const isOrtho = (prev as THREE.OrthographicCamera).isOrthographicCamera === true;
    if (ortho === isOrtho) return;
    const tanHalf = Math.tan(((FOV / 2) * Math.PI) / 180);
    const dir = prev.position.clone().sub(target);
    let cam: THREE.Camera;
    if (ortho) {
      const visH = 2 * dir.length() * tanHalf;
      const c = new THREE.OrthographicCamera(-size.width / 2, size.width / 2, size.height / 2, -size.height / 2, -60000, 60000);
      c.zoom = size.height / Math.max(1, visH);
      c.position.copy(prev.position);
      cam = c;
    } else {
      const visH = size.height / Math.max(1e-6, (prev as THREE.OrthographicCamera).zoom);
      const d = Math.min(12000, Math.max(40, visH / (2 * tanHalf)));
      const c = new THREE.PerspectiveCamera(FOV, size.width / size.height, 1, 60000);
      c.position.copy(target.clone().add(dir.setLength(d)));
      cam = c;
    }
    cam.up.copy(prev.up);
    cam.lookAt(target);
    (cam as THREE.PerspectiveCamera).updateProjectionMatrix();
    pending.current = target; // os controles nascem de novo com a câmera: o alvo volta no efeito abaixo
    set({ camera: cam as THREE.PerspectiveCamera });
  }, [ortho, get, set]);
  useEffect(() => {
    const ctl = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (!ctl || !pending.current) return;
    ctl.target.copy(pending.current);
    pending.current = null;
    ctl.update();
  }, [controls]);
  return null;
}

/** W A S D giram a vista (15° por toque); com Shift, arrastam. */
function KeyCamera() {
  const { camera, controls } = useThree();
  useEffect(() => {
    const STEP = (15 * Math.PI) / 180;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      const st = useApp.getState();
      if (st.sheetsOpen || st.helpOpen) return;
      const k = e.key.toLowerCase();
      if (k !== "w" && k !== "a" && k !== "s" && k !== "d") return;
      const ctl = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
      if (!ctl) return;
      e.preventDefault();
      const off = camera.position.clone().sub(ctl.target);
      if (e.shiftKey) {
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        const oc = camera as THREE.OrthographicCamera;
        const step = oc.isOrthographicCamera ? ((oc.top - oc.bottom) / oc.zoom) * 0.08 : off.length() * 0.08;
        const d = k === "a" ? right.multiplyScalar(-step) : k === "d" ? right.multiplyScalar(step) : k === "w" ? up.multiplyScalar(step) : up.multiplyScalar(-step);
        camera.position.add(d);
        ctl.target.add(d);
      } else {
        const sph = new THREE.Spherical().setFromVector3(off);
        if (k === "a") sph.theta -= STEP;
        if (k === "d") sph.theta += STEP;
        if (k === "w") sph.phi = Math.max(0.01, sph.phi - STEP);
        if (k === "s") sph.phi = Math.min(Math.PI - 0.01, sph.phi + STEP);
        off.setFromSpherical(sph);
        camera.position.copy(ctl.target).add(off);
      }
      camera.lookAt(ctl.target);
      ctl.update();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera, controls]);
  return null;
}

export function Scene() {
  const select = useApp((s) => s.select);
  const inertia = useApp((s) => s.inertia);
  const render = useApp((s) => s.render);
  const shadows = useApp((s) => s.shadows);
  const ortho = useApp((s) => s.ortho);
  const propsInset = usePropsInset();
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [PLATE_W / 2 + 230, 260, PLATE_D / 2 + 330], fov: FOV, near: 1, far: 60000 }}
      onPointerMissed={(e) => {
        // o clique que encerra um retângulo de seleção não apaga a seleção
        if (performance.now() - useApp.getState().boxEndedAt < 250) return;
        // colocando peças, o clique é da colocação: não mexe na seleção nem apaga a dica
        if (useApp.getState().tool.kind !== "select") return;
        if (!(e.shiftKey || e.ctrlKey || e.metaKey)) select(null);
      }}
      gl={{ preserveDrawingBuffer: true }}
    >
      <color attach="background" args={["#eef1f0"]} />
      <SnapshotHook />
      <ambientLight intensity={render ? 0.35 : 0.55} />
      {/* modo simples: sem reflexos do estúdio; uma luz de céu/chão deixa as peças legíveis */}
      {!render && <hemisphereLight args={["#ffffff", "#9aa3a0", 0.9]} />}
      <directionalLight
        position={[PLATE_W / 2 + 150, 520, PLATE_D / 2 + 220]}
        intensity={render ? 1.6 : 1.1}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-500}
        shadow-camera-right={500}
        shadow-camera-top={800}
        shadow-camera-bottom={-500}
        shadow-camera-far={3000}
        shadow-bias={-0.0004}
      />
      {render && <Environment resolution={256}>
        {/* fundo claro do "estúdio": dá o tom prateado ao aço */}
        <mesh scale={100} raycast={() => null}>
          <sphereGeometry args={[1, 32, 16]} />
          <meshBasicMaterial color="#9ea6aa" side={THREE.BackSide} />
        </mesh>
        <Lightformer intensity={2} position={[0, 5, -9]} scale={[10, 10, 1]} />
        <Lightformer intensity={1.2} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer intensity={1.2} position={[10, 1, 0]} rotation-y={-Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>}
      <mesh visible={shadows} rotation={[-Math.PI / 2, 0, 0]} position={[PLATE_W / 2, -3.01, PLATE_D / 2]} receiveShadow raycast={() => null}>
        <planeGeometry args={[8000, 8000]} />
        <shadowMaterial opacity={0.12} />
      </mesh>
      <BoardsView />
      <ModelView />
      <GhostView />
      <Markers />
      <LinkMark />
      <NodeLocusView />
      <Placement />
      <CameraRig />
      {/* cubo de vistas: segue a projeção da cena (paralela ou perspectiva) */}
      <CubeHelper alignment="top-right" margin={[84 + propsInset, 84]} perspective={!ortho}>
        <group scale={1.35}>
          <ViewCube
            faces={["DIREITA", "ESQUERDA", "TOPO", "BASE", "FRENTE", "TRÁS"]}
            font="600 18px Arial"
            color="#e4e8e6"
            textColor="#3c4644"
            strokeColor="#a9b2af"
            hoverColor="#bfe3d3"
            opacity={1}
          />
        </group>
      </CubeHelper>
      {/* referência de eixos no canto inferior esquerdo; clicar num eixo olha por ele */}
      <AxisGizmo />
      <PaletteShift />
      <Projection />
      <KeyCamera />
      <OrbitControls
        makeDefault
        enableDamping={inertia}
        // esquerdo = selecionar (clique ou retângulo); direito = girar; Shift+direito ou meio = mover; roda = zoom
        mouseButtons={{ LEFT: undefined as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
        target={[PLATE_W / 2, 40, PLATE_D / 2]}
        // sem limite de ângulo: dá para olhar a estrutura por baixo (face BASE do cubo)
        maxPolarAngle={Math.PI - 0.01}
        minPolarAngle={0.01}
        minDistance={40}
        maxDistance={12000}
        screenSpacePanning
      />
    </Canvas>
  );
}
