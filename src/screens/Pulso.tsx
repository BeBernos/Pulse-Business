import Dexie from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  bindAccount,
  changePassword,
  createDeviceCode,
  createInvite,
  currentAccount,
  dbNameFor,
  familyList,
  fetchMe,
  forgetAccount,
  hasLocalPasskey,
  joinWithInvite,
  listDevices,
  LOCAL_DB,
  newOrigin,
  localDbOwner,
  loginWithPassword,
  loginWithDeviceCode,
  loginWithPasskey,
  logoutServer,
  passkeySupported,
  registerPasskey,
  removePasskey,
  resetPassword,
  revokeLogin,
  setupAccount,
  type Account,
  type Devices,
} from "../account";
import { Icon } from "../components/Icon";
import { AsyncButton, BackHeader, Section, Segmented, Sheet, copyText, downloadText, toast } from "../components/ui";
import { db, exportBackup } from "../db";
import { fmtShort, isoDay } from "../lib/calendar";
import { deleteLegacy, exportLegacyBackup, LEGACY_KEEP_DAYS, legacyExists, mergeBackupFile, mergeLegacy, migrationReport, probeDevice, TALLY_LABELS, type DeviceProbe, type MigrationError, type Tally } from "../migrate";
import { back, go, href } from "../router";
import { localCounts, pendingCount, resumeSync, serverCounts, subscribeSync, syncInfo, syncNow, stopSync } from "../sync";

import { tn, tr } from "../i18n";
/* ================= estado da sincronização ================= */

export function useSync() {
  return useSyncExternalStore(subscribeSync, syncInfo);
}

const TABLE_LABELS: Record<string, string> = {
  sessions: "Treinos",
  sets: "Séries",
  plans: "Programas",
  measures: "Medidas",
  skips: "Dias pulados",
  flags: "Restrições",
  settings: "Ajustes",
  exercises: "Exercícios criados/editados",
  analyses: "Análises do Claude",
};

function ago(ms: number | null): string {
  if (!ms) return tr("nunca");
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return tr("agora");
  if (min < 60) return tr("há {0} min", min);
  if (min < 24 * 60) return tr("há {0} h", Math.round(min / 60));
  return fmtShort(isoDay(new Date(ms)));
}

const K_MOVE_DONE = "pulso.moveDismissed";

/** Fase 6: passo a passo para passar ao endereço novo, sem perder nada (fotos vão por backup). */
function MoveGuide({ to }: { to: string }) {
  const info = useSync();
  const pending = useLiveQuery(() => pendingCount(), [info.lastAt]);
  const photos = useLiveQuery(() => db.photos.count(), []);
  const host = to.replace(/^https?:\/\//, "");
  return (
    <div className="stack">
      <div className="title-md">{tr("O Pulse mudou de endereço")}</div>
      <p className="small muted" style={{ margin: 0 }}>
        {tr("Agora o app fica em")} <b>{host}</b>{tr(". Seus treinos já estão no servidor: no endereço novo é só entrar com a digital e tudo aparece. Este endereço continua funcionando enquanto você muda.")}
      </p>
      <div className="group">
        <div className="item">
          <span className="step-n">1</span>
          <div className="grow">
            <div className="t">{tr("Tudo enviado ao servidor")}</div>
            <div className="s">{pending === undefined ? tr("Conferindo…") : pending === 0 ? tr("Pronto ✓") : tr("Faltam {0} mudanças — toque em Sincronizar", pending)}</div>
          </div>
          {pending ? <AsyncButton className="btn sm" busyLabel={tr("Enviando…")} onClick={() => syncNow()}>{tr("Sincronizar")}</AsyncButton> : null}
        </div>
        {photos ? (
          <div className="item">
            <span className="step-n">2</span>
            <div className="grow">
              <div className="t">{tr("Fotos de progresso (")}{photos})</div>
              <div className="s">{tr("Com internet, elas sobem sozinhas para o servidor e aparecem no endereço novo. Se preferir uma cópia em arquivo: baixe o backup com fotos (no novo: Ajustes → Treinos antigos / diagnóstico → Restaurar de um arquivo).")}</div>
            </div>
            <AsyncButton className="btn sm" busyLabel={tr("Gerando…")} onClick={async () => downloadText(`pulse-backup-com-fotos-${isoDay()}.json`, await exportBackup(true))}>{tr("Baixar")}</AsyncButton>
          </div>
        ) : null}
        <div className="item">
          <span className="step-n">{photos ? 3 : 2}</span>
          <div className="grow">
            <div className="t">{tr("Abrir o endereço novo e instalar")}</div>
            <div className="s">{tr("No Chrome: menu ⋮ →")} <b>{tr("Instalar app")}</b> {tr("(ou Adicionar à tela inicial). Depois toque em")} <b>{tr("Entrar")}</b> {tr("e use a digital.")}</div>
          </div>
        </div>
      </div>
      <a className="btn primary block" href={to} target="_blank" rel="noopener">{tr("Abrir")} {host}</a>
      <button className="btn ghost block" onClick={() => { localStorage.setItem(K_MOVE_DONE, to); toast(tr("Combinado. Pode remover o ícone antigo da tela inicial.")); setTimeout(() => window.location.reload(), 600); }}>
        {tr("Já estou usando o novo — não mostrar mais")}
      </button>
      <div className="tiny dim">{tr("Nada é apagado aqui. Se algo der errado no endereço novo, este continua com tudo.")}</div>
    </div>
  );
}

