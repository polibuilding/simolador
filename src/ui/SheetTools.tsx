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

/** Linha de corte: traço e ponto com as setas para o lado que se vê. */
export function CutIcon() {
  return (
    <svg className="ico" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 11h13" strokeDasharray="3 1.6 0.6 1.6" />
      <path d="M3 11V5M13 11V5M1.6 6.6 3 5l1.4 1.6M11.6 6.6 13 5l1.4 1.6" />
    </svg>
  );
}

/** Lixeira (apagar). */
export function TrashIcon() {
  return (
    <svg className="ico" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 9h6.6l.7-9M6.7 7v4.5M9.3 7v4.5" />
    </svg>
  );
}

/** Grupo "Inserir" da barra de cima. */
export function InsertTools({ levels, cuts, armed, onArm, cutting, onCut, onDeleteCut }: {
  levels: Level[];
  cuts: { id: string; name: string }[];
  armed: ViewSpec | null;
  onArm: (s: ViewSpec | null) => void;
  onDeleteCut: (id: string) => void;
  /** desenhando uma linha de corte */
  cutting: boolean;
  onCut: () => void;
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
        <span key={c.id} className="cut-pick">
          <button className={is("cut", c.id) ? "on" : ""} onClick={() => onArm(is("cut", c.id) ? null : { kind: "cut", cut: c.id })} title={`Inserir o ${c.name.toLowerCase()}`}>
            <CubeIcon face="cut" />
            {c.name.replace(/^corte\s*/i, "C")}
          </button>
          {is("cut", c.id) && (
            <button className="trash" onClick={() => onDeleteCut(c.id)} title={`Apagar o ${c.name.toLowerCase()}: a linha nas plantas e os desenhos dele (Ctrl+Z desfaz)`} aria-label={`Apagar o ${c.name.toLowerCase()}`}>
              <TrashIcon />
            </button>
          )}
        </span>
      ))}
      <span className="sb-sep" />
      <button className={cutting ? "on" : ""} onClick={onCut} title="Novo corte: clique no primeiro e no segundo ponto da linha de corte numa planta baixa">
        <CutIcon /> Corte
      </button>
    </div>
  );
}

/** limites da escala personalizada (n de 1:n) */
const SCALE_MIN = 0.1;
const SCALE_MAX = 1000;

/**
 * Escala: automática (ou geral), as usuais e "Personalizada", que abre o campo 1/n.
 * `current`: a escala em uso, para começar o campo personalizado.
 */
export function ScalePick({ value, current, scales, autoLabel, onChange, label }: {
  value: number | "auto";
  current: number;
  scales: number[];
  autoLabel: string;
  onChange: (v: number | "auto") => void;
  label?: string;
}) {
  const listed = value === "auto" || scales.includes(value);
  const [custom, setCustom] = useState(!listed);
  useEffect(() => {
    if (!listed) setCustom(true);
  }, [listed]);
  const show = (n: number) => String(n).replace(".", ",");
  const [text, setText] = useState(show(value === "auto" ? current : value));
  useEffect(() => setText(show(value === "auto" ? current : value)), [value, current]);
  const commit = () => {
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n) && n >= SCALE_MIN && n <= SCALE_MAX) onChange(n);
    else setText(show(value === "auto" ? current : value));
  };
  return (
    <>
      <select
        value={custom ? "custom" : String(value)}
        aria-label={label ?? "Escala"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "custom") return setCustom(true);
          setCustom(false);
          onChange(v === "auto" ? "auto" : Number(v));
        }}
      >
        <option value="auto">{autoLabel}</option>
        {scales.map((n) => (
          <option key={n} value={n}>{fmt(n)}</option>
        ))}
        <option value="custom">Personalizada</option>
      </select>
      {custom && (
        <span className="scale-custom" title={`Escala 1/n, com n entre ${show(SCALE_MIN)} e ${SCALE_MAX}`}>
          1/
          <input
            value={text}
            inputMode="decimal"
            aria-label="Escala personalizada: n de 1/n"
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </span>
      )}
    </>
  );
}

/**
 * "Voltar ao automático ▾": duas coisas diferentes, com o que cada uma faz.
 * Desenhos: quais desenhos estão em cada prancha. Posições: onde cada um está dentro da folha.
 */
export function RestoreMenu({ paper, layout, positions, onLayout, onPositions }: {
  paper: string;
  /** o arranjo desta folha foi mexido */
  layout: boolean;
  /** há desenhos, títulos ou nomes de peças arrastados */
  positions: boolean;
  onLayout: () => void;
  onPositions: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!layout && !positions) return null;
  return (
    <span className="menu">
      <button className={`ghost${open ? " on" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Desfaz o que foi mexido nas pranchas">
        Voltar ao automático <span className="caret">▾</span>
      </button>
      {open && (
        <RestoreList
          paper={paper}
          layout={layout}
          positions={positions}
          onLayout={() => (setOpen(false), onLayout())}
          onPositions={() => (setOpen(false), onPositions())}
          onClose={close}
        />
      )}
    </span>
  );
}
function RestoreList({ paper, layout, positions, onLayout, onPositions, onClose }: {
  paper: string;
  layout: boolean;
  positions: boolean;
  onLayout: () => void;
  onPositions: () => void;
  onClose: () => void;
}) {
  const ref = useDismiss(onClose);
  return (
    <div ref={ref} className="sheet-pop right restore" role="menu">
      <button role="menuitem" disabled={!layout} onClick={onLayout}>
        <b>Desenhos das pranchas</b>
        <small>Quais desenhos vão em cada prancha: tira os inseridos, devolve os tirados e cada um à prancha dele (folha {paper}).</small>
      </button>
      <button role="menuitem" disabled={!positions} onClick={onPositions}>
        <b>Posições</b>
        <small>Onde cada coisa fica na folha: desenhos, títulos e nomes das peças arrastados voltam ao lugar. Os desenhos continuam os mesmos.</small>
      </button>
      <p className="sheet-pop-foot">Ctrl+Z desfaz.</p>
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
export function ViewPanel({ info, general, pages, scales, onText, onScale, onPage, onShow, onRemove, onDeleteCut, onClose }: {
  info: ViewInfo;
  general: number;
  pages: number;
  scales: number[];
  onText: (field: "title" | "sub", v: string) => void;
  onScale: (n: number | undefined) => void;
  onPage: (p: number) => void;
  onShow: (s: SheetShow | undefined) => void;
  onRemove: () => void;
  /** corte: apaga o corte (a linha nas plantas e os desenhos dele) */
  onDeleteCut?: () => void;
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
      <div className="ss-row">
        <span>Escala</span>
        <span className="ss-scale">
          <ScalePick
            value={own ? info.view.n! : "auto"}
            current={info.n}
            scales={scales}
            autoLabel={`Geral (${fmt(general)})`}
            onChange={(v) => onScale(v === "auto" ? undefined : v)}
            label="Escala do desenho"
          />
        </span>
      </div>
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
      {onDeleteCut && (
        <button className="ss-remove soft" onClick={onDeleteCut} title="Apaga a linha de corte das plantas e todos os desenhos deste corte">Apagar o corte</button>
      )}
    </aside>
  );
}
