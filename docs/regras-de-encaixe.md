# Regras de encaixe — siMOLAdor

Versão 4.0 · 09/10/2026 (siMOLAdor 1.6) (fase 3: barras inclinadas sob demanda, folga das esferas, CC em 4 lados, seleção por retângulo; placas, diagonais e ligações em planos inclinados; guias e coordenadas da GC). Especificação de `src/core/rules.ts` e `snapping.ts`. Cada regra cita a resposta da equipe em `A-CONFIRMAR.xlsx` (E = Encaixes, Q = Decisões). Valores numéricos vêm de `data/parametros.xlsx` (nome do parâmetro entre crases), nunca escritos no código.

Uma regra **bloqueia** quando torna o encaixe inválido (fantasma vermelho, não deixa soltar). Uma regra **avisa** quando a montagem é possível, mas não é recomendada (fantasma verde, aviso na barra de status).

## 1. Nós

| # | Regra | Tipo | Origem |
|---|---|---|---|
| N1 | Todo nó é uma esfera C ou uma GC. A GC tem esfera embutida: não se coloca esfera C dentro da GC, e a GC não consome esfera do estoque. | estrutura | E17 |
| N2 | Barras, diagonais e placas só se ligam a nós; nunca barra com barra direto. | bloqueia | E15, E19 |
| N3 | Ângulo entre duas **barras** no mesmo nó ≥ `angulo_minimo_membros_graus` (45°). Diagonais são cabos finos e não entram nesta regra (a D4x6 faz 34° com a barra). | bloqueia | E14 |
| N4 | No máximo `max_membros_por_plano` (8) peças lineares num mesmo plano de um nó. É consequência de N3, mantida como checagem explícita. | bloqueia | E13 |
| N5 | Nó sem nenhuma peça ligada (esfera solta) é permitido durante a montagem. | avisa | — |

Direções possíveis para uma barra a partir de um nó: os 6 eixos (±X, ±Y, ±Z) e as inclinadas em passos de `passo_inclinacao_graus` (15°) nos três planos ortogonais (XY, XZ, YZ). Uma barra também pode ligar duas esferas que já existem em qualquer direção, se a distância entre elas for o vão da barra (é assim que se fecha um triângulo). Direções 3D fora desses planos (geodésicas) ficam para a geometria livre.

## 2. Barras (B4, B6, B12)

| # | Regra | Tipo | Origem |
|---|---|---|---|
| B1 | Distância entre os centros dos dois nós = `spanM` × `modulo_mm`, com tolerância de `tolerancia_encaixe_mm`. | bloqueia | — |
| B2 | Modos **Eixos** e **15°**: a barra sai na direção de um eixo, **ou** inclinada em múltiplos de `passo_inclinacao_graus` (15°) num plano ortogonal, **ou** fecha numa esfera existente que esteja à distância exata do vão. Modo **Livre**: qualquer direção 3D (o comprimento continua exato); a ponta encaixa em esferas à distância certa, em eixos/15°, no vértice de um triângulo com uma esfera vizinha (circunferência das duas esferas) e nas alturas existentes. | bloqueia (Eixos/15°) | E19, equipe 08–09/10 |
| B3 | B6 do Kit 1 = B6 do Kit 2 (mesmo código, estoques somados). | estrutura | E01 |
| B4 | Polaridade não é verificada. | — | E15 |

## 3. Diagonais (D4x6, D6x6, D6x12)

| # | Regra | Tipo | Origem |
|---|---|---|---|
| D1 | Só existem três diagonais, cada uma com o comprimento da diagonal do seu vão a × b (D4x6, D6x6, D6x12). A diagonal vale entre duas esferas que estejam **exatamente a essa distância, em qualquer direção** (painéis inclinados, torres triangulares, contraventamento em altura). | bloqueia | E11, equipe 09/10 |
| D2 | Podem ficar em planos verticais ou horizontais (contraventamento em planta). | — | E12 |
| D3 | Trabalham só à tração: desenhadas como cabo fino; marcadas como "só tração" nas propriedades. | visual | E10 |
| D4 | Duas diagonais cruzadas no mesmo vão (X) são permitidas; elas não colidem entre si. | — | pranchas 2022 |
| D5 | A diagonal liga duas esferas que já existem (não cria esfera na ponta). | bloqueia | implementação |

