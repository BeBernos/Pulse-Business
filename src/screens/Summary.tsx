import { useLiveQuery } from "dexie-react-hooks";
import { BodyFigure } from "../components/BodyFigure";
import { Icon } from "../components/Icon";
import { db } from "../db";
import { useActivePlan, useLibrary, useToday, useTrainingData } from "../hooks";
import { tr } from "../i18n";
import { bestGain, personalRecords, weekStreak } from "../lib/analytics";
import { PulseLine } from "../components/Pulse";
import { addDays, mondayOf, plannedPerWeek, weekdayPt } from "../lib/calendar";
import { doneSetsByExercise, muscleHeat } from "../lib/heat";
import { fmtDuration, fmtVolume, volume } from "../lib/metrics";
import { fmtKg } from "../lib/prescription";
import { go } from "../router";

/** Fim de treino: músculos trabalhados, números do dia, comparação com o último treino igual, recordes e sequência. */
export function Summary({ id }: { id: string }) {
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const data = useTrainingData();
  const library = useLibrary();
  const stored = useActivePlan();
  const today = useToday();
  const all = useLiveQuery(() => db.sets.where({ sessionId: id }).toArray(), [id]);
  if (session === undefined || !data || !library || !all) return <div className="screen full" />;
  if (!session) return <div className="screen full"><button className="btn block" style={{ marginTop: 24 }} onClick={() => go("inicio")}>{tr("Voltar ao início")}</button></div>;
  const lib = new Map(library.map((e) => [e.name, e.muscles]));
  const sets = data.sets.filter((s) => s.sessionId === session.id);
  const work = sets.filter((s) => s.done && s.kind === "work" && !s.mode);
  const heat = muscleHeat([...doneSetsByExercise(sets)].map(([n, k]) => ({ muscles: lib.get(n), sets: k })));
  const tonnage = volume(work);
  // último treino do mesmo dia do plano (A com A, B com B…)
  const prev = data.sessions.filter((s) => s.id !== session.id && s.dayKey === session.dayKey && !s.freestyle && s.startedAt < session.startedAt).sort((a, b) => b.startedAt - a.startedAt)[0];
  const prevT = prev ? volume(data.sets.filter((s) => s.sessionId === prev.id && s.done && s.kind === "work" && !s.mode)) : 0;
  // séries planejadas (sem as puladas): a comparação de volume só vale com o treino quase completo
  const planned = all.filter((s) => s.kind === "work" && !s.mode && !session.exercises[s.exOrder]?.skipped).length;
  const complete = planned ? work.length / planned : 1;
  const pct = prevT > 0 && complete >= 0.8 ? Math.round(((tonnage - prevT) / prevT) * 100) : null;
  const gain = prev ? bestGain(work, data.sets.filter((s) => s.sessionId === prev.id)) : null;
  const trained = new Set(data.sessions.map((s) => s.date));
  const week = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(session.date), i));
  const prs = personalRecords(data.sessions as never, data.sets as never).filter((p) => p.sessionId === session.id);
  const target = stored?.plan ? Math.max(1, Math.round(plannedPerWeek(stored.plan))) : 3;
  const streak = weekStreak(data.sessions.map((s) => s.date), today, target);
  const ms = (session.endedAt ?? Date.now()) - session.startedAt;

  return (
    <div className="screen full summary" style={{ ["--accent" as string]: session.color, ["--accent-2" as string]: `color-mix(in srgb, ${session.color} 70%, white)` }}>
      <div className="center" style={{ marginTop: 18 }}>
        <div className="eyebrow">{tr("Treino concluído")}</div>
        <div className="title-xl" style={{ marginTop: 4 }}>{session.dayKey} · {session.dayName}</div>
      </div>
      <div className="sum-week">
        <PulseLine height={46} draw beats={week.map((d, i) => (trained.has(d) && d <= session.date ? (i + 0.5) / 7 : -1)).filter((x) => x >= 0)} />
        <div className="wp-days">{week.map((d) => <span key={d} className={d === session.date ? "today" : ""}>{weekdayPt(d)}</span>)}</div>
      </div>
      {heat.size > 0 && (
        <div className="sum-figs">
          <BodyFigure side="front" heat={heat} width={124} decorative />
          <BodyFigure side="back" heat={heat} width={124} decorative />
        </div>
      )}
      <div className="sum-big3">
        <div><b className="num">{fmtDuration(ms)}</b><span>{tr("duração")}</span></div>
        <div><b className="num">{fmtVolume(tonnage)}</b><span>{tr("volume")}</span></div>
        <div><b className="num">{work.length}{planned > work.length ? <small className="muted">/{planned}</small> : null}</b><span>{tr("séries")}</span></div>
      </div>
      {(gain || (pct != null && pct > 0)) && (
        <div className="row wrap" style={{ justifyContent: "center", gap: 8, marginTop: 12 }}>
          {gain && <span className="tag accent">{tr("+{0} kg no {1}", fmtKg(gain.kg), gain.exercise)}</span>}
          {pct != null && pct > 0 && <span className="tag">{tr("+{0}% de volume vs o último {1}", pct, session.dayName)}</span>}
        </div>
      )}
      {prs.length > 0 && (
        <div className="card stack" style={{ marginTop: 16, gap: 10, borderColor: "rgba(245,185,66,.35)" }}>
          {prs.map((p) => (
            <div key={p.exercise} className="row" style={{ gap: 12 }}>
              <span className="ico" style={{ ["--c" as string]: "var(--amber)" }}><Icon name="trophy" size={18} /></span>
              <div className="grow" style={{ minWidth: 0 }}><div className="small muted">{tr("Recorde")}</div><div className="bold ellipsis">{p.exercise}</div></div>
              <b className="num">{p.kg != null ? fmtKg(p.kg) : tr("PC")}×{p.reps}</b>
            </div>
          ))}
        </div>
      )}
      {streak > 0 && <div className="row small muted" style={{ justifyContent: "center", gap: 6, marginTop: 14 }}><Icon name="bolt" size={15} /> {streak === 1 ? tr("Sequência: 1 semana batendo a meta") : tr("Sequência: {0} semanas batendo a meta", streak)}</div>}
      <button className="btn primary lg block" style={{ marginTop: 18 }} onClick={() => go("inicio")}>{tr("Concluir")}</button>
      <button className="btn ghost block" style={{ marginTop: 6 }} onClick={() => go("historico", session.id)}>{tr("Ver detalhes e editar")}</button>
    </div>
  );
}
