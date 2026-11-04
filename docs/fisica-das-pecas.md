# Física das peças e ligações do Kit Mola

Versão 1.0 · 04/11/2026. Base de dados física para a linha **3.x** (simulação). Reúne o que se sabe sobre massa, rigidez, resistência e comportamento dinâmico de cada peça e de cada ligação, com a fonte e o grau de confiança de cada número. Dimensões geométricas: `kit-mola-pecas.md`. Plano da simulação: `plano-simolador.md` §10. Regras de montagem: `regras-de-encaixe.md`.

**Status dos valores** (o mesmo da planilha `parametros.xlsx`):

- **medido**: ensaio com número publicado;
- **calculado**: conta a partir de valores medidos;
- **estimado**: conta com hipótese (material, forma) ou foto;
- **a medir**: não há número; o ensaio está na §7.

**Fontes:**

- **[TFG]** Marc Garcia Bautista, *Estudi qualitatiu i quantitatiu de la resposta estructural del model físic (kit Mola)*, TFG, ETSEIB-UPC, jan. 2026 (orientador Josep Maria Pons Poblet). O PDF foi enviado pela equipe em 04/11/2026 e também está publicado no UPCommons.
- **[2022]** As pranchas do Desafio Poli-USP 2022.
- **[nós]** As contas deste documento.

---

## 1. O que muda com o TFG (resumo)

1. **Primeiro número medido de rigidez**: a mola do Kit 1 tem rigidez à flexão **EI ≈ 2.966 N·mm²**. Saiu de três ensaios de flexão em três pontos, com dispersão de 9 % (CV), e é o dado mais útil do trabalho. Com ele, o balanço de uma B6 presa numa GC com RC90, com 11 g na ponta, dá a flecha medida (8 mm), desde que se use o comprimento flexível (≈ 87 mm).
2. **A mola não se comporta como mola comum.** A "teoria de molas" do TFG tem um erro de conta (fator 10, ver §2.3). Corrigida, a mola real é **≈ 14 vezes mais rígida à tração** e **≈ 40 vezes mais rígida à flexão** do que uma mola helicoidal livre com aquele fio. A explicação mais provável é que as **espiras estão encostadas, com pré-tensão** (mola de tração "fechada"). A conta fecha: 112 espiras × 0,6 mm = 67 mm, que é o corpo da B6 sem os terminais. A hipótese precisa ser conferida no kit (ensaio T1).
3. **Para as cargas do kit, a mola praticamente não muda de comprimento.** Com 1 N (≈ 100 g), ela estica uns 0,2 mm, enquanto a flexão dá centímetros. Tratar a barra como **inextensível e flexível** é uma boa primeira aproximação. É o que o modelo cinemático da 1.7 já faz (barra = distância fixa), e a 3.x só precisa somar a flexão.
4. **O peso próprio não é desprezível.** Uma esfera (≈ 14 g, se for de aço maciço) na ponta de uma B6 em balanço deve abaixar **6 a 11 mm**. A simulação precisa considerar o peso das peças desde a primeira versão.
5. **Confirmações para o modelo de ligações** (eram "a conferir"):
   - **GC sem RC90 = rótula**: um pórtico com GC sem RC90 e sem diagonal tomba com uma força lateral pequena (TFG, Fig. 11). É o que o programa faz desde a 1.7.1.
   - **GC + RC90 = engaste, no plano da RC90**: o balanço preso só por GC + RC90 segue a fórmula do engaste. Nos ensaios, a RC90 está sempre no plano da flexão; o plano perpendicular não foi testado. Isso reforça a leitura de que a RC90 na base engasta **só no plano dela** (como L10 entre molas).
   - **A diagonal transforma o mecanismo em estrutura rígida** (Fig. 12). Isso confirma o "só tração" com triangulação.
