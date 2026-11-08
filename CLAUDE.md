# siMOLAdor — contexto para o Claude Code

Leia este arquivo inteiro antes de mexer no código. Ele resume o projeto, como o código está organizado, as convenções da equipe, o que está pendente e para onde o programa vai.

## O que é

O **siMOLAdor** é um simulador de montagem 3D de estruturas com o **Kit Mola** (Mola Structural Model). Ele é feito pela equipe **Poli Mola**, da **Poli Building** (Poli-USP), para o **Desafio Poli-USP**.

O usuário monta a estrutura no navegador, com as peças, as regras físicas e o estoque reais dos kits. Depois o programa gera as **pranchas** no padrão do Desafio: capa com isométrica e lista de peças, plantas por pavimento e vistas A–D. As pranchas saem em PDF, DXF e SVG.

- **No ar:** https://polibuilding.github.io/simolador/
- **Repositório:** `polibuilding/simolador`, branch `main`. A publicação é por GitHub Actions no GitHub Pages (`.github/workflows/pages.yml`).
- **Versão atual:** 1.10.5. A linha 1.x se chama "geométrica". O histórico está em `CHANGELOG.md`.
- **Usuários:** estudantes de engenharia e arquitetura, que montam e documentam estruturas para a competição.

## Como trabalhar com a equipe

- **Idioma:** responda sempre em **português**. Todo texto da interface, comentários, nomes de documentos e mensagens de commit também são em português, em linguagem simples, sem jargão de programação para o usuário final.
- **Retorno ao usuário:** o rodapé (`hint`) é o canal principal. Todo bloqueio diz **por quê**, citando a regra. Prefira poucas instruções na tela e deixe o resto implícito, porque a equipe pediu menos texto.
- **Tom das entregas:** ao terminar, explique o que mudou de forma curta, com capturas de tela quando for visual. Diga o que não deu para fazer. Termine lembrando as pendências fixas (ver "Lembretes fixos").
- **Decisões de comportamento** vêm da equipe e ficam registradas em `docs/regras-de-encaixe.md`, cada regra com um código (N, B, L, G, K, C, E…). Mudou um comportamento? Atualize a regra.

## Comandos

```bash
npm install
npm run dados     # data/parametros.xlsx → data/catalog.json e data/kits.json (nunca edite os .json à mão)
npm run dev       # http://localhost:5173/simolador/
npm test          # Vitest (núcleo); hoje 199 testes, todos passando
npm run typecheck
npm run build     # tsc + vite build
npx vite preview --port 4173 --strictPort   # testar o build em http://localhost:4173/simolador/
```

**Testes de interface:** usamos scripts Playwright avulsos (Chromium headless com `--use-gl=angle --use-angle=swiftshader`) contra o `vite preview`. Existe um gancho de teste em `window.__simolador`:
- `store`: a store zustand;
- `project(p)`: projeta um ponto do modelo na tela;
- `projectPlate(x, z)`;
- `catalog`.

Com isso dá para carregar um modelo com `store.getState().load({...})`, clicar nas posições projetadas e conferir o `history`. Sempre teste no navegador as mudanças de interação, não só com testes unitários.

## Tecnologia e organização

TypeScript, React 18, Three.js via React Three Fiber + drei, Zustand, Vite, Vitest. As versões estão fixadas no `package.json`.

