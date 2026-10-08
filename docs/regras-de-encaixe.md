# Regras de encaixe — siMOLAdor

Versão 3 · 08/10/2026 (fase 3 implementada: barras inclinadas, CC em 4 lados, seleção por retângulo). Especificação de `src/core/rules.ts` e `snapping.ts`. Cada regra cita a resposta da equipe em `A-CONFIRMAR.xlsx` (E = Encaixes, Q = Decisões). Valores numéricos vêm de `data/parametros.xlsx` (nome do parâmetro entre crases), nunca escritos no código.

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
| B2 | A barra sai na direção de um eixo, **ou** inclinada em múltiplos de `passo_inclinacao_graus` (15°) num plano ortogonal, **ou** fecha numa esfera existente que esteja à distância exata do vão (triângulos). Fora disso, bloqueia. | bloqueia | E19, equipe 08/10 |
| B3 | B6 do Kit 1 = B6 do Kit 2 (mesmo código, estoques somados). | estrutura | E01 |
| B4 | Polaridade não é verificada. | — | E15 |

## 3. Diagonais (D4x6, D6x6, D6x12)

| # | Regra | Tipo | Origem |
|---|---|---|---|
| D1 | Só existem três diagonais e cada uma só vale no seu vão nominal: o vetor entre os nós, em módulos, deve ser (a, b) ou (b, a) num plano ortogonal. | bloqueia | E11 |
| D2 | Podem ficar em planos verticais ou horizontais (contraventamento em planta). | — | E12 |
| D3 | Trabalham só à tração: desenhadas como cabo fino; marcadas como "só tração" nas propriedades. | visual | E10 |
| D4 | Duas diagonais cruzadas no mesmo vão (X) são permitidas; elas não colidem entre si. | — | pranchas 2022 |
| D5 | A diagonal liga duas esferas que já existem (não cria esfera na ponta). | bloqueia | implementação |

## 4. Ligações

| # | Regra | Tipo | Origem |
|---|---|---|---|
| L1 | **RC90** fica num nó, no canto entre duas peças a 90°. Prende na esfera (ímã do topo) e nas duas molas (ímãs laterais). | bloqueia se não houver duas peças a 90° no nó | E03 |
| L2 | Uma RC90 por canto. Um nó pode ter vários cantos (ex.: pilar com duas vigas = 2 cantos), e o usuário escolhe em quais colocar. | bloqueia a 2ª no mesmo canto | E04 |
| L3 | Na **GC**, a RC90 vai entre a GC e o pilar. O usuário pode pôr uma, ou uma de cada lado do pilar (até 4, uma por lado). | — | E04 |
| L4 | **CC** (forma 1, trapézio baixo) vai direto na esfera, ligando duas molas alinhadas (180°) e tornando-as contínuas. Não substitui a esfera. Uma CC por nó. | bloqueia sem duas barras alinhadas, ou se o nó já tem CC | E05, equipe 08/10 |
| L5 | **CC90** (forma 2, chapéu alto) vai **por cima de uma CC** no mesmo nó, **do mesmo lado**, e enrijece um segundo par de molas alinhadas, perpendicular ao primeiro e no mesmo plano: o nó vira um X contínuo. Uma CC90 por nó. | bloqueia sem CC no nó, ou sem o segundo par alinhado a 90° | E06, equipe 08/10 |
| L6 | **Lado da CC/CC90**: a peça pode ficar em qualquer um dos 4 lados da esfera perpendiculares às barras que ela une (para uma viga: em cima, embaixo e nos dois lados; para um pilar: nos 4 lados horizontais), **menos** num lado onde chega uma barra transversal (viga ou pilar ligado nesse ponto). **R** alterna os lados livres. Depois de colocada a CC, não se pode encaixar barra no lado ocupado por ela. | bloqueia | equipe 08/10 |

## 5. Placas (P6x6, P6x12)

| # | Regra | Tipo | Origem |
|---|---|---|---|
| P1 | Exige 4 nós nos cantos de um retângulo com o vão da placa (6×6 ou 6×12 módulos), em qualquer plano ortogonal: horizontal (laje) ou vertical (parede). | bloqueia | E07, E09 |
| P2 | A placa fica no plano dos centros dos nós, entre as barras e esferas, presa nas 4 esferas pelos chanfros com ímã. | geometria | E07 |
| P3 | Sem as 4 barras do contorno a placa é aceita, mas com aviso ("placa sem barras no contorno: menos estável"). | avisa | E08 |
| P4 | Uma placa por vão. | bloqueia | — |

## 6. Ligação de base (GC) e chapa

