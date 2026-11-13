import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { applyLang, syncNow } from "../sync";
import { AsyncButton, BackHeader, Section, Segmented, Sheet, Stepper, Toggle, copyText, downloadText, toast, toastError } from "../components/ui";
import { currentLoads, db, exportBackup, importBackup, importPlan, MEASURE_TYPES, setSetting } from "../db";
import { useActivePlan, useSettings } from "../hooks";
import { planDiff, type PlanDiff } from "../lib/insights";
import { fmtShort, isoDay, weekRange } from "../lib/calendar";
import { parsePlan, type ParseResult } from "../lib/plan";
import { back, go, href } from "../router";
import { disableReminders, enableReminders, pushSupported, syncReminders, testReminder } from "../push";
import type { AppSettings } from "../db";
import { libraryForPrompt, PROMPT_FOR_CLAUDE } from "../lib/claudePrompt";
import { loadsForPrompt } from "../lib/analytics";
import { currentAccount } from "../account";
import { AccountSettings } from "./Pulso";
import { ReleaseNotes } from "../components/WhatsNew";
import { TermText } from "../components/Term";
import { GLOSSARY, type TermId } from "../lib/glossary";

import { lang, tr, type Lang } from "../i18n";
async function markBackup() {
  await setSetting("lastBackupAt", Date.now());
  syncReminders().catch(() => undefined);
}

