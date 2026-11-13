import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ExercisePicker } from "../components/ExercisePicker";
import { ExThumb } from "../components/ExThumb";
import { GestureList } from "../components/GestureList";
import { Icon } from "../components/Icon";
import { AsyncButton, BackHeader, Section, Segmented, Sheet, Stepper, Toggle, toast, toastError, toastUndo } from "../components/ui";
import { db, dayColor, deletePlan, savePlan, setSetting, type Exercise } from "../db";
import { useLibrary, useSettings, useToday } from "../hooks";
import { addDay, DAY_PALETTE, defaultsFor, linkSuperset, moveItem, removeDay, unlinkSuperset, updateDay, validate } from "../lib/builder";
import { fmtShort, isDeload, weekLabel, weekOf, weekRange } from "../lib/calendar";
import { guessMachine, MACHINE_LABEL, MACHINE_METRICS, METRICS as CARDIO_METRICS, type CardioMetric } from "../lib/cardio";
import type { CardioTarget, DayBlock, Plan, PlanExercise, Weekday } from "../lib/plan";
import { fmtKg, fmtRest, prescribe, summarize, supersetGroups } from "../lib/prescription";
import { back, go, href } from "../router";

import { tr } from "../i18n";
const WD: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

/** Carrega o plano do banco e salva cada alteração (validada) na hora. */
function usePlanEditor(id: string) {
  const stored = useLiveQuery(() => db.plans.get(id), [id]);
  const update = async (fn: (p: Plan) => Plan) => {
    const current = (await db.plans.get(id))?.plan;
    if (!current) return;
    const r = validate(fn(structuredClone(current)));
    if (!r.ok) return toastError(r.errors[0]);
    await savePlan(r.plan);
  };
  return { stored, plan: stored?.plan, update };
}

/* =================== Programa =================== */