| Pasta | O que tem |
|---|---|
| `src/core/` | Lógica pura e testável, sem React nem Three |
| `src/render/` | Cena 3D (`Scene.tsx`) e desenho das peças (`pieces/`) |
| `src/interaction/` | Posicionamento com o mouse. `Placement.tsx`: eventos (mouse, Enter), o despacho por ferramenta, guardas e limpeza. `ctx.ts`: câmera, tela e o estado de **um comando** (`Cmd`). `queries.ts`: consultas com cache (candidatas, guias, caminhos, referências do Tab). `steps/`: cada ferramenta (`support` GC, `bars` barras livres, triângulos e ligação, `rope` cabo e enrijecedor, `move` caminho, arraste livre, mover e colar, `place` peças comuns, `box` retângulo). É a parte mais delicada. |
| `src/ui/` | Interface: `store.ts` (estado), `PropertiesPanel.tsx` (resumo e painel da peça), `Palette.tsx`, `Dock.tsx` (barra de baixo), `Toolbar.tsx`, `Config.tsx` (janela da engrenagem, com as abas pessoais), `prefs.ts` (aparência, perfil e tutorial no localStorage), `files.ts` (Salvar no mesmo arquivo, Salvar como, Recentes, cópias automáticas; `idb.ts` guarda no IndexedDB), `pwa.ts` (service worker, aviso de versão nova, Instalar), `errorlog.ts` (relatório de erro), `AppNotices.tsx`, `Shortcuts.tsx`, `SheetsView.tsx`, `AdjustSwitch.tsx` (chave Ajustável da 2.x; na 1.x desativada, "em breve"), `i18n.ts` + `i18n-dict.ts` + `i18n-textos.tsv` (idiomas) |
| `src/drawings/` | Pranchas: vistas, folhas e exportação PDF/DXF/SVG |
| `src/App.tsx` | Atalhos de teclado (`useShortcuts`) |
| `tests/core/` | Testes do núcleo |
| `data/parametros.xlsx` | Fonte de **todas** as medidas e quantidades |
| `examples/` | Pórtico simples e Estrutura 01 do Desafio 2022 |
| `docs/` | `plano-simolador.md` (§10: plano da simulação 3.x), `regras-de-encaixe.md`, `kit-mola-pecas.md`, `fisica-das-pecas.md` (massas, rigidez, ímãs, flambagem e dinâmica das peças e ligações, com fonte e status: TFG da UPC 2026 e dissertação de Oliveira 2008), `casos-de-validacao.md` (o que a simulação 3.x tem de reproduzir), `ensaios-template.csv` |

### Arquivos de `src/core/`

| Arquivo | Papel |
|---|---|
| `model.ts` | Grafo: nós (`sphere` ou `support` = GC), membros (barra, diagonal = `cable`, cabo do Kit 3 = `rope`; `stiff` = enrijecedor), placas (4 cantos no kit; N cantos aceitos para a 2.x), ligações (RC90, CC, CC90; `base` = RC90 na GC), chapas |
| `rules.ts` | Todas as validações (`validateMember`, `validateSupport`, `validateMovedModel`…), cada uma com a regra de `regras-de-encaixe.md` |
| `snapping.ts` | Candidatas de encaixe e guias da GC |
| `edit.ts` | Edições: mover só o nó (`nodeMoveOptions`, loci esfera/círculo/pontos/caminho), ligar duas esferas (`connectReach`), girar, remover, trechos azul/vermelho do caminho (`locusStatus`), paradas na horizontal/vertical (`alignStops`) |
| `mechanism.ts` | Modelo cinemático (1.7.1), detalhado abaixo |
| `globalMove.ts` | Duplo clique: travado, caminho ou livre; etapas do Espaço (`moveScopes`, com a forma das anteriores travada); estabilidade no resumo |
| `reach.ts` | GC perto da estrutura: círculos onde uma mola nova ou pendurada chega à GC (1.7.2) |
| `rope.ts` | Cabo do Kit 3 (contado em bolinhas) e plano de corte |
| `boards.ts` | Várias chapas |
| `clipboard.ts` | Copiar e colar |
| `inventory.ts` | Estoque por kit; `minKits` |
| `serialization.ts` | Arquivo `.mola` (JSON), com as peças criadas que a montagem usa (`pieces`, A9) |
| `userPieces.ts` | Base da 2.x (1.10.2): peças criadas por cima da planilha, Kit X sem limite, nomes (X2/X3), "fabricar" (X4), bloqueio da exclusão (X5), paleta e arquivo `.kit` |
| `geom.ts` | Contas de geometria; desde 1.10.2 também as de polígono (placa de N cantos: normal de Newell, planicidade, recuo, convexo/simples) |
| `config.ts` | Configurações do usuário sobrepostas ao catálogo, com proteção contra valores que quebram |
| `history.ts` | Desfazer e refazer |

### Conceitos que pegam

