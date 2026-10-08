import { useEffect } from "react";
import { Scene } from "./render/Scene";
import { Palette } from "./ui/Palette";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { SheetsView } from "./ui/SheetsView";
import { StatusBar } from "./ui/StatusBar";
import { Toolbar } from "./ui/Toolbar";
import { ViewControls } from "./ui/ViewControls";
import { useApp } from "./ui/store";

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
      if (e.key === "Escape") {
        if (st.tool.kind !== "select") st.disarm();
        else st.select(null); // limpa também a seleção múltipla
      } else if ((e.key === "Delete" || e.key === "Backspace") && (st.selection || st.multi.length)) {
        e.preventDefault();
        st.removeSelected();
      } else if (mod && k === "z" && !e.shiftKey) {
        e.preventDefault();
        st.undo();
      } else if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
        e.preventDefault();
        st.redo();
      } else if (!mod && k === "r") {
        st.rotate();
      } else if (!mod && k === "m" && st.selection) {
        st.startMove(false);
      } else if (!mod && k === "i") {
        st.setIncline(!st.incline);
      } else if (!mod && k === "f") {
        st.setCamera("fit");
      } else if (mod && k === "a") {
        e.preventDefault();
        st.selectAll();
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
      {sheetsOpen && <SheetsView />}
    </div>
  );
}
