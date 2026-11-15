import { describe, expect, it } from "vitest";
import { catalog } from "../../src/core/catalog";
import { addBoard, boardCenter, boardsGap, boardSize, moveBoards, onQuarter, rotateBoard, viewArrows } from "../../src/core/boards";
import { addSupport, boardsOf, emptyModel, type Model } from "../../src/core/model";

const { w } = boardSize(catalog);
const ok = (r: { model?: Model; error?: string }) => {
  if (!r.model) throw new Error(r.error);
  return r.model;
};
const board = (m: Model, id: string) => boardsOf(m).find((b) => b.id === id)!;

/** duas chapas encostadas (a segunda à direita) e uma GC na segunda */
function setup() {
  let m = emptyModel();
  const first = boardsOf(m)[0].id;
  const r = addBoard(catalog, m, first, "+x");
  m = r.model!;
  m = addSupport(m, [w + 3, 0, 3]).model;
  return { m, a: first, b: r.id! };
}

describe("chapas moduladas (1.10.7)", () => {
  it("girar 15°, andar com as setas, voltar a 0° e encostar de novo na vizinha", () => {
    const { m: m0, a, b } = setup();
    const c0 = boardCenter(catalog, board(m0, b));
    let m = ok(moveBoards(catalog, m0, [b], [2, 0])); // afasta para poder girar
    for (const deg of [15, 30, 45, 30, 15]) {
      m = ok(rotateBoard(catalog, m, b, deg));
      m = ok(moveBoards(catalog, m, [b], [0, 1]));
      m = ok(moveBoards(catalog, m, [b], [0, -1]));
    }
    m = ok(rotateBoard(catalog, m, b, 0));
    const B = board(m, b);
    expect(B.rot ?? 0).toBe(0);
    // o centro volta exatamente à grade (2 módulos à direita de onde estava)
    const c = boardCenter(catalog, B);
    expect(c[0]).toBe(c0[0] + 2);
    expect(c[1]).toBe(c0[1]);
    // volta a encostar: as setas de 1 módulo fecham a distância sem sobrar fração
    m = ok(moveBoards(catalog, m, [b], [-1, 0]));
    m = ok(moveBoards(catalog, m, [b], [-1, 0]));
    expect(boardsGap(catalog, board(m, a), board(m, b)).gap).toBe(0);
    // e a GC de cima voltou ao mesmo ponto da grade da chapa
    const gc = Object.values(m.nodes).find((n) => n.kind === "support")!;
    expect(gc.pos).toEqual([w + 3, 0, 3]);
  });

  it("muitos giros seguidos não tiram o centro do lugar", () => {
    const { m: m0, b } = setup();
    let m = ok(moveBoards(catalog, m0, [b], [3, 0]));
    const c0 = boardCenter(catalog, board(m, b));
    for (let i = 0; i < 48; i++) m = ok(rotateBoard(catalog, m, b, ((i % 24) - 12) * 15 + 7.5));
    m = ok(rotateBoard(catalog, m, b, 0));
    const c = boardCenter(catalog, board(m, b));
    expect(c[0]).toBeCloseTo(c0[0], 9);
    expect(c[1]).toBeCloseTo(c0[1], 9);
    expect(board(m, b).x % 0.25).toBe(0);
  });

  it("onQuarter só corrige erro de arredondamento", () => {
    expect(onQuarter(2.99995)).toBe(3);
    expect(onQuarter(6.2501)).toBe(6.25);
    expect(onQuarter(4.242641)).toBe(4.242641);
  });

  it("setas referidas a quem olha: o eixo da grade mais perto da direita da tela", () => {
    // olhando para −z (de frente): → = +x, ↑ = para dentro da tela (−z)
    expect(viewArrows([1, 0])).toEqual({ ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });
    // olhando para +x (pela esquerda): → = +z, ↑ = +x
    expect(viewArrows([0.2, 0.98])).toEqual({ ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [1, 0], ArrowDown: [-1, 0] });
    // de costas (olhando para +z): → = −x, ↑ = +z
    expect(viewArrows([-0.9, 0.3]).ArrowUp).toEqual([0, 1]);
    // as quatro sempre num eixo, com passo 1
    for (const v of Object.values(viewArrows([0.7, -0.71]))) expect(Math.abs(v[0]) + Math.abs(v[1])).toBe(1);
  });
});
