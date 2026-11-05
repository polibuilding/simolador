// Avisos do programa (1.10.0): "nova versão pronta" (service worker) e "atualizado para vX" depois da troca.
import { useEffect, useState } from "react";
import { VERSION } from "../version";
import { applyUpdate } from "./pwa";
import { useApp } from "./store";

const SEEN_KEY = "simolador:versao-vista";

export function AppNotices() {
  const updateReady = useApp((s) => s.updateReady);
  const [updated, setUpdated] = useState<string | null>(null);
  useEffect(() => {
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen && seen !== VERSION) setUpdated(seen);
      localStorage.setItem(SEEN_KEY, VERSION);
    } catch {
      /* sem armazenamento: sem aviso */
    }
  }, []);
  if (!updateReady && !updated) return null;
  return (
    <div className="app-notice" role="status">
      {updateReady ? (
        <>
          <span>Há uma versão nova do siMOLAdor pronta.</span>
          <button className="primary" onClick={applyUpdate}>Atualizar</button>
          <small>a estrutura fica salva</small>
        </>
      ) : (
        <>
          <span>Atualizado para a versão {VERSION}.</span>
          <button className="ghost" onClick={() => (setUpdated(null), useApp.setState({ settingsOpen: true, settingsTab: "sobre" }))}>Ver novidades</button>
          <button className="ghost app-notice-x" onClick={() => setUpdated(null)} aria-label="Fechar">×</button>
        </>
      )}
    </div>
  );
}
