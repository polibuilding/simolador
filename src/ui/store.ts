// Estado da aplicação (zustand). O modelo vive dentro de um histórico para desfazer/refazer.
import { create } from "zustand";
import { catalog } from "../core/catalog";
import { codeOf, removeMany, removeSelection, rotateSelection, type Sel } from "../core/edit";
import { createHistory, push, redo, undo, type History } from "../core/history";
import { defaultInventory, type InventoryConfig } from "../core/inventory";
import { emptyModel, type Model } from "../core/model";
import { type Check } from "../core/rules";
import { fromFile, toFile, type SheetMeta } from "../core/serialization";
import { applyCandidate, type Candidate } from "../core/snapping";

export type Tool =
  | { kind: "select" }
  /** colocar peça nova; `moving` = peça retirada para mudar de lugar (base = modelo sem ela) */
  | { kind: "place"; code: string; viaDrag: boolean; moving?: { base: Model } }
  /** mover a estrutura conectada a um nó */
  | { kind: "moveGroup"; nodeId: string; turns: number; viaDrag: boolean };

export type Ghost =
  | { kind: "cand"; cand: Candidate }
  | { kind: "group"; model: Model; ids: Set<string>; check: Check };

export type CameraView = "fit" | "iso" | "front" | "side" | "top";

interface State {
  history: History<Model>;
  inventory: InventoryConfig;
  name: string;
  sheet: SheetMeta;
  tool: Tool;
  snap: boolean;
  ghost: Ghost | null;
  hint: string | null;
  rotIndex: number;
  selection: Sel | null;
  /** seleção múltipla (retângulo, Shift+clique, Ctrl+A) */
  multi: Sel[];
  /** retângulo de seleção em andamento (coordenadas da tela) */
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  /** momento em que um retângulo terminou: o clique que vem junto não limpa a seleção */
  boxEndedAt: number;
  hoverId: string | null;
  pendingDrag: { x: number; y: number } | null;
  camera: { view: CameraView; n: number };
  sheetsOpen: boolean;
  // ações
  arm: (code: string, viaDrag?: boolean) => void;
  disarm: () => void;
  setGhost: (g: Ghost | null, hint?: string | null) => void;
  commitGhost: () => boolean;
  rotate: () => void;
  startMove: (viaDrag: boolean) => void;
  select: (s: Sel | null) => void;
  toggleMulti: (s: Sel) => void;
  setMulti: (list: Sel[], add?: boolean) => void;
  selectAll: () => void;
  setBox: (b: State["box"]) => void;
  setHover: (id: string | null) => void;
  setPendingDrag: (p: { x: number; y: number } | null) => void;
  removeSelected: () => void;
  undo: () => void;
  redo: () => void;
  setSnap: (v: boolean) => void;
  setInventory: (inv: InventoryConfig) => void;
  setName: (n: string) => void;
  setSheet: (s: SheetMeta) => void;
  setCamera: (v: CameraView) => void;
  setSheetsOpen: (v: boolean) => void;
  newProject: () => void;
  load: (raw: unknown) => void;
  serialize: () => string;
}

const STORAGE_KEY = "simolador:autosave";

function restore(): Partial<Pick<State, "history" | "inventory" | "name" | "sheet">> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const f = fromFile(JSON.parse(raw));
    return { history: createHistory(f.model), inventory: f.inventory, name: f.name, ...(f.sheet ? { sheet: f.sheet } : {}) };
  } catch {
    return {};
  }
}

/** Modelo sobre o qual se trabalha agora (sem a peça que está sendo movida). */
export function workingModel(s: Pick<State, "history" | "tool">): Model {
  return s.tool.kind === "place" && s.tool.moving ? s.tool.moving.base : s.history.present;
}

