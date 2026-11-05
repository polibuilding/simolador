// App instalável e sem internet (1.10.0): registra o service worker (dist/sw.js, gerado no build),
// avisa quando uma versão nova está pronta e guarda o convite de instalação do navegador (Chrome/Edge).
import { allowUnload } from "./files";
import { useApp } from "./store";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let registration: ServiceWorkerRegistration | null = null;
let installPrompt: InstallPrompt | null = null;
let updating = false;

/** O programa está guardado para abrir sem internet? */
export const offlineReady = () => typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;
/** Aberto como app instalado (janela própria)? */
export const isInstalled = () => typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;

export function initPwa(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    useApp.setState({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    useApp.setState({ canInstall: false, hint: "siMOLAdor instalado: ele aparece no menu de programas e abre sem internet." });
  });
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  // a troca de versão só recarrega a página quando o usuário pediu (na primeira instalação, não)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updating) location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        registration = reg;
        const ready = () => navigator.serviceWorker.controller && useApp.setState({ updateReady: true });
        if (reg.waiting) ready();
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => w.state === "installed" && ready());
        });
        // procura versão nova de hora em hora e quando a janela volta a ficar visível
        setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
        document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void reg.update().catch(() => {}));
      })
      .catch((e) => console.warn("[siMOLAdor] não deu para preparar o modo sem internet", e));
  });
}

/** "Atualizar": a versão nova assume e a página recarrega (a estrutura está no salvamento automático). */
export function applyUpdate(): void {
  const w = registration?.waiting;
  if (!w) return location.reload();
  updating = true;
  allowUnload();
  w.postMessage("atualizar");
}

export async function promptInstall(): Promise<void> {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  useApp.setState({ canInstall: false });
}
