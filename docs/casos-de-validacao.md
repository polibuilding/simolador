# Casos de validação da simulação (linha 3.x)

Versão 1.0 · 04/11/2026. Lista dos casos que a simulação precisa reproduzir antes de ser publicada. Eles viram testes automáticos em `tests/core/sim/` e, quando der, modelos de exemplo em `examples/validacao/`. Física das peças: `fisica-das-pecas.md`. Plano: `plano-simolador.md` §10.

Há três famílias:

- **V**: casos **com número**, vindos do TFG da UPC (2026) e dos ensaios da equipe. A simulação tem de acertar a flecha (±10 %).
- **O**: casos **de forma**, vindos da dissertação de Oliveira (UFOP, 2008), que comparou fotos da Maquete Estrutural (antecessora do Mola) com o SAP2000. A simulação tem de acertar **quais peças fletem, para que lado e o que não se mexe**. São os ensaios planos O-P1 a O-P29 e os espaciais O-E1 a O-E14.
- **S**: os três **estudos** de Oliveira (S1 a S3), que comparam várias configurações da mesma estrutura. A simulação tem de acertar **a ordem** (qual desloca mais).

Montagem no kit: os ensaios de 2008 usavam as peças da Maquete. Abaixo, eles estão traduzidos para as peças atuais. O pórtico plano de referência (Fig. 4.6 de 2008) tem 88 × 176 mm, ou seja, colunas **B6** e viga **B12**. "GC + RC90" = engaste no plano; "GC" sozinha = rótula; "esfera" = rótula.

Etapa: em que versão da 3.x o caso passa a valer (3.0 estaticidade, 3.1 estática linear, 3.2 não linear e falhas, 3.3 flambagem).

---

## 1. Casos com número (V)

| Caso | Montagem | Carga | Esperado | Fonte | Etapa |
|---|---|---|---|---|---|
| V1 | B6 em balanço: GC + RC90 presa na vertical, mola horizontal | 11 g (0,108 N) na ponta | flecha **8,0 mm** (±10 %) | TFG §5.1 | 3.1 |
| V2 | mola apoiada em dois apoios, vão 110 mm (deve ser B12) | 84,2 g no meio / 132 g no meio | flecha **7–8 mm** / **13 mm** | TFG §4.3 | 3.1 |
| V3 | B6 em balanço como V1, **só com uma esfera na ponta** | peso próprio | estimativa 6–11 mm; vale o T3 da equipe | ensaio T3 | 3.1 |
| V4 | pórtico B6–B12–B6, GC sem RC90, topo em esferas | empurrão lateral | **mecanismo** (tomba) | TFG Fig. 11 | já na 1.7 |
| V5 | V4 + uma diagonal | empurrão lateral | **rígido** para o lado em que a diagonal traciona; mecanismo para o outro | TFG Fig. 12 | 3.0 / 3.2 |
| V6 | B12 vertical, GC embaixo e esfera em cima | peso no topo | flamba; estimativa 95–110 g; vale o T5 | §5.1 da física; T5 | 3.3 |
| V7 | B12 vertical em GC + RC90, topo livre | peso no topo | flamba; estimativa 23–28 g; vale o T5 | idem | 3.3 |

## 2. Ensaios planos de 2008 (O-P)

Nos pórticos planos, Oliveira usou **dois tirantes do topo até a chapa** para segurar o plano (Fig. 4.2). Na simulação, o mesmo vale: ou se põem esses dois tirantes, ou se trava a direção fora do plano.

