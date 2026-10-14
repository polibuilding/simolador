# Histórico de versões do siMOLAdor

A versão aparece bem de leve no canto inferior direito do programa e no `package.json`. Cada versão tem uma etiqueta (tag) no Git (`v1.0`, `v1.1`…), que aponta para o código daquela versão.

## Linhas de versão

| Versão | Nome | O que traz |
|---|---|---|
| **1.x** | **Geométrica** | Montar a estrutura com as peças e as regras reais do kit e gerar as pranchas. É a que estamos fazendo. |
| 2.x | Arquitetônica | O módulo extra ajustável (em breve). |
| 3.x | De engenharia | Ferramentas para analisar deformação, estaticidade e estabilidade. |

Regra para numerar: sobe o número depois do ponto (1.5 → 1.6) quando entra uma mudança grande ou um conjunto de mudanças menores que muda o jeito de usar. Correções pequenas entram na versão seguinte, sem número próprio.

---

## 1.15 — Paleta e resumo deslizando, Arquivo em ícones, estoque com Kit 3 e Kit A · 13/10/2026
- **Recolher e abrir a paleta sem pulo**: a paleta agora fica por cima da cena e desliza; a cena não muda de tamanho e a estrutura desliza junto, suave, para o meio da parte visível (antes a cena era redimensionada e a imagem pulava). Os eixos e a barra de baixo acompanham.
- **Resumo no mesmo padrão**: **»** no canto de cima do painel recolhe; recolhido, fica só a **«** transparente no canto de cima da cena (o número de peças aparece ao passar o mouse). O painel entra deslizando.
- **Painel da peça**: sai o bloco Peça (Trabalha a, Origem da medida).
- **Arquivo**: no lugar do menu, ".mola" em cinza claro e os ícones **Novo**, **Abrir** e **Salvar** (Ctrl+O e Ctrl+S continuam).
- **Estoque**: linhas do **Kit 3** (em breve) e do **Kit A** (versões 2.x), ainda desativadas.
- **Símbolo do programa**: triângulos alternando azul e amarelo; por enquanto só na aba do navegador (saiu da barra de cima).
- O símbolo da diagonal grande (D6x12) não fica mais cortado no menu pequeno.

## 1.14 — Paleta recolhível e marca do siMOLAdor · 13/10/2026
- **Paleta de peças mais enxuta**: as bolinhas dos kits (verde = K1, vermelha = K2) ficam ao lado do código, numa linha só por peça.
- **Recolher a paleta**: a seta **«** no canto superior direito da aba vira um **menu pequeno** sobre a cena, como o de Encaixe, Barras e Vista, só com os símbolos (separados por grupo; o nome, o que resta e o total aparecem ao passar o mouse). Clicar ou arrastar um símbolo funciona como na paleta. A seta **»** acima dele devolve a paleta inteira. Quando falta altura (ou quando entrarem mais peças, como as do kit 3), o menu passa a ter **duas colunas**. O programa lembra a escolha.
- **Símbolos das diagonais** com comprimentos diferentes (D4x6 < D6x6 < D6x12), para distinguir de longe.
- **Marca**: o símbolo do siMOLAdor é o hexágono do Mola com os triângulos pintados no azul e amarelo da Poli Building (também no ícone da aba do navegador). O símbolo do Kit Mola leva a br.molamodel.com e o do grupo ao Instagram da Poli Building (abrem em outra aba).

## 1.13 — Mover com o mouse e painel da peça · 13/10/2026
- **Segurar e arrastar** qualquer peça move a estrutura inteira; **duplo clique** move só a peça. Na esfera (ou GC), o caminho possível aparece em azul: esfera translúcida (presa por uma mola), círculo tracejado (duas molas), círculo na chapa (GC) ou pontos; ela desliza pelo caminho e encaixa nas posições redondas. Na mola, placa ou ligação, o duplo clique a leva para outro lugar. Os botões "Mover estrutura" e "Mover só o nó" saíram.
- **Painel da peça** reorganizado: primeiro **Posição e geometria** (coordenadas, vão, comprimento, direção, orientação), depois **Ligações** (o que chega em cada ponta ou na esfera) e, nas molas, **Peça** (como trabalha, origem da medida).
- **Resumo**: bloco **Estabilidade** (em breve) depois da tabela de peças.
- O painel da direita abre **por cima da cena** (a cena não muda de tamanho ao selecionar; nada pula de lugar). O cubo de vistas e a barra de baixo se afastam dele.
- **Estoque**: menu mais limpo (sem a pergunta e sem Fechar); fecha com Esc ou clicando fora. Configurações e Simolar também.