6. **Flambagem**: o TFG só mostra a flambagem qualitativamente (a mola curta aguenta, a longa curva). Com o EI medido, dá para estimar a carga crítica. Uma B12 rotulada nas duas pontas deve flambar com **≈ 100 g**; uma B12 em balanço (GC + RC90 embaixo, topo livre), com **≈ 25 g**, menos de duas esferas. Ver §5.
7. **O que ninguém mediu ainda**:
   - a força dos ímãs (quanto puxa antes de soltar);
   - a rigidez da RC90, da CC e da CC90;
   - a rigidez das diagonais;
   - as massas;
   - as frequências e o amortecimento.

   Esses são os ensaios da §7. Quase todos dá para fazer em casa, com o kit, uma régua, moedas e o celular.

---

## 2. Leitura crítica do TFG

### 2.1 O que foi feito

| Ensaio | Montagem | Cargas | Resultado | Página |
|---|---|---|---|---|
| Tração (máquina universal, 4 mm/min) | mola entre garras | faixa elástica | **EA = 414,20 N**, R² = 0,9997 | 31 |
| Flexão em 3 pontos | mola sobre dois apoios do kit, vão **L = 110 mm**, carga no meio | 84,23 g (0,826 N) ×2; 132,02 g (1,295 N) | flechas 7,0 / 8,0 / 13,0 mm → **EI = 3.272 / 2.863 / 2.762; média 2.965,6 N·mm²**, CV 9,11 % | 32–33 |
| Balanço | B6 (90 mm c/c) presa em GC + RC90, carga na ponta | 0,1079 N (11 g) | flecha **8,0 mm** (teoria 8,84 mm com L = 90; 7,99 mm com L = 87) | 37–38 |
| Pórtico com bases engastadas | pilares e viga "de 70 mm", GC + RC90 na base | 40 g (0,392 N) no meio da viga | **6,0 mm** com nós de cima rotulados; **3,5 mm** "com ligações" (razão 0,58; teoria citada 0,55) | 39–41 |
| Estabilidade lateral | pórtico sem RC90 na base, sem diagonal | empurrão lateral | **mecanismo**: tomba (Fig. 11) | 41–42 |
| Diagonal | mesmo pórtico + uma diagonal | empurrão lateral | **rígido** (Fig. 12) | 42 |
| Flambagem | mola curta e mola longa entre duas GC + RC90 | compressão à mão | a curta aguenta; a longa curva (Figs. 12–13) | 43–44 |

Parâmetros nominais citados para a mola do Kit 1 (p. 34):

- fio d = 0,6 mm;
- diâmetro médio D = 3,4 mm, portanto diâmetro externo 4,0 mm;
- ≈ 112 espiras;
- aço de mola com G = 80.000 N/mm² (DIN 17223).

Os ímãs são de neodímio (p. 50).

### 2.2 O que se aproveita

- **EI = 2.966 N·mm²** como valor de referência da mola, com incerteza de ±10 %. Ao que tudo indica, vale para B4, B6 e B12 (mesmo fio). A flexão em 3 pontos, com vão de 110 mm, deve ter sido feita numa B12, porque a B6 tem 74,6 mm e não vence esse vão; o balanço foi feito com a B6. Os dois batem com o mesmo EI.
- **Ensaio do balanço** como primeiro caso de validação da simulação (V1 na §10 do plano).
- **Comprimento flexível**: os terminais magnéticos são rígidos e não fletem. Usar o comprimento da parte em espiral, e não o centro a centro, reduz o erro de 9,5 % para ≈ 0.
- **As confirmações qualitativas** (GC rótula, GC + RC90 engaste, diagonal estabiliza, flambagem das longas).
- **A ordem de grandeza das cargas "seguras"**: o autor ficou entre 11 e 40 g nos ensaios com ímã para não soltar as ligações. Só passou disso (84 e 132 g) na flexão sobre apoios, sem ímã trabalhando.

### 2.3 Erros e incoerências (não usar estes números)