/** Faixa no Início: mudança de endereço, ativar o Pulse, entrar de novo, erro de sincronização, relógio errado. */
export function SyncBanner() {
  const info = useSync();
  const account = currentAccount();
  const rescue = useLegacyRescue();
  const [rescueOpen, setRescueOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const moveTo = newOrigin();
  if (account && moveTo && localStorage.getItem(K_MOVE_DONE) !== moveTo)
    return (
      <>
        <button className="alert info small" style={{ marginBottom: 12, width: "100%", textAlign: "left" }} onClick={() => setMoveOpen(true)}>
          <Icon name="bolt" size={16} />
          <div className="grow"><b>{tr("O Pulse mudou de endereço.")}</b> {tr("Toque para passar para o novo (seus dados vão junto).")}</div>
          <Icon name="chevron" size={16} />
        </button>
        <Sheet open={moveOpen} onClose={() => setMoveOpen(false)}><MoveGuide to={moveTo} /></Sheet>
      </>
    );
  if (rescue)
    return (
      <>
        <button className="alert small" style={{ marginBottom: 12, width: "100%", textAlign: "left" }} onClick={() => setRescueOpen(true)}>
          <Icon name="info" size={16} />
          <div className="grow"><b>{tr("Encontrei")} {treinos(rescue.missingSessions)} {tr("do app antigo")}</b> {tr("que")} {rescue.missingSessions === 1 ? tr("não está") : tr("não estão")} {tr("aqui. Toque para ver.")}</div>
        </button>
        <Sheet open={rescueOpen} onClose={() => setRescueOpen(false)}><DataRescue /></Sheet>
      </>
    );
  if (!account && !import.meta.env.VITE_DEMO)
    return (
      <a className="alert info small" href={href("pulso")} style={{ marginBottom: 12, textDecoration: "none", color: "inherit" }}>
        <Icon name="bolt" size={16} />
        <div className="grow"><b>{tr("Ative o Pulse")}</b> {tr("— seus treinos guardados no servidor, no PC também, e entrada com a digital.")}</div>
        <Icon name="chevron" size={16} />
      </a>
    );
  if (info.status === "auth") return <ReLogin />;
  if (info.status === "offline")
    return (
      <div className="alert info small" style={{ marginBottom: 12 }}>
        <Icon name="info" size={16} /> <div>{tr("Sem internet: tudo fica salvo neste celular e vai para o servidor quando a conexão voltar.")}</div>
      </div>
    );
  if (info.status === "error")
    return (
      <div className="alert danger small" style={{ marginBottom: 12 }}>
        <Icon name="alert" size={16} /> <div className="grow">{tr("Não consegui sincronizar:")} {info.error}</div>
      </div>
    );
  if (info.skewMs)
    return (
      <div className="alert small" style={{ marginBottom: 12 }}>
        <Icon name="timer" size={16} /> <div>{tr("O relógio deste aparelho está")} {Math.round(Math.abs(info.skewMs) / 60000)} {tr("min")} {info.skewMs > 0 ? "adiantado" : "atrasado"}{tr(". Ajuste a hora automática do Android para a sincronização não confundir o que é mais novo.")}</div>
      </div>
    );
  return null;
}

function ReLogin() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="alert small" style={{ marginBottom: 12, width: "100%", textAlign: "left" }} onClick={() => setOpen(true)}>
        <Icon name="info" size={16} /> <div className="grow"><b>{tr("Entre de novo")}</b> {tr("para continuar sincronizando. Seus dados seguem aqui.")}</div>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <div className="title-md">{tr("Entrar de novo")}</div>
        <LoginForms
          onDone={async (user) => {
            const a = currentAccount();
            if (a && user.id !== a.id) {
              await logoutServer().catch(() => undefined);
              throw new Error(tr("Esta conta ({0}) não é a deste aparelho ({1}). Para trocar de pessoa: Ajustes → Sair.", user.name, a.name));
            }
            setOpen(false);
            resumeSync();
            toast(tr("Pronto, sincronizando"));
          }}
        />
      </Sheet>
    </>
  );
}

/* ================= formulários de conta ================= */

type Mode = "login" | "code" | "join" | "setup" | "reset";

