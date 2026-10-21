# siMOLAdor — contexto para o Claude Code

Leia este arquivo inteiro antes de mexer no código. Ele resume o projeto, como o código está organizado, as convenções da equipe, o que está pendente e para onde o programa vai.

## O que é

O **siMOLAdor** é um simulador de montagem 3D de estruturas com o **Kit Mola** (Mola Structural Model). Ele é feito pela equipe **Poli Mola**, da **Poli Building** (Poli-USP), para o **Desafio Poli-USP**.

O usuário monta a estrutura no navegador, com as peças, as regras físicas e o estoque reais dos kits. Depois o programa gera as **pranchas** no padrão do Desafio: capa com isométrica e lista de peças, plantas por pavimento e vistas A–D. As pranchas saem em PDF, DXF e SVG.

- **No ar:** https://polibuilding.github.io/simolador/
- **Repositório:** `polibuilding/simolador`, branch `main`. A publicação é por GitHub Actions no GitHub Pages (`.github/workflows/pages.yml`).
- **Versão atual:** 1.24. A linha 1.x se chama "geométrica". O histórico está em `CHANGELOG.md`.
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
npm test          # Vitest (núcleo); hoje 149 testes, todos passando
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
| `src/interaction/Placement.tsx` | Todo o posicionamento com o mouse: fantasma, encaixe, cliques, Enter. É o arquivo mais delicado. |
| `src/ui/` | Interface: `store.ts` (estado), `PropertiesPanel.tsx` (resumo e painel da peça), `Palette.tsx`, `Dock.tsx` (barra de baixo), `Toolbar.tsx`, `Config.tsx`, `Shortcuts.tsx`, `SheetsView.tsx` |
| `src/drawings/` | Pranchas: vistas, folhas e exportação PDF/DXF/SVG |
| `src/App.tsx` | Atalhos de teclado (`useShortcuts`) |
| `tests/core/` | Testes do núcleo |
| `data/parametros.xlsx` | Fonte de **todas** as medidas e quantidades |
| `examples/` | Pórtico simples e Estrutura 01 do Desafio 2022 |
| `docs/` | `plano-simolador.md`, `regras-de-encaixe.md`, `kit-mola-pecas.md` |

### Arquivos de `src/core/`

| Arquivo | Papel |
|---|---|
| `model.ts` | Grafo: nós (`sphere` ou `support` = GC), membros (barra, diagonal = `cable`, cabo do Kit 3 = `rope`; `stiff` = enrijecedor), placas (4 cantos), ligações (RC90, CC, CC90; `base` = RC90 na GC), chapas |
| `rules.ts` | Todas as validações (`validateMember`, `validateSupport`, `validateMovedModel`…), cada uma com a regra de `regras-de-encaixe.md` |
| `snapping.ts` | Candidatas de encaixe e guias da GC |
| `edit.ts` | Edições: mover só o nó (`nodeMoveOptions`, loci esfera/círculo/pontos/caminho), ligar duas esferas (`connectReach`), girar, remover, trechos azul/vermelho do caminho (`locusStatus`), paradas na horizontal/vertical (`alignStops`) |
| `mechanism.ts` | Modelo cinemático (1.22), detalhado abaixo |
| `globalMove.ts` | Duplo clique: travado, caminho ou livre; etapas do Espaço (`moveScopes`, com a forma das anteriores travada); estabilidade no resumo |
| `reach.ts` | GC perto da estrutura: círculos onde uma mola nova ou pendurada chega à GC (1.23) |
| `rope.ts` | Cabo do Kit 3 (contado em bolinhas) e plano de corte |
| `boards.ts` | Várias chapas |
| `clipboard.ts` | Copiar e colar |
| `inventory.ts` | Estoque por kit; `minKits` |
| `serialization.ts` | Arquivo `.mola` (JSON) |
| `config.ts` | Configurações do usuário sobrepostas ao catálogo, com proteção contra valores que quebram |
| `history.ts` | Desfazer e refazer |

### Conceitos que pegam