| Item | O que o TFG diz | O que as contas dão | Consequência |
|---|---|---|---|
| Constante da mola livre (Riba) | k ≈ 2,96 N/mm; "EA teórico" = 296 N | G·d⁴/(8·D³·n) = 80.000·0,1296/(8·39,3·112) = **0,294 N/mm**; "EA" = **29 N** | erro de vírgula: fator 10 |
| "Fator de correção 1,4" (414/296) | atribuído aos ímãs que travam as espiras das pontas | a razão real é **414/29 ≈ 14** (ou mais, conforme o comprimento usado) | travar algumas espiras não explica 14×; a causa deve ser outra (§2.4) |
| Comprimento de referência do EA | L = 100 mm | a B6 tem 74,6 mm de peça e 89,2 mm centro a centro; a B12 tem 163,8 mm | não se sabe qual mola foi para a máquina: k fica entre 4,1 e 5,6 N/mm |
| Carga do balanço | "massa de 1 grams" | 0,1079 N = **11 g** (como na legenda da Fig. 7) | erro de digitação |
| Fórmula do balanço | δ = P·L³/(48·E·I) | o resultado 8,84 mm sai de **P·L³/(3·E·I)** (fórmula certa do balanço) | só a fórmula impressa está errada |
| Carga crítica | P_cr = π²·E·I/L_e | falta o quadrado: **π²·E·I/L_e²** | só a fórmula impressa |
| Módulo equivalente | um só E_eq, "o aço amolece 6.000 vezes" | tratando a mola como cilindro maciço de Ø 4 mm: E_eq **axial = 33 MPa**, E_eq **de flexão = 236 MPa**. Não existe um E só que sirva para as duas coisas | na simulação, guardar **EA e EI separados** (seção fictícia), nunca um E único |
| Pórtico rotulado: 6,0 mm | flecha da viga com os nós de cima rotulados | viga biapoiada de 70 mm com EI = 2.966: **0,94 mm** (B6 inteira: 1,95 mm). Para dar 6 mm, o EI teria de ser ≈ 470 | 6 vezes mais flecha do que o EI explica. Provavelmente a ligação esfera–mola cede (gira ou escorrega no ímã) |
| "Com ligações" = nós rígidos | a foto (Fig. 10) mostra diagonais em X | com carga vertical simétrica, diagonais em X quase não mudam a flecha do meio da viga | não fica claro se havia RC90 nos cantos de cima. Não usar a razão 0,58 sem repetir o ensaio |
| "4.4.5: teórico 3,5 × medido 6,0" | o texto chama 3,5 de teórico | na seção 5.2, 3,5 é medido | trocou os nomes |

### 2.4 A descoberta escondida: espiras encostadas e pré-tensão

Uma mola helicoidal livre com fio de 0,6 mm e diâmetro de 3,4 mm seria muito mole:

- k ≈ 0,3 N/mm à tração;
- EI ≈ 60–80 N·mm² à flexão, pela fórmula das molas em flexão (Timoshenko & Gere).

A mola do Mola é **14× mais rígida à tração e ≈ 40× à flexão**. Duas pistas apontam para o mesmo lugar:

1. As 112 espiras com fio de 0,6 mm ocupam **67 mm encostadas**, que é exatamente o corpo da B6 (74,6 mm menos dois terminais de ≈ 4 mm). Portanto as espiras **se tocam**.
2. Uma mola de espiras encostadas costuma ser enrolada **com pré-tensão**: as espiras apertam umas contra as outras.

Nesse tipo de mola:

| Esforço | Comportamento esperado | Para a simulação |
|---|---|---|
| Compressão | as espiras já estão encostadas: **não encurta** (fica quase rígida no eixo) até **flambar** | barra inextensível; a compressão é governada pela flambagem (EI) |
| Tração | **não estica** até vencer a pré-tensão F₀; depois estica como mola livre (≈ 0,3 N/mm) | barra inextensível até F₀. Se F₀ for maior que a força do ímã, o ímã solta antes de a mola esticar e a tração nunca deforma a mola no kit |
| Flexão | rígida enquanto as espiras do lado tracionado continuam encostadas; **amolece** quando elas abrem (momento ≈ F₀·D/2) | EI "alto" (≈ 3.000) para momentos pequenos, caindo para momentos grandes. O TFG mostra um leve amolecimento: com 1,57× a carga, a flecha cresceu 1,73× |

