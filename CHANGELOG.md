# Histórico de versões do siMOLAdor

A versão aparece no rodapé do programa, depois das logos, e no `package.json`. Cada versão tem uma etiqueta (tag) no Git (`v1.0`, `v1.1`…), que aponta para o código daquela versão.

## Linhas de versão

| Versão | Nome | O que traz |
|---|---|---|
| **1.x** | **Geométrica** | Montar a estrutura com as peças e as regras reais do kit e gerar as pranchas. É a que estamos fazendo. |
| 2.x | Arquitetônica | O módulo extra ajustável (em breve). |
| 3.x | De engenharia | Ferramentas para analisar deformação, estaticidade e estabilidade. |

Regra para numerar: sobe o número depois do ponto (1.5 → 1.6) quando entra uma mudança grande ou um conjunto de mudanças menores que muda o jeito de usar. Correções pequenas entram na versão seguinte, sem número próprio.

---

## 1.5 — Várias chapas · 09/10/2026
- **Várias chapas de base**: + nos lados para acrescentar chapa; distância 0, 4, 6, 12 módulos ou livre (a estrutura vai junto); estruturas de chapas diferentes podem se ligar.
- **Chapa selecionável**: clique na chapa vazia; menu fixo até Esc; Delete apaga; painel com os dados da chapa.
- Menu da chapa: selecionar peças, exportar e importar .mola por chapa, pranchas só da chapa.
- Pranchas de todas as chapas ou só de algumas, na posição real; arquivo .mola versão 3 (com as chapas).
- **Ligação × placa (L8)**: RC90 não vai no canto onde uma placa encosta; CC/CC90 não vão do lado em que a placa ocupa (e vice-versa).
- Cotas liga/desliga nas pranchas; logos do Mola e da Poli Building no carimbo e no rodapé; botão Enquadrar discreto; número da versão no rodapé.

## 1.4 — Produtividade e pranchas completas · 09/10/2026
- **Copiar e colar** (Ctrl+C / Ctrl+V) com fantasma: ↑/↓ muda a altura, R gira, X/Z espelha; esferas no mesmo lugar viram uma só (pavimentos se empilham).
- **Mover várias peças** (M / Ctrl+X) e **Repetir** N vezes com deslocamento.
- Pranchas: **cotas** entre eixos, totais e de altura; cota de cada nível; **etiquetas arrastáveis** (salvas no .mola); até duas logos no carimbo.

## 1.3 — Planos inclinados, guias e edição fina · 08/10/2026
- Placas, diagonais, RC90, CC e CC90 em **planos inclinados**.
- **Guias da GC**: pontos azuis (a um vão de barra) e amarelos (vértice de triângulo); com a grade desligada, a GC só vai para eles; **Tab** alterna pontos sobrepostos; botões Grade / Vão / Triângulo.
- **Coordenadas** da GC no painel (módulos ou mm) e distâncias às outras GC.
- **R contínuo** na peça selecionada; **Espaço** repete a última peça.
- **Mover só o nó**: as barras inclinam para acompanhar; RC90/CC/placas travam.
- Conflitos: RC90 × diagonal, placa × diagonal, barra atravessando placa.
- CC em vários lados do mesmo par; paleta só com as peças dos kits escolhidos; eixos X, Y, Z; câmera por baixo; **capa com isométrica renderizada**.

## 1.2 — Barras inclinadas e navegação de CAD · 08/10/2026
- **Barras inclinadas** em passos de 15° (Shift ou botão "Inclinadas") e fechamento entre esferas (triângulos).
- **Cubo de vistas** (faces, arestas, isométricas) e Enquadrar.
- CC e CC90 nos 4 lados da esfera.
- **Seleção por retângulo** (janela e cruzamento), Shift+clique, Ctrl+A; botão esquerdo seleciona, direito gira.
- Folga entre esferas: barra que não alcança a esfera não cria esfera sobreposta.

## 1.1 — Kits 1 e 2 completos e pranchas · 08/10/2026
- Todas as peças dos Kits 1 e 2: B4/B6/B12, diagonais, placas, RC90, CC, CC90; estoque por kit.
- Pontos verdes de encaixe, mover e girar peças, mover a estrutura pela GC.
- **Pranchas** no padrão do Desafio Poli-USP: capa, plantas, vistas A–D, escala automática; PDF, DXF e SVG.
- Exemplo: Estrutura 01 do Desafio 2022.

## 1.0 — Primeira versão · 08/10/2026
- Chapa 18 × 12, ligação de base, esferas e barras B6/B12 na grade.
- Arrastar e encaixar, desfazer/refazer, salvar e abrir .mola; publicada no GitHub Pages.
- Dados das peças vindos de `data/parametros.xlsx`.
