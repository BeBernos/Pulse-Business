import { adherence, doneMuscleVolume, personalRecords } from "./analytics";
import { addDays, dayStatus, weekRange } from "./calendar";
import { e1rm } from "./metrics";
import type { MuscleId, MuscleMap } from "./muscles";
import type { Plan } from "./plan";
import { prescribe, summarize } from "./prescription";

interface S { id: string; date: string; startedAt: number; endedAt?: number; status?: string; pains?: { area: string; intensity: number }[]; exercises?: { name: string }[] }
interface X { sessionId: string; exercise: string; exOrder?: number; kind: string; done: boolean; mode?: string; kg: number | null; reps: number | null; rir?: number | null; completedAt?: number }
interface W { date: string; value: number }

const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const work = (x: X) => x.done && x.kind === "work" && !x.mode;

/* ---------------- resumo da semana ---------------- */

export interface WeekReview {
  from: string;
  to: string;
  done: number;
  planned: number;
  sets: number;
  prs: number;
  weight: number | null;
  weightPrev: number | null;
  /** Músculos com meta no plano: séries feitas × meta. */
  muscles: { id: MuscleId; done: number; target: number }[];
}

/** A semana (seg–dom) que começa em `from`: treinos feitos × planejados, séries, recordes, peso médio e metas de volume. */
export function weekReview(p: { from: string; today: string; plan?: Plan; sessions: S[]; sets: X[]; skipped: ReadonlySet<string>; weights: W[]; musclesOf: (n: string) => MuscleMap | undefined }): WeekReview {
  const to = addDays(p.from, 6);
  const inWeek = (d: string) => d >= p.from && d <= to;
  const ss = p.sessions.filter((s) => inWeek(s.date));
  const ids = new Set(ss.map((s) => s.id));
  const sets = p.sets.filter((x) => ids.has(x.sessionId) && work(x));
  const trained = new Set(p.sessions.map((s) => s.date));
  const days = Array.from({ length: 7 }, (_, i) => addDays(p.from, i));
  const adh = adherence(days.map((d) => ({ status: dayStatus(p.plan, d, p.today, trained, p.skipped) })));
  const vol = doneMuscleVolume(sets as never, p.musclesOf);
  const targets = Object.entries(p.plan?.volumeTargets ?? {}) as [MuscleId, number][];
  const prevFrom = addDays(p.from, -7);
  return {
    from: p.from,
    to,
    done: adh.done,
    planned: adh.planned,
    sets: sets.length,
    prs: personalRecords(p.sessions as never, p.sets as never).filter((r) => inWeek(r.date)).length,
    weight: avg(p.weights.filter((w) => inWeek(w.date)).map((w) => w.value)),
    weightPrev: avg(p.weights.filter((w) => w.date >= prevFrom && w.date < p.from).map((w) => w.value)),
    muscles: targets.map(([id, target]) => ({ id, target, done: Math.round((vol.get(id) ?? 0) * 10) / 10 })),
  };
}

/* ---------------- dor repetida ---------------- */

export interface PainAlert { area: string; times: number; of: number; max: number }

/** Dor na mesma região em 2+ dos últimos `last` treinos finalizados (o registro é feito ao finalizar). */
export function painAlerts(sessions: S[], last = 4): PainAlert[] {
  const recent = sessions.filter((s) => s.status === "done").sort((a, b) => b.startedAt - a.startedAt).slice(0, last);
  const by = new Map<string, number[]>();
  for (const s of recent) for (const pn of s.pains ?? []) if (pn.intensity > 0) by.set(pn.area, [...(by.get(pn.area) ?? []), pn.intensity]);
  return [...by]
    .filter(([, v]) => v.length >= 2)
    .map(([area, v]) => ({ area, times: v.length, of: recent.length, max: Math.max(...v) }))
    .sort((a, b) => b.max - a.max || b.times - a.times);
}

/* ---------------- tempo por exercício ---------------- */

/**
 * Onde o treino passou o tempo: cada série "custa" o intervalo desde a série anterior (ou desde o começo),
 * somado por exercício. Inclui o descanso antes de cada série, que é o que alonga o treino.
 */
export function exerciseTimes(session: S, sets: X[]): { exercise: string; ms: number; sets: number }[] {
  const done = sets.filter((x) => x.sessionId === session.id && x.done && x.completedAt).sort((a, b) => a.completedAt! - b.completedAt!);
  const by = new Map<string, { ms: number; sets: number }>();
  let prev = session.startedAt;
  for (const x of done) {
    const cur = by.get(x.exercise) ?? { ms: 0, sets: 0 };
    by.set(x.exercise, { ms: cur.ms + Math.max(0, x.completedAt! - prev), sets: cur.sets + 1 });
    prev = x.completedAt!;
  }
  return [...by].map(([exercise, v]) => ({ exercise, ...v })).sort((a, b) => b.ms - a.ms);
}

/* ---------------- comparar blocos ---------------- */

