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
import { supportCandidate } from "../core/snapping";
import { type Vec3 } from "../core/model";
import { STIFF_TOOL } from "../core/rope";
import { len, sub } from "../core/model";
import { freeOn, inclineOn, panelOpen, useApp, workingModel } from "../ui/store";
import { M, toWorld } from "../render/units";
import { PROPS_W } from "../render/Scene";
import { freshCmd, makeCtx } from "./ctx";
import { AXES_PX, CLICK_PX, DRAG_PX, GIZMO_PX, guidesFor } from "./queries";
import { pickSupport, reachStep } from "./steps/support";
import { freeBar, linkStep, sphereUnder, triangleStep } from "./steps/bars";
import { mclipStep, ringStep, ropeStep, stiffStep } from "./steps/rope";
import { boxSelect } from "./steps/box";
import { moveStep } from "./steps/move";
import { logError } from "../ui/errorlog";
import { spotStep } from "./steps/place";

// as consultas com cache continuam saindo daqui (Scene e outros importam de "interaction/Placement")
export { barGuidesFor, candidatesFor, globalFor, guidesFor, locusStatusFor, nodeOptionsFor, pathFor, reachFor, ropeRefsFor } from "./queries";

export function Placement() {
  const { camera, gl, controls } = useThree();
  const down = useRef<{ x: number; y: number } | null>(null);

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
    const ctx = makeCtx(camera, el);
    const cmd = ctx.cmd;
    const { toScreen, insideOf, planeHit, markHover } = ctx;

    const inGizmo = (ev: PointerEvent, rect: DOMRect) => {
      const s = useApp.getState();
      const off = panelOpen(s) ? PROPS_W : 0; // painel aberto: o cubo se afasta
      return (ev.clientX > rect.right - off - GIZMO_PX && ev.clientX < rect.right - off && ev.clientY < rect.top + GIZMO_PX) || // cubo de vistas
      (ev.clientX < rect.left + AXES_PX && ev.clientY > rect.bottom - AXES_PX); // eixos X, Y, Z
    };

    const update = (ev: PointerEvent) => {
      // o "clique escolhe a esfera" de uma ligação só vale no mesmo movimento do cursor: zera sempre, e a ligação
      // (linkStep/ropeStep) liga de novo se for o caso. Antes ficava do comando anterior e o clique só trocava a esfera
      // de partida, sem colocar nada (ex.: depois de ligar uma mola, o caminho azul ou outra peça não aceitavam o clique).
      cmd.linkPick = null;
      cmd.linkGhost = null;
      cmd.ballPick = null;
      const st = useApp.getState();
      const rect = el.getBoundingClientRect();
      if (st.ballHover && !(st.tool.kind === "place" && catalog.pieces[st.tool.code]?.type === "rope")) useApp.setState({ ballHover: null });
      if (cmd.boxStart && st.tool.kind === "select") {
        if (st.box || Math.hypot(ev.clientX - cmd.boxStart.x, ev.clientY - cmd.boxStart.y) > DRAG_PX) {
          st.setBox({ x0: cmd.boxStart.x, y0: cmd.boxStart.y, x1: ev.clientX, y1: ev.clientY });
        }
        return;
      }

      // arrastar uma peça selecionada → começa a mover
      if (st.tool.kind === "select" && st.pendingDrag) {
        if (Math.hypot(ev.clientX - st.pendingDrag.x, ev.clientY - st.pendingDrag.y) > DRAG_PX) {
          st.setPendingDrag(null);
          // arrastar uma peça: a estrutura inteira; Alt + arrastar um nó: só o nó
          if (ev.altKey && st.selection?.kind === "node") st.startMoveNode(true);
          else if (st.multi.length) st.startMoveSelection();
          else st.startMoveStructure(true);
        } else return;
      }
      const tool = useApp.getState().tool;
      if (tool.kind === "select") return;
      const offScene = !insideOf(ev, rect) || (!tool.viaDrag && !!(ev.target as HTMLElement | null)?.closest?.(".props, .dock, .summary-tab, .palette, .palette-mini-wrap"));
      if (offScene && st.toolHover) markHover(null);
      if (!insideOf(ev, rect)) return st.setGhost(null, tool.viaDrag ? "Solte a peça sobre a cena." : st.hint);
      // cursor sobre o painel da direita, a barra de baixo ou a aba do resumo (por cima da cena): sem fantasma
      if (!tool.viaDrag && (ev.target as HTMLElement | null)?.closest?.(".props, .dock, .summary-tab")) return st.setGhost(null, st.hint);
      const model = workingModel(useApp.getState());


      // ---- mexer peças (caminho azul, arraste livre, mover a estrutura) e colar ----
      if (tool.kind === "moveNode" || tool.kind === "moveBody" || tool.kind === "moveGroup" || tool.kind === "paste") return moveStep(ctx, ev, rect);

      const code = tool.code;
      const inv = tool.moving ? { ...st.inventory, unlimited: true } : st.inventory;

      // ---- Kit 3: enrijecedor (clique numa mola) e cabo (clique numa esfera e depois em outra) ----
      if (code === STIFF_TOOL) return stiffStep(ctx, ev, rect, model, inv);
      if (code === "RING-P" || code === "RING-M") return ringStep(ctx, ev, rect, model, code, inv);
      if (code === "MCLIP-C") return mclipStep(ctx, ev, rect, model, inv);
      if (catalog.pieces[code]?.type === "rope") return void ropeStep(ctx, ev, rect, model, code, inv);

      // ---- ligação de base ----
      if (catalog.pieces[code]?.type === "support") {
        const hit = planeHit(ev, rect, 0);
        if (!hit) return st.setGhost(null, "Aponte para a chapa.");
        // perto de uma estrutura: os círculos azuis onde uma mola chega até a GC (clique põe a GC e liga a mola)
        if (st.guides.blue && !tool.moving && reachStep(ctx, ev, rect, model, inv)) return;
        const choice = pickSupport(ctx, ev, rect, { x: hit.x / M, z: hit.z / M }, guidesFor(model, inv));
        if (!choice.pos) return st.setGhost(null, choice.hint);
        const cand = supportCandidate(catalog, inv, model, choice.pos);
        return st.setGhost({ kind: "cand", cand }, cand.check.ok ? choice.hint : cand.check.errors[0]);
      }

      // ---- barras: pontos amarelos (triângulos) ----
      if (catalog.pieces[code]?.type === "bar" && st.guides.yellow && !tool.moving) {
        if (triangleStep(ctx, ev, rect, model, code, inv)) return;
      } else if (st.triAnchor) useApp.setState({ triAnchor: null });

      // ---- barra Livre: a esfera sob o cursor vira a partida (antes a ligação de dois cliques tomava a esfera e a barra
      //      livre nunca começava com a peça escolhida por clique na paleta) ----
      if (freeOn(st) && catalog.pieces[code]?.type === "bar" && !tool.moving) {
        const on = sphereUnder(ctx, ev, rect, model);
        const cur = cmd.freeAnchor ? model.nodes[cmd.freeAnchor] : undefined;
        const L = catalog.pieces[code].spanM?.[0] ?? 0;
        const closes = !!(on && cur && Math.abs(len(sub(model.nodes[on].pos, cur.pos)) - L) <= catalog.settings.tolerancia_encaixe_mm / M);
        if (on && !cmd.freeHold && !closes) cmd.freeAnchor = on;
      }

      // ---- ligar duas esferas: clique numa esfera e depois em outra ----
      const ptype = catalog.pieces[code]?.type;
      if ((ptype === "bar" || ptype === "cable") && !tool.moving && !tool.viaDrag) {
        if (linkStep(ctx, ev, rect, model, code, inv)) return;
      } else if (st.linkFrom) useApp.setState({ linkFrom: null });

      // ---- barras no modo Livre ----
      if (freeOn(st) && catalog.pieces[code]?.type === "bar") return freeBar(ctx, ev, rect, model, code, inv);


      // ---- demais peças: ponto de encaixe mais próximo ----
      return spotStep(ctx, ev, rect, model, code, inv);
    };

    const onDown = (ev: PointerEvent) => {
      if (ev.target !== el) return;
      down.current = { x: ev.clientX, y: ev.clientY };
      const st = useApp.getState();
      // botão esquerdo em modo seleção: começa um retângulo (a não ser que esteja arrastando uma peça selecionada)
      if (ev.button === 0 && st.tool.kind === "select" && !st.pendingDrag && !inGizmo(ev, el.getBoundingClientRect())) {
        cmd.boxStart = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey };
      }
    };
    const onUp = (ev: PointerEvent) => {
      const st = useApp.getState();
      if (st.pendingDrag) st.setPendingDrag(null);
      if (cmd.boxStart) {
        const b = st.box;
        const shift = cmd.boxStart.shift;
        cmd.boxStart = null;
        if (b) {
          st.setBox(null);
          boxSelect(ctx, b, shift);
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
        if (!ok && (now.tool.kind === "moveGroup" || now.tool.kind === "moveNode" || now.tool.kind === "moveBody" || ((now.tool.kind === "place" || now.tool.kind === "paste") && now.tool.moving))) {
          now.disarm(); // movimento cancelado: nada mudou
          now.setGhost(null, "Movimento cancelado: o lugar não era válido.");
        } else if (now.tool.kind !== "select") now.disarm();
        return;
      }
      const d = down.current;
      down.current = null;
      if (!inside || !d || Math.hypot(d.x - ev.clientX, d.y - ev.clientY) > CLICK_PX) return; // foi giro de câmera
      clickAt(ev);
    };

    /** Clique da colocação (também o Enter, no lugar do cursor). */
    const clickAt = (ev: PointerEvent) => {
      update(ev);
      // clique numa esfera: escolhe a primeira da ligação (ou cancela, se for a mesma)
      if (cmd.linkPick) {
        const cur = useApp.getState().linkFrom;
        useApp.setState({ linkFrom: cur === cmd.linkPick ? null : cmd.linkPick, ropeBall: null });
        update(ev);
        return;
      }
      if (cmd.ballPick) {
        const cur = useApp.getState().ropeBall;
        useApp.setState({ ropeBall: cur && len(sub(cur.pos, cmd.ballPick.pos)) < 1e-6 ? null : cmd.ballPick, linkFrom: null });
        update(ev);
        return;
      }
      const wasLink = cmd.linkGhost;
      const ok = useApp.getState().commitGhost();
      if (ok && (wasLink || useApp.getState().linkFrom || useApp.getState().ropeBall)) useApp.setState({ linkFrom: null, ropeBall: null });
      // depois de colocar, recalcula o fantasma no mesmo lugar
      update(ev);
      if (ok && wasLink) {
        useApp.setState({ hint: wasLink.moved ? `Ligado. A segunda esfera andou ${wasLink.moved.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} M e as molas dela giraram (Ctrl+Z desfaz).` : "Ligado." });
      }
    };

    /**
     * Estado de um comando (Tab, ligação, barra livre, GC, retângulo) que não pode passar para o comando seguinte: todo
     * ele mora em `cmd` (ctx.ts), e zerar é voltar ao `freshCmd()`. Campo novo em `Cmd` já entra aqui sozinho.
     */
    const resetCommand = () => Object.assign(cmd, freshCmd());

    /**
     * Um erro no meio de um gesto não pode travar a montagem: sem esta guarda, o mesmo erro se repetia a cada movimento
     * do mouse e nenhum clique valia até recarregar a página. Aqui o comando recomeça limpo e o rodapé avisa.
     */
    let lastError = 0;
    const guard = <A extends unknown[]>(name: string, fn: (...a: A) => void) => (...a: A) => {
      try {
        fn(...a);
      } catch (err) {
        console.error(`[siMOLAdor] erro em ${name}:`, err);
        logError(name, err);
        resetCommand();
        const now = performance.now();
        const st = useApp.getState();
        // dois erros seguidos em pouco tempo: solta a peça da mão (o modelo não muda)
        if (now - lastError < 1500 && st.tool.kind !== "select") st.disarm();
        lastError = now;
        useApp.setState({ ghost: null, hint: "Algo deu errado neste ponto e o comando recomeçou (nada foi perdido). Se repetir, Esc e tente de novo." });
      }
    };

    // Gancho de teste/depuração: projeta posições do modelo (módulos) para a tela.
    (window as unknown as Record<string, unknown>).__simolador = {
      store: useApp,
      project: (p: Vec3) => toScreen(toWorld(p), el.getBoundingClientRect()),
      projectPlate: (x: number, z: number) => toScreen(new THREE.Vector3(x * M, 0, z * M), el.getBoundingClientRect()),
      cameraY: () => camera.position.y,
      catalog,
    };

    // R também atualiza o fantasma sem mexer o mouse
    let lastEv: PointerEvent | null = null;
    const track = (ev: PointerEvent) => ((lastEv = ev), update(ev));
    const safeUpdate = guard("refazer o fantasma", update);

    // Enter = clique: colocando uma peça (ou movendo), vale no lugar do cursor; selecionando, pega a peça sob o cursor
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      // botão com foco: só os da paleta e da barra de baixo cedem o Enter para a cena (os outros continuam valendo)
      if (t?.tagName === "BUTTON") {
        if (!t.closest(".palette, .palette-mini-wrap, .dock")) return;
        t.blur();
      }
      const st = useApp.getState();
      if (st.sheetsOpen || st.helpOpen || st.settingsOpen) return;
      if (st.tool.kind !== "select") {
        if (!lastEv || !insideOf(lastEv, el.getBoundingClientRect())) return;
        ev.preventDefault();
        if (st.tool.viaDrag) useApp.setState({ tool: { ...st.tool, viaDrag: false } as typeof st.tool });
        clickAt(lastEv);
        return;
      }
      const id = st.hoverId;
      if (!id) return;
      const m = st.history.present;
      const kind = m.nodes[id] ? "node" : m.members[id] ? "member" : m.plates[id] ? "plate" : m.connectors[id] ? "connector" : null;
      if (!kind) return;
      ev.preventDefault();
      st.select({ kind, id });
    };
    const unsub = useApp.subscribe((s, p) => {
      const toolChanged = s.tool !== p.tool;
      const placeSame = s.tool.kind === "place" && p.tool.kind === "place" && s.tool.code === p.tool.code;
      const patch: Partial<ReturnType<typeof useApp.getState>> = {};
      const hadTab = !!cmd.nodeTab || !!cmd.triTab;
      // comando novo (outra ferramenta ou outra peça): nada do anterior continua valendo
      if (toolChanged && !placeSame) resetCommand();
      if (toolChanged && !placeSame) {
        if (s.triAnchor) patch.triAnchor = null;
        if (s.linkFrom || s.ropeBall) Object.assign(patch, { linkFrom: null, ropeBall: null });
      }
      // mover só o nó: ao sair ou depois de mexer, o Tab recomeça
      if ((s.history !== p.history || toolChanged) && (hadTab || s.nodeLimits || s.snapCycle) && (p.tool.kind === "moveNode" || p.tool.kind === "moveBody")) {
        cmd.nodeTab = null;
        Object.assign(patch, { snapCycle: 0, nodeLimits: null });
      }
      // depois de colocar a peça, o Tab recomeça do ponto mais perto
      if ((s.history !== p.history || toolChanged) && s.snapCycle && s.tool.kind === "place" && catalog.pieces[s.tool.code]?.type === "bar") {
        cmd.triTab = null;
        patch.snapCycle = 0;
      }
      if (s.history !== p.history || toolChanged || s.barMode !== p.barMode) {
        cmd.freeAnchor = null;
        cmd.freeHold = s.history !== p.history && lastEv ? { x: lastEv.clientX, y: lastEv.clientY } : null;
      }
      if (Object.keys(patch).length) useApp.setState(patch);
      if (lastEv && (s.linkFrom !== p.linkFrom || s.ropeBall !== p.ropeBall || s.rotIndex !== p.rotIndex || s.barMode !== p.barMode || (toolChanged && s.tool.kind === "paste") || s.snapCycle !== p.snapCycle || s.guides !== p.guides || inclineOn(s) !== inclineOn(p) || (s.tool.kind === "moveGroup" && p.tool.kind === "moveGroup" && s.tool.turns !== p.tool.turns) || s.history !== p.history || s.snap !== p.snap || s.ringY !== p.ringY)) {
        safeUpdate(lastEv);
      }
    });

    const onMove = guard("mover o cursor", track);
    const onKeyG = guard("Enter", onKey);
    const onDownG = guard("apertar o botão", onDown);
    const onUpG = guard("clique", onUp);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKeyG);
    window.addEventListener("pointerdown", onDownG);
    window.addEventListener("pointerup", onUpG);
    return () => {
      unsub();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKeyG);
      window.removeEventListener("pointerdown", onDownG);
      window.removeEventListener("pointerup", onUpG);
    };
  }, [camera, gl]);

  return null;
}
