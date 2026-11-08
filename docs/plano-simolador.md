# SiMOLAdor — plano do programa

Versão 0.5 · 08/10/2026 · Planejamento antes da implementação. Inclui as respostas da equipe em `A-CONFIRMAR.xlsx` (decisões Q, encaixes E, pranchas P). Regras de montagem detalhadas em `docs/regras-de-encaixe.md`. Peças: `docs/kit-mola-pecas.md`.

## 1. Objetivo

Montar em 3D estruturas com as peças reais do Kit Mola, arrastando peças para a cena e encaixando-as umas nas outras, respeitando as regras físicas do kit e o estoque de cada caixa. A partir do modelo, gerar pranchas (capa com lista de peças, plantas por pavimento, quatro elevações). Análise estrutural: fora da linha 1.x (Q09); é a linha 3.x, planejada na §10, com a física das peças em `docs/fisica-das-pecas.md`.

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
4. Mostra uma "peça fantasma": verde se o encaixe é válido, vermelha se não é (colisão, estoque esgotado, ângulo menor que 40° com outra peça).
5. Ao soltar, cria o membro e, se não existir, a esfera na outra ponta.
6. Atalhos: girar a candidata (R), alternar candidatas (Tab), desfazer (Ctrl+Z).

Regras a validar (`rules.ts`): a lista completa, com a origem de cada regra, está em `docs/regras-de-encaixe.md`. Resumo:

- comprimento do membro igual à distância entre nós (tolerância em `parametros.xlsx`); três diagonais fixas, sem uso fora do vão nominal;
- estoque configurável: o usuário escolhe quantos kits de cada tipo tem (Q03);
- ângulo mínimo de 40° entre molas numa esfera (era 45° até 13/10; E13, E14); na GC, mola a pelo menos 40° da chapa (até 50° da vertical);
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
- **Layout** (interface leve, 1.4.2: traços finos, cantos suaves, pouco peso):
  - no topo, à esquerda: logos pequenas, siMOLAdor, Arquivo, Configurações (engrenagem), desfazer/refazer; no centro, o nome do projeto; à direita, o estoque, Pranchas e Simolar;
  - à esquerda, a paleta de peças (código com as bolinhas dos kits ao lado; quantidade só com estoque limitado), por cima da cena, até o fim da tela; a seta « a recolhe num menu pequeno só com os símbolos (uma coluna, ou duas se faltar altura) e a seta » a devolve; a cena não muda de tamanho: a imagem desliza junto com a paleta (1.4.4/1.4.5);
  - marca: logos do Kit Mola (leva a br.molamodel.com) e da Poli Building (leva ao Instagram), e o nome siMOLAdor; o símbolo do programa (hexágono do Mola com os triângulos alternando azul e amarelo) aparece só na aba do navegador, por enquanto;
  - Arquivo: ".mola" em cinza claro e os ícones Novo, Abrir e Salvar;
  - no centro, a cena 3D com o cubo de vistas (segue a projeção: paralela ou perspectiva), a dica da ferramenta em texto pequeno e a barra de baixo (Encaixe, Barras, Vista);
  - à direita, o resumo / a peça selecionada, por cima da cena: » no canto de cima recolhe; recolhido, fica só a « transparente no canto de cima da cena (abre pelas setas, ou pelo duplo clique numa peça até o Esc; selecionar com um clique não o abre: o nome dela aparece bem de leve no canto de baixo, à direita, antes da versão);
  - a versão, bem de leve, no canto inferior direito.
- **Modo Prancha** em aba própria: folhas A2, A3, A4 ou personalizada, com capa, plantas, vistas e cortes, carimbo editável na própria folha, em preto e branco de desenho técnico. Desde 1.8.0, a tela segue a mesma linguagem leve da montagem: barra de cima com desfazer/refazer, Escala (com a personalizada), Folha, Capa, Mostrar (cotas, eixos, peças, vistas, renderizada) e "Voltar ao automático"; barra lateral Inserir à esquerda (planta, A–D, 4 isométricas, cortes, Corte); painel lateral do desenho escolhido à direita; dicas no rodapé (1.8.1).
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

**Carimbo** (rodapé em toda a largura; desde 1.8.0, regras F1–F4 em `regras-de-encaixe.md`):
- logos (Mola e equipe, `public/logos/`), campo fixo;
- título (maior, em negrito) e subtítulo, iguais em todas as folhas e editáveis clicando neles na prancha (antes "linha 1" e "linha 2", P06);
- desenhos da folha em nomes curtos ("PB 1º PAVIMENTO", "VISTA-A", "CORTE 1"), agrupados para caber;
- kits usados;
- "ESCALA: 1/X" (ou "INDICADA" com mais de uma escala na folha; "SEM ESCALA" na capa) e "MEDIDAS EM MILÍMETRO (mm)";
- número da folha "0n/0N", em destaque, e o formato no nome do quadro.

A **escala gráfica** saiu do carimbo: fica na direita da folha, vertical e sem moldura, uma por escala da folha.

