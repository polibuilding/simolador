# SiMOLAdor — plano do programa

Versão 0.5 · 08/10/2026 · Planejamento antes da implementação. Inclui as respostas da equipe em `A-CONFIRMAR.xlsx` (decisões Q, encaixes E, pranchas P). Regras de montagem detalhadas em `docs/regras-de-encaixe.md`. Peças: `docs/kit-mola-pecas.md`.

## 1. Objetivo

Montar em 3D estruturas com as peças reais do Kit Mola, arrastando peças para a cena e encaixando-as umas nas outras, respeitando as regras físicas do kit e o estoque de cada caixa. A partir do modelo, gerar pranchas (capa com lista de peças, plantas por pavimento, quatro elevações). Fora do escopo: análise estrutural (Q09).

## 2. A ideia central: o modelo é um grafo, não um monte de malhas

O programa não deve "colar" objetos 3D uns nos outros. Ele guarda uma **estrutura lógica** e desenha a partir dela:

- **Nó**: uma esfera (C) ou uma ligação de base (GC, que já tem esfera embutida: E17), com posição em módulos.
- **Membro**: barra (B4, B6, B12) ou diagonal (D4x6, D6x6, D6x12) ligando dois nós. O comprimento entre centros é fixo pelo tipo.
- **Placa**: P6x6 ou P6x12, apoiada em quatro nós que formam o vão correspondente.
- **Ligação**: RC90 (entre dois membros a 90°, ou entre GC e pilar), CC (entre dois membros alinhados) ou CC90 (sobre uma CC, travando um segundo par alinhado perpendicular: nó em X), sempre num nó com esfera (E03–E06).
- **Apoio**: GC com o centro dentro da chapa (borda inclusive), na grade ou em posição livre (E16, E18).

Vantagens: o encaixe vira uma conta (que posições ficam à distância exata do nó?), as pranchas saem limpas e vetoriais e a lista de peças é uma contagem.

### Unidade

Todo o núcleo trabalha em **módulos (M)**. Milímetros só entram na hora de desenhar e cotar, por um único parâmetro `modulo_mm` (hoje 14,87 mm, em `data/parametros.xlsx`).

### Dois modos de geometria

1. **Grade (padrão)**: nós em coordenadas inteiras da grade. Cobre pórticos, vigas, treliças, Vierendeel, grelhas e prédios. O encaixe é trivial e exato.
2. **Livre (fase 4)**: nós em posições calculadas pelos comprimentos das barras. Necessário para geodésicas e triângulos equiláteros, em que três B6 formam um triângulo fora da grade. Resolve-se por interseção de esferas e, depois, por um solver de restrições.

## 3. Como o encaixe funciona (arrastar e soltar)

1. O usuário arrasta uma peça da paleta para a cena.
2. Enquanto arrasta, o programa procura o nó mais próximo do cursor (raycast) que tenha conexão livre.
3. Para aquele nó, calcula as posições candidatas da outra ponta: todos os pontos a exatamente L módulos (B6 → 6 nas três direções; D6x12 → vetores (6,12,0) e permutações).
4. Mostra uma "peça fantasma": verde se o encaixe é válido, vermelha se não é (colisão, estoque esgotado, ângulo menor que 45° com outra peça).
5. Ao soltar, cria o membro e, se não existir, a esfera na outra ponta.
6. Atalhos: girar a candidata (R), alternar candidatas (Tab), desfazer (Ctrl+Z).

Regras a validar (`rules.ts`): a lista completa, com a origem de cada regra, está em `docs/regras-de-encaixe.md`. Resumo:

- comprimento do membro igual à distância entre nós (tolerância em `parametros.xlsx`); três diagonais fixas, sem uso fora do vão nominal;
- estoque configurável: o usuário escolhe quantos kits de cada tipo tem (Q03);
- ângulo mínimo de 45° entre peças numa esfera, o que dá no máximo 8 por plano (E13, E14);
- RC90: uma por canto entre dois membros a 90°; entre GC e pilar, uma, ou uma de cada lado se o usuário quiser (E04);
- CC: exige esfera, liga dois membros alinhados (E05); CC90: vai sobre uma CC e trava o par perpendicular, formando um X (E06);
- placa: liga nas 4 esferas do vão; barras no contorno recomendadas, com aviso se faltarem (E07, E08); horizontal ou vertical (E09);
- polaridade dos ímãs não restringe a montagem (E15).

