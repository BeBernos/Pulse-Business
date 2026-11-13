import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExercisePicker } from "../components/ExercisePicker";
import { ExThumb } from "../components/ExThumb";
import { MotionFigure } from "../components/MotionFigure";
import { Icon } from "../components/Icon";
import { HowTo } from "../components/HowTo";
import { MotionView } from "../components/MotionView";
import { AsyncButton, Empty, PlateChips, Sheet, Stepper, toast, toastError, toastUndo } from "../components/ui";
import { GestureList } from "../components/GestureList";
import {
  activeSession,
  addExerciseToSession,
  addSet,
  db,
  deleteSession,
  finishSession,
  lastPerformance,
  removeExerciseFromSession,
  removeSet,
  reorderSessionExercises,
  restoreSessionExercise,
  setSetting,
  setSkipped,
  swapExercise,
  type Exercise,
  type Pain,
  type Session,
  type SetEntry,
} from "../db";
import { useAccent, useNow, useSettings, useToday, useTrainingData, useWakeLock } from "../hooks";
import { personalRecords } from "../lib/analytics";
import { defaultsFor, moveItem } from "../lib/builder";
import { fmtShort } from "../lib/calendar";
import { avgRestSec, e1rm, fmtClock, fmtDuration, fmtVolume, volume } from "../lib/metrics";
import { suggestSubstitutes } from "../lib/substitutes";
import { fmtCardio, MACHINE_METRICS, METRICS, type CardioMachine, type CardioMetric, type CardioValues } from "../lib/cardio";
import { fmtKg, fmtMinutes, fmtRest, supersetGroups, timedSeconds } from "../lib/prescription";
import { go, href } from "../router";

import { tr } from "../i18n";
import { Term } from "../components/Term";
interface RestState {
  endsAt: number;
  total: number;
  label: string;
  /** Cronômetro de série por tempo: ao terminar preenche as reps (segundos) desta série. */
  setId?: string;
}

export const REST_KEY = "app-treino:rest";