O ensaio T1 confirma isso em minutos: olhar a mola contra a luz, puxar com a mão e sentir o "degrau", e pendurar pesos.

---

## 3. Propriedades por peça

Notação: c/c = centro a centro das esferas; L_f = comprimento flexível (só a espiral).

### 3.1 Esfera (C) — nó

| Grandeza | Valor | Fonte | Status |
|---|---|---|---|
| Diâmetro | 15,0 mm | [2022] | desenho |
| Material | aço (é atraída pelos ímãs) | site | confirmado |
| Massa | **≈ 13,9 g** se for aço maciço | [nós] | estimado: pesar 10 (T0) |
| Papel mecânico | **rótula**: as peças giram em volta dela; transmite força, não momento (a não ser com RC90, CC ou CC90) | [TFG] Fig. 11; 1.7.1 | confirmado |

### 3.2 Barras B4, B6, B12 (molas)

| Grandeza | B4 | B6 | B12 | Fonte | Status |
|---|---|---|---|---|---|
| Centro a centro | 59,5 mm | 89,2 mm | 178,4 mm | [2022] | desenho |
| Peça (com terminais) | 44,9 mm | 74,6 mm | 163,8 mm | [2022] | desenho (B6 medida ≈ 75) |
| Espiras (se encostadas) | ≈ 61 | ≈ 111 (TFG: 112) | ≈ 260 | [nós] | estimado |
| Massa do fio | ≈ 1,5 g | ≈ 2,6 g | ≈ 6,2 g | [nós], aço | estimado; **somar os terminais** (pesar: T0) |

| Grandeza (vale para as três) | Valor | Fonte | Status |
|---|---|---|---|
| Fio | 0,6 mm | [TFG] | nominal: conferir no paquímetro |
| Diâmetro médio / externo da espiral | 3,4 / **4,0 mm** | [TFG] | nominal. **Conflito**: o desenho de 2022 usa 6,0 mm (`barra_diametro_mm`). Medir (T1) |
| Material | aço de mola trefilado; G ≈ 80.000 MPa, E ≈ 206.000 MPa | [TFG] | provável |
| **Rigidez à flexão EI** | **2.966 N·mm²** (±10 %) | [TFG] | **medido** |
| Rigidez à tração EA (= k·L₀) | 414 N, com L₀ incerto → **k ≈ 4–5,5 N/mm** | [TFG] | medido, com ressalva |
| Rigidez à compressão | quase rígida (espiras encostadas) até flambar | [nós] §2.4 | hipótese: T1 |
| Pré-tensão F₀ | ? | — | a medir (T1) |
| Comprimento flexível L_f | B6 ≈ 87 mm pelo TFG (balanço); pelas pranchas, ≤ 74,6 mm | [TFG] / [2022] | **conflito**: medir a espiral sem os terminais |
| Comportamento | inextensível na prática; flexível; flamba | [nós] | — |

### 3.3 Diagonais D4x6, D6x6, D6x12

| Grandeza | Valor | Fonte | Status |
|---|---|---|---|
| Cabo entre terminais | 82,6 / 101,6 / 174,9 mm | [2022] | desenho |
| Diâmetro do cabo | ≈ 1 mm | — | estimado |
| Trabalha | **só à tração** | manual; [TFG] Fig. 12 | confirmado |
| Rigidez axial | o fio de aço é muito rígido; quem cede é o terminal e o contato do ímã | — | a medir (T6) |
| Folga montada | quanto sobra no vão nominal (esticada ou frouxa) | — | a medir (já no `medicoes-template.csv`) |
| Massa | ? | — | a medir (T0) |

### 3.4 Placas P6x6 e P6x12

| Grandeza | Valor | Fonte | Status |
|---|---|---|---|
| Lados | 81,9 × 81,9 / 171,1 × 81,9 mm | [2022] | desenho |
| Espessura | ≈ 4 mm | — | estimado |
| Material, massa | ? | — | a medir (T0) |
| Papel | **corpo rígido** preso às 4 esferas pelos ímãs; no próprio plano funciona como **contraventamento** (diafragma), até o ímã escorregar | 1.7.1 | hipótese de trabalho |