- **Unidade:** o núcleo trabalha em **módulos (M)**. Milímetros só entram ao desenhar, por `modulo_mm` (14,87 mm).
- **Eixos:** no modelo, **y é para cima**. Na interface, **Z é a altura**: o usuário vê (X, Y, Z) = (x, z, y) do modelo. Use `toDisp`.
- **Ferramentas:** o estado tem uma ferramenta (`Tool` em `store.ts`): `select`, `place` (com `moving` ao mover uma peça), `moveGroup`, `moveNode`, `moveBody` (com `ref` e `level`) e `paste`. O fantasma é `ghost` (`cand` ou `group`) e `commitGhost()` grava.
- **Caches:** os caches são indexados pela **identidade do modelo** (`history.present`). Muitos ficam em variáveis de módulo em `Placement.tsx` ou em `WeakMap` no core.
- **Estado de um comando:** cuidado com estado de comando que sobra para o seguinte. Foi a causa de dois bugs ("o clique não coloca a peça até recarregar"). Todo estado de comando mora em `Cmd` (`src/interaction/ctx.ts`) e nasce em `freshCmd()`; a cada troca de comando, `resetCommand()` volta ao `freshCmd()`. **Não crie variáveis soltas** para estado de comando nos `steps/`: ponha um campo em `Cmd`. O que vale só para um movimento do cursor (`linkPick`, `linkGhost`, `ballPick`) também é zerado no começo de `update()`.
- **Erros não podem travar:** os eventos do mouse e do teclado passam por `guard()` (em `Placement.tsx`) e `onKeySafe` (em `App.tsx`): um erro recomeça o comando e avisa no rodapé, em vez de repetir a cada movimento. Não tire essas guardas; prefira corrigir a causa e manter a guarda.
- **Desenho sob demanda:** a cena usa `frameloop="demand"` (só desenha quando algo muda). Mudanças pelo React e pela store já pedem quadro (`Invalidator` em `Scene.tsx`). Quem mexer na cena por fora (câmera, `useFrame`, efeitos com `requestAnimationFrame`) precisa chamar `invalidate()`, senão a tela não atualiza.
- **Carregamento:** as pranchas (`SheetsView` e `src/drawings/`) carregam sob demanda (`lazy` em `App.tsx`). Não importe nada de `src/drawings/` nem de `SheetsView` no caminho da montagem, senão eles voltam para o pacote inicial.
- **Configurações:** ficam em localStorage (`simolador:config`), com verificação de abertura (`simolador:config-teste`), `?padrao` no endereço e um ErrorBoundary.
- **Sem internet (1.10.0):** o build gera `dist/sw.js` a partir de `scripts/sw-modelo.js` (plugin `offlinePlugin` no `vite.config.ts`), com a lista de todos os arquivos e um carimbo de versão. Arquivo novo em `public/` entra sozinho. Nada pode vir de fora do site (a fonte é `@fontsource-variable/archivo`). O service worker só é registrado no build (`import.meta.env.PROD`); para testar, use `vite preview`.
- **Peças criadas (1.10.2, base da 2.x):** o `catalog` do programa é uma **cópia** do da planilha (`baseCatalog` fica intocado; as Configurações o usam). Peças do usuário entram só por `registerUserPieces` (`userPieces.ts`), com `origin: "user"`, e moram no Kit X (`unlimited`). Placas que não são retângulo seguem por contas de polígono (`isRectangle(…, 1e-2)` decide; as do kit nunca mudam de caminho). Sem peças criadas, nada disso aparece.
- **Tema escuro (1.10.4):** todas as cores de `styles.css` são variáveis em `:root`; o escuro redefine as mesmas em `:root[data-theme="dark"]` (no fim do arquivo). Cor nova no CSS: use uma variável (ou acrescente uma `--c-xxxxxx` nos dois blocos). `main.tsx` põe `data-theme` ao abrir (`resolvedTheme` em `prefs.ts`); a cena usa `sceneBackground` e `plateOf` ("auto" = chapa clara no escuro). A folha das pranchas fica sempre branca.
- **Idiomas (1.10.4):** o código continua em português. Com outro idioma, `i18n.ts` observa a página e troca cada texto (e `title`, `placeholder`, `aria-label`) pela tradução: `i18n-dict.ts` (linhas `[pt, en, es]` e modelos em `PATTERNS`) e a tabela `i18n-textos.tsv` (pt, en, es separados por tabulação; `{1}`, `{2}`… marcam partes variáveis, que também são traduzidas e não atravessam " · "). Texto sem tradução fica em português. As **pranchas** são traduzidas na geração (`buildSheets` passa `tr()` em cada texto; listas do carimbo com "  ·  " parte por parte), então o PDF/DXF/SVG sai no idioma; o DOM da folha (`.sheet-paper`) não é tocado pelo observador. Para mensagens fora da página (`window.confirm`), use `tr()`; para o que é desenhado na cena (cubo de vistas) ou depende do idioma (pranchas), `useLang()`. Texto novo na interface: acrescente a linha na tabela.
- **Arquivos (1.10.0):** salvar e abrir passam por `src/ui/files.ts` (não chame `store.load` direto da interface: use `openText`/`openExample`, que guardam a cópia automática e tratam arquivo de versão mais nova). O `.mola` grava `app` (versão do programa). Regras A1–A8 em `regras-de-encaixe.md`.

