import { catalog } from "../core/catalog";
import { available, usage } from "../core/inventory";
import { len, sub, type Vec3 } from "../core/model";
import { useApp, useModel } from "./store";

const M = catalog.settings.modulo_mm;
const STATUS_TEXT: Record<string, string> = {
  desenho: "pranchas do Desafio 2022",
  calculado: "calculada pela regra",
  estimado: "estimativa",
  medido: "medida no kit",
  confirmado: "confirmada pela equipe",
  "a medir": "ainda a medir",
};
const fmt = (n: number, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const posText = (p: Vec3) => `(${p.map((v) => fmt(v, Number.isInteger(v) ? 0 : 2)).join("; ")})`;

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function Selected() {
  const model = useModel();
  const sel = useApp((s) => s.selection)!;
  const removeSelected = useApp((s) => s.removeSelected);
  if (sel.kind === "node") {
    const n = model.nodes[sel.id];
    if (!n) return null;
    const links = Object.values(model.members).filter((m) => m.a === n.id || m.b === n.id).length;
    return (
      <>
        <h2>{n.kind === "support" ? "Ligação de base (GC)" : "Esfera (C)"}</h2>
        <dl>
          <Row k="Posição (módulos)" v={posText(n.pos)} />
          <Row k="Altura do centro" v={`${fmt(catalog.settings.gc_centro_esfera_mm + n.pos[1] * M)} mm`} />
          <Row k="Peças ligadas" v={links} />
          {n.kind === "support" && <Row k="Esfera" v="embutida na GC" />}
        </dl>
        <button className="danger" onClick={removeSelected}>
          Remover {n.kind === "support" ? "ligação de base" : "esfera"} e barras ligadas
        </button>
      </>
    );
  }
  const m = model.members[sel.id];
  if (!m) return null;
  const p = catalog.pieces[m.code];
  const span = len(sub(model.nodes[m.b].pos, model.nodes[m.a].pos));
  return (
    <>
      <h2>{p?.name ?? m.code}</h2>
      <dl>
        <Row k="Vão" v={`${fmt(span, 0)} módulos = ${fmt(span * M)} mm entre centros`} />
        <Row k="Comprimento da peça" v={`${fmt(Number(p?.geometry.lengthMm ?? 0))} mm`} />
        <Row k="De" v={posText(model.nodes[m.a].pos)} />
        <Row k="Até" v={posText(model.nodes[m.b].pos)} />
        <Row k="Origem da medida" v={STATUS_TEXT[p?.status ?? ""] ?? "—"} />
      </dl>
      <button className="danger" onClick={removeSelected}>Remover barra</button>
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
          <li>Clique numa peça para usá-la várias vezes; Esc para parar.</li>
          <li>Verde encaixa; vermelho mostra o motivo na barra de baixo.</li>
          <li>Arraste com o botão esquerdo para girar a vista, com o direito para mover, e use a roda para zoom.</li>
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
              <tr key={c}>
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
