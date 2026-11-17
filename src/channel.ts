// Canal da publicação: "oficial" (https://polibuilding.github.io/simolador/) ou "beta" (…/simolador/beta/).
// A oficial é a versão que a equipe diz que é a atual; a beta recebe as entregas do dia a dia até virar a oficial.
// O canal vem do build (SIMOLADOR_CANAL=beta, ver vite.config.ts e .github/workflows/pages.yml).
declare const __CANAL__: string;

export const CANAL: "oficial" | "beta" = typeof __CANAL__ === "string" && __CANAL__ === "beta" ? "beta" : "oficial";
export const IS_BETA = CANAL === "beta";

/** Endereço da outra versão (a beta mora na pasta beta/ da oficial). */
export function otherChannelUrl(): string {
  const base = import.meta.env.BASE_URL; // "/simolador/" ou "/simolador/beta/"
  return IS_BETA ? base.replace(/beta\/$/, "") : `${base}beta/`;
}
