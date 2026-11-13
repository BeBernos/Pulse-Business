import { isDeload } from "./calendar";
import { fmtCardio } from "./cardio";
import type { CardioTarget, LoadRep, Plan, PlanDay, PlanExercise, Restriction } from "./plan";

export interface PlannedSet {
  kind: "warmup" | "work";
  kg: number | null;
  reps: number | string;
}

export interface Prescription {
  sets: PlannedSet[];
  restSec: number;
  rir?: string;
  note?: string;
  deload: boolean;
  /** Prescrição veio explícita para a semana (byWeek) — não é derivada. */
  explicit: boolean;
  /** Cardio: metas da sessão (uma "série" só). */
  cardio?: CardioTarget;
}

/** "45 s", "60s", "1 min" → segundos; null se a meta não for por tempo. */
export function timedSeconds(reps: number | string): number | null {
  if (typeof reps !== "string") return null;
  const s = reps.match(/(\d+)\s*s\b/i);
  if (s) return Number(s[1]);
  const m = reps.match(/(\d+(?:[.,]\d+)?)\s*min/i);
  return m ? Math.round(Number(m[1].replace(",", ".")) * 60) : null;
}

const toSet =
  (kind: PlannedSet["kind"]) =>
  (s: LoadRep): PlannedSet => ({ kind, kg: s.kg, reps: s.reps });

/**
 * Prescrição de um exercício numa semana. Regras:
 * - byWeek[semana] explícito sempre vence (rampa + séries de trabalho).
 * - Sem byWeek, usa sets×reps×kg; em semana de deload, corta séries pelo setsFactor (arredonda para cima).
 */
export function prescribe(plan: Plan, ex: PlanExercise, week: number): Prescription {
  const deload = isDeload(plan, week);
  if (ex.cardio) {
    const reps = ex.cardio.min ? `${ex.cardio.min} min` : ex.reps;
    return { sets: [{ kind: "work", kg: null, reps }], restSec: 0, deload, explicit: false, cardio: ex.cardio };
  }
  const wk = ex.byWeek?.[String(week)];
  if (wk) {
    return {
      sets: [...(wk.ramp ?? []).map(toSet("warmup")), ...wk.sets.map(toSet("work"))],
      restSec: ex.restSec,
      rir: deload ? "3–4" : ex.rir,
      note: wk.note,
      deload,
      explicit: true,
    };
  }
  const n = deload ? Math.max(1, Math.ceil(ex.sets * plan.deload.setsFactor)) : ex.sets;
  return {
    sets: Array.from({ length: n }, () => ({ kind: "work" as const, kg: ex.kg ?? null, reps: ex.reps })),
    restSec: ex.restSec,
    rir: deload ? "3–4" : ex.rir,
    deload,
    explicit: false,
  };
}

export function summarize(p: Prescription, ex: PlanExercise): string {
  if (p.cardio) return fmtCardio(p.cardio, p.cardio.machine) || "cardio";
  const work = p.sets.filter((s) => s.kind === "work");
  const side = ex.perSide ? "/lado" : "";
  const sameReps = work.every((s) => s.reps === work[0].reps);
  const reps = sameReps ? `${work.length}×${work[0].reps}${side}` : `${work.map((s) => s.reps).join("·")}${side}`;
  const kgs = [...new Set(work.map((s) => s.kg).filter((k): k is number => k != null))];
  const kg = kgs.length === 1 ? ` @ ${fmtKg(kgs[0])} kg` : kgs.length > 1 ? ` · topo ${fmtKg(Math.max(...kgs))} kg` : "";
  return reps + kg;
}

export function fmtKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace(".", ",");
}

