import { useEffect } from "react";
import { Scene } from "./render/Scene";
import { Palette } from "./ui/Palette";
import { PropertiesPanel, SelectionTag, SummaryTab } from "./ui/PropertiesPanel";
import { SheetsView } from "./ui/SheetsView";
import { HintLine, VersionTag } from "./ui/StatusBar";
import { Dock } from "./ui/Dock";
import { Toolbar } from "./ui/Toolbar";
import { Shortcuts } from "./ui/Shortcuts";
import { AdvancedConfig } from "./ui/Config";
import { GROUPS, PaletteMini } from "./ui/Palette";
import { panelOpen, useApp } from "./ui/store";
import { catalog, configState, markConfigBootOk } from "./core/catalog";
import { available } from "./core/inventory";

/** Retângulo de seleção: azul = só o que está inteiro dentro; verde tracejado = o que tocar. */
function SelectBox() {
  const box = useApp((s) => s.box);
  if (!box) return null;
  const crossing = box.x1 < box.x0;
  return (
    <div
      className={`select-box${crossing ? " crossing" : ""}`}
      style={{
        left: Math.min(box.x0, box.x1),
        top: Math.min(box.y0, box.y1),
        width: Math.abs(box.x1 - box.x0),
        height: Math.abs(box.y1 - box.y0),
      }}
    />
  );
}

function useShortcuts() {
  useEffect(() => {
    const onShift = (e: KeyboardEvent) => useApp.getState().setShiftHeld(e.shiftKey);
    const onBlur = () => useApp.getState().setShiftHeld(false);
    const onKey = (e: KeyboardEvent) => {
      onShift(e);
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      const st = useApp.getState();
      if (st.settingsOpen) return; // janela de configurações aberta: as teclas são dela
      if (st.sheetsOpen) {
        if (e.key === "Escape") st.setSheetsOpen(false);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      // Esc fecha o resumo aberto pelo duplo clique (e segue: cancela o que estiver em andamento)
      // Esc sempre fecha o resumo, se estiver aberto (e segue: cancela o que estiver em andamento)
      if (e.key === "Escape" && (st.propsOpen || st.propsPeek)) {
        st.setPropsOpen(false);
        useApp.setState({ propsPeek: false });
      }
      // C abre e fecha o resumo, em qualquer momento (até no meio de um comando)
      if (!mod && !e.altKey && k === "c" && st.tool.kind !== "paste") {
        const open = st.propsOpen || st.propsPeek;
        st.setPropsOpen(!open);
        useApp.setState({ propsPeek: false });
        return;
      }
      if (e.key === "Escape" && st.helpOpen) {
        st.setHelpOpen(false);
      } else if (e.key === "Escape" && st.linkFrom) {
        // primeiro Esc: só cancela a ligação começada
        useApp.setState({ linkFrom: null, hint: "Ligação cancelada." });
      } else if (e.key === "Escape") {
        if (st.tool.kind !== "select") st.disarm();
        else st.select(null); // limpa também a seleção múltipla
      } else if ((e.key === "Delete" || e.key === "Backspace") && (st.selection || st.multi.length)) {
        e.preventDefault();
        st.removeSelected();
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.selectedBoard) {
        e.preventDefault();
        st.removeSelectedBoard();
      } else if (mod && k === "s") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("simolador:salvar"));
      } else if (mod && k === "o") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("simolador:abrir"));
      } else if (mod && k === "c") {
        st.copySelection();
      } else if (mod && k === "x" && (st.selection || st.multi.length)) {
        e.preventDefault();
        st.startMoveSelection();
      } else if (mod && k === "v") {
        e.preventDefault();
        st.startPaste();
      } else if (st.tool.kind === "select" && st.selectedBoard && e.key.startsWith("Arrow")) {
        // chapa selecionada: as setas movem nos eixos dela (1 M; Shift: 6 M; Alt ou Ctrl: 1/4 M)
        e.preventDefault();
        const step = e.shiftKey ? 6 : e.altKey || mod ? 0.25 : 1;
        const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        st.nudgeBoards(d[e.key]);
      } else if (st.tool.kind === "paste" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        st.pasteAdjust({ dy: (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 6 : 1) });
      } else if (st.tool.kind === "paste" && !mod && (k === "x" || k === "y" || k === "z")) {
        // na tela Z é a altura: Y espelha no eixo y da tela (o z do modelo); Z continua valendo como antes
        st.pasteAdjust({ flip: k === "x" ? "x" : "z" });
      } else if (mod && k === "z" && !e.shiftKey) {
        e.preventDefault();
        st.undo();
      } else if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
        e.preventDefault();
        st.redo();
      } else if (!mod && k === "r") {
        st.rotate();
      } else if (!mod && k === "n" && st.selection?.kind === "node") {
        st.startMoveNode(false);
      } else if (!mod && k === "m" && st.multi.length) {
        st.startMoveSelection();
      } else if (!mod && k === "m" && st.selection) {
        st.startMove(false);
      } else if (e.key === "Tab" && !mod && (st.tool.kind === "moveNode" || st.tool.kind === "moveBody")) {
        // mover só o nó: Tab pula entre os limites azul ↔ vermelho do caminho (Shift+Tab volta)
        e.preventDefault();
        const next = st.snapCycle + (e.shiftKey ? -1 : 1);
        useApp.setState({ snapCycle: next || (e.shiftKey ? -1 : 1) });
      } else if (e.key === "Tab" && !mod && (st.tool.kind === "moveGroup" || (st.tool.kind === "place" && st.tool.code === "GC"))) {
        // pontos de encaixe sobrepostos perto do cursor: Tab escolhe o próximo
        e.preventDefault();
        useApp.setState({ snapCycle: st.snapCycle + 1 });
      } else if (e.key === "Tab" && !mod && st.tool.kind === "place" && catalog.pieces[st.tool.code]?.type === "bar" && st.guides.yellow && st.triAnchor) {
        // barras sobre uma esfera: Tab percorre os pontos amarelos e laranja dela (Shift+Tab volta)
        e.preventDefault();
        useApp.setState({ snapCycle: st.snapCycle + (e.shiftKey ? -1 : 1) });
      } else if (e.key === "Tab" && !mod && (st.tool.kind === "place" || st.tool.kind === "paste")) {
        // colocando uma peça: Tab dá a próxima opção (o mesmo que R)
        e.preventDefault();
        st.rotate();
      } else if (!mod && e.key === " ") {
        e.preventDefault();
        st.repeatLast();
      } else if (!mod && k === "i") {
        // I: eixos → 15° → livre → eixos
        st.setBarMode(st.barMode === "eixos" ? "passo" : st.barMode === "passo" ? "livre" : "eixos");
      } else if (!mod && k === "f") {
        st.setCamera("fit");
      } else if (mod && k === "a") {
        e.preventDefault();
        st.selectAll();
      } else if (!mod && !e.altKey && (k === "4" || k === "5" || k === "6")) {
        // 4 / 5 / 6: direção das barras (eixos, passo, livre)
        st.setBarMode(k === "4" ? "eixos" : k === "5" ? "passo" : "livre");
      } else if (!mod && (k === "q" || k === "e")) {
        // Q / E: peça vizinha do mesmo grupo (B4 ⇄ B6 ⇄ B12…), só as que existem nos kits
        const groups = GROUPS.map((g) => g.codes.filter((c) => available(catalog, st.inventory, c) > 0));
        st.cyclePiece(k === "e" ? 1 : -1, groups);
      } else if (!mod && !e.altKey && k === "1") {
        // 1 / 2 / 3: as bolinhas do encaixe (verde, azul, amarela), na ordem da barra de baixo
        st.setSnap(!st.snap);
        useApp.setState({ hint: `Grade (pontos verdes) ${!st.snap ? "ligada" : "desligada"} (1).` });
      } else if (!mod && !e.altKey && k === "2") {
        st.setGuides({ ...st.guides, blue: !st.guides.blue });
        useApp.setState({ hint: `Pontos azuis (vão) ${!st.guides.blue ? "ligados" : "desligados"} (2).` });
      } else if (!mod && !e.altKey && k === "3") {
        st.setGuides({ ...st.guides, yellow: !st.guides.yellow });
        useApp.setState({ hint: `Pontos amarelos e laranja (triângulos) ${!st.guides.yellow ? "ligados" : "desligados"} (3).` });
      } else if (!mod && k === "p") {
        st.setOrtho(!st.ortho);
      } else if (!mod && k === "b") {
        st.setInertia(!st.inertia);
      } else if (!mod && (e.key === "?" || k === "h")) {
        st.setHelpOpen(!st.helpOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onShift);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onShift);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}