### 3.5 Ligação de base GC e chapa G

| Grandeza | Valor | Fonte | Status |
|---|---|---|---|
| GC: Ø × altura; centro da esfera | 44 × 10,5 mm; 7,5 mm acima da chapa | [2022] | desenho |
| Papel | **rótula fixa**: a posição fica presa e a rotação é livre | [TFG] Fig. 11 | **confirmado pelo TFG** (a equipe ainda confere no kit) |
| Como prende na chapa | ímã? encaixe? | — | a medir (T2): força para arrancar e para escorregar |
| Massa | ? | — | a medir |

### 3.6 Ligações RC90, CC e CC90

| Grandeza | RC90 | CC | CC90 | Fonte | Status |
|---|---|---|---|---|---|
| Forma | triângulo de catetos 18,3 mm, 6 mm de espessura | trapézio baixo | "chapéu" alto sobre a CC | [2022]; caixa | desenho / provisório |
| Material | plástico com ímãs | idem | idem | site | — |
| O que trava | o ângulo entre as duas molas **no plano dela** (L10); a torção fica livre | duas molas alinhadas (continuidade) | o segundo par alinhado (X) | regras | equipe |
| Rigidez à rotação | finita ("nem engaste perfeito nem rótula", [TFG] 3.3.4) | ? | ? | — | a medir (T4) |
| Momento que solta | ? | ? | ? | — | a medir (T4) |
| Na base (GC + RC90) | **engaste no plano dela**: o balanço bate com a fórmula do engaste | — | — | [TFG] §5.1 | medido indiretamente |

### 3.7 Kit 3: cabo, acessórios e enrijecedor

| Grandeza | Valor | Fonte | Status |
|---|---|---|---|
| Cabo (corrente de bolinhas): passo, bolinha, rolo | 3,15 mm; 2,4 mm; 3.350 mm | equipe; site | calibrado / estimado |
| Massa do cabo | ? (pesar o rolo e dividir por 3,35 m) | — | a medir (T0) |
| Trabalha | só à tração; frouxo não segura | manual | confirmado |
| Rigidez axial | alta (aço); o que cede são os clips e a CABLE C | — | a medir (T9) |
| Força que solta o clip / a CABLE C | ? | — | a medir (T9) |
| Enrijecedor (tubo transparente Ø ≈ 9 mm) | EI de um tubo de policarbonato Ø 9/7 mm ≈ 490.000 N·mm², **≈ 165× a mola** (Ø 8/6,5: ≈ 90×) | [nós] | estimado: na conta, a mola enrijecida vira **barra rígida** |

### 3.8 Ímãs (todas as ligações)

| Contato | Força para arrancar (puxando no eixo) | Força para escorregar (de lado) | Status |
|---|---|---|---|
| Mola × esfera | ? | ? | a medir (T2), **prioridade alta** |
| Diagonal × esfera | ? | ? | a medir (T2) |
| RC90 × esfera / × mola | ? | ? | a medir (T2/T4) |
| Placa × esfera | ? | ? | a medir (T2) |
| GC × chapa | ? | ? | a medir (T2) |
| CABLE C × esfera | ? | ? | a medir (T9) |

Material: neodímio [TFG]. Sem esses números, a simulação não sabe dizer **o que solta primeiro**, que é o colapso mais comum no kit.

---

## 4. Ligações: do modelo de hoje ao da simulação

