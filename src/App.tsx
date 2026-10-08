import { useEffect } from "react";
import { Scene } from "./render/Scene";
import { Palette } from "./ui/Palette";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { SheetsView } from "./ui/SheetsView";
import { StatusBar } from "./ui/StatusBar";
import { Toolbar } from "./ui/Toolbar";
import { ViewControls } from "./ui/ViewControls";
import { useApp } from "./ui/store";

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        else st.select(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.selection) {
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
      } else if (!mod && k === "f") {
        st.setCamera("fit");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
      {sheetsOpen && <SheetsView />}
    </div>
  );
}
