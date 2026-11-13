import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { BodyFigure } from "../components/BodyFigure";
import { Icon } from "../components/Icon";
import { HowTo } from "../components/HowTo";
import { MotionView } from "../components/MotionView";
import { MotionFigure } from "../components/MotionFigure";
import { AsyncButton, BackHeader, LineChart, Section, Segmented, Sheet, Stat, fmtDelta, toast } from "../components/ui";
import { db, type Session } from "../db";
import { useActivePlan, useRestrictions, useToday } from "../hooks";
import { addDays, fmtShort } from "../lib/calendar";
import { howTo } from "../lib/howto";
import { e1rm } from "../lib/metrics";
import { motionFor } from "../lib/motion";
import { trail } from "../lib/motion/draw";
import { MUSCLES, type MuscleId } from "../lib/muscles";
import { fmtKg, restrictionFor } from "../lib/prescription";
import { avgSpeed, fmtCardio, MACHINE_METRICS, METRICS as CARDIO_METRICS, type CardioMachine, type CardioValues } from "../lib/cardio";
import { back, href } from "../router";

import { tr } from "../i18n";
type DoneSet = { kg: number | null; reps: number | null; rir: number | null; cardio?: CardioValues };
type MetricDef = { label: string; unit: string; of: (s: DoneSet[]) => number };

const STRENGTH: Record<string, MetricDef> = {
  e1rm: { label: "1RM estimado", unit: " kg", of: (s) => Math.max(0, ...s.map((x) => e1rm(x.kg ?? 0, x.reps ?? 0, x.rir))) },
  kg: { label: "Carga máx.", unit: " kg", of: (s) => Math.max(0, ...s.map((x) => x.kg ?? 0)) },
  reps: { label: "Reps máx.", unit: "", of: (s) => Math.max(0, ...s.map((x) => x.reps ?? 0)) },
};
const MOBILITY: Record<string, MetricDef> = { reps: { label: "Máx. por série (reps ou s)", unit: "", of: STRENGTH.reps.of } };

/** Cardio: uma métrica por gráfico (as do aparelho; velocidade média calculada se faltar). */
function cardioMetrics(machine: CardioMachine): Record<string, MetricDef> {
  const out: Record<string, MetricDef> = {};
  for (const k of MACHINE_METRICS[machine]) {
    const m = CARDIO_METRICS[k];
    out[k] = { label: m.label, unit: m.unit ? ` ${m.unit}` : "", of: (s) => Math.max(0, ...s.map((x) => x.cardio?.[k] ?? (k === "kmh" && x.cardio ? avgSpeed(x.cardio) ?? 0 : 0))) };
  }
  return out;
}

