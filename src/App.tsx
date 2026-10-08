import { useEffect } from "react";
import { Scene } from "./render/Scene";
import { Palette } from "./ui/Palette";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { StatusBar } from "./ui/StatusBar";
import { Toolbar } from "./ui/Toolbar";
import { useApp } from "./ui/store";

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      const st = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        if (st.tool.kind === "place") st.disarm();
        else st.select(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.selection) {
        e.preventDefault();
        st.removeSelected();
      } else if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        st.undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        st.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export default function App() {
  useShortcuts();
  const placing = useApp((s) => s.tool.kind === "place");
  return (
    <div className={`app${placing ? " placing" : ""}`}>
      <Toolbar />
      <Palette />
      <main className="viewport" aria-label="Cena 3D">
        <Scene />
      </main>
      <PropertiesPanel />
      <StatusBar />
    </div>
  );
}