## 1.12 — Interface leve · 13/10/2026
- **Visual mais limpo**: traços finos, cantos suaves, menos negrito; botões ligados só levemente tingidos.
- **Barra de cima**: logos pequenas + siMOLAdor, **Arquivo**, **Configurações** (engrenagem; por enquanto mostra os valores internos, como o módulo) e desfazer/refazer à esquerda; **nome do projeto no centro**; estoque, **Pranchas** e **Simolar** (novo, "em breve": a porta da simulação) à direita.
- **Barra de baixo** sobre a cena: Encaixe (grade, vão, triângulos), Barras (Eixos, 15°, Livre) e Vista (Enquadrar, Paralela, Sombras, Render, Inércia, Atalhos). Com a cena estreita, só ícones.
- **Sem rodapé**: a dica virou um texto pequeno direto na cena; ferramenta, peças e módulo saíram (peças estão no resumo; módulo, nas configurações); a versão fica no canto inferior direito.
- **Resumo recolhível**: aba "‹ Resumo · N peças" na borda da cena; abre sozinho quando algo é selecionado. Sem a linha de kits mínimos (já está no estoque) e sem a coluna "Restam" no modo sem limite.
- **Paleta**: só o código das peças (GC, RC90, CC, CC90…), sem ∞ no modo sem limite; a paleta e o resumo vão até o fim da tela.
- **Cubo de vistas segue a projeção**: em perspectiva, o cubo também aparece em perspectiva.

## 1.11 — Ligar duas esferas · 13/10/2026
- Com uma mola (ou diagonal) na mão, **clique sobre uma esfera e depois sobre outra**: a peça liga as duas. Se a distância não é a da mola, a segunda esfera anda até o ponto possível mais perto em que ela cabe, e as molas presas a ela giram (como Mover só o nó). O fantasma mostra antes onde ela vai parar; travada ou longe demais, o rodapé explica. Esc ou clicar de novo na primeira cancela.
- Os pontos verdes, amarelos e laranja continuam valendo; para puxar uma mola da esfera, leve o cursor um pouco para fora dela.
- Colocando peças, clicar numa peça ou no vazio não seleciona mais nada (nem apaga a dica do rodapé).

## 1.10 — Vista paralela, Z para cima e 40° · 13/10/2026
- **Vista paralela** (caixa embaixo do cubo, tecla P): projeção sem perspectiva para modelar; a troca mantém a direção e o enquadramento. Fica guardada no navegador.
- **Z é a altura** na tela: painéis, coordenadas, mensagens e eixos do canto mostram (X, Y, Z) com Z para cima. Os arquivos .mola não mudam (por dentro, y continua para cima). Ao colar, X e Y espelham (Z também vale, como antes).
- **Ângulo mínimo entre molas: 40°** (era 45°), na planilha `parametros.xlsx`.
- **Mola na GC a pelo menos 40° da chapa**, ou seja, até 50° a partir da vertical (parâmetro novo `gc_angulo_minimo_base_graus`): o aparato rígido em volta da esfera não deixa deitar mais. (Corrigido no mesmo dia: a primeira publicação media os 40° a partir da vertical.)
- Pontos amarelos e laranja com os 40°: pirâmides de base triangular de B6 com lados de B4 (tetraedro baixo) num clique. Pirâmides de base pequena com lados grandes (B4 com B6, B6 com B12) continuam fora: no topo, as molas vizinhas ficam abaixo de 40°.
- **Kits mínimos**: no modo sem limite, o botão de estoque e o resumo mostram quantas caixas, no mínimo, a estrutura pede (ex.: 1× K1 + 1× K2).

