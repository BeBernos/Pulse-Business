import { Term } from "../components/Term";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { BodyFigure } from "../components/BodyFigure";
import { Icon } from "../components/Icon";
import { AsyncButton, BackHeader, BarChart, PageHead, Section, Segmented, Sheet, Stat, toast, toastError, toastUndo } from "../components/ui";
import { GestureList } from "../components/GestureList";
import { SkipPicker } from "../components/SkipPicker";
import { activeSession, addDoneSet, db, dayColor, deleteSession, startFreestyle, startSession, unskipDay, type Session } from "../db";
import { useActivePlan, useLibrary, useMeasures, useRestrictions, useToday, useTrainingData } from "../hooks";
import { blockSummary, compareBest, exerciseTimes } from "../lib/insights";
import { adherence, doneMuscleVolume, loadHistory, personalRecords, weeklyStats } from "../lib/analytics";
import { addDays, dayStatus, fmtLong, fmtShort, monthGrid, monthLabel, scheduledDay, weekOf, type DayStatus } from "../lib/calendar";
import { avgRestSec, e1rm, fmtDuration, fmtVolume, volume } from "../lib/metrics";
import { MUSCLES, VOLUME_ZONE, type MuscleId } from "../lib/muscles";
import { fmtCardio } from "../lib/cardio";
import { fmtKg, fmtRest, timedSeconds } from "../lib/prescription";
import { back, go, href } from "../router";
import { NumInput, TimeVsPlan } from "./Workout";
import { ExThumb } from "../components/ExThumb";

import { lang, tr } from "../i18n";
type Tab = "calendario" | "analises" | "sessoes" | "cargas";
const FATIGUE = ["😌", "🙂", "😐", "😮‍💨", "🥵"];
const WD = ["S", "T", "Q", "Q", "S", "S", "D"];
const WD_EN = ["M", "T", "W", "T", "F", "S", "S"];

export function Progress({ tab, param }: { tab?: string; param?: string }) {
  const current: Tab = tab === "analises" || tab === "sessoes" || tab === "cargas" ? tab : "calendario";
  return (
    <div className="screen">
      <PageHead title={tr("Progresso")} right={<ClaudeButton />} />
      <Segmented
        value={current}
        options={[{ value: "calendario", label: tr("Calendário") }, { value: "analises", label: tr("Análises") }, { value: "sessoes", label: tr("Sessões") }, { value: "cargas", label: tr("Cargas") }]}
        onChange={(v) => go("progresso", v)}
      />
      <div style={{ marginTop: 16 }}>
        {current === "calendario" && <Calendar openDate={tab === "dia" ? param : undefined} />}
        {current === "analises" && <Analytics />}
        {current === "sessoes" && <Sessions />}
        {current === "cargas" && <Loads />}
      </div>
    </div>
  );
}

/* =================== Calendário =================== */

const STATUS_LABEL: Record<DayStatus, string> = {
  done: "Treinou",
  extra: "Treino extra",
  missed: "Não treinou",
  skipped: "Pulado",
  rest: "Descanso",
  today: "Hoje",
  planned: "Planejado",
  none: "Fora do programa",
};