## Modelo cinemático (rigidez)

Em `mechanism.ts` e `globalMove.ts`, cada ligação vira um vínculo:

| Ligação | Como o programa trata |
|---|---|
| Esfera | Rótula |
| Mola | Distância fixa |
| RC90 | Trava só a **inclinação no plano em que foi posicionada** (L10, 16/10): distância entre as pontas das duas molas. No plano perpendicular a mola gira, e a torção também fica livre (14/10). No "mover só o nó" (`edit.ts`), vira mais um vínculo de distância, em vez de travar o nó |
| RC90 na base | Trava só o tombamento do pilar **no plano dela** (equipe 08/11; vínculo `planes` em `mechanism.ts`, `RC90_BASE_ENGASTA = false` em `model.ts`). Duas, em lados perpendiculares, engastam |
| CC | Colinear (`lerps`) |
| CC90 | Também trava o ângulo com o par da CC (**a confirmar**) |
| Placa | Corpo rígido (shape matching) |
| Diagonal e cabo | Só tração (`ties`) |
| GC | Fixa na chapa e **rótula** para as molas (confirmado pela equipe em 08/11) |

A **GC é rótula** (equipe, 08/11/2026), e a **RC90 trava uma direção só**, inclusive na base; a outra fica um pouco mais rígida na peça real (para a 3.x). O TFG da UPC (jan. 2026, ver `docs/fisica-das-pecas.md`) já mostra o pórtico sem RC90 na base tombando (GC = rótula) e a GC + RC90 funcionando como engaste no plano da RC90. A dissertação de Oliveira (UFOP, 2008, a origem do kit) mostra o mesmo em vários ensaios. Ela mostra também que a RC90 deixa reto um trecho da mola (modelar como trecho rígido + mola de rotação) e que a CC deixa a viga contínua sem passar momento para a coluna.

- **Graus de liberdade:** saem do núcleo da matriz de rigidez, mais um teste finito (`newtonProject`) que descarta dobras que só existem no infinitesimal.
- **Duplo clique:** com 0 graus a peça fica travada e o rodapé diz o que trava. Com 1, ela anda num caminho traçado por `tracePath`, azul onde pode e vermelho onde não pode. Com 2 ou mais, o arraste é livre (`dragTo` mexe o mínimo).
- **Edição por etapas (1.8.0): Espaço amplia** o conjunto que mexe, e Shift+Espaço volta. A ordem é só a peça (numa esfera, o "mover só o nó") → vizinhas → pavimentos → estrutura toda. O que fica fora do conjunto é tratado como fixo. Ao trocar de etapa, a posição atual é gravada e a forma da etapa vira um **bloco rígido** nas seguintes (`MoveScope.frozen`, `shapeGroup`, `freezeShapes`). Assim, só a próxima liberdade mexe. Exemplo: no pórtico, o canto anda na circunferência; com Espaço, o pórtico tomba inteiro sem deformar.
- **Tab** (e também ← / →) percorre as referências do caminho: limites azul/vermelho e posições na horizontal/vertical. Na esfera de uma mola, também as circunferências (`sphereRings`), e a esfera desliza na escolhida.
- **Corpos rígidos** (`Mech.rigids`): os 3 primeiros pontos ficam fora de uma reta (`rigidOf`), e `planar` liga a linha de planicidade (placas).
- **No resumo:** o bloco "Estabilidade" mostra os graus de liberdade por parte.
- **Pensado para a 3.x:** esse modelo é a base da simulação. O plano está em `plano-simolador.md` §10 (estaticidade → estática linear → não linear e falhas → flambagem → dinâmica → cabos), e os números físicos (EI da mola = 2.966 N·mm² medido; massas, ímãs e ligações a medir) estão em `docs/fisica-das-pecas.md`, sempre com fonte e status. A simulação simula o **kit** (o ímã que solta), não o prédio real, e é validada pelos casos de `docs/casos-de-validacao.md`.