| Ligação | Hoje (1.x, cinemático) | Evidência | Modelo proposto (3.x) | Falta |
|---|---|---|---|---|
| Esfera | rótula | [TFG] Fig. 11 | nó com 3 deslocamentos; cada ponta de mola tem rotação própria | força do ímã (arranca/escorrega) |
| Mola | distância fixa | §2.4 | viga inextensível (ou EA alto) com **EI = 2.966** | F₀; EI para momentos grandes |
| RC90 entre molas | trava o ângulo no plano dela | regras L10 | mola de rotação **só no eixo normal ao plano dela**, rigidez k_RC90 e momento de deslizamento | k_RC90, M_solta (T4) |
| RC90 na base | engasta (`RC90_BASE_ENGASTA = true`) | [TFG] balanço e pórtico | **engaste no plano dela**; duas RC90 em planos perpendiculares = engaste completo | confirmar com a equipe; k na base (T4) |
| CC | colinear | — | continuidade da flexão nos dois planos entre as duas pontas | rigidez (T4) |
| CC90 | trava também o ângulo com o par da CC | — | idem para o segundo par; o ângulo entre os pares fica a confirmar | rigidez, regra |
| GC | fixa | [TFG] Fig. 11 | apoio de 3 deslocamentos presos, rotação livre; verificar arrancamento e escorregamento pela reação | força na chapa (T2) |
| Placa | corpo rígido | — | corpo rígido de 6 graus, preso aos cantos por "molas de ímã" | massa; escorregamento |
| Diagonal | só tração | [TFG] Fig. 12 | barra só de tração (desliga quando comprimida); rigidez EA_d | EA_d, folga (T6) |
| Cabo do Kit 3 | só tração, comprimento em bolinhas | manual | idem; frouxo de verdade (com barriga) na 3.5 | rigidez dos clips (T9) |
| Anel | nó só de cabos, posição do usuário | — | posição de **equilíbrio** (busca de forma) | — |
| Enrijecedor | — | [nós] | mola com EI × 100 (ou rígida) | EI (T11) |

---

## 5. Números de referência (estimativas com EI = 2.966 N·mm²)

Servem para a equipe ter noção de grandeza e para os testes automáticos da simulação. Ao lado de cada um, o ensaio que confere.

### 5.1 Flambagem (Euler, P_cr = π²·EI/(K·L)², em gramas-força)

Faixa: o menor valor usa o comprimento centro a centro; o maior usa só a peça.

| Barra | Rotulada nas duas pontas (K = 1) | Engaste + rótula (K = 0,7) | Engaste nas duas (K = 0,5) | Em balanço: GC + RC90 e topo livre (K = 2) |
|---|---|---|---|---|
| B4 | 840–1.480 g | 1.720–3.020 g | 3.370–5.930 g | 210–370 g |
| B6 | 375–535 g | 765–1.095 g | 1.500–2.140 g | 95–135 g |
| B12 | **95–110 g** | 190–225 g | 375–445 g | **23–28 g** |

Leitura prática:

- Um pilar B12 em balanço flamba com menos de duas esferas no topo.
- A B12 rotulada aguenta umas 7 esferas.
- A flambagem é o limite principal das B12; a B4 quase nunca flamba antes de o ímã soltar.

Conferir com o ensaio T5. Atenção: se a pré-tensão (§2.4) amolecer a mola em flexão, os valores reais ficam menores.

### 5.2 Flechas

| Situação | Conta | Estimativa |
|---|---|---|
| B6 em balanço (GC + RC90) com 11 g na ponta | P·L_f³/(3·EI), L_f = 87 | **8,0 mm** (TFG mediu 8,0) |
| B6 em balanço com **uma esfera na ponta** (peso próprio) | idem com 13,9 g, L_f = 75–89 | **6–11 mm** (T3) |
| B6 biapoiada em duas esferas, 40 g no meio | P·L³/(48·EI), L = 75–89 | 1,1–2,0 mm, mais o que a ligação ceder |
| B12 biapoiada, 40 g no meio | L = 164–178 | 12–16 mm |

### 5.3 Dinâmica (frequência própria, f = √(k/m)/2π)

| Situação | Rigidez | Massa | Frequência |
|---|---|---|---|
| B6 em balanço com uma esfera na ponta | 3·EI/L³ = 12,5–21,4 N/m | ≈ 14,5 g | **≈ 5–6 Hz** |
| Pórtico B6 com GC + RC90 nas bases, oscilando de lado | 2 × 3·EI/h³ ≈ 25 N/m | ≈ 31 g (2 esferas + viga) | **≈ 4,5 Hz** |

São frequências fáceis de filmar (câmera lenta do celular, 120–240 quadros/s), ver T7. O amortecimento não tem estimativa: o aço quase não amortece, mas o atrito entre espiras encostadas e nos ímãs deve amortecer. É preciso medir.