export const useApp = create<State>((set, get) => ({
  history: createHistory(emptyModel()),
  inventory: defaultInventory(catalog),
  name: "Estrutura 01",
  sheet: { line1: "MOLA STRUCTURAL MODEL", line2: String(catalog.settings.prancha_projeto ?? "") },
  tool: { kind: "select" },
  snap: catalog.settings.gc_encaixe_padrao !== "livre",
  ghost: null,
  hint: null,
  rotIndex: 0,
  selection: null,
  multi: [],
  box: null,
  boxEndedAt: 0,
  hoverId: null,
  pendingDrag: null,
  camera: { view: "iso", n: 0 },
  sheetsOpen: false,
  ...restore(),

  arm: (code, viaDrag = false) =>
    set({ tool: { kind: "place", code, viaDrag }, selection: null, multi: [], ghost: null, rotIndex: 0, hint: null }),
  disarm: () => set({ tool: { kind: "select" }, ghost: null, hint: null, pendingDrag: null }),
  setGhost: (ghost, hint = null) => set({ ghost, hint }),

  commitGhost: () => {
    const { ghost, history, tool } = get();
    if (!ghost) return false;
    if (ghost.kind === "group") {
      if (!ghost.check.ok) return set({ hint: ghost.check.errors[0] }), false;
      set({ history: push(history, ghost.model), ghost: null, tool: { kind: "select" }, hint: null });
      return true;
    }
    if (!ghost.cand.check.ok) return set({ hint: ghost.cand.check.errors[0] }), false;
    const next = applyCandidate(workingModel(get()), ghost.cand);
    const moving = tool.kind === "place" && !!tool.moving;
    set({
      history: push(history, next),
      ghost: null,
      hint: ghost.cand.check.warnings[0] ?? null,
      ...(moving ? { tool: { kind: "select" } as Tool } : {}),
    });
    return true;
  },

  rotate: () => {
    const s = get();
    if (s.tool.kind === "place") return set({ rotIndex: s.rotIndex + 1 });
    if (s.tool.kind === "moveGroup") return set({ tool: { ...s.tool, turns: s.tool.turns + 1 } });
    if (!s.selection) return set({ hint: "Selecione uma peça para girar, ou gire enquanto posiciona (R)." });
    const r = rotateSelection(catalog, s.inventory, s.history.present, s.selection);
    if (r.model) set({ history: push(s.history, r.model), selection: null, hint: "Peça girada. Ctrl+Z desfaz." });
    else set({ hint: r.error ?? null });
  },

  startMove: (viaDrag) => {
    const s = get();
    const sel = s.selection;
    if (!sel) return;
    const model = s.history.present;
    if (sel.kind === "node") {
      set({ tool: { kind: "moveGroup", nodeId: sel.id, turns: 0, viaDrag }, ghost: null, hint: "Leve a estrutura até o novo lugar. R gira 90°." });
      return;
    }
    const code = codeOf(model, sel);
    if (!code) return;
    set({
      tool: { kind: "place", code, viaDrag, moving: { base: removeSelection(model, sel) } },
      selection: null,
      ghost: null,
      rotIndex: 0,
      hint: "Escolha o novo lugar da peça. Esc cancela.",
    });
  },

  select: (selection) => set({ selection, multi: [], hint: null }),
  toggleMulti: (s) =>
    set((st) => {
      const list = st.multi.length ? st.multi : st.selection ? [st.selection] : [];
      const has = list.some((x) => x.id === s.id);
      const multi = has ? list.filter((x) => x.id !== s.id) : [...list, s];
      return multi.length === 1 ? { selection: multi[0], multi: [] } : { selection: null, multi };
    }),
  setMulti: (list, addTo = false) =>
    set((st) => {
      const base = addTo ? (st.multi.length ? st.multi : st.selection ? [st.selection] : []) : [];
      const seen = new Set(base.map((x) => x.id));
      const multi = [...base, ...list.filter((x) => !seen.has(x.id))];
      return multi.length === 1 ? { selection: multi[0], multi: [] } : { selection: null, multi };
    }),
  selectAll: () =>
    set((st) => {
      const m = st.history.present;
      const multi: Sel[] = [
        ...Object.keys(m.nodes).map((id) => ({ kind: "node" as const, id })),
        ...Object.keys(m.members).map((id) => ({ kind: "member" as const, id })),
        ...Object.keys(m.plates).map((id) => ({ kind: "plate" as const, id })),
        ...Object.keys(m.connectors).map((id) => ({ kind: "connector" as const, id })),
      ];
      return { selection: null, multi };
    }),
  setBox: (box) => set(box ? { box } : { box: null, boxEndedAt: performance.now() }),
  setHover: (hoverId) => set({ hoverId }),
  setPendingDrag: (pendingDrag) => set({ pendingDrag }),

  removeSelected: () => {
    const { selection, multi, history } = get();
    if (multi.length) return set({ history: push(history, removeMany(history.present, multi)), multi: [], selection: null });
    if (!selection) return;
    set({ history: push(history, removeSelection(history.present, selection)), selection: null });
  },

  undo: () => set((s) => ({ history: undo(s.history), selection: null, multi: [], ghost: null, tool: { kind: "select" } })),
  redo: () => set((s) => ({ history: redo(s.history), selection: null, multi: [], ghost: null, tool: { kind: "select" } })),
  setSnap: (snap) => set({ snap }),
  setInventory: (inventory) => set({ inventory }),
  setName: (name) => set({ name }),
  setSheet: (sheet) => set({ sheet }),
  setCamera: (view) => set((s) => ({ camera: { view, n: s.camera.n + 1 } })),
  setSheetsOpen: (sheetsOpen) => set({ sheetsOpen, tool: { kind: "select" }, ghost: null }),
  newProject: () =>
    set((s) => ({ history: push(s.history, emptyModel()), selection: null, ghost: null, name: "Estrutura 01", tool: { kind: "select" } })),

  load: (raw) => {
    const f = fromFile(raw);
    set((s) => ({
      history: createHistory(f.model),
      inventory: f.inventory,
      name: f.name,
      sheet: f.sheet ?? s.sheet,
      selection: null,
      ghost: null,
      tool: { kind: "select" },
      camera: { view: "fit", n: s.camera.n + 1 },
    }));
  },

  serialize: () => {
    const { history, inventory, name, sheet } = get();
    return JSON.stringify(toFile(history.present, inventory, name, catalog.settings.modulo_mm, sheet), null, 2);
  },
}));

// Salvamento automático no navegador (conveniência; o arquivo .mola é o que vale).
useApp.subscribe((s, prev) => {
  if (s.history === prev.history && s.inventory === prev.inventory && s.name === prev.name && s.sheet === prev.sheet) return;
  try {
    localStorage.setItem(STORAGE_KEY, s.serialize());
  } catch {
    /* armazenamento indisponível: ignora */
  }
});

/** Modelo para exibir: durante um movimento, o modelo sem a peça retirada. */
export const useModel = () => useApp((s) => workingModel(s));
