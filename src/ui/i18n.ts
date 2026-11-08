// Idiomas da interface (1.10.4): português (original), inglês e espanhol.
//
// Como funciona: o programa continua escrito em português. Com outro idioma escolhido, um observador da página
// troca cada texto visível (e os títulos, dicas e rótulos de acessibilidade) pela tradução do dicionário,
// procurando o texto exato e, se não achar, os modelos com partes variáveis (números, códigos). O que ainda não
// está no dicionário aparece em português. As pranchas (a folha) ficam em português, no padrão do Desafio.
//
// Vantagens: nenhum componente precisa mudar para ser traduzido, a troca é na hora (sem recarregar) e um texto
// novo sem tradução não quebra nada. Para traduzir mais, basta acrescentar uma linha ao dicionário (`i18n-dict.ts`: português, inglês, espanhol).

import { useEffect, useState } from "react";

export type Lang = "pt" | "en" | "es";
export const LANGS: { id: Lang; name: string }[] = [
  { id: "pt", name: "Português" },
  { id: "en", name: "English" },
  { id: "es", name: "Español" },
];

export interface Dict {
  /** texto em português (espaços normalizados) → tradução */
  strings: Record<string, string>;
  /** modelos com partes variáveis: [expressão regular sobre o texto inteiro, substituição com $1, $2…] */
  patterns: [string, string][];
}

const KEY = "simolador:idioma";
let lang: Lang = readLang();
let dict: Dict | null = null;
let patterns: [RegExp, string][] = [];
let observer: MutationObserver | null = null;

export function readLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    return v === "en" || v === "es" ? v : "pt";
  } catch {
    return "pt";
  }
}
export const currentLang = () => lang;

/** Dicionário do idioma (arquivo separado, carregado só quando se escolhe outro idioma). */
async function loadDict(l: Lang): Promise<Dict | null> {
  if (l === "pt") return null;
  const { ROWS, PATTERNS } = await import("./i18n-dict");
  const col = l === "en" ? 1 : 2;
  const strings: Record<string, string> = {};
  for (const r of ROWS) strings[norm(r[0])] = r[col];
  return { strings, patterns: PATTERNS.map((r) => [r[0], r[col]] as [string, string]) };
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Tradução de um texto (para avisos e confirmações feitos fora da tela, como window.confirm). */
export function tr(pt: string): string {
  if (!dict) return pt;
  const k = norm(pt);
  if (!k) return pt;
  const t = trKey(k, 0);
  return t === k ? pt : pt.replace(k, t);
}

/** texto normalizado → tradução; as partes variáveis de um modelo também são traduzidas (ex.: "Barra B4 · …") */
function trKey(k: string, depth: number): string {
  const hit = dict!.strings[k];
  if (hit !== undefined) return hit;
  for (const [re, to] of patterns) {
    const m = re.exec(k);
    if (!m) continue;
    return to.replace(/\$(\d)/g, (_, i: string) => {
      const g = m[Number(i)] ?? "";
      return depth < 2 ? trKey(g, depth + 1) : g;
    });
  }
  return k;
}

// ---------- tradução da página ----------

/** texto original (português) de cada nó de texto traduzido, e o que foi escrito por cima */
const original = new WeakMap<Node, string>();
const written = new WeakMap<Node, string>();
const ATTRS = ["title", "placeholder", "aria-label"] as const;
const attrOriginal = new WeakMap<Element, Record<string, string>>();

/** partes que não se traduzem: a folha das pranchas, campos de texto e o que o usuário escreveu */
function skip(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (e.classList?.contains("sheet-paper") || e.classList?.contains("notranslate") || e.getAttribute?.("translate") === "no") return true;
    const tag = e.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "CODE" || tag === "PRE") return true;
    if ((e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function doText(node: Node) {
  const now = node.nodeValue ?? "";
  // o React (ou outro código) mudou o texto depois da nossa troca: esse é o novo original
  if (written.get(node) !== now) original.set(node, now);
  const pt = original.get(node) ?? now;
  const next = lang === "pt" ? pt : tr(pt);
  if (next !== now) node.nodeValue = next;
  written.set(node, next);
}

function doAttrs(el: Element) {
  let rec = attrOriginal.get(el);
  for (const a of ATTRS) {
    const now = el.getAttribute(a);
    if (now === null) continue;
    rec ??= {};
    const prevWritten = rec[`w:${a}`];
    if (prevWritten !== now) rec[a] = now;
    const next = lang === "pt" ? rec[a] : tr(rec[a]);
    if (next !== now) el.setAttribute(a, next);
    rec[`w:${a}`] = next;
  }
  if (rec) attrOriginal.set(el, rec);
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!skip(root.parentElement)) doText(root);
    return;
  }
  if (!(root instanceof Element) || skip(root)) return;
  doAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n instanceof Element && skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n);
    else doAttrs(n as Element);
  }
}

function start() {
  if (observer || typeof MutationObserver === "undefined") return;
  observer = new MutationObserver((list) => {
    observer!.disconnect(); // as nossas trocas não disparam de novo
    for (const m of list) {
      if (m.type === "characterData") {
        if (!skip(m.target.parentElement)) doText(m.target);
      } else if (m.type === "attributes") {
        if (m.target instanceof Element && !skip(m.target)) doAttrs(m.target);
      } else m.addedNodes.forEach(walk);
    }
    observe();
  });
  observe();
}
function observe() {
  observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}

const listeners = new Set<() => void>();
let applied = 0;
/**
 * Idioma atual, para o que é desenhado fora da página (como as faces do cubo de vistas na cena 3D). Devolve uma
 * chave que muda a cada troca, inclusive quando o dicionário termina de carregar na abertura.
 */
export function useLang(): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return `${lang}-${applied}`;
}

async function apply(l: Lang) {
  dict = await loadDict(l);
  patterns = (dict?.patterns ?? []).map(([re, to]) => [new RegExp(`^${re}$`), to]);
  lang = l;
  applied++;
  listeners.forEach((f) => f());
  document.documentElement.lang = l === "pt" ? "pt-BR" : l;
  observer?.disconnect();
  walk(document.body);
  if (l === "pt") {
    observer = null; // em português não precisa observar (os originais já voltaram)
  } else {
    observer = null;
    start();
  }
}

/** Abre o programa no idioma guardado (português: nada a fazer). */
export function initI18n() {
  if (lang !== "pt") void apply(lang);
}

/** Troca o idioma na hora e guarda a escolha neste navegador. */
export async function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* fica só nesta sessão */
  }
  await apply(l);
}
