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
      ["P", "vista paralela / perspectiva"],
    ],
  },
  {
    title: "Peças",
    keys: [
      ["Q / E", "peça anterior / seguinte do grupo (B4 ⇄ B6 ⇄ B12…)"],
      ["Clique · Clique", "com uma mola na mão: esfera e outra esfera ligam as duas (a segunda anda se precisar)"],
      ["Espaço", "repetir a última peça"],
      ["R", "girar / alternar a opção no ponto"],
      ["4 · 5 · 6", "direção das barras: Eixos · passo · Livre (I alterna)"],
      ["Shift (segurar)", "barra inclinada no modo Eixos"],
      ["Enter", "o mesmo que clicar, no lugar do cursor (colocar, ligar, deixar o nó; sem ferramenta, seleciona a peça sob o cursor)"],
      ["Esc", "parar / limpar a seleção / fechar o resumo"],
      ["C", "abrir e fechar o resumo (a qualquer momento, até no meio de um comando)"],
    ],
  },
  {
    title: "Encaixe",
    keys: [
      ["1 · 2 · 3", "bolinhas do encaixe: grade (verde) · vão (azul) · triângulos (amarela e laranja)"],
      ["Tab", "mais opções: colocando uma peça, a próxima opção (como R); barra sobre uma esfera: pontos amarelos e laranja; GC: ponto sobreposto (Shift+Tab volta)"],
    ],
  },
  {
    title: "Editar",
    keys: [
      ["Arrastar", "segurar e arrastar uma peça move a estrutura inteira"],
      ["Duplo clique", "a peça anda e a estrutura acompanha o que as ligações deixam: caminho azul (1 grau de liberdade), livre (2 ou mais) ou travada · ligação: outro lugar"],
      ["Espaço (peça andando)", "próxima etapa: a posição desta fica e a forma dela trava; mexe só a próxima liberdade (só a peça → vizinhas → pavimento → estrutura toda). Shift+Espaço volta"],
      ["Tab (peça andando)", "referências do caminho: limites azul/vermelho, posições na horizontal/vertical e, na esfera de uma mola, as circunferências (Shift+Tab volta; ← / → também)"],
      ["Delete", "mola com enrijecedor: o primeiro tira o enrijecedor, o segundo apaga a mola"],
      ["M", "mover a peça ou a seleção"],
      ["N", "mover só o nó (esfera selecionada)"],
      ["Delete", "apagar"],
      ["Setas", "chapa selecionada: mover nos eixos dela (Shift: 6 M; Alt ou Ctrl: 1/4 M)"],
      ["Ctrl + clique", "somar outra chapa à seleção (distância entre chapas)"],
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