function Reminders() {
  const s = useSettings();
  if (!s) return null;
  const set = async <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    await setSetting(k, v);
    syncReminders().catch((e) => toast(String(e.message ?? e)));
  };
  return (
    <>
      {!pushSupported() ? (
        <div className="card small muted">{tr("Este navegador não suporta notificações. Instale o app pelo Chrome no Android.")}</div>
      ) : (
        <div className="group">
          <div className="item">
            <span className="ico" style={{ ["--c" as string]: "var(--amber)" }}><Icon name="bolt" size={18} /></span>
            <div className="grow"><div className="t">{tr("Notificações")}</div><div className="s">{s.remindOn ? tr("Ativas neste celular") : tr("Desligadas")}</div></div>
            <Toggle label={tr("Lembretes")} checked={s.remindOn} onChange={async (on) => {
              try {
                if (on) toast(tr("Lembretes ativos · {0} agendados", await enableReminders()));
                else { await disableReminders(); toast(tr("Lembretes desligados")); }
              } catch (e) { toastError(e); }
            }} />
          </div>
          {s.remindOn && (
            <>
              <div className="item">
                <div className="grow"><div className="t">{tr("Treino do dia")}</div><div className="s">{tr("Avisa no horário, nos dias com treino")}</div></div>
                <input className="input" type="time" style={{ width: 110, minHeight: 40 }} value={s.remindTime} disabled={!s.remindWorkout} onChange={(e) => e.target.value && set("remindTime", e.target.value)} />
                <Toggle label={tr("Treino do dia")} checked={s.remindWorkout} onChange={(v) => set("remindWorkout", v)} />
              </div>
              <div className="item">
                <div className="grow"><div className="t">{tr("Esqueceu de registrar?")}</div><div className="s">{tr("À noite, se o treino do dia não foi registrado")}</div></div>
                <input className="input" type="time" style={{ width: 110, minHeight: 40 }} value={s.remindForgotTime} disabled={!s.remindForgot} onChange={(e) => e.target.value && set("remindForgotTime", e.target.value)} />
                <Toggle label={tr("Esqueci")} checked={s.remindForgot} onChange={(v) => set("remindForgot", v)} />
              </div>
              <div className="item" style={{ flexWrap: "wrap" }}>
                <div className="grow"><div className="t">{tr("Dia de pesagem")}</div><div className="s">{tr("Avisa nos dias escolhidos, se ainda não pesou")}</div></div>
                <input className="input" type="time" style={{ width: 110, minHeight: 40 }} value={s.weighTime} disabled={!s.remindWeigh} onChange={(e) => e.target.value && set("weighTime", e.target.value)} />
                <Toggle label={tr("Dia de pesagem")} checked={s.remindWeigh} onChange={(v) => set("remindWeigh", v)} />
                {s.remindWeigh && (
                  <div className="weigh-days" style={{ flexBasis: "100%" }}>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <button key={d} aria-pressed={s.weighDays.includes(d)} onClick={() => set("weighDays", s.weighDays.includes(d) ? s.weighDays.filter((x) => x !== d) : [...s.weighDays, d].sort())}>{tr(["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d])}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="item">
                <div className="grow"><div className="t">{tr("Backup semanal")}</div><div className="s">{tr("Domingo 20h, se o último backup tiver mais de 7 dias")}</div></div>
                <Toggle label={tr("Backup")} checked={s.remindBackup} onChange={(v) => set("remindBackup", v)} />
              </div>
              <AsyncButton className="item" busyLabel={tr("Enviando…")} onClick={async () => { await testReminder(); toast(tr("Notificação de teste enviada")); }}>
                <Icon name="play" size={18} /> <span className="t">{tr("Enviar notificação de teste")}</span>
              </AsyncButton>
            </>
          )}
        </div>
      )}
    </>
  );
}

type Sec = "conta" | "perfil" | "treino" | "lembretes" | "familia" | "claude" | "dados" | "app";
const SECTIONS: { id: Sec; title: string; icon: Parameters<typeof Icon>[0]["name"]; c: string }[] = [
  { id: "conta", title: "Conta e aparelhos", icon: "link", c: "var(--accent)" },
  { id: "perfil", title: "Perfil", icon: "body", c: "var(--blue)" },
  { id: "treino", title: "Treino e academia", icon: "dumbbell", c: "var(--accent)" },
  { id: "lembretes", title: "Lembretes", icon: "bolt", c: "var(--amber)" },
  { id: "familia", title: "Família", icon: "scale", c: "var(--amber)" },
  { id: "claude", title: "Claude", icon: "note", c: "var(--violet)" },
  { id: "dados", title: "Seus dados", icon: "download", c: "var(--blue)" },
  { id: "app", title: "Sobre o app", icon: "info", c: "var(--text-2)" },
];

/** Ajustes: menu curto com um resumo por linha; cada assunto abre a própria página (#/ajustes/<assunto>). */
export function Settings({ sec }: { sec?: string }) {
  const settings = useSettings();
  const counts = useLiveQuery(async () => ({ sessions: await db.sessions.where("status").equals("done").count(), sets: await db.sets.filter((s) => s.done).count(), measures: await db.measures.count() }), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [restore, setRestore] = useState<string | null>(null);
  const [news, setNews] = useState(false);
  const [terms, setTerms] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [connector, setConnector] = useState(false);
  if (!settings) return <div className="screen" />;

  const page = SECTIONS.find((x) => x.id === sec);
  if (!page) {
    const acc = currentAccount();
    const summary: Record<Sec, string> = {
      conta: acc ? tr("Conectado como {0}", acc.name) : tr("Guardar seus dados no servidor"),
      perfil: [settings.name, settings.heightCm ? `${settings.heightCm} cm` : "", lang().toUpperCase()].filter(Boolean).join(" · "),
      treino: tr("Descanso {0} s · barra {1} kg", settings.defaultRest, settings.barKg),
      lembretes: settings.remindOn ? tr("Ligados neste celular") : tr("Desligados"),
      familia: tr("Mesa: peso e “Treinou hoje?”"),
      claude: tr("Conector, importar plano, instruções"),
      dados: tr("{0} treinos · backup e lixeira", counts?.sessions ?? 0),
      app: tr("v{0} · novidades, feedback, termos", __APP_VERSION__),
    };
    return (
      <div className="screen">
        <BackHeader eyebrow={tr("App")} title={tr("Ajustes")} onBack={() => back("inicio")} />
        <div className="group">
          {SECTIONS.map((x) => (
            <a key={x.id} className="item" href={href("ajustes", x.id)}>
              <span className="ico" style={{ ["--c" as string]: x.c }}><Icon name={x.icon} size={18} /></span>
              <div className="grow"><div className="t">{tr(x.title)}</div><div className="s">{summary[x.id]}</div></div>
              <Icon name="chevron" size={16} />
            </a>
          ))}
        </div>
        <p className="tiny dim center" style={{ marginTop: 24 }}>{tr("Pulse · v")}{__APP_VERSION__}</p>
      </div>
    );
  }
  const show = (k: Sec) => page.id === k;

  return (
    <div className="screen">
      <BackHeader eyebrow={tr("Ajustes")} title={tr(page.title)} onBack={() => back("ajustes")} />

      {show("conta") && <AccountSettings />}

      {show("perfil") && (
      <div className="group">
        <label className="item">
          <div className="grow t">{tr("Nome")}</div>
          <input className="input" style={{ width: 150, minHeight: 40, textAlign: "right" }} defaultValue={settings.name} onBlur={(e) => e.target.value.trim() && setSetting("name", e.target.value.trim())} />
        </label>
        <div className="item">
          <div className="grow"><div className="t">{tr("Altura")}</div><div className="s">{tr("Para % de gordura, FFMI e cintura/altura")}</div></div>
          <div style={{ width: 150 }}><Stepper label={tr("Altura")} value={settings.heightCm ?? 175} min={120} max={230} onChange={(v) => setSetting("heightCm", v)} /></div>
        </div>
        <div className="item">
          <div className="grow"><div className="t">{tr("Sexo")}</div><div className="s">{tr("As fórmulas de % de gordura e as faixas mudam")}</div></div>
          <div style={{ width: 150 }}><Segmented value={settings.sex ?? "m"} options={[{ value: "m", label: tr("Homem") }, { value: "f", label: tr("Mulher") }]} onChange={(v) => setSetting("sex", v as "m" | "f")} /></div>
        </div>
        <div className="item">
          <div className="grow"><div className="t">Idioma · Language</div><div className="s">{tr("Instruções e relatórios para o Claude continuam em português")}</div></div>
          <div style={{ width: 150 }}><Segmented value={lang()} options={[{ value: "pt", label: "PT" }, { value: "en", label: "EN" }]} onChange={(v) => { const l = v as Lang; void setSetting("lang", l).then(() => applyLang(l)); }} /></div>
        </div>
      </div>
      )}

      {show("treino") && (<>
      <div className="group">
        <div className="item" style={{ flexWrap: "wrap" }}>
          <div className="grow"><div className="t">{tr("Tipo de treino")}</div><div className="s">{tr("Pilates e funcional: esses grupos aparecem primeiro e o treino fica sem RIR")}</div></div>
          <div style={{ flexBasis: "100%", marginTop: 8 }}>
            <Segmented value={settings.focus} options={[{ value: "strength", label: "Musculação" }, { value: "pilates", label: "Pilates e funcional" }]} onChange={(v) => setSetting("focus", v).catch(toastError)} />
          </div>
        </div>
        <div className="item">
          <div className="grow"><div className="t">{tr("Descanso padrão")}</div><div className="s">{tr("Para exercícios adicionados na hora (s)")}</div></div>
          <div style={{ width: 150 }}><Stepper label={tr("Descanso padrão")} value={settings.defaultRest} step={15} min={15} max={600} onChange={(v) => setSetting("defaultRest", v)} /></div>
        </div>
        <div className="item"><div className="grow t">{tr("Vibrar no fim do descanso")}</div><Toggle label={tr("Vibrar")} checked={settings.vibrate} onChange={(v) => setSetting("vibrate", v)} /></div>
        <div className="item"><div className="grow t">{tr("Som no fim do descanso")}</div><Toggle label={tr("Som")} checked={settings.sound} onChange={(v) => setSetting("sound", v)} /></div>
        <div className="item"><div className="grow"><div className="t">{tr("Treino na barra de notificações")}</div><div className="s">{tr("Ao sair do app: séries feitas, até que horas vai o descanso e aviso quando acabar")}</div></div><Toggle label={tr("Notificação do treino")} checked={settings.liveNotify && (typeof Notification === "undefined" || Notification.permission !== "denied")} onChange={async (v) => { if (v && typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission(); if (v && typeof Notification !== "undefined" && Notification.permission === "denied") toast(tr("As notificações do Pulse estão bloqueadas nos ajustes do Android.")); await setSetting("liveNotify", v); }} /></div>
        <div className="item"><div className="grow"><div className="t">{tr("Manter tela acesa no treino")}</div><div className="s">{tr("Evita o cronômetro parar com a tela bloqueada")}</div></div><Toggle label={tr("Tela acesa")} checked={settings.keepAwake} onChange={(v) => setSetting("keepAwake", v)} /></div>
      </div>

      <Section title={tr("Barra e anilhas")} />
      <div className="card stack">
        <div className="row between">
          <span>{tr("Peso da barra")}</span>
          <div className="segmented" style={{ width: 180 }}>
            {[20, 15, 10].map((k) => <button key={k} aria-pressed={settings.barKg === k} onClick={() => setSetting("barKg", k)}>{k} {tr("kg")}</button>)}
          </div>
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 8 }}>{tr("Anilhas disponíveis na academia")}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {[25, 20, 15, 10, 5, 2.5, 1.25].map((p) => {
              const on = settings.plates.includes(p);
              return <button key={p} className="chip num plate-chip" aria-pressed={on} onClick={() => setSetting("plates", on ? settings.plates.filter((x) => x !== p) : [...settings.plates, p].sort((a, b) => b - a))}>{String(p).replace(".", ",")}</button>;
            })}
          </div>
        </div>
      </div>
      </>)}

      {show("lembretes") && <Reminders />}

      {show("familia") && (
      <div className="group">
        <a className="item" href={href("mesa")}>
          <span className="ico" style={{ ["--c" as string]: "var(--amber)" }}><Icon name="scale" size={18} /></span>
          <div className="grow"><div className="t">{tr("Mesa (dieta da família)")}</div><div className="s">{tr("O peso é o mesmo nos dois apps; treino feito aqui responde o “Treinou hoje?” de lá")}</div></div>
          <Icon name="chevron" size={16} />
        </a>
        <div className="item" style={{ flexWrap: "wrap" }}>
          <div className="grow"><div className="t">{tr("Você na Mesa")}</div><div className="s">{tr("Para onde vão seu peso e o “Treinou hoje?”")}</div></div>
          <div style={{ flexBasis: "100%", marginTop: 8 }}>
            <Segmented value={settings.familyPerson ?? "auto"} options={[{ value: "auto", label: "Automático" }, { value: "rafael", label: "Rafael" }, { value: "marina", label: "Marina" }, { value: "theo", label: "Theo" }]} onChange={(v) => setSetting("familyPerson", v === "auto" ? null : v).catch(toastError)} />
          </div>
        </div>
      </div>
      )}

      {show("claude") && (
      <div className="group">
        {currentAccount() && (
          <button className="item" onClick={() => setConnector(true)}>
            <span className="ico" style={{ ["--c" as string]: "var(--violet)" }}><Icon name="link" size={18} /></span>
            <div className="grow" style={{ textAlign: "left" }}><div className="t">{tr("Conector do Claude")}</div><div className="s">{tr("O Claude lê seus treinos e publica o plano direto no app, sem copiar e colar")}</div></div>
            <Icon name="chevron" size={16} />
          </button>
        )}
        <a className="item" href={href("treinos", "importar")}>
          <span className="ico"><Icon name="upload" size={18} /></span>
          <div className="grow"><div className="t">{tr("Importar plano do Claude")}</div><div className="s">{tr("Cole o JSON plan@1 gerado no chat")}</div></div>
          <Icon name="chevron" size={16} />
        </a>
        <button className="item" onClick={async () => toast((await copyPlanInstructions()) ? tr("Instruções + biblioteca + cargas copiadas") : tr("Não consegui copiar"))}>
          <span className="ico" style={{ ["--c" as string]: "var(--violet)" }}><Icon name="copy" size={18} /></span>
          <div className="grow"><div className="t">{tr("Copiar instruções para o Claude")}</div><div className="s">{tr("Formato do plano + seus exercícios, para ele usar os nomes certos")}</div></div>
        </button>
      </div>
      )}

      {show("app") && (<>
      <div className="group">
        <a className="item" href={href("feedback")}>
          <span className="ico" style={{ ["--c" as string]: "var(--amber)" }}><Icon name="note" size={18} /></span>
          <div className="grow"><div className="t">{tr("Feedback do app")}</div><div className="s">{tr("Anote o que melhorar; copie com os erros recentes para o Claude")}</div></div>
          <Icon name="chevron" size={16} />
        </a>
        <button className="item" onClick={() => setTerms(true)}>
          <span className="ico" style={{ ["--c" as string]: "var(--blue)" }}><Icon name="info" size={18} /></span>
          <div className="grow" style={{ textAlign: "left" }}><div className="t">{tr("Termos do app")}</div><div className="s">{tr("RIR, 1RM estimado, volume, FFMI… explicados")}</div></div>
          <Icon name="chevron" size={16} />
        </button>
        <button className="item" onClick={() => setNews(true)}>
          <span className="ico" style={{ ["--c" as string]: "var(--violet)" }}><Icon name="bolt" size={18} /></span>
          <div className="grow" style={{ textAlign: "left" }}><div className="t">{tr("Novidades")}</div><div className="s">{tr("O que mudou em cada versão · você está na v")}{__APP_VERSION__}</div></div>
          <Icon name="chevron" size={16} />
        </button>
      </div>
      <p className="tiny dim center" style={{ marginTop: 24 }}>{tr("Pulse · v")}{__APP_VERSION__}</p>
      </>)}

      {show("dados") && (<>
      <p className="small muted" style={{ margin: "0 0 10px" }}>{counts?.sessions ?? 0} {tr("treinos ·")} {counts?.sets ?? 0} {tr("séries ·")} {counts?.measures ?? 0} {tr("medidas")}</p>
      {currentAccount() ? (
        <div className="alert info small"><Icon name="info" size={16} /> <div>{tr("Seus dados ficam neste aparelho e no servidor (sincronizados). As fotos de progresso também ganham uma cópia no servidor (só você vê); o backup com fotos é uma cópia extra, em arquivo.")}</div></div>
      ) : (
        <div className="alert small"><Icon name="info" size={16} /> <div>{tr("Os dados ficam só neste celular. Ative o Pulse (acima) para guardá-los no servidor — até lá, faça backup toda semana.")}</div></div>
      )}
      <div className="group" style={{ marginTop: 10 }}>
        {currentAccount() && (
          <button className="item" onClick={() => setTrashOpen(true)}>
            <span className="ico" style={{ ["--c" as string]: "var(--amber)" }}><Icon name="trash" size={18} /></span>
            <div className="grow" style={{ textAlign: "left" }}><div className="t">{tr("Lixeira (3 dias)")}</div><div className="s">{tr("Treinos, medidas e análises apagados: dá para restaurar")}</div></div>
            <Icon name="chevron" size={16} />
          </button>
        )}
        <AsyncButton className="item" busyLabel={tr("Gerando…")} onClick={async () => { downloadText(`treino-backup-${isoDay()}.json`, await exportBackup()); await markBackup(); toast(tr("Backup baixado")); }}>
          <span className="ico" style={{ ["--c" as string]: "var(--blue)" }}><Icon name="download" size={18} /></span>
          <div className="grow" style={{ textAlign: "left" }}><div className="t">{tr("Baixar backup")}</div><div className="s">{tr("Planos, treinos, séries, medidas")}</div></div>
        </AsyncButton>
        <AsyncButton className="item" busyLabel={tr("Gerando (pode demorar)…")} onClick={async () => { downloadText(`treino-backup-com-fotos-${isoDay()}.json`, await exportBackup(true)); await markBackup(); toast(tr("Backup com fotos baixado")); }}>
          <span className="ico" style={{ ["--c" as string]: "var(--violet)" }}><Icon name="body" size={18} /></span>
          <div className="grow" style={{ textAlign: "left" }}><div className="t">{tr("Baixar backup com fotos")}</div><div className="s">{tr("Arquivo maior; inclui as fotos de progresso")}</div></div>
        </AsyncButton>
        <button className="item" onClick={() => fileRef.current?.click()}>
          <span className="ico" style={{ ["--c" as string]: "var(--amber)" }}><Icon name="upload" size={18} /></span>
          <div className="grow"><div className="t">{tr("Restaurar backup")}</div><div className="s">{tr("Substitui todos os dados")}{currentAccount() ? tr(" (também nos outros aparelhos)") : tr(" deste celular")}</div></div>
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setRestore(await f.text()); }} />
      </>)}
      <Sheet open={news} onClose={() => setNews(false)}><ReleaseNotes /></Sheet>
      <Sheet open={trashOpen} onClose={() => setTrashOpen(false)}>{trashOpen && <TrashList />}</Sheet>
      <Sheet open={connector} onClose={() => setConnector(false)}>{connector && <ClaudeConnector />}</Sheet>
      <Sheet open={terms} onClose={() => setTerms(false)}>
        <div className="stack" style={{ gap: 18 }}>{(Object.keys(GLOSSARY) as TermId[]).map((id) => <TermText key={id} id={id} />)}</div>
      </Sheet>

      <Sheet open={restore !== null} onClose={() => setRestore(null)} footer={
        <>
          <AsyncButton className="btn danger block" busyLabel={tr("Restaurando…")} onClick={async () => { await importBackup(restore!); toast(tr("Backup restaurado")); setRestore(null); go("inicio"); }}>{tr("Substituir e restaurar")}</AsyncButton>
          <button className="btn ghost block" onClick={() => setRestore(null)}>{tr("Cancelar")}</button>
        </>
      }>
        <div className="title-md">{tr("Restaurar backup?")}</div>
        <p className="small muted">{tr("Todos os dados atuais serão substituídos pelo conteúdo do arquivo")}{currentAccount() ? tr(" — neste aparelho e, ao sincronizar, nos outros") : tr(" deste celular")}{tr(". Fotos só são trocadas se o arquivo tiver fotos.")}</p>
      </Sheet>
    </div>
  );
}

/** Instruções para o Claude montar um plano: formato + biblioteca (sem vetados) + suas cargas. `ask` vai no fim (o pedido). */
export async function copyPlanInstructions(ask?: string): Promise<boolean> {
  const [exercises, flags, loads] = await Promise.all([db.exercises.toArray(), db.flags.toArray(), currentLoads()]);
  const text = [PROMPT_FOR_CLAUDE, libraryForPrompt(exercises, new Set(flags.filter((f) => f.type === "vetoed").map((f) => f.exercise))), loadsForPrompt(loads, isoDay()), ask].filter(Boolean).join("\n\n");
  return copyText(text);
}

export function ImportPlan() {
  const names = useLiveQuery(async () => new Set(await db.exercises.toCollection().primaryKeys()), []);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const existing = useLiveQuery(async () => (result?.ok ? db.plans.get(result.plan.block.id) : undefined), [result]);
  const active = useActivePlan();
  const check = (t: string) => {
    setText(t);
    setResult(t.trim() ? parsePlan(t, names) : null);
  };
  return (
    <div className="screen">
      <BackHeader eyebrow={tr("Treinos")} title={tr("Importar do Claude")} onBack={() => back("treinos")} />
      <p className="small muted" style={{ marginTop: 0 }}>{tr("No Claude, peça o plano (cole antes as")} <b>{tr("instruções para o Claude")}</b>{tr(", em Ajustes). Ele gera um")} <b>{tr("arquivo .json")}</b>{tr(": baixe e escolha aqui. Nada muda até você tocar em “Importar e ativar”.")}</p>
      <input ref={fileRef} type="file" accept=".json,application/json,text/plain" style={{ display: "none" }} onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        try { check(await f.text()); } catch (err) { toastError(err); }
      }} />
      <button className="btn primary block" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} /> {tr("Escolher arquivo .json")}</button>
      <button className="btn block" style={{ marginTop: 8 }} onClick={async () => { try { check(await navigator.clipboard.readText()); } catch { toast(tr("Sem acesso à área de transferência — cole manualmente.")); } }}>
        <Icon name="copy" size={16} /> {tr("Ou colar o texto copiado")}
      </button>
      <textarea className="input code" style={{ marginTop: 10 }} placeholder={tr("{\"format\": \"app-treino/plan@1\", ...}")} value={text} onChange={(e) => check(e.target.value)} rows={8} spellCheck={false} />
      {result && !result.ok && (
        <div className="alert danger small" style={{ marginTop: 10 }}>
          <Icon name="alert" size={16} />
          <div><b>{tr("Não deu para importar:")}</b><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{result.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul><div style={{ marginTop: 6 }}>{tr("Mande esses erros para o Claude corrigir.")}</div></div>
        </div>
      )}
      {result?.ok && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="card stack" style={{ gap: 10 }}>
            <div className="row between"><div><div className="eyebrow">{tr("Pré-visualização")}</div><div className="title-md">{result.plan.block.name}</div></div><span className="tag ok">{tr("válido")}</span></div>
            <div className="small muted num">{fmtShort(weekRange(result.plan, 1).start)} → {fmtShort(weekRange(result.plan, result.plan.block.weeks).end)} · {result.plan.block.weeks} {tr("semanas")}{result.plan.block.deloadWeeks.length ? tr(" · deload: {0}", result.plan.block.deloadWeeks.join(", ")) : ""}</div>
            {result.plan.days.map((d) => (
              <div key={d.key} className="row small" style={{ alignItems: "flex-start" }}>
                <span className="badge sm" style={{ ["--c" as string]: d.color ?? "var(--surface-3)" }}>{d.key}</span>
                <div className="grow"><b>{d.name}</b><div className="muted">{d.exercises.map((e) => e.name).join(" · ")}</div></div>
              </div>
            ))}
          </div>
          {active && <PlanChanges diff={planDiff(active.plan, result.plan)} current={active.plan.block.name} />}
          {result.warnings.length > 0 && <div className="alert small"><Icon name="alert" size={16} /><ul style={{ margin: 0, paddingLeft: 18 }}>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>}
          {existing && <div className="alert info small"><Icon name="info" size={16} /> <div>{tr("Já existe um plano com o id “")}{result.plan.block.id}{tr("”. Importar vai")} <b>{tr("substituir")}</b> {tr("o plano (o histórico fica).")}</div></div>}
          <AsyncButton className="btn primary lg block" busyLabel={tr("Importando…")} onClick={async () => { await importPlan(result.plan); toast(tr("Plano importado e ativado ✅")); go("treinos"); }}>
            <Icon name="check" /> {tr("Importar e ativar")}
          </AsyncButton>
        </div>
      )}
    </div>
  );
}


