// Arquivos .mola (1.10.0): Salvar no mesmo arquivo, Salvar como, Abrir, Recentes e cópias automáticas.
//
// - No Chrome e no Edge, o navegador deixa o programa guardar uma "alça" do arquivo (API de acesso a arquivos):
//   Salvar grava por cima do mesmo arquivo, sem perguntar de novo. Nos outros navegadores, Salvar baixa o arquivo.
// - Recentes: os últimos arquivos abertos ou salvos, com uma cópia do conteúdo (abre mesmo se a alça não valer mais).
// - Cópias automáticas: antes de trocar de projeto (Novo, Abrir, exemplo) e a cada 5 min de trabalho, o projeto atual
//   vai para uma lista; nada se perde por engano.
import { MolaFileError } from "../core/serialization";
import { idbGet, idbSet } from "./idb";
import { useApp } from "./store";

type PermissionHandle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};
interface PickerWindow {
  showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>;
  launchQueue?: { setConsumer: (fn: (p: { files: FileSystemFileHandle[] }) => void) => void };
}

export interface RecentFile {
  id: string;
  /** nome do projeto (o que sai nas pranchas) */
  name: string;
  /** nome do arquivo no computador */
  fileName: string;
  when: number;
  text: string;
  handle?: FileSystemFileHandle;
}
export interface AutoCopy {
  id: string;
  name: string;
  when: number;
  /** por que a cópia foi feita: "antes de abrir outro arquivo", "a cada 5 min"… */
  why: string;
  pieces: number;
  text: string;
}

const RECENTS = "recentes";
const COPIES = "copias";
const MAX_RECENTS = 8;
const MAX_COPIES = 12;
const COPY_EVERY_MS = 5 * 60 * 1000;
const FILE_KEY = "simolador:arquivo";
const DIRTY_KEY = "simolador:alterado";

const win = () => window as unknown as PickerWindow;
export const canSaveInPlace = () => typeof win().showSaveFilePicker === "function";

/** arquivo em edição: a alça (Chrome/Edge) e o nome */
let current: { handle?: FileSystemFileHandle; fileName: string } | null = null;

const MOLA_TYPES = [{ description: "Projeto do siMOLAdor", accept: { "application/json": [".mola"] } }];

export function fileNameOf(name: string) {
  return `${name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "estrutura"}.mola`;
}

