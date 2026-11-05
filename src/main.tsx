import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
// fonte embutida no programa (funciona sem internet; antes vinha do Google Fonts)
import "@fontsource-variable/archivo/wdth.css";
import "./styles.css";
import { readAppearance } from "./ui/prefs";
import { initFiles } from "./ui/files";
import { initPwa } from "./ui/pwa";
import { initErrorLog } from "./ui/errorlog";

// aparência: sem animações, painéis e paleta trocam na hora
if (!readAppearance().motion) document.documentElement.classList.add("no-motion");

initErrorLog();
initFiles();
initPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