function Calendar({ openDate }: { openDate?: string }) {
  const today = useToday();
  const stored = useActivePlan();
  const data = useTrainingData();
  const [ym, setYm] = useState(() => {
    const d = openDate ?? today;
    return { y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1 };
  });
  const [selected, setSelected] = useState<string | null>(openDate ?? null);
  if (!data) return null;
  const plan = stored?.plan;
  const trained = new Set(data.sessions.map((s) => s.date));
  const skipped = new Set(data.skips.map((s) => s.date));
  const grid = monthGrid(ym.y, ym.m);
  const monthKey = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  const inMonth = grid.filter((d) => d.startsWith(monthKey));
  const statuses = inMonth.map((d) => ({ d, status: dayStatus(plan, d, today, trained, skipped) }));
  const adh = adherence(statuses);
  const count = (s: DayStatus) => statuses.filter((x) => x.status === s).length;
  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));

  return (
    <>
      <div className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <button className="icon-btn" onClick={() => shift(-1)} aria-label={tr("Mês anterior")}><Icon name="back" /></button>
          <div className="title-md" style={{ textTransform: "capitalize" }}>{monthLabel(ym.y, ym.m)}</div>
          <button className="icon-btn" onClick={() => shift(1)} aria-label={tr("Próximo mês")}><Icon name="chevron" /></button>
        </div>
        <div className="cal">
          {(lang() === "en" ? WD_EN : WD).map((w, i) => <div key={i} className="wd">{w}</div>)}
          {grid.map((d) => {
            const st = dayStatus(plan, d, today, trained, skipped);
            const sess = data.sessions.find((s) => s.date === d);
            const sched = plan ? scheduledDay(plan, d) : null;
            const c = sess?.color ?? (plan && sched ? dayColor(plan, sched) : "var(--text-3)");
            return (
              <button key={d} className={`c ${st} ${d.startsWith(monthKey) ? "" : "out"} ${d === today ? "today" : ""}`} style={{ ["--c" as string]: c }} onClick={() => setSelected(d)}>
                <span>{Number(d.slice(8))}</span>
                {st === "done" || st === "extra" ? <span className="mk" style={{ background: c }} />
                  : st === "planned" || st === "today" ? <span className="mk" style={{ border: `1.5px solid ${c}` }} />
                  : st === "missed" || st === "skipped" ? <span className="mk" style={{ background: "currentColor" }} /> : <span className="mk" />}
              </button>
            );
          })}
        </div>
        <div className="legend" style={{ marginTop: 12 }}>
          <span><i className="done" />{tr("Treinou")}</span>
          <span><i className="extra" />{tr("Extra")}</span>
          <span><i className="missed" />{tr("Faltou (sem registro)")}</span>
          <span><i className="skipped" />{tr("Pulou (com motivo)")}</span>
          <span><i className="planned" />{tr("Planejado")}</span>
        </div>
      </div>

      <div className="grid-3" style={{ marginTop: 10 }}>
        <Stat value={count("done") + count("extra")} label={tr("Treinos")} />
        <Stat value={count("missed") + count("skipped")} label={tr("Não treinou")} tone={count("missed") + count("skipped") ? "down" : undefined} />
        <Stat value={adh.pct ?? "—"} unit={adh.pct != null ? "%" : undefined} label={<Term id="adesao">{tr("Adesão")}</Term>} />
      </div>
      {count("skipped") > 0 && <div className="small muted" style={{ marginTop: 8 }}>{count("skipped")} {tr("dia(s) pulado(s) com motivo — contam como não feitos na adesão.")}</div>}

      <Sheet open={!!selected} onClose={() => setSelected(null)}>
        {selected && <DaySheet date={selected} onClose={() => setSelected(null)} />}
      </Sheet>
    </>
  );
}

function DaySheet({ date, onClose }: { date: string; onClose: () => void }) {
  const today = useToday();
  const stored = useActivePlan();
  const restrictions = useRestrictions(stored);
  const data = useTrainingData();
  const active = useLiveQuery(activeSession, []);
  if (!data) return null;
  const plan = stored?.plan;
  const sessions = data.sessions.filter((s) => s.date === date);
  const skip = data.skips.find((s) => s.date === date);
  const st = dayStatus(plan, date, today, new Set(data.sessions.map((s) => s.date)), new Set(data.skips.map((s) => s.date)));
  const sched = plan ? scheduledDay(plan, date) : null;
  const canLog = date <= today && !active;

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">{tr(STATUS_LABEL[st])}</div>
        <div className="title-md" style={{ textTransform: "capitalize" }}>{fmtLong(date)}</div>
        {sched && <div className="small muted">{tr("Agendado:")} {sched.key} · {sched.name}</div>}
      </div>

      {sessions.map((s) => (
        <a key={s.id} className="card tap row" href={href("historico", s.id)} onClick={onClose}>
          <span className="badge sm" style={{ ["--c" as string]: s.color }}>{s.dayKey}</span>
          <div className="grow"><div className="bold">{s.dayName}</div><div className="small muted">{s.endedAt ? fmtDuration(s.endedAt - s.startedAt) : "—"}{s.fatigue ? ` · ${FATIGUE[s.fatigue - 1]}` : ""}</div></div>
          <Icon name="chevron" />
        </a>
      ))}

      {skip && (
        <div className="alert">
          <Icon name="info" />
          <div className="grow"><b>{tr("Não treinou:")}</b> {skip.reason}</div>
          <AsyncButton className="btn sm" busyLabel="…" onClick={async () => { await unskipDay(date); toast(tr("Marcação removida")); }}>{tr("Desfazer")}</AsyncButton>
        </div>
      )}

      {!sessions.length && !skip && date <= today && <SkipPicker date={date} dayKey={sched?.key} onDone={onClose} />}

      {canLog && (
        <div className="stack" style={{ gap: 8 }}>
          {date < today && <div className="small muted">{tr("Esqueceu de registrar? Lance o treino feito neste dia:")}</div>}
          {sched && stored && (
            <AsyncButton className="btn primary block" busyLabel={tr("Abrindo…")} onClick={async () => { await startSession(stored, sched, plan ? Math.max(1, weekOf(plan, date)) : 1, date, restrictions); onClose(); go("treino"); }}>
              <Icon name="play" size={16} /> {date === today ? tr("Treinar {0} agora", sched.key) : tr("Registrar {0} · {1}", sched.key, sched.name)}
            </AsyncButton>
          )}
          <AsyncButton className="btn block" busyLabel={tr("Abrindo…")} onClick={async () => { await startFreestyle(date); onClose(); go("treino"); }}>
            <Icon name="bolt" size={16} /> {date === today ? tr("Treino livre") : tr("Registrar treino livre")}
          </AsyncButton>
        </div>
      )}
      {active && date <= today && <div className="small muted">{tr("Há um treino em andamento — termine-o antes de lançar outro.")}</div>}
    </div>
  );
}

