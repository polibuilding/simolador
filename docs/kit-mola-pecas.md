# Kit Mola — catálogo de peças e dimensões (Kits 1 e 2)

Levantamento feito em 08/10/2026 para o SiMOLAdor. Contagens e nomes vêm das páginas oficiais da Mola.

**Atualização (v2):** as dimensões agora vêm da geometria vetorial das pranchas de AutoCAD do Desafio Poli-USP 2022 (pasta `siMOLAdor/sheets`, escala 1/2), medidas direto no PDF. Elas batem com a estimativa anterior (módulo ≈ 15 mm). Continuam sendo valores de desenho, não de paquímetro: conferir no kit antes de fixar no código.

## Dimensões medidas nas pranchas (mm reais)

| Item | Valor | Observação |
|---|---|---|
| Módulo M | **14,87** | 6M entre centros de esfera = 89,2 mm; 12M = 178,4 mm |
| Chapa de base G | **267,6 × 178,4** | = 18M × 12M exatos; cantos arredondados |
| Esfera C | **Ø 15,0** | ≈ 1M |
| Diâmetro da barra (mola) | **6,0** | |
| Barra B6 (comprimento desenhado) | **74,6** | = c/c − 14,6 |
| Barra B12 | **163,8** | = c/c − 14,6 |
| Barra B4 | ≈ 44,9 | calculado: 4M − 14,6 (não aparece nas pranchas) |
| Ligação de base GC | **Ø 44,0 × 10,5 de altura** | esfera assenta no furo; centro da esfera 7,5 mm acima da mesa |
| Ligação rígida RC90 | triângulo de catetos **18,3**, espessura **6,0** | de perfil aparece como 6 × 19 |
| Placa P6x6 | **81,9 × 81,9** | = 6M − 7,3 |
| Placa P6x12 | **171,1 × 81,9** | = 12M − 7,3 por 6M − 7,3 |
| Diagonal D6x6 | cabo de ≈ 101,5 entre terminais | terminal ≈ 5,2 × 5,2 (losango de 7,4 no desenho) |

Regras derivadas: comprimento da barra = n·M − 14,6 mm; lado da placa = n·M − 7,3 mm; estrutura centrada na chapa com 3M de folga até as bordas.

## O que é

Mola ("spring" em inglês) é um modelo físico estrutural modular criado pelo arquiteto Márcio Sequeira de Oliveira (validação na dissertação de mestrado da UFOP). Barras são molas helicoidais de aço com terminais magnéticos; nós são esferas de aço; ligações rígidas/contínuas são peças plásticas com ímãs. Todos os kits são independentes e compatíveis entre si. Lançamentos: Kit 1 (2014), Kit 2 (2016), Kit 3 (2019), Kit 4 (mais recente).

## Sistema de módulos (base para o simulador)

- Unidade **M** = 1 módulo = espaçamento da grade da Chapa de Base (G).
- O número no código da peça é a distância **centro a centro de esfera** em módulos: B6 = 6M, B12 = 12M, D6x12 = diagonal de um retângulo 6M × 12M, P6x12 = placa que fecha um vão 6M × 12M.
- Medido nas fotos oficiais: esfera ≈ 0,95M; comprimento físico da barra ≈ n·M − 0,93M (a esfera completa o vão). Placas ≈ (a·M − ~0,6M) × (b·M − ~0,6M).
- Chapa de Base: grade de **18 × 12 módulos** (Kits 1 e 2).
- Valor absoluto: **M = 14,87 mm** pelas pranchas (ver tabela acima). Estimativa original, por fotos: M ≈ 15 mm (B6 com 90 mm entre centros de nó no TCC da UPC; chapa de 18×12M precisa caber na tampa da caixa de 320×230 mm; mola de Ø externo ≈ 4 mm bate com esfera ≈ 14 mm).

## Kit 1 (cor verde) — 122 peças, US$ 219, caixa 320×230×45 mm, 1,9 kg, manual 38 p.