## 4. Ligações

| # | Regra | Tipo | Origem |
|---|---|---|---|
| L1 | **RC90** fica num nó, no canto entre duas barras a 90°, em **qualquer plano** (inclusive num quadro inclinado de uma treliça). Prende na esfera (ímã do topo) e nas duas molas (ímãs laterais). | bloqueia se não houver duas barras a 90° no nó | E03, equipe 08/10 |
| L2 | Uma RC90 por canto. Um nó pode ter vários cantos (ex.: pilar com duas vigas = 2 cantos), e o usuário escolhe em quais colocar. | bloqueia a 2ª no mesmo canto | E04 |
| L3 | Na **GC**, a RC90 vai entre a GC e o pilar. O usuário pode pôr uma, ou uma de cada lado do pilar (até 4, uma por lado). | — | E04 |
| L4 | **CC** (forma 1, trapézio baixo) vai direto na esfera, ligando duas molas alinhadas (180°) e tornando-as contínuas. Não substitui a esfera. **Uma peça por lado da esfera**: o mesmo par mola–bola–mola pode levar CC em vários lados (ex.: em cima e nos dois lados de uma viga), desde que o lado esteja livre. | bloqueia sem duas barras alinhadas, ou se o lado já tem CC | E05, equipe 08/10 |
| L5 | **CC90** (forma 2, chapéu alto) vai **por cima de uma CC** no mesmo nó, **do mesmo lado**, com as **hastes descendo até encostar nas molas transversais**, e enrijece um segundo par de molas alinhadas, perpendicular ao primeiro e no mesmo plano: o nó vira um X contínuo. Uma CC90 por lado. | bloqueia sem CC no nó, ou sem o segundo par alinhado a 90° | E06, equipe 08/10 |
| L7 | **RC90 × diagonal**: a RC90 ocupa o canto entre as duas barras; se uma diagonal sai da esfera por dentro desse canto (no plano dele, com folga de 20°), a RC90 não cabe, e a diagonal não pode sair por um canto que já tem RC90. Vale também para a RC90 da base (GC–pilar). | bloqueia | equipe 08/10 |
| L8 | **Ligação × placa**: a RC90 não vai no canto onde uma placa encosta na esfera (no plano do canto), e a placa não entra num canto que já tem RC90. A CC/CC90 não vai do lado em que a placa está no plano do par de barras (a ponte passaria dentro da placa); os outros lados continuam livres. | bloqueia | equipe 09/10 |
| L6 | **Lado da CC/CC90**: a peça pode ficar em qualquer um dos 4 lados da esfera perpendiculares às barras que ela une (para uma viga: em cima, embaixo e nos dois lados; para um pilar: nos 4 lados horizontais; para um par inclinado: a normal do plano e a perpendicular dentro dele), **menos** num lado onde chega uma barra transversal (viga ou pilar ligado nesse ponto). **R** alterna os lados livres. Depois de colocada a CC, não se pode encaixar barra no lado ocupado por ela. | bloqueia | equipe 08/10 |

## 5. Placas (P6x6, P6x12)

| # | Regra | Tipo | Origem |
|---|---|---|---|
| P1 | Exige 4 esferas nos cantos de um retângulo com o vão da placa (6×6 ou 6×12 módulos), em **qualquer plano**: laje, parede ou inclinada (as 4 esferas no mesmo plano, lados a 90° e com as medidas certas). | bloqueia | E07, E09, equipe 08/10 |
| P2 | A placa fica no plano dos centros dos nós, entre as barras e esferas, presa nas 4 esferas pelos chanfros com ímã. | geometria | E07 |
| P3 | Sem as 4 barras do contorno a placa é aceita, mas com aviso ("placa sem barras no contorno: menos estável"). | avisa | E08 |
| P4 | Uma placa por vão. | bloqueia | — |
| P5 | **Placa × diagonal**: as duas encostam na esfera pelo mesmo ponto (rumo ao centro do vão). Não vale placa num vão com diagonal, nem diagonal num vão com placa, nem diagonal saindo de uma esfera a menos de 20° do ponto onde uma placa encosta. | bloqueia | equipe 08/10 |

