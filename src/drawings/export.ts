// Saídas das pranchas: SVG (tela e base do PDF), PDF (jsPDF + svg2pdf) e DXF R12 (AutoCAD).
import { A3, type Prim, type Sheet } from "./prims";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const DASH = { center: "4 1 0.6 1", hidden: "1.5 1" };

export function sheetToSvg(sheet: Sheet): string {
  const body = sheet.prims
    .map((p) => {
      const stroke = p.stroke === null ? "none" : (p.stroke ?? "#000");
      const fill = p.fill ? p.fill : "none";
      const common = `stroke="${stroke}" stroke-width="${f(p.pen ?? 0.2)}"${p.dash ? ` stroke-dasharray="${DASH[p.dash]}"` : ""}`;
      switch (p.t) {
        case "line":
          return `<line x1="${f(p.a[0])}" y1="${f(p.a[1])}" x2="${f(p.b[0])}" y2="${f(p.b[1])}" ${common} stroke-linecap="round"/>`;
        case "poly": {
          const pts = p.pts.map((q) => `${f(q[0])},${f(q[1])}`).join(" ");
          return p.closed
            ? `<polygon points="${pts}" fill="${fill}" ${common} stroke-linejoin="round"/>`
            : `<polyline points="${pts}" fill="none" ${common}/>`;
        }
        case "circle":
          return `<circle cx="${f(p.c[0])}" cy="${f(p.c[1])}" r="${f(p.r)}" fill="${fill}" ${common}/>`;
        case "text": {
          const anchor = p.anchor ?? "start";
          const tr = p.rot ? ` transform="rotate(${p.rot} ${f(p.p[0])} ${f(p.p[1])})"` : "";
          return `<text x="${f(p.p[0])}" y="${f(p.p[1])}" font-family="Arial, Helvetica, sans-serif" font-size="${f(p.size)}" font-weight="${p.bold ? 700 : 400}" text-anchor="${anchor}" fill="${p.fill ?? "#000"}"${tr}>${esc(p.s)}</text>`;
        }
      }
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${A3.w}mm" height="${A3.h}mm" viewBox="0 0 ${A3.w} ${A3.h}"><rect x="0" y="0" width="${A3.w}" height="${A3.h}" fill="#fff"/>\n${body}\n</svg>`;
}

/** PDF com uma folha A3 paisagem por prancha (vetorial). */
export async function sheetsToPdf(sheets: Sheet[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden";
  document.body.appendChild(host);
  try {
    for (let i = 0; i < sheets.length; i++) {
      if (i > 0) doc.addPage("a3", "landscape");
      host.innerHTML = sheetToSvg(sheets[i]);
      const el = host.querySelector("svg")!;
      await (doc as unknown as { svg: (e: Element, o: object) => Promise<unknown> }).svg(el, { x: 0, y: 0, width: A3.w, height: A3.h });
    }
  } finally {
    host.remove();
  }
  return doc.output("blob");
}

// ---------------- DXF (R12, ASCII) ----------------

const LAYER_COLORS: Record<string, number> = {
  "MOLA-ESFERA": 8, "MOLA-BARRA": 9, "MOLA-PLACA": 252, "MOLA-LIGACAO": 8, "MOLA-EIXO": 1,
  "MOLA-TEXTO": 7, "MOLA-CARIMBO": 7, "MOLA-BASE": 7, "MOLA-DIAGONAL": 5,
};

/** Todas as folhas num DXF, lado a lado (folha n começa em x = (n−1)·440 mm). Unidades: mm de papel. */
export function sheetsToDxf(sheets: Sheet[]): string {
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), typeof v === "number" ? f(v) : v);
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$INSUNITS"); g(70, 4);
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 2);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, 0);
  g(0, "LTYPE"); g(2, "CENTER"); g(70, 0); g(3, "Center ____ _ ____"); g(72, 65); g(73, 4); g(40, 6.6);
  g(49, 4); g(49, -1); g(49, 0.6); g(49, -1);
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LAYER"); g(70, Object.keys(LAYER_COLORS).length);
  for (const [name, color] of Object.entries(LAYER_COLORS)) {
    g(0, "LAYER"); g(2, name); g(70, 0); g(62, color); g(6, name === "MOLA-EIXO" ? "CENTER" : "CONTINUOUS");
  }
  g(0, "ENDTAB");
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  sheets.forEach((sh, i) => {
    const ox = i * (A3.w + 20);
    const X = (x: number) => x + ox;
    const Y = (y: number) => A3.h - y;
    const border: Prim = { t: "poly", pts: [[0, 0], [A3.w, 0], [A3.w, A3.h], [0, A3.h]], closed: true, layer: "MOLA-CARIMBO" };
    for (const p of [border, ...sh.prims]) {
      switch (p.t) {
        case "line":
          g(0, "LINE"); g(8, p.layer); if (p.dash) g(6, "CENTER");
          g(10, X(p.a[0])); g(20, Y(p.a[1])); g(30, 0); g(11, X(p.b[0])); g(21, Y(p.b[1])); g(31, 0);
          break;
        case "circle":
          g(0, "CIRCLE"); g(8, p.layer); g(10, X(p.c[0])); g(20, Y(p.c[1])); g(30, 0); g(40, p.r);
          break;
        case "poly":
          g(0, "POLYLINE"); g(8, p.layer); g(66, 1); g(70, p.closed ? 1 : 0);
          for (const q of p.pts) (g(0, "VERTEX"), g(8, p.layer), g(10, X(q[0])), g(20, Y(q[1])), g(30, 0));
          g(0, "SEQEND"); g(8, p.layer);
          break;
        case "text": {
          const h = p.size * 0.72; // altura de maiúscula ≈ 0,72 do corpo
          const just = p.anchor === "middle" ? 1 : p.anchor === "end" ? 2 : 0;
          g(0, "TEXT"); g(8, p.layer); g(10, X(p.p[0])); g(20, Y(p.p[1])); g(30, 0); g(40, h); g(1, p.s);
          if (p.rot) g(50, -p.rot);
          if (just) (g(72, just), g(11, X(p.p[0])), g(21, Y(p.p[1])), g(31, 0));
          break;
        }
      }
    }
  });
  g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\n");
}
