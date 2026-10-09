// Versão do siMOLAdor (vem do package.json pelo Vite). Histórico: CHANGELOG.md.
// 1.x = "geométrica" (montar e desenhar) · 2.x = "arquitetônica" (módulo extra ajustável) · 3.x = "de engenharia" (deformação, estaticidade, estabilidade)
declare const __APP_VERSION__: string;

export const VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
/** "1.5" (sem o último número quando é zero) */
export const VERSION_SHORT = VERSION.replace(/\.0$/, "");
const major = Number(VERSION.split(".")[0]);
export const EDITION = major === 1 ? "geométrica" : major === 2 ? "arquitetônica" : major === 3 ? "de engenharia" : "";