## 6. Ligação de base (GC) e chapa

| # | Regra | Tipo | Origem |
|---|---|---|---|
| G1 | A GC fica sobre uma chapa, com o centro dentro do retângulo de alguma chapa, borda inclusive. | bloqueia | E18 |
| G11 | **Várias chapas**: passando o mouse numa chapa aparecem + discretos nos lados livres (acrescentam uma chapa encostada) e um menu na borda da frente: distância até a chapa de referência (0, 4, 6, 12 módulos ou livre; a estrutura de cima vai junto), Selecionar, Exportar .mola (a estrutura da chapa, com a chapa no canto 0, 0), Importar .mola (põe um arquivo em cima da chapa), Pranchas (só desta chapa) e Apagar. **Clicar na chapa vazia seleciona a chapa** (contorno azul): o menu fica fixo até Esc, o painel mostra a chapa e **Delete** apaga (pede confirmação se houver peças em cima). Cada chapa tem a grade a partir do próprio canto. Estruturas de chapas diferentes podem se ligar (ex.: viga de B6 entre pilares de chapas a 6 módulos); aí a distância e o apagar ficam travados até a ligação sair. | — | equipe 09/10 |
| G2 | Dois modos, alternados pelo usuário: **grade** (centro nos cruzamentos da chapa, 0…`chapa_modulos_x` × 0…`chapa_modulos_y`) e **livre** (qualquer ponto que respeite G1). Padrão: `gc_encaixe_padrao`. | — | E16 |
| G3 | Duas GC não podem se sobrepor: distância entre centros ≥ `gc_diametro_mm`. | bloqueia | geometria |
| G4 | A estrutura pode passar da borda da chapa (balanço); só os apoios precisam estar nela. | — | E18 |
| G5 | A esfera da GC fica a `gc_centro_esfera_mm` acima da chapa. É o nível zero (PAV. TÉRREO) da estrutura. | geometria | pranchas 2022 |
| G6 | Nada deitado no nível da chapa: barras, diagonais ou placas horizontais em y = 0 (por exemplo, barra entre duas GC). | bloqueia | equipe 08/10 |
| G10 | **Grade desligada e azul/amarelo ligados**: a GC só vai para os pontos ligados (puxa de até 90 px); longe deles, não há fantasma. Se ainda não existe nenhum ponto daquela cor, a GC vai livre. Um ponto que é ao mesmo tempo azul e amarelo aparece como amarelo. | equipe 08/10 |
| G9 | **Liga/desliga dos pontos** (barra de cima, "Encaixe"): **Grade** (verde: pontos de encaixe de todas as peças e grade da chapa para a GC; desligada = livre), **Vão** (azul) e **Triângulo** (amarelo). Entre os pontos ligados perto do cursor vale o mais perto; quando há vários quase no mesmo lugar, **Tab** alterna e o rodapé diz qual está valendo. | — | equipe 08/10 |
| G7 | **Guias ao colocar ou mover uma GC** (nos dois modos de encaixe): **azul** = a 4, 6 ou 12 módulos (vão de B4, B6 ou B12) de outra GC, em X ou Z; **amarelo** = terceiro vértice de um triângulo cujos lados são vãos de barra, com todos os ângulos ≥ 45°, apoiado em duas GC que já estão a um vão de barra uma da outra (na prática, triângulos equiláteros de B4, B6 ou B12). A GC "puxa" para o guia a menos de 18 px do cursor; o rodapé diz qual é. | — | equipe 08/10 |
| G8 | **Coordenadas**: com uma GC selecionada, o painel aceita X e Z em módulos (ex.: 5,196) ou em mm (ex.: 77,3 mm); a estrutura ligada vai junto, com as mesmas regras de Mover. Com uma **esfera**, X, **Y** e Z movem só o nó (as barras acompanham, como em Mover só o nó); se as barras não deixam chegar exatamente, ele vai para o ponto possível mais perto e o painel avisa. O painel também lista a distância às GC mais próximas e marca as que batem com o vão de uma barra. | — | equipe 08/10 |

