import { useLiveQuery } from "dexie-react-hooks";
import { useDeferredValue, useState } from "react";
import { BodyFigure } from "../components/BodyFigure";
import { Icon } from "../components/Icon";
import { MotionFigure } from "../components/MotionFigure";
import type { MuscleMap } from "../lib/muscles";
import { AsyncButton, BackHeader, PageHead, Sheet, Toggle, toast } from "../components/ui";
import { addCustomExercise, db } from "../db";
import { useActivePlan, useLibrary, useSettings } from "../hooks";
import { EQUIPMENT, GROUPS, PATTERNS, groupsFor, norm } from "../lib/groups";
import { back, href } from "../router";

import { tr } from "../i18n";
export function Exercises() {
  const library = useLibrary();
  const settings = useSettings();
  const stored = useActivePlan();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const dq = useDeferredValue(q);
  if (!library) return <div className="screen" />;
  const inPlan = new Set(stored?.plan.days.flatMap((d) => d.exercises.map((e) => e.name)) ?? []);
  const terms = norm(dq).split(/\s+/).filter(Boolean);
  const results = terms.length ? library.filter((e) => terms.every((t) => norm(`${e.name} ${tr(e.group)} ${e.equipment} ${e.pattern}`).includes(t))) : [];
  const custom = library.filter((e) => e.custom);

  return (
    <div className="screen">
      <PageHead eyebrow={tr("{0} exercícios", library.length)} title={tr("Exercícios")} right={<button className="icon-btn" onClick={() => setCreating(true)} aria-label={tr("Novo exercício")}><Icon name="plus" /></button>} />
      <label className="search">
        <Icon name="search" size={18} />
        <input className="input" type="search" placeholder={tr("Buscar (ex.: lateral raise, cabo, agachamento)")} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      {terms.length ? (
        <>
          <div className="small muted" style={{ margin: "14px 2px 8px" }}>{results.length} {tr("resultado")}{results.length === 1 ? "" : "s"}</div>
          <ExerciseList items={results} inPlan={inPlan} />
        </>
      ) : (
        <>
          <div className="grid-3" style={{ marginTop: 16 }}>
            {groupsFor(settings?.focus).map((g) => {
              const n = library.filter((e) => e.group === g.name).length;
              const p = library.filter((e) => e.group === g.name && inPlan.has(e.name)).length;
              return (
                <a key={g.name} className="card tap center" style={{ padding: "12px 6px 10px" }} href={href("exercicios", g.name)}>
                  <div style={{ display: "flex", justifyContent: "center", height: 96, overflow: "hidden" }}>
                    <BodyFigure side={g.side} selected={new Set(g.muscles)} width={58} decorative />
                  </div>
                  <div className="bold" style={{ marginTop: 6 }}>{tr(g.name)}</div>
                  <div className="tiny dim">{n} {p ? tr("· {0} no plano", p) : ""}</div>
                </a>
              );
            })}
          </div>
          {custom.length > 0 && (
            <>
              <div className="section"><h2>{tr("Meus exercícios")}</h2></div>
              <ExerciseList items={custom} inPlan={inPlan} />
            </>
          )}
        </>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)}>{creating && <NewExercise onDone={() => setCreating(false)} />}</Sheet>
    </div>
  );
}

export function ExerciseGroup({ group }: { group: string }) {
  const library = useLibrary();
  const stored = useActivePlan();
  const flags = useLiveQuery(() => db.flags.toArray(), []);
  const [equip, setEquip] = useState<string | null>(null);
  const [onlyPlan, setOnlyPlan] = useState(false);
  if (!library) return <div className="screen" />;
  const g = GROUPS.find((x) => x.name === group);
  const inPlan = new Set(stored?.plan.days.flatMap((d) => d.exercises.map((e) => e.name)) ?? []);
  const items = library.filter((e) => e.group === group && (!equip || e.equipment === equip) && (!onlyPlan || inPlan.has(e.name)));
  const equipments = [...new Set(library.filter((e) => e.group === group).map((e) => e.equipment).filter(Boolean))];
  return (
    <div className="screen">
      <BackHeader eyebrow={tr("Exercícios")} title={group} onBack={() => back("exercicios")} />
      {g && (
        <div className="row" style={{ justifyContent: "center", gap: 18, marginBottom: 14 }}>
          <BodyFigure side="front" selected={new Set(g.muscles)} width={84} />
          <BodyFigure side="back" selected={new Set(g.muscles)} width={84} />
        </div>
      )}
      <div className="chips">
        <button className="chip" aria-pressed={onlyPlan} onClick={() => setOnlyPlan(!onlyPlan)}>{tr("No plano")}</button>
        {equipments.map((e) => <button key={e} className="chip" aria-pressed={equip === e} onClick={() => setEquip(equip === e ? null : e)}>{e}</button>)}
      </div>
      <div className="small muted" style={{ margin: "12px 2px 8px" }}>{items.length} {tr("exercícios")}</div>
      <ExerciseList items={items} inPlan={inPlan} flagged={new Map(flags?.map((f) => [f.exercise, f.type]))} />
    </div>
  );
}

