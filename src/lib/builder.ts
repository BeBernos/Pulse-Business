import { isoDay } from "./calendar";
import { isGreenish } from "./color";
import { PLAN_FORMAT, planSchema, WEEKDAYS, type Plan, type PlanDay, type PlanExercise } from "./plan";

/** Paleta de cores dos dias (sem verde). */
export const DAY_PALETTE = ["#FF3B5C", "#3B9BFF", "#F5B942", "#8B7BFF", "#C7CBD6", "#FF8A3D", "#F25FD0", "#5AC8FA"].filter((c) => !isGreenish(c));

const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function nextDayKey(plan: Plan): string {
  const used = new Set(plan.days.map((d) => d.key));
  return [...KEYS].find((k) => !used.has(k)) ?? `D${plan.days.length + 1}`;
}

/** Programa novo, criado no app: 3 dias vazios (A, B, C) em seg/qua/sex. */
export function newPlan(name: string, startDate = isoDay(), weeks = 8): Plan {
  const days: PlanDay[] = ["A", "B", "C"].map((key, i) => ({ key, name: `Treino ${key}`, color: DAY_PALETTE[i], exercises: [] }));
  return planSchema.parse({
    format: PLAN_FORMAT,
    block: { id: `meu-${Date.now().toString(36)}`, name, startDate, weeks, deloadWeeks: [] },
    schedule: { sun: null, mon: "A", tue: null, wed: "B", thu: null, fri: "C", sat: null },
    days,
  });
}

export function addDay(plan: Plan, name?: string): Plan {
  const key = nextDayKey(plan);
  const color = DAY_PALETTE[plan.days.length % DAY_PALETTE.length];
  return { ...plan, days: [...plan.days, { key, name: name ?? `Treino ${key}`, color, exercises: [] }] };
}

/** Remove o dia e tira ele da agenda/rodízio. */
export function removeDay(plan: Plan, key: string): Plan {
  const schedule = { ...plan.schedule };
  for (const wd of WEEKDAYS) if (schedule[wd] === key) schedule[wd] = null;
  const rotation = plan.rotation ? { ...plan.rotation, pattern: plan.rotation.pattern.map((k) => (k === key ? null : k)) } : undefined;
  return { ...plan, schedule, rotation: rotation && rotation.pattern.some(Boolean) ? rotation : undefined, days: plan.days.filter((d) => d.key !== key) };
}

export function updateDay(plan: Plan, key: string, patch: Partial<PlanDay>): Plan {
  return { ...plan, days: plan.days.map((d) => (d.key === key ? { ...d, ...patch } : d)) };
}

/** Prescrição inicial sugerida pelo padrão de movimento do exercício. */
export function defaultsFor(pattern: string | undefined, unilateral = false): Omit<PlanExercise, "name"> {
  if (pattern === "Pilates") return { sets: 1, reps: 10, restSec: 30, perSide: unilateral || undefined };
  if (pattern === "Funcional") return { sets: 3, reps: 12, restSec: 60, perSide: unilateral || undefined };
  if (pattern === "Cardio") return { sets: 1, reps: "20 min", restSec: 0, cardio: { min: 20 } };
  if (pattern === "Alongamento") return { sets: 2, reps: "30 s", restSec: 15, perSide: unilateral || undefined, block: "cooldown" };
  if (pattern === "Mobilidade" || pattern === "Aquecimento") return { sets: 2, reps: 10, restSec: 15, perSide: unilateral || undefined, block: "warmup" };
  const isolation = pattern === "Isolador" || pattern === "Core";
  return isolation
    ? { sets: 3, reps: 12, restSec: 90, rir: "0–2", perSide: unilateral || undefined }
    : { sets: 3, reps: 8, restSec: 150, rir: "1–3", perSide: unilateral || undefined };
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return [...list];
  const out = [...list];
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return out;
}

/** Junta o exercício `i` com o seguinte num superset (reaproveita o rótulo existente ou cria S1, S2…). */
export function linkSuperset(exercises: readonly PlanExercise[], i: number): PlanExercise[] {
  if (i < 0 || i + 1 >= exercises.length) return [...exercises];
  const used = new Set(exercises.map((e) => e.superset).filter(Boolean));
  let label = exercises[i].superset ?? exercises[i + 1].superset;
  if (!label) {
    let n = 1;
    while (used.has(`S${n}`)) n++;
    label = `S${n}`;
  }
  return exercises.map((e, j) => (j === i || j === i + 1 ? { ...e, superset: label } : e));
}

/** Tira o exercício do superset; se o grupo ficar com 1 só, desfaz o grupo. */
export function unlinkSuperset(exercises: readonly PlanExercise[], i: number): PlanExercise[] {
  const label = exercises[i]?.superset;
  if (!label) return [...exercises];
  const out = exercises.map((e, j) => (j === i ? { ...e, superset: undefined } : e));
  const left = out.filter((e) => e.superset === label);
  return left.length < 2 ? out.map((e) => (e.superset === label ? { ...e, superset: undefined } : e)) : out;
}

/** Valida o plano montado no app com o mesmo schema da importação. */
export function validate(plan: Plan): { ok: true; plan: Plan } | { ok: false; errors: string[] } {
  const r = planSchema.safeParse(plan);
  return r.success ? { ok: true, plan: r.data } : { ok: false, errors: r.error.issues.map((i) => i.message) };
}
