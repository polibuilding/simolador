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
import { openExample } from "./files";
import { copyReport } from "./errorlog";
import { applyUpdate, isInstalled, offlineReady, promptInstall } from "./pwa";
import { EDITION, VERSION } from "../version";
import { DEFAULT_APPEARANCE, readAppearance, readProfile, readTutorial, resetTutorial, saveAppearance, saveProfile, type Appearance, type Profile } from "./prefs";
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

const TABS = [
  { id: "geral", label: "Geral", hint: "Módulo, ângulos, chapa" },
  { id: "pecas", label: "Peças", hint: "Medidas e pesos" },
  { id: "medidas", label: "Medidas gerais", hint: "Esfera, mola, GC, RC90" },
  { id: "cabo", label: "Cabo e enrijecedor", hint: "Kit 3" },
] as const;
const PERSONAL = [
  { id: "tutorial", label: "Tutorial", hint: "Primeiros passos" },
  { id: "aparencia", label: "Aparência", hint: "Chapa, fundo, eixos" },
  { id: "perfil", label: "Perfil", hint: "Nome e equipe" },
  { id: "idioma", label: "Idioma", hint: "Português" },
  { id: "sobre", label: "Sobre", hint: `Versão ${VERSION}` },
] as const;

/** Janela das configurações avançadas, com abas laterais (no estilo da lista de atalhos). */
export function AdvancedConfig() {
  const open = useApp((s) => s.settingsOpen);
  if (!open) return null;
  return <AdvancedInner />;
}

