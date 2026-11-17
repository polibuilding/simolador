// Service worker do siMOLAdor (gerado no build a partir de scripts/sw-modelo.js; não edite dist/sw.js).
// Guarda todos os arquivos do programa para ele abrir sem internet. Quando há versão nova, ela fica esperando
// até o usuário clicar em "Atualizar" (o programa manda a mensagem "atualizar").
const CARIMBO = "__CARIMBO__";
// canal: "oficial" (…/simolador/) ou "beta" (…/simolador/beta/). Cada um tem o seu guardado e não apaga o do outro.
const CANAL = "__CANAL__";
const PREFIXO = CANAL === "beta" ? "simolador-beta-" : "simolador-";
const VERSAO = "__VERSAO__";
const CACHE = `${PREFIXO}${CARIMBO}`;
const ARQUIVOS = [/*__ARQUIVOS__*/];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((f) => new Request(f, { cache: "reload" })))),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) =>
        Promise.all(
          ks
            .filter((k) => k.startsWith(PREFIXO) && k !== CACHE && !(CANAL !== "beta" && k.startsWith("simolador-beta-")))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "atualizar") self.skipWaiting();
  if (e.data === "versao") e.source?.postMessage({ versao: VERSAO, carimbo: CARIMBO });
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // a oficial não mexe na BETA (pasta beta/, que tem o seu próprio service worker)
  if (CANAL !== "beta" && url.pathname.startsWith(new URL("beta/", self.registration.scope).pathname)) return;
  // a página: rede primeiro (pega a versão nova se houver), e a guardada se estiver sem internet
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.open(CACHE).then((c) => c.match("./", { ignoreSearch: true }).then((r) => r || c.match("index.html")))));
    return;
  }
  // o resto: o guardado primeiro (os nomes mudam a cada versão), a rede se faltar
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true })).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
