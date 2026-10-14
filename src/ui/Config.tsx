// Configurações (engrenagem): básicas no menu; avançadas numa janela com abas (protótipo do menu maior).
// Aplicar guarda no navegador e recarrega o programa (a estrutura fica salva). Ver core/config.ts e catalog.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { baseCatalog, catalog, CONFIG_KEY, CONFIG_TEST, configState } from "../core/catalog";
import {
  applyConfig, BASIC_FIELDS, checkConfig, diffOverrides, emptyOverrides, fieldError, isEmptyOverrides, MEASURE_FIELDS, pieceFieldError,
  pieceFields, ROPE_FIELDS, type Field, type Overrides,
} from "../core/config";
import { configImpact } from "./configImpact";
import { useApp, useModel } from "./store";
import { GROUPS, paletteName } from "./Palette";

const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const clone = (o: Overrides): Overrides => ({ v: 1, settings: { ...o.settings }, pieces: Object.fromEntries(Object.entries(o.pieces).map(([k, v]) => [k, { ...v }])) });

/** Guarda e recarrega (o teste de abertura protege contra configurações que travam o programa). */
function saveAndReload(ov: Overrides) {
  try {
    if (isEmptyOverrides(ov)) localStorage.removeItem(CONFIG_KEY);
    else localStorage.setItem(CONFIG_KEY, JSON.stringify(ov));
    localStorage.setItem(CONFIG_TEST, "1");
    sessionStorage.setItem("simolador:config-aplicada", "1");
  } catch {
    useApp.setState({ hint: "Este navegador não deixa guardar configurações (janela anônima ou armazenamento bloqueado)." });
    return;
  }
  location.reload();
}

/** Rascunho das configurações, com o catálogo resultante, os erros e o que muda na estrutura. */
function useDraft() {
  const model = useModel();
  const [draft, setDraft] = useState<Overrides>(() => clone(configState.overrides));
  const preview = useMemo(() => applyConfig(baseCatalog, draft), [draft]);
  const fieldErrors = useMemo(() => {
    const out: string[] = [];
    for (const f of [...BASIC_FIELDS, ...MEASURE_FIELDS, ...ROPE_FIELDS]) {
      const v = draft.settings[f.key];
      if (v !== undefined) {
        const e = fieldError(f, v);
        if (e) out.push(`${f.label}: ${e}.`);
      }
    }
    for (const [code, fields] of Object.entries(draft.pieces)) {
      const p = baseCatalog.pieces[code];
      if (!p) continue;
      for (const f of pieceFields(p)) {
        const v = fields[f.key];
        if (v !== undefined) {
          const e = pieceFieldError(f, v);
          if (e) out.push(`${code} · ${f.label}: ${e}.`);
        }
      }
    }
    return out;
  }, [draft]);
  const errors = useMemo(() => (fieldErrors.length ? fieldErrors : checkConfig(preview)), [fieldErrors, preview]);
  const impact = useMemo(() => (errors.length ? [] : configImpact(catalog, preview, model)), [errors, preview, model]);
  const final = useMemo(() => diffOverrides(baseCatalog, draft), [draft]);
  const changed = JSON.stringify(final) !== JSON.stringify(diffOverrides(baseCatalog, configState.overrides));
  const setSetting = (k: string, v: number | null) =>
    setDraft((d) => {
      const n = clone(d);
      if (v === null) delete n.settings[k];
      else n.settings[k] = v;
      return n;
    });
  const setPiece = (code: string, k: string, v: number | null) =>
    setDraft((d) => {
      const n = clone(d);
      const f = { ...(n.pieces[code] ?? {}) };
      if (v === null) delete f[k];
      else f[k] = v;
      if (Object.keys(f).length) n.pieces[code] = f;
      else delete n.pieces[code];
      return n;
    });
  return { draft, setDraft, preview, errors, impact, final, changed, setSetting, setPiece };
}

/** Campo numérico: aceita vírgula; vazio volta ao padrão. */
function CfgNumber({ value, onChange, invalid, step, label, width = 76 }: {
  value: number; onChange: (v: number | null) => void; invalid?: boolean; step?: number; label: string; width?: number;
}) {
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(Number.isFinite(value) ? fmt(value) : "");
  }, [value]);
  return (
    <input
      className={`cfg-num${invalid ? " bad" : ""}`}
      style={{ width }}
      inputMode="decimal"
      aria-label={label}
      value={text}
      step={step}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(Number.isFinite(value) ? fmt(value) : "");
      }}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const clean = t.trim().replace(/\./g, "").replace(",", ".");
        if (!clean) return onChange(null);
        const n = Number(t.includes(",") ? clean : t.trim());
        onChange(Number.isFinite(n) ? n : NaN);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Uma linha de parâmetro (rótulo, campo, unidade e o padrão da planilha quando muda). */
