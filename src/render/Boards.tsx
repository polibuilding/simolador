// Chapas de base: desenho; selecionada (clique na chapa vazia), ganha os + nos lados e o menu de opções.
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { catalog } from "../core/catalog";
import { boardName, boardSize, boardsOverlap, fromBoardLocal, placeBeside, type Side } from "../core/boards";
import { boardsOf, type Board, type Model } from "../core/model";
import { useApp } from "../ui/store";
import { GroundPlate } from "./pieces/pieces";
import { M } from "./units";


function save(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Campo numérico que só aplica no Enter (ou ao sair do campo); vírgula vale como ponto. */
export function NumField({ value, onCommit, title, width = 46, suffix }: { value: number; onCommit: (v: number) => string | null; title: string; width?: number; suffix?: string }) {
  const show = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace(".", ",") : "");
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const commit = () => {
    const v = Number(text.replace(",", "."));
    if (!Number.isFinite(v)) return useApp.setState({ hint: "Use um número (ex.: 3,5)." });
    if (!text.trim() || Math.abs(v - value) < 1e-9) return;
    const e = onCommit(v);
    if (e) (useApp.setState({ hint: e }), setText(show(value)));
  };
  return (
    <span className="num-field" title={title}>
      <input
        value={text}
        inputMode="decimal"
        style={{ width }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") (setText(show(value)), (e.target as HTMLInputElement).blur());
        }}
      />
      {suffix}
    </span>
  );
}

/** Menu da chapa selecionada (no plano, junto do canto da frente) e os + nos lados livres. Posição, giro e nome: no painel. */
function BoardOverlay({ model, b }: { model: Model; b: Board }) {
  const { w, d } = boardSize(catalog);
  const boards = boardsOf(model);
  const st = useApp.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const name = boardName(b);
  const local: { side: Side; at: [number, number] }[] = [
    { side: "+x", at: [w + 0.9, d / 2] },
    { side: "-x", at: [-0.9, d / 2] },
    { side: "+z", at: [w / 2, d + 0.9] },
    { side: "-z", at: [w / 2, -0.9] },
  ];
  const freeSide = (side: Side) => {
    const nb: Board = { id: "_", ...placeBeside(catalog, b, side, 0), rot: b.rot };
    return !boards.some((o) => boardsOverlap(catalog, o, nb));
  };
  const err = (e: string | null) => (e && useApp.setState({ hint: e }), e);
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  const [mx, mz] = fromBoardLocal(b, 0, d);
  return (
    <>
      {local.filter((s) => freeSide(s.side)).map((s) => {
        const [x, z] = fromBoardLocal(b, s.at[0], s.at[1]);
        return (
          <Html key={s.side} position={[x * M, 0, z * M]} center zIndexRange={[60, 41]}>
            <button className="board-plus" {...stop} onClick={() => st.addBoardAt(b.id, s.side)} title="Acrescentar uma chapa deste lado">
              +
            </button>
          </Html>
        );
      })}
      <Html position={[mx * M, 0, mz * M]} zIndexRange={[30, 10]}>
        <div className="board-menu" {...stop}>
          <div className="board-menu-head">
            <strong>{name}</strong>
            <span className="board-ref">setas movem · posição, giro e nome no painel</span>
          </div>
          <div className="board-menu-actions">
            <button onClick={() => st.selectBoard(b.id)} title="Seleciona as peças desta chapa (para copiar, mover ou apagar)">Selecionar peças</button>
            <button onClick={() => save(st.exportBoard(b.id), `${st.name}-${name}.mola`)} title="Salva só a estrutura desta chapa como .mola">Exportar .mola</button>
            <button onClick={() => fileRef.current?.click()} title="Põe um .mola em cima desta chapa">Importar .mola</button>
            <button onClick={() => (st.setSheetBoards([b.id]), st.setSheetsOpen(true))} title="Pranchas só desta chapa">Pranchas</button>
            {boards.length > 1 && (
              <button
                className="danger"
                onClick={() => window.confirm(`Apagar ${name} e a estrutura que está só nela?`) && err(st.removeBoardId(b.id))}
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

/** Todas as chapas; clicar na chapa vazia a seleciona e mostra o menu dela (só no modo Selecionar). */
export function Boards({ model }: { model: Model }) {
  const hover = useApp((s) => s.hoverBoard);
  const pinned = useApp((s) => s.selectedBoard);
  const extra = useApp((s) => s.boardExtra);
  const selecting = useApp((s) => s.tool.kind === "select" && !s.sheetsOpen);
  const onMove = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    if (e.buttons) return; // arrastando (retângulo ou câmera)
    useApp.getState().setHoverBoard(id);
  };
  const onOut = () => useApp.getState().setHoverBoard(null);
  const onClick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    const st = useApp.getState();
    if (st.tool.kind !== "select" || performance.now() - st.boxEndedAt < 250 || e.delta > 5) return;
    // Ctrl+clique (ou Shift+clique): soma ou tira a chapa da seleção (para a distância entre chapas e mover juntas)
    if (e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) return st.toggleBoard(id);
    // clique na chapa vazia: seleciona a chapa (menu fixo até Esc); o que estava selecionado sai
    st.pinBoard(id);
  };
  const boards = boardsOf(model);
  const sel = selecting && pinned ? boards.find((b) => b.id === pinned) : undefined;
  return (
    <>
      {boards.map((b) => (
        <GroundPlate key={b.id} id={b.id} x={b.x} z={b.z} rot={b.rot ?? 0} highlight={selecting && hover === b.id && pinned !== b.id}
          selected={pinned === b.id || extra.includes(b.id)} onPointerMove={onMove(b.id)} onPointerOut={onOut} onClick={onClick(b.id)} />
      ))}
      {sel && !extra.length && <BoardOverlay key={`p-${sel.id}`} model={model} b={sel} />}
    </>
  );
}