function LoginForms({ onDone, initial }: { onDone: (user: Account) => void | Promise<void>; initial?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial ?? "login");
  const [state, setState] = useState<{ hasUsers: boolean; setupConfigured: boolean } | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    fetchMe()
      .then((s) => {
        setState(s);
        if (!initial && !s.hasUsers) setMode("setup");
      })
      .catch(() => setState(null));
  }, [initial]);

  const needsNew = mode !== "login" && mode !== "code";
  const mismatch = needsNew && password2 && password !== password2;

  async function submit() {
    if (needsNew && password !== password2) throw new Error(tr("As duas senhas não são iguais."));
    const r =
      mode === "code" ? await loginWithDeviceCode(code)
      : mode === "login" ? await loginWithPassword(name, password)
      : mode === "join" ? await joinWithInvite(code, name, password)
      : mode === "setup" ? await setupAccount(code, name, password)
      : await resetPassword(code, password, name || undefined);
    await onDone(r.user);
  }

  const modes: { value: Mode; label: string }[] = state && !state.hasUsers
    ? [{ value: "setup", label: tr("Criar conta") }]
    : [{ value: "login", label: tr("Entrar") }, { value: "code", label: tr("Código") }, { value: "join", label: tr("Convite") }, { value: "reset", label: tr("Esqueci") }];

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      {passkeySupported() && mode === "login" && state?.hasUsers !== false && (
        <>
          <AsyncButton className="btn primary lg block" busyLabel={tr("Aguardando a digital…")} onClick={async () => onDone((await loginWithPasskey()).user)}>
            <Icon name="check" size={18} /> {tr("Entrar com a digital")}
          </AsyncButton>
          <div className="tiny dim center">{tr("ou com nome e senha")}</div>
        </>
      )}
      {modes.length > 1 && <Segmented value={mode} options={modes} onChange={setMode} />}
      {mode === "setup" && (
        <div className="alert info small"><Icon name="info" size={16} /><div>{tr("Primeira conta (a principal). Use o")} <b>{tr("código de instalação")}</b> {tr("que você criou no Cloudflare (PULSO_SETUP).")}{state && !state.setupConfigured ? tr(" Ele ainda não foi criado — veja o passo a passo.") : ""}</div></div>
      )}
      {mode === "code" && <div className="small muted">{tr("No aparelho que já está conectado (o celular):")} <b>{tr("Ajustes → Conectar outro aparelho")}</b>{tr(". Digite aqui o código de 6 letras. Sem senha e sem Bluetooth; vale 10 minutos.")}</div>}
      {mode === "join" && <div className="small muted">{tr("Peça o convite para quem administra (Ajustes → Família → Gerar convite). Vale 48 h e uma vez só.")}</div>}
      {mode === "reset" && <div className="small muted">{tr("Use o código de redefinição gerado pela conta principal — ou, se você é a conta principal, o código de instalação + seu nome.")}</div>}
      {mode !== "login" && (
        <label className="field"><span>{mode === "setup" ? tr("Código de instalação") : mode === "join" ? tr("Código do convite") : mode === "code" ? tr("Código do aparelho conectado") : tr("Código")}</span>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" autoComplete="one-time-code" /></label>
      )}
      {mode !== "code" && (
        <label className="field"><span>{mode === "reset" ? tr("Nome (só com o código de instalação)") : tr("Nome")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" placeholder={mode === "join" ? tr("Ex.: Marina") : tr("Ex.: Rafael")} /></label>
      )}
      {mode !== "code" && (
        <label className="field"><span>{needsNew ? tr("Nova senha (mín. 8)") : tr("Senha")}</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={needsNew ? "new-password" : "current-password"} /></label>
      )}
      {needsNew && (
        <label className="field"><span>{tr("Repita a senha")}</span>
          <input className="input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" /></label>
      )}
      {mismatch && <div className="tiny" style={{ color: "var(--danger)" }}>{tr("As senhas não são iguais.")}</div>}
      <AsyncButton className="btn primary block" busyLabel={tr("Conferindo…")} disabled={mode === "code" ? code.replace(/[^a-z0-9]/gi, "").length < 6 : !password || (mode !== "reset" && mode !== "login" && !code) || !!mismatch} onClick={submit}>
        {mode === "login" || mode === "code" ? tr("Entrar") : mode === "join" ? tr("Criar minha conta") : mode === "setup" ? tr("Criar conta principal") : tr("Redefinir e entrar")}
      </AsyncButton>
    </div>
  );
}

/* ================= depois de entrar: de quem é o banco deste aparelho ================= */

async function localDataSummary(): Promise<{ sessions: number; measures: number; plans: number } | null> {
  const local = new Dexie(LOCAL_DB);
  if (!(await Dexie.exists(LOCAL_DB))) return null;
  try {
    await local.open();
    const count = async (t: string) => (local.tables.some((x) => x.name === t) ? local.table(t).count() : 0);
    const s = { sessions: await count("sessions"), measures: await count("measures"), plans: await count("plans") };
    return s.sessions + s.measures + s.plans ? s : null;
  } finally {
    local.close();
  }
}

/** Liga a conta ao banco certo e recarrega o app nele (com a etapa de digital + conferência). */
function enter(user: Account, dbName: string) {
  bindAccount(user, dbName);
  sessionStorage.setItem("pulso.welcome", "1");
  window.location.hash = "#/pulso";
  window.location.reload();
}

function AdoptOrEnter({ user, summary, onCancel }: { user: Account; summary: { sessions: number; measures: number; plans: number }; onCancel: () => void }) {
  return (
    <div className="stack">
      <div className="title-md">{tr("Estes dados são de")} {user.name}?</div>
      <div className="card small">
        {tr("Neste aparelho já existem")} <b>{summary.sessions} {tr("treinos")}</b>, {summary.measures} {tr("medidas e")} {summary.plans} {tr("programas (do app antigo).")}
      </div>
      <button className="btn primary lg block" onClick={() => enter(user, LOCAL_DB)}>{tr("Sim, são meus — enviar para minha conta")}</button>
      <button className="btn ghost block" onClick={() => enter(user, `pulso-${user.id}`)}>{tr("Não — começar")} {user.name} {tr("do zero aqui")}</button>
      <button className="btn ghost block" onClick={onCancel}>{tr("Voltar")}</button>
      <div className="tiny dim">{tr("Se escolher \"não\", os dados continuam guardados neste aparelho para quem for o dono.")}</div>
    </div>
  );
}

