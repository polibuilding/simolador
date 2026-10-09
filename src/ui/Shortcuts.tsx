import { useApp } from "./store";

/** Atalhos do teclado, agrupados; os novos ficam em volta do W A S D (mão esquerda no teclado, direita no mouse). */
const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Vista",
    keys: [
      ["W A S D", "girar a vista (15° por toque)"],
      ["Shift + W A S D", "arrastar a vista"],
      ["F", "enquadrar a estrutura"],
      ["B", "inércia da vista (liga/desliga o freio)"],
    ],
  },
  {
    title: "Peças",
    keys: [
      ["Q / E", "peça anterior / seguinte do grupo (B4 ⇄ B6 ⇄ B12…)"],
      ["Espaço", "repetir a última peça"],
      ["R", "girar / alternar a opção no ponto"],
      ["1 · 2 · 3", "direção das barras: Eixos · 15° · Livre (I alterna)"],
      ["Shift (segurar)", "barra inclinada no modo Eixos"],
      ["Esc", "parar / limpar a seleção"],
    ],
  },
  {
    title: "Encaixe",
    keys: [
      ["G", "grade (pontos verdes)"],
      ["V", "vão (pontos azuis)"],
      ["T", "triângulos (pontos amarelos e laranja)"],
      ["Tab", "próximo ponto sobreposto (GC)"],
    ],
  },
  {
    title: "Editar",
    keys: [
      ["M", "mover a peça ou a seleção"],
      ["N", "mover só o nó (esfera selecionada)"],
      ["Delete", "apagar"],
      ["Ctrl + C / V / X", "copiar / colar / recortar e mover"],
      ["Ctrl + Z / Y", "desfazer / refazer"],
      ["Ctrl + A", "selecionar tudo"],
      ["Ctrl + S / O", "salvar / abrir .mola"],
    ],
  },
];

export function Shortcuts() {
  const open = useApp((s) => s.helpOpen);
  const setOpen = useApp((s) => s.setHelpOpen);
  if (!open) return null;
  return (
    <div className="shortcuts-backdrop" onClick={() => setOpen(false)}>
      <section className="shortcuts" role="dialog" aria-label="Atalhos do teclado" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Atalhos do teclado</h2>
          <button onClick={() => setOpen(false)} aria-label="Fechar">×</button>
        </header>
        <div className="shortcuts-grid">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.keys.map(([k, d]) => (
                  <div key={k}>
                    <dt>{k.split(" ").map((p, i) => (["+", "/", "·", "⇄"].includes(p) ? <span key={i}> {p} </span> : <kbd key={i}>{p}</kbd>))}</dt>
                    <dd>{d}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        <p className="shortcuts-foot">? ou H abre e fecha esta lista.</p>
      </section>
    </div>
  );
}