function FieldRow({ f, d }: { f: Field; d: ReturnType<typeof useDraft> }) {
  const v = d.draft.settings[f.key] ?? Number(d.preview.settings[f.key] ?? baseCatalog.settings[f.key]);
  const base = Number(baseCatalog.settings[f.key]);
  const err = Number.isFinite(v) ? fieldError(f, v) : "número";
  const differs = d.draft.settings[f.key] !== undefined && d.draft.settings[f.key] !== base;
  return (
    <div className={`cfg-row${err ? " bad" : ""}`}>
      <label title={f.help}>{f.label}</label>
      <span className="cfg-in">
        {f.options ? (
          <select value={v} onChange={(e) => d.setSetting(f.key, Number(e.target.value))} aria-label={f.label}>
            {f.options.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}
          </select>
        ) : (
          <CfgNumber value={v} onChange={(n) => d.setSetting(f.key, n)} invalid={!!err} step={f.step} label={f.label} />
        )}
        <span className="cfg-unit">{f.unit}</span>
      </span>
      <span className="cfg-note">
        {err ? `precisa ser ${err}` : differs && Number.isFinite(base) ? (
          <button className="cfg-reset" onClick={() => d.setSetting(f.key, null)} title="Voltar ao valor da planilha">padrão {fmt(base)}</button>
        ) : null}
      </span>
    </div>
  );
}

function Problems({ d }: { d: ReturnType<typeof useDraft> }) {
  if (d.errors.length) {
    return (
      <ul className="cfg-msgs bad" role="alert">
        {d.errors.slice(0, 4).map((e) => <li key={e}>{e}</li>)}
      </ul>
    );
  }
  if (!d.changed || !d.impact.length) return null;
  return (
    <ul className="cfg-msgs">
      {d.impact.map((e) => <li key={e}>{e}</li>)}
    </ul>
  );
}

/** Menu da engrenagem: os parâmetros mais usados. */
export function ConfigPanel({ onClose, dismissRef }: { onClose: () => void; dismissRef: React.RefObject<HTMLDivElement> }) {
  const d = useDraft();
  const anyMine = !isEmptyOverrides(configState.overrides);
  return (
    <div ref={dismissRef} className="popover left cfg-pop" role="dialog" aria-label="Configurações">
      <p className="popover-title">Configurações</p>
      {BASIC_FIELDS.map((f) => <FieldRow key={f.key} f={f} d={d} />)}
      <Problems d={d} />
      <div className="cfg-actions">
        <button
          className="ghost"
          onClick={() => d.setDraft(() => {
            const n = clone(d.draft);
            for (const f of BASIC_FIELDS) delete n.settings[f.key];
            return n;
          })}
          title="Volta estes valores aos da planilha (data/parametros.xlsx)"
        >
          Padrão
        </button>
        <button className="primary" disabled={!d.changed || d.errors.length > 0} onClick={() => saveAndReload(d.final)}>
          Aplicar
        </button>
      </div>
      <p className="cfg-foot">Aplicar recarrega o programa: a estrutura fica salva; o desfazer recomeça.{anyMine ? " Há configurações suas valendo." : ""}</p>
      <button className="cfg-adv" onClick={() => (onClose(), useApp.setState({ settingsOpen: true }))}>
        Configurações avançadas <span aria-hidden>›</span>
      </button>
    </div>
  );
}

const TABS = [
  { id: "pecas", label: "Peças", hint: "Medidas e pesos" },
  { id: "medidas", label: "Medidas gerais", hint: "Esfera, mola, GC, RC90" },
  { id: "cabo", label: "Cabo e enrijecedor", hint: "Kit 3" },
  { id: "geral", label: "Geral", hint: "Módulo, ângulos, chapa" },
] as const;
const SOON = ["Tutorial", "Aparência", "Idioma", "Perfil"];

/** Janela das configurações avançadas, com abas laterais (no estilo da lista de atalhos). */
export function AdvancedConfig() {
  const open = useApp((s) => s.settingsOpen);
  if (!open) return null;
  return <AdvancedInner />;
}

