import { catalog } from "../core/catalog";
import { available, usage } from "../core/inventory";
import { useApp, useModel } from "./store";

const ACTIVE: { title: string; codes: string[] }[] = [
  { title: "Apoio", codes: ["GC"] },
  { title: "Barras", codes: ["B4", "B6", "B12"] },
];
const NEXT: { title: string; codes: string[] }[] = [
  { title: "Diagonais", codes: ["D4x6", "D6x6", "D6x12"] },
  { title: "Placas", codes: ["P6x6", "P6x12"] },
  { title: "Ligações", codes: ["RC90", "CC", "CC90"] },
];

function Icon({ code }: { code: string }) {
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
    return (
      <svg viewBox="0 0 48 24" aria-hidden>
        <path d="M8 19 L40 5" className="i-cable" />
        <rect x="5" y="16" width="5" height="5" className="i-cap" transform="rotate(45 7.5 18.5)" />
        <rect x="38" y="3" width="5" height="5" className="i-cap" transform="rotate(45 40.5 5.5)" />
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
  return (
    <svg viewBox="0 0 48 24" aria-hidden>
      <path d="M14 18 L24 6 L34 18 Z" className="i-plastic" />
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

export function Palette() {
  const model = useModel();
  const inventory = useApp((s) => s.inventory);
  const tool = useApp((s) => s.tool);
  const { arm, disarm } = useApp.getState();
  const used = usage(model);

  return (
    <aside className="palette" aria-label="Peças">
      {ACTIVE.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          {g.codes.map((code) => {
            const p = catalog.pieces[code];
            const total = available(catalog, inventory, code);
            const left = total - (used[code] ?? 0);
            const armed = tool.kind === "place" && tool.code === code;
            const empty = left <= 0;
            return (
              <button
                key={code}
                className={`piece${armed ? " armed" : ""}${empty ? " empty" : ""}`}
                aria-pressed={armed}
                disabled={empty}
                title={empty ? `Acabaram as ${code} do estoque` : `Clique ou arraste para a cena`}
                onPointerDown={(e) => {
                  if (e.button !== 0 || empty) return;
                  if (armed) return; // segundo clique desarma (no pointerup)
                  arm(code, true);
                }}
                onPointerUp={() => {
                  if (armed && !(tool.kind === "place" && tool.viaDrag)) return disarm();
                  useApp.setState({ tool: { kind: "place", code, viaDrag: false } });
                }}
              >
                <Icon code={code} />
                <span className="piece-name">
                  <strong>{code}</strong> {p?.name.replace(code, "").replace("Barra", "").trim() || ""}
                </span>
                <span className="piece-count">
                  {Number.isFinite(total) ? (
                    <>
                      <b>{left}</b>/{total}
                    </>
                  ) : (
                    <b>∞</b>
                  )}
                </span>
                <KitDots code={code} />
              </button>
            );
          })}
        </section>
      ))}
      <section className="next">
        <h2>Nas próximas versões</h2>
        {NEXT.map((g) => (
          <div key={g.title} className="next-group">
            <span>{g.title}</span>
            <span className="next-codes">{g.codes.join(", ")}</span>
          </div>
        ))}
      </section>
    </aside>
  );
}