## 4. Linguagem e tecnologia

**Recomendação: TypeScript no navegador, com Three.js.**

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript | tipagem para regras e catálogo; roda em qualquer computador sem instalar |
| 3D | Three.js via React Three Fiber + drei | padrão do 3D web; câmeras ortográficas, controles de órbita, gizmos e raycast prontos |
| Interface | React | painéis, paleta, propriedades |
| Estado | Zustand + padrão Command | estado único e desfazer/refazer simples |
| Build | Vite | rápido, simples |
| Testes | Vitest | testar o núcleo sem abrir a tela |
| Pranchas | SVG gerado pelo próprio programa + jsPDF/svg2pdf.js | desenho vetorial nítido, exporta PDF |
| Arquivo | JSON `.mola` com versão de esquema | legível, fácil de compartilhar |
| Desktop (futuro, Q01) | Tauri | empacota o mesmo código como app local |
| Código e publicação | GitHub + GitHub Pages (Q06, Q07) | versionamento e acesso pelo navegador |

Alternativas descartadas:

- **Unity/Godot**: ótimos para jogos, ruins para gerar pranchas vetoriais e mais pesados de distribuir para alunos.
- **Python (PyQt + VTK/Open3D)**: bom para cálculo, mas a interação de arrastar e soltar e a distribuição são mais trabalhosas.
- **Plugin de Rhino/SketchUp/Revit**: depende de licença paga do usuário.

## 5. Estrutura de pastas

```
simolador/
├─ README.md
├─ package.json · tsconfig.json · vite.config.ts
├─ A-CONFIRMAR.xlsx         # pendências: medições, encaixes, pranchas, decisões
├─ data/
│  ├─ parametros.xlsx       # FONTE editável: regras de medida, peças, kits, estoque
│  ├─ catalog.json          # gerado a partir da planilha (não editar)
│  ├─ kits.json             # gerado a partir da planilha (não editar)
│  └─ medicoes/             # fotos das peças
├─ scripts/
│  └─ gerar-dados.mjs       # planilha → JSON (npm run dados), com validação
├─ assets/
│  ├─ logo/                 # logo próprio do carimbo (P07)
│  ├─ models/               # glTF das peças complexas (RC90, CC, GC), se modeladas fora
│  └─ icons/                # ícones da paleta
├─ src/
│  ├─ main.tsx
│  ├─ core/                 # lógica pura, sem desenho (100% testável)
│  │  ├─ units.ts           # M ↔ mm
│  │  ├─ catalog.ts         # carrega e valida catalog.json
│  │  ├─ model.ts           # Node, Member, Plate, Connector, Support
│  │  ├─ rules.ts           # validação de encaixes
│  │  ├─ snapping.ts        # posições candidatas
│  │  ├─ inventory.ts       # estoque por kit
│  │  ├─ history.ts         # desfazer/refazer
│  │  ├─ serialization.ts   # salvar/abrir .mola
│  │  └─ freeGeometry.ts    # (fase 4) nós fora da grade
│  ├─ render/
│  │  ├─ Scene.tsx · cameras.ts · lights.ts · materials.ts
│  │  └─ pieces/            # Sphere, Spring (hélice procedural), Cable, Plate, RC90, CC, GroundConn, GroundPlate
│  ├─ interaction/
│  │  ├─ dragDrop.ts · picking.ts · ghost.ts · shortcuts.ts
│  ├─ ui/
│  │  ├─ Palette.tsx        # peças agrupadas por kit, com contador
│  │  ├─ Toolbar.tsx · PropertiesPanel.tsx · StatusBar.tsx · ViewCube.tsx
│  ├─ drawings/             # pranchas
│  │  ├─ projector.ts       # projeção ortográfica do grafo
│  │  ├─ hiddenLines.ts     # linhas ocultas/tracejadas
│  │  ├─ bom.ts             # lista de peças
│  │  ├─ titleBlock.ts      # carimbo
│  │  └─ sheet.ts · exportSvg.ts · exportPdf.ts
│  └─ analysis/             # fora do escopo por ora (Q09)
├─ examples/                # estruturas do manual em .mola (pórtico, treliça, Vierendeel…)
├─ tests/
│  └─ core/                 # regras, encaixe, contagens dos exemplos
└─ docs/
   ├─ arquitetura.md
   ├─ regras-de-encaixe.md
   └─ protocolo-de-medicao.md
```