## 1.9 — Vista simples e chapas soltas · 13/10/2026
- **Sombras** e **Renderização** (caixas de marcar embaixo do cubo, junto de Enquadrar e Inércia). Padrão: peças simples (molas lisas, cores foscas, sem reflexos), mais leves; Renderização liga o metal com reflexos e a hélice das molas. As escolhas ficam guardadas no navegador.
- **Chapas independentes**: a chapa criada pelo + não fica mais "ao lado da chapa X". Com a chapa selecionada, as **setas** movem nos eixos dela (1 módulo; Shift: 6; Alt ou Ctrl: 1/4), com a estrutura de cima.
- Painel da chapa: **nome** editável (aparece no menu, nas pranchas e nos arquivos), **centro X e Z** em módulos (decimais valem) e **giro**.
- **Ctrl+clique** soma chapas à seleção: o painel define a **distância entre elas** (0, 4, 6, 12 ou livre), na ordem em que foram escolhidas; a primeira fica parada. As setas movem todas juntas; Delete apaga todas. Uma estrutura que liga duas chapas anda junto quando as duas estão selecionadas.
- Girar uma chapa que bateria em outra a afasta o mínimo, na direção entre os centros, e avisa.
- **Tab nos pontos amarelos e laranja**: percorre os pontos da esfera de partida, do mais perto do cursor ao mais longe (Shift+Tab volta).
- O menu da chapa na cena ficou só com as ações; os + ficam por cima dele.

## 1.8 — Chapas giradas, cruzamentos e atalhos · 09/10/2026
- **Regras novas**: barras não se cruzam (nem barra com diagonal; duas diagonais em X podem); a esfera nova não cai em cima de uma barra ("mola não cruza bola"); RC90 não se cruzam e nenhuma peça passa por dentro de uma RC90. Valem ao colocar, mover, colar e girar chapas; os exemplos continuam válidos.
- **Amarelo × laranja**: nos pontos de triângulo das barras, amarelo = duas barras chegam no ponto; laranja = três ou mais (pirâmides, treliças).
- **Inércia / Vista firme** embaixo de Enquadrar (tecla B): desliga o "freio" da vista; a escolha fica guardada no navegador.
- **Atalhos em volta do W A S D**: W A S D giram a vista (Shift: arrastam), Q/E trocam a peça pela vizinha do grupo, 1/2/3 escolhem a direção das barras, G/V/T ligam a grade e os pontos, B a inércia; botão **Atalhos** (ou ? / H) com a lista completa.
- **Chapas**: o menu e os + só aparecem com a chapa selecionada (clique na chapa vazia). Distância livre com decimais, **deslocamento ao longo do lado** e **giro** (15° em 15° ou livre); a estrutura de cima vai junto. Numa chapa girada, a grade, os pontos azuis e os eixos das barras giram junto. Girar uma chapa encostada a afasta o mínimo para não bater. Exportar/importar .mola respeita o giro.

## 1.7 — Triângulos de barras · 09/10/2026
- **Pontos amarelos para barras** (botão Triângulo): com uma B4, B6 ou B12 na mão, a esfera sob o cursor mostra pontos amarelos que formam **triângulos** (equiláteros, isósceles ou quaisquer, com B4, B6 ou B12) com as esferas vizinhas, e **pirâmides** quando o ponto está a um vão de barra de duas ou mais vizinhas.
- **Um clique fecha o triângulo**: coloca a barra e as que fecham nela (uma só ação de desfazer); **R** alterna para só a barra. Valem nos modos Eixos, 15° e Livre.
- Só aparecem pontos possíveis: acima da chapa, com ângulos ≥ 45°, folgas e estoque conferidos.
- Modo Livre: a ponta não "fecha" mais numa esfera que já está ligada à partida.

## 1.6 — Barras livres e pranchas sob medida · 09/10/2026
- **Direção das barras: Eixos · 15° · Livre.** No modo Livre a ponta segue o cursor em qualquer direção 3D e encaixa: numa esfera que está à distância certa, em eixos e passos de 15°, no vértice de um **triângulo** com uma esfera vizinha (a próxima barra fecha nele) e nas **alturas** que já existem. Treliças 3D e telhados sem precisar de coordenadas.
- **Coordenada Y**: no painel da esfera, X, Y e Z movem só o nó (as barras acompanham); se não der para chegar exatamente, ele vai para o ponto possível mais perto e avisa. "Mover só o nó" no modo Livre desliza sem passos.
- **Diagonais (D1)**: valem entre duas esferas à distância da diagonal em qualquer direção (contraventamento em altura, torres triangulares). Peça repetida entre as mesmas esferas tem mensagem clara.
- **CC90** por cima da CC, com as hastes encostando nas molas transversais (cena e pranchas).
- **Pranchas**: folha **A3 ou A4** (na A4, uma planta ou vista por folha para manter a escala); **arrastar desenhos, títulos e a tabela**; tabela da capa maior, com cabeçalho, linhas zebradas e total em destaque; diagonais em planos inclinados aparecem nas vistas (só somem quando ficam atrás de uma barra); peças inclinadas aparecem na planta do nível em que chegam.
- **Barra de cima reorganizada** em grupos (Projeto, Encaixe, Direção das barras, Peças disponíveis, Pranchas); menu Arquivo com Ctrl+O e Ctrl+S.
- Exemplo novo: `examples/torre-triangular.mola`.

