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
- **Layout** (interface leve, 1.12: traços finos, cantos suaves, pouco peso):
  - no topo, à esquerda: logos pequenas, siMOLAdor, Arquivo, Configurações (engrenagem), desfazer/refazer; no centro, o nome do projeto; à direita, o estoque, Pranchas e Simolar;
  - à esquerda, a paleta de peças (código com as bolinhas dos kits ao lado; quantidade só com estoque limitado), por cima da cena, até o fim da tela; a seta « a recolhe num menu pequeno só com os símbolos (uma coluna, ou duas se faltar altura) e a seta » a devolve; a cena não muda de tamanho: a imagem desliza junto com a paleta (1.14/1.15);
  - marca: logos do Kit Mola (leva a br.molamodel.com) e da Poli Building (leva ao Instagram), e o nome siMOLAdor; o símbolo do programa (hexágono do Mola com os triângulos alternando azul e amarelo) aparece só na aba do navegador, por enquanto;
  - Arquivo: ".mola" em cinza claro e os ícones Novo, Abrir e Salvar;
  - no centro, a cena 3D com o cubo de vistas (segue a projeção: paralela ou perspectiva), a dica da ferramenta em texto pequeno e a barra de baixo (Encaixe, Barras, Vista);
  - à direita, o resumo / a peça selecionada, por cima da cena: » no canto de cima recolhe; recolhido, fica só a « transparente no canto de cima da cena (abre pelas setas, ou pelo duplo clique numa peça até o Esc; selecionar com um clique não o abre: o nome dela aparece bem de leve no canto de baixo, à direita, antes da versão);
  - a versão, bem de leve, no canto inferior direito.
- **Modo Prancha** em aba própria: folhas A2, A3, A4 ou personalizada, com capa, plantas, vistas e cortes, carimbo editável na própria folha, em preto e branco de desenho técnico. Desde 1.24, a tela segue a mesma linguagem leve da montagem: barra de cima com Escala, Folha, Capa, Mostrar (cotas, eixos, peças, vistas) e Inserir (planta, A–D, cortes, Corte); painel lateral do desenho escolhido; dicas no rodapé.
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

**Carimbo** (rodapé em toda a largura; desde 1.24, regras F1–F4 em `regras-de-encaixe.md`):
- logos (Mola e equipe, `public/logos/`), campo fixo;
- título (maior, em negrito) e subtítulo, iguais em todas as folhas e editáveis clicando neles na prancha (antes "linha 1" e "linha 2", P06);
- desenhos da folha em nomes curtos ("PB 1º PAVIMENTO", "VISTA-A", "CORTE 1"), agrupados para caber;
- kits usados;
- "ESCALA: 1/X" (ou "INDICADA" com mais de uma escala na folha; "SEM ESCALA" na capa) e "MEDIDAS EM MILÍMETRO (mm)";
- número da folha "0n/0N", em destaque, e o formato no nome do quadro.

A **escala gráfica** saiu do carimbo: fica na direita da folha, vertical e sem moldura, uma por escala da folha.

**Arranjo** (desde 1.24, F7–F10): nasce automático (como acima) e pode ser mexido: inserir plantas, vistas e cortes clicando na folha, tirar desenhos (ex.: pavimentos repetidos de uma torre), mudar de prancha, dar escala própria. O arranjo mexido fica no `.mola` por tamanho de folha (`SheetMeta.layouts`), junto com os cortes (`cuts`) e os ajustes de cada desenho (`views`: título, subtítulo, o que mostrar). Código: `src/drawings/sheets.ts` (desenhos e carimbo), `layout.ts` (mudanças no arranjo), `src/ui/SheetsView.tsx` e `SheetTools.tsx` (tela).

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
| 3e. Pranchas editáveis (1.24) | carimbo novo editável na folha; A2 e folha personalizada; Mostrar global e por desenho; inserir, tirar e mudar desenhos de prancha; cortes marcados na planta | torre sem os pavimentos repetidos e com um corte, em PDF |
| 4. Geometria livre | geodésicas e barras fora dos planos ortogonais (E19); mover várias peças juntas | geodésica do manual do Kit 2 |
| 5. App local + Kits 3/4 | empacotar com Tauri (Q01); cabos, arcos | — |

Análise estrutural: fora do escopo (Q09).

## 7b. Versões do programa

O número aparece no rodapé, depois das logos; o histórico fica em `CHANGELOG.md` e cada versão tem uma etiqueta no Git (`v1.0`, `v1.1`…).

