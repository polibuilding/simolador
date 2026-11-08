import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
// fonte embutida no programa (funciona sem internet; antes vinha do Google Fonts)
import "@fontsource-variable/archivo/wdth.css";
import "./styles.css";
import { readAppearance, resolvedTheme } from "./ui/prefs";
import { initFiles } from "./ui/files";
import { initPwa } from "./ui/pwa";
import { initI18n } from "./ui/i18n";
import { initErrorLog } from "./ui/errorlog";

// aparência: sem animações, painéis e paleta trocam na hora
if (!readAppearance().motion) document.documentElement.classList.add("no-motion");
// tema (1.10.4): as cores escuras ficam em styles.css, em :root[data-theme="dark"]
document.documentElement.dataset.theme = resolvedTheme();

initErrorLog();
initFiles();
initPwa();
initI18n();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
