# siMOLAdor

Simulador de montagem 3D de estruturas com o [Kit Mola](https://molamodel.com) (Mola Structural Model), feito pela equipe Poli Mola da Poli Building. Você monta a estrutura no navegador, com as peças e o estoque reais dos kits, e o programa vai gerar as pranchas (plantas e vistas) no padrão do Desafio Poli-USP.

**Versão em uso:** https://polibuilding.github.io/simolador/ · versão atual **1.5** ("geométrica"); o que mudou em cada versão está em [CHANGELOG.md](CHANGELOG.md).

## O que já funciona

- **Todas as peças dos Kits 1 e 2**: ligação de base, barras B4/B6/B12, diagonais D4x6/D6x6/D6x12, placas P6x6/P6x12 (laje ou parede), ligações RC90, CC e CC90.
- **Encaixe**: pontos verdes mostram onde a peça escolhida entra. Sobre uma esfera, a barra sobe; puxando o cursor para um lado, ela vai para aquele lado; **R** alterna as opções.
- **Barras inclinadas**: por padrão as barras vão só nos eixos; segure **Shift** (ou ligue "Barras: Inclinadas", tecla **I**) para inclinar em passos de 15° nos planos X, Y e Z. Fechar entre duas esferas que estejam à distância da barra (triângulos) vale sempre. Uma barra que não alcança a esfera fica vermelha e o rodapé diz quanto faltou.
- **CC e CC90 nos 4 lados** da esfera (R troca o lado), menos onde chega uma barra transversal; o mesmo par aceita CC em vários lados.
- **Planos inclinados**: placas, diagonais, RC90, CC e CC90 também em quadros inclinados (treliças), desde que as esferas estejam no mesmo plano e nas distâncias certas.
- **Liga/desliga dos pontos** (Grade verde, Vão azul, Triângulo amarelo) ao lado de "Encaixe"; vale o ponto mais perto do cursor e **Tab** alterna entre pontos sobrepostos; com a grade desligada, a GC só vai para os pontos azuis/amarelos (malhas triangulares).
- **Guias da ligação de base**: ao colocar ou mover uma GC, pontos **azuis** a um vão de barra (4, 6 ou 12 módulos) de outra GC e **amarelos** no vértice de um triângulo de barras. A GC encaixa neles mesmo no modo Livre.
- **Coordenadas**: com uma GC selecionada, digite X e Z no painel (em módulos ou em mm); o painel mostra as distâncias às outras GC e quais batem com uma barra.
- **Regras do kit**: comprimentos, ângulo mínimo de 45° entre barras, nada deitado na chapa, diagonais só no vão nominal, placas presas em 4 esferas, ligações nos cantos certos, placa e diagonal sem dividir o mesmo ponto da esfera, RC90 fora do canto de uma diagonal, estoque. O motivo de cada bloqueio aparece no rodapé.
- **Editar**: selecionar; **mover** (M, botão ou arrastar a peça); **girar** (R, R, R… a peça continua selecionada); remover; desfazer e refazer; **Espaço** repete a última peça. Mover uma ligação de base leva a estrutura inteira; **Mover só o nó** (N ou Alt + arrastar) deixa o resto parado e as barras inclinam para acompanhar, se as ligações deixarem.
- **Várias chapas**: clique na chapa vazia para selecioná-la (menu fixo até Esc; Delete apaga); passe o mouse numa chapa para ver os + (acrescentar chapa ao lado) e o menu (distância 0/4/6/12 módulos ou livre, selecionar, exportar ou importar .mola, pranchas da chapa, apagar). Estruturas de chapas diferentes podem se ligar.
- **Copiar, colar, mover, espelhar e repetir**: Ctrl+C / Ctrl+V (a cópia segue o cursor; ↑/↓ altura, R gira, X/Z espelha), M move várias peças, e "Repetir" no painel cria N cópias com deslocamento. Esferas no mesmo lugar viram uma só (vãos e pavimentos se ligam sozinhos).
- **Seleção por retângulo**: para a direita pega o que fica inteiro dentro; para a esquerda, o que tocar. O painel mostra a lista de peças e as medidas do trecho, copia a lista e apaga tudo de uma vez.
- **Câmera**: cubo de vistas no canto (faces, arestas e cantos para isométricas) e Enquadrar (F), sem limite de altura; dá para olhar por baixo (a chapa fica translúcida); eixos X, Y, Z no canto.
- **Pranchas**: capa com isométrica renderizada (ou em linhas) e lista de peças, cotas entre eixos, totais e níveis (liga/desliga), etiquetas que se arrastam na tela, logos no carimbo, todas as chapas ou só algumas, plantas por pavimento e vistas A–D no padrão do Desafio Poli-USP; escala automática; carimbo editável; **PDF**, **DXF** (camadas MOLA-*) e SVG.
- Estoque configurável (a paleta mostra só as peças dos kits escolhidos), arquivos `.mola`, salvamento automático no navegador.

Exemplos em `examples/`: o pórtico simples e a **Estrutura 01 do Desafio 2022**, reconstruída a partir das pranchas originais.

Próximos passos: medidas reais da CC e da CC90, mover várias peças juntas, geodésicas (barras fora dos planos X, Y e Z), app local (fase 5).

## Como usar

1. Arraste uma **ligação de base** da paleta para a chapa.
2. Clique numa barra (por exemplo, **B6**) e passe o cursor sobre uma esfera: a barra sobe. Puxe o cursor para o lado para fazer vigas, ou leve-o até um ponto verde. Clique para encaixar.
3. **Shift** segurado inclina a barra (o ângulo segue o cursor); **R** alterna as opções; **Esc** para de colocar peças; **M** move a peça selecionada; **Delete** remove; **Ctrl+Z / Ctrl+Y** desfazem e refazem; **F** enquadra.
4. Na cena: botão **esquerdo** seleciona (arrastando, faz um retângulo de seleção); botão **direito** gira a vista; **Shift+direito** ou botão do meio move a vista; a roda dá zoom. O cubo no canto leva às vistas e isométricas. Shift+clique soma peças à seleção; Ctrl+A seleciona tudo.
5. **Gerar pranchas** abre as folhas; dali saem o PDF e o DXF.

## Medidas e quantidades das peças

Tudo sai de **`data/parametros.xlsx`**. Para mudar uma medida ou uma quantidade:

1. Edite a planilha (células amarelas). Ela explica as regras na aba Leia-me.
2. Envie a planilha nova para o repositório (no GitHub: abra a pasta `data`, depois *Add file → Upload files*).
3. A publicação regera `data/catalog.json` e `data/kits.json` sozinha e atualiza o site em alguns minutos.

Nunca edite os `.json` à mão.

## Para quem programa

```bash
npm install
npm run dados   # planilha → JSON
npm run dev     # http://localhost:5173/simolador/
npm test        # testes do núcleo
npm run build
```

Pastas: `src/core` (lógica pura e testada: modelo, regras, encaixe, estoque, histórico, arquivo `.mola`), `src/render` (cena Three.js), `src/interaction` (posicionamento), `src/ui` (interface), `tests/`, `scripts/gerar-dados.mjs`.

Tecnologia: TypeScript, React, Three.js (React Three Fiber), Zustand, Vite e Vitest. A publicação usa GitHub Actions e GitHub Pages ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)).