Exemplo de entrada em `catalog.json` (gerado de `data/parametros.xlsx` por `npm run dados`):

```json
{
  "code": "B6",
  "name": "Barra B6",
  "type": "bar",
  "spanM": [6],
  "geometry": { "centerToCenterMm": 89.22, "lengthMm": 74.62, "diameterMm": 6 },
  "sources": { "lengthMm": "regra" },
  "status": "desenho"
}
```

## 6. Aparência

- **Linguagem visual do manual Mola**: fundo claro, cinza e branco, tipografia limpa, cor de acento por kit (Kit 1 verde, Kit 2 vermelho, Kit 3 azul, Kit 4 amarelo).
- **Peças realistas, mas leves**: mola como hélice procedural metálica, esferas cromadas, ligações em plástico cinza claro, chapa de base preta com a grade branca igual à real (18 × 12 módulos).
- **Layout**:
  - à esquerda, a paleta de peças por kit, com o restante em estoque ("B6 18/24");
  - no centro, a cena 3D com cubo de vistas (faces, arestas e cantos) e o botão Enquadrar;
  - à direita, as propriedades da peça selecionada;
  - no topo, a barra de ferramentas (Selecionar, Mover, Apagar, Desfazer, Vistas, Prancha);
  - embaixo, a barra de status (avisos de validação, contagem de peças).
- **Modo Prancha** em aba própria: folhas A3 com capa, plantas e vistas, carimbo editável, em preto e branco de desenho técnico.
- **Feedback de encaixe**: fantasma verde ou vermelho, nós livres destacados ao aproximar a peça.

## 6b. Especificação das pranchas (do exemplo Desafio Poli-USP 2022)

Referência: `siMOLAdor/sheets/Projeto_Desafio Poli USP_P01–P03.pdf` (AutoCAD LT 2021).

**Formato**: A3 paisagem, Arial. **Escala automática** pelo tamanho da estrutura, escolhida numa lista de escalas usuais (1/1, 1/2, 1/2,5, 1/5…), com opção de fixar (P01). **Sem cotas** (P03). Conjunto de 4 folhas:
- **P_01/04 – Capa** (P08): nome da estrutura, vista isométrica, lista de peças por código e por kit, kits usados, dimensões gerais (vãos, altura, número de pavimentos);
- **P_02/04**: plantas baixas por pavimento (grade 2×2 no exemplo: Pav. Térreo, 1º Pavimento, 2º Pavimento, Cobertura). Com mais pavimentos, a folha se desdobra;
- **P_03/04**: Vista A e Vista B;
- **P_04/04**: Vista C e Vista D.

**Elementos de cada vista**:
- eixos com bolhas: letras (A, B, C) numa direção e números (1, 2) na outra, em linha traço-ponto, gerados automaticamente a partir das coordenadas ocupadas na grade;
- nas elevações, linhas de nível com nome à esquerda, gerado automaticamente (PAV. TÉRREO, 1º PAVIMENTO…, último = COBERTURA) (P05);
- marcadores de vista (triângulo com "VISTA" e a letra) ao redor de cada planta;
- chamadas com linha de chamada e seta: PILAR, LIGAÇÃO, LIGAÇÃO RÍGIDA, LIGAÇÃO DE BASE, CONTRAVENTAMENTO, LAJE, PAREDE. Uma por tipo de peça por vista, posicionadas automaticamente e editáveis (P10);
- título da vista: nome em negrito (PLANTA BAIXA / VISTA - A), subtítulo (pavimento ou estrutura) e escala.

**Símbolos das peças** (medidas reais, desenhadas na escala da folha):