**Arranjo** (desde 1.8.0, F7–F10): nasce automático (como acima) e pode ser mexido: inserir plantas, vistas e cortes clicando na folha, tirar desenhos (ex.: pavimentos repetidos de uma torre), mudar de prancha, dar escala própria. O arranjo mexido fica no `.mola` por tamanho de folha (`SheetMeta.layouts`), junto com os cortes (`cuts`) e os ajustes de cada desenho (`views`: título, subtítulo, o que mostrar). Código: `src/drawings/sheets.ts` (desenhos e carimbo), `layout.ts` (mudanças no arranjo), `src/ui/SheetsView.tsx` e `SheetTools.tsx` (tela).

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
| 3b. Edição avançada ✅ | barras inclinadas sob demanda (Shift ou botão; passos de 15° nos planos ortogonais e fechamento entre esferas), com folga entre esferas (C4, C5); placas, diagonais e ligações em planos inclinados; guias azuis/amarelos e coordenadas da GC; cubo de vistas; CC/CC90 nos 4 lados; seleção por retângulo (janela e cruzamento); botão esquerdo seleciona, direito gira | triângulo de B6 sobre o pórtico; isométrica pelo cubo; trecho da Estrutura 01 selecionado e apagado |
| 3c. Produtividade e pranchas ✅ | copiar/colar, mover várias peças, espelhar, repetir; cotas entre eixos, totais e níveis; etiquetas arrastáveis; logos no carimbo | dois pavimentos empilhados com Ctrl+C/V; pranchas da Estrutura 01 com cotas |
| 3d. Várias chapas ✅ | chapas lado a lado com distância padrão ou livre; estruturas ligadas entre chapas; exportar/importar por chapa; pranchas por chapa | duas chapas a 6 módulos com viga ligando os pilares |
| 3e. Pranchas editáveis (1.8.0) | carimbo novo editável na folha; A2 e folha personalizada; Mostrar global e por desenho; inserir, tirar e mudar desenhos de prancha; cortes marcados na planta | torre sem os pavimentos repetidos e com um corte, em PDF |
| 4. Geometria livre | geodésicas e barras fora dos planos ortogonais (E19); mover várias peças juntas | geodésica do manual do Kit 2 |
| 5. Aplicativo (desde 05/11/2026) | 1.10 pronto para usar fora do site; 1.11 aplicativo de computador (detalhe na §7c) | o instalador baixado do site da equipe abre um `.mola` com duplo clique, funciona sem internet e se atualiza sozinho |

Análise estrutural: fora da linha 1.x (Q09); plano da linha 3.x na §10.

## 7c. Fase 5: aplicativo (plano de 05/11/2026)

Objetivo: o siMOLAdor pode ser **baixado no site da equipe** e usado sem internet. A cada fase nova (X.Y), o site oferece a versão nova, e as correções (Z) chegam sozinhas pelo atualizador.

**Dois caminhos, nesta ordem:**

1. **App instalável pelo navegador (PWA)**: "Instalar siMOLAdor" no Chrome e no Edge. Ganha ícone, janela própria, funciona sem internet e se atualiza sozinho. Entra na **1.10**.
2. **App de computador (Tauri)**: instaladores para Windows, Mac e Linux (≈ 10 MB, usando o navegador do sistema), com `.mola` aberto por duplo clique, salvar direto no arquivo e atualizador. Entra na **1.11**.

**1.10 — Pronto para usar fora do site** (vale para o site e prepara o app):

| Entrega | Versão |
|---|---|
| Arquivos de verdade: Salvar grava no mesmo arquivo, Salvar como, Recentes, cópias automáticas antes de trocar de projeto, aviso de alterações não salvas | 1.10.0 |
| Compatibilidade do `.mola`: o arquivo guarda a versão do programa; arquivo de versão mais nova abre com aviso, em vez de recusar | 1.10.0 |
| Sem internet: fonte embutida, manifesto (ícone, `.mola`), service worker gerado no build com todos os arquivos; aviso "nova versão disponível" | 1.10.0 |
| Sobre e Novidades (do CHANGELOG), botão Instalar, relatório de erro para a equipe (versão, navegador, placa de vídeo, erros recentes) | 1.10.0 |
| Pranchas (pedido da equipe, 07/11): esquema dos pavimentos na capa, planta baixa cortada a qualquer altura, marcadores de vista arrastáveis, seleção de vários na prancha (F17–F20) | 1.10.1 ✅ |
| Base para a 2.x, por dentro e sem mudar o uso (pedido da equipe, 08/11): catálogo em camadas, peças criadas no `.mola`, arquivo `.kit`, kit sem limite, placa de N cantos, parâmetros do Kit X na planilha (§11.5) | 1.10.2 ✅ |
| Impressão direta das pranchas e revisão das exportações | 1.10.3 |
| Modo leve para computador fraco (sem sombras nem renderizado, menos resolução) e teste num notebook com vídeo integrado | 1.10.4 |

**1.11 — Aplicativo de computador:**

- Envelope Tauri em volta do build. O núcleo não muda.
- Salvar e exportar pela janela "Salvar como" do sistema: o download por link do navegador não funciona dentro do app.
- Associação do `.mola`.
- "Importar do site": as configurações, o perfil e o trabalho guardado no navegador ficam num armazenamento separado no app.
- Testar o 3D no navegador interno do Mac e do Linux, que é mais fraco que o do Windows.
- **Distribuição**:
  - etiqueta `vX.Y.Z` → GitHub Actions monta os instaladores das três plataformas → *Release* no GitHub;
  - a página de download no site da equipe usa os links `…/releases/latest/download/…`, que sempre apontam para o mais recente;
  - o atualizador do Tauri lê o arquivo da última versão, com os pacotes assinados por uma chave da equipe, guardada como segredo no GitHub.
- **Pré-requisito**: as etiquetas `vX.Y.Z` existirem no Git (hoje não há nenhuma; ver `.github/versoes.txt`).

**Política de versões:**

- **O site** (GitHub Pages) recebe toda entrega X.Y.Z, como hoje.
- **O app** é anunciado por fase: a página mostra "siMOLAdor 1.11", e o instalador é sempre o último 1.11.z. As correções Z chegam pelo atualizador.
- Virar app não muda o X (a linha).

**Decisões da equipe (pendentes):**

1. **Marca Mola**: autorização por escrito da Mola (Márcio) para distribuir um instalador público com o nome e as peças. É o passo mais importante fora do código.
2. **Assinatura de código**: sem ela, o Windows mostra "o Windows protegeu o computador" e o Mac bloqueia o app.
   - Mac: Apple Developer Program, US$ 99/ano.
   - Windows: serviço de assinatura da Microsoft (≈ US$ 10/mês; conferir se atende a Poli Building no Brasil) ou um certificado comprado.
   - Dá para começar sem assinatura, com instrução de instalação.
3. **Plataformas**: só Windows primeiro, ou Windows e Mac.
4. **Página de download**: em que plataforma está o site da Poli Building.
5. **Licença do código** e **quem publica** (etiquetas e chave de assinatura).

## 7b. Versões do programa

O número aparece no rodapé, depois das logos; o histórico fica em `CHANGELOG.md` e cada versão tem uma etiqueta no Git (`v1.0.0`, `v1.8.2`…).