/* =================== Análises =================== */

const PERIODS = [
  { value: "28", label: "4 sem" },
  { value: "84", label: "12 sem" },
  { value: "182", label: "6 meses" },
  { value: "all", label: "Tudo" },
];

function Analytics() {
  const today = useToday();
  const stored = useActivePlan();
  const data = useTrainingData();
  const library = useLibrary();
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const weights = useMeasures("peso");
  const [period, setPeriod] = useState("84");
  if (!data || !library) return null;
  const plan = stored?.plan;
  const targets = (plan?.volumeTargets ?? {}) as Partial<Record<MuscleId, number>>;
  const first = data.sessions[0]?.date ?? today;
  const from = period === "all" ? first : addDays(today, -Number(period) + 1);
  const sessions = data.sessions.filter((s) => s.date >= from);
  const ids = new Set(sessions.map((s) => s.id));
  const sets = data.sets.filter((s) => ids.has(s.sessionId));
  const weeks = weeklyStats(sessions as never, sets as never, from, today);
  const nWeeks = Math.max(1, weeks.length);
  const durations = sessions.filter((s) => s.endedAt).map((s) => s.endedAt! - s.startedAt);
  const rests = sessions.map((s) => avgRestSec(sets.filter((x) => x.sessionId === s.id))).filter((v): v is number => v != null);
  const trained = new Set(data.sessions.map((s) => s.date));
  const skipped = new Set(data.skips.map((s) => s.date));
  const days: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(d);
  const adh = adherence(days.map((d) => ({ status: dayStatus(plan, d, today, trained, skipped) })));
  const lib = new Map(library.map((e) => [e.name, e.muscles]));
  const mv = doneMuscleVolume(sets as never, (n) => lib.get(n));
  const perWeek = new Map([...mv].map(([m, v]) => [m, v / nWeeks]));
  // músculo com meta no plano aparece mesmo sem nenhuma série
  for (const m of Object.keys(targets) as MuscleId[]) if (!perWeek.has(m)) perWeek.set(m, 0);
  const maxPW = Math.max(1, ...perWeek.values(), ...Object.values(targets).map((v) => v ?? 0));
  const heat = new Map([...perWeek].map(([m, v]) => [m, Math.min(1, v / Math.max(VOLUME_ZONE.max, maxPW))]));
  const prs = personalRecords(data.sessions as never, data.sets as never).filter((p) => p.date >= from);

  // exercícios que mais evoluíram (1RM estimado: primeira x última sessão no período)
  const byEx = new Map<string, { first: number; last: number; n: number }>();
  for (const s of sessions) {
    const top = new Map<string, number>();
    for (const x of sets.filter((y) => y.sessionId === s.id)) top.set(x.exercise, Math.max(top.get(x.exercise) ?? 0, e1rm(x.kg ?? 0, x.reps ?? 0, x.rir)));
    for (const [ex, v] of top) {
      const cur = byEx.get(ex);
      byEx.set(ex, cur ? { ...cur, last: v, n: cur.n + 1 } : { first: v, last: v, n: 1 });
    }
  }
  const gains = [...byEx].filter(([, v]) => v.n >= 2 && v.first > 0).map(([ex, v]) => ({ ex, pct: ((v.last - v.first) / v.first) * 100 })).sort((a, b) => b.pct - a.pct).slice(0, 5);

  if (!data.sessions.length)
    return <div className="card small muted">{tr("As análises aparecem depois do primeiro treino registrado.")}</div>;

  return (
    <div>
      <Segmented value={period} options={PERIODS} onChange={setPeriod} />
      <div className="grid-3" style={{ marginTop: 12 }}>
        <Stat value={sessions.length} label={tr("Treinos")} />
        <Stat value={(sessions.length / nWeeks).toFixed(1).replace(".", ",")} label={tr("Por semana")} />
        <Stat value={adh.pct ?? "—"} unit={adh.pct != null ? "%" : undefined} label={<Term id="adesao">{tr("Adesão")}</Term>} />
        <Stat value={sets.length} label={tr("Séries")} />
        <Stat value={fmtVolume(sets.reduce((a, x) => a + (x.kg ?? 0) * (x.reps ?? 0), 0))} label={<Term id="volume">{tr("Volume")}</Term>} />
        <Stat value={durations.length ? fmtDuration(durations.reduce((a, b) => a + b, 0) / durations.length) : "—"} label={tr("Duração média")} />
      </div>
      {rests.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>{tr("Descanso médio real entre séries:")} <b className="num" style={{ color: "var(--text)" }}>{fmtRest(Math.round(rests.reduce((a, b) => a + b, 0) / rests.length))}</b></div>}

      <Section title={<Term id="volume">{tr("Volume por semana")}</Term>} />
      <div className="card"><BarChart data={weeks.map((w) => ({ label: fmtShort(w.week), value: w.tonnage }))} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}t` : String(Math.round(v)))} /></div>
      <Section title={tr("Treinos por semana")} />
      <div className="card"><BarChart data={weeks.map((w) => ({ label: fmtShort(w.week), value: w.sessions }))} height={110} /></div>

      <Section title={tr("Músculos treinados")} />
      <div className="card">
        <div className="row" style={{ justifyContent: "center", gap: 18 }}>
          <BodyFigure side="front" heat={heat} width={120} />
          <BodyFigure side="back" heat={heat} width={120} />
        </div>
        <div className="tiny dim center" style={{ marginTop: 8 }}>{tr("Séries efetivas por semana (média do período) · principal 1, secundário ½")}{Object.keys(targets).length > 0 && <> · {tr("traço = meta do bloco")}</>}</div>
        <div className="stack" style={{ gap: 10, marginTop: 14 }}>
          {[...perWeek].sort((a, b) => (targets[b[0] as MuscleId] ?? -1) - (targets[a[0] as MuscleId] ?? -1) || b[1] - a[1]).map(([m, v]) => {
            const goal = targets[m as MuscleId];
            const scale = Math.max(24, maxPW);
            const color = goal != null ? (v >= goal ? "var(--blue)" : "var(--amber)") : v < VOLUME_ZONE.min ? "var(--amber)" : v > VOLUME_ZONE.max ? "var(--danger)" : "var(--blue)";
            return (
              <div key={m} className="mbar">
                <div className="row between small"><span>{tr(MUSCLES[m as MuscleId].label)}</span><b className="num">{fmtKg(Math.round(v * 10) / 10)}{goal != null && <span className="muted"> / {tr("meta")} {fmtKg(goal)}</span>}</b></div>
                <span className="track">
                  {goal == null && <span className="zone" style={{ left: `${(VOLUME_ZONE.min / scale) * 100}%`, width: `${((VOLUME_ZONE.max - VOLUME_ZONE.min) / scale) * 100}%` }} />}
                  <i style={{ width: `${(v / scale) * 100}%`, background: color }} />
                  {goal != null && <span className="goal" style={{ left: `${(goal / scale) * 100}%` }} />}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <Section title={tr("Recordes no período ({0})", prs.length)} />
      {prs.length ? (
        <div className="group">
          {prs.slice(0, 10).map((p) => (
            <a key={`${p.exercise}-${p.sessionId}`} className="item" href={href("exercicio", p.exercise)}>
              <span className="ico" style={{ ["--c" as string]: "var(--amber)" }}><Icon name="trophy" size={18} /></span>
              <div className="grow"><div className="t ellipsis">{p.exercise}</div><div className="s">{p.kg != null ? fmtKg(p.kg) : tr("PC")} {tr("kg ×")} {p.reps} · {fmtShort(p.date)}</div></div>
              <span className="tag warn">{p.kind === "e1rm" ? `1RM ${fmtKg(Math.round(p.value))}` : `${fmtKg(p.value)} kg`}</span>
            </a>
          ))}
        </div>
      ) : <div className="card small muted">{tr("Nenhum recorde no período ainda.")}</div>}

      {gains.length > 0 && (
        <>
          <Section title={<Term id="e1rm">{tr("Quem mais evoluiu (1RM estimado)")}</Term>} />
          <div className="group">
            {gains.map((g) => (
              <a key={g.ex} className="item" href={href("exercicio", g.ex)}>
                <div className="grow t ellipsis">{g.ex}</div>
                <span className={`tag ${g.pct >= 0 ? "ok" : "danger"}`}>{g.pct >= 0 ? "+" : ""}{g.pct.toFixed(1).replace(".", ",")}%</span>
              </a>
            ))}
          </div>
        </>
      )}
      <BlockCompare plans={plans ?? []} activeId={stored?.id} today={today} data={data} weights={weights ?? []} />
      <div className="tiny dim" style={{ marginTop: 10 }}>{tr("Semanas começam na segunda. Adesão = treinos feitos ÷ agendados (descansos e dias futuros não contam).")}</div>
    </div>
  );
}

/** Onde o treino passou o tempo (cada série conta o intervalo desde a anterior, descanso incluído). */
function ExerciseTimes({ session, sets }: { session: Session; sets: import("../db").SetEntry[] }) {
  const [open, setOpen] = useState(false);
  const t = exerciseTimes(session as never, sets as never);
  if (t.length < 2) return null;
  const total = t.reduce((a, x) => a + x.ms, 0) || 1;
  const shown = open ? t : t.slice(0, 4);
  return (
    <div className="card stack" style={{ marginTop: 10, gap: 8 }}>
      <div className="small bold">{tr("Onde o tempo foi")}</div>
      {shown.map((x) => (
        <div key={x.exercise} className="mbar">
          <div className="row between small" style={{ gap: 8 }}><span className="ellipsis" style={{ minWidth: 0 }}>{x.exercise}</span><b className="num" style={{ flex: "none" }}>{fmtDuration(x.ms)}</b></div>
          <span className="track"><i style={{ width: `${(x.ms / total) * 100}%`, background: "var(--accent)" }} /></span>
        </div>
      ))}
      {t.length > 4 && <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? tr("Mostrar menos") : tr("Ver todos ({0})", t.length)}</button>}
      <div className="tiny dim">{tr("Inclui o descanso antes de cada série.")}</div>
    </div>
  );
}

/** Bloco atual × o anterior: adesão, séries e tonelagem por semana, peso e os maiores ganhos de força. */
function BlockCompare({ plans, activeId, today, data, weights }: { plans: { id: string; plan: import("../lib/plan").Plan }[]; activeId?: string; today: string; data: NonNullable<ReturnType<typeof useTrainingData>>; weights: { date: string; value: number }[] }) {
  const cur = plans.find((p) => p.id === activeId);
  if (!cur) return null;
  const prev = plans.filter((p) => p.id !== cur.id && p.plan.block.startDate < cur.plan.block.startDate).sort((a, b) => b.plan.block.startDate.localeCompare(a.plan.block.startDate))[0];
  if (!prev) return null;
  const skipped = new Set(data.skips.map((s) => s.date));
  const sum = (p: typeof cur) => blockSummary({ id: p.id, plan: p.plan, today, sessions: data.sessions as never, sets: data.sets as never, skipped, weights });
  const a = sum(prev);
  const b = sum(cur);
  if (!a.sessions || !b.sessions) return null;
  const best = compareBest(a, b);
  const row = (label: string, x: string, y: string) => <div className="cmp-row"><span>{label}</span><b className="num">{x}</b><b className="num">{y}</b></div>;
  const kg = (v: number | null) => (v == null ? "—" : `${fmtKg(Math.round(v * 10) / 10)} kg`);
  return (
    <>
      <Section title={tr("Comparar blocos")} />
      <div className="card">
        <div className="cmp-row head"><span /><span className="ellipsis">{a.name}</span><span className="ellipsis">{b.name}</span></div>
        {row(tr("Treinos"), String(a.sessions), String(b.sessions))}
        {row(tr("Adesão"), a.adherence != null ? `${a.adherence}%` : "—", b.adherence != null ? `${b.adherence}%` : "—")}
        {row(tr("Séries/semana"), fmtKg(a.setsPerWeek), fmtKg(b.setsPerWeek))}
        {row(tr("Tonelagem/semana"), fmtVolume(a.tonnagePerWeek), fmtVolume(b.tonnagePerWeek))}
        {row(tr("Peso (início → fim)"), `${kg(a.weightStart)} → ${kg(a.weightEnd)}`, `${kg(b.weightStart)} → ${kg(b.weightEnd)}`)}
        {best.length > 0 && (
          <div className="stack" style={{ gap: 6, marginTop: 12 }}>
            <div className="tiny muted"><Term id="e1rm">{tr("1RM estimado: melhor do bloco anterior → deste")}</Term></div>
            {best.map((g) => (
              <a key={g.exercise} className="row between small" href={href("exercicio", g.exercise)} style={{ gap: 8 }}>
                <span className="ellipsis" style={{ minWidth: 0 }}>{g.exercise}</span>
                <span className="num" style={{ flex: "none" }}>{fmtKg(Math.round(g.before))} → {fmtKg(Math.round(g.after))} <span className={`tag ${g.pct >= 0 ? "ok" : "danger"}`}>{g.pct >= 0 ? "+" : ""}{g.pct.toFixed(1).replace(".", ",")}%</span></span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* =================== Sessões =================== */

/** Deslizar para apagar um treino do histórico: guarda o treino e todas as séries para o "Desfazer". */
async function removeSessionWithUndo(s: Session) {
  try {
    const sets = await db.sets.where({ sessionId: s.id }).toArray();
    await deleteSession(s.id);
    toastUndo(tr("Treino apagado"), () => db.transaction("rw", db.sessions, db.sets, async () => { await db.sessions.put(s); await db.sets.bulkPut(sets); }));
  } catch (e) {
    toastError(e);
  }
}

function Sessions() {
  const data = useTrainingData();
  if (!data) return null;
  const list = [...data.sessions].reverse();
  const setsBy = new Map<string, number>();
  for (const s of data.sets) setsBy.set(s.sessionId, (setsBy.get(s.sessionId) ?? 0) + 1);
  const months = new Map<string, Session[]>();
  for (const s of list) months.set(s.date.slice(0, 7), [...(months.get(s.date.slice(0, 7)) ?? []), s]);
  if (!list.length) return <div className="card small muted">{tr("Nenhum treino registrado ainda. Comece pela aba Início.")}</div>;
  return (
    <div className="stack">
      {[...months].map(([m, ss]) => (
        <div key={m}>
          <div className="eyebrow" style={{ margin: "6px 2px 8px", textTransform: "capitalize" }}>{monthLabel(Number(m.slice(0, 4)), Number(m.slice(5)) - 1)} · {ss.length} {tr("treinos")}</div>
          <div className="group gl-group">
            <GestureList gap={0} items={ss} keyOf={(s) => s.id} onDelete={(i) => removeSessionWithUndo(ss[i])} render={(s) => (
              <a className="item" href={href("historico", s.id)}>
                <span className="badge sm" style={{ ["--c" as string]: s.color }}>{s.dayKey}</span>
                <div className="grow">
                  <div className="t">{s.dayName}</div>
                  <div className="s"><span style={{ textTransform: "capitalize" }}>{fmtLong(s.date)}</span> · {s.endedAt ? fmtDuration(s.endedAt - s.startedAt) : "—"} · {setsBy.get(s.id) ?? 0} {tr("séries")}{s.pains?.length ? tr(" · ⚠ dor") : ""}</div>
                </div>
                {s.fatigue && s.fatigue >= 4 && <span className="tag warn">{tr("fadiga")} {s.fatigue}/5</span>}
              </a>
            )} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* =================== Analisar com o Claude (Fase 4) =================== */

function ClaudeButton() {
  return (
    <a className="btn sm" href={href("claude")} aria-label={tr("Analisar com o Claude")}>
      <Icon name="bolt" size={16} /> {tr("Claude")}
    </a>
  );
}

/* =================== Detalhe da sessão =================== */

export function SessionDetail({ id }: { id: string }) {
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const sets = useLiveQuery(() => db.sets.where({ sessionId: id }).toArray(), [id]);
  const data = useTrainingData();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  if (session === undefined || !sets) return <div className="screen" />;
  if (!session) return <div className="screen"><BackHeader title={tr("Treino não encontrado")} onBack={() => go("progresso", "sessoes")} /></div>;
  // séries de musculação (mobilidade e cardio ficam fora de séries/volume)
  const done = sets.filter((s) => s.done && s.kind === "work" && !s.mode);
  const prs = data ? personalRecords(data.sessions as never, data.sets as never).filter((p) => p.sessionId === id) : [];

  return (
    <div className="screen" style={{ ["--accent" as string]: session.color }}>
      <BackHeader eyebrow={<span style={{ textTransform: "capitalize" }}>{fmtLong(session.date)}{session.week ? tr(" · semana {0}", session.week) : ""}</span>} title={`${session.dayKey} · ${session.dayName}`} onBack={() => back("progresso")} />
      <div className="grid-3">
        <Stat value={session.endedAt ? fmtDuration(session.endedAt - session.startedAt) : "—"} label={tr("Duração")} />
        <Stat value={done.length} label={tr("Séries")} />
        <Stat value={fmtVolume(volume(done))} label={<Term id="volume">{tr("Volume")}</Term>} />
      </div>
      {session.endedAt && <div style={{ marginTop: 10 }}><TimeVsPlan estimatedMin={session.estimatedMin} realMs={session.endedAt - session.startedAt} restSec={avgRestSec(sets.filter((s) => !s.mode))} /></div>}
      <ExerciseTimes session={session} sets={sets} />
      {prs.length > 0 && (
        <div className="card" style={{ marginTop: 10, borderColor: "rgba(245,185,66,.35)" }}>
          <div className="row bold" style={{ gap: 6, color: "var(--amber)" }}><Icon name="trophy" size={18} /> {prs.length} {tr("recorde")}{prs.length > 1 ? "s" : ""}</div>
          {prs.map((p) => <div key={p.exercise} className="small" style={{ marginTop: 6 }}>{p.exercise}: <b>{p.kg != null ? fmtKg(p.kg) : tr("PC")} {tr("×")} {p.reps}</b></div>)}
        </div>
      )}
      {(session.fatigue || session.pains?.length || session.notes) && (
        <div className="card stack" style={{ gap: 8, marginTop: 10 }}>
          {session.fatigue && <div className="row small"><span className="muted">{tr("Fadiga")}</span> <span style={{ fontSize: 18 }}>{FATIGUE[session.fatigue - 1]}</span> <span className="num">{session.fatigue}/5</span></div>}
          {session.pains?.map((p) => <div key={p.area} className="small"><span className="tag warn">{p.area} {p.intensity}/10</span> {p.note}</div>)}
          {session.notes && <div className="small" style={{ whiteSpace: "pre-wrap" }}>{session.notes}</div>}
        </div>
      )}
      <Section title={tr("Exercícios")} action={session.status === "done" && <button onClick={() => setEditing(!editing)}>{editing ? tr("Concluir edição") : tr("Editar cargas e séries")}</button>} />
      {editing && <div className="alert info small" style={{ marginBottom: 8 }}><Icon name="info" size={16} /><div>{tr("Corrija carga, repetições e RIR. Séries desmarcadas não contam no histórico. As mudanças valem na hora e vão para os outros aparelhos.")}</div></div>}
      <div className="stack" style={{ gap: 8 }}>
        {session.exercises.map((ex, i) => {
          const list = sets.filter((s) => s.exOrder === i && s.done).sort((a, b) => a.setIndex - b.setIndex);
          if (editing && ex.kind !== "cardio") {
            const all = sets.filter((s) => s.exOrder === i).sort((a, b) => a.setIndex - b.setIndex);
            const save = (id: string, patch: Partial<typeof all[number]>) => db.sets.update(id, patch).catch(toastError);
            return (
              <div key={i} className="card">
                <div className="row" style={{ gap: 10 }}><ExThumb name={ex.name} size={40} /><div className="bold grow">{ex.name}</div></div>
                <div className="sets" style={{ marginTop: 10 }}>
                  <span className="hd">#</span><span className="hd" /><span className="hd">{tr("kg")}</span><span className="hd">{tr("Reps")}</span><span className="hd">{tr("RIR")}</span><span className="hd" />
                  {all.map((s, n) => (
                    <div key={s.id} className={s.done ? "row-done" : ""} style={{ display: "contents" }}>
                      <span className={`idx ${s.kind === "warmup" ? "w" : ""}`}>{s.kind === "warmup" ? "A" : n + 1}</span>
                      <button className="tag" onClick={() => db.sets.delete(s.id).catch(toastError)} aria-label={tr("Apagar série")}><Icon name="trash" size={12} /></button>
                      <NumInput value={s.kg} placeholder={s.mode ? "—" : "kg"} decimal disabled={!!s.mode} onCommit={(kg) => save(s.id, { kg })} />
                      <NumInput value={s.reps} placeholder="reps" onCommit={(reps) => save(s.id, { reps })} />
                      <NumInput value={s.rir} placeholder={tr("RIR")} disabled={s.kind === "warmup" || !!s.mode} onCommit={(rir) => save(s.id, { rir })} />
                      <button className={`check ${s.done ? "on" : ""}`} onClick={() => save(s.id, { done: !s.done, completedAt: s.done ? undefined : session.endedAt ?? Date.now() })} aria-label={s.done ? tr("Não conta") : tr("Conta")}><Icon name="check" size={18} stroke={3} /></button>
                    </div>
                  ))}
                </div>
                <button className="btn sm" style={{ marginTop: 10 }} onClick={() => addDoneSet(session, i).catch(toastError)}><Icon name="plus" size={14} /> {tr("Série")}</button>
              </div>
            );
          }
          return (
            <a key={i} className="card tap" href={href("exercicio", ex.name)} style={{ opacity: list.length ? 1 : 0.5 }}>
              <div className="row" style={{ gap: 10 }}><ExThumb name={ex.name} size={40} /><div className="bold grow">{ex.name}</div>{ex.plannedName !== ex.name && <span className="tag">{tr("substituto")}</span>}</div>
              {list.length ? (
                <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                  <div className="row wrap num small" style={{ gap: 6 }}>
                    {list.map((s) =>
                      s.mode === "cardio" ? <span key={s.id} className="tag accent">{fmtCardio(s.cardio, ex.machine) || "feito"}</span>
                      : s.mode === "mobility" ? <span key={s.id} className="tag">{s.reps ?? "?"}{timedSeconds(s.targetReps) != null ? " s" : ""}{ex.perSide ? "/lado" : ""}</span>
                      : <span key={s.id} className="set-pill" data-w={s.kind === "warmup" || undefined}>{s.kg != null ? fmtKg(s.kg) : tr("PC")}{tr("×")}{s.reps ?? "?"}{s.rir != null ? <small> @{s.rir}</small> : null}</span>,
                    )}
                  </div>
                  {list.filter((s) => s.note).map((s) => <div key={s.id} className="tiny muted">{tr("✎ Série")} {s.setIndex + 1}: {s.note}</div>)}
                </div>
              ) : <div className="small muted" style={{ marginTop: 4 }}>{ex.skipped ? tr("Pulado") : tr("Sem séries registradas")}</div>}
            </a>
          );
        })}
      </div>
      <button className="btn danger block" style={{ marginTop: 20 }} onClick={() => setConfirm(true)}><Icon name="trash" size={16} /> {tr("Apagar treino")}</button>
      <Sheet open={confirm} onClose={() => setConfirm(false)} footer={
        <>
          <AsyncButton className="btn danger block" busyLabel={tr("Apagando…")} onClick={async () => { await deleteSession(id); toast(tr("Treino apagado")); go("progresso", "sessoes"); }}>{tr("Apagar")}</AsyncButton>
          <button className="btn ghost block" onClick={() => setConfirm(false)}>{tr("Cancelar")}</button>
        </>
      }>
        <div className="title-md">{tr("Apagar este treino?")}</div>
        <p className="small muted">{tr("As séries registradas serão removidas. Não dá para desfazer (a menos que você tenha um backup).")}</p>
      </Sheet>
    </div>
  );
}

/* =================== Cargas (histórico permanente de cada exercício) =================== */

function Loads() {
  const data = useTrainingData();
  const [q, setQ] = useState("");
  if (!data) return null;
  const all = loadHistory(data.sessions, data.sets);
  const list = q.trim() ? all.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase())) : all;
  const fmt = (kg: number | null, reps: number | null) => `${kg != null ? fmtKg(kg) : tr("PC")}×${reps ?? "?"}`;
  return (
    <>
      <div className="small muted" style={{ margin: "12px 2px 10px" }}>{tr("Tudo o que você já levantou, guardado para sempre (inclusive de blocos antigos). Também vai junto nas instruções para o Claude montar o próximo treino.")}</div>
      <input className="input" placeholder={tr("Buscar exercício")} value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 ? <div className="card small muted" style={{ marginTop: 10 }}>{all.length ? tr("Nada com esse nome.") : tr("Assim que você terminar um treino, as cargas aparecem aqui.")}</div> : (
        <div className="group" style={{ marginTop: 10 }}>
          {list.map((l) => (
            <a key={l.name} className="item" href={href("exercicio", l.name)}>
              <ExThumb name={l.name} size={42} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="t">{l.name}</div>
                <div className="s num">{tr("Último")} {fmt(l.last.kg, l.last.reps)} · {fmtShort(l.last.date)} · {l.sessions} {tr("treino")}{l.sessions > 1 ? "s" : ""}</div>
              </div>
              <div className="center" style={{ flex: "none" }}>
                <div className="bold num">{fmt(l.best.kg, l.best.reps)}</div>
                <div className="tiny muted">{tr("melhor")}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
