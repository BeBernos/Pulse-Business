import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { PageHead, Ring, Section, Sheet, Sparkline, fmtDelta, toast, toastError } from "../components/ui";
import { ExThumb } from "../components/ExThumb";
import { BodyFigure } from "../components/BodyFigure";
import { PulseLine, PulseMark } from "../components/Pulse";
import { doneSetsByExercise, muscleHeat, topMuscles } from "../lib/heat";
import { activeSession, dayColor, startFreestyle, startSession } from "../db";
import { useActivePlan, useLibrary, useMeasures, useNow, useRestrictions, useSettings, useToday, useTrainingData } from "../hooks";
import { weekStreak, weeklyStats } from "../lib/analytics";
import { change } from "../lib/body";
import {
  addDays,
  blockStatus,
  dayStatus,
  fmtLong,
  fmtShort,
  isDeload,
  mondayOf,
  nextTrainingDay,
  parseDay,
  plannedPerWeek,
  scheduledDay,
  weekOf,
  weekRange,
  weekdayPt,
} from "../lib/calendar";
import { fmtClock, fmtDuration, fmtVolume, volume } from "../lib/metrics";
import { estimateMinutes, fmtKg, fmtMinutes, prescribe, restrictionFor, summarize } from "../lib/prescription";
import { go, href } from "../router";
import { SyncBanner } from "./Pulso";
import { copyPlanInstructions } from "./Settings";
import { missedDays, painAlerts, weekReview, type WeekReview } from "../lib/insights";
import { SkipPicker } from "../components/SkipPicker";
import { MUSCLES } from "../lib/muscles";
import type { Plan } from "../lib/plan";

import { tr } from "../i18n";
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  done: { bg: "color-mix(in srgb, var(--c) 24%, transparent)", fg: "color-mix(in srgb, var(--c) 85%, white)" },
  extra: { bg: "color-mix(in srgb, var(--violet) 22%, transparent)", fg: "var(--violet)" },
  missed: { bg: "transparent", fg: "var(--text-3)" },
  skipped: { bg: "rgba(245,185,66,.16)", fg: "var(--amber)" },
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? tr("Bom dia") : h < 18 ? tr("Boa tarde") : tr("Boa noite");
}