export function ExerciseDetail({ name }: { name: string }) {
  const today = useToday();
  const stored = useActivePlan();
  const restrictions = useRestrictions(stored);
  const ex = useLiveQuery(() => db.exercises.get(name), [name]);
  const flag = useLiveQuery(() => db.flags.get(name), [name]);
  const data = useLiveQuery(async () => {
    const sets = await db.sets.where("exercise").equals(name).filter((s) => s.done && s.kind === "work").toArray();
    const ids = [...new Set(sets.map((s) => s.sessionId))];
    const sessions = (await db.sessions.bulkGet(ids)).filter((s): s is Session => !!s && s.status === "done");
    return sessions
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((session) => ({ session, sets: sets.filter((s) => s.sessionId === session.id).sort((a, b) => a.setIndex - b.setIndex) }));
  }, [name]);
  const [picked, setMetric] = useState<string | null>(null);
  const [flagSheet, setFlagSheet] = useState(false);

  if (ex === undefined || data === undefined) return <div className="screen" />;
  const motion = motionFor(name, ex?.group);
  const phased = motion.poses.length > 1 && !motion.loop && !motion.hold;
  const hasTrail = trail(motion).length > 0;
  const restriction = restrictionFor(restrictions, name, today);
  const inPlan = stored?.plan.days.filter((d) => d.exercises.some((e) => e.name === name || e.sub === name)) ?? [];
  const kind = ex?.kind ?? "strength";
  const METRICS = kind === "cardio" ? cardioMetrics(ex?.machine ?? "treadmill") : kind === "mobility" ? MOBILITY : STRENGTH;
  const metric = picked && picked in METRICS ? picked : Object.keys(METRICS)[0];
  const series = data.map(({ session, sets }) => ({ x: fmtShort(session.date), y: METRICS[metric].of(sets) }));
  const values = series.map((p) => p.y);
  const record = values.length ? Math.max(...values) : 0;
  const heat = new Map<MuscleId, number>([...(ex?.muscles?.secondary ?? []).map((m) => [m, 0.35] as const), ...(ex?.muscles?.primary ?? []).map((m) => [m, 1] as const)]);
  const backHeavy = (ex?.muscles?.primary ?? []).some((m) => ["dorsal", "costas_media", "triceps", "gluteo", "posterior", "delt_post", "lombar", "trapezio_sup"].includes(m));

  return (
    <div className="screen">
      <BackHeader eyebrow={ex ? [ex.group, ex.equipment, ex.pattern].filter(Boolean).map((x) => tr(x!)).join(" · ") : tr("Exercício")} title={name} onBack={() => back("exercicios")} />

      <div className="card motion-card">
        <MotionView name={name} group={ex?.group} muscles={ex?.muscles} aspect={1.3}>
            <div className="tiny dim center" style={{ marginTop: 4 }}>
              {tr("Toque para pausar · em vermelho, os músculos")}{hasTrail ? <> · <span className="trail-key" />{tr("caminho do movimento")}</> : null}
            </div>
            {phased && (
              <div className="phases">
                <div>
                  <MotionFigure name={name} group={ex?.group} muscles={ex?.muscles} keyframe={0} aspect={1.1} label={tr("Posição inicial")} />
                  <div className="tiny dim">{tr("Começa assim")}</div>
                </div>
                <div>
                  <MotionFigure name={name} group={ex?.group} muscles={ex?.muscles} animate={false} aspect={1.1} label={tr("Posição final")} />
                  <div className="tiny dim">{tr("Vai até aqui")}</div>
                </div>
              </div>
            )}
        </MotionView>
      </div>

      {howTo(name) ? (
        <>
          <Section title={tr("Como fazer")} />
          <div className="card" style={{ padding: 14 }}><HowTo name={name} /></div>
        </>
      ) : null}

      <div className="card" style={{ padding: 14, marginTop: 10 }}>
        <div className="row" style={{ alignItems: "center", gap: 14 }}>
          <div className="row" style={{ gap: 6 }}>
            <BodyFigure side={backHeavy ? "back" : "front"} heat={heat} width={62} />
            <BodyFigure side={backHeavy ? "front" : "back"} heat={heat} width={62} />
          </div>
          <div className="grow stack" style={{ gap: 6 }}>
            {ex?.muscles?.primary.map((m) => <span key={m} className="tag accent" style={{ alignSelf: "flex-start" }}>{tr(MUSCLES[m].label)}</span>)}
            {ex?.muscles?.secondary.map((m) => <span key={m} className="tag" style={{ alignSelf: "flex-start" }}>{tr(MUSCLES[m].label)} · ½</span>)}
            {!ex?.muscles && <span className="small muted">{tr("Sem mapa de músculos.")}</span>}
          </div>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
        {inPlan.map((d) => <span key={d.key} className="tag accent">{tr("no dia")} {d.key}</span>)}
        {ex?.unilateral && <span className="tag">{tr("unilateral")}</span>}
        {ex?.custom && <span className="tag violet">{tr("exercício meu")}</span>}
        {restriction && <span className={`tag ${restriction.kind === "vetoed" ? "danger" : "warn"}`}>{restriction.kind === "vetoed" ? "vetado" : `suspenso${restriction.until ? tr(" até {0}", fmtShort(restriction.until)) : ""}`}</span>}
      </div>
      {ex?.notes && <div className="card small muted" style={{ marginTop: 10 }}>{ex.notes}</div>}
      {restriction?.reason && <div className="alert small" style={{ marginTop: 10 }}><Icon name="alert" size={16} /> {restriction.reason}</div>}

      <Section title={tr("Evolução")} />
      {Object.keys(METRICS).length > 3 ? (
        <div className="row wrap" style={{ gap: 6 }}>
          {Object.keys(METRICS).map((m) => <button key={m} className="chip" aria-pressed={m === metric} onClick={() => setMetric(m)}>{tr(METRICS[m].label)}</button>)}
        </div>
      ) : Object.keys(METRICS).length > 1 && <Segmented value={metric} options={Object.keys(METRICS).map((m) => ({ value: m, label: METRICS[m].label }))} onChange={setMetric} />}
      <div className="grid-3" style={{ marginTop: 10 }}>
        <Stat value={record ? fmtKg(Math.round(record * 10) / 10) : "—"} label={tr("Recorde")} />
        <Stat value={fmtDelta(values.length >= 2 ? values.at(-1)! - values.at(-2)! : null)} label={tr("vs última")} />
        <Stat value={fmtDelta(values.length >= 2 ? values.at(-1)! - values[0] : null)} label={tr("vs primeira")} />
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <LineChart points={series} unit={METRICS[metric].unit} />
      </div>

      <Section title={tr("Sessões ({0})", data.length)} />
      {data.length === 0 ? (
        <div className="card small muted">{tr("Ainda não há séries registradas deste exercício.")}</div>
      ) : (
        <div className="group">
          {[...data].reverse().map(({ session, sets }) => (
            <a key={session.id} className="item" href={href("historico", session.id)}>
              <span className="badge sm" style={{ ["--c" as string]: session.color }}>{session.dayKey}</span>
              <div className="grow">
                <div className="s num">{fmtShort(session.date)}{session.week ? tr(" · sem {0}", session.week) : ""}</div>
                <div className="row wrap num" style={{ gap: 4, marginTop: 4 }}>
                  {kind === "cardio"
                    ? sets.map((s) => <span key={s.id} className="tag">{fmtCardio(s.cardio, ex?.machine) || "feito"}</span>)
                    : sets.map((s) => <span key={s.id} className="tag">{s.kg != null ? fmtKg(s.kg) : tr("PC")}{tr("×")}{s.reps ?? "?"}{s.rir != null ? ` @${s.rir}` : ""}</span>)}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      <button className="btn block" style={{ marginTop: 18 }} onClick={() => setFlagSheet(true)}><Icon name="flag" size={16} /> {flag ? tr("Editar restrição") : tr("Suspender ou vetar")}</button>

      <Sheet open={flagSheet} onClose={() => setFlagSheet(false)}>{flagSheet && <FlagSheet name={name} today={today} onClose={() => setFlagSheet(false)} />}</Sheet>
    </div>
  );
}

function FlagSheet({ name, today, onClose }: { name: string; today: string; onClose: () => void }) {
  const current = useLiveQuery(() => db.flags.get(name), [name]);
  const [type, setType] = useState<"suspended" | "vetoed">(current?.type ?? "suspended");
  const [until, setUntil] = useState(current?.until ?? addDays(today, 14));
  const [reason, setReason] = useState(current?.reason ?? "");
  return (
    <div className="stack">
      <div className="title-md">{tr("Restrição")}</div>
      <p className="small muted" style={{ margin: 0 }}>{tr("Vale por cima do plano: o exercício aparece riscado e começa pulado no treino.")}</p>
      <Segmented value={type} options={[{ value: "suspended", label: tr("Suspender") }, { value: "vetoed", label: tr("Vetar (sempre)") }]} onChange={setType} />
      {type === "suspended" && <label className="field"><span>{tr("Até (inclusive)")}</span><input className="input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>}
      <label className="field"><span>{tr("Motivo")}</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("Ex.: dor no joelho esquerdo")} /></label>
      <AsyncButton className="btn primary block" onClick={async () => { await db.flags.put({ exercise: name, type, until: type === "suspended" ? until : undefined, reason: reason || undefined }); toast(tr("Restrição salva")); onClose(); }}>{tr("Salvar")}</AsyncButton>
      {current && <AsyncButton className="btn danger block" onClick={async () => { await db.flags.delete(name); toast(tr("Restrição removida")); onClose(); }}>{tr("Remover restrição")}</AsyncButton>}
    </div>
  );
}
