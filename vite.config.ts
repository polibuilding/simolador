/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base = nome do repositório, para o GitHub Pages (https://polibuilding.github.io/simolador/)
export default defineConfig({
  base: "/simolador/",
  plugins: [react()],
  test: { include: ["tests/**/*.test.ts"] },
});