function useAfterLogin() {
  const [adopt, setAdopt] = useState<{ user: Account; summary: { sessions: number; measures: number; plans: number } } | null>(null);
  async function after(user: Account) {
    const known = dbNameFor(user.id);
    if (known) return enter(user, known);
    const summary = localDbOwner() ? null : await localDataSummary();
    if (summary) setAdopt({ user, summary });
    else enter(user, `pulso-${user.id}`);
  }
  return { adopt, setAdopt, after };
}

/* ================= tela de entrada (aparelho sem conta) ================= */

export function Welcome() {
  const { adopt, setAdopt, after } = useAfterLogin();
  return (
    <div className="screen full">
      <div style={{ margin: "48px 0 22px" }}>
        <div className="eyebrow">{tr("Bem-vindo ao")}</div>
        <div className="title-lg" style={{ fontSize: 40 }}>{tr("Pulse")}</div>
        <div className="small muted">{tr("Seu treino no celular e no PC, com a entrada pela digital.")}</div>
      </div>
      {adopt ? <AdoptOrEnter {...adopt} onCancel={() => setAdopt(null)} /> : <LoginForms onDone={after} />}
      <RescueLink />
    </div>
  );
}

/* ================= "meus treinos não apareceram": diagnóstico + resgate ================= */

function RescueLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn ghost block" style={{ marginTop: 18 }} onClick={() => setOpen(true)}>
        <Icon name="info" size={16} /> {tr("Meus treinos antigos não apareceram")}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <DataRescue />
      </Sheet>
    </>
  );
}

/** Banco aberto está vazio e há treinos do app antigo no aparelho? (faixa no Início) */
const DISMISS_KEY = "pulso.rescueDismissed";

/**
 * Faixa de resgate no Início: só quando há treinos do app antigo que **não** estão no banco aberto
 * (e a pessoa não dispensou o aviso).
 */
export function useLegacyRescue(): DeviceProbe | null {
  const sessions = useLiveQuery(() => db.sessions.count(), []);
  const [probe, setProbe] = useState<DeviceProbe | null>(null);
  useEffect(() => {
    if (sessions === undefined || localStorage.getItem(DISMISS_KEY)) return;
    probeDevice().then(setProbe).catch(() => undefined);
  }, [sessions]);
  if (localStorage.getItem(DISMISS_KEY)) return null;
  return probe && probe.missingSessions > 0 ? probe : null;
}

export const treinos = (n: number) => tn(n, "{0} treino", "{0} treinos");

/**
 * Mostra o que existe neste aparelho (só leitura) e oferece os dois resgates: copiar de novo do
 * app antigo, ou restaurar de um arquivo de backup. Grava no banco aberto agora (o da conta, se houver).
 */
export function DataRescue() {
  const [probe, setProbe] = useState<DeviceProbe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sessions = useLiveQuery(() => db.sessions.count(), []);
  useEffect(() => {
    probeDevice().then(setProbe).catch((e) => setError((e as Error).message));
  }, []);
  const oldSessions = probe?.legacy?.counts.sessions ?? 0;

  return (
    <div className="stack">
      <div className="title-md">{tr("Seus treinos antigos")}</div>
      <div className="small muted">{tr("Nada foi apagado: o app novo só lê o banco antigo. Aqui dá para ver o que existe neste aparelho e trazer os dados.")}</div>
      {!probe && !error && <div className="card small muted">{tr("Procurando…")}</div>}
      {probe && (
        <div className="group">
          <div className="item"><div className="grow t">{tr("App antigo neste aparelho")}</div><span className="num small">{probe.legacy ? tr("{0} treinos · {1} séries", oldSessions, probe.legacy.counts.sets ?? 0) : tr("não encontrado")}</span></div>
          <div className="item"><div className="grow t">{tr("No Pulse agora")}</div><span className="num small">{sessions ?? "…"} {tr("treinos")}</span></div>
          <div className="item"><div className="grow"><div className="t">{tr("Endereço")}</div><div className="s">{probe.origin}</div></div></div>
        </div>
      )}
      {error && <div className="alert danger small"><Icon name="alert" size={16} /><div>{tr(error)}</div></div>}

      {(probe?.missingSessions ?? 0) > 0 && (
        <AsyncButton className="btn primary block" busyLabel={tr("Copiando e conferindo…")} onClick={async () => {
          setError(null);
          try {
            const n = await mergeLegacy();
            toast(n ? tr("{0} registros trazidos do app antigo", n) : tr("Já estava tudo aqui"));
            setTimeout(() => window.location.reload(), 700);
          } catch (e) {
            setError((e as Error).message);
          }
        }}>{tr("Trazer")} {probe?.missingSessions === oldSessions ? `os ${treinos(oldSessions)}` : tr("o que falta ({0})", treinos(probe?.missingSessions ?? 0))} {tr("do app antigo")}</AsyncButton>
      )}
      {oldSessions > 0 && probe?.missingSessions === 0 && <div className="small" style={{ color: "var(--ok)" }}>{tr("Os")} {treinos(oldSessions)} {tr("do app antigo já estão aqui ✓")}</div>}
      {oldSessions > 0 && <div className="tiny dim">{tr("Só acrescenta o que falta: nada do que já está aqui é apagado ou trocado.")}</div>}
      {probe && !probe.legacy && (
        <div className="alert small"><Icon name="info" size={16} /><div>{tr("Não achei o app antigo")} <b>{tr("neste endereço")}</b>{tr(". Se você usava o app por outro link ou outro navegador (ex.: Samsung Internet), os dados estão lá. Use um arquivo de backup abaixo, ou abra o Pulse no mesmo navegador/endereço de antes.")}</div></div>
      )}
      <button className="btn block" onClick={() => fileRef.current?.click()}>
        <Icon name="upload" size={18} /> {tr("Restaurar de um arquivo de backup")}
      </button>
      <div className="tiny dim">{tr("Arquivo")} <b>{tr("treino-backup-….json")}</b> {tr("que o app antigo baixava (pasta Downloads). Só acrescenta o que falta.")}</div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setError(null);
        try {
          const n = await mergeBackupFile(await f.text());
          toast(n ? tr("{0} registros trazidos do backup", n) : tr("Já estava tudo aqui"));
          setTimeout(() => window.location.reload(), 700);
        } catch (err) {
          setError((err as Error).message);
        }
      }} />
      <button className="btn ghost block" onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); toast(tr("Aviso dispensado")); setTimeout(() => window.location.reload(), 500); }}>
        {tr("Não mostrar mais este aviso")}
      </button>
      <button className="btn ghost block" onClick={async () => {
        const text = JSON.stringify({ ...probe, pulsoDb: db.name, pulsoSessions: sessions, account: currentAccount()?.name ?? null, ua: navigator.userAgent }, null, 1);
        toast((await copyText(text)) ? tr("Diagnóstico copiado — cole para o Claude") : tr("Não consegui copiar"));
      }}>
        <Icon name="copy" size={16} /> {tr("Copiar diagnóstico")}
      </button>
    </div>
  );
}