- **1.x — geométrica** (atual: 1.10.2): montar com as peças e regras reais do kit e gerar as pranchas.
- **2.x — arquitetônica**: flexibilidade, ajustabilidade e criação de peças próprias para representar e simular estruturas que fogem das limitações das peças atuais do kit. O instrumento é o **Kit X** (barra, placa e RC de qualquer ângulo, catálogo próprio e arquivo `.kit`, §11).
- **3.x — de engenharia**: deformação, estaticidade e estabilidade.

O número tem três partes, **X.Y.Z**: X é a linha; Y sobe quando muda o assunto principal ou o jeito de usar (uma fase: 1.7 rigidez, 1.8 pranchas editáveis); Z conta cada entrega publicada dentro da fase, nova ou correção (1.8.0, 1.8.1, 1.8.2…). Toda entrega publicada ganha número. Em 28/10/2026 as versões 1.0 a 1.25 foram renumeradas nesse formato (1.25 virou 1.8.1); a equivalência está no `CHANGELOG.md`.

## 8. Pendências

Decisões registradas (A-CONFIRMAR, aba Decisões): navegador agora, app local depois (Q01); Kits 1 e 2 (Q02); estoque configurável (Q03); português (Q04); arquivo `.mola` em JSON (Q05); código no GitHub (Q06), publicado no GitHub Pages (Q07); só montar e desenhar (Q09).

Em aberto:
- ~~CC90~~: resolvido. Kit 2 tem 12 RC90 (forma 3), 12 CC (forma 1) e 12 CC90 (forma 2, sobreposta à CC). Total de 145 confirmado.
- **Medidas da CC e da CC90**: necessárias para desenhá-las (o programa usa um formato provisório até lá). **Lembrete pedido pela equipe (13/10): ajeitar as peças CC e CC90.**
- **Configurações** (engrenagem; 1.6.0): o menu muda módulo, ângulo mínimo entre molas, ângulo mínimo da mola na GC, passo das inclinadas (o rótulo da barra de baixo acompanha) e o tamanho da chapa; **1.9.0**: a engrenagem abre direto a janela, com as abas Geral, Peças, Medidas gerais, Cabo e as pessoais (no navegador, não no projeto): **Tutorial** (seis passos que se marcam sozinhos), **Aparência** (chapa, fundo, eixos, animações; aplicar recarrega), **Perfil** (nome e equipe na capa das pranchas) e **Idioma** (só português). **Próximo**: inglês e espanhol (separar os textos da interface para tradução); tutorial guiado na própria cena. Os pesos ainda não entram em nenhuma conta (3.x).
  - **Proteção**: limites em cada valor; checagens cruzadas (molas com comprimento positivo, esfera menor que o menor vão, bolinha menor que o passo, GC menor que a chapa) bloqueiam o Aplicar; antes de aplicar, a tela mostra o que muda na estrutura aberta (GC fora da chapa, chapas sobrepostas, ângulos abaixo do novo mínimo); aplicar recarrega o programa com a estrutura salva; se a abertura travar, a seguinte volta ao padrão sozinha (as configurações recusadas ficam guardadas à parte); valores ilegíveis são ignorados com aviso; tela de erro com "Voltar às configurações padrão"; `?padrao` no endereço abre sem as configurações.
- **Rigidez e movimentos livres** (1.7.1, `src/core/mechanism.ts`): esferas = rótulas; RC90 trava ângulo; RC90 na base engasta; CC/CC90 travam 180°; placas = corpos rígidos; diagonais e cabos só tração; GC fixas. Graus de liberdade pelo posto da matriz de rigidez, com teste finito (descarta as "dobras" que só existem no infinitesimal, como a torção de um pórtico plano com RC90). Duplo clique: 0 = travado, 1 = caminho azul/vermelho (traçado numericamente), 2+ = arraste livre mexendo o mínimo. Resumo: bloco Estabilidade com os graus de liberdade; painel da peça: "Movimento".
  - Confirmado pela equipe (14/10): a RC90 trava só o ângulo, não a torção (a mola gira em torno do próprio eixo). **16/10 (1.8.0, L10)**: a RC90 trava só a inclinação no plano em que foi posicionada; no perpendicular a mola gira. No modelo cinemático já era assim (distância entre as pontas); o "mover só o nó" deixou de travar o nó e passou a usar o mesmo vínculo. **A confirmar**: a RC90 na base (hoje engasta sozinha) segue a mesma regra, e só duas em lados perpendiculares engastam? A conferir: a CC90 trava também o ângulo entre os dois pares; a GC é rótula (sem RC90 na base, o pilar tomba em qualquer direção, até o limite de 40° com a chapa) — **a equipe vai conferir a GC**. **04/11 (TFG da UPC, `fisica-das-pecas.md`)**: o pórtico sem RC90 na base e sem diagonal tomba (GC = rótula, como no programa), e a GC + RC90 funciona como engaste no plano da RC90 (o balanço bate com a fórmula do engaste). Isso reforça "RC90 na base engasta só no plano dela"; falta a equipe confirmar no kit. **04/11 (dissertação de Oliveira, 2008)**: a GC sozinha como rótula e a GC + RC90 como engaste aparecem também nos ensaios do criador do kit. É a segunda fonte independente.
  - **Conjuntos** (1.7.2, `moveScopes` em `globalMove.ts`): o que fica fora do conjunto é tratado como preso. Candidatos: anéis de vizinhas a partir da peça (até o primeiro que mexe, e mais um), pavimentos (tudo de uma altura para cima) e a estrutura toda; partes que ficariam soltas vão junto. Ficam os que mexem a peça e mexem um grupo novo (comparação pelo suporte do núcleo da matriz de rigidez; conta linear primeiro, teste finito nos conjuntos de até 24 esferas). Na 1.7.2, Tab ampliava.
  - **Edição por etapas** (1.8.0, E2f): Espaço passa para a próxima etapa (Shift+Espaço volta), guardando a posição; cada etapa aceita vira um bloco rígido (as esferas que mexeram e as vizinhas, mais um anel se as vizinhas ficam numa reta; `shapeGroup` em `globalMove.ts`, `freezeShapes` em `mechanism.ts`) nas etapas seguintes. **Tab** (E2g) percorre as referências do caminho, incluindo as circunferências da esfera de uma mola (`sphereRings` em `edit.ts`).
  - **GC perto da estrutura** (1.7.2, `reach.ts`): círculos na chapa onde uma mola nova (até uma esfera baixa) ou pendurada (desce girando) chega até a GC respeitando G12.
  - Feito na 1.8.3: rótulas que giram em laranja durante o movimento; **G** no arraste livre segue um modo (uma liberdade) por vez, como caminho; diagonal frouxa desenhada com barriga (parábola com o comprimento da diagonal). Próximos: o cabo do Kit 3 frouxo (hoje ele é recontado e fica sempre esticado); levar o estudo para a 3.x (rigidez das molas, enrijecedor, cargas).
