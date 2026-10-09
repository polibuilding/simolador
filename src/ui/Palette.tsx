import { catalog } from "../core/catalog";
import { available, usage } from "../core/inventory";
import { useApp, useModel } from "./store";

const GROUPS: { title: string; codes: string[] }[] = [
  { title: "Apoio", codes: ["GC"] },
  { title: "Barras", codes: ["B4", "B6", "B12"] },
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

const SHORT: Record<string, string> = {
  GC: "Ligação de base",
  RC90: "Rígida 90°",
  CC: "Contínua",
  CC90: "Contínua 90°",
};

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

  // só as peças que existem nos kits escolhidos (ou que já estão no modelo); "sem limite" mostra todas
  const shown = (code: string) => available(catalog, inventory, code) > 0 || (used[code] ?? 0) > 0;
  const groups = GROUPS.map((g) => ({ ...g, codes: g.codes.filter(shown) })).filter((g) => g.codes.length);

  return (
    <aside className="palette" aria-label="Peças">
      {!groups.length && <p className="palette-empty">Nenhum kit no estoque. Escolha as caixas em <strong>Estoque</strong>, no alto à direita.</p>}
      {groups.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          {g.codes.map((code) => {
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
                  <strong>{code}</strong> {SHORT[code] ?? ""}
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
    </aside>
  );
}