- **1.x — geométrica** (atual: 1.24): montar com as peças e regras reais do kit e gerar as pranchas.
- **2.x — arquitetônica**: o módulo extra ajustável.
- **3.x — de engenharia**: deformação, estaticidade e estabilidade.

O número depois do ponto sobe com uma mudança grande ou com um conjunto de mudanças menores.

## 8. Pendências

Decisões registradas (A-CONFIRMAR, aba Decisões): navegador agora, app local depois (Q01); Kits 1 e 2 (Q02); estoque configurável (Q03); português (Q04); arquivo `.mola` em JSON (Q05); código no GitHub (Q06), publicado no GitHub Pages (Q07); só montar e desenhar (Q09).

Em aberto:
- ~~CC90~~: resolvido. Kit 2 tem 12 RC90 (forma 3), 12 CC (forma 1) e 12 CC90 (forma 2, sobreposta à CC). Total de 145 confirmado.
- **Medidas da CC e da CC90**: necessárias para desenhá-las (o programa usa um formato provisório até lá). **Lembrete pedido pela equipe (13/10): ajeitar as peças CC e CC90.**
- **Configurações** (engrenagem; 1.20): o menu muda módulo, ângulo mínimo entre molas, ângulo mínimo da mola na GC, passo das inclinadas (o rótulo da barra de baixo acompanha) e o tamanho da chapa; "Configurações avançadas" abre a janela com abas (Peças: medidas e pesos; Medidas gerais; Cabo e enrijecedor; Geral; e, em breve, Tutorial, Aparência, Idioma e Perfil). **Próximo passo**: pensar o menu maior; quando estiver pronto, a engrenagem abre direto nele. Os pesos ainda não entram em nenhuma conta (3.x).
  - **Proteção**: limites em cada valor; checagens cruzadas (molas com comprimento positivo, esfera menor que o menor vão, bolinha menor que o passo, GC menor que a chapa) bloqueiam o Aplicar; antes de aplicar, a tela mostra o que muda na estrutura aberta (GC fora da chapa, chapas sobrepostas, ângulos abaixo do novo mínimo); aplicar recarrega o programa com a estrutura salva; se a abertura travar, a seguinte volta ao padrão sozinha (as configurações recusadas ficam guardadas à parte); valores ilegíveis são ignorados com aviso; tela de erro com "Voltar às configurações padrão"; `?padrao` no endereço abre sem as configurações.
- **Rigidez e movimentos livres** (1.22, `src/core/mechanism.ts`): esferas = rótulas; RC90 trava ângulo; RC90 na base engasta; CC/CC90 travam 180°; placas = corpos rígidos; diagonais e cabos só tração; GC fixas. Graus de liberdade pelo posto da matriz de rigidez, com teste finito (descarta as "dobras" que só existem no infinitesimal, como a torção de um pórtico plano com RC90). Duplo clique: 0 = travado, 1 = caminho azul/vermelho (traçado numericamente), 2+ = arraste livre mexendo o mínimo. Resumo: bloco Estabilidade com os graus de liberdade; painel da peça: "Movimento".
  - Confirmado pela equipe (14/10): a RC90 trava só o ângulo, não a torção (a mola gira em torno do próprio eixo). **16/10 (1.24, L10)**: a RC90 trava só a inclinação no plano em que foi posicionada; no perpendicular a mola gira. No modelo cinemático já era assim (distância entre as pontas); o "mover só o nó" deixou de travar o nó e passou a usar o mesmo vínculo. **A confirmar**: a RC90 na base (hoje engasta sozinha) segue a mesma regra, e só duas em lados perpendiculares engastam? A conferir: a CC90 trava também o ângulo entre os dois pares; a GC é rótula (sem RC90 na base, o pilar tomba em qualquer direção, até o limite de 40° com a chapa) — **a equipe vai conferir a GC**.
  - **Conjuntos** (1.23, `moveScopes` em `globalMove.ts`): o que fica fora do conjunto é tratado como preso. Candidatos: anéis de vizinhas a partir da peça (até o primeiro que mexe, e mais um), pavimentos (tudo de uma altura para cima) e a estrutura toda; partes que ficariam soltas vão junto. Ficam os que mexem a peça e mexem um grupo novo (comparação pelo suporte do núcleo da matriz de rigidez; conta linear primeiro, teste finito nos conjuntos de até 24 esferas). Na 1.23, Tab ampliava.
  - **Edição por etapas** (1.24, E2f): Espaço passa para a próxima etapa (Shift+Espaço volta), guardando a posição; cada etapa aceita vira um bloco rígido (as esferas que mexeram e as vizinhas, mais um anel se as vizinhas ficam numa reta; `shapeGroup` em `globalMove.ts`, `freezeShapes` em `mechanism.ts`) nas etapas seguintes. **Tab** (E2g) percorre as referências do caminho, incluindo as circunferências da esfera de uma mola (`sphereRings` em `edit.ts`).
  - **GC perto da estrutura** (1.23, `reach.ts`): círculos na chapa onde uma mola nova (até uma esfera baixa) ou pendurada (desce girando) chega até a GC respeitando G12.
  - Próximos: escolher qual grau de liberdade seguir no modo livre (Tab entre "modos" do mecanismo); mostrar as rótulas que giram; diagonal/cabo frouxo desenhado com flecha; levar o estudo para a 3.x (rigidez das molas, enrijecedor, cargas).