/* ================= #/pulso: ativar (app antigo) ou concluir (digital + conferência) ================= */

export function PulsoScreen() {
  const account = currentAccount();
  return account ? <Finish account={account} /> : <Activate />;
}

function Activate() {
  const [step, setStep] = useState<1 | 2>(1);
  const [saved, setSaved] = useState(false);
  const { adopt, setAdopt, after } = useAfterLogin();
  return (
    <div className="screen">
      <BackHeader eyebrow={tr("Passo {0} de 2", step)} title={tr("Ativar o Pulse")} onBack={() => (step === 2 ? setStep(1) : back("inicio"))} />
      {step === 1 ? (
        <div className="stack">
          <div className="small muted">{tr("Primeiro, uma cópia de segurança de tudo como está hoje. Nada é apagado: o app antigo continua guardado neste celular.")}</div>
          <AsyncButton className="btn primary block" busyLabel={tr("Gerando…")} onClick={async () => { downloadText(`pulse-backup-${isoDay()}.json`, await exportBackup()); setSaved(true); toast(tr("Cópia baixada")); }}>
            <Icon name="download" size={18} /> {tr("Baixar cópia de segurança")}
          </AsyncButton>
          <AsyncButton className="btn tonal block" busyLabel={tr("Gerando (pode demorar)…")} onClick={async () => { downloadText(`pulse-backup-com-fotos-${isoDay()}.json`, await exportBackup(true)); setSaved(true); toast(tr("Cópia com fotos baixada")); }}>
            <Icon name="body" size={18} /> {tr("Cópia com fotos (arquivo maior)")}
          </AsyncButton>
          <button className="btn block" disabled={!saved} onClick={() => setStep(2)}>{saved ? tr("Continuar") : tr("Baixe a cópia para continuar")}</button>
        </div>
      ) : adopt ? (
        <AdoptOrEnter {...adopt} onCancel={() => setAdopt(null)} />
      ) : (
        <LoginForms onDone={after} />
      )}
    </div>
  );
}