---

## 6. Como o modelo físico "falha" (o que a simulação precisa prever)

| Modo | Quando acontece | Como calcular | Parâmetro que falta |
|---|---|---|---|
| **Mecanismo** (tomba sem resistir) | faltam vínculos | graus de liberdade: **já existe (1.7)** | — |
| **Flambagem** de uma mola comprimida | N > P_cr | Euler por barra, com o comprimento efetivo pelo tipo de ponta; depois, flambagem global (autovalor) | EI na compressão; vínculos da RC90 |
| **Ímã solta** (a ponta descola) | tração na ponta > força do ímã | esforço normal na ponta da barra | força de arrancamento (T2) |
| **Ponta escorrega** na esfera | cortante > atrito do contato | cortante na ponta | força de escorregamento (T2) |
| **RC90 / CC cede** | momento > momento de deslizamento | momento na ligação | M_solta (T4) |
| **GC escorrega ou levanta** da chapa | reação horizontal/vertical > força da GC | reações | T2 |
| **Diagonal / cabo frouxo** | ficaria comprimido | barra só de tração (desliga) | folga montada |
| **Deformação exagerada** | flecha visível demais (vale como "estado de serviço" didático) | flecha / vão | limite a combinar com a equipe |

---

## 7. Ensaios para a equipe (sem laboratório)

Material:

- o kit;
- régua de aço e papel milimetrado colado atrás da montagem;
- paquímetro;
- balança de cozinha (1 g);
- moedas ou porcas como pesos (**pese cada uma**);
- copinho plástico com fio para pendurar;
- celular com câmera lenta.

Para ler as flechas, fotografe de frente, com a câmera longe e com zoom (menos distorção). Repita cada medida 3 vezes, de preferência com peças diferentes.

Registro: `docs/ensaios-template.csv` (uma linha por leitura).

| # | Ensaio | O que fazer | Alimenta | Prioridade |
|---|---|---|---|---|
| **T0** | Massas | Pesar 10 esferas juntas, 10 B6, 5 B12, 10 B4, 10 diagonais de cada, as placas, as GC, as RC90 e o rolo de cabo (dividir por 3,35 m) | peso próprio, dinâmica | **alta** (5 min) |
| **T1** | A mola é fechada? | Olhar a B6 contra a luz (as espiras se tocam?); medir o diâmetro externo e o fio; contar as espiras em 10 mm; medir o comprimento só da espiral. Pendurar a B6 pela esfera de cima e ir pondo peso no copinho: anotar o alongamento a cada 20 g até soltar. Há um peso abaixo do qual ela não estica (pré-tensão)? | §2.4, EA, F₀, L_f, diâmetro (conflito 4 × 6 mm) | **alta** |
| **T2** | Força dos ímãs | Arrancamento: esfera presa (na GC); pendurar o copinho na ponta da mola, na vertical, e pôr peso até soltar. Repetir com diagonal, RC90 e placa. Escorregamento: mesma ideia, puxando de lado. GC: puxar para cima e de lado sobre a chapa | modo de falha "ímã solta" | **alta** |
| **T3** | Balanço com peso próprio | GC + RC90, B6 na horizontal, uma esfera na ponta; medir quanto a ponta abaixa. Depois com 1, 2 e 3 moedas no copinho. Repetir com a B4 e a B12 | EI (confere o TFG), L_f, linearidade | **alta** (é o primeiro caso de validação) |
| **T4** | Rigidez da RC90 e da CC | (a) Balanço do T3 com a mola presa numa **esfera** + RC90 (não na GC) e a esfera presa por uma GC. (b) Pórtico de duas B6 com RC90 no canto, carga na ponta; comparar a flecha com a conta de barras perfeitamente engastadas. O excesso é a ligação cedendo. Pôr peso até a RC90 escorregar | k_RC90, M_solta | média |
| **T5** | Flambagem | B12 vertical entre GC (embaixo) e esfera (em cima), com uma placa ou copinho apoiado no topo; ir pondo peso até curvar. Repetir com GC + RC90 embaixo e com B6. Anotar o peso em que a mola "dobra" | P_cr; confere a §5.1 | média |
| **T6** | Diagonal | Pórtico B6 com GC sem RC90 + uma diagonal; puxar o topo de lado com o copinho por um fio (passando sobre a borda da mesa) e medir o deslocamento. Medir a folga da diagonal no vão | EA_d, folga | média |
| **T7** | Frequência e amortecimento | Montagem do T3 com uma esfera na ponta: dar um toque e filmar em câmera lenta com a régua atrás. Contar as oscilações por segundo e quanto cai a amplitude a cada ciclo. Repetir no pórtico do TFG (GC + RC90, viga B6) | dinâmica (§5.3) | média |
| **T8** | Pórtico do TFG | Repetir com B6: pilares com GC + RC90, viga apoiada nas esferas, 40 g no meio; depois com RC90 nos dois cantos de cima | V3; ligação esfera–mola | baixa |
| **T9** | Cabo do Kit 3 | Pendurar pesos num pedaço de 30 bolinhas preso por CABLE C + clip: alongamento e peso que solta | cabo, clips | baixa |
| **T10** | Placa como contraventamento | Pórtico sem diagonal com uma placa vertical no vão; empurrar de lado até escorregar | placa no plano | baixa |
| **T11** | Enrijecedor | Balanço do T3 com a B6 enrijecida | EI enrijecida | baixa |