function ExerciseList({ items, inPlan, flagged }: { items: { name: string; group: string; equipment: string; pattern: string; vetoed: boolean; unilateral: boolean; custom?: boolean; muscles?: MuscleMap }[]; inPlan: Set<string>; flagged?: Map<string, string> }) {
  return (
    <div className="group">
      {items.map((e) => {
        const vetoed = e.vetoed || flagged?.get(e.name) === "vetoed";
        return (
          <a key={e.name} className={`item ${vetoed ? "off" : ""}`} href={href("exercicio", e.name)}>
            <div className="thumb"><MotionFigure name={e.name} group={e.group} muscles={e.muscles} animate={false} aspect={1} label="" /></div>
            <div className="grow">
              <div className="t">{e.name}</div>
              <div className="row wrap" style={{ gap: 5, marginTop: 4 }}>
                {e.equipment && <span className="tag">{e.equipment}</span>}
                {e.pattern && <span className="tag">{e.pattern}</span>}
                {e.unilateral && <span className="tag">{tr("uni")}</span>}
                {inPlan.has(e.name) && <span className="tag accent">{tr("no plano")}</span>}
                {e.custom && <span className="tag violet">{tr("meu")}</span>}
                {vetoed && <span className="tag danger">{tr("vetado")}</span>}
                {flagged?.get(e.name) === "suspended" && <span className="tag warn">{tr("suspenso")}</span>}
              </div>
            </div>
            <Icon name="chevron" size={16} />
          </a>
        );
      })}
    </div>
  );
}

function NewExercise({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState(tr("Peito"));
  const [equipment, setEquipment] = useState(tr("Máquina"));
  const [pattern, setPattern] = useState(tr("Isolador"));
  const [unilateral, setUnilateral] = useState(false);
  const muscles = GROUPS.find((g) => g.name === group)?.muscles ?? [];
  return (
    <div className="stack">
      <div className="title-md">{tr("Novo exercício")}</div>
      <label className="field"><span>{tr("Nome (como aparece no app da academia)")}</span><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Ex.: Pendlay Row")} /></label>
      <div className="field"><span>{tr("Grupo muscular")}</span><div className="row wrap" style={{ gap: 6 }}>{GROUPS.map((g) => <button key={g.name} className="chip" aria-pressed={group === g.name} onClick={() => setGroup(g.name)}>{tr(g.name)}</button>)}</div></div>
      <div className="field"><span>{tr("Equipamento")}</span><div className="row wrap" style={{ gap: 6 }}>{EQUIPMENT.map((x) => <button key={x} className="chip" aria-pressed={equipment === x} onClick={() => setEquipment(x)}>{tr(x)}</button>)}</div></div>
      <label className="field"><span>{tr("Padrão de movimento")}</span><select className="input" value={pattern} onChange={(e) => setPattern(e.target.value)}>{PATTERNS.map((x) => <option key={x} value={x}>{tr(x)}</option>)}</select></label>
      <div className="group"><div className="item"><div className="grow t">{tr("Unilateral")}</div><Toggle label={tr("Unilateral")} checked={unilateral} onChange={setUnilateral} /></div></div>
      <AsyncButton className="btn primary block" disabled={!name.trim()} onClick={async () => {
        await addCustomExercise({ name, group, equipment, pattern, unilateral, notes: "", muscles: muscles.length ? { primary: muscles.slice(0, 1), secondary: [] } : undefined });
        toast(tr("Exercício criado"));
        onDone();
      }}>
        <Icon name="check" /> {tr("Criar exercício")}
      </AsyncButton>
    </div>
  );
}