export interface BlockSummary {
  id: string;
  name: string;
  from: string;
  to: string;
  sessions: number;
  adherence: number | null;
  setsPerWeek: number;
  tonnagePerWeek: number;
  weightStart: number | null;
  weightEnd: number | null;
  /** Melhor 1RM estimado de cada exercício no bloco. */
  best: Map<string, number>;
}

/** Números de um bloco (do início do bloco até o fim, ou até hoje se ainda está rolando). */
export function blockSummary(p: { id: string; plan: Plan; today: string; sessions: S[]; sets: X[]; skipped: ReadonlySet<string>; weights: W[] }): BlockSummary {
  const from = weekRange(p.plan, 1).start;
  const end = weekRange(p.plan, p.plan.block.weeks).end;
  const to = end < p.today ? end : p.today;
  const inB = (d: string) => d >= from && d <= to;
  const ss = p.sessions.filter((s) => inB(s.date));
  const ids = new Set(ss.map((s) => s.id));
  const sets = p.sets.filter((x) => ids.has(x.sessionId) && work(x));
  const trained = new Set(p.sessions.map((s) => s.date));
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const weeks = Math.max(1, days.length / 7);
  const best = new Map<string, number>();
  for (const x of sets) best.set(x.exercise, Math.max(best.get(x.exercise) ?? 0, e1rm(x.kg ?? 0, x.reps ?? 0, x.rir)));
  const ws = p.weights.filter((w) => inB(w.date)).sort((a, b) => a.date.localeCompare(b.date));
  const firstWeek = ws.filter((w) => w.date <= addDays(ws[0]?.date ?? from, 6)).map((w) => w.value);
  const lastWeek = ws.filter((w) => w.date >= addDays(ws.at(-1)?.date ?? to, -6)).map((w) => w.value);
  return {
    id: p.id,
    name: p.plan.block.name,
    from,
    to,
    sessions: ss.length,
    adherence: adherence(days.map((d) => ({ status: dayStatus(p.plan, d, p.today, trained, p.skipped) }))).pct,
    setsPerWeek: Math.round((sets.length / weeks) * 10) / 10,
    tonnagePerWeek: Math.round(sets.reduce((a, x) => a + (x.kg ?? 0) * (x.reps ?? 0), 0) / weeks),
    weightStart: avg(firstWeek),
    weightEnd: avg(lastWeek),
    best,
  };
}

/** Exercícios feitos nos dois blocos: 1RM estimado antes × depois (maiores ganhos primeiro). */
export function compareBest(a: BlockSummary, b: BlockSummary, n = 6): { exercise: string; before: number; after: number; pct: number }[] {
  return [...b.best]
    .filter(([ex, v]) => v > 0 && (a.best.get(ex) ?? 0) > 0)
    .map(([exercise, after]) => {
      const before = a.best.get(exercise)!;
      return { exercise, before, after, pct: ((after - before) / before) * 100 };
    })
    .sort((x, y) => y.pct - x.pct)
    .slice(0, n);
}

/* ---------------- o que muda no plano importado ---------------- */

export interface DayDiff { key: string; name: string; added: string[]; removed: string[]; changed: { name: string; from: string; to: string }[] }
export interface PlanDiff { daysAdded: string[]; daysRemoved: string[]; days: DayDiff[] }

/** Diferença entre o plano ativo e o novo, por dia (semana 1 de cada): exercícios que entram, saem e mudam. */
export function planDiff(old: Plan, next: Plan): PlanDiff {
  const label = (d: { key: string; name: string }) => `${d.key} · ${d.name}`;
  const oldDays = new Map(old.days.map((d) => [d.key, d]));
  const nextKeys = new Set(next.days.map((d) => d.key));
  const days: DayDiff[] = [];
  for (const d of next.days) {
    const o = oldDays.get(d.key);
    if (!o) continue;
    const before = new Map(o.exercises.map((e) => [e.name, summarize(prescribe(old, e, 1), e)]));
    const after = new Map(d.exercises.map((e) => [e.name, summarize(prescribe(next, e, 1), e)]));
    const diff: DayDiff = {
      key: d.key,
      name: d.name,
      added: [...after.keys()].filter((n) => !before.has(n)),
      removed: [...before.keys()].filter((n) => !after.has(n)),
      changed: [...after].filter(([n, s]) => before.has(n) && before.get(n) !== s).map(([name, to]) => ({ name, from: before.get(name)!, to })),
    };
    if (diff.added.length || diff.removed.length || diff.changed.length) days.push(diff);
  }
  return {
    daysAdded: next.days.filter((d) => !oldDays.has(d.key)).map(label),
    daysRemoved: old.days.filter((d) => !nextKeys.has(d.key)).map(label),
    days,
  };
}

/** Dias de treino dos últimos `back` dias (antes de hoje) sem treino nem motivo registrado — o Início pergunta "Treinou?". */
export function missedDays(plan: Plan | undefined, today: string, trained: ReadonlySet<string>, skipped: ReadonlySet<string>, back = 7): string[] {
  return Array.from({ length: back }, (_, i) => addDays(today, i - back)).filter((d) => dayStatus(plan, d, today, trained, skipped) === "missed");
}