- **Pranchas editáveis** (1.8.0, F1–F12; 1.8.1, F13–F16): carimbo novo, folhas A2/A3/A4/personalizada, Mostrar global e por desenho, inserir desenhos e cortes; na 1.8.1, escala personalizada, Ctrl+Z/Ctrl+Y das pranchas, "Voltar ao automático" explicado, barra lateral Inserir, 4 isométricas, corte nas vistas transversais, lixeira do corte e desenhos renderizados. **A conferir com a equipe**: tamanho do quadro das logos (hoje 36 mm na A3, como antes); o arranjo mexido não acompanha pavimentos novos (hoje: "Voltar ao automático › Desenhos das pranchas"); a chapa preta nas plantas renderizadas pesa na impressão (talvez clarear só na foto). **Próximos**: textos livres inseríveis; corte com profundidade limitada (hoje vai até o fim da estrutura); seção de placas e diagonais cortadas; o desenho que passa da folha avisa; isométrica inserida com tamanho menor de partida.
- **Biblioteca** (ao lado da engrenagem; 1.6.0): por enquanto "em breve" e os exemplos que vêm com o programa (abrem com um clique). Depois: biblioteca online de modelos enviados pelos usuários (precisa de um servidor e de contas: definir onde hospedar).
- **Simolar** (botão ao lado de Pranchas): por enquanto "em breve"; é a porta da linha 3.x (deformação, estaticidade, estabilidade). Plano reforçado na §10 (04/11), com a física das peças em `docs/fisica-das-pecas.md`.
- **Kit 3 (1.5.0: cabo simples e enrijecedor)**: Kit 3 no estoque; cabo em dois cliques (esfera · CABLE C · CABLE CLIP C · cabo · CABLE CLIP C · CABLE C · esfera, com as ligações e clipes automáticos), pedaço em bolinhas, plano de corte dos rolos no resumo e na capa; enrijecedor clicando na mola B6/B12. **Medidas estimadas pelas fotos** (`kit-mola-pecas.md`): confirmar com o kit em mãos. Próximas montagens de cabo, mapeadas abaixo.
- **Kit 3: outras montagens de cabo (mapa)** — o que o manual permite e como poderia entrar no programa:
  1. **Clip de múltiplos cabos (M CABLE CLIP C)**: **feito na 1.9.0 (K11)**: clicar com o clip numa esfera com 2+ cabos junta todos numa CABLE C (até 5 por clip).
  2. **Anéis (CABLE R pequeno e médio)**: **feito na 1.9.0 (K10)**: nó "anel" no ar, posição definida pelo usuário (altura com ↑/↓), só recebe cabos. Na 3.x: posição de equilíbrio calculada.
  3. **Emenda linear (dois cabos num CABLE CLIP C)**: **feito na 1.9.0 (K12)**: o plano de corte emenda sobras quando o pedaço não cabe.
  4. **Cabo perpendicular ou inclinado a outro cabo (clip no meio)**: pendurais de ponte pênsil, cabos que saem de um cabo principal. **Primeira versão na 1.8.1 (K7–K9)**: a ponta do cabo novo pode ser uma bolinha de outro cabo (ponto de cabo), com referências verde/amarela e o ponto descendo bolinha a bolinha. A conferir com a equipe e com o kit em mãos.
  5. **Laço e furo central do clip**: o clip prende qualquer bolinha, não só a da ponta; dá para fazer laços e não cortar o cabo na medida exata. **Feito na 1.9.0 (K13)**: opção "Sem cortar" no painel do cabo.
  6. **Cruz de cabos (dois clips sobrepostos + pino, não incluso)**: ligação fixa em cruz entre cabos. **Pendente**: o pino não vem no kit; falta decidir com a equipe se entra (e como contar no estoque).
  7. **Cabo frouxo / forma funicular**: cabo mais longo que a distância, com flecha (catenária, formas funiculares com pesos). Fica para 2.x/3.x (forma depende das cargas).
  8. **Enrijecedor**: confirmar se convive com RC90 e CC na mesma mola; na 3.x, a mola enrijecida vira barra rígida no cálculo.
  9. **Régua de bolinhas na prancha**: imprimir em 1:1 a lista de cortes com uma régua de bolinhas, como a do manual, para cortar o cabo direto da folha. **Feito na 1.9.0 (K14)**.
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
13. **Para a análise (3.x)**: os ensaios físicos foram detalhados em `docs/fisica-das-pecas.md` §7 (T0–T11: massas, mola fechada e pré-tensão, força dos ímãs, balanço com peso próprio, rigidez da RC90, flambagem, diagonal, frequência…), com registro em `docs/ensaios-template.csv`. Prioridade: T0, T1, T2 e T3.

## 10. Simulação (linha 3.x) — plano reforçado (04/11/2026)

Base física, com cada número e sua fonte: `docs/fisica-das-pecas.md` (TFG da UPC de 2026, dissertação de Oliveira de 2008 e as nossas contas). Casos que a simulação precisa reproduzir: `docs/casos-de-validacao.md`. Este plano substitui a frase "levar o estudo para a 3.x" das pendências.

