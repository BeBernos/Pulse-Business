import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { AsyncButton, BackHeader, Empty, Section, Sheet, copyText, toast, toastError, toastUndo } from "../components/ui";
import { GestureList } from "../components/GestureList";
import { db, exportLog, saveAnalysis } from "../db";
import { useActivePlan, useSettings, useToday } from "../hooks";
import { freeTextAnalysis, parseAnalysis, planContext, PROJECT_INSTRUCTIONS, shareMessage, TREND_LABEL, type Analysis } from "../lib/analysis";
import { addDays, fmtShort, mondayOf, weekOf, weekRange } from "../lib/calendar";
import { back, go, href } from "../router";

import { tr } from "../i18n";
/** Compartilha pelo menu do Android (app do Claude); sem menu (PC), copia. */
async function shareOrCopy(text: string, title: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
      // alguns navegadores recusam texto longo no menu: cai para copiar
    }
  }
  return (await copyText(text)) ? "copied" : "failed";
}

/**
 * Fase 4 (opção A): "Analisar com o Claude". 1) manda o relatório pelo menu Compartilhar para o app do Claude;
 * 2) cola a resposta (bloco pulse/analysis@1), que fica guardada e sincroniza; 3) histórico das análises.
 */
export function ClaudeScreen({ id }: { id?: string }) {
  if (id && id !== "bloco") return <AnalysisDetail id={id} />;
  return <ClaudeHome wholeBlock={id === "bloco"} />;
}

