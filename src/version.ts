// Versão do siMOLAdor (vem do package.json pelo Vite). Histórico: CHANGELOG.md.
// 1.x = "geométrica" (montar e desenhar) · 2.x = "arquitetônica" (módulo extra ajustável) · 3.x = "de engenharia" (deformação, estaticidade, estabilidade)
declare const __APP_VERSION__: string;

export const VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
/** número mostrado no rodapé: sempre as três partes (X.Y.Z), como no CHANGELOG */
export const VERSION_SHORT = VERSION;
const major = Number(VERSION.split(".")[0]);
export const EDITION = major === 1 ? "geométrica" : major === 2 ? "arquitetônica" : major === 3 ? "de engenharia" : "";