function AdvancedInner() {
  const close = () => useApp.setState({ settingsOpen: false });
  const [tab, setTab] = useState<string>(useApp.getState().settingsTab ?? "geral");
  const d = useDraft();
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), close());
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  const order = [...new Set([...GROUPS.flatMap((g) => g.codes), ...Object.keys(baseCatalog.pieces)])].filter((c) => baseCatalog.pieces[c]);
  return (
    <div className="shortcuts-backdrop" onClick={close}>
      <section className="shortcuts cfg-adv-win" role="dialog" aria-label="Configurações" onClick={(e) => e.stopPropagation()}>
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
            {PERSONAL.map((t) => (
              <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                {t.label}
                <small>{t.hint}</small>
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
            {tab === "tutorial" && <TutorialTab onDo={close} />}
            {tab === "aparencia" && <AppearanceTab />}
            {tab === "perfil" && <ProfileTab />}
            {tab === "idioma" && <LanguageTab />}
            {tab === "sobre" && <AboutTab />}
          </div>
        </div>
        {!PERSONAL.some((t) => t.id === tab) && <footer className="cfg-adv-foot">
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
        </footer>}
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
  // a estrutura atual vai para as cópias automáticas antes (Arquivo › Cópias automáticas)
  const open = (raw: string) => void openExample(raw).then((ok) => ok && onClose());
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

// ---------- abas pessoais: tutorial, aparência, perfil, idioma (ficam no navegador, não no projeto) ----------

/** Tutorial: os primeiros passos, marcados sozinhos quando a estrutura mostra que foram feitos. */
function TutorialTab({ onDo }: { onDo: () => void }) {
  const model = useApp((s) => s.history.present);
  const [flags, setFlags] = useState(readTutorial);
  const nodes = Object.values(model.nodes);
  const bars = Object.values(model.members).filter((m) => baseCatalog.pieces[m.code]?.type === "bar");
  const vertical = bars.some((m) => Math.abs(model.nodes[m.a].pos[1] - model.nodes[m.b].pos[1]) > 1e-6);
  const beam = bars.some((m) => model.nodes[m.a].pos[1] > 0 && Math.abs(model.nodes[m.a].pos[1] - model.nodes[m.b].pos[1]) < 1e-6);
  const arm = (code: string) => () => (onDo(), useApp.getState().arm(code));
  const steps: { id: string; title: string; text: string; done: boolean; action?: { label: string; run: () => void } }[] = [
    { id: "gc", title: "Ligação de base", text: "Escolha a GC na paleta e clique na chapa. Os pontos verdes mostram a grade.", done: nodes.some((n) => n.kind === "support"), action: { label: "Pegar a GC", run: arm("GC") } },
    { id: "pilar", title: "Pilar", text: "Com a B6 na mão, passe o cursor sobre a esfera da GC: a barra sobe. Clique para encaixar.", done: vertical, action: { label: "Pegar a B6", run: arm("B6") } },
    { id: "viga", title: "Viga entre dois pilares", text: "Faça um segundo pilar a 6 módulos e ligue as duas esferas de cima: clique numa e depois na outra.", done: beam, action: { label: "Pegar a B6", run: arm("B6") } },
    { id: "rigidez", title: "Ver o que mexe", text: "Dê duplo clique na viga: o caminho azul mostra para onde o pórtico tomba. Espaço amplia o que mexe junto; G segue uma liberdade por vez.", done: !!flags.rigidez },
    { id: "cabo", title: "Cabo (Kit 3)", text: "Com o CABLE na mão, clique numa esfera e depois em outra: o pedaço sai em bolinhas, com o plano de corte.", done: Object.values(model.members).some((m) => baseCatalog.pieces[m.code]?.type === "rope"), action: { label: "Pegar o cabo", run: arm("CABLE") } },
    { id: "pranchas", title: "Pranchas", text: "Abra Pranchas (no alto, à direita): capa, plantas, vistas, cortes e o PDF.", done: !!flags.pranchas, action: { label: "Abrir as pranchas", run: () => (onDo(), useApp.getState().setSheetsOpen(true)) } },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="cfg-tutorial">
      <p className="cfg-lead">Primeiros passos: {done} de {steps.length} feitos. Cada passo se marca sozinho quando aparece na estrutura.</p>
      <ol>
        {steps.map((s) => (
          <li key={s.id} className={s.done ? "done" : ""}>
            <b>{s.done ? "✓ " : ""}{s.title}</b>
            <span>{s.text}</span>
            {s.action && !s.done && <button className="ghost" onClick={s.action.run}>{s.action.label}</button>}
          </li>
        ))}
      </ol>
      <div className="cfg-actions">
        <button className="ghost" onClick={() => (resetTutorial(), setFlags({}))}>Recomeçar o tutorial</button>
      </div>
    </div>
  );
}

/** Aparência: cor da chapa, fundo, eixos e animações. Vale ao recarregar. */
let appearanceDraft: Appearance | null = null; // a escolha não aplicada sobrevive à troca de aba
function AppearanceTab() {
  const [a, setDraft] = useState<Appearance>(() => appearanceDraft ?? readAppearance());
  const setA = (v: Appearance) => setDraft((appearanceDraft = v));
  const saved = readAppearance();
  const changed = JSON.stringify(a) !== JSON.stringify(saved);
  const opt = <K extends keyof Appearance>(k: K, label: string, values: [Appearance[K], string][]) => (
    <div className="cfg-row">
      <span className="cfg-label">{label}</span>
      <span className="segmented">
        {values.map(([v, t]) => (
          <button key={String(v)} className={a[k] === v ? "on" : ""} onClick={() => setA({ ...a, [k]: v })}>{t}</button>
        ))}
      </span>
    </div>
  );
  return (
    <div className="cfg-appearance">
      <p className="cfg-lead">Como a cena aparece só para você (fica neste navegador; não muda o projeto).</p>
      {opt("plate", "Chapa", [["preta", "Preta"], ["grafite", "Grafite"], ["clara", "Clara"]])}
      {opt("background", "Fundo da cena", [["claro", "Claro"], ["cinza", "Cinza"]])}
      {opt("axes", "Eixos X, Y, Z no canto", [[true, "Mostrar"], [false, "Esconder"]])}
      {opt("motion", "Animações dos painéis", [[true, "Com"], [false, "Sem"]])}
      <div className="cfg-actions">
        <button className="ghost" onClick={() => setA(DEFAULT_APPEARANCE)}>Padrão</button>
        <span className="cfg-grow" />
        <button className="primary" disabled={!changed} onClick={() => (saveAppearance(a), window.location.reload())}>Aplicar (recarrega)</button>
      </div>
    </div>
  );
}

/** Perfil: nome e equipe, que saem na capa das pranchas ("Gerado pelo siMOLAdor por …"). */
function ProfileTab() {
  const [p, setP] = useState<Profile>(readProfile);
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...p, [k]: e.target.value.slice(0, 60) };
    setP(next);
    saveProfile(next);
  };
  return (
    <div className="cfg-profile">
      <p className="cfg-lead">Fica neste navegador. Aparece na capa das pranchas, ao lado da data.</p>
      <label className="cfg-row"><span className="cfg-label">Nome</span><input value={p.name} onChange={set("name")} placeholder="Seu nome" /></label>
      <label className="cfg-row"><span className="cfg-label">Equipe</span><input value={p.team} onChange={set("team")} placeholder="Ex.: Poli Mola" /></label>
      <p className="cfg-foot">Os modelos enviados para a biblioteca online vão aparecer aqui quando ela existir.</p>
    </div>
  );
}

/** Idioma: hoje só português (os textos ainda não estão separados para tradução). */
function LanguageTab() {
  return (
    <div className="cfg-language">
      <p className="cfg-lead">O programa está em português.</p>
      <div className="cfg-row">
        <span className="cfg-label">Idioma</span>
        <span className="segmented">
          <button className="on">Português</button>
          <button disabled title="Em preparação">English</button>
          <button disabled title="Em preparação">Español</button>
        </span>
      </div>
      <p className="cfg-foot">Inglês e espanhol (o manual do Mola é bilíngue) dependem de separar os textos da interface para tradução: está nas próximas etapas.</p>
    </div>
  );
}

// ---------- Sobre (1.10.0): versão, novidades, instalar e relatório ----------

interface NewsEntry { title: string; items: string[] }

/** As últimas entregas do CHANGELOG.md (carregado só quando a aba abre). */
function parseNews(md: string, max = 4): NewsEntry[] {
  const out: NewsEntry[] = [];
  let cur: NewsEntry | null = null;
  for (const line of md.split("\n")) {
    if (line.startsWith("### ")) {
      if (out.length >= max) break;
      cur = { title: line.slice(4).trim(), items: [] };
      out.push(cur);
    } else if (line.startsWith("## ") && cur) {
      cur = null;
    } else if (cur && /^- /.test(line)) cur.items.push(line.slice(2));
    else if (cur && /^ {2,}- /.test(line) && cur.items.length) cur.items[cur.items.length - 1] += ` ${line.trim().slice(2)}`;
    else if (cur && line.trim() && !line.startsWith("|") && cur.items.length && !/^[#>]/.test(line)) cur.items[cur.items.length - 1] += ` ${line.trim()}`;
  }
  return out;
}

/** **negrito** e `código` do markdown, o resto como texto. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return <>{parts.map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>))}</>;
}

function AboutTab() {
  const canInstall = useApp((s) => s.canInstall);
  const updateReady = useApp((s) => s.updateReady);
  const [news, setNews] = useState<NewsEntry[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    void import("../../CHANGELOG.md?raw").then((m) => setNews(parseNews(m.default))).catch(() => setNews([]));
  }, []);
  const installed = isInstalled();
  const offline = offlineReady();
  return (
    <div className="cfg-about">
      <p className="about-name"><b>siMOLAdor</b> {VERSION}{EDITION ? ` · linha ${EDITION}` : ""}</p>
      <ul className="about-status">
        <li className={offline ? "ok" : ""}>{offline ? "✓ Guardado neste computador: abre mesmo sem internet." : "Ainda não está guardado para usar sem internet (abra pelo site, com internet, uma vez)."}</li>
        <li className={installed ? "ok" : ""}>
          {installed ? "✓ Aberto como aplicativo instalado." : canInstall ? (
            <>Dá para instalar como aplicativo (ícone próprio, janela própria). <button className="primary" onClick={() => void promptInstall()}>Instalar no computador</button></>
          ) : "Para instalar como aplicativo: no Chrome ou no Edge, menu ⋮ › Instalar siMOLAdor (ou o ícone na barra de endereço)."}
        </li>
        {updateReady && <li>Há uma versão nova pronta. <button className="primary" onClick={applyUpdate}>Atualizar</button></li>}
      </ul>
      <p className="about-sub">Novidades</p>
      {news === null ? <p className="cfg-foot">Carregando…</p> : news.length ? (
        <div className="about-news">
          {news.map((n) => (
            <section key={n.title}>
              <h4><Inline text={n.title} /></h4>
              <ul>{n.items.map((it, i) => <li key={i}><Inline text={it} /></li>)}</ul>
            </section>
          ))}
        </div>
      ) : <p className="cfg-foot">O histórico completo está no CHANGELOG do repositório.</p>}
      <p className="about-sub">Algo deu errado?</p>
      <p className="cfg-foot">Copie o relatório e mande para a equipe: versão, navegador, placa de vídeo, o tamanho da estrutura e os últimos erros (nada do seu perfil).</p>
      <div className="cfg-actions">
        <button className="ghost" onClick={() => void copyReport().then((r) => setCopied(r === "copiado" ? "Relatório copiado." : "Relatório baixado (.txt)."))}>Copiar relatório de erro</button>
        {copied && <span className="cfg-foot">{copied}</span>}
      </div>
      <p className="about-sub">Créditos</p>
      <p className="cfg-foot">Feito pela equipe Poli Mola, da Poli Building (Poli-USP), para o Desafio Poli-USP. O Kit Mola é criação de Márcio Sequeira de Oliveira (molamodel.com). Código: github.com/polibuilding/simolador.</p>
    </div>
  );
}
