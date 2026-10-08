# siMOLAdor

Simulador de montagem 3D de estruturas com o [Kit Mola](https://molamodel.com) (Mola Structural Model), feito pela equipe Poli Mola da Poli Building. Você monta a estrutura no navegador, com as peças e o estoque reais dos kits, e o programa vai gerar as pranchas (plantas e vistas) no padrão do Desafio Poli-USP.

**Versão em uso:** https://polibuilding.github.io/simolador/

## O que já funciona (fase 1)

- Chapa de base 18 × 12 módulos, com a grade real.
- Ligação de base (GC): na grade ou em posição livre; o centro precisa ficar dentro da chapa, e duas GC não podem encostar.
- Barras B4, B6 e B12 nos eixos X, Y e Z, saindo das esferas. A esfera da ponta é criada sozinha.
- Peça fantasma verde (encaixa) ou vermelha, com o motivo escrito no rodapé.
- Estoque configurável: quantas caixas de cada kit vocês têm, ou sem limite.
- Selecionar, remover, desfazer e refazer; salvar e abrir arquivos `.mola`; salvamento automático no navegador.

Próximas fases: diagonais, placas, ligações rígidas e contínuas (fase 2), pranchas em PDF, SVG e DXF (fase 3) e geometria livre para triângulos e geodésicas (fase 4). O plano completo está em [`docs/plano-simolador.md`](docs/plano-simolador.md), e as regras de montagem em [`docs/regras-de-encaixe.md`](docs/regras-de-encaixe.md).

## Como usar

1. Arraste uma **ligação de base** da paleta para a chapa.
2. Clique numa barra (por exemplo, **B6**) e leve o cursor até onde ela deve terminar. Clique para encaixar.
3. Esc para parar de colocar peças; Delete remove a peça selecionada; Ctrl+Z e Ctrl+Y desfazem e refazem.
4. Na cena: botão esquerdo gira, botão direito move, a roda dá zoom.

## Medidas e quantidades das peças

Tudo sai de **`data/parametros.xlsx`**. Para mudar uma medida ou uma quantidade:

1. Edite a planilha (células amarelas). Ela explica as regras na aba Leia-me.
2. Envie a planilha nova para o repositório (no GitHub: abra a pasta `data`, depois *Add file → Upload files*).
3. A publicação regera `data/catalog.json` e `data/kits.json` sozinha e atualiza o site em alguns minutos.

Nunca edite os `.json` à mão.

## Para quem programa

```bash
npm install
npm run dados   # planilha → JSON
npm run dev     # http://localhost:5173/simolador/
npm test        # testes do núcleo
npm run build
```

Pastas: `src/core` (lógica pura e testada: modelo, regras, encaixe, estoque, histórico, arquivo `.mola`), `src/render` (cena Three.js), `src/interaction` (posicionamento), `src/ui` (interface), `tests/`, `scripts/gerar-dados.mjs`.

Tecnologia: TypeScript, React, Three.js (React Three Fiber), Zustand, Vite e Vitest. A publicação usa GitHub Actions e GitHub Pages ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)).
