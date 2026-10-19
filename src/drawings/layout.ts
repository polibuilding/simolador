// Mudanças no arranjo das pranchas (inserir, tirar e mudar desenhos de prancha). Funções puras: recebem o arranjo
// em uso (o automático ou o já mexido) e devolvem um novo, que vai para SheetMeta.layouts do tamanho de folha atual.
import type { SheetCut, SheetLayout, SheetMeta, SheetPaper, SheetView } from "../core/serialization";

export const cloneLayout = (l: SheetLayout): SheetLayout => ({ pages: l.pages, views: l.views.map((v) => ({ ...v, cell: { ...v.cell } })) });

/** Grava o arranjo de um tamanho de folha no carimbo. */
export const withLayout = (meta: SheetMeta, paper: SheetPaper, layout: SheetLayout): SheetMeta => ({
  ...meta,
  layouts: { ...meta.layouts, [paper]: layout },
});

/** Próximo id livre para um desenho inserido ("d1", "d2"…), olhando todos os tamanhos de folha. */
export function nextViewId(meta: SheetMeta, extra: SheetLayout[] = []): string {
  let max = 0;
  for (const l of [...Object.values(meta.layouts ?? {}), ...extra]) {
    for (const v of l?.views ?? []) {
      const m = /^d(\d+)$/.exec(v.id);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `d${max + 1}`;
}

/** Próximo corte: id e nome ("Corte 1", "Corte 2"…). */
export function nextCut(cuts: SheetCut[] = []): { id: string; name: string } {
  let max = 0;
  for (const c of cuts) {
    const m = /^c(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return { id: `c${max + 1}`, name: `Corte ${max + 1}` };
}

/** Apaga um corte: a linha nas plantas e os desenhos dele em todos os tamanhos de folha. */
export function deleteCut(meta: SheetMeta, id: string): SheetMeta {
  const layouts: SheetMeta["layouts"] = {};
  for (const [k, l] of Object.entries(meta.layouts ?? {})) {
    if (l) layouts[k as SheetPaper] = { ...l, views: l.views.filter((v) => v.cut !== id) };
  }
  return { ...meta, cuts: (meta.cuts ?? []).filter((c) => c.id !== id), layouts };
}

export function addView(l: SheetLayout, v: SheetView): SheetLayout {
  const out = cloneLayout(l);
  out.views.push(v);
  out.pages = Math.max(out.pages, v.page + 1);
  return out;
}

export function removeView(l: SheetLayout, id: string): SheetLayout {
  const out = cloneLayout(l);
  out.views = out.views.filter((v) => v.id !== id);
  return out;
}

/** Leva o desenho para outra prancha (na mesma posição). `page` = número de pranchas: prancha nova no fim. */
export function moveToPage(l: SheetLayout, id: string, page: number): SheetLayout {
  const out = cloneLayout(l);
  const v = out.views.find((x) => x.id === id);
  if (!v) return out;
  v.page = Math.max(0, Math.min(page, out.pages));
  out.pages = Math.max(out.pages, v.page + 1);
  return out;
}

/** Escala própria do desenho (`undefined`: volta a seguir a escala geral). */
export function setViewScale(l: SheetLayout, id: string, n: number | undefined): SheetLayout {
  const out = cloneLayout(l);
  const v = out.views.find((x) => x.id === id);
  if (!v) return out;
  if (n === undefined) delete v.n;
  else v.n = n;
  return out;
}

export const addPage = (l: SheetLayout): SheetLayout => ({ ...cloneLayout(l), pages: l.pages + 1 });

/** Tira uma prancha vazia; as seguintes sobem um número. */
export function removePage(l: SheetLayout, page: number): SheetLayout {
  if (l.views.some((v) => v.page === page)) return l;
  const out = cloneLayout(l);
  out.pages = Math.max(0, out.pages - 1);
  for (const v of out.views) if (v.page > page) v.page -= 1;
  return out;
}