---

## 8. Onde os números vão morar

Quando houver medida, os valores entram em **`data/parametros.xlsx`**, numa aba nova **"Física"** (uma linha por parâmetro, com valor, unidade, fonte e status). O script os leva ao `catalog.json`, e a tela de Configurações ganha a aba "Física" para calibrar. Nomes propostos:

| Parâmetro | Valor inicial | Status |
|---|---|---|
| `mola_EI_Nmm2` | 2966 | medido [TFG] |
| `mola_k_tracao_N_mm` | 4,5 | medido com ressalva [TFG] |
| `mola_pretensao_N` | — | a medir (T1) |
| `mola_comprimento_flexivel_desconto_mm` | — | a medir (T1): peça − espiral |
| `esfera_massa_g`, `barra_massa_g_por_mm`, `terminal_massa_g`, `diagonal_massa_g`, `placa_massa_g`, `gc_massa_g`, `rc90_massa_g`, `cabo_massa_g_por_m` | esfera 13,9 (estimado) | a medir (T0) |
| `ima_mola_esfera_N`, `ima_diagonal_esfera_N`, `ima_placa_N`, `ima_rc90_N`, `gc_chapa_N` (arrancar e escorregar) | — | a medir (T2) |
| `rc90_rigidez_Nmm_rad`, `rc90_momento_solta_Nmm`, `cc_rigidez_Nmm_rad` | rígido | a medir (T4) |
| `diagonal_EA_N`, `diagonal_folga_mm` | rígido / 0 | a medir (T6) |
| `amortecimento` (fração do crítico) | 0,02 | a medir (T7) |
| `enrijecedor_fator_EI` | 100 | estimado |

## 9. Perguntas para a equipe

1. **GC = rótula**: o TFG confirma (Fig. 11). Vocês confirmam no kit? Basta tirar a RC90 de um pilar e ver se ele tomba.
2. **RC90 na base**: engasta **só no plano dela**, como entre molas (L10)? Se sim, a chave `RC90_BASE_ENGASTA` vira "engasta no plano", e duas RC90 perpendiculares engastam de vez.
3. **Unidade de carga na tela**: gramas (como no kit) ou newtons? Proposta: **gramas**, com newtons entre parênteses.
4. **Onde parar a simulação** quando um ímã solta: só avisar ("solta aqui com 85 g") ou mostrar o colapso progressivo?
5. A dissertação do criador do Mola (UFOP) pode ter mais dados (cap. 3.4 e 4). A versão em português está no site da Mola, mas daqui só deu para ler a introdução. Se alguém baixar e mandar o PDF, a §3 é completada.
