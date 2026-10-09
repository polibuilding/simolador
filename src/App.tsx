import { useEffect } from "react";
import { Scene } from "./render/Scene";
import { Palette } from "./ui/Palette";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { SheetsView } from "./ui/SheetsView";
import { StatusBar } from "./ui/StatusBar";
import { Toolbar } from "./ui/Toolbar";
import { ViewControls } from "./ui/ViewControls";
import { Shortcuts } from "./ui/Shortcuts";
import { GROUPS } from "./ui/Palette";
import { useApp } from "./ui/store";
import { catalog } from "./core/catalog";
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
      if (st.sheetsOpen) {
        if (e.key === "Escape") st.setSheetsOpen(false);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === "Escape" && st.helpOpen) {
        st.setHelpOpen(false);
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
      } else if (st.tool.kind === "paste" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        st.pasteAdjust({ dy: (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 6 : 1) });
      } else if (st.tool.kind === "paste" && !mod && (k === "x" || k === "z")) {
        st.pasteAdjust({ flip: k });
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
      } else if (e.key === "Tab" && !mod && (st.tool.kind === "moveGroup" || (st.tool.kind === "place" && st.tool.code === "GC"))) {
        // pontos de encaixe sobrepostos perto do cursor: Tab escolhe o próximo
        e.preventDefault();
        useApp.setState({ snapCycle: st.snapCycle + 1 });
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
      } else if (!mod && !e.altKey && (k === "1" || k === "2" || k === "3")) {
        // 1 / 2 / 3: direção das barras
        st.setBarMode(k === "1" ? "eixos" : k === "2" ? "passo" : "livre");
      } else if (!mod && (k === "q" || k === "e")) {
        // Q / E: peça vizinha do mesmo grupo (B4 ⇄ B6 ⇄ B12…), só as que existem nos kits
        const groups = GROUPS.map((g) => g.codes.filter((c) => available(catalog, st.inventory, c) > 0));
        st.cyclePiece(k === "e" ? 1 : -1, groups);
      } else if (!mod && k === "g") {
        st.setSnap(!st.snap);
        useApp.setState({ hint: `Grade (pontos verdes) ${!st.snap ? "ligada" : "desligada"} (G).` });
      } else if (!mod && k === "v") {
        st.setGuides({ ...st.guides, blue: !st.guides.blue });
        useApp.setState({ hint: `Pontos azuis (vão) ${!st.guides.blue ? "ligados" : "desligados"} (V).` });
      } else if (!mod && k === "t") {
        st.setGuides({ ...st.guides, yellow: !st.guides.yellow });
        useApp.setState({ hint: `Pontos amarelos e laranja (triângulos) ${!st.guides.yellow ? "ligados" : "desligados"} (T).` });
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

export default function App() {
  useShortcuts();
  const placing = useApp((s) => s.tool.kind !== "select");
  const sheetsOpen = useApp((s) => s.sheetsOpen);
  return (
    <div className={`app${placing ? " placing" : ""}`}>
      <Toolbar />
      <Palette />
      <main className="viewport" aria-label="Cena 3D">
        <Scene />
        <ViewControls />
      </main>
      <PropertiesPanel />
      <StatusBar />
      <SelectBox />
      <Shortcuts />
      {sheetsOpen && <SheetsView />}
    </div>
  );
}
