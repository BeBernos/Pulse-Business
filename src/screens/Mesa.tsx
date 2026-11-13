import { BackHeader } from "../components/ui";
import { back } from "../router";
import { tr } from "../i18n";

/** Endereço da Mesa (app de dieta da família, Worker "plano-familia", repo BeBernos/Mesa-Business). */
export const MESA_URL = "https://plano-familia.example.workers.dev/";

/**
 * A Mesa aberta dentro do Pulse. Ela só aceita ser emoldurada pelo Pulse (frame-ancestors no lado dela) e o login
 * lá dentro é separado do app instalado (cookie "particionado"): na primeira vez pede a senha da família.
 */
export function MesaScreen() {
  return (
    <div className="screen mesa">
      <BackHeader
        eyebrow={tr("Dieta da família")}
        title={tr("Mesa")}
        onBack={() => back()}
        right={<a className="btn sm" href={MESA_URL} target="_blank" rel="noopener">{tr("Abrir fora")}</a>}
      />
      <iframe
        className="mesa-frame"
        src={MESA_URL}
        title={tr("Mesa — dieta da família")}
        allow="publickey-credentials-get *; publickey-credentials-create *; clipboard-read; clipboard-write; screen-wake-lock"
      />
    </div>
  );
}