- **Unidade:** o núcleo trabalha em **módulos (M)**. Milímetros só entram ao desenhar, por `modulo_mm` (14,87 mm).
- **Eixos:** no modelo, **y é para cima**. Na interface, **Z é a altura**: o usuário vê (X, Y, Z) = (x, z, y) do modelo. Use `toDisp`.
- **Ferramentas:** o estado tem uma ferramenta (`Tool` em `store.ts`): `select`, `place` (com `moving` ao mover uma peça), `moveGroup`, `moveNode`, `moveBody` (com `ref` e `level`) e `paste`. O fantasma é `ghost` (`cand` ou `group`) e `commitGhost()` grava.
- **Caches:** os caches são indexados pela **identidade do modelo** (`history.present`). Muitos ficam em variáveis de módulo em `Placement.tsx` ou em `WeakMap` no core.
- **Estado de um comando:** cuidado com estado de comando que sobra para o seguinte. Foi a causa de dois bugs ("o clique não coloca a peça até recarregar"). Na 1.23.1, `linkPick`/`linkGhost` passaram a ser zerados no começo de todo `update()`. Siga esse padrão para qualquer estado novo.
- **Configurações:** ficam em localStorage (`simolador:config`), com verificação de abertura (`simolador:config-teste`), `?padrao` no endereço e um ErrorBoundary.

## Modelo cinemático (rigidez)

Em `mechanism.ts` e `globalMove.ts`, cada ligação vira um vínculo:

| Ligação | Como o programa trata |
|---|---|
| Esfera | Rótula |
| Mola | Distância fixa |
| RC90 | Trava só a **inclinação no plano em que foi posicionada** (L10, 16/10): distância entre as pontas das duas molas. No plano perpendicular a mola gira, e a torção também fica livre (14/10). No "mover só o nó" (`edit.ts`), vira mais um vínculo de distância, em vez de travar o nó |
| RC90 na base | Engasta o pilar (o topo fica fixo). **A confirmar**: travar só o plano dela; a chave é `RC90_BASE_ENGASTA` em `model.ts` |
| CC | Colinear (`lerps`) |
| CC90 | Também trava o ângulo com o par da CC (**a confirmar**) |
| Placa | Corpo rígido (shape matching) |
| Diagonal e cabo | Só tração (`ties`) |
| GC | Fixa |

A **GC como rótula** está **a conferir pela equipe**.

- **Graus de liberdade:** saem do núcleo da matriz de rigidez, mais um teste finito (`newtonProject`) que descarta dobras que só existem no infinitesimal.
- **Duplo clique:** com 0 graus a peça fica travada e o rodapé diz o que trava. Com 1, ela anda num caminho traçado por `tracePath`, azul onde pode e vermelho onde não pode. Com 2 ou mais, o arraste é livre (`dragTo` mexe o mínimo).
- **Edição por etapas (1.24): Espaço amplia** o conjunto que mexe, e Shift+Espaço volta. A ordem é só a peça (numa esfera, o "mover só o nó") → vizinhas → pavimentos → estrutura toda. O que fica fora do conjunto é tratado como fixo. Ao trocar de etapa, a posição atual é gravada e a forma da etapa vira um **bloco rígido** nas seguintes (`MoveScope.frozen`, `shapeGroup`, `freezeShapes`). Assim, só a próxima liberdade mexe. Exemplo: no pórtico, o canto anda na circunferência; com Espaço, o pórtico tomba inteiro sem deformar.
- **Tab** (e também ← / →) percorre as referências do caminho: limites azul/vermelho e posições na horizontal/vertical. Na esfera de uma mola, também as circunferências (`sphereRings`), e a esfera desliza na escolhida.
- **Corpos rígidos** (`Mech.rigids`): os 3 primeiros pontos ficam fora de uma reta (`rigidOf`), e `planar` liga a linha de planicidade (placas).
- **No resumo:** o bloco "Estabilidade" mostra os graus de liberdade por parte.
- **Pensado para a 3.x:** esse modelo é a base dos estudos de rigidez que virão.

## Kits e peças

- **Kits 1 e 2:**
  - GC (ligação de base);
  - barras B4, B6 e B12;
  - diagonais D4x6, D6x6 e D6x12;
  - placas P6x6 e P6x12;
  - RC90, CC e CC90.
- **Kit 3 (1.18):**
  - **cabo** em dois cliques, com a sequência esfera · CABLE C · CABLE CLIP C · cabo · CABLE CLIP C · CABLE C · esfera, contado em bolinhas, com plano de corte dos rolos;
  - **enrijecedor**, aplicado clicando na mola B6 ou B12.
