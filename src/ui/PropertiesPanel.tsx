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
          v={c.code === "RC90" ? (c.base ? "entre a GC e o pilar" : `${AXIS_NAME(c.dirs[0])} com ${AXIS_NAME(c.dirs[1])}`) : `barras no eixo ${AXIS_NAME(c.dirs[0])}`}
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
          <li>Na cena: esquerdo gira, direito move, roda dá zoom. F enquadra.</li>
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

export function PropertiesPanel() {
  const sel = useApp((s) => s.selection);
  return <aside className="props">{sel ? <Selected /> : <Summary />}</aside>;
}