/** Baixa um texto como arquivo (navegadores sem a API de acesso a arquivos). */
export function download(fileName: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const pieceCount = () => {
  const m = useApp.getState().history.present;
  return Object.keys(m.nodes).length + Object.keys(m.members).length + Object.keys(m.plates).length;
};
const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function permitted(h: FileSystemFileHandle, mode: "read" | "readwrite") {
  const p = h as PermissionHandle;
  if (!p.queryPermission) return true;
  if ((await p.queryPermission({ mode })) === "granted") return true;
  return (await p.requestPermission?.({ mode })) === "granted";
}

function setCurrent(c: typeof current) {
  current = c;
  useApp.setState({ fileName: c?.fileName ?? null, dirty: false });
}

// ---------- recentes e cópias ----------

export async function listRecents(): Promise<RecentFile[]> {
  return (await idbGet<RecentFile[]>(RECENTS)) ?? [];
}
export async function listCopies(): Promise<AutoCopy[]> {
  return (await idbGet<AutoCopy[]>(COPIES)) ?? [];
}

async function addRecent(fileName: string, text: string, handle?: FileSystemFileHandle) {
  const name = useApp.getState().name;
  const list = (await listRecents()).filter((r) => r.fileName !== fileName);
  list.unshift({ id: newId(), name, fileName, when: Date.now(), text, ...(handle ? { handle } : {}) });
  // se o navegador não deixar guardar a alça, guarda sem ela (Salvar vai perguntar onde, ao abrir pelos recentes)
  if (!(await idbSet(RECENTS, list.slice(0, MAX_RECENTS)))) await idbSet(RECENTS, list.slice(0, MAX_RECENTS).map(({ handle: _h, ...r }) => r));
}

let lastCopyText = "";
/** Guarda o projeto atual nas cópias automáticas (se tiver alguma peça e mudou desde a última cópia). */
export async function snapshot(why: string): Promise<void> {
  if (pieceCount() === 0) return;
  const st = useApp.getState();
  const text = st.serialize();
  const body = text.replace(/"savedAt": "[^"]*",?/, "");
  if (body === lastCopyText) return;
  lastCopyText = body;
  const list = await listCopies();
  list.unshift({ id: newId(), name: st.name, when: Date.now(), why, pieces: pieceCount(), text });
  await idbSet(COPIES, list.slice(0, MAX_COPIES));
}

// ---------- salvar ----------

/** Salvar (Ctrl+S): grava no mesmo arquivo; na primeira vez, ou com `as` (Ctrl+Shift+S), pergunta onde. */
export async function saveProject(as = false): Promise<void> {
  const st = useApp.getState();
  const text = st.serialize();
  const suggested = current?.fileName ?? fileNameOf(st.name);
  if (canSaveInPlace()) {
    let handle = as ? undefined : current?.handle;
    try {
      if (handle && !(await permitted(handle, "readwrite"))) handle = undefined;
      if (!handle) handle = await win().showSaveFilePicker!({ suggestedName: suggested, types: MOLA_TYPES });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      setCurrent({ handle, fileName: handle.name });
      await addRecent(handle.name, text, handle);
      useApp.setState({ hint: `Salvo em ${handle.name}.` });
      return;
    } catch (e) {
      if (isAbort(e)) return;
      // a alça não vale mais (arquivo movido, permissão negada): cai no download, sem perder o trabalho
      console.warn("[siMOLAdor] não deu para gravar no arquivo; baixando", e);
    }
  }
  download(suggested, text);
  setCurrent({ fileName: suggested });
  await addRecent(suggested, text);
  useApp.setState({ hint: `${suggested} baixado (este navegador não grava por cima do arquivo: ele vai para a pasta de downloads).` });
}

// ---------- abrir ----------

/** Abre o texto de um .mola: guarda o atual nas cópias, confere a versão e carrega. */
export async function openText(text: string, from: { fileName?: string; handle?: FileSystemFileHandle; example?: boolean }): Promise<boolean> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    useApp.setState({ hint: "Não foi possível abrir: o arquivo não é um .mola ou está corrompido." });
    return false;
  }
  await snapshot(from.example ? "antes de abrir um exemplo" : "antes de abrir outro arquivo");
  const st = useApp.getState();
  try {
    try {
      st.load(raw);
    } catch (e) {
      if (!(e instanceof MolaFileError) || !e.newer) throw e;
      const ok = window.confirm(`${e.message}\n\nAbrir assim mesmo? O que esta versão não conhece fica de fora; se salvar por cima, isso se perde. Atualize o siMOLAdor para abrir tudo.`);
      if (!ok) return false;
      st.load(raw, { allowNewer: true });
      useApp.setState({ hint: "Arquivo de uma versão mais nova: aberto só com o que esta versão conhece. Confira antes de salvar por cima." });
    }
  } catch (e) {
    useApp.setState({ hint: e instanceof Error ? e.message : "Não foi possível abrir o arquivo." });
    return false;
  }
  if (from.example || !from.fileName) setCurrent(null);
  else {
    setCurrent({ handle: from.handle, fileName: from.fileName });
    await addRecent(from.fileName, text, from.handle);
  }
  return true;
}

/** Abrir (Ctrl+O): a janela do sistema (Chrome/Edge) ou o seletor de arquivo do navegador. */
export async function openProject(): Promise<void> {
  if (typeof win().showOpenFilePicker === "function") {
    try {
      const [handle] = await win().showOpenFilePicker!({ types: MOLA_TYPES, multiple: false });
      const file = await handle.getFile();
      await openText(await file.text(), { fileName: file.name, handle });
    } catch (e) {
      if (!isAbort(e)) useApp.setState({ hint: "Não foi possível abrir o arquivo." });
    }
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".mola,application/json";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (f) await openText(await f.text(), { fileName: f.name });
  };
  input.click();
}

