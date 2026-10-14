import { Component, type ReactNode } from "react";
import { CONFIG_KEY, CONFIG_OFF, CONFIG_TEST, configState } from "../core/catalog";

/**
 * Se a tela quebrar (por exemplo, por uma configuração que passou nas checagens mas não funcionou),
 * mostra o que fazer em vez de uma página em branco. A estrutura fica salva no navegador.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const resetConfig = () => {
      try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) localStorage.setItem(CONFIG_OFF, raw);
        localStorage.removeItem(CONFIG_KEY);
        localStorage.removeItem(CONFIG_TEST);
      } catch {
        /* nada */
      }
      location.href = location.pathname;
    };
    return (
      <div className="crash">
        <div className="crash-card" role="alert">
          <h1>O siMOLAdor encontrou um erro</h1>
          <p>A estrutura está salva no navegador. {configState.applied ? "Como há configurações suas valendo, o mais provável é que alguma delas não tenha funcionado." : "Recarregue para continuar."}</p>
          <div className="crash-actions">
            {configState.applied && <button className="primary" onClick={resetConfig}>Voltar às configurações padrão</button>}
            <button onClick={() => location.reload()}>Recarregar</button>
          </div>
          <details>
            <summary>Detalhes</summary>
            <code>{error.message}</code>
          </details>
        </div>
      </div>
    );
  }
}
