/// <reference types="vitest" />
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// versão do programa (package.json) aparece no rodapé; histórico em CHANGELOG.md
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// base = nome do repositório, para o GitHub Pages (https://polibuilding.github.io/simolador/)
export default defineConfig({
  base: "/simolador/",
  plugins: [react()],
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