/** O que muda em relação ao plano ativo (semana 1 de cada dia): a aprovação da mudança de treino fica consciente. */
function PlanChanges({ diff, current }: { diff: PlanDiff; current: string }) {
  const none = !diff.daysAdded.length && !diff.daysRemoved.length && !diff.days.length;
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div><div className="eyebrow">{tr("O que muda")}</div><div className="tiny muted">{tr("em relação a {0} (semana 1)", current)}</div></div>
      {none && <div className="small muted">{tr("Mesmos dias, exercícios e séries do plano atual.")}</div>}
      {diff.daysAdded.length > 0 && <div className="small">{tr("Dias novos:")} <b>{diff.daysAdded.join(", ")}</b></div>}
      {diff.daysRemoved.length > 0 && <div className="small">{tr("Dias que saem:")} <b>{diff.daysRemoved.join(", ")}</b></div>}
      {diff.days.map((d) => (
        <div key={d.key} className="stack" style={{ gap: 4 }}>
          <div className="small bold">{d.key} · {d.name}</div>
          {d.added.map((n) => <div key={"+" + n} className="small diff add">+ {n}</div>)}
          {d.removed.map((n) => <div key={"-" + n} className="small diff del">− {n}</div>)}
          {d.changed.map((c) => <div key={"~" + c.name} className="small diff chg">~ {c.name}: <span className="num">{c.from} → {c.to}</span></div>)}
        </div>
      ))}
    </div>
  );
}