| Caso | Montagem (peças atuais) | Carga | Forma esperada (verificação automática) | Etapa |
|---|---|---|---|---|
| O-P1 | coluna B12: GC embaixo, esfera em cima travada de lado | compressão no topo | meia onda simétrica (flambagem rotulada–rotulada) | 3.3 |
| O-P2 | coluna B12: GC + RC90 embaixo, esfera em cima travada | idem | onda assimétrica, com inflexão; **trecho reto junto da RC90** | 3.3 |
| O-P3 | coluna B12 com GC + RC90 nas duas pontas (GC de cima invertida) | idem | onda completa com duas inflexões; retas junto às RC90 | 3.3 |
| O-P4 | coluna B12 em GC + RC90, topo livre | idem | curva para um lado só; o desvio maior é a meia altura | 3.3 |
| O-P5 | viga B12 entre duas GC sem RC90 (de lado, presas à parede) | carga no meio | curva simétrica, flecha máxima no meio; as pontas giram | 3.1 |
| O-P6 | idem, GC + RC90 numa ponta | carga no meio | assimétrica; inclinação zero na ponta com RC90 | 3.1 |
| O-P7 | idem, GC + RC90 nas duas pontas | carga no meio | simétrica com duas inflexões; flecha menor que O-P5 | 3.1 |
| O-P8 | balanço B12 em GC + RC90 | carga na ponta | curvatura de um sinal só, maior junto da RC90 (menos o trecho rígido) | 3.1 |
| O-P9 | pórtico: GC + RC90 nas bases, esferas no topo | vertical no meio da viga | **só a viga flete** (biapoiada); colunas retas e só comprimidas | 3.1 |
| O-P10 | idem | horizontal no topo | **as duas colunas fletem como balanços iguais**; a viga translada reta (só esforço normal) | 3.1 |
| O-P11 | GC sem RC90, RC90 nos dois cantos de cima | vertical no meio | viga com momento negativo nos cantos; **colunas curvam** (o momento passa); as bases giram | 3.1 |
| O-P12 | idem | horizontal no topo | **colunas giram na base** (retas junto à GC) e curvam no alto; a viga tem curvatura dupla | 3.1 |
| O-P13 | tudo engastado (GC + RC90 nas bases, RC90 nos cantos) | vertical no meio | como O-P11, com as colunas em curvatura dupla | 3.1 |
| O-P14 | idem | horizontal no topo | colunas em curvatura dupla; deslocamento menor que O-P12 | 3.1 |
| O-P15 | GC sem RC90, RC90 nos cantos, viga com **esfera no meio** (duas B6) | vertical no nó do meio | V no meio da viga (rótula); colunas abrem para fora | 3.1 |
| O-P16 | pórtico "invertido e dobrado": colunas entre GC embaixo e GC invertida em cima; viga a meia altura com RC90 nos nós | vertical no meio da viga | viga flete; colunas curvam (momento passa pelas RC90) | 3.1 |
| O-P17 | idem, nó em X (viga atravessando a esfera, com CC + CC90 ou RC90 nos 4 cantos) e viga com balanços | vertical no meio | idem; os balanços sobem | 3.1 |
| O-P18 | dois pórticos lado a lado (3 colunas B6, 2 vigas B12), esferas no topo, GC + RC90 nas bases | vertical no meio do vão esquerdo | **só o vão carregado flete**; o vizinho fica reto | 3.1 |
| O-P19 | O-P18 com **CC** na esfera do meio | idem | **o vão vizinho sobe** (viga contínua); a coluna do meio sem momento | 3.1 |
| O-P20 | O-P18 com **RC90** nos nós de cima | idem | a carga passa ao vão vizinho **e** a coluna do meio curva; o topo dela desloca | 3.1 |
| O-P21 | viga contínua com balanço: duas colunas, CC na esfera da direita, B6 em balanço depois dela | vertical no meio do vão | **o balanço sobe**; coluna sem momento | 3.1 |
| O-P22 a O-P25 | arcos de ¼ de circunferência (bi-engastado, engastado com rótula no topo, bi-articulado, tri-articulado; CC no topo quando contínuo) | vertical no topo | as quatro formas clássicas | 2.x (arcos do Kit 4) |
| O-P26 | "casinha": colunas B6 em GC + RC90, duas águas de B6 inclinadas, esferas em todos os nós de cima | vertical na cumeeira | a cumeeira desce e **as colunas abrem para fora** (flexão das colunas) | 3.1 |
| O-P27 | O-P26 + tirante horizontal entre os topos das colunas (diagonal ou cabo) | idem | **nenhuma deformação visível**: o tirante segura a abertura | 3.1 |
| O-P28 | treliça plana de 2 painéis sobre colunas, montada **em dois planos** para ficar de pé | vertical nos dois nós de cima | pouca deformação (esforço só axial) | 3.1 |
| O-P29 | treliça plana de 4 painéis, idem | vertical no nó central de cima | pouca deformação, mesmo com vão maior | 3.1 |

## 3. Ensaios espaciais de 2008 (O-E)