export async function openRecent(id: string): Promise<void> {
  const r = (await listRecents()).find((x) => x.id === id);
  if (!r) return;
  let text = r.text;
  let handle = r.handle;
  if (handle) {
    try {
      if (await permitted(handle, "read")) text = await (await handle.getFile()).text();
      else handle = undefined;
    } catch {
      // arquivo apagado ou movido: abre a cópia guardada, e Salvar pergunta onde
      handle = undefined;
      useApp.setState({ hint: `${r.fileName} não foi encontrado; abri a cópia guardada do último salvamento.` });
    }
  }
  await openText(text, { fileName: r.fileName, handle });
}

export async function restoreCopy(id: string): Promise<void> {
  const c = (await listCopies()).find((x) => x.id === id);
  if (!c) return;
  if (await openText(c.text, {})) useApp.setState({ hint: `Cópia automática de ${new Date(c.when).toLocaleString("pt-BR")} aberta. Salve com Ctrl+S para guardar num arquivo.` });
}

/** Novo projeto: o atual vai para as cópias automáticas antes. */
export async function newProjectSafe(): Promise<void> {
  await snapshot("antes de começar um projeto novo");
  useApp.getState().newProject();
  setCurrent(null);
}

export const openExample = (raw: string) => openText(raw, { example: true });

// ---------- início ----------

let started = false;
let unloadOk = false;
/** Recarregar de propósito (atualização): sem a pergunta de alterações não salvas, o trabalho está no salvamento automático. */
export const allowUnload = () => {
  unloadOk = true;
};
/** Liga o rastreio de "alterado", as cópias de 5 em 5 min, o aviso ao fechar e a abertura por duplo clique (app instalado). */
export function initFiles(): void {
  if (started) return;
  started = true;
  // o arquivo em edição volta junto com o salvamento automático; a alça vem dos recentes
  try {
    const fileName = localStorage.getItem(FILE_KEY);
    if (fileName) {
      current = { fileName };
      useApp.setState({ fileName, dirty: localStorage.getItem(DIRTY_KEY) === "1" });
      void listRecents().then((rs) => {
        const r = rs.find((x) => x.fileName === fileName);
        if (r?.handle && current?.fileName === fileName && !current.handle) current = { ...current, handle: r.handle };
      });
    }
  } catch {
    /* sem armazenamento */
  }
  useApp.subscribe((s, prev) => {
    if (s.history !== prev.history || s.inventory !== prev.inventory || s.name !== prev.name || s.sheet !== prev.sheet) {
      if (!s.dirty) useApp.setState({ dirty: true });
    }
    if (s.fileName !== prev.fileName || s.dirty !== prev.dirty) {
      try {
        if (s.fileName) localStorage.setItem(FILE_KEY, s.fileName);
        else localStorage.removeItem(FILE_KEY);
        localStorage.setItem(DIRTY_KEY, s.dirty ? "1" : "0");
      } catch {
        /* nada */
      }
    }
  });
  setInterval(() => {
    if (useApp.getState().dirty) void snapshot("a cada 5 min de trabalho");
  }, COPY_EVERY_MS);
  // fechar a aba com alterações que não foram para o arquivo: o navegador pergunta (o trabalho também fica no salvamento automático)
  window.addEventListener("beforeunload", (e) => {
    const st = useApp.getState();
    if (st.dirty && st.fileName && !unloadOk) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  // app instalado (PWA): abrir um .mola com duplo clique chega aqui
  win().launchQueue?.setConsumer(async ({ files }) => {
    const handle = files?.[0];
    if (!handle) return;
    const file = await handle.getFile();
    await openText(await file.text(), { fileName: file.name, handle });
  });
}
