import { useEffect, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { available, usage } from "../core/inventory";
import { useApp, useModel } from "./store";

export const GROUPS: { title: string; codes: string[] }[] = [
  { title: "Apoio", codes: ["GC"] },
  { title: "Barras", codes: ["B4", "B6", "B12"] },
  { title: "Diagonais", codes: ["D4x6", "D6x6", "D6x12"] },
  { title: "Placas", codes: ["P6x6", "P6x12"] },
  { title: "Ligações", codes: ["RC90", "CC", "CC90"] },
];

export function Icon({ code }: { code: string }) {
  const p = catalog.pieces[code];
  if (!p) return null;
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
    const ang = Math.atan2(b, a * 2.2); // inclinação suave
    const dx = (L / 2) * Math.cos(ang);
    const dy = (L / 2) * Math.sin(ang);
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
  return (
    <span className="kit-dots" aria-label="Kits que trazem esta peça">
      {Object.entries(catalog.kits).map(([id, k]) =>
        k.pieces[code] ? <i key={id} style={{ background: k.color ?? "#999" }} title={`${k.name}: ${k.pieces[code]}`} /> : null,
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
  const shown = (code: string) => available(catalog, inventory, code) > 0 || (used[code] ?? 0) > 0;
  const groups = GROUPS.map((g) => ({ ...g, codes: g.codes.filter(shown) })).filter((g) => g.codes.length);
  const info = (code: string) => {
    const total = available(catalog, inventory, code);
    const left = total - (used[code] ?? 0);
    return { total, left, armed: tool.kind === "place" && tool.code === code, empty: left <= 0 };
  };
  return { groups, info, tool };
}

/** Clicar arma a peça (de novo, desarma); arrastar leva a peça para a cena. */
function pieceHandlers(code: string, armed: boolean, empty: boolean, viaDrag: boolean) {
  const { arm, disarm } = useApp.getState();
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || empty) return;
      if (armed) return; // segundo clique desarma (no pointerup)
      arm(code, true);
    },
    onPointerUp: () => {
      if (armed && !viaDrag) return disarm();
      useApp.setState({ tool: { kind: "place", code, viaDrag: false } });
    },
  };
}

const Chevrons = ({ dir }: { dir: "left" | "right" }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {dir === "left" ? <path d="M8.5 4 4.5 8l4 4M12.5 4l-4 4 4 4" /> : <path d="M7.5 4l4 4-4 4M3.5 4l4 4-4 4" />}
  </svg>
);

export function Palette() {
  const { groups, info, tool } = usePalette();
  return (
    <aside className="palette" aria-label="Peças">
      <button className="palette-min" onClick={() => useApp.getState().setPaletteMini(true)} title="Recolher a paleta (fica um menu pequeno só com os símbolos)" aria-label="Recolher a paleta">
        <Chevrons dir="left" />
      </button>
      {!groups.length && <p className="palette-empty">Nenhum kit no estoque. Escolha as caixas em <strong>Estoque</strong>, no alto à direita.</p>}
      {groups.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          {g.codes.map((code) => {
            const { total, left, armed, empty } = info(code);
            return (
              <button
                key={code}
                className={`piece${armed ? " armed" : ""}${empty ? " empty" : ""}`}
                aria-pressed={armed}
                disabled={empty}
                title={empty ? `Acabaram as ${code} do estoque` : `${catalog.pieces[code]?.name ?? code} · clique ou arraste para a cena`}
                {...pieceHandlers(code, armed, empty, tool.kind === "place" && tool.viaDrag)}
              >
                <Icon code={code} />
                <span className="piece-name">
                  <strong>{code}</strong>
                  <KitDots code={code} />
                </span>
                {/* sem limite: não mostra quantidade */}
                {Number.isFinite(total) && (
                  <span className="piece-count">
                    <b>{left}</b>/{total}
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
  return (
    <div ref={wrap} className="palette-mini-wrap" onPointerDown={(e) => e.stopPropagation()}>
      <button className="palette-max" onClick={() => useApp.getState().setPaletteMini(false)} title="Abrir a paleta de peças" aria-label="Abrir a paleta">
        <Chevrons dir="right" />
      </button>
      <nav className="palette-mini" aria-label="Peças" data-cols={cols} style={{ ["--cols" as string]: cols }}>
        {groups.map((g, gi) => (
          <div key={g.title} className="pm-group" role="group" aria-label={g.title}>
            {gi > 0 && <span className="pm-sep" />}
            {g.codes.map((code) => {
              const { total, left, armed, empty } = info(code);
              const name = catalog.pieces[code]?.name ?? code;
              return (
                <button
                  key={code}
                  className={`pm-piece${armed ? " on" : ""}`}
                  aria-pressed={armed}
                  disabled={empty}
                  title={`${code} · ${name}${Number.isFinite(total) ? ` · ${left}/${total}` : ""}`}
                  {...pieceHandlers(code, armed, empty, tool.kind === "place" && tool.viaDrag)}
                >
                  <Icon code={code} />
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
