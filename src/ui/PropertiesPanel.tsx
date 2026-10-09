import { useEffect, useState } from "react";
import { catalog } from "../core/catalog";
import { available, usage } from "../core/inventory";
import { boardsOf, componentOf, len, sub, type Vec3 } from "../core/model";
import { boardGap, boardSelection, boardSize } from "../core/boards";
import { useApp, useModel } from "./store";

const M = catalog.settings.modulo_mm;
const STATUS_TEXT: Record<string, string> = {
  desenho: "pranchas do Desafio 2022",
  calculado: "calculada pela regra",
  estimado: "estimativa",
  medido: "medida no kit",
  confirmado: "confirmada pela equipe",
  "a medir": "ainda a medir (formato provisório)",
};
const fmt = (n: number, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const posText = (p: Vec3) => `(${p.map((v) => fmt(v, Number.isInteger(v) ? 0 : 2)).join("; ")})`;
const SIDE_NAME = (d: Vec3) =>
  d[1] > 0.5 ? "de cima" : d[1] < -0.5 ? "de baixo" : d[0] > 0.5 ? "+X" : d[0] < -0.5 ? "−X" : d[2] > 0.5 ? "+Z" : "−Z";
const AXIS_NAME = (d: Vec3) => (Math.abs(d[0]) ? "X" : Math.abs(d[1]) ? "vertical (Y)" : "Z");

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function Actions({ moveLabel, removeLabel, nodeOnly }: { moveLabel: string; removeLabel: string; nodeOnly?: boolean }) {
  const { startMove, startMoveNode, rotate, removeSelected } = useApp.getState();
  return (
    <div className="actions">
      <button onClick={() => startMove(false)} title="M, ou arraste a peça">{moveLabel}</button>
      {nodeOnly && (
        <button onClick={() => startMoveNode(false)} title="N, ou Alt + arrastar: o resto fica parado e as barras inclinam para acompanhar">
          Mover só o nó
        </button>
      )}
      <button onClick={rotate} title="R">Girar</button>
      <button className="danger" onClick={removeSelected} title="Delete">{removeLabel}</button>
    </div>
  );
}

/** Texto do campo → módulos. Aceita "5,196" (módulos) ou "77,3 mm". */
function parseCoord(t: string): number | null {
  const raw = t.trim().toLowerCase().replace(",", ".");
  const mm = raw.endsWith("mm");
  const body = raw.replace(/mm$/, "").trim();
  const v = Number(body);
  if (!body || !Number.isFinite(v)) return null;
  return mm ? v / M : v;
}
const fieldText = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });

/**
 * Posição por coordenadas.
 * GC: X e Z levam junto a estrutura ligada (como Mover estrutura).
 * Esfera: X, Y e Z movem só o nó; as barras acompanham, e ele vai para o ponto possível mais perto.
 */
function CoordEditor({ id, pos, support }: { id: string; pos: Vec3; support: boolean }) {
  const axes = support ? ([0, 2] as const) : ([0, 1, 2] as const);
  const [vals, setVals] = useState<string[]>(pos.map(fieldText));
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    setVals(pos.map(fieldText));
    setErr(null);
  }, [id, pos[0], pos[1], pos[2]]);
  const apply = () => {
    const v = vals.map(parseCoord);
    if (axes.some((k) => v[k] === null)) return setErr("Use números em módulos (ex.: 5,196) ou em mm (ex.: 77,3 mm).");
    const target: Vec3 = [v[0] ?? pos[0], support ? pos[1] : (v[1] ?? pos[1]), v[2] ?? pos[2]];
    setNote(null);
    if (support) return setErr(useApp.getState().moveNodeTo(id, target));
    const r = useApp.getState().moveNodeExact(id, target);
    setErr(r.error ?? null);
    setNote(r.note ?? null);
  };
  const reset = () => (setVals(pos.map(fieldText)), setErr(null), setNote(null));
  const field = (k: 0 | 1 | 2) => (
    <label className="coord" key={k}>
      <span>{"XYZ"[k]}</span>
      <input
        value={vals[k]}
        inputMode="decimal"
        onChange={(e) => setVals((o) => o.map((x, i) => (i === k ? e.target.value : x)))}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
          if (e.key === "Escape") (reset(), (e.target as HTMLInputElement).blur());
        }}
        aria-label={`Coordenada ${"XYZ"[k]} em módulos`}
      />
    </label>
  );
  return (
    <div className="coords">
      <div className={`coords-row${support ? "" : " four"}`}>
        {axes.map(field)}
        <button onClick={apply}>Aplicar</button>
      </div>
      <p className="coords-help">
        Em módulos (1 M = {fmt(M, 2)} mm) ou em mm (ex.: 77,3 mm). Enter aplica.{" "}
        {support ? "A estrutura ligada vai junto." : "Só a esfera anda; as barras inclinam para acompanhar (Y = altura)."}
      </p>
      {note && <p className="coords-help"><strong>{note}</strong></p>}
      {err && <p className="coords-err" role="alert">{err}</p>}
    </div>
  );
}

