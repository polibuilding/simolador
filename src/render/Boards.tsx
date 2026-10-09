// Chapas de base: desenho, mouse por cima (+ nos lados e menu de opções) e o que fica visível nas pranchas.
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { boardGap, boardSize, placeBeside, type Side } from "../core/boards";
import { boardsOf, type Board, type Model } from "../core/model";
import { useApp } from "../ui/store";
import { GroundPlate } from "./pieces/pieces";
import { BASE_Y, M } from "./units";

const GAPS = [0, 4, 6, 12];

function save(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Menu da chapa (no plano, junto da borda da frente) e os + nos lados livres. */
function BoardOverlay({ model, b, keep, leave }: { model: Model; b: Board; keep: () => void; leave: () => void }) {
  const { w, d } = boardSize(catalog);
  const boards = boardsOf(model);
  const st = useApp.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const gap = boardGap(catalog, model, b);
  const [free, setFree] = useState(gap !== null && !GAPS.includes(gap) ? String(gap).replace(".", ",") : "");
  const n = b.id.slice(1);
  const ref = b.attach ? b.attach.to.slice(1) : null;
  const sides: { side: Side; at: [number, number] }[] = [
    { side: "+x", at: [b.x + w + 0.9, b.z + d / 2] },
    { side: "-x", at: [b.x - 0.9, b.z + d / 2] },
    { side: "+z", at: [b.x + w / 2, b.z + d + 0.9] },
    { side: "-z", at: [b.x + w / 2, b.z - 0.9] },
  ];
  const freeSide = (side: Side) => {
    const p = placeBeside(catalog, b, side, 0);
    return !boards.some((o) => o.x < p.x + w - 1e-6 && p.x < o.x + w - 1e-6 && o.z < p.z + d - 1e-6 && p.z < o.z + d - 1e-6);
  };
  const err = (e: string | null) => e && useApp.setState({ hint: e });
  const hold = { onMouseEnter: keep, onMouseLeave: leave, onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  return (
    <>
      {sides.filter((s) => freeSide(s.side)).map((s) => (
        <Html key={s.side} position={[s.at[0] * M, BASE_Y * 0, s.at[1] * M]} center zIndexRange={[30, 10]}>
          <button className="board-plus" {...hold} onClick={() => st.addBoardAt(b.id, s.side)} title="Acrescentar uma chapa deste lado">
            +
          </button>
        </Html>
      ))}
      <Html position={[b.x * M, 0, (b.z + d) * M]} zIndexRange={[30, 10]}>
        <div className="board-menu" {...hold}>
          <div className="board-menu-head">
          <strong>Chapa {n}</strong>
          {ref && (
            <span className="board-gap" title={`Distância até a chapa ${ref}, em módulos`}>
              a
              {GAPS.map((g) => (
                <button key={g} className={gap === g ? "on" : ""} onClick={() => err(st.setBoardGapOf(b.id, g))}>{g}</button>
              ))}
              <input
                value={free}
                placeholder="livre"
                inputMode="decimal"
                onChange={(e) => setFree(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const v = Number(free.replace(",", "."));
                  err(Number.isFinite(v) ? st.setBoardGapOf(b.id, v) : "Distância em módulos (ex.: 3,5).");
                }}
              />
              M da {ref}
            </span>
          )}
          </div>
          <div className="board-menu-actions">
          <button onClick={() => st.selectBoard(b.id)} title="Seleciona as peças desta chapa (para copiar, mover ou apagar)">Selecionar</button>
          <button onClick={() => save(st.exportBoard(b.id), `${st.name}-chapa-${n}.mola`)} title="Salva só a estrutura desta chapa como .mola">Exportar .mola</button>
          <button onClick={() => fileRef.current?.click()} title="Põe um .mola em cima desta chapa">Importar .mola</button>
          <button onClick={() => (st.setSheetBoards([b.id]), st.setSheetsOpen(true))} title="Pranchas só desta chapa">Pranchas</button>
          {boards.length > 1 && (
            <button
              className="danger"
              onClick={() => window.confirm(`Apagar a chapa ${n} e a estrutura que está só nela?`) && err(st.removeBoardId(b.id))}
            >
              Apagar
            </button>
          )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".mola,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                err(st.importToBoard(b.id, JSON.parse(await f.text())));
              } catch {
                err("Não foi possível ler o arquivo.");
              }
            }}
          />
        </div>
      </Html>
    </>
  );
}

/** Todas as chapas; a que está sob o mouse ganha os + e o menu (só no modo Selecionar). */
export function Boards({ model }: { model: Model }) {
  const hover = useApp((s) => s.hoverBoard);
  const selecting = useApp((s) => s.tool.kind === "select" && !s.sheetsOpen);
  const timer = useRef<number | null>(null);
  const keep = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const leave = () => {
    keep();
    timer.current = window.setTimeout(() => useApp.getState().setHoverBoard(null), 700);
  };
  useEffect(() => keep, []);
  const onMove = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    if (e.buttons) return; // arrastando (retângulo ou câmera): não mexe no menu
    keep();
    useApp.getState().setHoverBoard(id);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // clique na chapa vazia = clique no vazio: limpa a seleção (o retângulo que acabou de terminar não conta)
    const st = useApp.getState();
    if (st.tool.kind !== "select" || performance.now() - st.boxEndedAt < 250) return;
    if (!(e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey)) st.select(null);
  };
  const boards = boardsOf(model);
  return (
    <>
      {boards.map((b) => (
        <GroundPlate key={b.id} id={b.id} x={b.x} z={b.z} highlight={selecting && hover === b.id && boards.length > 1}
          onPointerMove={onMove(b.id)} onPointerOut={leave} onClick={onClick} />
      ))}
      {selecting && hover && boards.some((b) => b.id === hover) && (
        <BoardOverlay key={hover} model={model} b={boards.find((b) => b.id === hover)!} keep={keep} leave={leave} />
      )}
    </>
  );
}