- **Kit A:** está previsto no estoque.
- **Medidas:** todas em `docs/kit-mola-pecas.md` e `data/parametros.xlsx`. As do Kit 3 são **estimadas por fotos**; a do CC/CC90 é **provisória**.

## Versões e publicação

| Linha | Nome | Escopo |
|---|---|---|
| **1.x** | Geométrica (atual) | Montar com as regras reais e gerar pranchas |
| **2.x** | Arquitetônica | O módulo extra ajustável |
| **3.x** | De engenharia | Deformação, estaticidade e estabilidade (botão **Simolar**, hoje "em breve") |

O número depois do ponto sobe com uma mudança grande ou que muda o uso. Correções sobem o terceiro número (1.23.1).

**Roteiro para lançar uma versão:**
1. Suba `version` no `package.json` e atualize a versão no `README.md`.
2. Escreva a entrada no topo do `CHANGELOG.md`, em linguagem de usuário.
3. Atualize `docs/regras-de-encaixe.md` (regras novas ou mudadas e a versão no cabeçalho) e `docs/plano-simolador.md` (pendências e "atual").
4. Rode `npm test` e `npm run build`, e faça um teste Playwright da interação nova.
5. Faça o commit em português (descrição curta do que mudou), depois `git pull --rebase origin main && git push`.
6. Acrescente `vX.Y <hash> <título>` em `.github/versoes.txt`, faça o commit "Etiqueta vX.Y" e o push. A publicação cria a tag.
7. Acompanhe com `gh run watch` até o Pages terminar.
8. Os documentos `CHANGELOG.md`, `docs/plano-simolador.md`, `docs/regras-de-encaixe.md` e `docs/kit-mola-pecas.md` têm cópia no Drive da equipe: `I:\Meu Drive\Poli Building [GERAL]\02. Equipes\2026\Poli Mola\siMOLAdor\` (dados em `data\`). Copie para lá depois de mudar. Também há uma cópia num projeto do Claude chamado "SiMOLAdor".

## Pendências e próximas implementações

### Lembretes fixos (mencionar ao fim de cada entrega)
1. **Menu maior de configurações:** pensar as abas Tutorial, Aparência, Idioma e Perfil. Quando estiver pronto, a engrenagem abre direto nele.
2. **Corrigir as peças CC e CC90:** o formato é provisório até a equipe medir.
3. **Confirmar as medidas do Kit 3** com o kit em mãos.
4. **Biblioteca online** de modelos dos usuários: precisa de servidor e contas, e é preciso definir onde hospedar. Hoje a Biblioteca só abre os exemplos.
5. **Próximas montagens com cabo:** o mapa completo está em `plano-simolador.md` §8:
   - clip múltiplo;
   - anéis (novo tipo de nó só para cabos);
   - emenda;
   - cabo saindo do meio de outro;
   - laço sem cortar;
   - cruz de cabos;
   - cabo frouxo/funicular (2.x/3.x);
   - régua de bolinhas 1:1 na prancha.

### Mecanismo e rigidez (próximos passos)
- No modo livre, escolher qual grau de liberdade seguir (uma tecla para alternar os "modos" do mecanismo; o Tab agora percorre as referências do caminho).
- Mostrar na cena as rótulas que giram.
- Desenhar a diagonal ou o cabo frouxo com flecha.
- Conferir com a equipe a GC como rótula e a CC90.
- Levar o estudo para a 3.x: rigidez das molas, enrijecedor como barra rígida, cargas, deformação.

### Outros
- **Geometria livre:** geodésicas e barras fora dos planos ortogonais (E19). É a fase 4 do plano.
- **App local:** empacotar com Tauri (fase 5).
- **Medições pendentes:** o protocolo está em `plano-simolador.md` §9.
- **Responsáveis por frente** (Q08): falta definir.

## Plano maior

O objetivo da 1.x é que a equipe monte **qualquer estrutura do manual e do Desafio** com as regras reais do kit e saia com as pranchas prontas para entregar. A 2.x abre para projetos arquitetônicos, com o módulo extra ajustável. A 3.x transforma o programa em ferramenta de engenharia: estabilidade, estaticidade e deformação, a partir do modelo cinemático que já existe.

O modelo é um **grafo**, não um monte de malhas. O encaixe vira conta, as pranchas saem vetoriais e a lista de peças é uma contagem. Mantenha isso ao estender o programa.
