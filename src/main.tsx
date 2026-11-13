import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { currentAccount, dbNameFor, deviceLabel, fetchMe, LOCAL_DB, rememberNewOrigin, wasActivated } from "./account";
import { App } from "./App";
import { ToastHost } from "./components/ui";
import { db, ensureSeeded, getSettings, openDb, setSetting } from "./db";
import { MigrationError, migrateLegacy } from "./migrate";
import { MigrationFailed, Welcome } from "./screens/Pulso";
import { markSeenIfNew } from "./components/WhatsNew";
import { markAuthNeeded, startSync } from "./sync";
import { setLang } from "./i18n";
import "./styles.css";

function localLang(): "pt" | "en" {
  try {
    return localStorage.getItem("pulso.lang") === "en" ? "en" : "pt";
  } catch {
    return "pt";
  }
}

function rememberLang(l: "pt" | "en"): void {
  try {
    localStorage.setItem("pulso.lang", l);
  } catch {
    /* sem armazenamento: vale só nesta abertura */
  }
}

async function hasUserData(): Promise<boolean> {
  return (await db.sessions.count()) + (await db.measures.count()) + (await db.plans.count()) > 0;
}

async function boot() {
  // idioma antes de qualquer tela (também na de entrar, sem conta): cópia no aparelho, depois o ajuste da pessoa
  setLang(localLang());
  const account = currentAccount();
  // um banco local por pessoa; sem conta, o do aparelho ("pulso-local", onde cai a cópia do app antigo)
  const name = account ? dbNameFor(account.id) ?? `pulso-${account.id}` : LOCAL_DB;
  openDb(name);
  await ensureSeeded();
  // só vale o ajuste gravado de fato (aparelho novo ainda sem sincronizar fica com a cópia do aparelho)
  const saved = (await db.settings.get("lang"))?.value;
  if (saved === "pt" || saved === "en") {
    if (saved !== localLang()) rememberLang(saved);
    setLang(saved);
  }

  let failed: MigrationError | null = null;
  if (name === LOCAL_DB) {
    try {
      await migrateLegacy();
    } catch (e) {
      if (!(e instanceof MigrationError)) throw e;
      failed = e;
    }
  }

  // diagnóstico: permite inspecionar o banco pelo console (window.__treino.db)
  (window as unknown as { __treino: unknown }).__treino = { db, account };
  // pede armazenamento persistente para o navegador não apagar os dados sob pressão de espaço
  navigator.storage?.persist?.().catch(() => {});

  // conta ativa no aparelho: abre direto (offline também) e sincroniza em segundo plano
  if (account) {
    if (!(await getSettings()).name) await setSetting("name", account.name);
    startSync(deviceLabel(), account.id);
    // fotos de progresso: cópia no servidor (envia as novas, baixa as que faltam neste aparelho)
    import("./photosync").then((m) => m.syncPhotos()).catch(() => undefined);
    fetchMe()
      .then((me) => {
        // login vencido ou desconectado em outro aparelho: segue com os dados daqui e pede para entrar de novo
        if (!me.user || me.user.id !== account.id) markAuthNeeded();
        // Fase 6: o Pulse mudou de endereço → o Início mostra como passar para o novo
        rememberNewOrigin(me.newOrigin);
      })
      .catch(() => undefined);
  }
  // lembretes: reagenda os próximos 14 dias a cada abertura (silencioso se desligado/sem rede)
  import("./push").then((m) => m.syncReminders()).catch(() => undefined);

  // sem conta: aparelho novo (ou que já saiu da conta) → entrar; com dados do app antigo → app + "Ativar o Pulse"
  const gate = !failed && !account && (wasActivated() || !(await hasUserData()));
  if (gate) markSeenIfNew();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {failed ? (
        <div className="app solo"><MigrationFailed error={failed} /><ToastHost /></div>
      ) : gate ? (
        <div className="app solo"><Welcome /><ToastHost /></div>
      ) : (
        <App />
      )}
    </StrictMode>,
  );
}

boot();