/** O descanso sobrevive a sair da tela e voltar (fica no localStorage do aparelho). */
function useRestTimer() {
  const [rest, setRestState] = useState<RestState | null>(() => {
    try {
      const r = JSON.parse(localStorage.getItem(REST_KEY) ?? "null") as RestState | null;
      return r && r.endsAt > Date.now() - 60_000 ? r : null;
    } catch {
      return null;
    }
  });
  // o botão da notificação (LiveWorkout) mexeu no descanso: relê
  useEffect(() => {
    const on = () => { try { setRestState(JSON.parse(localStorage.getItem(REST_KEY) ?? "null")); } catch { /* sem armazenamento */ } };
    window.addEventListener("pulso-live", on);
    return () => window.removeEventListener("pulso-live", on);
  }, []);
  const setRest = useCallback((r: RestState | null) => {
    setRestState(r);
    try {
      if (r) localStorage.setItem(REST_KEY, JSON.stringify(r));
      else localStorage.removeItem(REST_KEY);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);
  return [rest, setRest] as const;
}

const timedTarget = timedSeconds;

const BLOCK_LABEL = { warmup: "Aquecimento", main: "Treino", cooldown: "Volta à calma" } as const;

export function Workout() {
  const today = useToday();
  const session = useLiveQuery(activeSession, []);
  const sets = useLiveQuery(async () => (session ? db.sets.where({ sessionId: session.id }).toArray() : []), [session?.id]);
  const settings = useSettings();
  const library = useLiveQuery(() => db.exercises.toArray(), []);
  const lib = useMemo(() => new Map(library?.map((e) => [e.name, e])), [library]);
  const [rest, setRest] = useRestTimer();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [timerSheet, setTimerSheet] = useState(false);
  const [noteFor, setNoteFor] = useState<SetEntry | null>(null);
  const [removeEx, setRemoveEx] = useState<number | null>(null);
  const [moveFor, setMoveFor] = useState<number | null>(null);
  const [moreFor, setMoreFor] = useState<number | null>(null);

  useAccent(session?.color);
  useWakeLock(!!session && (settings?.keepAwake ?? true));

  const byEx = useMemo(() => {
    const m = new Map<number, SetEntry[]>();
    for (const s of sets ?? []) m.set(s.exOrder, [...(m.get(s.exOrder) ?? []), s]);
    for (const v of m.values()) v.sort((a, b) => a.setIndex - b.setIndex);
    return m;
  }, [sets]);

  // último treino de cada exercício: busca uma vez por sessão/lista de exercícios. Ao vivo, cada número digitado
  // refazia a busca dos 13–14 exercícios e redesenhava tudo (no celular, travava a digitação).
  const names = session?.exercises.map((e) => e.name).join("|");
  const [previous, setPrevious] = useState<Map<string, SetEntry[]>>();
  useEffect(() => {
    if (!session) return;
    let alive = true;
    Promise.all(session.exercises.map(async (e) => [e.name, await lastPerformance(e.name, session.id)] as const))
      .then((entries) => alive && setPrevious(new Map(entries)))
      .catch(toastError);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, session?.id]);
  const [showMove, setShowMove] = useState(() => { try { return localStorage.getItem("pulso.wkMotion") !== "0"; } catch { return true; } });
  const [serie, setSerie] = useState(() => { try { return localStorage.getItem("pulso.wkMode") === "serie"; } catch { return false; } });
  const toggleSerie = () => setSerie((v) => { try { localStorage.setItem("pulso.wkMode", v ? "lista" : "serie"); } catch { /* sem armazenamento */ } return !v; });
  const toggleMove = () => setShowMove((v) => { try { localStorage.setItem("pulso.wkMotion", v ? "0" : "1"); } catch { /* sem armazenamento */ } return !v; });

  const firstPending = session?.exercises.findIndex((e, i) => !e.skipped && (byEx.get(i) ?? []).some((s) => !s.done && (s.kind === "work" || s.mode))) ?? -1;
  const current = openIdx ?? (firstPending >= 0 ? firstPending : null);
  // a notificação do treino mostra o mesmo exercício da tela; o botão "Série feita" de lá avança e a tela segue
  useEffect(() => {
    if (session && current != null) try { localStorage.setItem("pulso.wkCurrent", JSON.stringify({ s: session.id, i: current })); } catch { /* sem armazenamento */ }
  }, [session?.id, current]);
  useEffect(() => {
    const on = () => { try { const c = JSON.parse(localStorage.getItem("pulso.wkCurrent") ?? "null"); if (c && c.s === session?.id) setOpenIdx(c.i); } catch { /* sem armazenamento */ } };
    window.addEventListener("pulso-live", on);
    return () => window.removeEventListener("pulso-live", on);
  }, [session?.id]);

  const startRest = useCallback((sec: number, label: string, setId?: string) => {
    if (sec <= 0) return;
    setRest({ endsAt: Date.now() + sec * 1000, total: sec, label, setId });
  }, [setRest]);

  if (session === undefined || sets === undefined) return <div className="screen" />;
  if (!session) {
    return (
      <div className="screen">
        <Empty icon="dumbbell" title={tr("Nenhum treino em andamento")}>
          <a className="btn primary" style={{ marginTop: 14 }} href={href("inicio")}>{tr("Voltar ao início")}</a>
        </Empty>
      </div>
    );
  }

  const retro = session.date !== today;
  const work = sets.filter((s) => s.kind === "work" && !session.exercises[s.exOrder]?.skipped);
  const doneWork = work.filter((s) => s.done);
  const pct = work.length ? doneWork.length / work.length : 0;
  // Pilates/funcional (ajuste "Tipo de treino"): sem RIR na tela
  const noRir = settings?.focus === "pilates";
  const groups = supersetGroups(session.exercises);

  function carryKg(s: SetEntry): number | null {
    const list = byEx.get(s.exOrder) ?? [];
    const before = list.filter((x) => x.kind === s.kind && x.setIndex < s.setIndex && x.kg != null);
    if (before.length) return before.at(-1)!.kg;
    if (s.kind !== "work") return null;
    const prev = previous?.get(session!.exercises[s.exOrder].name) ?? [];
    const workIdx = list.filter((x) => x.kind === "work").indexOf(s);
    return prev[workIdx]?.kg ?? prev.at(-1)?.kg ?? null;
  }

  /** Próximo exercício com série de trabalho por fazer (depois deste; senão, o primeiro que sobrou). */
  const nextPending = (from: number): number => {
    const ok = (i: number) => i !== from && !session!.exercises[i].skipped && (byEx.get(i) ?? []).some((x) => !x.done && (x.kind === "work" || x.mode));
    const idx = session!.exercises.map((_, i) => i);
    return [...idx.slice(from + 1), ...idx.slice(0, from)].find(ok) ?? -1;
  };

  const goTo = (i: number) => {
    setOpenIdx(i);
    setTimeout(() => document.querySelector(`[data-ex="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  };

  async function toggleSet(stale: SetEntry) {
    try {
      // lê a série do banco: o número digitado por último pode ter sido gravado agora (ao sair do campo)
      const s = (await db.sets.get(stale.id)) ?? stale;
      const ex = session!.exercises[s.exOrder];
      if (s.done) {
        await db.sets.update(s.id, { done: false, completedAt: undefined });
        return;
      }
      if (s.mode === "cardio") {
        // sessão de cardio: o que não foi digitado fica com a meta do plano (tempo etc.)
        const target = ex.cardio ?? {};
        const filled: CardioValues = { ...Object.fromEntries((Object.keys(METRICS) as CardioMetric[]).filter((k) => target[k] != null).map((k) => [k, target[k]])), ...s.cardio };
        await db.sets.update(s.id, { done: true, completedAt: Date.now(), cardio: filled, reps: filled.min != null ? Math.round(filled.min) : null });
        if (navigator.vibrate && settings?.vibrate) navigator.vibrate(30);
        setOpenIdx(null);
        const next = nextPending(s.exOrder);
        if (next >= 0) goTo(next);
        return;
      }
      const kg = s.kg ?? s.targetKg ?? carryKg(s);
      const reps = s.reps ?? (typeof s.targetReps === "number" ? s.targetReps : timedTarget(s.targetReps));
      await db.sets.update(s.id, { done: true, completedAt: Date.now(), kg, reps });
      if (navigator.vibrate && settings?.vibrate) navigator.vibrate(30);
      if (s.kind === "work" && !s.mode && kg && reps) celebrate(ex.name, s.id, e1rm(kg, reps, s.rir)).catch(() => {});
      const list = byEx.get(s.exOrder) ?? [];
      // aquecimento não marcado não segura o avanço: acabou o trabalho, vai para o próximo
      const remaining = list.filter((x) => !x.done && x.id !== s.id && (x.kind === "work" || s.kind !== "work"));

      const g = groups[s.exOrder];
      if (g && s.kind === "work") {
        const pending = (i: number) => !session!.exercises[i].skipped && (byEx.get(i) ?? []).some((x) => x.kind === "work" && !x.done && x.id !== s.id);
        const pos = g.members.indexOf(s.exOrder);
        const next = [...g.members.slice(pos + 1), ...g.members.slice(0, pos + 1)].find(pending);
        if (next !== undefined) {
          if (next > s.exOrder) {
            setRest(null);
            toast(tr("Superset → {0}", session!.exercises[next].name));
          } else startRest(ex.restSec, tr("Rodada feita · volta para {0}", session!.exercises[next].name));
          goTo(next);
          return;
        }
      }
      if (remaining.length === 0) {
        setOpenIdx(null);
        const next = nextPending(s.exOrder);
        startRest(ex.restSec, next >= 0 ? tr("Próximo: {0}", session!.exercises[next].name) : tr("Último exercício feito"));
        if (next >= 0) goTo(next);
      } else startRest(s.kind === "warmup" ? 60 : ex.restSec, ex.name);
    } catch (e) {
      toastError(e);
    }
  }

  /** Recorde na hora: a série bateu o melhor 1RM estimado do exercício (de sempre; a 1ª vez não conta). */
  async function celebrate(name: string, setId: string, now1: number) {
    const others = await db.sets.where("exercise").equals(name).filter((x) => x.id !== setId && x.done && x.kind === "work" && !x.mode).toArray();
    const best = Math.max(0, ...others.map((x) => e1rm(x.kg ?? 0, x.reps ?? 0, x.rir)));
    if (best <= 0 || now1 <= best + 0.05) return;
    if (navigator.vibrate && settings?.vibrate) navigator.vibrate([60, 60, 60, 60, 180]);
    toast(tr("🏆 Recorde em {0}: 1RM estimado {1} kg (antes {2})", name, fmtKg(Math.round(now1 * 10) / 10), fmtKg(Math.round(best * 10) / 10)));
  }

  /** Deslizar para remover: sai na hora e o aviso oferece "Desfazer" (séries feitas voltam junto). */
  async function removeWithUndo(i: number) {
    try {
      const ex = session!.exercises[i];
      const snap = await db.sets.where({ sessionId: session!.id }).filter((x) => x.exOrder === i).toArray();
      await removeExerciseFromSession(session!, i);
      if (openIdx != null && openIdx > i) setOpenIdx(openIdx - 1);
      toastUndo(tr("{0} removido", ex.name), () => restoreSessionExercise(session!.id, i, ex, snap).then(() => setOpenIdx(null)));
    } catch (e) {
      toastError(e);
    }
  }

  async function addExercises(picked: Exercise[]) {
    try {
      for (const e of picked) {
        const d = defaultsFor(e.kind === "cardio" ? tr("Cardio") : e.pattern, e.unilateral);
        await addExerciseToSession(session!, e.name, { sets: d.sets, reps: d.reps, restSec: settings?.defaultRest ?? d.restSec, rir: d.rir, perSide: d.perSide });
      }
      goTo(session!.exercises.length);
      toast(`${picked[0]?.name ?? tr("Exercício")} adicionado`);
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div className="screen full">
      <div className="wk-head">
        <div className="row" style={{ gap: 8 }}>
          <button className="icon-btn sm" onClick={() => go("inicio")} aria-label={tr("Minimizar")}><Icon name="down" /></button>
          <span className="badge sm" style={{ ["--c" as string]: session.color }}>{session.dayKey}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="bold ellipsis small">{session.dayName}</div>
            {retro ? <div className="tiny muted">{tr("Registro de")} {fmtShort(session.date)}</div> : <Elapsed startedAt={session.startedAt} />}
          </div>
          <button className="icon-btn sm" onClick={() => setTimerSheet(true)} aria-label={tr("Timer")}><Icon name="stopwatch" size={18} /></button>
          <button className="icon-btn sm" onClick={() => setAdding(true)} aria-label={tr("Adicionar exercício")}><Icon name="plus" size={18} /></button>
          {/* "Finalizar" só chama atenção quando acabou: no meio do treino o destaque é o ✓ da série */}
          <button className={`btn sm ${work.length > 0 && doneWork.length === work.length ? "primary" : ""}`} onClick={() => setFinishing(true)}>{tr("Finalizar")}</button>
        </div>
        <div className="row" style={{ marginTop: 8, gap: 10 }}>
          <div className="progress grow"><i style={{ width: `${pct * 100}%` }} /></div>
          <span className="tiny muted num">{doneWork.length}/{work.length} {tr("séries")}</span>
          <div className="segmented mini" role="group" aria-label={tr("Modo do treino")}>
            <button aria-pressed={!serie} onClick={() => serie && toggleSerie()}>{tr("Lista")}</button>
            <button aria-pressed={serie} onClick={() => !serie && toggleSerie()}>{tr("Série")}</button>
          </div>
        </div>
      </div>

      {session.exercises.length === 0 && (
        <button className="card tap center" style={{ padding: 32 }} onClick={() => setAdding(true)}>
          <span className="ico" style={{ margin: "0 auto 12px", width: 52, height: 52 }}><Icon name="plus" size={24} /></span>
          <div className="title-md">{tr("Adicionar o primeiro exercício")}</div>
          <div className="small muted">{tr("Escolha por grupo muscular")}</div>
        </button>
      )}

      {(() => {
        const renderEx = (i: number, isCurrent: boolean, active = isCurrent) => {
          const ex = session.exercises[i];
          const list = byEx.get(i) ?? [];
          const doneCount = list.filter((s) => s.done && s.kind === "work").length;
          const workCount = list.filter((s) => s.kind === "work").length;
          const allDone = workCount > 0 && doneCount === workCount;
          const prev = previous?.get(ex.name) ?? [];
          const info = lib.get(ex.name);
          const isBar = info?.equipment === "Barra";
          const g = groups[i];
          let w = 0;
          let k = 0;
          const block = ex.block ?? "main";
          const showBlock = session.exercises.some((e) => e.block && e.block !== "main");
          const open = isCurrent;
          const inGroupBlock = isCurrent && !!g && g.members.length > 1;
          return (
            <div key={`${i}-${ex.name}`} data-ex={i} className={`ex-card ${allDone ? "done" : ""} ${ex.skipped ? "skipped" : ""} ${g ? "in-superset" : ""}`}>
              <button className="ex-head" onClick={() => { if (!active) { setOpenIdx(i); if (!open) window.scrollTo({ top: 0, behavior: "smooth" }); } }} aria-expanded={open}>
                <ProgressDot done={doneCount} total={workCount} />
                <ExThumb name={ex.name} size={48} group={info?.group} muscles={info?.muscles} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="name">{ex.name}</div>
                  <div className="row wrap small muted" style={{ gap: 6, marginTop: 4 }}>
                    <span className="num">{ex.kind === "cardio" ? fmtCardio(list[0]?.done ? list[0].cardio : ex.cardio, ex.machine, ex.cardio?.zone) || "cardio" : summaryOf(list, ex.perSide)}</span>
                    {showBlock && block !== "main" && <span className="tag">{tr(BLOCK_LABEL[block])}</span>}
                    {g && <span className="tag violet">{g.letter}{g.members.indexOf(i) + 1}</span>}
                    {ex.plannedName !== ex.name && <span className="tag">{tr("substituto")}</span>}
                    {ex.priority && <span className="tag outline">{tr("prioridade")}</span>}
                    {ex.restricted && <span className={`tag ${ex.restricted === "vetoed" ? "danger" : "warn"}`}>{ex.restricted === "vetoed" ? tr("vetado") : tr("suspenso")}</span>}
                    {ex.skipped && !ex.restricted && <span className="tag">{tr("pulado")}</span>}
                  </div>
                </div>
                {!open && <span className="chev"><Icon name="chevron" size={18} /></span>}
              </button>

              {open && (
                <div className="ex-body">
                  <div className="row wrap small muted" style={{ gap: 12, marginBottom: 10 }}>
                    {ex.kind !== "cardio" && ex.restSec > 0 && <span className="row" style={{ gap: 4 }}><Icon name="timer" size={14} /> {fmtRest(ex.restSec)}</span>}
                    {ex.rir && !noRir && <Term id="rir">{tr("RIR")} {ex.rir}</Term>}
                    {prev.length > 0 && <span>{tr("Última:")} <span className="num">{ex.kind === "cardio" ? fmtCardio(prev[0].cardio, ex.machine) || "—" : prev.map((p) => `${p.kg != null ? fmtKg(p.kg) : tr("PC")}×${p.reps ?? "?"}`).join(", ")}</span></span>}
                  </div>
                  {moveFor === i ? (
                    <div className="motion-card inline" style={{ marginBottom: 10 }}>
                      <MotionView name={ex.name} group={info?.group} muscles={info?.muscles} aspect={1.6} height3d={240} />
                      <div style={{ padding: "8px 6px 4px" }}><HowTo name={ex.name} compact /></div>
                    </div>
                  ) : showMove && !serie && active && (
                    <div className="wk-focus">
                      <div className="fig"><MotionFigure name={ex.name} group={info?.group} muscles={info?.muscles} aspect={1.7} label="" /></div>
                      <details className="how"><summary>{tr("Como fazer")}</summary><HowTo name={ex.name} compact /></details>
                    </div>
                  )}
                  {g && !inGroupBlock && (
                    <div className="ss-seq small">
                      <Term id="superset">{tr("Superset {0}", g.letter)}</Term>
                      {g.members.map((m, j) => <span key={m} className={m === i ? "on" : ""}>{j > 0 && "→ "}{g.letter}{j + 1} {session.exercises[m].name}</span>)}
                      <span className="muted">{tr("· descanso só no fim da rodada")}</span>
                    </div>
                  )}
                  {ex.handle && <div className="alert info small" style={{ marginBottom: 10 }}><Icon name="grip" size={16} /> {ex.handle}</div>}
                  {ex.notes && <div className="small muted" style={{ marginBottom: 10 }}>{ex.notes}</div>}
                  {ex.why && <details className="why"><summary>{tr("Por que este exercício")}</summary><div>{ex.why}</div></details>}
                  {ex.prescriptionNote && <div className="small" style={{ marginBottom: 10, color: "var(--amber)" }}>{ex.prescriptionNote}</div>}
                  {ex.restricted && (
                    <div className="alert small" style={{ marginBottom: 10 }}>
                      <Icon name="alert" size={16} />
                      <div>{ex.restricted === "vetoed" ? tr("Exercício vetado.") : tr("Exercício suspenso.")} {tr("Ele começa pulado.")}{ex.sub ? tr(" Substituto: {0}.", ex.sub) : ""}</div>
                    </div>
                  )}

                  {!ex.skipped && ex.kind === "cardio" && list[0] && (
                    <CardioPanel s={list[0]} machine={ex.machine ?? "treadmill"} target={ex.cardio} onToggle={() => toggleSet(list[0])} />
                  )}
                  {!ex.skipped && ex.kind !== "cardio" && serie && (
                    <SetFocus
                      list={list}
                      prev={prev}
                      carry={carryKg}
                      kgStep={isBar ? 5 : 2.5}
                      plates={(kg) => (isBar && kg > 0 ? <PlateChips kg={kg} bar={settings?.barKg ?? 20} plates={settings?.plates} /> : null)}
                      onToggle={toggleSet}
                      onTimer={(secs, label, id) => startRest(secs, tr("{0} · série {1}", ex.name, label), id)}
                      onMenu={setNoteFor}
                      noRir={noRir}
                    />
                  )}
                  {!ex.skipped && ex.kind !== "cardio" && !serie && (
                    <div className="sets">
                      <span className="hd">#</span>
                      <span className="hd">{tr("Antes")}</span>
                      <span className="hd">{tr("kg")}</span>
                      <span className="hd">{tr("Reps")}</span>
                      <span className="hd">{!noRir && <Term id="rir">{tr("RIR")}</Term>}</span>
                      <span className="hd" />
                      {list.map((s) => {
                        const isNext = !s.done && s.id === list.find((x) => !x.done)?.id;
                        const label = s.kind === "warmup" ? `A${++w}` : String(++k);
                        const p = s.kind === "work" ? prev[k - 1] : undefined;
                        const carry = carryKg(s);
                        const shownKg = s.kg ?? s.targetKg ?? carry;
                        const secs = timedTarget(s.targetReps);
                        return (
                          <SetRow
                            key={s.id}
                            s={s}
                            label={label}
                            prev={p ? `${p.kg != null ? fmtKg(p.kg) : tr("PC")}×${p.reps ?? "?"}` : s.kind === "warmup" ? tr("aprox.") : "—"}
                            carry={carry}
                            next={isNext}
                            onMenu={() => setNoteFor(s)}
                            onToggle={() => toggleSet(s)}
                            noRir={noRir}
                            extra={
                              (isBar && shownKg != null && shownKg > 0) || (secs && !s.done) || s.note ? <>
                                {isBar && shownKg != null && shownKg > 0 && <PlateChips kg={shownKg} bar={settings?.barKg ?? 20} plates={settings?.plates} />}
                                {secs && !s.done && (
                                  <button className="tag accent" onClick={() => startRest(secs, tr("{0} · série {1}", ex.name, label), s.id)}>
                                    <Icon name="stopwatch" size={12} /> {secs} {tr("s")}
                                  </button>
                                )}
                                {s.note && <button className="tiny muted" style={{ textAlign: "left" }} onClick={() => setNoteFor(s)}>✎ {s.note}</button>}
                              </> : null
                            }
                          />
                        );
                      })}
                    </div>
                  )}

                  <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                    {!ex.skipped && ex.kind !== "cardio" && <button className="btn sm" onClick={() => addSet(session, i).catch(toastError)}><Icon name="plus" size={16} /> {tr("Série")}</button>}
                    <button className="btn sm" onClick={() => setSwapFor(i)}><Icon name="swap" size={16} /> {ex.name === ex.plannedName ? tr("Trocar") : tr("Original")}</button>
                    <button className="btn sm" aria-pressed={moveFor === i} onClick={() => setMoveFor(moveFor === i ? null : i)}><Icon name="play" size={15} /> {moveFor === i ? tr("Fechar") : tr("Maior / 3D")}</button>
                    <button className="btn sm ghost" onClick={toggleMove}>{showMove ? tr("Esconder figura") : tr("Mostrar figura")}</button>
                    <button className="btn sm ghost" onClick={async () => { try { await setSkipped(session, i, !ex.skipped); if (!ex.skipped) { const n = nextPending(i); if (n >= 0) goTo(n); } } catch (e) { toastError(e); } }}><Icon name="skip" size={16} /> {ex.skipped ? tr("Fazer") : tr("Pular")}</button>
                    <button className="btn sm ghost" onClick={() => setMoreFor(i)} aria-label={tr("Mais opções")}><Icon name="more" size={16} /></button>
                  </div>
                </div>
              )}
            </div>
          );
        };
        const isDone = (i: number) => {
          const l = (byEx.get(i) ?? []).filter((s) => s.kind === "work" || s.mode);
          return session.exercises[i].skipped || (l.length > 0 && l.every((s) => s.done));
        };
        const order = session.exercises.map((_, i) => i);
        const cur = current != null && current >= 0 && current < session.exercises.length ? current : null;
        // superset: os exercícios da rodada ficam juntos em cima (sem ir e voltar entre telas)
        const block = cur != null && groups[cur] ? groups[cur]!.members.filter((i) => i === cur || !session.exercises[i].skipped) : cur != null ? [cur] : [];
        const rest = (cur == null ? order : [...order.slice(cur + 1), ...order.slice(0, cur)]).filter((i) => !block.includes(i));
        const upNext = rest.filter((i) => !isDone(i));
        const finished = rest.filter(isDone);
        const g0 = cur != null ? groups[cur] : null;
        return (
          <div className="stack">
            {block.length > 1 && g0 ? (
              <div className="ss-block">
                <div className="ss-block-head small"><Term id="superset">{tr("Superset {0}", g0.letter)}</Term> <span className="muted">{tr("· uma série de cada, descanso no fim da rodada")}</span></div>
                {/* lista: todos abertos; modo série: só o da vez aberto, o outro logo abaixo (um toque troca) */}
                {block.map((i) => renderEx(i, !serie || i === cur, i === cur))}
              </div>
            ) : cur != null && renderEx(cur, true)}
            {cur == null && session.exercises.length > 0 && upNext.length === 0 && (
              <button className="card tap row" onClick={() => setFinishing(true)}>
                <span className="ico"><Icon name="check" size={20} /></span>
                <div className="grow" style={{ textAlign: "left" }}><div className="bold">{tr("Tudo feito")}</div><div className="small muted">{tr("Toque para finalizar o treino")}</div></div>
                <Icon name="chevron" />
              </button>
            )}
            {serie && upNext.length > 0 && (
              <button className="card tap row" style={{ gap: 10 }} onClick={toggleSerie}>
                <div className="grow" style={{ minWidth: 0, textAlign: "left" }}><div className="tiny muted">{tr("A seguir")}</div><div className="bold ellipsis">{session.exercises[upNext[0]].name}</div></div>
                {upNext.length > 1 && <span className="tag">+{upNext.length - 1}</span>}
                <span className="tiny muted">{tr("ver lista")}</span>
              </button>
            )}
            {!serie && upNext.length > 0 && <div className="row between" style={{ margin: "8px 2px 0", gap: 8 }}><span className="eyebrow">{tr("A seguir")}</span><span className="tiny dim">{tr("segure para mudar a ordem · deslize para remover")}</span></div>}
            {!serie && <GestureList
              items={upNext}
              keyOf={(i) => `${session.exercises[i].name}#${i}`}
              render={(i) => renderEx(i, false)}
              onDelete={(k) => removeWithUndo(upNext[k])}
              onMove={(from, to) => {
                // ordem nova: feitos, o atual e "a seguir" na ordem escolhida (as séries vão junto)
                const order = [...[...finished].sort((a, b) => a - b), ...block, ...moveItem(upNext, from, to)];
                reorderSessionExercises(session, order).then(() => { if (cur != null) setOpenIdx(order.indexOf(cur)); }).catch(toastError);
              }}
            />}
            {!serie && finished.length > 0 && <div className="eyebrow" style={{ margin: "8px 2px 0" }}>{tr("Feitos")}</div>}
            {!serie && <GestureList items={finished} keyOf={(i) => `${session.exercises[i].name}#${i}`} render={(i) => renderEx(i, false)} onDelete={(k) => removeWithUndo(finished[k])} />}
          </div>
        );
      })()}

      {session.exercises.length > 0 && (
        <button className="btn block" style={{ marginTop: 14 }} onClick={() => setAdding(true)}><Icon name="plus" size={16} /> {tr("Adicionar exercício")}</button>
      )}

      {session.exercises.length > 0 && settings?.liveNotify !== false && typeof Notification !== "undefined" && Notification.permission === "default" && (
        <div className="card row" style={{ marginTop: 12, gap: 10 }}>
          <Icon name="bolt" size={18} />
          <div className="grow small">{tr("Ver o treino e o descanso na barra de notificações quando sair do app?")}</div>
          <button className="btn sm primary" onClick={() => Notification.requestPermission().then(() => setSetting("liveNotify", Notification.permission === "granted")).catch(toastError)}>{tr("Ativar")}</button>
          <button className="btn sm ghost" onClick={() => setSetting("liveNotify", false).catch(toastError)}>{tr("Agora não")}</button>
        </div>
      )}

      <RestTimer
        rest={rest}
        onChange={setRest}
        vibrate={settings?.vibrate ?? true}
        sound={settings?.sound ?? true}
        onTimedDone={(setId, secs) => db.sets.update(setId, { reps: secs }).catch(toastError)}
      />

      <ExercisePicker open={adding} multi onClose={() => setAdding(false)} onPick={addExercises} />

      <Sheet open={timerSheet} onClose={() => setTimerSheet(false)}>
        <div className="stack">
          <div className="title-md">{tr("Timer")}</div>
          <div className="small muted">{tr("Inicia um descanso avulso (vibra e toca no fim).")}</div>
          <div className="grid-3">
            {[30, 60, 90, 120, 180, 300].map((s) => (
              <button key={s} className="btn" onClick={() => { startRest(s, tr("Timer")); setTimerSheet(false); }}>{fmtRest(s)}</button>
            ))}
          </div>
          {rest && <button className="btn danger block" onClick={() => { setRest(null); setTimerSheet(false); }}>{tr("Parar timer atual")}</button>}
        </div>
      </Sheet>

      <Sheet open={swapFor !== null} onClose={() => setSwapFor(null)}>
        {swapFor !== null && <SwapSheet session={session} exOrder={swapFor} library={library ?? []} onDone={() => setSwapFor(null)} />}
      </Sheet>

      <Sheet open={noteFor !== null} onClose={() => setNoteFor(null)}>
        {noteFor && <NoteSheet set={noteFor} canRemove={!noteFor.done && (byEx.get(noteFor.exOrder)?.length ?? 0) > 1} onDone={() => setNoteFor(null)} />}
      </Sheet>

      <Sheet open={moreFor !== null} onClose={() => setMoreFor(null)}>
        {moreFor !== null && session.exercises[moreFor] && (
          <div className="stack">
            <div className="title-md">{session.exercises[moreFor].name}</div>
            <div className="group">
              <a className="item" href={href("exercicio", session.exercises[moreFor].name)}><Icon name="history" size={18} /><div className="grow t">{tr("Histórico do exercício")}</div><Icon name="chevron" size={16} /></a>
              <button className="item" style={{ color: "var(--danger)" }} onClick={() => { const i = moreFor; setMoreFor(null); setRemoveEx(i); }}><Icon name="trash" size={18} /><div className="grow t" style={{ textAlign: "left" }}>{tr("Remover exercício")}</div></button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={removeEx !== null} onClose={() => setRemoveEx(null)} footer={
        <>
          <AsyncButton className="btn danger block" busyLabel={tr("Removendo…")} onClick={async () => { await removeExerciseFromSession(session, removeEx!); setRemoveEx(null); setOpenIdx(null); toast(tr("Exercício removido do treino")); }}>{tr("Remover do treino")}</AsyncButton>
          <button className="btn ghost block" onClick={() => setRemoveEx(null)}>{tr("Cancelar")}</button>
        </>
      }>
        {removeEx !== null && session.exercises[removeEx] && (
          <>
            <div className="title-md">{tr("Remover")} {session.exercises[removeEx].name}?</div>
            <p className="small muted">{tr("As séries dele neste treino serão apagadas. O plano não muda.")}</p>
          </>
        )}
      </Sheet>

      {finishing && <FinishSheet session={session} sets={sets} retro={retro} onClose={() => setFinishing(false)} onDiscard={() => { setFinishing(false); setDiscarding(true); }} />}

      <Sheet open={discarding} onClose={() => setDiscarding(false)} footer={
        <>
          <AsyncButton className="btn danger block" busyLabel={tr("Descartando…")} onClick={async () => { await deleteSession(session.id); setRest(null); toast(tr("Treino descartado")); go("inicio"); }}>
            <Icon name="trash" size={16} /> {tr("Descartar treino")}
          </AsyncButton>
          <button className="btn ghost block" onClick={() => setDiscarding(false)}>{tr("Voltar ao treino")}</button>
        </>
      }>
        <div className="title-md">{tr("Descartar este treino?")}</div>
        <p className="small muted">{tr("Nada deste treino fica no histórico (")}{doneWork.length} {tr("séries marcadas serão apagadas).")}</p>
      </Sheet>
    </div>
  );
}

function summaryOf(list: SetEntry[], perSide?: boolean): string {
  const work = list.filter((s) => s.kind === "work");
  if (!work.length) return tr("sem séries");
  const reps = work.every((s) => s.targetReps === work[0].targetReps) ? `${work.length}×${work[0].targetReps || "?"}` : work.map((s) => s.targetReps).join("·");
  const kgs = work.map((s) => s.targetKg).filter((k): k is number => k != null);
  const top = kgs.length ? tr(" · {0} kg", fmtKg(Math.max(...kgs))) : "";
  return `${reps}${perSide ? "/lado" : ""}${top}`;
}

function ProgressDot({ done, total }: { done: number; total: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  const full = total > 0 && done === total;
  return (
    <div style={{ position: "relative", width: 40, height: 40, flex: "none" }}>
      <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="20" cy="20" r={r} fill={full ? "var(--accent)" : "none"} stroke="rgba(255,255,255,.08)" strokeWidth="3.5" />
        {!full && <circle cx="20" cy="20" r={r} fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" />}
      </svg>
      <span className="num" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 800, color: full ? "#fff" : "var(--text-2)" }}>
        {full ? <Icon name="check" size={18} stroke={3} /> : `${done}/${total}`}
      </span>
    </div>
  );
}

/** Cardio: uma sessão com as métricas do aparelho (meta do plano como dica). */
function CardioPanel({ s, machine, target, onToggle }: { s: SetEntry; machine: CardioMachine; target?: Partial<Record<CardioMetric, number>> & { zone?: string }; onToggle: () => void }) {
  const metrics = MACHINE_METRICS[machine];
  const save = (k: CardioMetric, v: number | null) => {
    const next = { ...s.cardio };
    if (v == null) delete next[k];
    else next[k] = v;
    db.sets.update(s.id, { cardio: next }).catch(toastError);
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      {target?.zone && <div className="small" style={{ color: "var(--amber)" }}>{tr("Meta:")} {target.zone}</div>}
      <div className="cardio-grid">
        {metrics.map((k) => (
          <label key={k} className={`cardio-field ${s.done ? "row-done" : ""}`}>
            <span className="tiny muted">{tr(METRICS[k].label)}{METRICS[k].unit ? ` (${METRICS[k].unit})` : ""}</span>
            <NumInput value={s.cardio?.[k] ?? null} placeholder={target?.[k] != null ? String(target[k]).replace(".", ",") : "—"} decimal={METRICS[k].decimal} onCommit={(v) => save(k, v)} />
          </label>
        ))}
      </div>
      <button className={`btn ${s.done ? "" : "primary"} block`} onClick={onToggle}>
        <Icon name="check" size={18} stroke={3} /> {s.done ? tr("Feito — desmarcar") : tr("Concluir cardio")}
      </button>
    </div>
  );
}

/** Modo série: só a série da vez, números grandes e ± (para usar entre as séries, sem mirar em campo pequeno). */
function SetFocus({ list, prev, carry, kgStep, plates, onToggle, onTimer, onMenu, noRir }: {
  noRir?: boolean;
  list: SetEntry[];
  /** barra: 5 kg (a menor anilha é 2,5 de cada lado) */
  kgStep: number;
  prev: SetEntry[];
  carry: (s: SetEntry) => number | null;
  plates: (kg: number) => React.ReactNode;
  onToggle: (s: SetEntry) => void;
  onTimer: (secs: number, label: string, setId: string) => void;
  onMenu: (s: SetEntry) => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  // deslizar para o lado troca de série (começando fora dos campos)
  const swipe = useRef<{ x: number; y: number } | null>(null);
  let w = 0;
  let k = 0;
  const items = list.map((s) => {
    const label = s.kind === "warmup" ? `A${++w}` : String(++k);
    return { s, label, p: s.kind === "work" ? prev[k - 1] : undefined };
  });
  const cur = items.find((x) => x.s.id === pick) ?? items.find((x) => !x.s.done) ?? items.at(-1);
  if (!cur) return null;
  const { s, label, p } = cur;
  const kg = s.kg ?? s.targetKg ?? carry(s);
  const secs = timedTarget(s.targetReps);
  const reps = s.reps ?? (typeof s.targetReps === "number" ? s.targetReps : secs);
  const save = (patch: Partial<SetEntry>) => db.sets.update(s.id, patch).catch(toastError);
  const fmtSet = (x: SetEntry) => `${x.kg != null ? fmtKg(x.kg) : tr("PC")}×${x.reps ?? "?"}`;
  const at = items.indexOf(cur);
  const target = [s.targetKg != null ? `${fmtKg(s.targetKg)} kg` : null, s.targetReps ? `${s.targetReps}${secs ? " s" : ""}` : null].filter(Boolean).join(" × ");
  return (
    <div
      className="sf"
      onPointerDown={(e) => { swipe.current = (e.target as HTMLElement).closest("input") ? null : { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const st = swipe.current;
        swipe.current = null;
        if (!st) return;
        const dx = e.clientX - st.x;
        if (Math.abs(dx) < 70 || Math.abs(e.clientY - st.y) > 40) return;
        const to = items[at + (dx < 0 ? 1 : -1)];
        if (to) setPick(to.s.id);
      }}
    >
      <div className="sf-chips">
        {items.map((x) => (
          <button key={x.s.id} className={`sf-chip${x.s.done ? " on" : ""}${x === cur ? " cur" : ""}${x.s.kind === "warmup" ? " w" : ""}`} onClick={() => setPick(x.s.id)} aria-label={tr("Série {0}", x.label)}>
            <b>{x.label}</b>{x.s.done && <small className="num">{fmtSet(x.s)}</small>}
          </button>
        ))}
      </div>
      <div className="row between" style={{ gap: 8, alignItems: "baseline" }}>
        <b>{s.kind === "warmup" ? tr("Aquecimento {0}", label) : tr("Série {0} de {1}", label, k)}</b>
        {target && <span className="sf-target num">{tr("Meta")} {target}</span>}
      </div>
      {p && (
        <div className="row small muted" style={{ gap: 8 }}>
          <span>{tr("Antes:")} <span className="num">{fmtSet(p)}</span></span>
          {!s.done && !s.mode && <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => save({ kg: p.kg, reps: p.reps })}>{tr("Igual à última")}</button>}
        </div>
      )}
      <div className="sf-grid">
        {!s.mode && <BigNum key={`kg-${s.id}`} label={tr("kg")} value={kg} step={kgStep} decimal onChange={(v) => save({ kg: v })} />}
        <BigNum key={`r-${s.id}`} label={secs ? tr("segundos") : tr("Reps")} value={reps} step={1} onChange={(v) => save({ reps: v })} />
      </div>
      {kg != null && !s.mode && plates(kg)}
      {s.kind === "work" && !s.mode && !noRir && (
        <div className="sf-rir" role="group" aria-label={tr("RIR")}>
          <span className="tiny muted"><Term id="rir">{tr("RIR")}</Term></span>
          {[0, 1, 2, 3, 4].map((r) => <button key={r} aria-pressed={s.rir === r} onClick={() => save({ rir: s.rir === r ? null : r })}>{r}</button>)}
        </div>
      )}
      {secs != null && secs > 0 && !s.done && <button className="btn block" onClick={() => onTimer(secs, label, s.id)}><Icon name="stopwatch" size={16} /> {secs} {tr("s")}</button>}
      <button className={`btn lg block sf-check ${s.done ? "" : "primary"}`} onClick={() => { setPick(null); onToggle(s); }}>
        <Icon name="check" size={22} stroke={3} /> {s.done ? tr("Feita — desmarcar") : tr("Concluir série")}
      </button>
      <button className="btn ghost sm" style={{ alignSelf: "center" }} onClick={() => onMenu(s)}>{s.note ? `✎ ${s.note}` : tr("Nota ou remover série")}</button>
    </div>
  );
}

function BigNum({ label, value, step, decimal, onChange }: { label: string; value: number | null; step: number; decimal?: boolean; onChange: (v: number | null) => void }) {
  const by = (d: number) => onChange(Math.max(0, Math.round(((value ?? 0) + d) * 100) / 100));
  return (
    <div className="sf-field">
      <span className="tiny muted">{label}</span>
      <div className="sf-row">
        <button aria-label={tr("Diminuir")} onClick={() => by(-step)}>−</button>
        <NumInput value={value} placeholder="—" decimal={decimal} onCommit={onChange} />
        <button aria-label={tr("Aumentar")} onClick={() => by(step)}>+</button>
      </div>
    </div>
  );
}

function SetRow({ s, label, prev, carry, next, onMenu, onToggle, extra, noRir }: { s: SetEntry; label: string; prev: string; carry: number | null; next?: boolean; onMenu: () => void; onToggle: () => void; extra: React.ReactNode; noRir?: boolean }) {
  const save = (patch: Partial<SetEntry>) => db.sets.update(s.id, patch).catch(toastError);
  return (
    <>
      <div className={s.done ? "row-done" : next ? "row-next" : ""} style={{ display: "contents" }}>
        <button className={`idx ${s.kind === "warmup" ? "w" : ""}`} onClick={onMenu} aria-label={tr("Série {0}: nota ou remover", label)}>{label}{s.note ? <i className="note-dot" /> : null}</button>
        <span className="prev">{prev}</span>
        {/* mobilidade/alongamento: só reps ou segundos (sem carga nem RIR) */}
        <NumInput value={s.kg} placeholder={s.mode ? "—" : s.targetKg != null ? fmtKg(s.targetKg) : carry != null ? fmtKg(carry) : "kg"} decimal onCommit={(kg) => save({ kg })} disabled={!!s.mode} />
        <NumInput value={s.reps} placeholder={String(s.targetReps || "reps")} onCommit={(reps) => save({ reps })} />
        {noRir ? <span /> : <NumInput value={s.rir} placeholder={s.kind === "warmup" || s.mode ? "" : "RIR"} onCommit={(rir) => save({ rir })} disabled={s.kind === "warmup" || !!s.mode} />}
        <button className={`check ${s.done ? "on" : ""}`} onClick={onToggle} aria-label={s.done ? tr("Desmarcar série") : tr("Concluir série")}>
          <Icon name="check" size={20} stroke={3} />
        </button>
      </div>
      {extra && <div className="set-extra">{extra}</div>}
    </>
  );
}

/**
 * Campo numérico das séries. Grava 0,6 s depois de parar de digitar e ao sair do campo (não a cada tecla:
 * cada gravação redesenha o treino). Ao focar, rola o campo para o meio da tela, acima do teclado.
 */
export function NumInput({ value, placeholder, decimal, disabled, onCommit }: { value: number | null; placeholder: string; decimal?: boolean; disabled?: boolean; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : decimal ? fmtKg(value) : String(value));
  const focused = useRef(false);
  const timer = useRef<number | null>(null);
  const pending = useRef<string | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => {
    if (!focused.current && pending.current === null) setText(value == null ? "" : decimal ? fmtKg(value) : String(value));
  }, [value, decimal]);
  const flush = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const t = pending.current;
    pending.current = null;
    if (t === null) return;
    const n = t.trim() === "" ? null : Number(t.replace(",", "."));
    if (n === null || Number.isFinite(n)) commitRef.current(n);
  };
  useEffect(() => flush, []);
  return (
    <input
      inputMode={decimal ? "decimal" : "numeric"}
      enterKeyHint="next"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={(e) => {
        focused.current = true;
        const el = e.target;
        el.select();
        // o teclado leva ~0,3 s para abrir; depois disso o campo vai para o meio da área visível
        window.setTimeout(() => document.activeElement === el && el.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
      }}
      onBlur={() => { focused.current = false; flush(); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onChange={(e) => {
        setText(e.target.value);
        pending.current = e.target.value;
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 600);
      }}
    />
  );
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const now = useNow(1000);
  return <div className="clock" style={{ fontSize: 15 }}>{fmtClock(now - startedAt)}</div>;
}

/* ---------------- descanso / timer ---------------- */

let audioCtx: AudioContext | null = null;
function beep() {
  try {
    audioCtx ??= new AudioContext();
    const t = audioCtx.currentTime;
    [0, 0.18, 0.36].forEach((d, i) => {
      const o = audioCtx!.createOscillator();
      const g = audioCtx!.createGain();
      o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.15);
      o.connect(g).connect(audioCtx!.destination);
      o.start(t + d);
      o.stop(t + d + 0.16);
    });
  } catch {
    /* áudio indisponível */
  }
}

function RestTimer({ rest, onChange, vibrate, sound, onTimedDone }: { rest: RestState | null; onChange: (r: RestState | null) => void; vibrate: boolean; sound: boolean; onTimedDone: (setId: string, secs: number) => void }) {
  const now = useNow(250);
  const fired = useRef<number | null>(null);
  const left = rest ? rest.endsAt - now : 0;
  useEffect(() => {
    if (!rest || left > 0 || fired.current === rest.endsAt) return;
    fired.current = rest.endsAt;
    if (vibrate && navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 400]);
    if (sound) beep();
    if (rest.setId) onTimedDone(rest.setId, rest.total);
  }, [rest, left, vibrate, sound, onTimedDone]);
  useEffect(() => {
    if (rest && left < -60_000) onChange(null);
  }, [rest, left, onChange]);
  if (!rest) return null;
  const over = left <= 0;
  const pct = Math.max(0, Math.min(1, 1 - left / (rest.total * 1000)));
  const R = 28;
  const C = 2 * Math.PI * R;
  return (
    <div className={`rest ${over ? "over" : ""}`}>
      <div className="inner">
        <div style={{ position: "relative", width: 66, height: 66, flex: "none" }}>
          <svg width="66" height="66" viewBox="0 0 66 66" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="33" cy="33" r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5" />
            <circle cx="33" cy="33" r={R} fill="none" stroke={over ? "var(--blue)" : "var(--accent)"} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: "stroke-dashoffset .25s linear" }} />
          </svg>
          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><Icon name={rest.setId ? "stopwatch" : "timer"} size={18} /></span>
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="tiny muted bold" style={{ textTransform: "uppercase", letterSpacing: ".08em" }}>{over ? (rest.setId ? tr("Tempo!") : tr("Bora!")) : rest.setId ? tr("Série por tempo") : tr("Descanso")}</div>
          <div className="clock" style={{ fontSize: 32, lineHeight: 1.1 }}>{over ? `+${fmtClock(-left)}` : fmtClock(left + 999)}</div>
          <div className="tiny muted ellipsis">{rest.label}</div>
        </div>
        <button className="icon-btn" onClick={() => onChange({ ...rest, endsAt: rest.endsAt - 15_000, total: Math.max(15, rest.total - 15) })} aria-label={tr("Menos 15 segundos")}><span className="tiny bold">−15</span></button>
        <button className="icon-btn" onClick={() => onChange({ ...rest, endsAt: Math.max(Date.now(), rest.endsAt) + 15_000, total: rest.total + 15 })} aria-label={tr("Mais 15 segundos")}><span className="tiny bold">+15</span></button>
        <button className="icon-btn" onClick={() => onChange(null)} aria-label={tr("Fechar")}><Icon name="close" size={18} /></button>
      </div>
    </div>
  );
}