| Peça | Em planta | Em elevação |
|---|---|---|
| Esfera C | círculo Ø 15, cinza médio | círculo Ø 15, cinza médio |
| Barra B4/B6/B12 | retângulo de 6 de largura, cinza claro | idem |
| GC | círculo Ø 44 com furo | retângulo 44 × 10,5, com a calota da esfera aparecendo |
| RC90 | retângulo 6 × 18 | trapézio de lado 18,3 (ou 6 × 19 de perfil) |
| Diagonal | linha fina com terminal | linha fina com terminal em losango |
| Placa horizontal (LAJE) | retângulo cinza claro | faixa fina |
| Placa vertical (PAREDE) | retângulo cinza escuro | retângulo cinza claro com contorno |
| Chapa de base | retângulo de cantos arredondados, linha grossa | linha de terreno grossa |

**Cores**: cinza 0,73 (nós e ligações), 0,86 (barras e placas), 0,46 (parede em planta). Os elementos abaixo do nível cortado aparecem em linha fina, atenuados.

**Penas** (mm no papel): 0,1 (hachuras, eixos), 0,2 (contornos das peças), 0,3 (GC), 0,5 (chapa e terreno), 0,6 (carimbo).

**Carimbo** (rodapé em toda a largura):
- logo próprio da equipe (`assets/logo/`), não o da Mola (P07);
- campos editáveis (P06): linha 1 ("MOLA STRUCTURAL MODEL") e linha 2 (nome do projeto, ex.: "DESAFIO POLI-USP 2026");
- escala da folha e "MEDIDAS EM MILÍMETRO (mm)";
- escala gráfica, gerada a partir da escala real da folha;
- "DESENHO:" com o nome da estrutura;
- número da folha "P_0n/0N", em destaque;
- "FORMATO A3" fora do quadro.

**O que isso muda no programa**:
1. **Pavimentos viram conceito do modelo**: níveis nomeados a cada 6M (ou definidos pelo usuário). A planta de um pavimento é um corte horizontal: mostra o que está no nível e o que está abaixo, atenuado.
2. **Eixos automáticos**: as posições ocupadas na grade definem os eixos e seus rótulos.
3. **Quatro elevações automáticas** (A = frente, B = esquerda, C = fundos, D = direita), com a convenção de espelhamento do exemplo (Vista C mostra C–B–A).
4. **Exportar DXF**, além de SVG e PDF, porque a equipe já usa AutoCAD. Camadas confirmadas (P09): MOLA-ESFERA, MOLA-BARRA, MOLA-PLACA, MOLA-LIGACAO, MOLA-EIXO, MOLA-TEXTO, MOLA-CARIMBO.
5. **O exemplo vira teste de aceitação**: reproduzir a "Estrutura 01" no programa e comparar as plantas e vistas geradas com os PDFs.

**Escala gráfica**: no exemplo, a barra 0–200 mm ocupa 40 mm de papel, o que corresponde a 1:5, enquanto o desenho está em 1/2 (B6 = 44,6 mm no papel = 89,2 mm reais). A equipe considerou a barra correta (P02); fica registrado para conferir. No programa, a barra é sempre gerada a partir da escala real da folha, então sai consistente em qualquer caso.

## 7. Fases

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 0. Dados | `parametros.xlsx` → `catalog.json` e `kits.json` (feito); medições do kit | CC e CC90 medidas |
| 1. Protótipo ✅ | chapa, esferas, GC (grade e livre), B6/B12 na grade; arrastar, encaixar, salvar/abrir; publicado no GitHub Pages | montar o pórtico simples do manual |
| 2. Kits 1 e 2 completos ✅ | diagonais, placas, RC90, CC, CC90, B4; estoque configurável; regras; mover e girar; pontos de encaixe | Estrutura 01 do Desafio 2022 montada com a contagem certa (`examples/`) |
| 3. Pranchas ✅ (1ª versão) | capa, plantas por pavimento, 4 elevações, escala automática, carimbo editável, PDF, SVG e DXF | plantas e vistas da "Estrutura 01" equivalentes às do Desafio 2022 |
| 3b. Edição avançada ✅ | barras inclinadas (passos de 15° nos planos ortogonais e fechamento entre esferas); cubo de vistas; CC/CC90 nos 4 lados; seleção por retângulo (janela e cruzamento); botão esquerdo seleciona, direito gira | triângulo de B6 sobre o pórtico; isométrica pelo cubo; trecho da Estrutura 01 selecionado e apagado |
| 4. Geometria livre | geodésicas e barras fora dos planos ortogonais (E19); mover várias peças juntas | geodésica do manual do Kit 2 |
| 5. App local + Kits 3/4 | empacotar com Tauri (Q01); cabos, arcos | — |

