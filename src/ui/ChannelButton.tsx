// Botão provisório no canto da tela (equipe, 17/11/2026): da versão oficial vai para a BETA (a 2.x do dia a dia)
// e da BETA volta para a oficial. A estrutura aberta vai junto (fica guardada no navegador, igual para as duas).
import { IS_BETA, otherChannelUrl } from "../channel";

export function ChannelButton() {
  const go = () => window.location.assign(otherChannelUrl());
  return IS_BETA ? (
    <button className="channel-btn beta" onClick={go} title="Você está na BETA: a 2.x em desenvolvimento, com as entregas de cada dia. Clique para voltar à versão oficial.">
      BETA <span className="channel-sub">· ir para a oficial</span>
    </button>
  ) : (
    <button className="channel-btn" onClick={go} title="Abrir a BETA: a 2.x em desenvolvimento, com as entregas de cada dia. A estrutura aberta vai junto.">
      BETA
    </button>
  );
}