function Finish({ account }: { account: Account }) {
  const welcome = sessionStorage.getItem("pulso.welcome") === "1";
  const [hasPasskey, setHasPasskey] = useState(hasLocalPasskey);
  const [check, setCheck] = useState<{ local: Record<string, number>; server: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const migration = useLiveQuery(migrationReport, []);

  async function runCheck() {
    setError(null);
    try {
      await syncNow();
      setCheck({ local: await localCounts(), server: await serverCounts() });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    runCheck();
  }, []);

  const keys = check ? [...new Set([...Object.keys(check.local), ...Object.keys(check.server)])] : [];
  const allOk = check && keys.every((k) => (check.local[k] ?? 0) === (check.server[k] ?? 0));

  return (
    <div className="screen">
      <BackHeader eyebrow={account.name} title={welcome ? tr("Pulse ativado") : tr("Conferência")} onBack={() => back("ajustes")} />
      {migration && (
        <>
          <Section title={tr("Cópia do app antigo")} action={<span className="tiny dim">{fmtShort(isoDay(new Date(migration.at)))}</span>} />
          <TallyTable before={migration.before} after={migration.after} />
        </>
      )}

      <Section title={tr("No servidor")} />
      {error ? (
        <div className="alert danger small"><Icon name="alert" size={16} /><div className="grow">{tr(error)}</div></div>
      ) : !check ? (
        <div className="card small muted">{tr("Enviando e conferindo…")}</div>
      ) : (
        <div className="group">
          {keys.map((k) => (
            <div key={k} className="item">
              <div className="grow t">{tr(TABLE_LABELS[k] ?? k)}</div>
              <span className="num">{check.local[k] ?? 0} {tr("aqui ·")} {check.server[k] ?? 0} {tr("no servidor")}</span>
              {(check.local[k] ?? 0) === (check.server[k] ?? 0) ? <Icon name="check" size={16} /> : <Icon name="alert" size={16} />}
            </div>
          ))}
          {!keys.length && <div className="item small muted">{tr("Ainda não há dados nesta conta.")}</div>}
        </div>
      )}
      {check && (allOk ? <div className="small" style={{ marginTop: 8, color: "var(--ok)" }}>{tr("Tudo no servidor ✓")}</div> : <div className="small" style={{ marginTop: 8, color: "var(--warn)" }}>{tr("Ainda há diferença — toque em conferir de novo.")}</div>)}
      <AsyncButton className="btn block" busyLabel={tr("Conferindo…")} onClick={runCheck}>{tr("Conferir de novo")}</AsyncButton>

      {passkeySupported() && !hasPasskey && (
        <>
          <Section title={tr("Digital / rosto")} />
          <div className="card stack">
            <div className="small">{tr("Cadastre a digital deste aparelho para entrar sem senha nas próximas vezes.")}</div>
            <AsyncButton className="btn primary block" busyLabel={tr("Aguardando a digital…")} onClick={async () => { await registerPasskey(); setHasPasskey(true); toast(tr("Digital cadastrada")); }}>{tr("Usar a digital neste aparelho")}</AsyncButton>
          </div>
        </>
      )}
      <button className="btn primary lg block" style={{ marginTop: 18 }} onClick={() => { sessionStorage.removeItem("pulso.welcome"); go("inicio"); }}>{tr("Ir para o app")}</button>
    </div>
  );
}

/** Gera o código para entrar no PC/aparelho novo sem senha (vale 10 min, uma vez). */
function DeviceCode() {
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!code) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [code]);
  const left = code ? Math.max(0, code.expiresAt - now) : 0;
  return (
    <>
      <Section title={tr("Conectar outro aparelho")} />
      <div className="card stack" style={{ gap: 10 }}>
        <div className="small">{tr("Para entrar no PC ou num aparelho novo")} <b>{tr("sem senha e sem Bluetooth")}</b>{tr(": gere o código aqui e, no outro aparelho, abra o Pulse →")} <b>{tr("Código")}</b> {tr("→ digite.")}</div>
        {code && left > 0 ? (
          <div className="center">
            <div className="code-big num">{code.code.slice(0, 3)} {code.code.slice(3)}</div>
            <div className="tiny muted">{tr("vale mais")} {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")} {tr("· uma vez só")}</div>
          </div>
        ) : null}
        <AsyncButton className={`btn ${code && left > 0 ? "" : "primary"} block`} busyLabel={tr("Gerando…")} onClick={async () => setCode(await createDeviceCode())}>{code && left > 0 ? tr("Gerar outro código") : tr("Gerar código")}</AsyncButton>
      </div>
    </>
  );
}

function TallyTable({ before, after }: { before: Tally; after: Tally }) {
  return (
    <div className="group">
      {(Object.keys(before) as (keyof Tally)[]).map((k) => (
        <div key={k} className="item">
          <div className="grow t">{tr(TALLY_LABELS[k])}</div>
          <span className="num small">{String(before[k] ?? "—")} → {String(after[k] ?? "—")}</span>
          {before[k] === after[k] ? <Icon name="check" size={16} /> : <Icon name="alert" size={16} />}
        </div>
      ))}
    </div>
  );
}

/* ================= falha na migração: nada segue até resolver ================= */

export function MigrationFailed({ error }: { error: MigrationError }) {
  return (
    <div className="screen full">
      <BackHeader eyebrow={tr("Pulse")} title={tr("A cópia não bateu")} onBack={() => window.location.reload()} />
      <div className="alert danger small"><Icon name="alert" size={16} /><div>{tr(error.message)}</div></div>
      <Section title={tr("Antes → depois")} />
      <TallyTable before={error.report.before} after={error.report.after} />
      <div className="stack" style={{ marginTop: 16 }}>
        <AsyncButton className="btn primary block" busyLabel={tr("Gerando…")} onClick={async () => { const t = await exportLegacyBackup(); if (t) downloadText(`treino-backup-antigo-${isoDay()}.json`, t); }}>
          <Icon name="download" size={18} /> {tr("Baixar cópia do app antigo")}
        </AsyncButton>
        <button className="btn block" onClick={async () => toast((await copyText(JSON.stringify(error.report, null, 1))) ? tr("Detalhes copiados — mande para o Claude") : tr("Não consegui copiar"))}>
          <Icon name="copy" size={18} /> {tr("Copiar detalhes")}
        </button>
        <button className="btn ghost block" onClick={() => window.location.reload()}>{tr("Tentar de novo")}</button>
      </div>
    </div>
  );
}

/* ================= Ajustes → Conta ================= */