/* ---------------- folhas ---------------- */

const info0 = (library: Exercise[], name: string) => library.some((e) => e.name === name);

function SwapSheet({ session, exOrder, library, onDone }: { session: Session; exOrder: number; library: Exercise[]; onDone: () => void }) {
  const ex = session.exercises[exOrder];
  const options = [...new Set([ex.plannedName, ex.sub].filter((n): n is string => !!n))];
  const inSession = new Set(session.exercises.map((e) => e.name));
  const similar = suggestSubstitutes(info0(library, ex.plannedName) ? ex.plannedName : ex.name, library, new Set([...inSession, ...options]));
  const info = new Map(library.map((e) => [e.name, e]));
  const pick = async (name: string) => { try { if (name !== ex.name) await swapExercise(session, exOrder, name); onDone(); } catch (e) { toastError(e); } };
  const row = (name: string, sub: string) => (
    <button key={name} className="item" onClick={() => pick(name)}>
      <ExThumb name={name} size={40} group={info.get(name)?.group} muscles={info.get(name)?.muscles} />
      <div className="grow" style={{ textAlign: "left", minWidth: 0 }}><div className="t">{name}</div><div className="s">{sub}</div></div>
      {name === ex.name && <Icon name="check" />}
    </button>
  );
  return (
    <div className="stack">
      <div className="title-md">{tr("Trocar exercício")}</div>
      <p className="small muted" style={{ margin: 0 }}>{tr("Aparelho ocupado? Escolha outro. As séries já preenchidas passam a contar para o escolhido; o plano não muda.")}</p>
      <div className="group">{options.map((name) => row(name, name === ex.plannedName ? tr("Do plano") : tr("Substituto do plano")))}</div>
      {similar.length > 0 && <>
        <div className="eyebrow" style={{ margin: "4px 2px 0" }}>{tr("Parecidos (mesmo músculo)")}</div>
        <div className="group">{similar.map((name) => row(name, [tr(info.get(name)?.equipment ?? ""), tr(info.get(name)?.pattern ?? "")].filter(Boolean).join(" · ")))}</div>
      </>}
    </div>
  );
}