**O Simolar simula o kit.** O que ele prevê é o que acontece com o Mola montado: a flecha que se vê, o ímã que solta, a GC que escorrega. Como lembra Oliveira (2008), "o modo de colapso da Maquete Estrutural não corresponde à situação real". Prever a estrutura real em escala (1 M ≈ 1 m, a modulação de origem do kit) é outro problema, que fica para a 2.x/3.x.

### 10.1 O que o Simolar precisa responder

1. **Fica de pé?** Mecanismo ou não, e com quantos graus de liberdade. Já existe (1.7).
2. **É iso, hiper ou hipostática?** Com o grau.
3. **Quanto deforma** com o peso próprio e com cargas em gramas, **em escala real**. O Mola é um modelo de alta deformação: a flecha do programa deve ser a flecha que a equipe vê no kit (±10 %).
4. **Como cada peça trabalha**: tração, compressão ou flexão (cores), e as reações nas GC.
5. **O que solta ou dobra primeiro, e com quantos gramas**: flambagem, ímã que solta, ligação que cede, GC que escorrega, cabo frouxo.
6. **Como balança**: frequências e modos de vibrar, e a resposta a um empurrão.
7. **É deslocável ou indeslocável?** O efeito P-Δ é visível no kit (Oliveira, Estudo 3). O critério é o de "estrutura contraventada": o contraventamento reduz a flexibilidade lateral em ≥ 80 % (ECCS), ou o fator de carga crítica é ≥ 10.

### 10.2 Modelo mecânico: o grafo vira um pórtico espacial

O grafo (nós, membros, ligações) continua sendo a fonte. A simulação monta, a partir dele, um modelo de cálculo:

| No grafo | No cálculo | Parâmetros (`fisica-das-pecas.md` §8) |
|---|---|---|
| Esfera (e GC, e anel) | nó com 3 deslocamentos (rótula) e massa concentrada | `esfera_massa_g` |
| Ponta de mola | "nó de ponta" com 3 rotações próprias, preso à esfera por rótula | — |
| Mola (B4, B6, B12) | viga de Euler-Bernoulli 3D **inextensível** (vínculo de distância, como no `mechanism.ts`; ou EA alto) com **EI = 2.966 N·mm²** no comprimento flexível; terminais rígidos | `mola_EI_Nmm2`, desconto do comprimento flexível, massa |
| RC90 entre molas | **trecho rígido** em cada mola (o pedaço que a RC90 cobre) + mola de rotação entre as duas pontas, **só no eixo normal ao plano dela** (L10) | `rc90_trecho_rigido_mm`, `rc90_rigidez_Nmm_rad` (começa rígida) |
| RC90 na base | idem, entre a ponta e o chão: **engaste no plano dela** (duas perpendiculares = engaste completo). Em 2008, é a ligação que mais se afasta da teoria | idem |
| CC / CC90 | continuidade da flexão entre as **duas pontas alinhadas** (os dois planos); as outras molas do nó continuam rotuladas (a viga fica contínua e a coluna não recebe momento, ensaios 19 e 21 de 2008) | `cc_rigidez_Nmm_rad`, `cc_momento_solta_Nmm` |
| GC | 3 deslocamentos presos, rotação livre; reação conferida contra a força dos ímãs da GC na chapa metálica (arrancar e escorregar) | `gc_chapa_N` |
| Diagonal e cabo do Kit 3 | barra **só de tração** (sai do cálculo quando ficaria comprimida); a rigidez da diagonal é a das **molinhas das pontas** em série com o fio | `diagonal_EA_N`, folga |
| Placa | corpo rígido (6 graus) preso aos 4 cantos | massa |
| Enrijecedor | mola com EI × `enrijecedor_fator_EI` | — |
| Cargas | peso próprio (ligado por padrão) e cargas em **gramas** nas esferas (verticais ou de lado: "dedo virtual") | — |

Consequência didática, que o modelo reproduz de graça: numa estrutura só de esferas, as molas só trabalham no eixo; a flexão aparece com carga ao longo da mola (peso próprio) e nas ligações RC90/CC. É exatamente o que o kit ensina.

### 10.3 Etapas

| Versão | Entrega | Critério de pronto (validação) |
|---|---|---|
| **3.0 Estaticidade** | Do mesmo conjunto de vínculos do `mechanism.ts`: graus de liberdade (mecanismos) e **estados de autotensão** (vínculos − posto) → "hipostática (n) · isostática · hiperestática (grau r)" no bloco Estabilidade do resumo. Esforços normais por equilíbrio nas treliças isostáticas (peso próprio e cargas) | tripé (3 GC + 3 molas até uma esfera) = isostático; + 4ª GC com mola até a mesma esfera = hiperestático 1; pórtico plano de esferas = hipostático 3 (no espaço), com uma diagonal = 2; treliça do manual com esforços iguais aos da conta à mão |
| **3.1 Estática linear** | Matriz de rigidez do pórtico espacial (§10.2); peso próprio; cargas em gramas; deformada em escala real (e ampliada, opcional); N e M com cores e diagramas; reações nas GC; lista de esforços | **V1** balanço B6 em GC + RC90 com 11 g → 8,0 mm (±10 %; TFG); **V2** flexão em 3 pontos, vão 110 mm, 84 g → 7–8 mm (TFG); **V3** balanço com uma esfera na ponta = T3 da equipe; **forma** de todos os ensaios O-P5 a O-P29 (sem os arcos), O-E1 a O-E14 e S1 de Oliveira (`casos-de-validacao.md`) |
| **3.2 Não linear e falhas** | Grandes deslocamentos (corrotacional, passos de carga, Newton, reaproveitando o `newtonProject`); diagonais e cabos só tração (conjunto ativo); **ímã solta** quando a tração na ponta passa da força medida, **GC escorrega**, **RC90 cede**: o programa tira a ligação e recalcula (colapso passo a passo, ou só o aviso, conforme a equipe decidir) | V1 e V2 com cargas maiores (o leve amolecimento do TFG); pórtico de T8; ímã soltando no peso de T2 (±15 %); **S3** de Oliveira: o prédio todo engastado é "deslocável" (P-Δ visível), e com X ou núcleo de placas é "indeslocável" |
| **3.3 Flambagem** | Por barra: Euler com o comprimento efetivo pelo tipo de ponta (rótula, RC90, GC + RC90). Global: autovalor (K + λ·K_G) → "a estrutura flamba com x g", com o modo animado | B12 rotulada ≈ 100 g e B12 em balanço ≈ 25 g (estimativas, `fisica-das-pecas.md` §5.1), ajustadas pelo T5; formas O-P1 a O-P4; **S2**: a treliça plana longa perde a estabilidade lateral só com o peso próprio, e a multiplanar não |
| **3.4 Dinâmica** | Matriz de massa (esferas concentradas, molas e placas distribuídas); **modos e frequências** (animação); resposta a um empurrão no tempo (Newmark), com o amortecimento medido | balanço B6 + esfera ≈ 5–6 Hz e pórtico B6 com GC + RC90 ≈ 4,5 Hz (estimativas), ajustados pelo T7 |
| **3.5 Cabos do Kit 3** | Busca de forma por densidade de forças: redes de cabos, **anel na posição de equilíbrio**, pontes pênseis; formas funiculares com pesos; cabo frouxo de verdade (com barriga) | rede em sela e cobertura suspensa do manual do Kit 3 |
| **3.6 Calibração e confiança** | Aba "Física" nas Configurações (valores da planilha, sobrescrevíveis com proteção, como as medidas); faixa de incerteza (EI ±10 %) mostrada como "≈"; tabela "quanto confiar" por tipo de estrutura; **comparar com a foto**: sobrepor a foto do kit montado à deformada simulada na mesma vista (o método de validação de Oliveira, 2008, automatizado) | ensaios T0–T11 da equipe incorporados; pranchas podem levar uma folha "Simulação" (deformada e esforços) |

