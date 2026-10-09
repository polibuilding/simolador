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
  test: { include: ["tests/**/*.test.ts"] },
});
