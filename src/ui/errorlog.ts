// Registro de erros e relatório para a equipe (1.10.0). No app instalado não há console para pedir um print:
// "Copiar relatório" (Configurações › Sobre, ou a tela de erro) junta versão, navegador, placa de vídeo,
// o que está montado e os últimos erros, e vai para a área de transferência.
import { configState } from "../core/catalog";
import { EDITION, VERSION } from "../version";
import { useApp } from "./store";

interface LoggedError {
  when: number;
  where: string;
  message: string;
  stack?: string;
}

const MAX = 15;
const log: LoggedError[] = [];

export function logError(where: string, err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  log.push({ when: Date.now(), where, message: e.message, stack: e.stack?.split("\n").slice(1, 4).join(" | ") });
  if (log.length > MAX) log.shift();
}

export const errorCount = () => log.length;

let started = false;
export function initErrorLog(): void {
  if (started) return;
  started = true;
  window.addEventListener("error", (e) => logError("página", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => logError("promessa", e.reason));
}

function gpu(): string {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "sem WebGL";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return String(name);
  } catch {
    return "desconhecida";
  }
}

/** Texto do relatório (sem dados pessoais: nada do perfil, só o tamanho da estrutura). */
export function errorReport(): string {
  const st = useApp.getState();
  const m = st.history.present;
  const standalone = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
  const offline = !!navigator.serviceWorker?.controller;
  const lines = [
    `siMOLAdor ${VERSION}${EDITION ? ` (${EDITION})` : ""} · relatório de ${new Date().toLocaleString("pt-BR")}`,
    `Endereço: ${location.origin}${location.pathname}${standalone ? " · aberto como app instalado" : ""}${offline ? " · guardado para usar sem internet" : ""}`,
    `Navegador: ${navigator.userAgent}`,
    `Tela: ${screen.width}×${screen.height} (janela ${innerWidth}×${innerHeight}, escala ${devicePixelRatio})`,
    `Placa de vídeo: ${gpu()}`,
    `Configurações próprias: ${configState.applied ? "sim" : "não"}`,
    `Estrutura: ${Object.keys(m.nodes).length} nós, ${Object.keys(m.members).length} peças lineares, ${Object.keys(m.plates).length} placas, ${Object.keys(m.connectors).length} ligações · ferramenta ${st.tool.kind}`,
    `Arquivo: ${st.fileName ?? "nenhum"}${st.dirty ? " (com alterações não salvas)" : ""}`,
    "",
    log.length ? `Últimos erros (${log.length}):` : "Nenhum erro registrado nesta sessão.",
    ...log.map((e) => `- ${new Date(e.when).toLocaleTimeString("pt-BR")} [${e.where}] ${e.message}${e.stack ? ` — ${e.stack}` : ""}`),
  ];
  return lines.join("\n");
}

/** Copia o relatório; se a área de transferência estiver bloqueada, baixa um .txt. */
export async function copyReport(): Promise<"copiado" | "baixado"> {
  const text = errorReport();
  try {
    await navigator.clipboard.writeText(text);
    return "copiado";
  } catch {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = `relatorio-simolador-${VERSION}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return "baixado";
  }
}
