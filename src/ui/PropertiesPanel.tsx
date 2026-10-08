import { catalog } from "../core/catalog";
import { available, usage } from "../core/inventory";
import { componentOf, len, sub, type Vec3 } from "../core/model";
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

function Actions({ moveLabel, removeLabel }: { moveLabel: string; removeLabel: string }) {
  const { startMove, rotate, removeSelected } = useApp.getState();
  return (
    <div className="actions">
      <button onClick={() => startMove(false)} title="M, ou arraste a peça">{moveLabel}</button>
      <button onClick={rotate} title="R">Girar</button>
      <button className="danger" onClick={removeSelected} title="Delete">{removeLabel}</button>
    </div>
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
        <Actions moveLabel="Mover estrutura" removeLabel={n.kind === "support" ? "Remover GC e o que sai dela" : "Remover esfera e peças ligadas"} />
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
  return <aside className="props">{many ? <MultiSelected /> : sel ? <Selected /> : <Summary />}</aside>;
}
