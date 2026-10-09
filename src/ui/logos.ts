// Logos do carimbo das pranchas: arquivos em public/logos/ (logo-mola e logo-grupo, em .svg, .png ou .jpg).
// Viram PNG (fundo transparente) para sair iguais na tela, no SVG e no PDF.
export interface Logo {
  url: string;
  /** largura / altura */
  aspect: number;
}

const NAMES = ["logo-mola", "logo-grupo"];
const EXTS = ["svg", "png", "jpg"];

async function loadOne(name: string): Promise<Logo | null> {
  for (const ext of EXTS) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}logos/${name}.${ext}`, { cache: "no-cache" });
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) continue;
      const blobUrl = URL.createObjectURL(await res.blob());
      try {
        const img = new Image();
        img.src = blobUrl;
        await img.decode();
        const w = img.naturalWidth || 600;
        const h = img.naturalHeight || 300;
        // rasteriza em boa resolução (cerca de 600 px na maior dimensão)
        const k = 600 / Math.max(w, h);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * k);
        canvas.height = Math.round(h * k);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        return { url: canvas.toDataURL("image/png"), aspect: w / h };
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      /* tenta a próxima extensão */
    }
  }
  return null;
}

let cache: Promise<Logo[]> | null = null;
export function loadLogos(): Promise<Logo[]> {
  cache ??= Promise.all(NAMES.map(loadOne)).then((l) => l.filter((x): x is Logo => !!x));
  return cache;
}