A ordem segue o que dá mais retorno com menos dado. A 3.0 não precisa de nenhum número físico. A 3.1 precisa só do EI (já medido) e das massas (T0). A 3.2 precisa da força dos ímãs (T2). A 3.4 precisa do T7.

### 10.4 Interface

- **Simolar** liga o modo de simulação: a estrutura montada fica clara e a deformada aparece por cima, em escala real. O peso próprio já vem ligado.
- **Cargas**: uma ferramenta "peso" (clique numa esfera: 10 g, 20 g… e R gira para o lado) e o **dedo virtual** (arrastar uma esfera mostra quantos gramas de força isso pede), como o empurrão do TFG.
- **Travamento fora do plano**: uma estrutura plana tem graus de liberdade fora do plano. O rodapé sugere o artifício de Oliveira (2008): dois tirantes do topo até a chapa, ou travar o plano só na simulação.
- **Cores**: tração azul, compressão vermelha, espessura proporcional ao esforço; momento como diagrama nas molas com RC90/CC; reações nas GC como setas.
- **Rodapé** (o canal de sempre): diz o porquê e o número. Exemplos: "A B12 do eixo 2 flamba com ≈ 95 g (Euler, rotulada nas duas pontas)"; "O ímã da ponta solta com ≈ 80 g".
- **Resumo**: o bloco Estabilidade ganha estaticidade, a maior flecha, o primeiro modo de falha e a primeira frequência.

### 10.5 Técnica

- Código novo em `src/core/sim/`: `frame.ts` (monta o modelo da §10.2), `solve.ts` (sistema linear), `modes.ts` (autovalores), `nonlinear.ts` (passos de carga). Só lógica, sem React nem Three, com testes em `tests/core/sim/`.
- **Tamanho**: o Mola tem poucas peças (a Estrutura 01 tem dezenas de esferas, ou seja, poucas centenas de incógnitas). Matriz densa com Cholesky resolve em milissegundos até umas 600 incógnitas; acima disso, armazenamento em perfil (skyline) com reordenação (Cuthill-McKee).
- Roda num **Web Worker** para não travar a tela. Os resultados ficam em cache pela identidade do modelo, como os outros caches.
- **Unidades**: o núcleo trabalha em módulos; a simulação converte na entrada para mm, N e g, e de volta na saída.
- **Testes**: casos analíticos (balanço, biapoiada, treliça isostática, pórtico engastado), os casos do TFG (V1, V2) e os ensaios da equipe.
- **Planilha**: aba "Física" em `parametros.xlsx` → bloco `physics` no `catalog.json` → Configurações › Física.
- **Carregamento**: como as pranchas, a simulação carrega sob demanda (`lazy`), para não pesar a abertura.

### 10.6 Riscos e como tratar

| Risco | Tratamento |
|---|---|
| EI não é constante (espiras abrindo sob momento grande) | começar com o EI linear do TFG; o T1 e o T3 com 3 cargas dizem quanto amolece; se precisar, EI em duas faixas |
| Ligações magnéticas são a maior incerteza (o pórtico do TFG flete 6× mais do que o EI explica; em 2008, a RC90 é a peça que mais desvia a deformada) | trecho rígido + molas de rotação e de escorregamento nas ligações, calibrados pelo T4, T8 e T12; até lá, mostrar "≈" e a faixa |
| Conflitos de geometria (mola de Ø 4 ou 6 mm; comprimento flexível de 75 ou 87 mm) | T1 resolve; os dois valores ficam na planilha com status |
| Expectativa de precisão | o próprio kit varia ≈ 10 % (CV do TFG); o programa mostra valores arredondados e "≈" |
| Mudança de comportamento na montagem (1.x) | nenhuma: a simulação só lê o modelo; não muda as regras de encaixe |

## 11. Linha 2.x — Kit X, o kit ajustável (ideias da equipe, 07/11/2026; decisões e esclarecimentos de 08/11/2026)

A 2.x continua a **arquitetônica**: o conceito junta flexibilidade, ajustabilidade e criação de peças específicas, para representar e simular estruturas que fogem das limitações das peças atuais do kit (equipe, 08/11). O **Kit X** é um kit variável: ao escolhê-lo no estoque, o usuário tem **peças sem limite** de quatro famílias ajustáveis e pode guardar as peças que criar num catálogo próprio. As peças do Kit X são **pretas**; as criadas e guardadas no catálogo, **cinza-escuro** (mais escuro que as peças de hoje). O preto identifica o Kit X em toda a interface.

