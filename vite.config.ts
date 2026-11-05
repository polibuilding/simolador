/// <reference types="vitest" />
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// versão do programa (package.json) aparece no rodapé; histórico em CHANGELOG.md
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/**
 * Funcionar sem internet (1.10.0): depois do build, escreve dist/sw.js com a lista de TODOS os arquivos do site
 * (código, pranchas, PDF, fontes, logos, ícones) e um carimbo da versão. O service worker guarda tudo na primeira
 * visita; a cada versão nova, o carimbo muda, o navegador baixa a lista nova e o programa avisa "nova versão".
 */
function offlinePlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "simolador-sem-internet",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (!/\.(map|txt)$/.test(f) && f !== "sw.js" && f !== "sw-modelo.js") files.push(relative(outDir, p).split("\\").join("/"));
        }
      };
      walk(outDir);
      files.sort();
      const hash = createHash("sha256");
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const stamp = `${pkg.version}-${hash.digest("hex").slice(0, 10)}`;
      const tpl = readFileSync(new URL("./scripts/sw-modelo.js", import.meta.url), "utf8");
      writeFileSync(join(outDir, "sw.js"), tpl.replace("__CARIMBO__", stamp).replace("__VERSAO__", pkg.version).replace("[/*__ARQUIVOS__*/]", JSON.stringify(["./", ...files.filter((f) => f !== "index.html")], null, 0)));
    },
  };
}

// base = nome do repositório, para o GitHub Pages (https://polibuilding.github.io/simolador/)
export default defineConfig({
  base: "/simolador/",
  plugins: [react(), offlinePlugin()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // bibliotecas em arquivos à parte: mudam pouco, então o navegador guarda e, a cada versão nova, só o código do
  // programa é baixado de novo. As pranchas (e o PDF) vêm sob demanda, quando são abertas.
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/three/")) return "three";
          if (id.includes("@react-three") || id.includes("three-stdlib") || id.includes("three-mesh-bvh") || id.includes("camera-controls")) return "r3f";
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/") || id.includes("zustand")) return "react";
          return undefined;
        },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