export function AccountSettings() {
  const account = currentAccount();
  const info = useSync();
  const pending = useLiveQuery(pendingCount, []);
  const [devices, setDevices] = useState<Devices | null>(null);
  const [family, setFamily] = useState<(Account & { createdAt: number })[] | null>(null);
  const [invite, setInvite] = useState<{ code: string; expiresAt: number; name?: string } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const reload = () => {
    listDevices().then(setDevices).catch(() => undefined);
    if (account?.role === "admin") familyList().then((f) => setFamily(f.users)).catch(() => undefined);
  };
  useEffect(reload, [account?.id, account?.role]);

  if (!account)
    return (
      <>
        <Section title={tr("Conta")} />
        <a className="group item" href={href("pulso")} style={{ textDecoration: "none" }}>
          <span className="ico" style={{ ["--c" as string]: "var(--blue)" }}><Icon name="bolt" size={18} /></span>
          <div className="grow"><div className="t">{tr("Ativar o Pulse")}</div><div className="s">{tr("Conta com senha + digital, dados no servidor")}</div></div>
          <Icon name="chevron" size={16} />
        </a>
        <LegacyData />
      <RescueItem />
      </>
    );

  const statusText =
    info.status === "syncing" ? tr("Sincronizando…")
    : info.status === "offline" ? tr("Sem internet — envia quando voltar")
    : info.status === "auth" ? tr("Entre de novo para sincronizar")
    : info.status === "error" ? tr("Erro: {0}", tr(info.error ?? ""))
    : tr("Sincronizado {0}", ago(info.lastAt));

  return (
    <>
      <Section title={tr("Conta")} action={<span className="tiny dim">{account.role === "admin" ? "principal" : tr("família")}</span>} />
      <div className="group">
        <div className="item">
          <span className="ico" style={{ ["--c" as string]: "var(--blue)" }}><Icon name="history" size={18} /></span>
          <div className="grow"><div className="t">{account.name}</div><div className="s">{statusText}{pending ? tr(" · {0} a enviar", pending) : ""}</div></div>
          <AsyncButton className="btn sm" busyLabel="…" onClick={async () => { await syncNow(); toast(tr("Sincronizado")); }}>{tr("Agora")}</AsyncButton>
        </div>
        <a className="item" href={href("pulso")}>
          <div className="grow"><div className="t">{tr("Conferir dados no servidor")}</div><div className="s">{tr("Quantos registros há aqui e lá")}</div></div>
          <Icon name="chevron" size={16} />
        </a>
        {passkeySupported() && (
          <AsyncButton className="item" busyLabel={tr("Aguardando a digital…")} onClick={async () => { await registerPasskey(); toast(tr("Digital cadastrada")); reload(); }}>
            <div className="grow" style={{ textAlign: "left" }}><div className="t">{tr("Cadastrar a digital neste aparelho")}</div><div className="s">{tr("Entrar sem senha (no PC: Windows Hello ou o celular)")}</div></div>
          </AsyncButton>
        )}
        <button className="item" onClick={() => setPwOpen(true)}><div className="grow t" style={{ textAlign: "left" }}>{tr("Trocar senha")}</div></button>
      </div>
      <DeviceCode />

      {devices && (
        <>
          <Section title={tr("Aparelhos conectados")} />
          <div className="group">
            {devices.logins.map((l) => (
              <div key={l.id} className="item">
                <div className="grow"><div className="t">{l.device}{l.current ? tr(" (este)") : ""}</div><div className="s">{l.method === "passkey" ? tr("digital") : l.method === "code" ? tr("código do celular") : tr("senha")} {tr("· visto")} {ago(l.lastSeen)}</div></div>
                {!l.current && <AsyncButton className="btn sm" busyLabel="…" onClick={async () => { await revokeLogin(l.id); toast(tr("Aparelho desconectado")); reload(); }}>{tr("Desconectar")}</AsyncButton>}
              </div>
            ))}
            {devices.passkeys.map((p) => (
              <div key={p.id} className="item">
                <div className="grow"><div className="t">{tr("Digital:")} {tr(p.label)}</div><div className="s">{tr("usada")} {ago(p.lastUsedAt)}</div></div>
                <AsyncButton className="btn sm" busyLabel="…" onClick={async () => { await removePasskey(p.id); toast(tr("Digital removida")); reload(); }}>{tr("Remover")}</AsyncButton>
              </div>
            ))}
          </div>
        </>
      )}

      {account.role === "admin" && family && (
        <>
          <Section title={tr("Família")} />
          <div className="group">
            {family.map((u) => (
              <div key={u.id} className="item">
                <div className="grow"><div className="t">{u.name}</div><div className="s">{u.role === "admin" ? "principal" : tr("família")} {tr("· desde")} {fmtShort(isoDay(new Date(u.createdAt)))}</div></div>
                {u.id !== account.id && <AsyncButton className="btn sm" busyLabel="…" onClick={async () => setInvite(await createInvite("reset", u.id))}>{tr("Redefinir senha")}</AsyncButton>}
              </div>
            ))}
            <AsyncButton className="item" busyLabel={tr("Gerando…")} onClick={async () => setInvite(await createInvite("join"))}>
              <Icon name="plus" size={18} /> <span className="t">{tr("Gerar convite (conta nova)")}</span>
            </AsyncButton>
          </div>
        </>
      )}

      <div className="group" style={{ marginTop: 12 }}>
        <button className="item" onClick={() => setLeaving(true)}><div className="grow t" style={{ textAlign: "left", color: "var(--danger)" }}>{tr("Sair deste aparelho")}</div></button>
      </div>
      <LegacyData />
      <RescueItem />

      <Sheet open={!!invite} onClose={() => setInvite(null)} footer={<button className="btn primary block" onClick={async () => { toast((await copyText(invite!.code)) ? tr("Código copiado") : tr("Não consegui copiar")); }}>{tr("Copiar código")}</button>}>
        <div className="title-md">{invite?.name ? tr("Redefinir a senha de {0}", invite.name) : tr("Convite")}</div>
        <div className="big num center" style={{ letterSpacing: ".12em", margin: "14px 0" }}>{invite?.code}</div>
        <p className="small muted">
          {invite?.name ? tr("No celular de {0}: abrir o Pulse → Esqueci → este código → senha nova.", invite.name) : tr("No celular da pessoa: abrir o Pulse → Convite → este código → nome e senha dela.")} {tr("Vale 48 h, uma vez só. Você não vê a senha.")}
        </p>
      </Sheet>
      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
      <LeaveSheet open={leaving} onClose={() => setLeaving(false)} pending={pending ?? 0} lastAt={info.lastAt} />
    </>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  return (
    <Sheet open={open} onClose={onClose} footer={<AsyncButton className="btn primary block" busyLabel={tr("Trocando…")} disabled={pw.length < 8} onClick={async () => { await changePassword(cur, pw); toast(tr("Senha trocada · outros aparelhos desconectados")); onClose(); }}>{tr("Trocar")}</AsyncButton>}>
      <div className="title-md">{tr("Trocar senha")}</div>
      <div className="stack" style={{ marginTop: 12 }}>
        <label className="field"><span>{tr("Senha atual")}</span><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>
        <label className="field"><span>{tr("Nova senha (mín. 8)")}</span><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
        <div className="tiny dim">{tr("Os outros aparelhos saem e entram de novo com a digital ou a senha nova.")}</div>
      </div>
    </Sheet>
  );
}

function LeaveSheet({ open, onClose, pending, lastAt }: { open: boolean; onClose: () => void; pending: number; lastAt: number | null }) {
  const canWipe = pending === 0 && !!lastAt;
  async function leave(wipe: boolean) {
    await logoutServer().catch(() => undefined);
    stopSync();
    const name = db.name;
    forgetAccount({ unbindDb: wipe });
    if (wipe) {
      db.close();
      await Dexie.delete(name);
    }
    window.location.hash = "#/inicio";
    window.location.reload();
  }
  return (
    <Sheet open={open} onClose={onClose} footer={
      <>
        <AsyncButton className="btn block" busyLabel={tr("Saindo…")} onClick={() => leave(false)}>{tr("Sair (dados ficam neste aparelho)")}</AsyncButton>
        <AsyncButton className="btn danger block" busyLabel={tr("Apagando…")} disabled={!canWipe} onClick={() => leave(true)}>{tr("Sair e apagar os dados deste aparelho")}</AsyncButton>
        <button className="btn ghost block" onClick={onClose}>{tr("Cancelar")}</button>
      </>
    }>
      <div className="title-md">{tr("Sair deste aparelho?")}</div>
      {pending > 0 ? (
        <div className="alert danger small" style={{ marginTop: 10 }}><Icon name="alert" size={16} /><div>{pending} {tr("mudanças ainda não chegaram ao servidor. Sincronize antes de apagar.")}</div></div>
      ) : (
        <p className="small muted">{tr("Tudo está no servidor. Para entrar de novo: digital ou senha.")}</p>
      )}
    </Sheet>
  );
}

function RescueItem() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="group" style={{ marginTop: 12 }}>
        <button className="item" onClick={() => setOpen(true)}>
          <div className="grow" style={{ textAlign: "left" }}><div className="t">{tr("Treinos antigos / diagnóstico")}</div><div className="s">{tr("Ver o que existe neste aparelho, copiar do app antigo ou de um backup")}</div></div>
          <Icon name="chevron" size={16} />
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)}><DataRescue /></Sheet>
    </>
  );
}

/** O banco do app antigo (fica guardado; apagar só à mão, depois de 30 dias da migração). */
function LegacyData() {
  const report = useLiveQuery(migrationReport, []);
  const [exists, setExists] = useState(false);
  useEffect(() => {
    legacyExists().then(setExists).catch(() => undefined);
  }, []);
  if (!exists || !report) return null;
  const days = Math.floor((Date.now() - report.at) / 86_400_000);
  const allowed = days >= LEGACY_KEEP_DAYS;
  return (
    <div className="group" style={{ marginTop: 12 }}>
      <div className="item">
        <div className="grow"><div className="t">{tr("Dados do app antigo")}</div><div className="s">{tr("Copiados em")} {fmtShort(isoDay(new Date(report.at)))} {tr("· guardados como garantia")}{allowed ? "" : tr(" · apagar libera em {0} dias", LEGACY_KEEP_DAYS - days)}</div></div>
        <AsyncButton className="btn sm" busyLabel="…" disabled={!allowed} onClick={async () => { await deleteLegacy(); setExists(false); toast(tr("Dados antigos apagados")); }}>{tr("Apagar")}</AsyncButton>
      </div>
    </div>
  );
}