## 1.5 — Várias chapas · 09/10/2026
- **Várias chapas de base**: + nos lados para acrescentar chapa; distância 0, 4, 6, 12 módulos ou livre (a estrutura vai junto); estruturas de chapas diferentes podem se ligar.
- **Chapa selecionável**: clique na chapa vazia; menu fixo até Esc; Delete apaga; painel com os dados da chapa.
- Menu da chapa: selecionar peças, exportar e importar .mola por chapa, pranchas só da chapa.
- Pranchas de todas as chapas ou só de algumas, na posição real; arquivo .mola versão 3 (com as chapas).
- **Ligação × placa (L8)**: RC90 não vai no canto onde uma placa encosta; CC/CC90 não vão do lado em que a placa ocupa (e vice-versa).
- Cotas liga/desliga nas pranchas; logos do Mola e da Poli Building no carimbo e no rodapé; botão Enquadrar discreto; número da versão no rodapé.

## 1.4 — Produtividade e pranchas completas · 09/10/2026
- **Copiar e colar** (Ctrl+C / Ctrl+V) com fantasma: ↑/↓ muda a altura, R gira, X/Z espelha; esferas no mesmo lugar viram uma só (pavimentos se empilham).
- **Mover várias peças** (M / Ctrl+X) e **Repetir** N vezes com deslocamento.
- Pranchas: **cotas** entre eixos, totais e de altura; cota de cada nível; **etiquetas arrastáveis** (salvas no .mola); até duas logos no carimbo.

## 1.3 — Planos inclinados, guias e edição fina · 08/10/2026
- Placas, diagonais, RC90, CC e CC90 em **planos inclinados**.
- **Guias da GC**: pontos azuis (a um vão de barra) e amarelos (vértice de triângulo); com a grade desligada, a GC só vai para eles; **Tab** alterna pontos sobrepostos; botões Grade / Vão / Triângulo.
- **Coordenadas** da GC no painel (módulos ou mm) e distâncias às outras GC.
- **R contínuo** na peça selecionada; **Espaço** repete a última peça.
- **Mover só o nó**: as barras inclinam para acompanhar; RC90/CC/placas travam.
- Conflitos: RC90 × diagonal, placa × diagonal, barra atravessando placa.
- CC em vários lados do mesmo par; paleta só com as peças dos kits escolhidos; eixos X, Y, Z; câmera por baixo; **capa com isométrica renderizada**.

## 1.2 — Barras inclinadas e navegação de CAD · 08/10/2026
- **Barras inclinadas** em passos de 15° (Shift ou botão "Inclinadas") e fechamento entre esferas (triângulos).
- **Cubo de vistas** (faces, arestas, isométricas) e Enquadrar.
- CC e CC90 nos 4 lados da esfera.
- **Seleção por retângulo** (janela e cruzamento), Shift+clique, Ctrl+A; botão esquerdo seleciona, direito gira.
- Folga entre esferas: barra que não alcança a esfera não cria esfera sobreposta.

## 1.1 — Kits 1 e 2 completos e pranchas · 08/10/2026
- Todas as peças dos Kits 1 e 2: B4/B6/B12, diagonais, placas, RC90, CC, CC90; estoque por kit.
- Pontos verdes de encaixe, mover e girar peças, mover a estrutura pela GC.
- **Pranchas** no padrão do Desafio Poli-USP: capa, plantas, vistas A–D, escala automática; PDF, DXF e SVG.
- Exemplo: Estrutura 01 do Desafio 2022.

## 1.0 — Primeira versão · 08/10/2026
- Chapa 18 × 12, ligação de base, esferas e barras B6/B12 na grade.
- Arrastar e encaixar, desfazer/refazer, salvar e abrir .mola; publicada no GitHub Pages.
- Dados das peças vindos de `data/parametros.xlsx`.