/** Configurações: a abertura deu certo (o teste passa) e os avisos do que aconteceu com elas. */
function useConfigNotices() {
  useEffect(() => {
    markConfigBootOk();
    const say: string[] = [];
    let applied = false;
    try {
      applied = sessionStorage.getItem("simolador:config-aplicada") === "1";
      sessionStorage.removeItem("simolador:config-aplicada");
    } catch {
      /* nada */
    }
    if (configState.safeMode) say.push("As configurações novas não abriram direito e foram desfeitas: o programa voltou ao padrão.");
    else if (configState.problems.length) say.push(`Configurações deixadas de lado: ${configState.problems[0]}`);
    else if (applied) say.push("Configurações aplicadas.");
    if (configState.rejected.length) say.push(`Valores ignorados nas configurações: ${configState.rejected.slice(0, 4).join(", ")}${configState.rejected.length > 4 ? "…" : ""}.`);
    if (say.length) useApp.setState({ hint: say.join(" ") });
  }, []);
}

export default function App() {
  useShortcuts();
  useConfigNotices();
  const placing = useApp((s) => s.tool.kind !== "select");
  const sheetsOpen = useApp((s) => s.sheetsOpen);
  // o resumo abre e fecha só pelas setas « »; selecionar não o abre (o nome da peça aparece de leve no canto)
  const propsOpen = useApp(panelOpen);
  const mini = useApp((s) => s.paletteMini);
  return (
    <div className={`app${placing ? " placing" : ""}${propsOpen ? " props-open" : ""}${mini ? " palette-mini-on" : ""}`}>
      <Toolbar />
      <Palette hidden={mini} />
      <main className="viewport" aria-label="Cena 3D">
        <Scene />
        {mini && <PaletteMini />}
        <HintLine />
        <Dock />
        <SummaryTab hidden={propsOpen} />
      </main>
      <PropertiesPanel hidden={!propsOpen} />
      <SelectionTag />
      <VersionTag />
      <SelectBox />
      <Shortcuts />
      <AdvancedConfig />
      {sheetsOpen && <SheetsView />}
    </div>
  );
}