function ClaudeHome({ wholeBlock }: { wholeBlock?: boolean }) {
  const today = useToday();
  const stored = useActivePlan();
  const settings = useSettings();
  const list = useLiveQuery(() => db.analyses.orderBy("createdAt").reverse().toArray(), []);
  const blockRange = stored?.plan ? { from: weekRange(stored.plan, 1).start, to: weekRange(stored.plan, stored.plan.block.weeks).end } : null;
  const [period, setPeriod] = useState(wholeBlock && blockRange ? 4 : 0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const options = [
    { label: tr("Esta semana"), from: mondayOf(today), to: today },
    { label: tr("Semana passada"), from: addDays(mondayOf(today), -7), to: addDays(mondayOf(today), -1) },
    { label: tr("Últimos 14 dias"), from: addDays(today, -13), to: today },
    { label: tr("Últimos 30 dias"), from: addDays(today, -29), to: today },
    ...(blockRange ? [{ label: tr("Bloco inteiro"), from: blockRange.from, to: blockRange.to < today ? blockRange.to : today }] : []),
  ];
  const o = options[Math.min(period, options.length - 1)];

  async function send() {
    const report = await exportLog(o.from, o.to);
    const plan = stored?.plan;
    const msg = shareMessage(report, planContext(plan, plan ? weekOf(plan, today) : undefined), settings?.name);
    const r = await shareOrCopy(msg, tr("Pulse · treino {0}–{1}", fmtShort(o.from), fmtShort(o.to)));
    if (r === "copied") toast(tr("Copiado! Cole no app do Claude."));
    else if (r === "failed") toast(tr("Não consegui compartilhar nem copiar."));
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        setText(t);
        setError(null);
      } else toast(tr("A área de transferência está vazia."));
    } catch {
      toast(tr("O navegador não deixou ler a área de transferência — toque no campo e cole."));
    }
  }

  async function save(asText = false) {
    if (!text.trim()) return;
    const r = parseAnalysis(text);
    if (!r.ok && !asText) {
      setError(r.error);
      return;
    }
    const { format: _f, ...block } = r.ok ? r.block : { format: null };
    const id = await saveAnalysis(r.ok ? (block as Omit<Analysis, "id" | "createdAt">) : freeTextAnalysis(text));
    setText("");
    setError(null);
    toast(tr("Análise guardada"));
    go("claude", id);
  }

  return (
    <div className="screen">
      <BackHeader eyebrow={tr("Progresso")} title={tr("Analisar com o Claude")} onBack={() => back("progresso")} />

      <div className="card stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8 }}><span className="step-n">1</span><div className="bold">{tr("Mandar o relatório")}</div></div>
        <div className="row wrap" style={{ gap: 6 }}>
          {options.map((x, i) => (
            <button key={x.label} className="chip" aria-pressed={i === period} onClick={() => setPeriod(i)}>{x.label}</button>
          ))}
        </div>
        <div className="small muted num">{fmtShort(o.from)} → {fmtShort(o.to)} {tr("· treinos, cargas, RIR, fadiga, dores, cardio, medidas e dias pulados, com o seu plano.")}</div>
        <AsyncButton className="btn primary block" busyLabel={tr("Preparando…")} onClick={() => send().catch(toastError)}>
          <Icon name="link" size={18} /> {tr("Compartilhar com o Claude")}
        </AsyncButton>
        <div className="tiny dim">{tr("No celular abre o menu Compartilhar: escolha o app do Claude (de preferência dentro do Projeto \"Pulse\"). No PC, o texto é copiado.")}</div>
      </div>

      <div className="card stack" style={{ gap: 10, marginTop: 10 }}>
        <div className="row" style={{ gap: 8 }}><span className="step-n">2</span><div className="bold">{tr("Colar a resposta")}</div></div>
        <div className="small muted">{tr("No Claude, toque em copiar na resposta inteira e cole aqui. O app acha o bloco da análise sozinho.")}</div>
        <textarea className="input" rows={5} value={text} onChange={(e) => { setText(e.target.value); setError(null); }} placeholder={tr("Cole aqui a resposta do Claude")} spellCheck={false} />
        {error && (
          <div className="alert small">
            <Icon name="alert" size={16} />
            <div>
              {error}
              <div style={{ marginTop: 6 }}><button className="btn sm" onClick={() => save(true)}>{tr("Guardar mesmo assim, como texto")}</button></div>
            </div>
          </div>
        )}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn grow" onClick={paste}><Icon name="copy" size={16} /> {tr("Colar")}</button>
          <AsyncButton className="btn primary grow" disabled={!text.trim()} onClick={() => save()}>{tr("Guardar análise")}</AsyncButton>
        </div>
      </div>

      <button className="btn block" style={{ marginTop: 10 }} onClick={() => setSetup(true)}><Icon name="info" size={16} /> {tr("Configurar o Projeto (uma vez)")}</button>

      <Section title={tr("Histórico{0}", list?.length ? ` (${list.length})` : "")} />
      {!list ? null : list.length === 0 ? (
        <Empty icon="history" title={tr("Nenhuma análise ainda")}>{tr("Mande o relatório, cole a resposta e ela aparece aqui.")}</Empty>
      ) : (
        <div className="group gl-group">
          <GestureList gap={0} items={list} keyOf={(a) => a.id}
            onDelete={(i) => { const a = list[i]; db.analyses.delete(a.id).then(() => toastUndo(tr("Análise apagada"), () => db.analyses.put(a))).catch(toastError); }}
            render={(a) => (
            <a className="item" href={href("claude", a.id)}>
              <div className="grow">
                <div className="t">{a.title}</div>
                <div className="s num">{a.from && a.to ? `${fmtShort(a.from)} → ${fmtShort(a.to)} · ` : ""}{tr("guardada")} {fmtShort(new Date(a.createdAt).toISOString().slice(0, 10))}{a.planChange ? tr(" · propõe mudar o plano") : ""}</div>
              </div>
              <Icon name="chevron" size={18} />
            </a>
          )} />
        </div>
      )}

      <Sheet open={setup} onClose={() => setSetup(false)}>
        <div className="stack">
          <div className="title-md">{tr("Projeto \"Pulse\" no Claude")}</div>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>{tr("No app do Claude, abra")} <b>{tr("Projetos")}</b> → <b>{tr("Novo projeto")}</b> {tr("e dê o nome")} <b>{tr("Pulse")}</b>.</li>
            <li>{tr("Em")} <b>{tr("Instruções do projeto")}</b>{tr(", cole o texto abaixo (botão Copiar).")}</li>
            <li>{tr("Na hora de analisar, compartilhe o relatório para uma conversa dentro desse Projeto.")}</li>
          </ol>
          <pre className="code-box">{PROJECT_INSTRUCTIONS}</pre>
          <button className="btn primary block" onClick={async () => toast((await copyText(PROJECT_INSTRUCTIONS)) ? tr("Instruções copiadas") : tr("Não consegui copiar"))}><Icon name="copy" size={16} /> {tr("Copiar instruções")}</button>
          <div className="tiny dim">{tr("Sem o Projeto também funciona: o relatório já leva as regras. O Projeto só deixa as respostas mais consistentes.")}</div>
        </div>
      </Sheet>
    </div>
  );
}