Análise estrutural: fora do escopo (Q09).

## 8. Pendências

Decisões registradas (A-CONFIRMAR, aba Decisões): navegador agora, app local depois (Q01); Kits 1 e 2 (Q02); estoque configurável (Q03); português (Q04); arquivo `.mola` em JSON (Q05); código no GitHub (Q06), publicado no GitHub Pages (Q07); só montar e desenhar (Q09).

Em aberto:
- ~~CC90~~: resolvido. Kit 2 tem 12 RC90 (forma 3), 12 CC (forma 1) e 12 CC90 (forma 2, sobreposta à CC). Total de 145 confirmado.
- **Medidas da CC e da CC90**: necessárias para desenhá-las (o programa usa um formato provisório até lá).
- **Responsáveis por frente** (Q08).
- **Repositório**: nome e dono no GitHub.

## 9. Protocolo de medição (com o kit em mãos)

> As pranchas do Desafio 2022 já dão valores de desenho para módulo, esfera, barras, GC, RC90 e placas (ver `kit-mola-pecas.md`). A medição agora serve para **confirmar** esses valores e preencher o que falta: espessura das placas, geometria de CC/CC90, terminais, polaridade e limites do nó. Prioridade: itens 3, 7, 9 e 10.

Registrar os valores em `A-CONFIRMAR.xlsx`, aba Dimensões.

**Material**: paquímetro digital, régua de aço, papel milimetrado, celular, uma bússola ou um ímã de referência marcado, balança de cozinha (opcional).

**Regras**: medir cada item 3 vezes em 3 peças diferentes e anotar todas as leituras. Para medidas pequenas e repetitivas, medir várias de uma vez e dividir (por exemplo, a grade inteira, de ponta a ponta, dividida por 18).

1. **Chapa de base (G)**: comprimento e largura externos; espessura; distância da primeira linha à borda; distância entre a primeira e a última linha nas duas direções (dividir por 18 e por 12 → valor de M); raio dos cantos.
2. **Esfera (C)**: diâmetro.
3. **Teste da grade (o mais importante)**: montar esfera–B6–esfera sobre a chapa e conferir se as esferas caem exatamente sobre linhas a 6 módulos. Medir a distância externa entre as esferas e subtrair um diâmetro → distância entre centros. Repetir com B12 e B4.
4. **Barras B4, B6, B12**: comprimento total; comprimento e diâmetro do terminal; diâmetro externo da mola; diâmetro do fio; número de espiras; formato do assento do terminal (plano ou côncavo).
5. **Diagonais D4x6, D6x6, D6x12**: comprimento entre terminais; diâmetro do cabo; terminal. Montar no vão correspondente e anotar se fica esticada ou com folga (quanto).
6. **Placas P6x6 e P6x12**: comprimento, largura, espessura, posição dos ímãs. Fotografar como encaixam: sobre as barras ou entre as esferas?
7. **RC90, CC, CC90**: comprimento, largura, altura, ângulos, posição dos ímãs. Em que se prendem: na esfera, no terminal da barra ou nos dois?
8. **Ligação de base (GC)**: diâmetro, altura, altura do centro da esfera acima da chapa.
9. **Polaridade**: com a bússola, marcar N/S em cada ponta de barra e diagonal e em cada face das ligações e placas. Registrar quais combinações grudam e quais repelem.
10. **Limites do nó**: quantas barras cabem ao redor de uma esfera; menor ângulo possível entre duas barras; quantas RC90 cabem num nó.
11. **Fotos para modelagem**: cada peça sobre papel milimetrado, câmera paralela à mesa e afastada com zoom (menos distorção), em três vistas (frente, lado, topo).
12. **Casos de validação**: montar 3 ou 4 estruturas do manual (pórtico, treliça, Vierendeel, grelha) e fotografar de frente, de lado e de cima, com a chapa à vista.
13. **Opcional, para a análise**: massa de cada peça; B6 em balanço com moedas penduradas na ponta, medindo a flecha → calibra a rigidez.
