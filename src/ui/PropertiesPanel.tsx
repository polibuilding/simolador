import { useEffect, useState } from "react";
import { catalog } from "../core/catalog";
import { available, usage } from "../core/inventory";
import { boardsOf, componentOf, DISP_AXIS, len, sub, toDisp, type Vec3 } from "../core/model";
import { boardCenter, boardName, boardSelection, boardSize, boardsGap } from "../core/boards";
import { NumField } from "../render/Boards";
import { Chevrons } from "./Palette";
import { ballsPerRoll, ropePlan, ropeSpec, ropeText, ropeInfo, stiffenerFor } from "../core/rope";
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
// na tela, Z é a altura: (X, Y, Z) = (x, z, y) do modelo
const posText = (p: Vec3) => `(${toDisp(p).map((v) => fmt(v, Number.isInteger(v) ? 0 : 2)).join("; ")})`;
const SIDE_NAME = (d: Vec3) =>
  d[1] > 0.5 ? "de cima" : d[1] < -0.5 ? "de baixo" : d[0] > 0.5 ? "+X" : d[0] < -0.5 ? "−X" : d[2] > 0.5 ? "+Y" : "−Y";
const AXIS_NAME = (d: Vec3) => (Math.abs(d[0]) > 0.99 ? "X" : Math.abs(d[1]) > 0.99 ? "vertical (Z)" : Math.abs(d[2]) > 0.99 ? "Y" : "inclinado");

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** Ações da peça selecionada. Mover: arrastar a peça leva a estrutura; duplo clique move só a peça. */
function Actions({ removeLabel, rotate = true }: { removeLabel: string; rotate?: boolean }) {
  const { rotate: doRotate, removeSelected } = useApp.getState();
  return (
    <div className="actions">
      {rotate && <button onClick={doRotate} title="R">Girar</button>}
      <button className="danger" onClick={removeSelected} title="Delete">{removeLabel}</button>
    </div>
  );
}

