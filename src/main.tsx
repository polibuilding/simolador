import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./styles.css";
import { readAppearance } from "./ui/prefs";

// aparência: sem animações, painéis e paleta trocam na hora
if (!readAppearance().motion) document.documentElement.classList.add("no-motion");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