export function ProgramEditor({ id }: { id: string }) {
  const { stored, plan, update } = usePlanEditor(id);
  const settings = useSettings();
  const [daySheet, setDaySheet] = useState<Weekday | number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (stored === undefined) return <div className="screen" />;
  if (!plan) return <div className="screen"><BackHeader title={tr("Programa não encontrado")} onBack={() => go("treinos")} /></div>;
  const isActive = settings?.activePlanId === id;
  const mode = plan.rotation ? "rotation" : "week";

  return (
    <div className="screen">
      <BackHeader eyebrow={isActive ? tr("Programa ativo") : tr("Programa")} title={plan.block.name} onBack={() => back("treinos")} right={!isActive ? <AsyncButton className="btn sm tonal" busyLabel="…" onClick={async () => { await setSetting("activePlanId", id); toast(tr("Programa ativado")); }}>{tr("Ativar")}</AsyncButton> : undefined} />

      <div className="stack">
        <label className="field">
          <span>{tr("Nome")}</span>
          <input className="input" defaultValue={plan.block.name} onBlur={(e) => e.target.value.trim() && e.target.value !== plan.block.name && update((p) => ({ ...p, block: { ...p.block, name: e.target.value.trim() } }))} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>{tr("Início")}</span>
            <input className="input" type="date" value={plan.block.startDate} onChange={(e) => e.target.value && update((p) => ({ ...p, block: { ...p.block, startDate: e.target.value } }))} />
          </label>
          <div className="field">
            <span>{tr("Semanas")}</span>
            <Stepper label={tr("Semanas")} value={plan.block.weeks} min={1} max={52} onChange={(v) => update((p) => ({ ...p, block: { ...p.block, weeks: v, deloadWeeks: p.block.deloadWeeks.filter((w) => w <= v) } }))} />
          </div>
        </div>
        <div className="small muted">{tr("Termina em")} {fmtShort(weekRange(plan, plan.block.weeks).end)}.</div>

        <div className="field">
          <span>{tr("Semanas de deload (toque para marcar)")}</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {Array.from({ length: plan.block.weeks }, (_, i) => i + 1).map((w) => {
              const on = plan.block.deloadWeeks.includes(w);
              return (
                <button key={w} className="chip num" style={{ height: 32, padding: "0 11px" }} aria-pressed={on}
                  onClick={() => update((p) => ({ ...p, block: { ...p.block, deloadWeeks: on ? p.block.deloadWeeks.filter((x) => x !== w) : [...p.block.deloadWeeks, w].sort((a, b) => a - b) } }))}>
                  {w}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Section title={tr("Divisão")} />
      <Segmented
        value={mode}
        options={[{ value: "week", label: tr("Por dia da semana") }, { value: "rotation", label: tr("Rodízio") }]}
        onChange={(v) => update((p) => (v === "rotation" ? { ...p, rotation: { pattern: [...p.days.map((d) => d.key), null] } } : { ...p, rotation: undefined }))}
      />
      <div className="group" style={{ marginTop: 10 }}>
        {mode === "week"
          ? WD.map((w) => {
              const k = plan.schedule[w.key];
              const d = k ? plan.days.find((x) => x.key === k) : undefined;
              return (
                <button key={w.key} className="item" onClick={() => setDaySheet(w.key)}>
                  <div className="grow t">{tr(w.label)}</div>
                  {d ? <span className="tag" style={{ background: `color-mix(in srgb, ${dayColor(plan, d)} 20%, transparent)`, color: `color-mix(in srgb, ${dayColor(plan, d)} 85%, white)` }}>{d.key} · {d.name}</span> : <span className="tag">{tr("Descanso")}</span>}
                  <Icon name="chevron" size={16} />
                </button>
              );
            })
          : plan.rotation!.pattern.map((k, i) => {
              const d = k ? plan.days.find((x) => x.key === k) : undefined;
              return (
                <div key={i} className="item">
                  <span className="dim small num" style={{ width: 44 }}>{tr("Dia")} {i + 1}</span>
                  <button className="grow" style={{ textAlign: "left" }} onClick={() => setDaySheet(i)}>
                    {d ? <span className="tag" style={{ background: `color-mix(in srgb, ${dayColor(plan, d)} 20%, transparent)`, color: `color-mix(in srgb, ${dayColor(plan, d)} 85%, white)` }}>{d.key} · {d.name}</span> : <span className="tag">{tr("Descanso")}</span>}
                  </button>
                  <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label={tr("Remover")} onClick={() => update((p) => ({ ...p, rotation: { ...p.rotation!, pattern: p.rotation!.pattern.filter((_, j) => j !== i) } }))}><Icon name="minus" size={16} /></button>
                </div>
              );
            })}
        {mode === "rotation" && (
          <button className="item" onClick={() => update((p) => ({ ...p, rotation: { ...p.rotation!, pattern: [...p.rotation!.pattern, null] } }))}>
            <Icon name="plus" size={18} /> <span className="t">{tr("Adicionar dia ao ciclo")}</span>
          </button>
        )}
      </div>
      {mode === "rotation" && <div className="tiny dim" style={{ marginTop: 6 }}>{tr("O ciclo se repete a partir do início do programa (")}{fmtShort(plan.block.startDate)}).</div>}

      <Section title={tr("Dias")} action={<button onClick={() => update((p) => addDay(p))}>{tr("+ Dia")}</button>} />
      <div className="group gl-group">
        <GestureList gap={0} items={plan.days} keyOf={(d) => d.key} onMove={(from, to) => update((p) => ({ ...p, days: moveItem(p.days, from, to) }))} render={(d, i) => (
          <div className="item">
            <span className="badge sm" style={{ ["--c" as string]: dayColor(plan, d) }}>{d.key}</span>
            <a className="grow" href={href("treinos", "dia", id, d.key)}>
              <div className="t">{d.name}</div>
              <div className="s">{d.exercises.length} {tr("exercícios")}</div>
            </a>
            <button className="icon-btn" style={{ width: 34, height: 34 }} disabled={i === 0} aria-label={tr("Subir")} onClick={() => update((p) => ({ ...p, days: moveItem(p.days, i, i - 1) }))}><Icon name="up" size={16} /></button>
            <button className="icon-btn" style={{ width: 34, height: 34 }} disabled={i === plan.days.length - 1} aria-label={tr("Descer")} onClick={() => update((p) => ({ ...p, days: moveItem(p.days, i, i + 1) }))}><Icon name="down" size={16} /></button>
          </div>
        )} />
      </div>

      <Section title={tr("Outros")} />
      <div className="group">
        <AsyncButton className="item" busyLabel={tr("Duplicando…")} onClick={async () => {
          const copy = structuredClone(plan);
          copy.block.id = `meu-${Date.now().toString(36)}`;
          copy.block.name = tr("{0} (cópia)", plan.block.name);
          await savePlan(copy);
          toast(tr("Programa duplicado"));
          go("treinos", "programa", copy.block.id);
        }}>
          <Icon name="copy" size={18} /> <span className="t">{tr("Duplicar programa")}</span>
        </AsyncButton>
        <button className="item" style={{ color: "var(--danger)" }} onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" size={18} /> <span className="t">{tr("Excluir programa")}</span>
        </button>
      </div>
      <div className="tiny dim" style={{ marginTop: 8 }}>{tr("Excluir o programa não apaga o histórico de treinos.")}</div>

      <Sheet open={daySheet !== null} onClose={() => setDaySheet(null)}>
        <div className="stack">
          <div className="title-md">{typeof daySheet === "number" ? tr("Dia {0} do ciclo", daySheet + 1) : tr(WD.find((w) => w.key === daySheet)?.label ?? "")}</div>
          <div className="group">
            {[null, ...plan.days.map((d) => d.key)].map((k) => {
              const d = k ? plan.days.find((x) => x.key === k) : undefined;
              const current = typeof daySheet === "number" ? plan.rotation?.pattern[daySheet] : daySheet ? plan.schedule[daySheet] : null;
              return (
                <button key={k ?? "rest"} className="item" onClick={async () => {
                  const slot = daySheet;
                  setDaySheet(null);
                  await update((p) => typeof slot === "number"
                    ? { ...p, rotation: { ...p.rotation!, pattern: p.rotation!.pattern.map((x, j) => (j === slot ? k : x)) } }
                    : { ...p, schedule: { ...p.schedule, [slot as Weekday]: k } });
                }}>
                  {d ? <span className="badge sm" style={{ ["--c" as string]: dayColor(plan, d) }}>{d.key}</span> : <span className="ico" style={{ ["--c" as string]: "var(--text-3)", width: 32, height: 32 }}><Icon name="pause" size={16} /></span>}
                  <div className="grow t">{d ? d.name : tr("Descanso")}</div>
                  {current === k && <Icon name="check" />}
                </button>
              );
            })}
          </div>
        </div>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} footer={
        <>
          <AsyncButton className="btn danger block" busyLabel={tr("Excluindo…")} onClick={async () => { await deletePlan(id); toast(tr("Programa excluído")); go("treinos"); }}>{tr("Excluir programa")}</AsyncButton>
          <button className="btn ghost block" onClick={() => setConfirmDelete(false)}>{tr("Cancelar")}</button>
        </>
      }>
        <div className="title-md">{tr("Excluir “")}{plan.block.name}”?</div>
        <p className="small muted">{tr("O histórico de treinos continua salvo. Não dá para desfazer (a menos que você tenha um backup).")}</p>
      </Sheet>
    </div>
  );
}

/* =================== Dia =================== */

export function DayEditor({ planId, dayKey, week: weekParam }: { planId: string; dayKey: string; week?: number }) {
  const { stored, plan, update } = usePlanEditor(planId);
  const library = useLibrary();
  const today = useToday();
  const [pickedWeek, setWeek] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [flash, setFlash] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (stored === undefined || !library) return <div className="screen" />;
  const day = plan?.days.find((d) => d.key === dayKey);
  if (!plan || !day) return <div className="screen"><BackHeader title={tr("Dia não encontrado")} onBack={() => back("treinos")} /></div>;
  const lib = new Map(library.map((e) => [e.name, e]));
  const groups = supersetGroups(day.exercises);
  // semana mostrada: a escolhida, a do link (agenda do Início) ou a de hoje — o deload muda as séries
  const week = Math.min(Math.max(pickedWeek ?? weekParam ?? weekOf(plan, today), 1), plan.block.weeks);
  const color = dayColor(plan, day);
  const setExercises = (fn: (ex: PlanExercise[]) => PlanExercise[]) => update((p) => updateDay(p, dayKey, { exercises: fn(p.days.find((d) => d.key === dayKey)!.exercises) }));

  const addExercises = (picked: Exercise[]) => {
    const added = picked.map((e) => {
      const d = defaultsFor(e.kind === "cardio" ? tr("Cardio") : e.pattern, e.unilateral);
      return { name: e.name, ...d, cardio: d.cardio ? { ...d.cardio, machine: e.machine } : undefined } as PlanExercise;
    });
    return setExercises((ex) => [...ex, ...added]).then(() => {
      // o novo pisca no fim da lista: dá para ver onde caiu e arrastar para o lugar certo
      const all = [...day.exercises, ...added];
      const keys = all.map(exKey).slice(day.exercises.length);
      setFlash(keys);
      window.setTimeout(() => document.querySelector(".gl-flash")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      window.setTimeout(() => setFlash([]), 2600);
    });
  };
  // chave estável do exercício na lista (o mesmo nome pode aparecer duas vezes)
  function exKey(ex: PlanExercise, i: number, list = day!.exercises): string {
    return `${ex.name}#${list.slice(0, i).filter((x) => x.name === ex.name).length}`;
  }

  return (
    <div className="screen" style={{ ["--accent" as string]: color }}>
      <BackHeader eyebrow={plan.block.name} title={`${day.key} · ${day.name}`} onBack={() => back("treinos")} />

      <div className="stack">
        <label className="field">
          <span>{tr("Nome do dia")}</span>
          <input className="input" defaultValue={day.name} placeholder={tr("Ex.: Push, Pernas, Superior")} onBlur={(e) => e.target.value.trim() && e.target.value !== day.name && update((p) => updateDay(p, dayKey, { name: e.target.value.trim() }))} />
        </label>
        <div className="field">
          <span>{tr("Cor")}</span>
          <div className="swatches">
            {DAY_PALETTE.map((c) => <button key={c} className="swatch" style={{ background: c }} aria-pressed={day.color === c} aria-label={tr("Cor {0}", c)} onClick={() => update((p) => updateDay(p, dayKey, { color: c }))} />)}
          </div>
        </div>
      </div>

      <Section title={tr("Exercícios ({0})", day.exercises.length)} action={<button onClick={() => setPicking(true)}>{tr("+ Adicionar")}</button>} />
      {plan.block.weeks > 1 && (
        <div className="week-chips" role="group" aria-label={tr("Semana do bloco")}>
          {Array.from({ length: plan.block.weeks }, (_, i) => i + 1).map((w) => (
            <button key={w} aria-pressed={w === week} className={isDeload(plan, w) ? "deload" : ""} onClick={() => setWeek(w)}>
              <b className="num">{w}</b><small>{isDeload(plan, w) ? tr("deload") : fmtShort(weekRange(plan, w).start)}</small>
            </button>
          ))}
        </div>
      )}
      {plan.block.weeks > 1 && <div className="tiny muted" style={{ margin: "6px 2px 10px" }}>{tr("Semana {0}", week)}{weekLabel(plan, week) ? ` · ${weekLabel(plan, week)}` : ""} — {tr("séries e cargas exatamente como vão aparecer no treino")}</div>}
      {day.exercises.length === 0 && (
        <button className="card tap center" onClick={() => setPicking(true)} style={{ padding: 28 }}>
          <span className="ico" style={{ margin: "0 auto 10px" }}><Icon name="plus" /></span>
          <div className="bold">{tr("Adicionar exercícios")}</div>
          <div className="small muted">{tr("Escolha por grupo muscular")}</div>
        </button>
      )}
      {day.exercises.length > 1 && <div className="tiny dim" style={{ margin: "-4px 2px 8px" }}>{tr("Segure e arraste para mudar a ordem · deslize para a esquerda para remover")}</div>}
      <GestureList
        items={day.exercises}
        keyOf={exKey}
        onMove={(from, to) => setExercises((list) => moveItem(list, from, to))}
        onDelete={(i) => {
          const before = day.exercises;
          const name = before[i].name;
          setExercises((list) => unlinkSuperset(list, i).filter((_, j) => j !== i))
            .then(() => toastUndo(tr("{0} removido", name), () => setExercises(() => before)))
            .catch(toastError);
        }}
        render={(ex, i) => {
          const g = groups[i];
          const p = prescribe(plan, ex, week);
          const fmtSets = (list: typeof p.sets) => list.map((x) => `${x.kg != null ? fmtKg(x.kg) : "—"}×${x.reps}`).join(" · ");
          const ramp = p.sets.filter((x) => x.kind === "warmup");
          return (
            <div className={`card ${g ? "in-superset" : ""}${flash.includes(exKey(ex, i)) ? " gl-flash" : ""}`} style={{ padding: 12, ...(g ? { borderLeft: "3px solid var(--violet)" } : {}) }}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <span className="dim small num" style={{ width: 18, paddingTop: 2 }}>{i + 1}</span>
                <ExThumb name={ex.name} size={50} group={lib.get(ex.name)?.group} muscles={lib.get(ex.name)?.muscles} />
                <button className="grow" style={{ textAlign: "left", minWidth: 0 }} onClick={() => setEditing(i)}>
                  <div className="bold" style={{ lineHeight: 1.25 }}>{ex.name}</div>
                  {ex.why && <div className="tiny muted" style={{ marginTop: 3, whiteSpace: "normal" }}>{ex.why}</div>}
                  {p.explicit && <div className="tiny muted num" style={{ marginTop: 3, whiteSpace: "normal" }}>{ramp.length > 0 && <>{tr("Rampa:")} {fmtSets(ramp)} · </>}{tr("Séries:")} {fmtSets(p.sets.filter((x) => x.kind === "work"))}</div>}
                  {p.note && <div className="tiny" style={{ marginTop: 3, color: "var(--amber)", whiteSpace: "normal" }}>{p.note}</div>}
                  <div className="row wrap small muted" style={{ gap: 6, marginTop: 4 }}>
                    <span className="num" style={{ color: "var(--text)" }}>{summarize(p, ex)}</span>
                    {p.deload && <span className="tag warn">{tr("deload")}</span>}
                    {!ex.cardio && ex.restSec > 0 && <span>· {fmtRest(ex.restSec)}</span>}
                    {ex.block && ex.block !== "main" && <span className="tag">{ex.block === "warmup" ? "aquecimento" : tr("volta à calma")}</span>}
                    {ex.rir && <span>{tr("· RIR")} {ex.rir}</span>}
                    {g && <span className="tag violet">{g.letter}{g.members.indexOf(i) + 1}</span>}
                    {ex.sub && <span className="tag">{tr("sub")}</span>}
                    {ex.byWeek && <span className="tag warn">{tr("cargas por semana")}</span>}
                    {!lib.get(ex.name) && <span className="tag danger">{tr("fora da biblioteca")}</span>}
                  </div>
                </button>
                <div className="stack" style={{ gap: 4 }}>
                  <button className="icon-btn" style={{ width: 32, height: 32 }} disabled={i === 0} aria-label={tr("Subir")} onClick={() => setExercises((list) => moveItem(list, i, i - 1))}><Icon name="up" size={15} /></button>
                  <button className="icon-btn" style={{ width: 32, height: 32 }} disabled={i === day.exercises.length - 1} aria-label={tr("Descer")} onClick={() => setExercises((list) => moveItem(list, i, i + 1))}><Icon name="down" size={15} /></button>
                </div>
              </div>
              {i < day.exercises.length - 1 && (
                <button className={`tiny ss-link${ex.superset && ex.superset === day.exercises[i + 1].superset ? " on" : ""}`}
                  onClick={() => setExercises((list) => (list[i].superset && list[i].superset === list[i + 1].superset ? unlinkSuperset(list, i + 1) : linkSuperset(list, i)))}>
                  <span className="row" style={{ gap: 4 }}><Icon name={ex.superset && ex.superset === day.exercises[i + 1].superset ? "unlink" : "link"} size={13} /> {ex.superset && ex.superset === day.exercises[i + 1].superset ? tr("Junto com {0}, sem descanso · separar", `${g?.letter ?? ""}${(g?.members.indexOf(i) ?? 0) + 2}`) : tr("Superset com o próximo")}</span>
                </button>
              )}
            </div>
          );
        }}
      />

      <Section title={tr("Aquecimento e cardio")} />
      <div className="stack">
        <label className="field">
          <span>{tr("Aquecimento (um item por linha)")}</span>
          <textarea className="input" style={{ minHeight: 90 }} defaultValue={(day.warmup ?? []).join("\n")} placeholder={tr("Running in place 2 min\nShoulder joints warmup 2×15")}
            onBlur={(e) => update((p) => updateDay(p, dayKey, { warmup: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }))} />
        </label>
        <label className="field">
          <span>{tr("Cardio")}</span>
          <input className="input" defaultValue={day.cardio ?? ""} placeholder={tr("Ex.: ClimbMill Z2 · 20–25 min")} onBlur={(e) => update((p) => updateDay(p, dayKey, { cardio: e.target.value.trim() || null }))} />
        </label>
      </div>

      <button className="btn danger block" style={{ marginTop: 24 }} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> {tr("Excluir dia")}</button>

      <ExercisePicker open={picking} multi onClose={() => setPicking(false)} onPick={addExercises} />
      <Sheet open={editing !== null} onClose={() => setEditing(null)}>
        {editing !== null && day.exercises[editing] && (
          <ExerciseEditor
            key={editing}
            ex={day.exercises[editing]}
            onSave={(patch) => setExercises((list) => list.map((e, j) => (j === editing ? { ...e, ...patch } : e))).then(() => setEditing(null))}
            onRemove={() => setExercises((list) => unlinkSuperset(list, editing).filter((_, j) => j !== editing)).then(() => setEditing(null))}
          />
        )}
      </Sheet>
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} footer={
        <>
          <AsyncButton className="btn danger block" onClick={async () => { await update((p) => removeDay(p, dayKey)); go("treinos", "programa", planId); }}>{tr("Excluir dia")} {day.key}</AsyncButton>
          <button className="btn ghost block" onClick={() => setConfirmDelete(false)}>{tr("Cancelar")}</button>
        </>
      }>
        <div className="title-md">{tr("Excluir")} {day.key} · {day.name}?</div>
        <p className="small muted">{tr("Ele sai da divisão. O histórico de treinos continua salvo.")}</p>
      </Sheet>
    </div>
  );
}

/** Edição da prescrição de um exercício do dia. */
function ExerciseEditor({ ex, onSave, onRemove }: { ex: PlanExercise; onSave: (p: Partial<PlanExercise>) => Promise<unknown>; onRemove: () => Promise<unknown> }) {
  const [sets, setSets] = useState(ex.sets);
  const [reps, setReps] = useState(String(ex.reps));
  const [kg, setKg] = useState<number>(ex.kg ?? 0);
  const [rest, setRest] = useState(ex.restSec);
  const [rir, setRir] = useState(ex.rir ?? "");
  const [perSide, setPerSide] = useState(!!ex.perSide);
  const [priority, setPriority] = useState(!!ex.priority);
  const [sub, setSub] = useState(ex.sub ?? "");
  const [handle, setHandle] = useState(ex.handle ?? "");
  const [notes, setNotes] = useState(ex.notes ?? "");
  const [pickSub, setPickSub] = useState(false);
  const [block, setBlock] = useState<DayBlock>(ex.block ?? "main");
  const [cardio, setCardio] = useState<CardioTarget | undefined>(ex.cardio);
  const repsVal = /^\d+$/.test(reps.trim()) ? Number(reps) : reps.trim() || 10;
  const blockPicker = (
    <div className="field">
      <span>{tr("Parte do treino")}</span>
      <Segmented value={block} options={[{ value: "warmup", label: tr("Aquecimento") }, { value: "main", label: tr("Treino") }, { value: "cooldown", label: tr("Volta à calma") }]} onChange={setBlock} />
    </div>
  );
  if (cardio) {
    const machine = cardio.machine ?? guessMachine(ex.name);
    const setMetric = (k: CardioMetric, v: string) => {
      const n = v.trim() === "" ? undefined : Number(v.replace(",", "."));
      setCardio({ ...cardio, [k]: n != null && Number.isFinite(n) ? n : undefined });
    };
    return (
      <div className="stack">
        <div className="title-md" style={{ lineHeight: 1.25 }}>{ex.name}</div>
        <div className="small muted">{tr("Cardio ·")} {MACHINE_LABEL[machine]}{tr(". Metas opcionais: no treino você registra o que fez.")}</div>
        {blockPicker}
        <div className="cardio-grid">
          {MACHINE_METRICS[machine].map((k) => (
            <label key={k} className="cardio-field">
              <span className="tiny muted">{tr(CARDIO_METRICS[k].label)}{CARDIO_METRICS[k].unit ? ` (${CARDIO_METRICS[k].unit})` : ""}</span>
              <input inputMode="decimal" defaultValue={cardio[k] != null ? String(cardio[k]).replace(".", ",") : ""} placeholder="—" onChange={(e) => setMetric(k, e.target.value)} />
            </label>
          ))}
        </div>
        <label className="field"><span>{tr("Zona / intensidade")}</span><input className="input" defaultValue={cardio.zone ?? ""} onChange={(e) => setCardio({ ...cardio, zone: e.target.value.trim() || undefined })} placeholder={tr("Ex.: Z2 · ~120 bpm")} /></label>
        <label className="field"><span>{tr("Observação")}</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <AsyncButton className="btn primary block" onClick={() => onSave({ sets: 1, reps: cardio.min ? `${cardio.min} min` : tr("20 min"), restSec: 0, cardio, block: block === "main" ? undefined : block, notes: notes.trim() || undefined })}>
          <Icon name="check" /> {tr("Salvar")}
        </AsyncButton>
        <AsyncButton className="btn danger block" busyLabel={tr("Removendo…")} onClick={onRemove}><Icon name="trash" size={16} /> {tr("Remover do dia")}</AsyncButton>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="title-md" style={{ lineHeight: 1.25 }}>{ex.name}</div>
      {blockPicker}
      {ex.byWeek && <div className="alert small"><Icon name="info" size={16} /> {tr("Este exercício tem cargas definidas semana a semana (vindas do Claude). Séries e reps abaixo valem para as semanas sem prescrição própria.")}</div>}
      <div className="grid-2">
        <div className="field"><span>{tr("Séries")}</span><Stepper label={tr("Séries")} value={sets} min={1} max={12} onChange={setSets} /></div>
        <label className="field"><span>{tr("Repetições")}</span><input className="input num" value={reps} onChange={(e) => setReps(e.target.value)} placeholder={tr("10 ou 45 s")} style={{ textAlign: "center", fontWeight: 700 }} /></label>
        <div className="field"><span>{tr("Carga (kg, 0 = livre)")}</span><Stepper label={tr("Carga (kg, 0 = livre)")} value={kg} step={2.5} max={500} decimal onChange={setKg} /></div>
        <div className="field"><span>{tr("Descanso (s)")}</span><Stepper label={tr("Descanso (s)")} value={rest} step={15} max={600} onChange={setRest} /></div>
      </div>
      <div className="field">
        <span>{tr("RIR (reps na reserva)")}</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {["0", "0–1", "0–2", "1–2", "1–3", "2–3", "3–4"].map((v) => <button key={v} className="chip" aria-pressed={rir === v} onClick={() => setRir(rir === v ? "" : v)}>{v}</button>)}
        </div>
      </div>
      <div className="group">
        <div className="item"><div className="grow t">{tr("Unilateral (reps por lado)")}</div><Toggle label={tr("Por lado")} checked={perSide} onChange={setPerSide} /></div>
        <div className="item"><div className="grow t">{tr("Prioridade")}</div><Toggle label={tr("Prioridade")} checked={priority} onChange={setPriority} /></div>
        <button className="item" onClick={() => setPickSub(true)}>
          <div className="grow"><div className="t">{tr("Substituto")}</div><div className="s">{sub || tr("Nenhum")}</div></div>
          {sub ? <span className="icon-btn" style={{ width: 30, height: 30 }} onClick={(e) => { e.stopPropagation(); setSub(""); }}><Icon name="close" size={14} /></span> : <Icon name="chevron" size={16} />}
        </button>
      </div>
      <label className="field"><span>{tr("Puxador / pegada")}</span><input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={tr("Ex.: puxador largo do kit anatômico")} /></label>
      <label className="field"><span>{tr("Observação")}</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Ex.: cadência 3-1-1")} /></label>
      <AsyncButton className="btn primary block" onClick={() => onSave({ sets, reps: repsVal, kg: kg > 0 ? kg : null, restSec: rest, rir: rir || undefined, perSide: perSide || undefined, priority: priority || undefined, sub: sub || null, handle: handle.trim() || null, notes: notes.trim() || undefined, block: block === "main" ? undefined : block })}>
        <Icon name="check" /> {tr("Salvar")}
      </AsyncButton>
      <AsyncButton className="btn danger block" busyLabel={tr("Removendo…")} onClick={onRemove}><Icon name="trash" size={16} /> {tr("Remover do dia")}</AsyncButton>
      <ExercisePicker open={pickSub} title={tr("Escolher substituto")} onClose={() => setPickSub(false)} onPick={(p) => p[0] && setSub(p[0].name)} />
    </div>
  );
}