- **Pranchas editáveis** (1.24, F1–F12): carimbo novo, folhas A2/A3/A4/personalizada, Mostrar global e por desenho, inserir desenhos e cortes. **A conferir com a equipe**: tamanho do quadro das logos (hoje 36 mm na A3, como antes); o arranjo mexido não acompanha pavimentos novos (hoje: botão "Arranjo automático"). **Próximos**: isométrica e textos livres inseríveis; corte com profundidade limitada (hoje vai até o fim da estrutura); seção de placas e diagonais cortadas; o desenho que passa da folha avisa; desfazer (Ctrl+Z) nas mudanças das pranchas.
- **Biblioteca** (ao lado da engrenagem; 1.20): por enquanto "em breve" e os exemplos que vêm com o programa (abrem com um clique). Depois: biblioteca online de modelos enviados pelos usuários (precisa de um servidor e de contas: definir onde hospedar).
- **Simolar** (botão ao lado de Pranchas): por enquanto "em breve"; é a porta da linha 3.x (deformação, estaticidade, estabilidade).
- **Kit 3 (1.18: cabo simples e enrijecedor)**: Kit 3 no estoque; cabo em dois cliques (esfera · CABLE C · CABLE CLIP C · cabo · CABLE CLIP C · CABLE C · esfera, com as ligações e clipes automáticos), pedaço em bolinhas, plano de corte dos rolos no resumo e na capa; enrijecedor clicando na mola B6/B12. **Medidas estimadas pelas fotos** (`kit-mola-pecas.md`): confirmar com o kit em mãos. Próximas montagens de cabo, mapeadas abaixo.
- **Kit 3: outras montagens de cabo (mapa)** — o que o manual permite e como poderia entrar no programa:
  1. **Clip de múltiplos cabos (M CABLE CLIP C)**: até 5 cabos numa só CABLE C (leque saindo de uma esfera). No programa: ao ligar um cabo numa esfera que já tem cabo saindo quase na mesma direção, oferecer juntar no mesmo clip múltiplo (economiza CABLE C; conta MCLIP-C).
  2. **Anéis (CABLE R pequeno e médio)**: vários cabos chegando radialmente num ponto no ar (redes de cabos, cobertura suspensa, tensegridade). No programa: um novo tipo de nó, "anel", que não é esfera e só recebe cabos; posição de equilíbrio calculada (3.x) ou definida pelo usuário (1.x).
  3. **Emenda linear (dois cabos num CABLE CLIP C)**: cabos maiores que um pedaço, ou reaproveitar sobras. No programa: o plano de corte pode propor emendas quando um cabo não cabe no que sobrou de um rolo.
  4. **Cabo perpendicular ou inclinado a outro cabo (clip no meio)**: pendurais de ponte pênsil, cabos que saem de um cabo principal. No programa: clicar num cabo (não numa esfera) cria um ponto de ligação no meio dele.
  5. **Laço e furo central do clip**: o clip prende qualquer bolinha, não só a da ponta; dá para fazer laços e não cortar o cabo na medida exata. No programa: opção "sem cortar" (o resto do cabo sobra para fora) no plano de corte.
  6. **Cruz de cabos (dois clips sobrepostos + pino, não incluso)**: ligação fixa em cruz entre cabos.
  7. **Cabo frouxo / forma funicular**: cabo mais longo que a distância, com flecha (catenária, formas funiculares com pesos). Fica para 2.x/3.x (forma depende das cargas).
  8. **Enrijecedor**: confirmar se convive com RC90 e CC na mesma mola; na 3.x, a mola enrijecida vira barra rígida no cálculo.
  9. **Régua de bolinhas na prancha**: imprimir em 1:1 a lista de cortes com uma régua de bolinhas, como a do manual, para cortar o cabo direto da folha.
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