**Kit X = Kit A** (equipe, 08/11): o "Kit A" previsto no estoque desde a 1.4.5 é este mesmo kit. Fica um nome só, **Kit X**.

**Para que serve** (equipe, 08/11): criar peças que **não existem no kit**, de dois jeitos:
- com o que a Mola já vende (as **Barras de Comprimento Regulável**);
- **fabricando**: o siMOLAdor dá as dimensões (e o modelo 3D) das peças que não existem à venda (placa, RC e tirante).

O plano da equipe é montar estruturas, ver quais peças criadas fazem sentido fabricar e montar com elas **um kit do grupo** (um `.kit` com as peças escolhidas).

### 11.0 Chave "Ajustável" (o modo avançado da 2.x)

- Uma **chave deslizante num canto de baixo** liga a **ajustabilidade**: as peças ajustáveis e o Kit X. É como a opção "avançado" de outros programas: quem não precisa, não vê.
- **Desligada**, o programa é exatamente a 1.x: sem Kit X no estoque, sem peças ajustáveis nem criadas na paleta.
- **Ligada**, o Kit X aparece no Estoque. Com o **Kit X escolhido no estoque** (ou no modo **sem limite**), a paleta mostra as **ajustáveis** dentro das categorias de sempre: **barra**, **tirante**, **placa** e **RC**. As peças criadas e guardadas aparecem logo abaixo da ajustável que as gerou.
- **O que define as linhas:** a **2.x** é a versão em que a chave existe e funciona; a **3.x** é a versão em que o botão **Simolar** funciona.

### 11.1 Peças

| Peça | Como se cria | O que a define |
|---|---|---|
| **Barra ajustável** | Como a mola de hoje, mas com o comprimento livre entre duas esferas | Comprimento em módulos (código Bx com 0.01 M). Fora das faixas comerciais (menor que B3 ou maior que B12) é permitida, com o aviso "fabricar" (X4). Existe à venda: **Barras de Comprimento Regulável** da Mola (8 barras, 2 de cada: AB B3-B4, AB B4-B6, AB B6-B9, AB B9-B12; gira-se um lado para mudar o comprimento; R$ 139 em 07/11/2026; um comprador avisa que perto do máximo ela fica menos firme) |
| **Placa ajustável** | Clicar num plano definido por **três ou mais esferas**, sem obstruções: o programa gera a placa poligonal com esses lados | Polígono **sempre plano**, sem limite de lados (X7) |
| **RC ajustável** | Clicar em **duas barras** (ou numa barra e numa GC): o programa gera uma ligação como a RC, mas com o **ângulo das duas peças** em vez de 90° | Ângulo em graus (0.1°). **Não existe física ajustável** (X6): a equipe vai imprimir as de ângulos notáveis |
| **Tirante ajustável** (08/11) | Como a diagonal de hoje, entre duas esferas a qualquer distância | Comprimento (só tração, como a diagonal). **Não existe à venda**: o programa dá as dimensões para fabricar (cabo e terminais, a partir da diagonal do kit) |

**Quem já existe à venda e quem se fabrica:** só a **barra** tem peça comercial (as reguláveis). **Placa, RC e tirante** são fabricados: para eles o siMOLAdor dá as **dimensões** (desenho técnico na folha de detalhamento) e o **modelo 3D** para imprimir ou mandar fazer.

### 11.2 Funções próprias (no resumo e no painel da peça)

1. **Exportar** a peça num formato de modelo 3D (para modelar em outro programa ou imprimir em 3D): STL e 3MF para impressão, OBJ ou glTF para modelagem.
2. **Salvar no catálogo**: a peça vira uma peça do catálogo e aparece entre as do Kit X, logo abaixo da peça que a gerou.
   - Placa: **Px** (x = número de lados); outra com o mesmo número de lados vira **Pxn**.
   - RC: **RCa** (a = ângulo em graus, ex.: RC45.2).
   - Barra: **Bx** (x = comprimento em módulos, ex.: B2.34).
   - Tirante: a definir (X8; proposta **Tx**, comprimento em módulos entre centros, ex.: T5.83).
3. **Pranchas e detalhamento** (resumo e pranchas):
   - placas e RCs: um desenho técnico de cada peça, com as dimensões principais;
   - barras ajustáveis: os comprimentos obtidos e, como há um kit comercial, **quantos kits comerciais** são precisos e **qual barra comercial** ajustar para cada comprimento (cada uma tem uma faixa).

### 11.3 Aba Peças e aparência

- As peças do Kit X e as criadas por ele aparecem **nas categorias de sempre** (barras, placas, ligações), não numa seção à parte.
- Para **excluir** uma peça criada e guardada: passar o mouse sobre ela no menu de peças mostra um **×** no lugar do número de disponíveis; antes de apagar, uma confirmação.

### 11.4 Arquivo `.kit`

- O catálogo criado pode ser **salvo num arquivo `.kit`**. Abrir um `.kit` traz as peças dele.
- Abrir vários `.kit` **acumula**. Na aba Estoque, cada um aparece como um kit criado a partir do Kit X:
  ```
  Kit 1   − 1 +
  Kit 2   − 1 +
  Kit 3   − 1 +
  Kit X
      nomedoarquivo.kit
      nomedooutrokit.kit
  ```
  (os `.kit` abaixo do Kit X, menores e recuados).
- Na barra de cima, antes dos botões do `.mola`, um grupo **`.kit`** com Abrir e Salvar.

### 11.5 O que preparar ainda na 1.x (recomendação de 07/11/2026)

O Kit X mexe em três coisas que hoje são fixas no programa: a **geometria** (tudo em módulos inteiros e planos ortogonais, com inclinadas em passos), o **catálogo** (vem só da `parametros.xlsx`) e a **placa** (sempre 4 cantos). Preparar isso antes evita que a 2.0 tenha de refazer a base.