function NoteSheet({ set, canRemove, onDone }: { set: SetEntry; canRemove: boolean; onDone: () => void }) {
  const [note, setNote] = useState(set.note ?? "");
  const quick = [tr("Pegada fechada"), tr("Pegada aberta"), tr("Falhei"), tr("Fácil demais"), tr("Dor"), tr("Com ajuda"), tr("Cadência lenta")];
  return (
    <div className="stack">
      <div className="title-md">{tr("Série")} {set.kind === "warmup" ? tr("de aquecimento") : set.setIndex + 1}</div>
      <div className="row wrap" style={{ gap: 6 }}>{quick.map((q) => <button key={q} className="chip" onClick={() => setNote((n) => (n ? `${n}; ${q}` : q))}>{q}</button>)}</div>
      <input className="input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("Ex.: fisgou no joelho na 3ª rep")} />
      <AsyncButton className="btn primary block" onClick={async () => { await db.sets.update(set.id, { note: note.trim() || undefined }); onDone(); }}>{tr("Salvar nota")}</AsyncButton>
      {canRemove && <AsyncButton className="btn danger block" onClick={async () => { await removeSet(set.id); onDone(); toast(tr("Série removida")); }}><Icon name="minus" size={16} /> {tr("Remover esta série")}</AsyncButton>}
    </div>
  );
}