| # | Regra | Tipo | Origem |
|---|---|---|---|
| G1 | A GC fica sobre a chapa, com o centro dentro do retângulo da chapa, borda inclusive. | bloqueia | E18 |
| G2 | Dois modos, alternados pelo usuário: **grade** (centro nos cruzamentos da chapa, 0…`chapa_modulos_x` × 0…`chapa_modulos_y`) e **livre** (qualquer ponto que respeite G1). Padrão: `gc_encaixe_padrao`. | — | E16 |
| G3 | Duas GC não podem se sobrepor: distância entre centros ≥ `gc_diametro_mm`. | bloqueia | geometria |
| G4 | A estrutura pode passar da borda da chapa (balanço); só os apoios precisam estar nela. | — | E18 |
| G5 | A esfera da GC fica a `gc_centro_esfera_mm` acima da chapa. É o nível zero (PAV. TÉRREO) da estrutura. | geometria | pranchas 2022 |
| G6 | Nada deitado no nível da chapa: barras, diagonais ou placas horizontais em y = 0 (por exemplo, barra entre duas GC). | bloqueia | equipe 08/10 |

## 7. Estoque

| # | Regra | Tipo | Origem |
|---|---|---|---|
| S1 | O usuário escolhe quantos kits de cada tipo tem (ex.: 2 Kits 1 + 1 Kit 2). Estoque = soma das quantidades de `kits.json`. | estrutura | Q03 |
| S2 | Ao esgotar uma peça, ela fica cinza na paleta e o encaixe bloqueia. Existe um modo "sem limite", para projetos livres. | bloqueia (modo padrão) | Q03 |

## 8. Colisões

| # | Regra | Tipo | Origem |
|---|---|---|---|
| C1 | Duas peças lineares não podem ocupar o mesmo segmento (sobreposição). | bloqueia | — |
| C2 | Barra não atravessa placa. | bloqueia | — |
| C3 | Barras que se cruzam sem nó em comum: aviso (no kit real colidem). Exceção: diagonais em X (D4). | avisa | — |

## 9. Edição

| # | Regra | Origem |
|---|---|---|
| E1 | **Mover uma peça** (M, botão Mover ou arrastar a peça selecionada): a peça sai do modelo e vira fantasma; Esc devolve ao lugar. A esfera que só servia a ela vai junto. | equipe 08/10 |
| E2 | **Mover uma GC ou esfera** move a estrutura conectada inteira (barras, diagonais e placas ligam os nós). Vale o encaixe na grade; as GC precisam continuar na chapa e sem encostar em outras. | equipe 08/10 |
| E3 | **Girar (R)**: durante o posicionamento, alterna as opções do ponto; numa barra/diagonal selecionada, a próxima direção livre em torno de uma ponta; numa placa, a próxima posição livre mais perto; numa ligação, o próximo canto livre; numa GC/esfera, a estrutura inteira 90° em torno do centro dela. | equipe 08/10 |
| E4 | **Encaixe ligado**: pontos verdes nas posições válidas da peça escolhida e GC na grade. **Livre**: sem pontos, GC em qualquer ponto da chapa (as outras peças continuam encaixando nas esferas). | equipe 08/10 |
| E5 | Sobre uma esfera, a barra sobe; puxando o cursor para um lado, a barra vai para aquele lado, inclusive inclinada (o ângulo é arredondado ao passo de 15°). | equipe 08/10 |
| E6 | **Mouse**: botão esquerdo seleciona; botão direito gira a vista; Shift+direito ou botão do meio move a vista; roda dá zoom. | equipe 08/10 |
| E7 | **Seleção por retângulo** (arrastar com o botão esquerdo no vazio): da esquerda para a direita (azul, janela) pega só o que fica inteiro dentro; da direita para a esquerda (verde tracejado, cruzamento) pega o que tocar. Shift soma à seleção; Shift+clique soma ou tira uma peça; Ctrl+A seleciona tudo; Esc limpa. Com várias peças selecionadas, o painel lista as quantidades por código e as medidas do conjunto, copia a lista e remove tudo de uma vez (Delete). | equipe 08/10 |
| E8 | **Cubo de vistas** no canto da cena: clicar numa face dá a vista ortogonal, numa aresta ou canto, as vistas a 45° e isométricas. **Enquadrar** (F) fica ao lado. | equipe 08/10 |

## Perguntas que ainda podem mudar estas regras

- Medidas da CC e da CC90, para desenhá-las.
- RC90 e CC podem conviver no mesmo nó (ex.: viga contínua com pilar travado por RC90)?
- Na GC, quantos pilares cabem (só vertical, ou também inclinado)? Hoje: só vertical.
- O passo de 15° para barras inclinadas está bom? (Muda em `parametros.xlsx`, `passo_inclinacao_graus`.)
- Barras inclinadas fora dos planos ortogonais (geodésicas): fase 4.