| Peça | Código | Qtd | Dimensão (módulos) | Estimativa (M=15 mm) |
|---|---|---|---|---|
| Esfera (nó rotulado) | C | 12 | Ø ≈ 0,95M | Ø ≈ 14 mm |
| Ligação rígida 90° | RC90 | 48 | cunha triangular com ímãs | — |
| Ligação de base | GC | 4 | disco com encaixe p/ esfera, 4 marcas de eixo | — |
| Barra (mola) | B6 | 24 | 6M c/c | c/c 90 mm, peça ≈ 76 mm |
| Barra (mola) | B12 | 6 | 12M c/c | c/c 180 mm, peça ≈ 166 mm |
| Diagonal (cabo) | D6x6 | 12 | √72 ≈ 8,49M c/c | ≈ 127 mm c/c |
| Diagonal (cabo) | D6x12 | 12 | √180 ≈ 13,42M c/c | ≈ 201 mm c/c |
| Placa | P6x12 | 3 | ≈ 11,4M × 5,3M | ≈ 171 × 80 mm |
| Chapa de base | G | 1 | 18M × 12M | ≈ 270 × 180 mm |

Sistemas do manual: ligações, tirante, pilar, viga, pórticos, treliças, viga Vierendeel.

## Kit 2 (cor vermelha) — 145 peças, US$ 239, caixa 320×230×45 mm, 2,0 kg, manual 36 p.

| Peça | Código | Qtd | Dimensão (módulos) | Estimativa (M=15 mm) |
|---|---|---|---|---|
| Esfera | C | 18 | Ø ≈ 0,95M | Ø ≈ 14 mm |
| Ligação rígida 90° | RC90 | 12 | idem Kit 1 | — |
| Ligação contínua | CC | 12 | dá continuidade a duas barras alinhadas (pilar/viga contínuos) | — |
| Ligação contínua 90° | CC90 | 12 | continuidade em canto 90° | — |
| Ligação de base | GC | 6 | idem Kit 1 | — |
| Barra (mola) | B4 | 18 | 4M c/c | c/c 60 mm, peça ≈ 46 mm |
| Barra (mola) | B6 | 30 | 6M c/c | c/c 90 mm, peça ≈ 76 mm |
| Diagonal (cabo) | D4x6 | 24 | √52 ≈ 7,21M c/c | ≈ 108 mm c/c |
| Diagonal (cabo) | D6x6 | 9 | 8,49M c/c | ≈ 127 mm c/c |
| Placa | P6x6 | 3 | ≈ 5,3M × 5,3M | ≈ 80 × 80 mm |
| Chapa de base | G | 1 | 18M × 12M | ≈ 270 × 180 mm |

Sistemas do manual: balanço, viga contínua, grelha, comprimento de flambagem, pilar estaiado e viga armada, pórtico de múltiplos vãos, geodésicas.

## Regras de montagem relevantes para o simulador

- Barras e diagonais têm ímãs nas pontas com polaridades opostas; conectam-se via esfera.
- RC90, CC e CC90 têm ímãs no perímetro com uma única polaridade por peça → empilhar invertendo a peça.
- Placas têm ímãs no perímetro (polaridade única); encaixam entre barras/esferas.
- Diagonais são cabos finos: só trabalham à tração.

## Dados mecânicos (TCC UPC, Kit 1)

Mola: fio Ø 0,6 mm, diâmetro médio 3,4 mm, ~112 espiras ativas; EA medido ≈ 414 N; EI ≈ 2.966 N·mm²; k teórico ≈ 2,96 N/mm. O mesmo texto cita L = 100 mm e parte flexível ≈ 87 mm, que não fecham com 90 mm c/c — tratar como aproximados.

## Outros kits (resumo)

- Kit 3 (azul, 205 peças + cortador): cabos (3,35 m), conexões e grampos de cabo, anéis, B6, B12, enrijecedores, D6x6, D6x12, 2 chapas de base.
- Kit 4 (amarelo, 144 peças + chave Allen): B3, B6, B12, arco A6x6, D3x3, D3x6, D6x6, ligação de superfície, folhas de papel.
- Acessórios: barras de comprimento ajustável (B3–B4, B4–B6, B6–B9, B9–B12), ligações leves, placas avulsas, Ground Clip (une chapas de base).

## Fontes

- https://molamodel.com/products/mola-structural-kit-1
- https://molamodel.com/products/mola-structural-kit-2
- https://molamodel.com/pages/compare-products
- https://br.molamodel.com/pages/manual-kit-estrutural-mola-1
- https://br.molamodel.com/pages/manual-kit-estrutural-mola-2
- https://upcommons.upc.edu/bitstreams/59bed473-2c1e-4be5-a9c3-d81db4e83e4c/download