const PAIN_AREAS = ["Joelho esq.", "Joelho dir.", "Lombar", "Cotovelo dir.", "Cotovelo esq.", "Ombro", "Outro"];
const FATIGUE = ["😌", "🙂", "😐", "😮‍💨", "🥵"];

function FinishSheet({ session, sets, retro, onClose, onDiscard }: { session: Session; sets: SetEntry[]; retro: boolean; onClose: () => void; onDiscard: () => void }) {
  const [fatigue, setFatigue] = useState<number | undefined>(session.fatigue);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [pains, setPains] = useState<Pain[]>(session.pains ?? []);
  const [duration, setDuration] = useState(session.estimatedMin ?? 60);
  const data = useTrainingData();
  const done = sets.filter((s) => s.done && s.kind === "work" && !s.mode);
  const pending = sets.filter((s) => !s.done && s.kind === "work" && !session.exercises[s.exOrder]?.skipped).length;
  // recordes deste treino, comparando com o histórico (a sessão atual entra como se já estivesse finalizada)
  const prs = data
    ? personalRecords([...data.sessions, { ...session, id: session.id }] as never, [...data.sets, ...done] as never).filter((p) => p.sessionId === session.id)
    : [];
  const togglePain = (area: string) => setPains((p) => (p.some((x) => x.area === area) ? p.filter((x) => x.area !== area) : [...p, { area, intensity: 3 }]));

  return (
    <Sheet open onClose={onClose} footer={
      <>
        <AsyncButton className="btn primary lg block" busyLabel={tr("Salvando…")} disabled={!sets.some((x) => x.done) && !notes.trim()} onClick={async () => {
          await finishSession(session.id, { fatigue, notes: notes.trim() || undefined, pains }, retro ? duration : undefined);
          try { localStorage.removeItem(REST_KEY); } catch { /* sem armazenamento */ }
          toast(prs.length ? tr("Treino salvo · {0} recorde{1} 🏆", prs.length, prs.length > 1 ? "s" : "") : tr("Treino salvo 💪"));
          go("resumo", session.id);
        }}>
          <Icon name="check" /> {tr("Salvar treino")}
        </AsyncButton>
        <div className="row">
          <button className="btn ghost grow" onClick={onClose}>{tr("Continuar treinando")}</button>
          <button className="btn danger grow" onClick={onDiscard}><Icon name="trash" size={16} /> {tr("Descartar")}</button>
        </div>
      </>
    }>
      <div className="stack" style={{ gap: 16 }}>
        <div>
          <div className="eyebrow">{session.dayKey} · {session.dayName} · {fmtShort(session.date)}</div>
          <div className="title-lg">{tr("Finalizar treino")}</div>
        </div>
        <div className="grid-3">
          <div className="stat"><div className="v" style={{ fontSize: 20 }}>{retro ? fmtMinutes(duration) : fmtDuration(Date.now() - session.startedAt)}</div><div className="l">{tr("Duração")}</div></div>
          <div className="stat"><div className="v" style={{ fontSize: 20 }}>{done.length}</div><div className="l">{tr("Séries")}</div></div>
          <div className="stat"><div className="v" style={{ fontSize: 20 }}>{fmtVolume(volume(done))}</div><div className="l"><Term id="volume">{tr("Volume")}</Term></div></div>
        </div>
        {!retro && <TimeVsPlan estimatedMin={session.estimatedMin} realMs={Date.now() - session.startedAt} restSec={avgRestSec(sets.filter((s) => !s.mode))} />}
        {retro && <div className="field"><span>{tr("Quanto tempo durou? (min)")}</span><Stepper label={tr("Quanto tempo durou? (min)")} value={duration} step={5} min={5} max={300} onChange={setDuration} /></div>}
        {prs.length > 0 && (
          <div className="card" style={{ borderColor: "rgba(245,185,66,.4)" }}>
            <div className="row bold" style={{ gap: 6, color: "var(--amber)" }}><Icon name="trophy" size={18} /> {prs.length} {tr("recorde")}{prs.length > 1 ? "s" : ""} {tr("neste treino")}</div>
            {prs.map((p) => <div key={p.exercise} className="small" style={{ marginTop: 6 }}>{p.exercise}: <b>{p.kg != null ? fmtKg(p.kg) : tr("PC")} {tr("×")} {p.reps}</b></div>)}
          </div>
        )}
        {pending > 0 && <div className="alert small"><Icon name="info" size={16} /> {pending} {tr("séries não marcadas ficam de fora do registro.")}</div>}
        {!done.length && <div className="alert danger small"><Icon name="alert" size={16} /> {tr("Nenhuma série marcada. Marque as séries feitas (✓) ou descarte o treino.")}</div>}

        <div className="field">
          <span>{tr("Como foi? (fadiga geral)")}</span>
          <div className="faces">{FATIGUE.map((f, i) => <button key={i} aria-pressed={fatigue === i + 1} onClick={() => setFatigue(i + 1)} aria-label={tr("Fadiga {0} de 5", i + 1)}>{f}</button>)}</div>
        </div>
        <div className="field">
          <span>{tr("Dor ou desconforto?")}</span>
          <div className="row wrap" style={{ gap: 8 }}>{PAIN_AREAS.map((a) => <button key={a} className="chip" aria-pressed={pains.some((p) => p.area === a)} onClick={() => togglePain(a)}>{tr(a)}</button>)}</div>
          {pains.map((p, i) => (
            <div key={p.area} className="card tight stack" style={{ gap: 8 }}>
              <div className="row between small"><b>{p.area}</b><span className="num">{p.intensity}/10</span></div>
              <input type="range" min={0} max={10} value={p.intensity} onChange={(e) => setPains((ps) => ps.map((x, j) => (j === i ? { ...x, intensity: +e.target.value } : x)))} style={{ accentColor: "var(--accent)" }} />
              <input className="input" placeholder={tr("Onde/como? (ex.: parte central, fisgou aos 85 kg)")} value={p.note ?? ""} onChange={(e) => setPains((ps) => ps.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
            </div>
          ))}
        </div>
        <label className="field">
          <span>{tr("Notas")}</span>
          <textarea className="input" style={{ minHeight: 80 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Algo para o Claude saber?")} />
        </label>
      </div>
    </Sheet>
  );
}

/** Real × estimado + descanso médio real: mostra para onde o tempo do treino está indo. */
export function TimeVsPlan({ estimatedMin, realMs, restSec }: { estimatedMin?: number; realMs: number; restSec: number | null }) {
  if (!estimatedMin && restSec == null) return null;
  const realMin = Math.round(realMs / 60000);
  const over = estimatedMin ? realMin - estimatedMin : 0;
  return (
    <div className="card tight row small" style={{ gap: 14, flexWrap: "wrap" }}>
      {estimatedMin ? (
        <span>{tr("Estimado")} <b className="num">~{fmtMinutes(estimatedMin)}</b>{over > 10 && <span className="tag warn" style={{ marginLeft: 6 }}>+{fmtMinutes(over)}</span>}</span>
      ) : null}
      {restSec != null && <span>{tr("Descanso médio real")} <b className="num">{fmtRest(restSec)}</b></span>}
    </div>
  );
}