interface TrashItem { t: string; k: string; deletedAt: number; date?: string | null; label: string; sets?: number; done?: number; value?: number }

/** Lixeira do servidor: o que foi apagado nos últimos 3 dias volta com um toque (o treino volta com as séries). */
function TrashList() {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => fetch("./api/sync/trash", { credentials: "same-origin" }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `Servidor respondeu ${r.status}.`); setItems(d.items); }).catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => { load(); }, []);
  const restore = async (it: TrashItem) => {
    const r = await fetch("./api/sync/restore", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: it.t, k: it.k }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Servidor respondeu ${r.status}.`);
    await syncNow();
    toast(tr("Restaurado ✅"));
    await load();
  };
  const what = (it: TrashItem) =>
    it.t === "sessions" ? tr("Treino · {0} séries ({1} feitas)", it.sets ?? 0, it.done ?? 0)
    : it.t === "measures" ? `${tr(MEASURE_TYPES[it.label as keyof typeof MEASURE_TYPES]?.label ?? it.label)} · ${it.value ?? ""}`
    : it.t === "plans" ? tr("Plano") : tr("Análise");
  return (
    <div className="stack">
      <div className="title-md">{tr("Lixeira")}</div>
      <p className="small muted" style={{ margin: 0 }}>{tr("O que foi apagado em qualquer aparelho fica aqui por 3 dias. Restaurar devolve para todos os aparelhos.")}</p>
      {err && <div className="alert small"><Icon name="alert" size={16} /> {err}</div>}
      {items && !items.length && <div className="card small muted">{tr("Nada apagado nos últimos 3 dias.")}</div>}
      {items && items.length > 0 && (
        <div className="group">
          {items.map((it) => (
            <div key={`${it.t}/${it.k}`} className="item">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="t ellipsis">{it.t === "sessions" || it.t === "plans" ? it.label : what(it)}{it.date ? ` · ${fmtShort(it.date)}` : ""}</div>
                <div className="s">{it.t === "sessions" ? what(it) + " · " : ""}{tr("apagado em {0}", new Date(it.deletedAt).toLocaleDateString(lang() === "en" ? "en-GB" : "pt-BR"))}</div>
              </div>
              <AsyncButton className="btn sm" busyLabel={tr("Restaurando…")} onClick={() => restore(it)}>{tr("Restaurar")}</AsyncButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Conector do Claude: gera o endereço secreto (aparece uma vez) para colar em claude.ai → Conectores. */
function ClaudeConnector() {
  const [on, setOn] = useState<boolean | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const call = async (method: "GET" | "POST" | "DELETE") => {
    const r = await fetch("./api/mcp/token", { method, credentials: "same-origin", headers: method === "GET" ? undefined : { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Servidor respondeu ${r.status}.`);
    return d as { on?: boolean; url?: string };
  };
  useEffect(() => { call("GET").then((d) => setOn(!!d.on)).catch(toastError); }, []);
  return (
    <div className="stack">
      <div className="title-md">{tr("Conector do Claude")}</div>
      <p className="small muted" style={{ margin: 0 }}>{tr("Com ele, no claude.ai o Claude lê seus treinos, cargas, peso e o plano, e publica o próximo bloco direto aqui. Ele sempre mostra antes o que muda e só publica depois do seu “pode publicar”.")}</p>
      <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
        <li>{tr("Toque em “Gerar endereço” e copie.")}</li>
        <li>{tr("No claude.ai: Configurações → Conectores → Adicionar conector personalizado → nome “Pulse” → cole o endereço.")}</li>
        <li>{tr("Numa conversa, ligue o conector Pulse e peça: “analise meu treino e monte o próximo bloco”.")}</li>
      </ol>
      {url && (
        <div className="card stack" style={{ gap: 8 }}>
          <code className="small" style={{ wordBreak: "break-all" }}>{url}</code>
          <button className="btn sm" onClick={async () => toast((await copyText(url)) ? tr("Endereço copiado") : tr("Não consegui copiar"))}><Icon name="copy" size={16} /> {tr("Copiar endereço")}</button>
          <div className="tiny muted">{tr("Aparece só agora. Quem tiver este endereço lê e publica o seu treino: não compartilhe.")}</div>
        </div>
      )}
      <AsyncButton className="btn primary block" busyLabel={tr("Gerando…")} onClick={async () => { const d = await call("POST"); setUrl(d.url ?? null); setOn(true); }}>
        {on ? tr("Gerar endereço novo (o antigo para de funcionar)") : tr("Gerar endereço")}
      </AsyncButton>
      {on && <AsyncButton className="btn ghost block" busyLabel={tr("Desligando…")} onClick={async () => { await call("DELETE"); setOn(false); setUrl(null); toast(tr("Conector desligado")); }}>{tr("Desligar o conector")}</AsyncButton>}
    </div>
  );
}
