import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { available, usage } from "../core/inventory";
import { ropePlan, ropeSpec, STIFF_TOOL } from "../core/rope";

/** peças que se colocam clicando na cena (sem arrastar da paleta) */
const TWO_CLICKS = new Set(["CABLE", STIFF_TOOL]);
import { useApp, useModel } from "./store";

export const GROUPS: { title: string; codes: string[] }[] = [
  { title: "Apoio", codes: ["GC"] },
  { title: "Barras", codes: ["B4", "B6", "B12"] },
  { title: "Diagonais", codes: ["D4x6", "D6x6", "D6x12"] },
  { title: "Placas", codes: ["P6x6", "P6x12"] },
  { title: "Ligações", codes: ["RC90", "CC", "CC90"] },
  // Kit 3: o cabo (dois cliques: esfera e esfera) e o enrijecedor (clique na mola); ligações e clipes de cabo entram sozinhos
  { title: "Cabos", codes: ["CABLE", STIFF_TOOL] },
];

/** códigos de estoque por trás de uma entrada da paleta (o enrijecedor junta BS6 e BS12) */
const stockCodes = (code: string) => (code === STIFF_TOOL ? ["BS6", "BS12"] : [code]);
/** nome para mostrar */
export const paletteName = (code: string) => (code === STIFF_TOOL ? "Enrijecedor (B6 ou B12)" : catalog.pieces[code]?.name ?? code);

export function Icon({ code }: { code: string }) {
  if (code === STIFF_TOOL) {
    // mola dentro do tubo transparente
    let d = "M9 12";
    for (let i = 0; i < 12; i++) d += ` L${10.5 + i * 2.25} ${i % 2 ? 9.5 : 14.5}`;
    d += " L39 12";
    return (
      <svg viewBox="0 0 48 24" aria-hidden>
        <rect x="7" y="6.5" width="34" height="11" rx="2.5" className="i-tube" />
        <path d={d} className="i-spring" />
      </svg>
    );
  }
  const p = catalog.pieces[code];
  if (!p) return null;
  if (p.type === "rope") {
    // corrente de bolinhas, levemente caída, com as ligações de cabo nas pontas
    const pts = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return [11 + t * 26, 12 + Math.sin(t * Math.PI) * 4];
    });
    return (
      <svg viewBox="0 0 48 24" aria-hidden>
        <path d={`M5 12 L9 12`} className="i-cable" />
        <path d={`M39 12 L43 12`} className="i-cable" />
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" className="i-steel" />)}
        <circle cx="4" cy="12" r="2.6" className="i-steel" />
        <circle cx="44" cy="12" r="2.6" className="i-steel" />
      </svg>
    );
  }
  if (p.type === "support") {
    return (
      <svg viewBox="0 0 48 24" aria-hidden>
        <rect x="6" y="12" width="36" height="9" rx="2" className="i-plastic" />
        <circle cx="24" cy="11" r="6" className="i-steel" />
      </svg>
    );
  }
  if (p.type === "bar") {
    const span = p.spanM?.[0] ?? 6;
    const w = 8 + (span / 12) * 32;
    const x0 = 24 - w / 2;
    const coils = Math.round(span * 1.6);
    let d = `M${x0 + 3} 12`;
    for (let i = 0; i < coils; i++) {
      const x = x0 + 3 + ((w - 6) * (i + 0.5)) / coils;
      d += ` L${x} ${i % 2 ? 9 : 15}`;
    }
    d += ` L${x0 + w - 3} 12`;
    return (
      <svg viewBox="0 0 48 24" aria-hidden>
        <path d={d} className="i-spring" />
        <circle cx={x0} cy="12" r="3" className="i-steel" />
        <circle cx={x0 + w} cy="12" r="3" className="i-steel" />
      </svg>
    );
  }
  if (p.type === "cable") {
    // comprimento proporcional à diagonal (D4x6 < D6x6 < D6x12), para diferenciar de longe
    const [a, b] = p.spanM ?? [6, 6];
    const diag = Math.hypot(a, b);
    const L = 12 + (diag / Math.hypot(6, 12)) * 26;
    // inclinação suave, sem passar da altura do símbolo (o D6x12 era cortado em cima e embaixo)
    const dy = Math.min((L / 2) * Math.sin(Math.atan2(b, a * 2.2)), 7);
    const dx = Math.sqrt((L / 2) ** 2 - dy * dy);
    const [x1, y1, x2, y2] = [24 - dx, 12 + dy, 24 + dx, 12 - dy];
    return (
      <svg viewBox="0 0 48 24" aria-hidden>
        <path d={`M${x1} ${y1} L${x2} ${y2}`} className="i-cable" />
        <rect x={x1 - 2.5} y={y1 - 2.5} width="5" height="5" className="i-cap" transform={`rotate(45 ${x1} ${y1})`} />
        <rect x={x2 - 2.5} y={y2 - 2.5} width="5" height="5" className="i-cap" transform={`rotate(45 ${x2} ${y2})`} />
      </svg>
    );
  }
  if (p.type === "plate") {
    const wide = (p.spanM?.[0] ?? 6) > 6;
    return (
      <svg viewBox="0 0 48 24" aria-hidden>
        <rect x={wide ? 6 : 14} y="5" width={wide ? 36 : 20} height="14" rx="1.5" className="i-plastic" />
      </svg>
    );
  }
  if (code === "RC90") {
    return (
      <svg viewBox="0 0 48 24" aria-hidden>
        <path d="M17 19 L17 9 L20 6 L31 19 Z" className="i-plastic" />
      </svg>
    );
  }
  const tall = code === "CC90";
  return (
    <svg viewBox="0 0 48 24" aria-hidden>
      <path d={tall ? "M8 20 L14 8 L20 8 L20 13 L28 13 L28 8 L34 8 L40 20 Z" : "M8 18 L13 11 L21 11 L21 14 L27 14 L27 11 L35 11 L40 18 Z"} className="i-plastic" />
    </svg>
  );
}

