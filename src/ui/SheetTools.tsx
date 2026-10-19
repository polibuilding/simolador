// Pranchas: ferramentas de inserir desenhos (cubo visto de cada lado) e o painel lateral de um desenho.
import { useCallback, useEffect, useState } from "react";
import type { SheetShow } from "../core/serialization";
import type { Level, ViewInfo, ViewSpec } from "../drawings/sheets";
import { useDismiss } from "./Toolbar";

const fmt = (n: number) => `1/${String(n).replace(".", ",")}`;
const two = (n: number) => String(n).padStart(2, "0");

/** Cubo em perspectiva com a face vista destacada: planta (em cima), A (frente), D (direita), B e C (atrás). */
export function CubeIcon({ face }: { face: "top" | "A" | "B" | "C" | "D" | "cut" }) {
  const P = { T0: "8 1.5", T1: "14 4.5", T2: "8 7.5", T3: "2 4.5", B0: "8 8.5", B1: "14 11.5", B2: "8 14.5", B3: "2 11.5" };
  const F: Record<string, string> = {
    top: `M${P.T0}L${P.T1}L${P.T2}L${P.T3}Z`,
    A: `M${P.T3}L${P.T2}L${P.B2}L${P.B3}Z`,
    D: `M${P.T2}L${P.T1}L${P.B1}L${P.B2}Z`,
    B: `M${P.T0}L${P.T3}L${P.B3}L${P.B0}Z`,
    C: `M${P.T1}L${P.T0}L${P.B0}L${P.B1}Z`,
    // corte: plano vertical atravessando o cubo
    cut: "M5 3 11 6 11 13 5 10Z",
  };
  const hidden = face === "B" || face === "C";
  return (
    <svg className="ico cube" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round">
      <path d={F[face]} fill="currentColor" fillOpacity={hidden ? 0.22 : 0.32} stroke="none" />
      <path d={`M${P.T0}L${P.T1}L${P.T2}L${P.T3}ZM${P.T3}L${P.B3}L${P.B2}L${P.B1}L${P.T1}M${P.T2}L${P.B2}`} />
      <path d={`M${P.T0}L${P.B0}M${P.B3}L${P.B0}L${P.B1}`} strokeDasharray="1.2 1.2" strokeOpacity="0.6" />
      {face === "cut" && <path d={F.cut} strokeWidth="1.1" />}
    </svg>
  );
}

