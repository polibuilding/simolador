# siMOLAdor

Simulador de montagem 3D de estruturas com o [Kit Mola](https://molamodel.com) (Mola Structural Model), feito pela equipe Poli Mola da Poli Building. Você monta a estrutura no navegador, com as peças e o estoque reais dos kits, e o programa vai gerar as pranchas (plantas e vistas) no padrão do Desafio Poli-USP.

**Versão em uso:** https://polibuilding.github.io/simolador/

## O que já funciona

- **Todas as peças dos Kits 1 e 2**: ligação de base, barras B4/B6/B12, diagonais D4x6/D6x6/D6x12, placas P6x6/P6x12 (laje ou parede), ligações RC90, CC e CC90.
- **Encaixe**: pontos verdes mostram onde a peça escolhida entra. Sobre uma esfera, a barra sobe; puxando o cursor para um lado, ela vai para aquele lado; **R** alterna as opções.
- **Regras do kit**: comprimentos, ângulo mínimo de 45° entre barras, nada deitado na chapa, diagonais só no vão nominal, placas presas em 4 esferas, ligações nos cantos certos, estoque. O motivo de cada bloqueio aparece no rodapé.
- **Editar**: selecionar; **mover** (M, botão ou arrastar a peça); **girar** (R); remover; desfazer e refazer. Mover uma ligação de base leva a estrutura inteira.
- **Câmera**: enquadrar (F), 3D, frente, lado e topo, sem limite de altura.
- **Pranchas**: capa com isométrica e lista de peças, plantas por pavimento e vistas A–D no padrão do Desafio Poli-USP; escala automática; carimbo editável; **PDF**, **DXF** (camadas MOLA-*) e SVG.
- Estoque configurável, arquivos `.mola`, salvamento automático no navegador.

Exemplos em `examples/`: o pórtico simples e a **Estrutura 01 do Desafio 2022**, reconstruída a partir das pranchas originais.

Próximos passos: medidas reais da CC e da CC90, geometria livre para triângulos e geodésicas (fase 4), app local (fase 5).

## Como usar

1. Arraste uma **ligação de base** da paleta para a chapa.
2. Clique numa barra (por exemplo, **B6**) e passe o cursor sobre uma esfera: a barra sobe. Puxe o cursor para o lado para fazer vigas, ou leve-o até um ponto verde. Clique para encaixar.
3. **R** alterna as opções; **Esc** para de colocar peças; **M** move a peça selecionada; **Delete** remove; **Ctrl+Z / Ctrl+Y** desfazem e refazem; **F** enquadra.
4. Na cena: botão esquerdo gira, botão direito move, a roda dá zoom.
5. **Gerar pranchas** abre as folhas; dali saem o PDF e o DXF.

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