/** Bloco do painel com título pequeno. */
function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`psec ${className}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Como mover a peça (no lugar dos antigos botões). */
/** "B6 ×3 · D6x6 ×1" */
const countText = (codes: string[]) => {
  const c = new Map<string, number>();
  for (const k of codes) c.set(k, (c.get(k) ?? 0) + 1);
  return [...c].sort().map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(" · ") || "—";
};

/** Direção de uma barra, em palavras. */
function directionText(a: Vec3, b: Vec3): string {
  const v = sub(b, a);
  const L = len(v) || 1;
  const elev = (Math.asin(Math.min(1, Math.abs(v[1]) / L)) * 180) / Math.PI;
  if (elev > 89.5) return "vertical (Z)";
  const az = ((Math.atan2(v[2], v[0]) * 180) / Math.PI + 360) % 180; // em planta, a partir de X
  const plan = az < 0.5 || az > 179.5 ? "em X" : Math.abs(az - 90) < 0.5 ? "em Y" : `${fmt(az, 0)}° em planta (a partir de X)`;
  return elev < 0.5 ? `horizontal, ${plan}` : `inclinada: ${fmt(elev, 0)}° com a horizontal, ${plan}`;
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
const scaleV = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
const fieldText = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });

/**
 * Posição por coordenadas.
 * Na tela, Z é a altura (índices do modelo: 0 = X, 2 = Y, 1 = Z).
 * GC: X e Y levam junto a estrutura ligada (como Mover estrutura).
 * Esfera: X, Y e Z movem só o nó; as barras acompanham, e ele vai para o ponto possível mais perto.
 */
function CoordEditor({ id, pos, support }: { id: string; pos: Vec3; support: boolean }) {
  const axes = support ? ([0, 2] as const) : ([0, 2, 1] as const);
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
      <span>{DISP_AXIS[k]}</span>
      <input
        value={vals[k]}
        inputMode="decimal"
        onChange={(e) => setVals((o) => o.map((x, i) => (i === k ? e.target.value : x)))}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
          if (e.key === "Escape") (reset(), (e.target as HTMLInputElement).blur());
        }}
        aria-label={`Coordenada ${DISP_AXIS[k]} em módulos`}
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
        Em módulos (1 M = {fmt(M, 2)} mm) ou em mm (77,3 mm).
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
    const members = Object.values(model.members).filter((m) => m.a === n.id || m.b === n.id);
    const conns = Object.values(model.connectors).filter((c) => c.node === n.id);
    const plates = Object.values(model.plates).filter((p) => p.corners.includes(n.id));
    const group = componentOf(model, n.id).size;
    const gc = n.kind === "support";
    return (
      <>
        <h2>{gc ? "Ligação de base (GC)" : "Esfera (C)"}</h2>
        <Section title="Posição e geometria">
          <CoordEditor id={n.id} pos={n.pos} support={gc} />
          <dl>
            <Row k="Altura do centro" v={`${fmt(catalog.settings.gc_centro_esfera_mm + n.pos[1] * M)} mm acima da chapa`} />
          </dl>
          {gc && <Distances id={n.id} />}
        </Section>
        <Section title="Ligações">
          <dl>
            <Row k="Molas e diagonais" v={`${members.length ? countText(members.map((m) => m.code)) : "nenhuma"}`} />
            {conns.length > 0 && <Row k="Ligações" v={countText(conns.map((c) => c.code))} />}
            {plates.length > 0 && <Row k="Placas" v={countText(plates.map((p) => p.code))} />}
            <Row k="Estrutura" v={`${group} ${group === 1 ? "nó" : "nós"} ligados`} />
          </dl>
        </Section>
        <Actions removeLabel={gc ? "Remover GC e o que sai dela" : "Remover esfera e peças ligadas"} />
      </>
    );
  }
  if (sel.kind === "member") {
    const m = model.members[sel.id];
    if (!m) return null;
    const p = catalog.pieces[m.code];
    const A = model.nodes[m.a].pos;
    const B = model.nodes[m.b].pos;
    const span = len(sub(B, A));
    const cable = p?.type === "cable";
    const lengthMm = Number(cable ? p?.geometry.cableLengthMm : p?.geometry.lengthMm);
    const atEnd = (id: string) => Object.values(model.members).filter((x) => x.id !== m.id && (x.a === id || x.b === id)).map((x) => x.code);
    const conns = Object.values(model.connectors).filter((c) => c.node === m.a || c.node === m.b);
    if (p?.type === "rope") {
      const info = ropeInfo(catalog, A, B);
      const cut = ropePlan(catalog, model).cuts.findIndex((c) => c.id === m.id);
      return (
        <>
          <h2>Cabo <span className="code-chip">CABLE</span></h2>
          <Section title="Posição e geometria">
            <dl>
              <Row k="Entre os centros das esferas" v={`${fmt(span, 2)} módulos = ${fmt(span * M)} mm`} />
              <Row k="Pedaço de cabo" v={info ? ropeText(info.balls, info.cutMm) : "curto demais"} />
              {info && <Row k="Esticador (CABLE C)" v={`absorve ${fmt(info.slackMm)} mm`} />}
              {cut >= 0 && <Row k="No plano de corte" v={`pedaço ${cut + 1}`} />}
              <Row k="Direção" v={directionText(A, B)} />
              <Row k="De" v={posText(A)} />
              <Row k="Até" v={posText(B)} />
            </dl>
          </Section>
          <Section title="Ligações">
            <dl>
              <Row k="Montagem" v="esfera · CABLE C · CABLE CLIP C · cabo · CABLE CLIP C · CABLE C · esfera" />
              <Row k={`Na ponta ${posText(A)}`} v={atEnd(m.a).length ? countText(atEnd(m.a)) : "só este cabo"} />
              <Row k={`Na ponta ${posText(B)}`} v={atEnd(m.b).length ? countText(atEnd(m.b)) : "só este cabo"} />
            </dl>
          </Section>
          <Actions removeLabel="Remover cabo" />
        </>
      );
    }
    const bs = m.stiff ? stiffenerFor(catalog, m.code) : null;
    return (
      <>
        <h2>{p?.name ?? m.code} <span className="code-chip">{m.code}</span></h2>
        <Section title="Posição e geometria">
          <dl>
            <Row k="Vão (centro a centro)" v={`${fmt(span, cable ? 2 : Number.isInteger(span) ? 0 : 2)} módulos = ${fmt(span * M)} mm`} />
            <Row k={cable ? "Comprimento do cabo" : "Comprimento da mola"} v={`${fmt(lengthMm)} mm`} />
            {bs && <Row k="Enrijecedor" v={`${bs} (mola rígida)`} />}
            <Row k="Direção" v={directionText(A, B)} />
            <Row k="De" v={posText(A)} />
            <Row k="Até" v={posText(B)} />
          </dl>
        </Section>
        <Section title="Ligações">
          <dl>
            <Row k={`Na ponta ${posText(A)}`} v={atEnd(m.a).length ? countText(atEnd(m.a)) : "só esta peça"} />
            <Row k={`Na ponta ${posText(B)}`} v={atEnd(m.b).length ? countText(atEnd(m.b)) : "só esta peça"} />
            {conns.length > 0 && <Row k="Ligações nas pontas" v={countText(conns.map((c) => c.code))} />}
          </dl>
        </Section>
        <Actions removeLabel={cable ? "Remover diagonal" : "Remover mola"} />
      </>
    );
  }
  if (sel.kind === "plate") {
    const pl = model.plates[sel.id];
    if (!pl) return null;
    const p = catalog.pieces[pl.code];
    const cs = pl.corners.map((c) => model.nodes[c].pos);
    const ys = cs.map((q) => q[1]);
    const horizontal = ys.every((y) => Math.abs(y - ys[0]) < 1e-6);
    const center = scaleV(cs.reduce((acc, q) => [acc[0] + q[0], acc[1] + q[1], acc[2] + q[2]] as Vec3, [0, 0, 0] as Vec3), 0.25);
    const vertical = !horizontal && Math.abs(Math.max(...ys) - Math.min(...ys)) > 1e-6 && cs.some((q, i) => cs.some((r, j) => i !== j && Math.abs(q[0] - r[0]) < 1e-6 && Math.abs(q[2] - r[2]) < 1e-6));
    return (
      <>
        <h2>{p?.name ?? pl.code} <span className="code-chip">{pl.code}</span></h2>
        <Section title="Posição e geometria">
          <dl>
            <Row k="Orientação" v={horizontal ? `laje, no nível z = ${fmt(ys[0], Number.isInteger(ys[0]) ? 0 : 2)} M` : vertical ? "parede (vertical)" : "inclinada"} />
            <Row k="Centro" v={posText(center)} />
            <Row k="Tamanho" v={`${fmt(Number(p?.geometry.lengthMm))} × ${fmt(Number(p?.geometry.widthMm))} mm`} />
            <Row k="Espessura" v={`${fmt(Number(p?.geometry.thicknessMm))} mm (${STATUS_TEXT.estimado})`} />
          </dl>
        </Section>
        <Section title="Ligações">
          <dl>
            <Row k="Esferas nos cantos" v={cs.map(posText).join(" ")} />
          </dl>
        </Section>
        <Actions removeLabel="Remover placa" />
      </>
    );
  }
  const c = model.connectors[sel.id];
  if (!c) return null;
  const p = catalog.pieces[c.code];
  const bars = Object.values(model.members).filter((m) => (m.a === c.node || m.b === c.node) && catalog.pieces[m.code]?.type === "bar");
  return (
    <>
      <h2>{p?.name ?? c.code} <span className="code-chip">{c.code}</span></h2>
      <Section title="Posição e geometria">
        <dl>
          <Row k="Na esfera" v={posText(model.nodes[c.node].pos)} />
          <Row
            k={c.code === "RC90" ? "Canto" : "Par contínuo"}
            v={c.code === "RC90" ? (c.base ? "entre a GC e o pilar" : `${AXIS_NAME(c.dirs[0])} com ${AXIS_NAME(c.dirs[1])}`) : `molas no eixo ${AXIS_NAME(c.dirs[0])}${c.side ? `, lado ${SIDE_NAME(c.side)}` : ""} (R troca o lado)`}
          />
        </dl>
      </Section>
      <Section title="Ligações">
        <dl>
          <Row k="Molas na esfera" v={countText(bars.map((m) => m.code))} />
        </dl>
      </Section>
      <Actions removeLabel="Remover ligação" />
    </>
  );
}

/** Chapa selecionada (clique na chapa vazia): nome, centro, giro; setas movem nos eixos dela. */
function BoardSelected() {
  const model = useModel();
  const id = useApp((s) => s.selectedBoard)!;
  const extra = useApp((s) => s.boardExtra);
  const b = boardsOf(model).find((x) => x.id === id);
  const [name, setName] = useState(b ? boardName(b) : "");
  useEffect(() => setName(b ? boardName(b) : ""), [b?.name, id]);
  if (!b) return null;
  if (extra.length) return <BoardsSelected />;
  const st = useApp.getState();
  const err = (e: string | null) => (e && useApp.setState({ hint: e }), e);
  const pieces = boardSelection(catalog, model, id).length;
  const { w, d } = boardSize(catalog);
  const [cx, cz] = boardCenter(catalog, b);
  const rot = b.rot ?? 0;
  return (
    <>
      <input
        className="board-name"
        value={name}
        aria-label="Nome da chapa"
        title="Nome da chapa (aparece no menu, nas pranchas e nos arquivos). Vazio = nome padrão."
        onChange={(e) => setName(e.target.value)}
        onBlur={() => st.renameBoardOf(id, name)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <dl>
        <Row k="Tamanho" v={`${w} × ${d} módulos = ${fmt(w * M, 0)} × ${fmt(d * M, 0)} mm`} />
        <Row k="Peças em cima" v={pieces} />
      </dl>
      <div className="board-fields">
        <label>Centro X <NumField value={cx} onCommit={(v) => err(st.setBoardCenterOf(id, v, cz))} title="Centro da chapa em X, em módulos (decimais valem)" width={64} suffix=" M" /></label>
        <label>Centro Y <NumField value={cz} onCommit={(v) => err(st.setBoardCenterOf(id, cx, v))} title="Centro da chapa em Y, em módulos (decimais valem)" width={64} suffix=" M" /></label>
        <p className="board-mm">= ({fmt(cx * M, 1)}; {fmt(cz * M, 1)}) mm</p>
        <label className="stack" title="Graus, anti-horário visto de cima">Giro
          <span className="board-gap">
            <button onClick={() => err(st.rotateBoardOf(id, rot - 15))} title="15° no sentido horário (visto de cima)">↻ 15°</button>
            <button className={rot === 0 ? "on" : ""} onClick={() => err(st.rotateBoardOf(id, 0))}>0°</button>
            <button onClick={() => err(st.rotateBoardOf(id, rot + 15))} title="15° no sentido anti-horário (visto de cima)">↺ 15°</button>
            <NumField value={rot} onCommit={(v) => err(st.rotateBoardOf(id, v))} title="Giro livre em graus (anti-horário visto de cima), em torno do centro" suffix="°" />
          </span>
        </label>
      </div>
      <div className="actions">
        <button onClick={() => st.selectBoard(id)}>Selecionar peças</button>
        <button className="danger" onClick={() => st.removeSelectedBoard()}>Apagar chapa</button>
      </div>
    </>
  );
}

/** Várias chapas (Ctrl+clique): distância entre elas, na ordem em que foram escolhidas. */
function BoardsSelected() {
  const model = useModel();
  const first = useApp((s) => s.selectedBoard)!;
  const extra = useApp((s) => s.boardExtra);
  const st = useApp.getState();
  const all = boardsOf(model);
  const sel = [first, ...extra].map((id) => all.find((b) => b.id === id)).filter(Boolean) as typeof all;
  const gaps = sel.slice(1).map((b, i) => boardsGap(catalog, sel[i], b).gap);
  const same = gaps.every((g) => Math.abs(g - gaps[0]) < 1e-6);
  const err = (e: string | null) => (e && useApp.setState({ hint: e }), e);
  return (
    <>
      <h2>{sel.length} chapas</h2>
      <ol className="board-list">
        {sel.map((b, i) => (
          <li key={b.id}>
            <strong>{boardName(b)}</strong>
            {i > 0 && <span> · {fmt(gaps[i - 1], Number.isInteger(gaps[i - 1]) ? 0 : 2)} M da anterior</span>}
          </li>
        ))}
      </ol>
      <div className="board-fields">
        <label className="stack">Distância entre elas (módulos)
          <span className="board-gap">
            {[0, 4, 6, 12].map((g) => (
              <button key={g} className={same && Math.abs(gaps[0] - g) < 1e-6 ? "on" : ""} onClick={() => err(st.setBoardsGapOf(g))} title={`${g} módulos (${fmt(g * M, 0)} mm)`}>{g}</button>
            ))}
            <NumField value={same ? gaps[0] : NaN} onCommit={(v) => err(st.setBoardsGapOf(v))} title="Distância livre entre as chapas, em módulos (decimais valem)" suffix=" M" />
          </span>
        </label>
      </div>
      <p className="multi-note">A primeira fica parada.</p>
      <div className="actions">
        <button className="danger" onClick={() => st.removeSelectedBoard()}>Apagar as {sel.length} chapas</button>
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
        <p className="lead">Arraste uma <strong>GC</strong> para a chapa e puxe as molas a partir da esfera. <strong>?</strong> mostra os atalhos.</p>
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
            {!inventory.unlimited && <th>Restam</th>}
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => {
            const total = available(catalog, inventory, c);
            if (c === "CABLE") {
              const plan = ropePlan(catalog, model);
              const rest = Number.isFinite(total) ? total * ropeSpec(catalog).roll - plan.mm : Infinity;
              return (
                <tr key={c} className={rest < 0 ? "over" : ""}>
                  <td>{c}</td>
                  <td>{plan.cuts.length} {plan.cuts.length === 1 ? "pedaço" : "pedaços"}</td>
                  {!inventory.unlimited && <td>{Number.isFinite(rest) ? `${fmt(rest / 10, 0)} cm` : "∞"}</td>}
                </tr>
              );
            }
            return (
              <tr key={c} className={Number.isFinite(total) && total - used[c] < 0 ? "over" : ""}>
                <td>{c}</td>
                <td>{used[c]}</td>
                {!inventory.unlimited && <td>{Number.isFinite(total) ? total - used[c] : "∞"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <RopeSummary />
      <Section title="Estabilidade" className="future">
        <p className="soon">Em breve</p>
      </Section>
    </>
  );
}

/** Cabo (Kit 3): quanto foi usado (cm | bolinhas) e o plano de corte de cada rolo. */
export function RopeSummary() {
  const model = useModel();
  const inventory = useApp((s) => s.inventory);
  const plan = ropePlan(catalog, model);
  if (!plan.cuts.length) return null;
  const sp = ropeSpec(catalog);
  const rolls = available(catalog, inventory, "CABLE");
  const limited = Number.isFinite(rolls);
  const cm = (mm: number) => fmt(mm / 10, 1);
  const order = new Map(plan.cuts.map((c, i) => [c.id, i + 1]));
  return (
    <Section title="Cabo">
      <p className="rope-total">
        {limited ? (
          <>
            <b>{cm(plan.mm)}</b>/{cm(rolls * sp.roll)} cm | <b>{plan.balls}</b>/{rolls * ballsPerRoll(sp)} bolinhas
          </>
        ) : (
          <>
            <b>{cm(plan.mm)}</b> cm | <b>{plan.balls}</b> bolinhas · {plan.rolls.length} {plan.rolls.length === 1 ? "rolo" : "rolos"}
          </>
        )}
      </p>
      {plan.rolls.map((r, i) => (
        <div key={i} className="rope-roll">
          <p className="rope-roll-title">
            Rolo {i + 1}: cortar {r.length} {r.length === 1 ? "pedaço" : "pedaços"} · sobram {ballsPerRoll(sp) - r.reduce((n, c) => n + c.balls, 0)} bolinhas
          </p>
          <ol>
            {r.map((c) => (
              <li key={c.id} value={order.get(c.id)}>
                {ropeText(c.balls, c.cutMm)}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </Section>
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
        {field(2, "Y")}
        {field(1, "Z")}
        <label className="coord">
          <span>Vezes</span>
          <input value={times} inputMode="numeric" onChange={(e) => setTimes(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} aria-label="Quantas cópias" />
        </label>
      </div>
      <button onClick={apply} className="repeat-go">Criar cópias</button>
      <p className="coords-help">Cada cópia anda X, Y, Z módulos da anterior.</p>
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
        <button onClick={() => useApp.getState().copySelection()} title="Ctrl+C; depois Ctrl+V cola (R gira, X/Y espelha, ↑/↓ altura)">Copiar peças</button>
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

export function PropertiesPanel({ hidden = false }: { hidden?: boolean }) {
  const sel = useApp((s) => s.selection);
  const many = useApp((s) => s.multi.length > 0);
  const board = useApp((s) => s.selectedBoard);
  // o painel só abre e fecha pelas setas (« »): selecionar uma peça não o abre; aberto, mostra a peça selecionada
  const close = () => useApp.getState().setPropsOpen(false);
  return (
    <aside className={`props${hidden ? " is-hidden" : ""}`} aria-hidden={hidden || undefined}>
      <button className="props-close" onClick={close} title="Recolher o resumo" aria-label="Recolher o resumo"><Chevrons dir="right" /></button>
      {many ? <MultiSelected /> : sel ? <Selected /> : board ? <BoardSelected /> : <Summary />}
    </aside>
  );
}

/** Resumo recolhido: só a seta « transparente no canto de cima, à direita (como a » da paleta). */
export function SummaryTab({ hidden = false }: { hidden?: boolean }) {
  const model = useModel();
  const n = Object.keys(model.nodes).length + Object.keys(model.members).length + Object.keys(model.plates).length + Object.keys(model.connectors).length;
  return (
    <button className={`summary-open${hidden ? " is-hidden" : ""}`} tabIndex={hidden ? -1 : undefined} onClick={() => useApp.getState().setPropsOpen(true)} title={`Abrir o resumo${n ? ` · ${n} peças` : ""}`} aria-label="Abrir o resumo">
      <Chevrons dir="left" />
    </button>
  );
}

/** Nome da peça selecionada, bem de leve no canto de baixo, à direita (sem precisar abrir o resumo). */
export function SelectionTag() {
  const model = useModel();
  const sel = useApp((s) => s.selection);
  const multi = useApp((s) => s.multi.length);
  const board = useApp((s) => s.selectedBoard);
  const extra = useApp((s) => s.boardExtra.length);
  const open = useApp((s) => s.propsOpen);
  let text = "";
  if (multi) text = `${multi} peças selecionadas`;
  else if (sel?.kind === "node") {
    const n = model.nodes[sel.id];
    if (n) text = `${n.kind === "support" ? "GC" : "Esfera (C)"} · ${posText(n.pos)}`;
  } else if (sel) {
    const code = sel.kind === "member" ? model.members[sel.id]?.code : sel.kind === "plate" ? model.plates[sel.id]?.code : model.connectors[sel.id]?.code;
    const name = code ? catalog.pieces[code]?.name : undefined;
    if (code) text = !name || name === code ? code : name.includes(code) ? name : `${code} · ${name}`;
    if (sel.kind === "member" && model.members[sel.id]) {
      const mb = model.members[sel.id];
      if (catalog.pieces[mb.code]?.type === "rope") {
        const info = ropeInfo(catalog, model.nodes[mb.a].pos, model.nodes[mb.b].pos);
        text = `Cabo${info ? ` · ${ropeText(info.balls, info.cutMm)}` : ""}`;
      } else if (mb.stiff) text += " · com enrijecedor";
    }
    if (sel.kind === "connector" && model.connectors[sel.id]) text += ` · ${posText(model.nodes[model.connectors[sel.id].node]?.pos ?? [0, 0, 0])}`;
  } else if (board) {
    const b = boardsOf(model).find((x) => x.id === board);
    if (b) text = extra ? `${extra + 1} chapas selecionadas` : boardName(b);
  }
  return (
    <span className={`selection-tag${text && !open ? "" : " is-hidden"}`} aria-live="polite">
      {text}
    </span>
  );
}