## Kits e peças

- **Kits 1 e 2:**
  - GC (ligação de base);
  - barras B4, B6 e B12;
  - diagonais D4x6, D6x6 e D6x12;
  - placas P6x6 e P6x12;
  - RC90, CC e CC90.
- **Kit 3 (1.5.0):**
  - **cabo** em dois cliques, com a sequência esfera · CABLE C · CABLE CLIP C · cabo · CABLE CLIP C · CABLE C · esfera, contado em bolinhas, com plano de corte dos rolos;
  - **enrijecedor**, aplicado clicando na mola B6 ou B12.
- **Kit X** (= o antigo "Kit A", equipe 08/11): o kit ajustável da 2.x, ligado pela chave **Ajustável** (§11.0 do plano). Barra, tirante, placa e RC ajustáveis; só a barra existe à venda (as reguláveis), as outras o programa dimensiona para fabricar. Códigos: B2.34, T5.83, P5 / P5-2, RC45.2 (X2, X3, X8).
- **Medidas:** todas em `docs/kit-mola-pecas.md` e `data/parametros.xlsx`. As do Kit 3 são **estimadas por fotos**; a do CC/CC90 é **provisória**.

## Versões e publicação

| Linha | Nome | Escopo |
|---|---|---|
| **1.x** | Geométrica (atual) | Montar com as regras reais e gerar pranchas |
| **2.x** | Arquitetônica | A chave **Ajustável** funciona: flexibilidade, ajustabilidade e peças próprias com o **Kit X** (barra, tirante, placa e RC ajustáveis, catálogo próprio, arquivo `.kit`): plano em `plano-simolador.md` §11, com a chave (§11.0), o que preparar ainda na 1.x (§11.5) e as decisões X1–X11 (§11.6) |
| **3.x** | De engenharia | O botão **Simolar** funciona: deformação, estaticidade e estabilidade (hoje "em breve") |

O número tem três partes, **X.Y.Z**: X é a linha; **Y** sobe quando muda o assunto principal ou o jeito de usar (uma fase: 1.7 rigidez, 1.8 pranchas editáveis); **Z** conta cada entrega publicada dentro da fase, novidade ou correção (1.8.0, 1.8.1, 1.8.2…). Toda entrega publicada ganha número. Em 28/10/2026 as antigas 1.0–1.25 foram renumeradas (1.25 = 1.8.1); a equivalência está no fim do `CHANGELOG.md`.