function KitDots({ code }: { code: string }) {
  const codes = stockCodes(code);
  return (
    <span className="kit-dots" aria-label="Kits que trazem esta peça">
      {Object.entries(catalog.kits).map(([id, k]) =>
        codes.some((c) => k.pieces[c]) ? (
          <i key={id} style={{ background: k.color ?? "#999" }} title={`${k.name}: ${codes.filter((c) => k.pieces[c]).map((c) => `${k.pieces[c]}${codes.length > 1 ? ` ${c}` : ""}`).join(" + ")}${code === "CABLE" ? " rolo de 3,35 m" : ""}`} />
        ) : null,
      )}
    </span>
  );
}

/** Peças mostradas (as dos kits escolhidos ou já usadas), por grupo, com o que resta de cada. */
function usePalette() {
  const model = useModel();
  const inventory = useApp((s) => s.inventory);
  const tool = useApp((s) => s.tool);
  const used = usage(model);
  const avail = (code: string) => stockCodes(code).reduce((n, c) => n + available(catalog, inventory, c), 0);
  const usedOf = (code: string) => stockCodes(code).reduce((n, c) => n + (used[c] ?? 0), 0);
  const shown = (code: string) => avail(code) > 0 || usedOf(code) > 0 || (code === "CABLE" && Object.values(model.members).some((m) => m.code === "CABLE"));
  const groups = GROUPS.map((g) => ({ ...g, codes: g.codes.filter(shown) })).filter((g) => g.codes.length);
  const rope = ropePlan(catalog, model);
  const info = (code: string) => {
    const armed = tool.kind === "place" && tool.code === code;
    if (code === "CABLE") {
      // cabo: em centímetros (rolos × 3,35 m menos os pedaços); a quantidade de cabos é limitada pelas ligações
      const rolls = available(catalog, inventory, code);
      const total = Number.isFinite(rolls) ? Math.round((rolls * ropeSpec(catalog).roll) / 10) : Infinity;
      const left = Number.isFinite(total) ? Math.max(0, Math.round(total - rope.mm / 10)) : Infinity;
      return { total, left, armed, empty: left <= 0, unit: "cm" };
    }
    const total = avail(code);
    const left = total - usedOf(code);
    return { total, left, armed, empty: left <= 0, unit: "" };
  };
  return { groups, info, tool };
}

/** Clicar arma a peça (de novo, desarma); arrastar leva a peça para a cena. */
function pieceHandlers(code: string, armed: boolean, empty: boolean, viaDrag: boolean) {
  const { arm, disarm } = useApp.getState();
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || empty) return;
      if (armed || TWO_CLICKS.has(code)) return; // segundo clique desarma (no pointerup); cabo e enrijecedor não se arrastam
      arm(code, true);
    },
    onPointerUp: () => {
      if (TWO_CLICKS.has(code)) return armed ? disarm() : empty ? undefined : arm(code, false);
      if (armed && !viaDrag) return disarm();
      useApp.setState({ tool: { kind: "place", code, viaDrag: false } });
    },
  };
}

export const Chevrons = ({ dir }: { dir: "left" | "right" }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {dir === "left" ? <path d="M8.5 4 4.5 8l4 4M12.5 4l-4 4 4 4" /> : <path d="M7.5 4l4 4-4 4M3.5 4l4 4-4 4" />}
  </svg>
);