export function fmtRest(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, "0")}` : `${m} min`;
}

export type RestrictionState =
  | { kind: "vetoed"; reason?: string }
  | { kind: "suspended"; until?: string; reason?: string }
  | null;

/** Restrição ativa para o exercício na data. Suspensão vale até a data `until`, inclusive. */
export function restrictionFor(restrictions: readonly Restriction[], name: string, iso: string): RestrictionState {
  for (const r of restrictions) {
    if (r.exercise !== name) continue;
    if (r.type === "vetoed") return { kind: "vetoed", reason: r.reason };
    if (!r.until || iso <= r.until) return { kind: "suspended", until: r.until, reason: r.reason };
  }
  return null;
}

/** Premissas da estimativa de duração (segundos). */
const SET_SEC = 40; // execução de uma série de trabalho
const WARMUP_SET_SEC = 30;
const WARMUP_REST_SEC = 60;
const TRANSITION_SEC = 90; // trocar de aparelho, ajustar carga
const WARMUP_ITEM_SEC = 120; // cada item do aquecimento geral

/** Minutos de cardio citados no texto (ex.: "20–25 min" → 22,5). Sem número → 0. */
export function cardioMinutes(text: string | null | undefined): number {
  if (!text || /sem cardio|opcional/i.test(text)) return 0;
  const m = text.match(/(\d+)\s*(?:[–-]\s*(\d+))?\s*min/);
  if (!m) return 0;
  return m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
}

/**
 * Duração estimada do treino em minutos: séries × (execução + descanso), rampas,
 * transições entre exercícios, aquecimento geral e cardio. Exercícios restritos ficam de fora.
 * Unilaterais por lado contam a execução em dobro.
 */
export function estimateMinutes(plan: Plan, day: PlanDay, week: number, skip: (name: string) => boolean = () => false): number {
  let sec = (day.warmup?.length ?? 0) * WARMUP_ITEM_SEC;
  const groups = supersetGroups(day.exercises);
  day.exercises.forEach((ex, i) => {
    if (skip(ex.name)) return;
    const p = prescribe(plan, ex, week);
    if (p.cardio) {
      sec += (p.cardio.min ?? 20) * 60 + TRANSITION_SEC;
      return;
    }
    const work = p.sets.filter((s) => s.kind === "work").length;
    const warm = p.sets.length - work;
    // série por tempo (prancha, alongamento): o tempo da meta no lugar da execução padrão
    const exec = (timedSeconds(p.sets.find((s) => s.kind === "work")?.reps ?? "") ?? SET_SEC) * (ex.perSide ? 2 : 1);
    // no superset só se descansa depois do último exercício da rodada
    const g = groups[i];
    const rest = g && !g.isLast ? 0 : p.restSec;
    sec += warm * (WARMUP_SET_SEC + WARMUP_REST_SEC);
    sec += work * exec + Math.max(0, work - 1) * rest;
    sec += g && !g.isFirst ? 15 : TRANSITION_SEC; // dentro do superset a troca já está montada
  });
  return Math.round(sec / 60 + cardioMinutes(day.cardio));
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export interface SupersetPos {
  label: string;
  /** Letra para mostrar (A, B, C… na ordem dos grupos do dia); o `label` do plano pode ser "S1". */
  letter: string;
  /** Índices dos exercícios do grupo, em ordem. */
  members: number[];
  isFirst: boolean;
  isLast: boolean;
}

/** Posição de cada exercício no seu superset (null se não estiver em um). */
export function supersetGroups(exercises: readonly { superset?: string }[]): (SupersetPos | null)[] {
  const out: (SupersetPos | null)[] = exercises.map(() => null);
  let i = 0;
  let n = 0;
  while (i < exercises.length) {
    const label = exercises[i].superset;
    let j = i;
    while (label && j + 1 < exercises.length && exercises[j + 1].superset === label) j++;
    if (label && j > i) {
      const members = Array.from({ length: j - i + 1 }, (_, k) => i + k);
      const letter = String.fromCharCode(65 + n++);
      for (const m of members) out[m] = { label, letter, members, isFirst: m === i, isLast: m === j };
    }
    i = j + 1;
  }
  return out;
}
