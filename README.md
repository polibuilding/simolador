# siMOLAdor

Simulador de montagem 3D de estruturas com o [Kit Mola](https://molamodel.com) (Mola Structural Model), feito pela equipe **Poli Mola** da **Poli Building** (Poli-USP) para o Desafio Poli-USP. Você monta a estrutura no navegador, com as peças, as regras físicas e o estoque reais dos kits, e o programa gera as **pranchas** (capa, plantas, vistas e cortes) prontas para entregar.

**Abrir o programa:** https://polibuilding.github.io/simolador/ · funciona no navegador, sem instalar nada.

**Versão atual:** **1.8.2** (linha 1.x, "geométrica"). O que mudou em cada versão está no [CHANGELOG.md](CHANGELOG.md).

## O que dá para fazer

### Montar
- **Peças dos Kits 1, 2 e 3**: ligação de base (GC), esferas, barras B4, B6 e B12, diagonais D4x6, D6x6 e D6x12, placas P6x6 e P6x12 (laje ou parede), ligações RC90, CC e CC90, cabo de bolinhas e enrijecedor. O Kit A já está previsto no estoque.
- **Encaixe guiado**: pontos verdes mostram onde a peça entra. Os pontos azuis ficam a um vão de barra. Os amarelos e laranja fecham triângulos e pirâmides com um clique.
- **Ligar duas esferas**: com uma mola na mão, clique numa esfera e depois em outra. Se a distância não bate, a segunda esfera anda até a mola caber.
- **Barras em qualquer direção**: nos eixos, em passos de 15° ou livres (treliças 3D, telhados).
- **Cabos (Kit 3)**: o cabo entra em dois cliques, contado em bolinhas, com plano de corte dos rolos. Também dá para prender cabo em cabo (pendurais).
- **Regras reais do kit**: comprimentos, ângulo mínimo de 40° entre molas, mola na GC a pelo menos 40° da chapa, folgas, cruzamentos, ligações nos cantos certos e estoque. Quando algo é bloqueado, o rodapé diz por quê.
- **Várias chapas**: chapas lado a lado, giradas ou afastadas, com estruturas ligadas entre elas.
- **GC perto da estrutura**: círculos na chapa mostram onde uma mola chega até a nova GC.

### Mexer e estudar a rigidez
- **Arrastar** uma peça move a estrutura inteira.
- **Duplo clique**: a peça anda e a estrutura acompanha só o que as ligações deixam.
  - Esfera é rótula; RC90 trava o ângulo no plano dela; CC trava o alinhamento; placa é rígida; diagonais e cabos só trabalham à tração.
  - O caminho fica azul onde pode e vermelho onde não pode.
  - **Espaço** passa para a próxima etapa: só a peça → vizinhas → pavimento → estrutura toda.
  - **Tab** pula para os limites e as posições na horizontal/vertical.
- **Estabilidade** no resumo: quantos graus de liberdade a estrutura tem (0 = rígida).
- **Editar**: copiar e colar, espelhar, repetir, girar, seleção por retângulo, desfazer e refazer.

### Pranchas
- Capa com isométrica e lista de peças, plantas por pavimento, vistas A–D, quatro isométricas e **cortes** marcados na planta.
- Folha A4, A3, A2 ou personalizada. A escala é automática, usual ou personalizada, e o carimbo é editável na própria folha.
- Cotas, eixos, níveis e indicações de peças ligam e desligam. Os desenhos podem ser simples ou renderizados.
- Desenhos, títulos e etiquetas se arrastam na folha. Dá para inserir desenhos à mão e desfazer e refazer.
- Saídas em **PDF**, **DXF** (camadas MOLA-*) e SVG.

### Arquivos e configurações
- Projetos em arquivos `.mola`, com salvamento automático no navegador.
- Estoque configurável por kit. No modo sem limite, o programa diz quantos kits a estrutura pede, no mínimo.
- **Configurações** (engrenagem): módulo, ângulos mínimos, passo das inclinadas, tamanho da chapa, e medidas e pesos das peças. São protegidas contra valores que quebram o programa; `?padrao` no endereço abre sem elas.
- **Exemplos** (Biblioteca): pórtico simples, torre triangular e a Estrutura 01 do Desafio 2022.

## Primeiros passos

1. Escolha a **ligação de base (GC)** na paleta e clique na chapa.
2. Escolha uma barra (por exemplo, **B6**) e passe o cursor sobre a esfera da GC: a barra sobe. Clique para encaixar. Puxe o cursor para o lado para fazer vigas.
3. Continue pelos pontos verdes, ou ligue duas esferas clicando nelas.
4. Abra **Pranchas** (no alto, à direita) e exporte o PDF.

**Mouse:**
- Botão esquerdo seleciona; arrastando, faz um retângulo de seleção.
- Botão direito gira a vista; Shift + direito ou o botão do meio move a vista; a roda dá zoom.
- O cubo no canto leva às vistas e às isométricas.

**Atalhos principais** (lista completa no botão de teclado, ou com **?**):

| Tecla | O que faz |
|---|---|
| R | Gira a peça ou alterna as opções do ponto |
| Esc | Para de colocar peças, cancela o movimento ou limpa a seleção |
| Enter | Vale como clique |
| Espaço | Repete a última peça; mexendo uma peça, passa para a próxima etapa |
| Tab | Passa pelos pontos e referências |
| Q / E | Troca pela peça vizinha do grupo (B4 ⇄ B6 ⇄ B12) |
| 1 / 2 / 3 | Ligam e desligam a grade, os pontos azuis e os triângulos |
| 4 / 5 / 6 | Barras nos eixos, em passos ou livres |
| W A S D | Giram a vista |
| F | Enquadra a estrutura |
| P | Vista paralela |
| C | Abre e fecha o resumo |
| M | Move a peça ou a seleção |
| N | Move só o nó |
| Delete | Apaga |
| Ctrl+Z / Ctrl+Y | Desfazem e refazem |
| Ctrl+C / Ctrl+V | Copiam e colam |
| Ctrl+S / Ctrl+O | Salvam e abrem |

## Medidas e quantidades das peças

Tudo sai de **`data/parametros.xlsx`**. Para mudar uma medida ou uma quantidade:

1. Edite a planilha (células amarelas). A aba Leia-me explica as regras.
2. Envie a planilha nova para o repositório (no GitHub: abra a pasta `data`, depois *Add file → Upload files*).
3. A publicação regera `data/catalog.json` e `data/kits.json` sozinha e atualiza o site em alguns minutos.

Nunca edite os `.json` à mão.

## Próximos passos

**Confirmar com o kit em mãos:**
- as medidas do Kit 3;
- o formato das peças CC e CC90 (hoje provisório);
- se a GC funciona como rótula;
- como a RC90 trava na base;
- como a CC90 trava.

**Cabos:** clip múltiplo, anéis, emenda, laço sem cortar, cruz de cabos e régua de bolinhas 1:1 na prancha.

**Outras frentes:**
- **Configurações:** o menu maior, com Tutorial, Aparência, Idioma e Perfil.
- **Biblioteca online:** modelos enviados pelos usuários.
- **Geometria livre:** geodésicas e barras fora dos planos X, Y e Z.
- **App local:** o programa instalado no computador.

**Depois da linha 1.x:**
- **2.x (arquitetônica):** o módulo extra ajustável.
- **3.x (de engenharia):** deformação, estaticidade e estabilidade, a partir do modelo de rigidez que já existe (botão **Simolar**).

O plano completo está em [docs/plano-simolador.md](docs/plano-simolador.md), e as regras de montagem em [docs/regras-de-encaixe.md](docs/regras-de-encaixe.md).

## Para quem programa

```bash
npm install
npm run dados     # planilha → JSON
npm run dev       # http://localhost:5173/simolador/
npm test          # testes do núcleo (Vitest)
npm run build     # checa os tipos e gera o site em dist/
```

- **Tecnologia:** TypeScript, React, Three.js (React Three Fiber), Zustand, Vite e Vitest.
- **Pastas:**
  - `src/core`: lógica pura e testada (modelo, regras, encaixe, rigidez, estoque, arquivo `.mola`);
  - `src/render`: cena 3D;
  - `src/interaction`: posicionamento com o mouse;
  - `src/ui`: interface;
  - `src/drawings`: pranchas e exportação;
  - `tests/`;
  - `scripts/gerar-dados.mjs`.
- **Publicação:** GitHub Actions e GitHub Pages ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)). Cada envio para a `main` roda os testes e, se passarem, publica.
- **Versões:** número **X.Y.Z** (linha · fase · entrega). Veja "Como numerar" no [CHANGELOG.md](CHANGELOG.md).
- **Programando com o Claude Code:** o [CLAUDE.md](CLAUDE.md) resume o projeto, as convenções e o roteiro para lançar uma versão.