/** Botão "Planta ▾": escolhe o pavimento e arma a inserção. */
function PlanPicker({ levels, armed, onPick }: { levels: Level[]; armed: boolean; onPick: (y: number) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <span className="menu">
      <button className={armed ? "on" : ""} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Inserir a planta de um pavimento">
        <CubeIcon face="top" /> Planta <span className="caret">▾</span>
      </button>
      {open && <PlanList levels={levels} onPick={(y) => (setOpen(false), onPick(y))} onClose={close} />}
    </span>
  );
}
function PlanList({ levels, onPick, onClose }: { levels: Level[]; onPick: (y: number) => void; onClose: () => void }) {
  const ref = useDismiss(onClose);
  return (
    <div ref={ref} className="sheet-pop" role="menu">
      {levels.length === 0 && <p className="sheet-pop-empty">Sem pavimentos.</p>}
      {levels.map((lv) => (
        <button key={lv.y} role="menuitem" onClick={() => onPick(lv.y)}>
          {lv.planTitle[0] === "PLANTA DE" ? "Cobertura" : lv.name.replace("PAV. TÉRREO", "Térreo").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
        </button>
      ))}
    </div>
  );
}

/** Grupo "Inserir" da barra de cima. */
export function InsertTools({ levels, cuts, armed, onArm }: {
  levels: Level[];
  cuts: { id: string; name: string }[];
  armed: ViewSpec | null;
  onArm: (s: ViewSpec | null) => void;
}) {
  const is = (k: ViewSpec["kind"], cut?: string) => armed?.kind === k && (k !== "cut" || (armed as { cut: string }).cut === cut);
  return (
    <div className="sb-field sb-insert" role="group" aria-label="Inserir desenho">
      <span>Inserir</span>
      <PlanPicker levels={levels} armed={is("plan")} onPick={(y) => onArm({ kind: "plan", level: y })} />
      {(["A", "B", "C", "D"] as const).map((k) => (
        <button key={k} className={is(k) ? "on" : ""} onClick={() => onArm(is(k) ? null : { kind: k })} title={`Inserir a vista ${k}`} aria-label={`Vista ${k}`}>
          <CubeIcon face={k} />
          {k}
        </button>
      ))}
      {cuts.map((c) => (
        <button key={c.id} className={is("cut", c.id) ? "on" : ""} onClick={() => onArm(is("cut", c.id) ? null : { kind: "cut", cut: c.id })} title={`Inserir o ${c.name.toLowerCase()}`}>
          <CubeIcon face="cut" />
          {c.name.replace(/^corte\s*/i, "C")}
        </button>
      ))}
    </div>
  );
}

const SHOW_ROWS: [keyof SheetShow, string][] = [
  ["markers", "Indicações de vistas"],
  ["labels", "Indicações de peças"],
  ["axes", "Eixos"],
  ["dims", "Cotas"],
];

/** Painel lateral do desenho escolhido: título, escala, prancha, o que mostrar e tirar da prancha. */
export function ViewPanel({ info, general, pages, scales, onText, onScale, onPage, onShow, onRemove, onClose }: {
  info: ViewInfo;
  general: number;
  pages: number;
  scales: number[];
  onText: (field: "title" | "sub", v: string) => void;
  onScale: (n: number | undefined) => void;
  onPage: (p: number) => void;
  onShow: (s: SheetShow | undefined) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [t, setT] = useState(info.title);
  const [s, setS] = useState(info.sub);
  useEffect(() => setT(info.title), [info.title]);
  useEffect(() => setS(info.sub), [info.sub]);
  const own = info.view.n !== undefined;
  return (
    <aside className="sheet-side" aria-label="Desenho escolhido">
      <header>
        <h3>{info.entry}</h3>
        <button className="sheet-side-close" onClick={onClose} title="Fechar (Esc)" aria-label="Fechar">×</button>
      </header>
      <label className="ss-row">
        <span>Título</span>
        <input value={t} onChange={(e) => setT(e.target.value)} onBlur={() => t !== info.title && onText("title", t)} onKeyDown={(e) => e.key === "Enter" && onText("title", t)} spellCheck={false} />
      </label>
      <label className="ss-row">
        <span>Subtítulo</span>
        <input value={s} onChange={(e) => setS(e.target.value)} onBlur={() => s !== info.sub && onText("sub", s)} onKeyDown={(e) => e.key === "Enter" && onText("sub", s)} spellCheck={false} />
      </label>
      <label className="ss-row">
        <span>Escala</span>
        <select value={own ? String(info.view.n) : "geral"} onChange={(e) => onScale(e.target.value === "geral" ? undefined : Number(e.target.value))}>
          <option value="geral">Geral ({fmt(general)})</option>
          {scales.map((n) => (
            <option key={n} value={n}>{fmt(n)}</option>
          ))}
        </select>
      </label>
      <label className="ss-row">
        <span>Prancha</span>
        <select value={info.sheet - 1} onChange={(e) => onPage(Number(e.target.value))}>
          {Array.from({ length: pages }, (_, p) => (
            <option key={p} value={p}>{two(p + 2)}</option>
          ))}
          <option value={pages}>Nova prancha</option>
        </select>
      </label>
      <div className="ss-show">
        <label className="ss-check global" title="Marcado: segue o Mostrar da barra de cima. Desmarcado: vale o que estiver marcado aqui">
          <input type="checkbox" checked={info.global} onChange={(e) => onShow(e.target.checked ? undefined : { ...info.show })} />
          Global
        </label>
        {SHOW_ROWS.map(([k, label]) => (
          <label key={k} className={`ss-check${info.global ? " locked" : ""}`}>
            <input type="checkbox" checked={info.show[k]} disabled={info.global} onChange={(e) => onShow({ ...info.show, [k]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      <button className="ss-remove" onClick={onRemove} title="Tira este desenho da prancha (Delete)">Tirar da prancha</button>
    </aside>
  );
}