**Roteiro para lançar uma versão:**
1. Suba `version` no `package.json` e atualize a versão no `README.md`.
2. Escreva a entrada no topo do `CHANGELOG.md` (dentro da fase, `### X.Y.Z — título · data`), em linguagem de usuário.
3. Atualize `docs/regras-de-encaixe.md` (regras novas ou mudadas e a versão no cabeçalho) e `docs/plano-simolador.md` (pendências e "atual").
4. Rode `npm test` e `npm run build`, e faça um teste Playwright da interação nova.
5. Faça o commit em português, com uma mensagem que diga **o que mudou** (nunca só "Atualizações" ou "Correção"), depois `git pull --rebase origin main && git push`.
6. Acrescente `vX.Y.Z <hash> <título>` em `.github/versoes.txt`, faça o commit "Etiqueta vX.Y.Z" e o push. Depois crie e envie a etiqueta à mão: `git tag -a vX.Y.Z <hash> -m "siMOLAdor X.Y.Z — <título>" && git push origin vX.Y.Z`. (A publicação não consegue criar etiquetas: o token das Actions não tem a permissão "workflows".)
7. Acompanhe com `gh run watch` até o Pages terminar.
8. Os documentos `CHANGELOG.md`, `docs/plano-simolador.md`, `docs/regras-de-encaixe.md`, `docs/kit-mola-pecas.md`, `docs/fisica-das-pecas.md` e `docs/casos-de-validacao.md` têm cópia no Drive da equipe: `I:\Meu Drive\Poli Building [GERAL]\02. Equipes\2026\Poli Mola\siMOLAdor\` (dados em `data\`). Copie para lá depois de mudar. Também há uma cópia num projeto do Claude chamado "SiMOLAdor".

## Pendências e próximas implementações

### Lembretes fixos (mencionar ao fim de cada entrega)
1. **Idiomas:** inglês e espanhol na interface (1.10.4) e nas pranchas (1.10.5), com as regras e as dicas traduzidas. Falta a revisão das traduções por quem fala as línguas e acompanhar texto novo na tabela `i18n-textos.tsv`.
2. **Corrigir as peças CC e CC90:** o formato é provisório até a equipe medir; o comportamento da CC90 (travar o ângulo com o par da CC) também falta conferir.
3. **Confirmar as medidas do Kit 3** com o kit em mãos (e as regras K10–K14 da 1.9.0: anel, clip múltiplo, emenda, sem cortar).
4. **Biblioteca online** de modelos dos usuários: precisa de servidor e contas, e é preciso definir onde hospedar. Hoje a Biblioteca só abre os exemplos.
5. **Próximas montagens com cabo:** o mapa está em `plano-simolador.md` §8. Feito na 1.9.0: clip múltiplo, anéis, emenda, laço sem cortar, régua 1:1. Falta:
   - cruz de cabos (o pino não vem no kit: decidir com a equipe);
   - cabo frouxo/funicular (2.x/3.x);
   - posição de equilíbrio do anel (3.x).

### Mecanismo e rigidez (próximos passos)
- Feito (1.8.3): rótulas que giram em laranja (`turningJoints`), **G** segue um modo por vez no arraste livre (`Mobility.modes`, `dofMode` na ferramenta `moveBody`), diagonal frouxa com barriga (`sagCurve`). Falta: o cabo do Kit 3 frouxo (hoje é recontado e fica sempre esticado).
- Conferido em 08/11: GC = rótula; RC90 trava só o plano dela (também na base). Falta conferir a CC90.
- Levar o estudo para a 3.x: plano em `plano-simolador.md` §10. Primeiro passo sem depender de medida: a 3.0 (estaticidade: estados de autotensão = vínculos − posto, a partir do `mechanism.ts`). Os ensaios da equipe estão em `fisica-das-pecas.md` §7 (prioridade T0–T3).

### Outros
- **Geometria livre:** geodésicas e barras fora dos planos ortogonais (E19). É a fase 4 do plano.
- **App local:** fase 5, plano em `plano-simolador.md` §7c. Feito na 1.10.0: arquivos, sem internet, PWA, Sobre e relatório. Feito na 1.10.1: pavimentos na capa, planta baixa cortada a uma altura, marcadores de vista arrastáveis, seleção de vários na prancha (F17–F20). Feito na 1.10.2: base para a 2.x (plano §11.5). Feito na 1.10.3: chave Ajustável desativada, Kit X no Estoque, tirante criado. Feito na 1.10.4: modo escuro, inglês e espanhol, RC90 na base só no plano dela. Feito na 1.10.5: pranchas traduzidas, dicionário completo, chave ao lado da barra, título acompanha o desenho. Próximos: 1.10.6 impressão das pranchas, 1.10.7 modo leve, 1.11 Tauri (instaladores, atualizador, página de download).
- **Medições pendentes:** o protocolo está em `plano-simolador.md` §9.
- **Responsáveis por frente** (Q08): falta definir.

## Plano maior

O objetivo da 1.x é que a equipe monte **qualquer estrutura do manual e do Desafio** com as regras reais do kit e saia com as pranchas prontas para entregar. A 2.x, arquitetônica, traz a flexibilidade: o Kit X, com peças ajustáveis (barra, placa e RC de qualquer ângulo), catálogo próprio e arquivo `.kit`. Ela depende da geometria livre (fase 4) e do catálogo em camadas (§11.5 do plano). A 3.x transforma o programa em ferramenta de engenharia: estabilidade, estaticidade e deformação, a partir do modelo cinemático que já existe.

O modelo é um **grafo**, não um monte de malhas. O encaixe vira conta, as pranchas saem vetoriais e a lista de peças é uma contagem. Mantenha isso ao estender o programa.