export function Home() {
  const stored = useActivePlan();
  const today = useToday();
  const settings = useSettings();
  const restrictions = useRestrictions(stored);
  const active = useLiveQuery(activeSession, []);
  const data = useTrainingData();
  const weights = useMeasures("peso");
  const [reviewSeen, setReviewSeen] = useState(() => { try { return localStorage.getItem(REVIEW_KEY); } catch { return null; } });
  const library = useLibrary();
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  if (stored === undefined || !data || !settings) return <div className="screen" />;
  const plan = stored?.plan;

  const trained = new Set(data.sessions.map((s) => s.date));
  const skipped = new Set(data.skips.map((s) => s.date));
  const status = plan ? blockStatus(plan, today) : "after";
  const week = plan ? Math.min(Math.max(weekOf(plan, today), 1), plan.block.weeks) : 0;
  const scheduled = plan ? scheduledDay(plan, today) : null;
  const next = plan ? nextTrainingDay(plan, today) : null;
  const day = plan ? (pickedKey ? plan.days.find((d) => d.key === pickedKey) : undefined) ?? scheduled ?? next?.day ?? plan.days[0] : undefined;
  const isRest = !scheduled && !pickedKey;
  const doneToday = data.sessions.some((s) => s.date === today && (!day || s.dayKey === day.key));

  // segunda a quarta: resumo da semana passada (some ao fechar)
  const lastMonday = addDays(mondayOf(today), -7);
  const dow = parseDay(today).getDay();
  const libMuscles = new Map((library ?? []).map((e) => [e.name, e.muscles]));
  const review = plan && (dow >= 1 && dow <= 3) && reviewSeen !== lastMonday
    ? weekReview({ from: lastMonday, today, plan, sessions: data.sessions as never, sets: data.sets as never, skipped, weights: weights ?? [], musclesOf: (n) => libMuscles.get(n) })
    : null;
  const pains = painAlerts(data.sessions as never);

  // estatísticas
  const target = plan ? Math.max(1, Math.round(plannedPerWeek(plan))) : 3;
  const streak = weekStreak(data.sessions.map((s) => s.date), today, target);
  const weeks = weeklyStats(data.sessions as never, data.sets as never, addDays(mondayOf(today), -7 * 7), today);
  const thisWeek = weeks.at(-1)!;
  const lastWeight = weights?.at(-1);
  const wChange = weights ? change(weights, 7) : null;

  async function freestyle() {
    try {
      if (active) return go("treino");
      await startFreestyle(today);
      go("treino");
    } catch (e) {
      toastError(e);
    }
  }

  async function begin() {
    try {
      if (active) return go("treino");
      if (!stored || !day) return;
      await startSession(stored, day, week || 1, today, restrictions);
      go("treino");
    } catch (e) {
      toastError(e);
    }
  }

  const main = day ? day.exercises.find((e) => e.main) ?? day.exercises[0] : undefined;
  const mainP = plan && main ? prescribe(plan, main, week || 1) : null;
  const mainTop = mainP ? Math.max(0, ...mainP.sets.filter((s) => s.kind === "work").map((s) => s.kg ?? 0)) : 0;
  const color = plan && day ? dayColor(plan, day) : "var(--accent)";
  const susp = restrictions.filter((r) => r.type === "suspended" && (!r.until || today <= r.until) && plan?.days.some((d) => d.exercises.some((e) => e.name === r.exercise)));

  const lib = new Map((library ?? []).map((e) => [e.name, e.muscles]));
  const heat = day ? muscleHeat(day.exercises.filter((e) => (e.block ?? "main") === "main").map((e) => ({ muscles: lib.get(e.name), sets: e.sets ?? 3 }))) : new Map();
  // descanso: o que foi treinado nos últimos 2 dias ainda está se recuperando
  const recentIds = new Set(data.sessions.filter((x) => x.date >= addDays(today, -2) && x.date <= today).map((x) => x.id));
  const recovering = muscleHeat([...doneSetsByExercise(data.sets.filter((x) => recentIds.has(x.sessionId)))].map(([n, k]) => ({ muscles: lib.get(n), sets: k })));
  const upcoming = plan ? Array.from({ length: 14 }, (_, i) => addDays(today, i + 1)).map((date) => ({ date, d: scheduledDay(plan, date) })).filter((x): x is { date: string; d: NonNullable<typeof x.d> } => !!x.d).slice(0, 4) : [];
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(today), i));
  // já treinou hoje: o Início mostra o treino feito (com link para o resumo) em vez de oferecer outro
  const doneSession = data.sessions.filter((x) => x.date === today).at(-1);
  const doneSets = doneSession ? data.sets.filter((x) => x.sessionId === doneSession.id) : [];
  const doneHeat = muscleHeat([...doneSetsByExercise(doneSets)].map(([n, k]) => ({ muscles: lib.get(n), sets: k })));

  return (
    <div className="screen">
      <PageHead
        eyebrow={<span style={{ textTransform: "capitalize" }}>{fmtLong(today)}</span>}
        title={settings.name ? `${greeting()}, ${settings.name}` : greeting()}
        right={<><PulseMark size={38} /><a className="icon-btn" href={href("ajustes")} aria-label={tr("Ajustes")}><Icon name="gear" /></a></>}
      />

      <SyncBanner />

      {plan && (status === "after" || week === plan.block.weeks) && <BlockEnd plan={plan} today={today} ended={status === "after"} />}

      {pains.map((pn) => (
        <div key={pn.area} className="alert" style={{ marginTop: 10 }}>
          <Icon name="alert" />
          <div><b>{tr("Dor em {0}", tr(pn.area))}</b> {tr("em {0} dos últimos {1} treinos (até {2}/10).", pn.times, pn.of, pn.max)} <span className="small muted">{tr("Vale ajustar a carga, trocar o exercício ou avaliar com um profissional.")}</span></div>
        </div>
      ))}

      {plan && <MissedCard plan={plan} days={missedDays(plan, today, trained, skipped)} />}

      {review && <WeekReviewCard r={review} onClose={() => { try { localStorage.setItem(REVIEW_KEY, review.from); } catch { /* sem armazenamento */ } setReviewSeen(review.from); }} />}

      {active && (
        <button className="card tap row" style={{ marginBottom: 12, borderColor: active.color }} onClick={() => go("treino")}>
          <span className="badge sm" style={{ ["--c" as string]: active.color }}>{active.dayKey}</span>
          <div className="grow">
            <div className="bold">{tr("Treino em andamento")}</div>
            <ActiveClock startedAt={active.startedAt} name={active.dayName} />
          </div>
          <Icon name="chevron" />
        </button>
      )}

      {/* treino do dia: um cartão, um botão. Trocar de treino fica numa folha (sem a fileira de chips). */}
      {doneSession && !active && !pickedKey ? (
        <div className="hero today-card" style={{ ["--accent" as string]: doneSession.color, ["--accent-2" as string]: `color-mix(in srgb, ${doneSession.color} 70%, white)` }}>
          <div className="row" style={{ minWidth: 0 }}>
            <span className="badge" style={{ ["--c" as string]: doneSession.color }}>{doneSession.dayKey}</span>
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow row" style={{ gap: 4, color: "color-mix(in srgb, var(--accent) 75%, white)" }}><Icon name="check" size={12} stroke={3} /> {tr("Feito hoje")}</div>
              <div className="title-lg ellipsis">{doneSession.dayName}</div>
            </div>
          </div>
          {doneHeat.size > 0 && (
            <div className="fig-pair">
              <BodyFigure side="front" heat={doneHeat} width={76} decorative />
              <BodyFigure side="back" heat={doneHeat} width={76} decorative />
              <div className="fig-legend">{topMuscles(doneHeat, 4).map((m, i) => <div key={m}><i style={{ opacity: 1 - i * 0.2 }} />{tr(m)}</div>)}</div>
            </div>
          )}
          <div className="row small muted" style={{ gap: 14, marginTop: 12 }}>
            <span className="row" style={{ gap: 4 }}><Icon name="timer" size={15} /> <span className="num">{fmtDuration((doneSession.endedAt ?? doneSession.startedAt) - doneSession.startedAt)}</span></span>
            <span className="num">{fmtVolume(volume(doneSets))}</span>
            <span><span className="num">{doneSets.length}</span> {tr("séries")}</span>
          </div>
          <a className="btn primary block" style={{ marginTop: 14 }} href={href("resumo", doneSession.id)}>{tr("Ver resumo")}</a>
          <button className="btn ghost sm block" style={{ marginTop: 6 }} onClick={() => setPicking(true)}>{tr("Treinar mais")}</button>
        </div>
      ) : plan && day ? (
        isRest && !pickedKey ? (
          <div className="card rest-card">
            <div className="fig-side">
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="ico" style={{ ["--c" as string]: "var(--violet)" }}><Icon name="moon" size={20} /></span>
                  <div className="bold">{tr("Hoje é descanso")}</div>
                </div>
                {recovering.size > 0 && <>
                  <div className="small muted" style={{ marginTop: 10 }}>{tr("Recuperando")}</div>
                  <div className="small" style={{ marginTop: 2 }}>{topMuscles(recovering, 3).map((m) => tr(m)).join(" · ")}</div>
                </>}
                {next && <div className="small muted" style={{ marginTop: 10 }}>{tr("Próximo:")} <b style={{ color: "var(--text)" }}>{weekdayPt(next.date)} · {next.day.key} · {next.day.name}</b></div>}
              </div>
              {recovering.size > 0 && <div className="fig-box" style={{ ["--accent" as string]: "var(--violet)" }}><BodyFigure side="front" heat={recovering} width={84} decorative /></div>}
            </div>
            <button className="btn block" style={{ marginTop: 14 }} onClick={() => setPicking(true)}><Icon name="dumbbell" size={16} /> {tr("Treinar mesmo assim")}</button>
          </div>
        ) : (
          <div className="hero today-card" style={{ ["--accent" as string]: color, ["--accent-2" as string]: `color-mix(in srgb, ${color} 70%, white)` }}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div className="row" style={{ minWidth: 0 }}>
                <span className="badge" style={{ ["--c" as string]: color }}>{day.key}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow" style={{ color: "color-mix(in srgb, var(--accent) 75%, white)" }}>
                    {pickedKey ? tr("Escolhido por você") : tr("Treino de hoje")}{status === "live" ? tr(" · semana {0}", week) : ""}
                  </div>
                  <div className="title-lg ellipsis">{day.name}</div>
                </div>
              </div>
              {doneToday && <span className="tag ok"><Icon name="check" size={12} stroke={3} /> {tr("feito")}</span>}
            </div>
            {day.focus && <div className="small" style={{ marginTop: 8, color: "var(--text-2)" }}>{day.focus}</div>}
            {day.exercises.length > 0 ? (
              heat.size > 0 ? (
                <div className="fig-pair">
                  <BodyFigure side="front" heat={heat} width={76} decorative />
                  <BodyFigure side="back" heat={heat} width={76} decorative />
                  <div className="fig-legend">
                    {topMuscles(heat, 4).map((m, i) => <div key={m}><i style={{ opacity: 1 - i * 0.2 }} />{tr(m)}</div>)}
                  </div>
                </div>
              ) : (
                <div className="today-thumbs">
                  {day.exercises.filter((e) => (e.block ?? "main") === "main").slice(0, 5).map((e, i) => <ExThumb key={`${e.name}-${i}`} name={e.name} size={54} />)}
                </div>
              )
            ) : (
              <div className="small muted" style={{ marginTop: 14 }}>{tr("Dia sem exercícios — monte em Treinos ou adicione durante o treino.")}</div>
            )}
            <div className="row small muted" style={{ gap: 14, marginTop: 12 }}>
              <span className="row" style={{ gap: 4 }}><Icon name="timer" size={15} /> ~{fmtMinutes(estimateMinutes(plan, day, week || 1, (n) => !!restrictionFor(restrictions, n, today)))}</span>
              <span className="row" style={{ gap: 4 }}><Icon name="dumbbell" size={15} /> {day.exercises.length} {tr("exercícios")}</span>
            </div>
            {main && mainP && (
              <div className="small" style={{ marginTop: 8 }}>
                <span className="muted">{tr("Abre com")} </span>
                <b style={restrictionFor(restrictions, main.name, today) ? { color: "var(--text-3)", textDecoration: "line-through" } : undefined}>{main.name}</b>
                <span className="muted num"> · {mainTop ? `${fmtKg(mainTop)} kg` : summarize(mainP, main)}</span>
              </div>
            )}
            <button className="btn primary lg block" style={{ marginTop: 16 }} onClick={begin}>
              <Icon name="play" size={18} /> {active ? tr("Continuar treino") : tr("Começar treino")}
            </button>
            {!active && (
              <button className="btn ghost sm block" style={{ marginTop: 6 }} onClick={() => (pickedKey ? setPickedKey(null) : setPicking(true))}>
                {pickedKey ? (isRest ? tr("Voltar: hoje é descanso") : tr("Voltar ao treino de hoje")) : tr("Trocar de treino")}
              </button>
            )}
          </div>
        )
      ) : (
        <div className="hero">
          <div className="title-lg">{tr("Sem programa ativo")}</div>
          <p className="muted small">{tr("Monte seu treino ou importe um plano do Claude.")}</p>
          <a className="btn primary block" href={href("treinos")}>{tr("Ir para Treinos")}</a>
          <button className="btn block" style={{ marginTop: 8 }} onClick={freestyle}><Icon name="plus" size={16} /> {tr("Treino livre")}</button>
        </div>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)}>
        <div className="stack">
          <div className="title-md">{tr("Qual treino?")}</div>
          <div className="group">
            {plan?.days.map((d) => (
              <button key={d.key} className="item" onClick={() => { setPickedKey(d.key === (scheduled ?? undefined)?.key ? null : d.key); setPicking(false); }}>
                <span className="badge sm" style={{ ["--c" as string]: dayColor(plan, d) }}>{d.key}</span>
                <div className="grow" style={{ textAlign: "left", minWidth: 0 }}>
                  <div className="t">{d.name}{d.key === scheduled?.key ? tr(" · hoje") : ""}</div>
                  <div className="s">{d.exercises.length} {tr("exercícios")}{d.focus ? ` · ${d.focus}` : ""}</div>
                </div>
                <Icon name="chevron" size={16} />
              </button>
            ))}
            <button className="item" onClick={() => { setPicking(false); freestyle(); }}>
              <span className="badge sm" style={{ ["--c" as string]: "var(--surface-3)" }}>+</span>
              <div className="grow" style={{ textAlign: "left" }}><div className="t">{tr("Treino livre")}</div><div className="s">{tr("Monte na hora, exercício por exercício")}</div></div>
              <Icon name="chevron" size={16} />
            </button>
          </div>
        </div>
      </Sheet>

      {/* semana como batimento: um pico em cada dia treinado */}
      <Section title={tr("Esta semana")} action={<a href={href("progresso")}>{tr("Calendário")}</a>} />
      <div className="card week-pulse">
        <div className="wp-line">
          <PulseLine height={48} strokeWidth={2.4} beats={weekDays.map((d, i) => (trained.has(d) ? (i + 0.5) / 7 : -1)).filter((x) => x >= 0)} />
          {/* ponto no alto de cada pico, na cor do treino daquele dia; hoje pulsa (na linha, se ainda não treinou) */}
          {weekDays.map((d, i) => {
            const sess = data.sessions.find((x) => x.date === d);
            if (!sess && d !== today) return null;
            return <i key={d} className={`wp-dot${d === today ? " now" : ""}${sess ? " peak" : ""}`} style={{ left: `${((i + 0.5) / 7) * 100}%`, ["--c" as string]: sess?.color ?? "var(--accent)" }} />;
          })}
        </div>
        <div className="wp-days">
          {weekDays.map((date) => {
            const st = dayStatus(plan, date, today, trained, skipped);
            const d = plan ? scheduledDay(plan, date) : null;
            const sess = data.sessions.find((x) => x.date === date);
            const c = sess?.color ?? (plan && d ? dayColor(plan, d) : "var(--text-3)");
            const style = STATUS_STYLE[st];
            return (
              <a key={date} className={date === today ? "today" : ""} href={href("progresso", "dia", date)}>
                <span>{weekdayPt(date)}</span>
                <b style={{ color: style ? style.fg.replace("var(--c)", c) : c }}>
                  {st === "done" || st === "extra" ? <Icon name="check" size={14} stroke={3} /> : st === "missed" ? "✕" : st === "skipped" ? "–" : sess?.dayKey ?? d?.key ?? "·"}
                </b>
              </a>
            );
          })}
        </div>
      </div>

      {plan && isDeload(plan, week) && status === "live" && (
        <div className="alert" style={{ marginTop: 12 }}><Icon name="bolt" /><div><b>{tr("Semana de deload.")}</b> {tr("Metade das séries, mesma carga, 3–4 reps antes da falha.")}</div></div>
      )}
      {susp.map((r) => (
        <div className="alert" key={r.exercise} style={{ marginTop: 10 }}>
          <Icon name="alert" />
          <div><b>{r.exercise}</b> {tr("suspenso")}{r.until ? tr(" até {0}", fmtShort(r.until)) : ""}.{r.reason && <div className="small muted">{r.reason}</div>}</div>
        </div>
      ))}
      {status === "after" && plan && (
        <div className="alert info" style={{ marginTop: 12 }}><Icon name="info" /><div>{tr("O bloco acabou. Monte o próximo em")} <a href={href("treinos")} style={{ color: "var(--blue)" }}>{tr("Treinos")}</a> {tr("ou importe do Claude.")}</div></div>
      )}

      {/* agenda: próximos treinos */}
      {upcoming.length > 0 && (
        <>
          <Section title={tr("Próximos treinos")} action={<a href={href("treinos")}>{tr("Treinos")}</a>} />
          <div className="group">
            {upcoming.map(({ date, d }) => (
              <a key={date} className="item" href={href("treinos", "dia", stored!.id, d.key, weekOf(plan!, date))}>
                <div className="agenda-date"><span>{weekdayPt(date)}</span><b className="num">{date.slice(8)}</b></div>
                <span className="badge sm" style={{ ["--c" as string]: dayColor(plan!, d) }}>{d.key}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="t ellipsis">{d.name}</div>
                  <div className="s ellipsis">{d.exercises.length} {tr("exercícios")}{d.focus ? ` · ${d.focus}` : ""}</div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {/* semana + peso */}
      <div className="grid-2" style={{ marginTop: 12 }}>
        <a className="card tap" href={href("progresso")}>
          <div className="row" style={{ gap: 12 }}>
            <Ring value={thisWeek.sessions} max={target} label={<span className="num">{thisWeek.sessions}/{target}</span>} size={58} />
            <div className="small" style={{ minWidth: 0 }}>
              <div className="bold">{thisWeek.sessions >= target ? tr("Meta batida") : tr("Semana")}</div>
              <div className="muted tiny">{tr("sequência {0} sem.", streak)}</div>
              {plan && status === "live" && <div className="muted tiny">{tr("bloco {0}/{1}", week, plan.block.weeks)}</div>}
            </div>
          </div>
        </a>
        <a className="card tap" href={href("corpo")}>
          <div className="row between"><span className="small muted">{tr("Peso")}</span><Icon name="scale" size={16} /></div>
          <div className="bold num" style={{ fontSize: 22, marginTop: 2 }}>{lastWeight ? fmtKg(lastWeight.value) : "—"} <small className="muted" style={{ fontSize: 13 }}>{tr("kg")}</small></div>
          <div className="tiny muted">{wChange != null ? tr("{0} kg em 7 dias", fmtDelta(wChange)) : lastWeight ? tr("em {0}", fmtShort(lastWeight.date)) : tr("Registre seu peso")}</div>
          <div style={{ marginTop: 4 }}><Sparkline values={(weights ?? []).slice(-12).map((w) => w.value)} width={110} height={22} /></div>
        </a>
      </div>
    </div>
  );
}

function ActiveClock({ startedAt, name }: { startedAt: number; name: string }) {
  const now = useNow(1000);
  return <div className="small muted"><span className="num">{fmtClock(now - startedAt)}</span> · {name}</div>;
}

/** Fim de bloco: analisar o bloco com o Claude → pedir o próximo (com as cargas) → importar o arquivo. */
function BlockEnd({ plan, today, ended }: { plan: Plan; today: string; ended: boolean }) {
  const end = weekRange(plan, plan.block.weeks).end;
  const nextMonday = addDays(mondayOf(end), 7);
  const start = nextMonday > today ? nextMonday : addDays(mondayOf(today), 7);
  const ask = `Pedido: o bloco "${plan.block.name}" ${ended ? "terminou" : "termina"} em ${end}. Com base na análise do bloco (relatório que mandei) e nas minhas cargas acima, monte o PRÓXIMO bloco começando em ${start}. Explique as escolhas no "rationale", "focus" e "why". Mudança de treino só com a minha aprovação: me mostre o resumo antes de gerar o arquivo.`;
  return (
    <div className="card stack" style={{ marginBottom: 12, borderColor: "color-mix(in srgb, var(--violet) 45%, transparent)" }}>
      <div><div className="eyebrow" style={{ color: "var(--violet)" }}>{ended ? tr("Bloco encerrado") : tr("Última semana do bloco")}</div><div className="title-md">{ended ? tr("{0} acabou em {1}", plan.block.name, fmtShort(end)) : tr("{0} termina em {1}", plan.block.name, fmtShort(end))}</div></div>
      <div className="small muted">{tr("Três passos para o próximo bloco começar em")} {fmtShort(start)}:</div>
      <div className="group">
        <a className="item" href={href("claude", "bloco")}>
          <span className="step-n">1</span>
          <div className="grow"><div className="t">{tr("Analisar o bloco com o Claude")}</div><div className="s">{tr("Manda o relatório do bloco inteiro e guarda a resposta")}</div></div>
          <Icon name="chevron" size={16} />
        </a>
        <button className="item" onClick={async () => toast((await copyPlanInstructions(ask)) ? tr("Copiado — cole na mesma conversa do Claude") : tr("Não consegui copiar"))}>
          <span className="step-n">2</span>
          <div className="grow" style={{ textAlign: "left" }}><div className="t">{tr("Pedir o próximo bloco")}</div><div className="s">{tr("Copia formato + biblioteca + suas cargas + o pedido")}</div></div>
          <Icon name="copy" size={16} />
        </button>
        <a className="item" href={href("treinos", "importar")}>
          <span className="step-n">3</span>
          <div className="grow"><div className="t">{tr("Importar o arquivo .json")}</div><div className="s">{tr("Nada muda até você tocar em “Importar e ativar”")}</div></div>
          <Icon name="chevron" size={16} />
        </a>
      </div>
    </div>
  );
}

const REVIEW_KEY = "pulso.weekReview";

/** Resumo da semana passada (aparece de segunda a quarta até fechar). */
/** Dia de treino que passou sem registro: "Treinou?" — sim leva a lançar o treino; não pede o motivo. Um dia por vez. */
function MissedCard({ plan, days }: { plan: Plan; days: string[] }) {
  const [no, setNo] = useState<string | null>(null);
  const date = days[0];
  if (!date) return null;
  const d = scheduledDay(plan, date);
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="eyebrow">{tr("Treinou?")}{days.length > 1 ? ` · ${tr("{0} dias sem registro", days.length)}` : ""}</div>
      <div className="bold" style={{ textTransform: "capitalize" }}>{fmtLong(date)}{d ? ` · ${d.key} ${d.name}` : ""}</div>
      <div className="small muted">{tr("Ficou sem registro. Treinou e esqueceu de lançar, ou não deu?")}</div>
      {no === date ? (
        <SkipPicker key={date} date={date} dayKey={d?.key} onDone={() => setNo(null)} />
      ) : (
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <a className="btn sm" href={href("progresso", "dia", date)}>{tr("Treinei")}</a>
          <button className="btn sm primary" onClick={() => setNo(date)}>{tr("Não treinei")}</button>
        </div>
      )}
    </div>
  );
}

function WeekReviewCard({ r, onClose }: { r: WeekReview; onClose: () => void }) {
  if (!r.planned && !r.done) return null;
  const dw = r.weight != null && r.weightPrev != null ? r.weight - r.weightPrev : null;
  return (
    <div className="card stack" style={{ marginTop: 12, gap: 12 }}>
      <div className="row between">
        <div><div className="eyebrow">{tr("Semana passada")}</div><div className="small muted num">{fmtShort(r.from)} → {fmtShort(r.to)}</div></div>
        <button className="icon-btn sm" onClick={onClose} aria-label={tr("Fechar")}><Icon name="close" size={16} /></button>
      </div>
      <div className="grid-3">
        <div><b className="num" style={{ fontSize: 22 }}>{r.done}<small className="muted">/{r.planned}</small></b><div className="tiny muted">{tr("treinos")}</div></div>
        <div><b className="num" style={{ fontSize: 22 }}>{r.sets}</b><div className="tiny muted">{tr("séries")}</div></div>
        <div><b className="num" style={{ fontSize: 22 }}>{r.prs}</b><div className="tiny muted">{tr("recordes")}</div></div>
      </div>
      {r.weight != null && <div className="small">{tr("Peso médio:")} <b className="num">{fmtKg(Math.round(r.weight * 10) / 10)} kg</b>{dw != null && <span className="muted"> ({fmtDelta(dw)} {tr("vs semana anterior")})</span>}</div>}
      {r.muscles.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="tiny muted">{tr("Metas de volume do bloco (séries)")}</div>
          {r.muscles.map((m) => (
            <div key={m.id} className="row between small">
              <span>{tr(MUSCLES[m.id].label)}</span>
              <b className="num" style={{ color: m.done >= m.target ? "var(--blue)" : "var(--amber)" }}>{fmtKg(m.done)} / {fmtKg(m.target)}</b>
            </div>
          ))}
        </div>
      )}
      <a className="btn sm block" href={href("progresso", "analises")}>{tr("Ver no Progresso")}</a>
    </div>
  );
}
