import { useApp, type CameraView } from "./store";

const VIEWS: { v: CameraView; label: string; title: string }[] = [
  { v: "fit", label: "Enquadrar", title: "Mostra a estrutura inteira (F)" },
  { v: "iso", label: "3D", title: "Vista em perspectiva" },
  { v: "front", label: "Frente", title: "Como a Vista A da prancha" },
  { v: "side", label: "Lado", title: "Como a Vista B da prancha" },
  { v: "top", label: "Topo", title: "Planta" },
];

/** Botões de câmera sobre a cena. */
export function ViewControls() {
  const setCamera = useApp((s) => s.setCamera);
  return (
    <nav className="view-controls" aria-label="Câmera">
      {VIEWS.map(({ v, label, title }) => (
        <button key={v} onClick={() => setCamera(v)} title={title}>
          {label}
        </button>
      ))}
    </nav>
  );
}