| Caso | Montagem | Carga | Forma esperada (verificação automática) | Etapa |
|---|---|---|---|---|
| O-E1 | pórtico espacial de 1 vão (planta 12 × 6 M, colunas B6), bases GC + RC90 (engaste; nas fotos, RC90 nas duas direções), esferas no topo | horizontal num nó de cima | só as colunas do plano carregado fletem; **o plano oposto não se mexe** (as vigas rotuladas não levam esforço de lado) | 3.1 |
| O-E2 | idem, tudo engastado | idem | todos os planos participam, inclusive o oposto | 3.1 |
| O-E3 | bases GC sem RC90, o resto engastado | idem | como O-E2, com **deslocamentos maiores** | 3.1 |
| O-E4 | O-E1 + placa no topo | idem | **a laje leva a carga ao plano oposto** (diafragma) | 3.1 |
| O-E5 a O-E8 | os mesmos 4 casos com 2 vãos | idem | os mesmos comportamentos | 3.1 |
| O-E9 | galpão (colunas, duas águas, vigas ao longo), tudo engastado, sem contraventamento | horizontal no topo de uma coluna | toda a estrutura desloca; colunas fletem mais | 3.1 |
| O-E10 | idem | horizontal na cumeeira | deslocamento e flexão das vigas maiores que no O-E9 | 3.1 |
| O-E11 | O-E9 + X nas paredes | horizontal no topo da coluna | **deslocamento imperceptível** (pórtico indeslocável) | 3.1 |
| O-E12 | idem | horizontal na cumeeira | **os quadros da cobertura deslocam** (X só nas paredes não basta) | 3.1 |
| O-E13 | X nas paredes e na cobertura | horizontal na cumeeira | imperceptível | 3.1 |
| O-E14 | treliça espacial de 2 camadas sobre 4 colunas em GC + RC90 | horizontal num nó de cima, na borda | a treliça **translada e gira** em torno de um eixo vertical; as colunas fletem; a treliça quase não deforma | 3.1 |

## 4. Estudos de 2008 (S)

| Caso | Estrutura | Configurações | Ordem esperada | Etapa |
|---|---|---|---|---|
| S1 | fachada de residência: 2 pavimentos, 3 vãos, com balanço de um vão; carga vertical na ponta do balanço | 1 tudo engastado · 2 balanço rotulado com diagonal embaixo · 3 balanço rotulado com diagonal em cima · 4 viga de cima rotulada · 5 duas diagonais opostas · 6 tudo rotulado com núcleo central em X | deslocamento lateral, pela descrição do texto: 6 ≤ 5 < 1 < 2 < 3 < 4. Na 1, o balanço flete muito; na 2, as peças do balanço não fletem (rotuladas); na 3, a ponta do balanço desce bem menos que na 1; na 6, quase só esforço axial | 3.1 |
| S2 | viga e treliças entre duas torres | 1 viga biapoiada com **uma esfera + um ímã** no meio · 2 treliça plana de mesmo vão (peso próprio) · 3 treliça plana de vão maior · 4 treliça multiplanar de vão maior | 1: flecha grande. 2: sem flecha visível. **3: perde a estabilidade lateral só com o peso próprio** (flambagem lateral). 4: estável | 3.3 |
| S3 | prédio de 3 pavimentos, 3 vãos (B6), carga horizontal no topo | 1 tudo engastado (RC90 nos 4 cantos de cada nó) · 2 rotulado com X no vão central · 3 rotulado com núcleo de placas no vão central | 1: deslocamento grande, **P-Δ e P-δ visíveis**. 2 e 3: imperceptível. Critério ECCS: contraventada se a flexibilidade lateral cai ≥ 80 % → 2 e 3 "contraventadas", 1 "deslocável" | 3.2 |

## 5. Como os casos viram testes

- **Forma (O, S)**: cada caso vira um modelo e uma lista de verificações. Exemplos:
  - O-P9: |M| nas colunas < 2 % do |M| máximo da viga;
  - O-E1: deslocamento do plano oposto < 2 % do carregado;
  - O-P19: o vão vizinho sobe;
  - S1: a ordem dos deslocamentos.

  São testes de sinal e de proporção. Não dependem do valor exato de EI.
- **Número (V)**: tolerância de ±10 % (a dispersão do próprio kit, segundo o TFG), ajustável quando os ensaios da equipe chegarem.
- **Comparar com a foto** (ideia de Oliveira, 2008): na 3.6, o programa pode sobrepor a foto do kit montado à deformada simulada, com a câmera na mesma vista. É a validação dele, automatizada, e a forma mais fácil de a equipe conferir qualquer estrutura nova.
