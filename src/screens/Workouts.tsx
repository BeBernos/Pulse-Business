import { useLiveQuery } from "dexie-react-hooks";
import { ExThumb } from "../components/ExThumb";
import { Icon } from "../components/Icon";
import { PageHead, Section, Sheet, toast, toastError } from "../components/ui";
import { activeSession, dayColor, savePlan, setSetting, startFreestyle, startSession } from "../db";
import { useActivePlan, usePlans, useRestrictions, useToday } from "../hooks";
import { newPlan } from "../lib/builder";
import { blockStatus, fmtShort, scheduledKey, weekLabel, weekOf, weekRange } from "../lib/calendar";
import { WEEKDAYS } from "../lib/plan";
import { estimateMinutes, fmtMinutes, restrictionFor } from "../lib/prescription";
import { go, href } from "../router";
import { useState } from "react";

import { lang, tr } from "../i18n";
const WD_PT: Record<string, string> = { mon: "seg", tue: "ter", wed: "qua", thu: "qui", fri: "sex", sat: "sáb", sun: "dom" };
const wdName = (wd: string) => (lang() === "en" ? wd[0].toUpperCase() + wd.slice(1) : WD_PT[wd]);
const ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function Workouts() {
  const stored = useActivePlan();
  const plans = usePlans();
  const today = useToday();
  const restrictions = useRestrictions(stored);
  const active = useLiveQuery(activeSession, []);
  const [switching, setSwitching] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  if (stored === undefined || !plans) return <div className="screen" />;
  const plan = stored?.plan;
  const week = plan ? Math.min(Math.max(weekOf(plan, today), 1), plan.block.weeks) : 1;

  async function createPlan() {
    try {
      const p = newPlan(tr("Meu programa"), today, 8);
      await savePlan(p, !plan);
      go("treinos", "programa", p.block.id);
    } catch (e) {
      toastError(e);
    }
  }

  async function startDay(key: string) {
    try {
      if (active) return go("treino");
      const day = plan?.days.find((d) => d.key === key);
      if (!stored || !day) return;
      await startSession(stored, day, week, today, restrictions);
      go("treino");
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div className="screen">
      <PageHead
        title={tr("Treinos")}
        right={<a className="icon-btn" href={href("ajustes")} aria-label={tr("Ajustes")}><Icon name="gear" /></a>}
      />

      {plan ? (
        <div className="hero plain" style={{ padding: 18 }}>
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div className="grow">
              <div className="eyebrow">{tr("Programa ativo")}</div>
              <div className="title-lg" style={{ marginTop: 2 }}>{plan.block.name}</div>
              <div className="small muted" style={{ marginTop: 4 }}>
                {fmtShort(weekRange(plan, 1).start)} → {fmtShort(weekRange(plan, plan.block.weeks).end)} · {plan.block.weeks} {tr("semanas")}
                {blockStatus(plan, today) === "live" && tr(" · semana {0} ({1})", week, weekLabel(plan, week))}
              </div>
            </div>
            <a className="icon-btn" href={href("treinos", "programa", plan.block.id)} aria-label={tr("Editar programa")}><Icon name="edit" size={18} /></a>
          </div>
          {/* divisão */}
          <div className="row" style={{ gap: 6, marginTop: 16 }}>
            {plan.rotation ? (
              <div className="small muted">{tr("Rodízio:")} {plan.rotation.pattern.map((k) => k ?? "—").join(" · ")}</div>
            ) : (
              ORDER.map((wd) => {
                const k = plan.schedule[wd];
                const d = k ? plan.days.find((x) => x.key === k) : undefined;
                const isToday = WEEKDAYS[new Date().getDay()] === wd;
                return (
                  <div key={wd} className="grow center">
                    <div className="tiny" style={{ color: isToday ? "var(--text)" : "var(--text-3)", fontWeight: 650, marginBottom: 4 }}>{wdName(wd)}</div>
                    <div className="badge sm" style={{ width: "100%", ["--c" as string]: d ? dayColor(plan, d) : "var(--surface-3)", ...(d ? {} : { color: "var(--text-3)" }) }}>{k ?? "–"}</div>
                  </div>
                );
              })
            )}
          </div>
          <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn sm" onClick={() => setSwitching(true)}><Icon name="layers" size={16} /> {tr("Programas (")}{plans.length})</button>
            <a className="btn sm" href={href("treinos", "importar")}><Icon name="upload" size={16} /> {tr("Importar do Claude")}</a>
            {(plan.rationale || plan.block.goal || plan.notes.length > 0) && <button className="btn sm" onClick={() => setWhyOpen(true)}><Icon name="info" size={16} /> {tr("Por que este plano")}</button>}
          </div>
        </div>
      ) : (
        <div className="hero">
          <div className="title-lg">{tr("Monte seu primeiro programa")}</div>
          <p className="muted small">{tr("Escolha os dias, os exercícios por grupo muscular, séries, repetições e cargas.")}</p>
          <button className="btn primary block" onClick={createPlan}><Icon name="plus" /> {tr("Criar programa")}</button>
        </div>
      )}

      {plan && (
        <>
          <Section title={tr("Dias de treino")} action={<a href={href("treinos", "programa", plan.block.id)}>{tr("Editar")}</a>} />
          <div className="stack" style={{ gap: 10 }}>
            {plan.days.map((d) => {
              const color = dayColor(plan, d);
              const when = plan.rotation ? tr("rodízio") : ORDER.filter((wd) => plan.schedule[wd] === d.key).map((wd) => wdName(wd)).join(", ") || tr("sem dia fixo");
              const isToday = scheduledKey(plan, today) === d.key;
              return (
                <div key={d.key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <a className="item" href={href("treinos", "dia", plan.block.id, d.key)} style={{ padding: 14 }}>
                    <span className="badge" style={{ ["--c" as string]: color }}>{d.key}</span>
                    <div className="grow">
                      <div className="t row" style={{ gap: 6 }}>{d.name} {isToday && <span className="tag accent">{tr("hoje")}</span>}</div>
                      {d.focus && <div className="s" style={{ color: "var(--text-2)" }}>{d.focus}</div>}
                      <div className="s">{when} · {d.exercises.length} {tr("exercícios · ~")}{fmtMinutes(estimateMinutes(plan, d, week, (n) => !!restrictionFor(restrictions, n, today)))}</div>
                    </div>
                    <Icon name="chevron" size={18} />
                  </a>
                  {d.exercises.length > 0 && (
                    <a className="thumb-strip" href={href("treinos", "dia", plan.block.id, d.key)} aria-label={tr("Exercícios de {0}", d.name)}>
                      {d.exercises.filter((e) => (e.block ?? "main") === "main").slice(0, 6).map((e, i) => <ExThumb key={`${e.name}-${i}`} name={e.name} size={46} />)}
                      {d.exercises.filter((e) => (e.block ?? "main") === "main").length > 6 && <span className="more">+{d.exercises.filter((e) => (e.block ?? "main") === "main").length - 6}</span>}
                    </a>
                  )}
                  <div className="row" style={{ padding: "0 14px 14px", gap: 8 }}>
                    <div className="grow small muted ellipsis">{d.exercises.slice(0, 4).map((e) => e.name).join(" · ") || tr("Sem exercícios ainda")}</div>
                    <button className="btn sm tonal" style={{ ["--accent" as string]: color }} onClick={() => startDay(d.key)}><Icon name="play" size={14} /> {tr("Treinar")}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Section title={tr("Atalhos")} />
      <div className="group">
        <button className="item" onClick={async () => { try { if (active) return go("treino"); await startFreestyle(today); go("treino"); } catch (e) { toastError(e); } }}>
          <span className="ico" style={{ ["--c" as string]: "var(--accent-2)" }}><Icon name="bolt" size={18} /></span>
          <div className="grow"><div className="t">{tr("Treino livre")}</div><div className="s">{tr("Começa vazio; você adiciona os exercícios na hora")}</div></div>
          <Icon name="chevron" size={18} />
        </button>
        <button className="item" onClick={createPlan}>
          <span className="ico" style={{ ["--c" as string]: "var(--violet)" }}><Icon name="plus" size={18} /></span>
          <div className="grow"><div className="t">{tr("Novo programa")}</div><div className="s">{tr("Monte a divisão e os dias do zero")}</div></div>
          <Icon name="chevron" size={18} />
        </button>
        <a className="item" href={href("exercicios")}>
          <span className="ico" style={{ ["--c" as string]: "var(--blue)" }}><Icon name="list" size={18} /></span>
          <div className="grow"><div className="t">{tr("Biblioteca de exercícios")}</div><div className="s">{tr("Por grupo muscular, com vídeo do movimento")}</div></div>
          <Icon name="chevron" size={18} />
        </a>
      </div>

      {plan && (
        <Sheet open={whyOpen} onClose={() => setWhyOpen(false)}>
          <div className="stack">
            <div><div className="eyebrow">{tr("Por que este plano")}</div><div className="title-md">{plan.block.name}</div></div>
            {plan.block.goal && <div className="small"><b>{tr("Objetivo:")}</b> {plan.block.goal}</div>}
            {plan.rationale?.summary && <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{plan.rationale.summary}</p>}
            {plan.rationale?.priorities?.length ? (
              <div className="group">
                {plan.rationale.priorities.map((x) => <div key={x.area} className="item"><div className="grow"><div className="t">{x.area}</div><div className="s" style={{ whiteSpace: "normal" }}>{x.why}</div></div></div>)}
              </div>
            ) : null}
            {plan.rationale?.method && <div className="small"><b>{tr("Método:")}</b> <span style={{ whiteSpace: "pre-wrap" }}>{plan.rationale.method}</span></div>}
            {plan.days.some((d) => d.focus) && (
              <div className="group">
                {plan.days.filter((d) => d.focus).map((d) => <div key={d.key} className="item"><span className="badge sm" style={{ ["--c" as string]: dayColor(plan, d) }}>{d.key}</span><div className="grow"><div className="t">{d.name}</div><div className="s" style={{ whiteSpace: "normal" }}>{d.focus}</div></div></div>)}
              </div>
            )}
            {plan.notes.length > 0 && <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{plan.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            <div className="tiny dim">{tr("Explicações que vieram do Claude junto com o plano. O \"por quê\" de cada exercício aparece no treino e no editor do dia.")}</div>
          </div>
        </Sheet>
      )}

      <Sheet open={switching} onClose={() => setSwitching(false)}>
        <div className="stack">
          <div className="title-md">{tr("Programas")}</div>
          <div className="group">
            {plans.map((p) => (
              <div key={p.id} className="item">
                <button className="grow" style={{ textAlign: "left" }} onClick={async () => { await setSetting("activePlanId", p.id); setSwitching(false); toast(`Ativo: ${p.plan.block.name}`); }}>
                  <div className="t">{p.plan.block.name}</div>
                  <div className="s">{fmtShort(weekRange(p.plan, 1).start)} → {fmtShort(weekRange(p.plan, p.plan.block.weeks).end)} · {p.plan.days.length} {tr("dias")}</div>
                </button>
                {stored?.id === p.id ? <span className="tag accent">{tr("ativo")}</span> : null}
                <a className="icon-btn" href={href("treinos", "programa", p.id)} onClick={() => setSwitching(false)} aria-label={tr("Editar")}><Icon name="edit" size={16} /></a>
              </div>
            ))}
          </div>
          <button className="btn block" onClick={() => { setSwitching(false); createPlan(); }}><Icon name="plus" /> {tr("Novo programa")}</button>
        </div>
      </Sheet>
    </div>
  );
}