| Preparação | Por quê | Onde |
|---|---|---|
| **Fase 4 (geometria livre) antes da 2.0**: esferas em qualquer posição, molas fora dos planos ortogonais, planos inclinados quaisquer | A barra ajustável e a RC de qualquer ângulo produzem posições fora da grade; sem isso, encaixe, rigidez e pranchas não acompanham | `snapping.ts`, `rules.ts`, `mechanism.ts`, `views.ts` |
| ✅ 1.10.2 · **Catálogo em camadas**: peças da planilha + peças do usuário (registro em tempo de execução), código de peça livre | Base do "salvar no catálogo" e do `.kit` | `catalog.ts` (o `catalog` do programa é uma cópia; `baseCatalog` fica intocado), `userPieces.ts` (nomes X2/X3, "fabricar" X4, bloqueio X5, paleta abaixo da peça-mãe) |
| ✅ 1.10.2 · **O `.mola` leva a definição das peças próprias que usa** | Um `.mola` enviado sem o `.kit` precisa abrir igual em outro computador | `serialization.ts` (campo `pieces`, regra A9); o formato do `.kit` (`toKitFile`/`fromKitFile`) está pronto, falta a tela |
| ✅ 1.10.2 (parte) · **Placa com N cantos** no modelo, no desenho e nas pranchas | A placa ajustável é um polígono | Modelo, rigidez, cena 3D, pranchas e colisões aceitam N cantos (retângulos seguem pelo caminho antigo; o resto por `geom.ts`). Falta: encaixe e criação da placa na tela, e colisão de placa **côncava** (hoje as contas de polígono supõem convexa; X7 em aberto) |
| ✅ 1.10.2 · **Estoque sem limite por kit** e cor por peça | O Kit X é infinito ao lado de kits contados | `inventory.ts` (`kitAmount`, `minKits`), `PieceDef.color` na mola e na placa. Falta: a RC de qualquer ângulo no desenho 3D (`RigidConnector` só faz 90°) e a aba Estoque com os `.kit` abertos |
| **Exportar a estrutura em 3D** (STL/glTF) já na 1.x | Útil hoje (impressão, apresentações) e é a mesma função da peça do Kit X | `render/`, via three.js |
| **Folha de detalhamento de peças** nas pranchas | Serve já para a CC/CC90 e o Kit 3, e é onde entram os desenhos das peças do Kit X | `drawings/` |
| **Medir as Barras de Comprimento Regulável** (mín./máx. em mm de cada uma, folga, rigidez perto do máximo) | Sem as faixas reais, a conta de "quantos kits comerciais" não fecha | protocolo da §9, `kit-mola-pecas.md` |
| **Kit A vira Kit X** no Estoque (uma linha só) e o tirante entre os tipos de peça criada (`cable` em `userPieces.ts`) | Esclarecimento de 08/11: são o mesmo kit; o tirante é a 4ª ajustável | próxima entrega da 1.10 (`Toolbar.tsx`, `userPieces.ts`) |
| **A chave "Ajustável"** (§11.0) | O modo avançado da 2.x; na 1.x pode aparecer desativada, como o Simolar "em breve" | `Dock.tsx` (canto de baixo), `prefs.ts`, `Palette.tsx` |

### 11.6 Decisões da equipe (08/11/2026)

| # | Pergunta | Decisão |
|---|---|---|
| X1 | Nome da linha 2.x | Continua **arquitetônica**. O nome passa a significar o conjunto: flexibilidade, ajustabilidade e criação de peças específicas para estruturas que fogem das limitações do kit atual. O Kit X é o instrumento dessa linha. |
| X2 | Códigos das peças criadas | **Ponto** como separador decimal: B2.34, RC45.2. Precisão: **0.01 M** no comprimento e **0.1°** no ângulo. |
| X3 | Placas com o mesmo número de lados | **P4-2**, P4-3… (a primeira é P4). |
| X4 | Barra fora das faixas comerciais (menor que B3 ou maior que B12) | **Permitida**, mas com indicação clara de que **não sai das Barras de Comprimento Regulável** atuais: precisa ser **fabricada**. Vale no painel da peça, no resumo, na lista de peças e nas pranchas. |
| X5 | Excluir peça guardada que ainda está na montagem | **Bloqueia**. O aviso diz que ela ainda está na montagem e o modelo mostra **uma bolinha preta em cada lugar** onde ela está. |
| X6 | A RC ajustável existe? | **Não existe ajustável.** O plano da equipe: imprimir em 3D RCs de **ângulos notáveis** descobertos no siMOLAdor e, em paralelo, projetar uma RC ajustável. As medidas de partida (furo, ímã, espessura) saem da RC90. |
| X7 | Limites da placa ajustável | **Sempre plana** (todos os cantos no mesmo plano); **sem limite de lados**. |

| X8 | Tirante ajustável (08/11) | É a 4ª família ajustável, ao lado de barra, placa e RC. Não existe à venda: o programa dá as dimensões para fabricar. Código **a definir** (proposta: Tx, ex.: T5.83). |
| X9 | Kit A e Kit X (08/11) | São **o mesmo kit**. Fica só o nome Kit X. |
| X10 | Chave "Ajustável" (08/11) | Chave deslizante num canto de baixo liga a ajustabilidade (ajustáveis + Kit X), como um modo avançado. A 2.x é a versão em que ela funciona; a 3.x, a versão em que o Simolar funciona. |

**Ainda em aberto:**
- **Placa côncava ou com furo:** a resposta foi "sempre plana, sem limite de lados". Proposta para a implementação: aceitar côncava desde que os lados não se cruzem; furo fica para depois. Confirmar com a equipe.
- **Código do tirante** (X8): Tx (proposta) ou outro.
- **Chave "Ajustável" e arquivos:** proposta: abrir um `.mola` que usa peças criadas **liga a chave sozinho**, com aviso no rodapé; a chave fica lembrada no navegador (preferência pessoal, como a aparência), não no arquivo. Com a chave desligada, as peças criadas que já estão na montagem continuam lá (só some a criação de novas).
- **A chave na 1.x:** mostrar já desativada ("2.x"), como o Simolar "em breve", ou só aparecer na 2.0?
- **A RC ajustável do projeto paralelo:** quando existir, entra como peça física (com faixa de ângulos, como a barra comercial).