function AdvancedInner() {
  const close = () => useApp.setState({ settingsOpen: false });
  const [tab, setTab] = useState<string>("pecas");
  const d = useDraft();
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), close());
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  const order = [...new Set([...GROUPS.flatMap((g) => g.codes), ...Object.keys(baseCatalog.pieces)])].filter((c) => baseCatalog.pieces[c]);
  return (
    <div className="shortcuts-backdrop" onClick={close}>
      <section className="shortcuts cfg-adv-win" role="dialog" aria-label="Configurações avançadas" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Configurações</h2>
          <button onClick={close} aria-label="Fechar">×</button>
        </header>
        <div className="cfg-body">
          <nav className="cfg-tabs" aria-label="Abas">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                {t.label}
                <small>{t.hint}</small>
              </button>
            ))}
            <span className="cfg-tabs-sep" />
            {SOON.map((t) => (
              <button key={t} className={`soon${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
                {t}
                <small>em breve</small>
              </button>
            ))}
          </nav>
          <div className="cfg-content">
            {tab === "geral" && BASIC_FIELDS.map((f) => <FieldRow key={f.key} f={f} d={d} />)}
            {tab === "medidas" && MEASURE_FIELDS.map((f) => <FieldRow key={f.key} f={f} d={d} />)}
            {tab === "cabo" && ROPE_FIELDS.map((f) => <FieldRow key={f.key} f={f} d={d} />)}
            {tab === "pecas" && (
              <>
                <p className="cfg-lead">Medidas de cada peça (em mm) e peso (em g). As que saem das regras mudam sozinhas com o módulo; um valor digitado aqui vale no lugar da regra. Vazio volta ao padrão.</p>
                <table className="cfg-table">
                  <tbody>
                    {order.map((code) => {
                      const p = d.preview.pieces[code];
                      const fields = pieceFields(baseCatalog.pieces[code]);
                      return (
                        <tr key={code}>
                          <th>
                            <b>{code}</b>
                            <small>{paletteName(code)}</small>
                          </th>
                          {fields.map((f) => {
                            const mine = d.draft.pieces[code]?.[f.key];
                            const g = p.geometry[f.key];
                            const cur = f.key === "weightG" ? (p.weightG ?? NaN) : typeof g === "number" ? g : NaN;
                            const v = mine ?? cur;
                            const err = mine !== undefined && pieceFieldError(f, mine);
                            return (
                              <td key={f.key} className={mine !== undefined ? "mine" : ""}>
                                <span className="cfg-cell-label">{f.label}</span>
                                <CfgNumber value={v} onChange={(n) => d.setPiece(code, f.key, n)} invalid={!!err} label={`${code} ${f.label}`} width={68} />
                                <span className="cfg-unit">{f.key === "weightG" ? (p.type === "rope" ? "g/m" : "g") : "mm"}</span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
            {SOON.includes(tab) && (
              <div className="cfg-soon">
                <p className="soon">Em breve</p>
                <p>
                  {tab === "Tutorial" && "Um passo a passo dentro do programa: montar o pórtico, ligar esferas, usar o cabo e gerar as pranchas."}
                  {tab === "Aparência" && "Tema claro e escuro, cores das peças e dos pontos de encaixe, tamanho dos textos."}
                  {tab === "Idioma" && "Português, inglês e espanhol (o manual do Mola é bilíngue)."}
                  {tab === "Perfil" && "Nome, equipe e a assinatura que sai no carimbo das pranchas; os modelos que você enviou para a biblioteca."}
                </p>
              </div>
            )}
          </div>
        </div>
        <footer className="cfg-adv-foot">
          <Problems d={d} />
          <div className="cfg-actions">
            <button className="ghost" onClick={() => d.setDraft(emptyOverrides())} title="Tudo como na planilha (data/parametros.xlsx)">
              Restaurar tudo ao padrão
            </button>
            <span className="cfg-grow" />
            <button className="ghost" onClick={close}>Cancelar</button>
            <button className="primary" disabled={!d.changed || d.errors.length > 0} onClick={() => saveAndReload(d.final)}>
              Aplicar
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

// ---------- Biblioteca ----------

const EXAMPLES = import.meta.glob("../../examples/*.mola", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** Biblioteca de modelos (em breve, online); por enquanto, os exemplos que vêm com o programa. */
export function LibraryPanel({ dismissRef, onClose }: { dismissRef: React.RefObject<HTMLDivElement>; onClose: () => void }) {
  const items = Object.entries(EXAMPLES).map(([path, raw]) => {
    try {
      const f = JSON.parse(raw) as { name?: string; nodes?: unknown[]; members?: unknown[] };
      return { path, raw, name: f.name ?? path, pieces: (f.nodes?.length ?? 0) + (f.members?.length ?? 0) };
    } catch {
      return null;
    }
  }).filter(Boolean) as { path: string; raw: string; name: string; pieces: number }[];
  const open = (raw: string) => {
    const st = useApp.getState();
    const empty = Object.keys(st.history.present.nodes).length === 0;
    if (!empty && !window.confirm("Abrir o exemplo no lugar da estrutura atual? Salve antes (.mola) se quiser guardá-la.")) return;
    try {
      st.load(JSON.parse(raw));
      onClose();
    } catch (e) {
      useApp.setState({ hint: e instanceof Error ? e.message : "Não foi possível abrir o exemplo." });
    }
  };
  return (
    <div ref={dismissRef} className="popover left lib-pop" role="dialog" aria-label="Biblioteca">
      <p className="popover-title">Biblioteca · em breve</p>
      <p className="popover-text">Aqui vão ficar os modelos feitos no siMOLAdor e enviados pelos usuários: procurar, abrir, baixar e enviar o seu.</p>
      <p className="lib-sub">Exemplos que já vêm com o programa</p>
      <ul className="lib-list">
        {items.map((it) => (
          <li key={it.path}>
            <button onClick={() => open(it.raw)}>
              <b>{it.name}</b>
              <small>{it.pieces} peças</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