export function Palette({ hidden = false }: { hidden?: boolean }) {
  const { groups, info, tool } = usePalette();
  return (
    <aside className={`palette${hidden ? " is-hidden" : ""}`} aria-label="Peças" aria-hidden={hidden}>
      <button className="palette-min" onClick={() => useApp.getState().setPaletteMini(true)} title="Recolher a paleta (fica um menu pequeno só com os símbolos)" aria-label="Recolher a paleta">
        <Chevrons dir="left" />
      </button>
      {!groups.length && <p className="palette-empty">Nenhum kit no estoque. Escolha as caixas em <strong>Estoque</strong>, no alto à direita.</p>}
      {groups.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          {g.codes.map((code) => {
            const { total, left, armed, empty, unit } = info(code);
            return (
              <button
                key={code}
                className={`piece${armed ? " armed" : ""}${empty ? " empty" : ""}`}
                aria-pressed={armed}
                disabled={empty}
                title={empty ? `Acabou: ${paletteName(code)}` : `${paletteName(code)} · ${code === "CABLE" ? "clique numa esfera e depois em outra" : code === STIFF_TOOL ? "clique numa mola B6 ou B12" : "clique ou arraste para a cena"}`}
                {...pieceHandlers(code, armed, empty, tool.kind === "place" && tool.viaDrag)}
              >
                <Icon code={code} />
                <span className="piece-name">
                  <strong>{code}</strong>
                  <KitDots code={code} />
                </span>
                {/* sem limite: não mostra quantidade */}
                {Number.isFinite(total) && (
                  <span className="piece-count" title={unit ? `restam ${left} de ${total} ${unit}` : undefined}>
                    {unit ? (
                      <>
                        <b>{left}</b>
                        <small> {unit}</small>
                      </>
                    ) : (
                      <>
                        <b>{left}</b>/{total}
                      </>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </section>
      ))}
    </aside>
  );
}

/** Paleta recolhida: menu pequeno sobre a cena, só com os símbolos (vira duas colunas se não couber). */
export function PaletteMini() {
  const { groups, info, tool } = usePalette();
  // colunas: a menor quantidade que cabe na altura livre (1, depois 2, ...)
  const wrap = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(9999);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientHeight - 34)); // menos o botão >>
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sizes = groups.map((g) => g.codes.length);
  const heightFor = (c: number) => {
    const rows = sizes.reduce((n, k) => n + Math.ceil(k / c), 0);
    const seps = Math.max(0, sizes.length - 1);
    return 10 + rows * 30 + seps * 7 + (rows + seps - 1) * 2;
  };
  let cols = 1;
  while (cols < 4 && heightFor(cols) > avail) cols++;
  // com estoque limitado: "restam/total" bem clarinho ao lado de cada símbolo, fora do menu
  // (com duas colunas, os números ficam lado a lado, na ordem das colunas)
  const nav = useRef<HTMLElement>(null);
  const [marks, setMarks] = useState<{ code: string; top: number; left: number }[]>([]);
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const btns = [...el.querySelectorAll<HTMLButtonElement>(".pm-piece")];
    if (!btns.length) return marks.length ? setMarks([]) : undefined;
    const x0 = Math.min(...btns.map((b) => b.offsetLeft));
    const base = el.offsetLeft + el.offsetWidth + 8;
    const next = btns.map((b) => ({ code: b.dataset.code!, top: b.offsetTop + b.offsetHeight / 2, left: base + Math.round((b.offsetLeft - x0) / 46) }));
    if (JSON.stringify(next) !== JSON.stringify(marks)) setMarks(next);
  });
  // os números começam logo depois do menu (left guarda base + coluna)
  const base = (row: { left: number }[]) => Math.floor(row[0].left);
  return (
    <div ref={wrap} className="palette-mini-wrap" onPointerDown={(e) => e.stopPropagation()}>
      <button className="palette-max" onClick={() => useApp.getState().setPaletteMini(false)} title="Abrir a paleta de peças" aria-label="Abrir a paleta">
        <Chevrons dir="right" />
      </button>
      <nav ref={nav} className="palette-mini" aria-label="Peças" data-cols={cols} style={{ ["--cols" as string]: cols }}>
        {groups.map((g, gi) => (
          <div key={g.title} className="pm-group" role="group" aria-label={g.title}>
            {gi > 0 && <span className="pm-sep" />}
            {g.codes.map((code) => {
              const { total, left, armed, empty, unit } = info(code);
              const name = paletteName(code);
              return (
                <button
                  key={code}
                  data-code={code}
                  className={`pm-piece${armed ? " on" : ""}`}
                  aria-pressed={armed}
                  disabled={empty}
                  title={`${code} · ${name}${Number.isFinite(total) ? ` · ${left}/${total}${unit ? ` ${unit}` : ""}` : ""}`}
                  {...pieceHandlers(code, armed, empty, tool.kind === "place" && tool.viaDrag)}
                >
                  <Icon code={code} />
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      {/* uma linha de números por linha do menu: com duas colunas, "esquerda · direita", sem se sobrepor */}
      {[...new Set(marks.map((m) => m.top))].map((top) => {
        const row = marks.filter((m) => m.top === top).sort((a, b) => a.left - b.left);
        const items = row
          .map(({ code }) => ({ code, ...info(code) }))
          .filter((x) => Number.isFinite(x.total));
        if (!items.length) return null;
        return (
          <span key={top} className="pm-count" style={{ top, left: row[0] ? base(row) : 0 }} aria-hidden>
            {items.map((x, i) => (
              <span key={x.code} className={x.left <= 0 ? "out" : ""}>
                {i > 0 && <i className="pm-count-sep"> · </i>}
                <b>{x.left}</b>/{x.total}
                {x.unit ? ` ${x.unit}` : ""}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}