## 7. Estoque

| # | Regra | Tipo | Origem |
|---|---|---|---|
| S1 | O usuário escolhe quantos kits de cada tipo tem (ex.: 2 Kits 1 + 1 Kit 2). Estoque = soma das quantidades de `kits.json`. | estrutura | Q03 |
| S3 | A paleta mostra só as peças que existem nos kits escolhidos (ou que já estão no modelo). Zerar um kit tira as peças dele; voltar o kit traz de volta. | — | equipe 08/10 |
| S2 | Ao esgotar uma peça, ela fica cinza na paleta e o encaixe bloqueia. Existe um modo "sem limite", para projetos livres. | bloqueia (modo padrão) | Q03 |

## 8. Colisões

| # | Regra | Tipo | Origem |
|---|---|---|---|
| C1 | Duas peças lineares não podem ocupar o mesmo segmento (sobreposição). | bloqueia | — |
| C2 | Barra não atravessa placa. | bloqueia | — |
| C3 | Barras que se cruzam sem nó em comum: aviso (no kit real colidem). Exceção: diagonais em X (D4). | avisa (a implementar) | — |
| C2b | Implementado: barra que fura o miolo de uma placa é recusada (as do contorno valem). | bloqueia | equipe 08/10 |
| C4 | A esfera nova na ponta de uma barra não pode cair em cima de outra: centros a menos de `esfera_diametro_mm`. Ou a barra chega **exatamente** na esfera (fecha nela), ou fica longe. A mensagem diz quanto faltou (ex.: "as esferas teriam de estar a 89,2 mm; estão a 86,7 mm"). | bloqueia | equipe 08/10 (defeito do triângulo) |
| C5 | A peça não passa por dentro de uma esfera que não é dela: folga mínima = raio da esfera + raio da mola (ou do cabo). | bloqueia | equipe 08/10 |
| C6 | Ao abrir um modelo feito antes de C4, as esferas sobrepostas são avisadas e já ficam selecionadas (Delete apaga a que sobrou, com a barra). | avisa | equipe 08/10 |

## 9. Edição