function AnalysisDetail({ id }: { id: string }) {
  const a = useLiveQuery(() => db.analyses.get(id), [id]);
  const [confirm, setConfirm] = useState(false);
  if (a === undefined) return <div className="screen" />;
  if (!a) return <div className="screen"><BackHeader title={tr("Análise não encontrada")} onBack={() => go("claude")} /></div>;
  const block = (title: string, items?: string[], tone?: string) =>
    items?.length ? (
      <>
        <Section title={title} />
        <div className="card">
          <ul className="bullets" style={tone ? { ["--dot" as string]: tone } : undefined}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      </>
    ) : null;
  return (
    <div className="screen">
      <BackHeader eyebrow={a.from && a.to ? `${fmtShort(a.from)} → ${fmtShort(a.to)}` : tr("Análise do Claude")} title={a.title} onBack={() => back("claude")} />
      <div className="card" style={{ lineHeight: 1.5 }}>
        <div className="bold" style={{ marginBottom: 6 }}>{a.title}</div>
        <div style={{ whiteSpace: "pre-wrap" }}>{a.summary}</div>
      </div>
      {a.planChange && (
        <div className="alert info small" style={{ marginTop: 10 }}>
          <Icon name="swap" size={16} />
          <div><b>{tr("Proposta de mudança no plano")}</b> {tr("(só entra se você aprovar e importar o plano novo):")} {a.planChange.summary}</div>
        </div>
      )}
      {block(tr("Destaques"), a.highlights, "var(--blue)")}
      {block(tr("Atenção"), a.attention, "var(--amber)")}
      {a.exercises?.length ? (
        <>
          <Section title={tr("Por exercício")} />
          <div className="group">
            {a.exercises.map((e, i) => (
              <a key={i} className="item" href={href("exercicio", e.name)}>
                <div className="grow">
                  <div className="t">{e.name}{e.trend ? <span className={`tag ${e.trend === "down" ? "warn" : e.trend === "up" ? "accent" : ""}`} style={{ marginLeft: 6 }}>{tr(TREND_LABEL[e.trend])}</span> : null}</div>
                  <div className="s" style={{ whiteSpace: "normal" }}>{e.note}</div>
                </div>
              </a>
            ))}
          </div>
        </>
      ) : null}
      {block(tr("Próximos passos"), a.nextSteps, "var(--violet)")}
      <button className="btn danger block" style={{ marginTop: 18 }} onClick={() => setConfirm(true)}><Icon name="trash" size={16} /> {tr("Apagar análise")}</button>
      <Sheet open={confirm} onClose={() => setConfirm(false)}>
        <div className="stack">
          <div className="title-md">{tr("Apagar esta análise?")}</div>
          <p className="small muted" style={{ margin: 0 }}>{tr("Some também nos outros aparelhos. O treino não muda.")}</p>
          <AsyncButton className="btn danger block" onClick={async () => { await db.analyses.delete(id); toast(tr("Análise apagada")); go("claude"); }}>{tr("Apagar")}</AsyncButton>
        </div>
      </Sheet>
    </div>
  );
}
