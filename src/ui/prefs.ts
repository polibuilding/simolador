// Preferências da pessoa (não do projeto): aparência, perfil e o progresso do tutorial. Ficam no navegador e são lidas
// com cuidado: valor estranho vira o padrão (nunca quebram o programa).

export interface Appearance {
  /** cor da chapa de base */
  plate: "preta" | "grafite" | "clara";
  /** fundo da cena 3D */
  background: "claro" | "cinza";
  /** eixos X, Y, Z no canto da cena */
  axes: boolean;
  /** painéis e paleta deslizando (desligado: trocam na hora) */
  motion: boolean;
}

export interface Profile {
  name: string;
  team: string;
}

const APP_KEY = "simolador:aparencia";
const PROFILE_KEY = "simolador:perfil";
const TUTORIAL_KEY = "simolador:tutorial";

export const DEFAULT_APPEARANCE: Appearance = { plate: "preta", background: "claro", axes: true, motion: true };

const read = <T,>(key: string): Partial<T> => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as Partial<T>) : {};
  } catch {
    return {};
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* janela anônima ou bloqueio: fica só nesta sessão */
  }
};

export function readAppearance(): Appearance {
  const v = read<Appearance>(APP_KEY);
  return {
    plate: v.plate === "grafite" || v.plate === "clara" ? v.plate : "preta",
    background: v.background === "cinza" ? "cinza" : "claro",
    axes: v.axes !== false,
    motion: v.motion !== false,
  };
}
export const saveAppearance = (a: Appearance) => write(APP_KEY, a);

export function readProfile(): Profile {
  const v = read<Profile>(PROFILE_KEY);
  const clean = (s: unknown) => (typeof s === "string" ? s.slice(0, 60) : "");
  return { name: clean(v.name), team: clean(v.team) };
}
export const saveProfile = (p: Profile) => write(PROFILE_KEY, p);

/** passos do tutorial já feitos (os que não dá para ver no modelo: rigidez, pranchas) */
export function readTutorial(): Record<string, boolean> {
  const v = read<Record<string, boolean>>(TUTORIAL_KEY);
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x === true)) as Record<string, boolean>;
}
export function markTutorial(step: string) {
  const v = readTutorial();
  if (v[step]) return;
  write(TUTORIAL_KEY, { ...v, [step]: true });
}
export const resetTutorial = () => write(TUTORIAL_KEY, {});

/** cores da aparência */
export const PLATE_COLORS: Record<Appearance["plate"], { plate: string; grid: string }> = {
  preta: { plate: "#151719", grid: "#e9ecee" },
  grafite: { plate: "#5a6066", grid: "#d8dcdf" },
  clara: { plate: "#d9dcd8", grid: "#8c9590" },
};
export const BACKGROUNDS: Record<Appearance["background"], string> = { claro: "#eef1f0", cinza: "#d4d8d6" };

/** "Nome (Equipe)", só o que estiver preenchido; vazio: nada. */
export function profileLine(p: Profile): string | undefined {
  const name = p.name.trim();
  const team = p.team.trim();
  return name && team ? `${name} (${team})` : name || team || undefined;
}