| # | Regra | Origem |
|---|---|---|
| E1 | **Mover uma peça** (M, botão Mover ou arrastar a peça selecionada): a peça sai do modelo e vira fantasma; Esc devolve ao lugar. A esfera que só servia a ela vai junto. | equipe 08/10 |
| E2 | **Mover uma GC ou esfera** move a estrutura conectada inteira (barras, diagonais e placas ligam os nós). Vale o encaixe na grade; as GC precisam continuar na chapa e sem encostar em outras. | equipe 08/10 |
| E2b | **Mover só o nó** (botão no painel, tecla **N** ou Alt + arrastar): o resto da estrutura fica parado. As partes presas só a esse nó (sem ligação de base) vão junto, sem girar. Cada barra ou diagonal que liga o nó a uma parte fixa mantém o comprimento e gira em torno da ponta fixa: com 1 barra, o nó anda numa esfera (eixos e passos de 15°); com 2, num círculo (passos de 15°); com 3 ou mais, só nos pontos que fecham todas. A GC continua na chapa. **Rigidez**: RC90, CC ou CC90 numa barra que giraria travam o nó, e placa presa a partes fixas também; o rodapé diz qual peça trava. As posições possíveis aparecem em verde; valem N3 (45°), colisões, folga entre esferas e placas. | equipe 08/10 |
| E13 | **Copiar e colar** (Ctrl+C / Ctrl+V): a cópia segue o cursor na grade; ↑/↓ muda a altura (1 módulo; Shift: 6), R gira 90°, X/Z espelha. Esferas que caem no lugar de esferas existentes viram a mesma esfera; GC colada fora da chapa vira esfera. Cada peça nova passa por todas as regras; continua colando até Esc. | equipe 09/10 |
| E14 | **Mover várias peças** (M ou Ctrl+X com seleção): as peças saem e seguem o cursor como na colagem; Esc devolve. Esfera selecionada que ainda segura peças de fora fica no lugar (a cópia leva uma igual). | equipe 09/10 |
| E15 | **Repetir** (painel da seleção): N cópias, cada uma deslocada X, Y, Z da anterior; para na primeira que não couber e diz por quê. | equipe 09/10 |
| E3 | **Girar (R)**: durante o posicionamento, alterna as opções do ponto; numa barra/diagonal selecionada, a próxima direção livre em torno de uma ponta; numa placa, a próxima posição livre mais perto; numa ligação, o próximo canto livre; numa GC/esfera, a estrutura inteira 90° em torno do centro dela. | equipe 08/10 |
| E4 | **Encaixe ligado**: pontos verdes nas posições válidas da peça escolhida e GC na grade. **Livre**: sem pontos, GC em qualquer ponto da chapa (as outras peças continuam encaixando nas esferas). | equipe 08/10 |
| E5 | Sobre uma esfera, a barra sobe; puxando o cursor para um lado, a barra vai para aquele lado. **Por padrão, só nos eixos** (botão "Barras: Nos eixos"), como num pórtico; o fechamento numa esfera existente à distância exata vale sempre. Para inclinar: **Shift** segurado (só enquanto estiver apertado), ou o botão "Inclinadas" / tecla **I**. Inclinada, o ângulo segue o cursor em passos de 15° e o rodapé mostra o ângulo ("30° com a horizontal", "30° em planta"); uma direção bloqueada aparece em vermelho com o motivo. | equipe 08/10 |
| E6 | **Mouse**: botão esquerdo seleciona; botão direito gira a vista; Shift+direito ou botão do meio move a vista; roda dá zoom. | equipe 08/10 |
| E7 | **Seleção por retângulo** (arrastar com o botão esquerdo no vazio): da esquerda para a direita (azul, janela) pega só o que fica inteiro dentro; da direita para a esquerda (verde tracejado, cruzamento) pega o que tocar. Shift soma à seleção; Shift+clique soma ou tira uma peça; Ctrl+A seleciona tudo; Esc limpa. Com várias peças selecionadas, o painel lista as quantidades por código e as medidas do conjunto, copia a lista e remove tudo de uma vez (Delete). | equipe 08/10 |
| E9 | **R contínuo**: com uma peça selecionada, cada R gira para a próxima posição e a peça continua selecionada (R, R, R… até a posição certa; Esc termina). Os giros seguidos contam como um passo só no Desfazer. | equipe 08/10 |
| E10 | **Espaço** repete a última peça colocada (arma de novo a peça da paleta). | equipe 08/10 |
| E12 | **Eixos X, Y, Z** no canto inferior esquerdo (Y = vertical); clicar num eixo olha a estrutura por ele. | equipe 08/10 |
| E11 | **Câmera** gira livre, inclusive por baixo da chapa; vista de baixo deixa a chapa translúcida. | equipe 08/10 |
| E8 | **Cubo de vistas** no canto da cena: clicar numa face dá a vista ortogonal, numa aresta ou canto, as vistas a 45° e isométricas. **Enquadrar** (F) fica ao lado. | equipe 08/10 |

## Perguntas que ainda podem mudar estas regras

- Medidas da CC e da CC90, para desenhá-las.
- RC90 e CC podem conviver no mesmo nó (ex.: viga contínua com pilar travado por RC90)?
- Na GC, quantos pilares cabem (só vertical, ou também inclinado)? Hoje: só vertical.
- O passo de 15° para barras inclinadas está bom? (Muda em `parametros.xlsx`, `passo_inclinacao_graus`.)
- Barras inclinadas fora dos planos ortogonais (geodésicas): fase 4.