/** Distâncias desta GC às outras, marcando as que batem com o vão de uma barra. */
function Distances({ id }: { id: string }) {
  const model = useModel();
  const n = model.nodes[id];
  const tol = catalog.settings.tolerancia_encaixe_mm / M;
  const bars = Object.values(catalog.pieces).filter((p) => p.type === "bar" && p.spanM).map((p) => ({ code: p.code, span: p.spanM![0] }));
  const others = Object.values(model.nodes)
    .filter((o) => o.kind === "support" && o.id !== id)
    .map((o) => {
      const d = len(sub(o.pos, n.pos));
      return { o, d, bar: bars.find((b) => Math.abs(b.span - d) <= tol)?.code };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
  if (!others.length) return null;
  return (
    <table className="bom dist">
      <thead>
        <tr>
          <th>Até a GC</th>
          <th>Distância</th>
          <th>Barra</th>
        </tr>
      </thead>
      <tbody>
        {others.map(({ o, d, bar }) => (
          <tr key={o.id} className={bar ? "match" : ""}>
            <td>{posText(o.pos)}</td>
            <td>{fmt(d, 2)} M · {fmt(d * M, 1)} mm</td>
            <td>{bar ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Selected() {
  const model = useModel();
  const sel = useApp((s) => s.selection)!;
  if (sel.kind === "node") {
    const n = model.nodes[sel.id];
    if (!n) return null;
    const links = Object.values(model.members).filter((m) => m.a === n.id || m.b === n.id).length;
    const group = componentOf(model, n.id).size;
    return (
      <>
        <h2>{n.kind === "support" ? "Ligação de base (GC)" : "Esfera (C)"}</h2>
        <dl>
          <Row k="Posição (módulos)" v={posText(n.pos)} />
          <Row k="Altura do centro" v={`${fmt(catalog.settings.gc_centro_esfera_mm + n.pos[1] * M)} mm`} />
          <Row k="Peças ligadas" v={links} />
          <Row k="Mover e girar" v={`levam a estrutura inteira (${group} ${group === 1 ? "nó" : "nós"})`} />
        </dl>
        <CoordEditor id={n.id} pos={n.pos} support={n.kind === "support"} />
        {n.kind === "support" && <Distances id={n.id} />}
        <Actions nodeOnly moveLabel="Mover estrutura" removeLabel={n.kind === "support" ? "Remover GC e o que sai dela" : "Remover esfera e peças ligadas"} />
      </>
    );
  }
  if (sel.kind === "member") {
    const m = model.members[sel.id];
    if (!m) return null;
    const p = catalog.pieces[m.code];
    const span = len(sub(model.nodes[m.b].pos, model.nodes[m.a].pos));
    const cable = p?.type === "cable";
    const lengthMm = Number(cable ? p?.geometry.cableLengthMm : p?.geometry.lengthMm);
    return (
      <>
        <h2>{p?.name ?? m.code}</h2>
        <dl>
          <Row k="Vão" v={`${fmt(span, cable ? 2 : 0)} módulos = ${fmt(span * M)} mm entre centros`} />
          <Row k={cable ? "Comprimento do cabo" : "Comprimento da peça"} v={`${fmt(lengthMm)} mm`} />
          <Row k="De" v={posText(model.nodes[m.a].pos)} />
          <Row k="Até" v={posText(model.nodes[m.b].pos)} />
          <Row k="Trabalha a" v={cable ? "só tração" : "tração, compressão e flexão"} />
          <Row k="Origem da medida" v={STATUS_TEXT[p?.status ?? ""] ?? "—"} />
        </dl>
        <Actions moveLabel="Mover" removeLabel={cable ? "Remover diagonal" : "Remover barra"} />
      </>
    );
  }
  if (sel.kind === "plate") {
    const pl = model.plates[sel.id];
    if (!pl) return null;
    const p = catalog.pieces[pl.code];
    const ys = pl.corners.map((c) => model.nodes[c].pos[1]);
    const horizontal = ys.every((y) => y === ys[0]);
    return (
      <>
        <h2>{p?.name ?? pl.code}</h2>
        <dl>
          <Row k="Posição" v={horizontal ? `laje no nível ${fmt(ys[0], 0)}` : "parede (vertical)"} />
          <Row k="Tamanho" v={`${fmt(Number(p?.geometry.lengthMm))} × ${fmt(Number(p?.geometry.widthMm))} mm`} />
          <Row k="Espessura" v={`${fmt(Number(p?.geometry.thicknessMm))} mm (${STATUS_TEXT.estimado})`} />
        </dl>
        <Actions moveLabel="Mover" removeLabel="Remover placa" />
      </>
    );
  }
  const c = model.connectors[sel.id];
  if (!c) return null;
  const p = catalog.pieces[c.code];
  return (
    <>
      <h2>{p?.name ?? c.code}</h2>
      <dl>
        <Row k="Na esfera" v={posText(model.nodes[c.node].pos)} />
        <Row
          k={c.code === "RC90" ? "Canto" : "Par contínuo"}
          v={c.code === "RC90" ? (c.base ? "entre a GC e o pilar" : `${AXIS_NAME(c.dirs[0])} com ${AXIS_NAME(c.dirs[1])}`) : `barras no eixo ${AXIS_NAME(c.dirs[0])}${c.side ? `, lado ${SIDE_NAME(c.side)}` : ""} (R troca o lado)`}
        />
        <Row k="Origem da medida" v={STATUS_TEXT[p?.status ?? ""] ?? "—"} />
      </dl>
      <Actions moveLabel="Mover" removeLabel="Remover ligação" />
    </>
  );
}

/** Chapa selecionada (clique na chapa vazia). */
function BoardSelected() {
  const model = useModel();
  const id = useApp((s) => s.selectedBoard)!;
  const b = boardsOf(model).find((x) => x.id === id);
  if (!b) return null;
  const pieces = boardSelection(catalog, model, id).length;
  const gap = boardGap(catalog, model, b);
  const { w, d } = boardSize(catalog);
  return (
    <>
      <h2>Chapa {id.slice(1)}</h2>
      <dl>
        <Row k="Canto (módulos)" v={`(${fmt(b.x, Number.isInteger(b.x) ? 0 : 2)}; ${fmt(b.z, Number.isInteger(b.z) ? 0 : 2)})`} />
        <Row k="Tamanho" v={`${w} × ${d} módulos = ${fmt(w * M, 0)} × ${fmt(d * M, 0)} mm`} />
        {gap !== null && <Row k="Distância da vizinha" v={`${fmt(gap, Number.isInteger(gap) ? 0 : 2)} módulos (${fmt(gap * M)} mm) da chapa ${b.attach!.to.slice(1)}`} />}
        <Row k="Peças em cima" v={pieces} />
      </dl>
      <p className="multi-note">As opções da chapa ficam na borda dela, na cena. <strong>Delete</strong> apaga a chapa; <strong>Esc</strong> solta.</p>
      <div className="actions">
        <button onClick={() => useApp.getState().selectBoard(id)}>Selecionar peças</button>
        <button className="danger" onClick={() => useApp.getState().removeSelectedBoard()}>Apagar chapa</button>
      </div>
    </>
  );
}

function Summary() {
  const model = useModel();
  const inventory = useApp((s) => s.inventory);
  const used = usage(model);
  const nodes = Object.values(model.nodes);
  const codes = Object.keys(used).sort();
  if (!nodes.length) {
    return (
      <>
        <h2>Estrutura vazia</h2>
        <p className="lead">
          Arraste uma <strong>ligação de base</strong> para a chapa. Depois puxe as barras a partir das esferas.
        </p>
        <ul className="howto">
          <li>Os pontos verdes mostram onde a peça escolhida encaixa.</li>
          <li>Sobre uma esfera, a barra sai dela: R gira a direção.</li>
          <li>Clique numa peça da paleta para usá-la várias vezes; Esc para parar.</li>
          <li>Arraste a peça selecionada para mudar de lugar; R gira.</li>
        </ul>
        <ul className="mouse-help">
          <li>Botão esquerdo: seleciona; arrastando, faz um retângulo (para a direita, só o que fica inteiro dentro; para a esquerda, o que tocar).</li>
          <li>Botão direito: gira a vista. Shift+direito ou botão do meio: move a vista. Roda: zoom.</li>
          <li>Cubo no canto: clique numa face, aresta ou canto para vistas e isométricas. F enquadra.</li>
        </ul>
      </>
    );
  }
  const xs = nodes.map((n) => n.pos[0]);
  const ys = nodes.map((n) => n.pos[1]);
  const zs = nodes.map((n) => n.pos[2]);
  const span = (a: number[]) => (Math.max(...a) - Math.min(...a)) * M;
  const levels = new Set(ys.map((y) => Math.round(y * 100))).size;
  return (
    <>
      <h2>Resumo da estrutura</h2>
      <dl>
        <Row k="Planta" v={`${fmt(span(xs), 0)} × ${fmt(span(zs), 0)} mm`} />
        <Row k="Altura" v={`${fmt(span(ys), 0)} mm`} />
        <Row k="Níveis" v={levels} />
      </dl>
      <table className="bom">
        <thead>
          <tr>
            <th>Peça</th>
            <th>Usadas</th>
            <th>Restam</th>
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => {
            const total = available(catalog, inventory, c);
            return (
              <tr key={c} className={Number.isFinite(total) && total - used[c] < 0 ? "over" : ""}>
                <td>{c}</td>
                <td>{used[c]}</td>
                <td>{Number.isFinite(total) ? total - used[c] : "∞"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/** Repetir a seleção N vezes com um deslocamento (módulos). Padrão: um vão ao lado, em X. */
function Repeat({ size }: { size: Vec3 }) {
  const multiCount = useApp((s) => s.multi.length);
  const [d, setD] = useState<[string, string, string]>([fieldText(Math.round(size[0]) || 6), "0", "0"]);
  const [times, setTimes] = useState("1");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setErr(null), [multiCount]);
  const apply = () => {
    const v = d.map(parseCoord);
    const n = Number(times);
    if (v.some((x) => x === null) || !Number.isFinite(n) || n < 1) return setErr("Use números: deslocamento em módulos (ou mm) e vezes ≥ 1.");
    setErr(useApp.getState().repeatSelection(v as Vec3, n));
  };
  const field = (i: 0 | 1 | 2, label: string) => (
    <label className="coord">
      <span>{label}</span>
      <input value={d[i]} inputMode="decimal" onChange={(e) => setD((o) => { const c = [...o] as typeof o; c[i] = e.target.value; return c; })}
        onKeyDown={(e) => e.key === "Enter" && apply()} aria-label={`Deslocamento em ${label}`} />
    </label>
  );
  return (
    <div className="repeat">
      <h3>Repetir</h3>
      <div className="coords-row four">
        {field(0, "X")}
        {field(1, "Y")}
        {field(2, "Z")}
        <label className="coord">
          <span>Vezes</span>
          <input value={times} inputMode="numeric" onChange={(e) => setTimes(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} aria-label="Quantas cópias" />
        </label>
      </div>
      <button onClick={apply} className="repeat-go">Criar cópias</button>
      <p className="coords-help">Cada cópia anda X, Y, Z módulos da anterior. Esferas no mesmo lugar viram uma só: um vão repetido com X = largura dele divide os pilares.</p>
      {err && <p className="coords-err" role="alert">{err}</p>}
    </div>
  );
}

/** Várias peças selecionadas: lista por código e medidas do conjunto. */
function MultiSelected() {
  const model = useModel();
  const multi = useApp((s) => s.multi);
  const { removeSelected, select } = useApp.getState();
  const count: Record<string, number> = {};
  const nodeIds = new Set<string>();
  for (const s of multi) {
    if (s.kind === "node") {
      const n = model.nodes[s.id];
      if (!n) continue;
      count[n.kind === "support" ? "GC" : "C"] = (count[n.kind === "support" ? "GC" : "C"] ?? 0) + 1;
      nodeIds.add(n.id);
    } else if (s.kind === "member") {
      const m = model.members[s.id];
      if (!m) continue;
      count[m.code] = (count[m.code] ?? 0) + 1;
      nodeIds.add(m.a).add(m.b);
    } else if (s.kind === "plate") {
      const p = model.plates[s.id];
      if (!p) continue;
      count[p.code] = (count[p.code] ?? 0) + 1;
      p.corners.forEach((c) => nodeIds.add(c));
    } else {
      const c = model.connectors[s.id];
      if (!c) continue;
      count[c.code] = (count[c.code] ?? 0) + 1;
      nodeIds.add(c.node);
    }
  }
  const ps = [...nodeIds].map((id) => model.nodes[id]?.pos).filter(Boolean) as Vec3[];
  const span = (k: 0 | 1 | 2) => (ps.length ? (Math.max(...ps.map((p) => p[k])) - Math.min(...ps.map((p) => p[k]))) * M : 0);
  const codes = Object.keys(count).sort();
  const total = codes.reduce((s, c) => s + count[c], 0);
  const text = [
    `Seleção (${total} peças)`,
    ...codes.map((c) => `${c}\t${catalog.pieces[c]?.name ?? c}\t${count[c]}`),
    `Planta: ${fmt(span(0), 0)} x ${fmt(span(2), 0)} mm; altura: ${fmt(span(1), 0)} mm`,
  ].join("\n");
  return (
    <>
      <h2>{total} peças selecionadas</h2>
      <p className="multi-note">Shift+clique soma ou tira peças; Esc limpa.</p>
      <dl>
        <Row k="Planta (entre centros)" v={`${fmt(span(0), 0)} × ${fmt(span(2), 0)} mm`} />
        <Row k="Altura (entre centros)" v={`${fmt(span(1), 0)} mm`} />
      </dl>
      <table className="bom">
        <thead>
          <tr>
            <th>Peça</th>
            <th>Nome</th>
            <th>Qtd.</th>
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => (
            <tr key={c}>
              <td>{c}</td>
              <td>{catalog.pieces[c]?.name.replace(` ${c}`, "") ?? c}</td>
              <td>{count[c]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions" style={{ marginTop: 14 }}>
        <button onClick={() => useApp.getState().copySelection()} title="Ctrl+C; depois Ctrl+V cola (R gira, X/Z espelha, ↑/↓ altura)">Copiar peças</button>
        <button onClick={() => useApp.getState().startMoveSelection()} title="M ou Ctrl+X: leva as peças para outro lugar">Mover</button>
      </div>
      <Repeat size={[span(0) / M, span(1) / M, span(2) / M]} />
      <div className="actions multi" style={{ marginTop: 14 }}>
        <button onClick={() => navigator.clipboard?.writeText(text).then(() => useApp.setState({ hint: "Lista copiada." }), () => undefined)}>
          Copiar lista
        </button>
        <button onClick={() => select(null)}>Limpar seleção</button>
        <button className="danger" onClick={removeSelected}>Remover as {total} peças</button>
      </div>
    </>
  );
}

export function PropertiesPanel() {
  const sel = useApp((s) => s.selection);
  const many = useApp((s) => s.multi.length > 0);
  const board = useApp((s) => s.selectedBoard);
  return <aside className="props">{many ? <MultiSelected /> : sel ? <Selected /> : board ? <BoardSelected /> : <Summary />}</aside>;
}
