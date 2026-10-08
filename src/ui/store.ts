// Estado da aplicação (zustand). O modelo vive dentro de um histórico para desfazer/refazer.
import { create } from "zustand";
import { catalog } from "../core/catalog";
import { createHistory, push, redo, undo, type History } from "../core/history";
import { defaultInventory, type InventoryConfig } from "../core/inventory";
import {
  addMember, addSupport, emptyModel, findNodeAt, removeMember, removeNode, type Model, type Vec3,
} from "../core/model";
import { validateMember, validateSupport, type Check } from "../core/rules";
import { fromFile, toFile } from "../core/serialization";

export type Tool = { kind: "select" } | { kind: "place"; code: string; viaDrag: boolean };

export interface Ghost {
  code: string;
  fromId?: string; // barras
  toPos: Vec3; // barra: ponta livre; GC: centro
  check: Check;
}

export type Selection = { kind: "node" | "member"; id: string } | null;

interface State {
  history: History<Model>;
  inventory: InventoryConfig;
  name: string;
  tool: Tool;
  gcMode: "grade" | "livre";
  ghost: Ghost | null;
  hint: string | null;
  selection: Selection;
  hoverId: string | null;
  // ações
  arm: (code: string, viaDrag?: boolean) => void;
  disarm: () => void;
  setGhost: (g: Ghost | null, hint?: string | null) => void;
  commitGhost: () => boolean;
  select: (s: Selection) => void;
  setHover: (id: string | null) => void;
  removeSelected: () => void;
  undo: () => void;
  redo: () => void;
  setGcMode: (m: "grade" | "livre") => void;
  setInventory: (inv: InventoryConfig) => void;
  setName: (n: string) => void;
  newProject: () => void;
  load: (raw: unknown) => void;
  serialize: () => string;
}

const STORAGE_KEY = "simolador:autosave";

function restore(): Partial<Pick<State, "history" | "inventory" | "name">> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const f = fromFile(JSON.parse(raw));
    return { history: createHistory(f.model), inventory: f.inventory, name: f.name };
  } catch {
    return {};
  }
}

export const useApp = create<State>((set, get) => ({
  history: createHistory(emptyModel()),
  inventory: defaultInventory(catalog),
  name: "Estrutura 01",
  tool: { kind: "select" },
  gcMode: catalog.settings.gc_encaixe_padrao === "livre" ? "livre" : "grade",
  ghost: null,
  hint: null,
  selection: null,
  hoverId: null,
  ...restore(),

  arm: (code, viaDrag = false) => set({ tool: { kind: "place", code, viaDrag }, selection: null, ghost: null }),
  disarm: () => set({ tool: { kind: "select" }, ghost: null, hint: null }),
  setGhost: (ghost, hint = null) => set({ ghost, hint }),

  commitGhost: () => {
    const { ghost, history, inventory } = get();
    if (!ghost) return false;
    const model = history.present;
    // revalida no momento de soltar (o estado pode ter mudado)
    const check = ghost.fromId
      ? validateMember(catalog, inventory, model, ghost.code, ghost.fromId, ghost.toPos)
      : validateSupport(catalog, inventory, model, ghost.toPos);
    if (!check.ok) {
      set({ hint: check.errors[0] });
      return false;
    }
    const next = ghost.fromId
      ? addMember(model, ghost.code, ghost.fromId, ghost.toPos).model
      : addSupport(model, ghost.toPos).model;
    set({ history: push(history, next), ghost: null, hint: check.warnings[0] ?? null });
    return true;
  },

  select: (selection) => set({ selection }),
  setHover: (hoverId) => set({ hoverId }),

  removeSelected: () => {
    const { selection, history } = get();
    if (!selection) return;
    const m = history.present;
    const next = selection.kind === "member" ? removeMember(m, selection.id) : removeNode(m, selection.id);
    set({ history: push(history, next), selection: null });
  },

  undo: () => set((s) => ({ history: undo(s.history), selection: null, ghost: null })),
  redo: () => set((s) => ({ history: redo(s.history), selection: null, ghost: null })),
  setGcMode: (gcMode) => set({ gcMode }),
  setInventory: (inventory) => set({ inventory }),
  setName: (name) => set({ name }),
  newProject: () =>
    set((s) => ({ history: push(s.history, emptyModel()), selection: null, ghost: null, name: "Estrutura 01" })),

  load: (raw) => {
    const f = fromFile(raw);
    set({ history: createHistory(f.model), inventory: f.inventory, name: f.name, selection: null, ghost: null });
  },

  serialize: () => {
    const { history, inventory, name } = get();
    return JSON.stringify(toFile(history.present, inventory, name, catalog.settings.modulo_mm), null, 2);
  },
}));

// Salvamento automático no navegador (conveniência; o arquivo .mola é o que vale).
useApp.subscribe((s, prev) => {
  if (s.history === prev.history && s.inventory === prev.inventory && s.name === prev.name) return;
  try {
    localStorage.setItem(STORAGE_KEY, s.serialize());
  } catch {
    /* armazenamento indisponível: ignora */
  }
});

export const useModel = () => useApp((s) => s.history.present);
export { findNodeAt };
