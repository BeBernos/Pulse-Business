import { addDays, mondayOf } from "./calendar";
import { e1rm } from "./metrics";
import { muscleVolume, type MuscleId, type MuscleMap } from "./muscles";

/** Recorte mínimo de sessão/série que as análises precisam (sem depender do Dexie). */
export interface ASession {
  id: string;
  date: string;
  startedAt: number;
  endedAt?: number;
}

export interface ASet {
  sessionId: string;
  exercise: string;
  kind: "warmup" | "work";
  done: boolean;
  kg: number | null;
  reps: number | null;
  rir: number | null;
  completedAt?: number;
}

export interface WeekStat {
  week: string; // segunda-feira da semana
  sessions: number;
  sets: number;
  tonnage: number;
  minutes: number;
}

/** Totais por semana (seg–dom), incluindo semanas vazias no intervalo. */
export function weeklyStats(sessions: ASession[], sets: ASet[], from: string, to: string): WeekStat[] {
  const out = new Map<string, WeekStat>();
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) out.set(w, { week: w, sessions: 0, sets: 0, tonnage: 0, minutes: 0 });
  const weekOfSession = new Map<string, string>();
  for (const s of sessions) {
    const w = mondayOf(s.date);
    const st = out.get(w);
    if (!st) continue;
    weekOfSession.set(s.id, w);
    st.sessions++;
    if (s.endedAt) st.minutes += Math.round((s.endedAt - s.startedAt) / 60000);
  }
  for (const x of sets) {
    if (!x.done || x.kind !== "work") continue;
    const st = out.get(weekOfSession.get(x.sessionId) ?? "");
    if (!st) continue;
    st.sets++;
    st.tonnage += (x.kg ?? 0) * (x.reps ?? 0);
  }
  return [...out.values()];
}

/** Semanas seguidas (terminando na semana de `today`) com pelo menos `target` treinos. A semana atual só conta se já bateu. */
export function weekStreak(dates: string[], today: string, target: number): number {
  if (target <= 0) return 0;
  const perWeek = new Map<string, number>();
  for (const d of dates) perWeek.set(mondayOf(d), (perWeek.get(mondayOf(d)) ?? 0) + 1);
  let w = mondayOf(today);
  let streak = (perWeek.get(w) ?? 0) >= target ? 1 : 0;
  w = addDays(w, -7);
  while ((perWeek.get(w) ?? 0) >= target) {
    streak++;
    w = addDays(w, -7);
  }
  return streak;
}

/** Adesão = treinos feitos / treinos agendados, no intervalo (dias futuros não contam). */
export function adherence(statuses: { status: string }[]): { done: number; planned: number; pct: number | null } {
  let done = 0;
  let missed = 0;
  let skipped = 0;
  for (const { status } of statuses) {
    if (status === "done") done++;
    else if (status === "missed") missed++;
    else if (status === "skipped") skipped++;
  }
  const planned = done + missed + skipped;
  return { done, planned, pct: planned ? Math.round((done / planned) * 100) : null };
}

export interface PR {
  exercise: string;
  sessionId: string;
  date: string;
  kind: "e1rm" | "kg" | "reps";
  value: number;
  previous: number | null;
  kg: number | null;
  reps: number | null;
}

/**
 * Recordes pessoais: para cada exercício, percorre as sessões em ordem e marca quando o melhor
 * 1RM estimado ou a maior carga da sessão supera tudo que veio antes. A 1ª sessão de um exercício não é PR.
 */
export function personalRecords(sessions: ASession[], sets: ASet[]): PR[] {
  const dateOf = new Map(sessions.map((s) => [s.id, s]));
  const byExercise = new Map<string, ASet[]>();
  for (const x of sets) {
    if (!x.done || x.kind !== "work" || !dateOf.has(x.sessionId) || !x.reps) continue;
    byExercise.set(x.exercise, [...(byExercise.get(x.exercise) ?? []), x]);
  }
  const prs: PR[] = [];
  for (const [exercise, list] of byExercise) {
    const bySession = new Map<string, ASet[]>();
    for (const x of list) bySession.set(x.sessionId, [...(bySession.get(x.sessionId) ?? []), x]);
    const ordered = [...bySession.entries()].sort((a, b) => dateOf.get(a[0])!.startedAt - dateOf.get(b[0])!.startedAt);
    let bestE1: number | null = null;
    let bestKg: number | null = null;
    for (const [sessionId, ss] of ordered) {
      const top = ss.reduce((b, x) => (e1rm(x.kg ?? 0, x.reps ?? 0, x.rir) > e1rm(b.kg ?? 0, b.reps ?? 0, b.rir) ? x : b));
      const e1 = e1rm(top.kg ?? 0, top.reps ?? 0, top.rir);
      const heavy = ss.reduce((b, x) => ((x.kg ?? 0) > (b.kg ?? 0) ? x : b));
      const date = dateOf.get(sessionId)!.date;
      if (bestE1 != null && e1 > bestE1 + 0.05)
        prs.push({ exercise, sessionId, date, kind: "e1rm", value: e1, previous: bestE1, kg: top.kg, reps: top.reps });
      else if (bestKg != null && (heavy.kg ?? 0) > bestKg)
        prs.push({ exercise, sessionId, date, kind: "kg", value: heavy.kg ?? 0, previous: bestKg, kg: heavy.kg, reps: heavy.reps });
      bestE1 = Math.max(bestE1 ?? 0, e1);
      bestKg = Math.max(bestKg ?? 0, heavy.kg ?? 0);
    }
  }
  return prs.sort((a, b) => b.date.localeCompare(a.date));
}

/** Séries realmente feitas por músculo (principal 1, secundário ½). */
export function doneMuscleVolume(sets: ASet[], musclesOf: (name: string) => MuscleMap | undefined): Map<MuscleId, number> {
  const count = new Map<string, number>();
  for (const x of sets) if (x.done && x.kind === "work") count.set(x.exercise, (count.get(x.exercise) ?? 0) + 1);
  return muscleVolume([...count].map(([name, n]) => ({ name, muscles: musclesOf(name), sets: n }))).volume;
}

/* ---------------- histórico de cargas ---------------- */

export interface LoadSet {
  date: string;
  kg: number | null;
  reps: number | null;
  rir?: number | null;
}

export interface LoadHistory {
  name: string;
  sessions: number;
  /** série mais pesada do último treino */
  last: LoadSet;
  /** maior carga já feita (desempate: mais reps) */
  best: LoadSet;
  /** 1RM estimado do melhor dia */
  e1rm: number;
}

/**
 * Cargas de cada exercício já feito: o último treino e a melhor marca, para lembrar ao montar o próximo bloco.
 * `sessions` = sessões finalizadas; `sets` = séries de trabalho feitas (sem mobilidade/cardio).
 */
export function loadHistory(sessions: { id: string; date: string; startedAt: number }[], sets: { sessionId: string; exercise: string; kg: number | null; reps: number | null; rir?: number | null }[]): LoadHistory[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const per = new Map<string, { date: string; at: number; sets: typeof sets }[]>();
  for (const s of sets) {
    const ses = byId.get(s.sessionId);
    if (!ses) continue;
    const list = per.get(s.exercise) ?? [];
    let day = list.find((d) => d.at === ses.startedAt);
    if (!day) list.push((day = { date: ses.date, at: ses.startedAt, sets: [] }));
    day.sets.push(s);
    per.set(s.exercise, list);
  }
  const heavier = (a: LoadSet, b: LoadSet) => ((b.kg ?? 0) > (a.kg ?? 0) || ((b.kg ?? 0) === (a.kg ?? 0) && (b.reps ?? 0) > (a.reps ?? 0)) ? b : a);
  const out: LoadHistory[] = [];
  for (const [name, days] of per) {
    days.sort((a, b) => a.at - b.at);
    const top = (d: (typeof days)[number]): LoadSet => d.sets.map((s): LoadSet => ({ date: d.date, kg: s.kg, reps: s.reps, rir: s.rir })).reduce(heavier);
    const best = days.map(top).reduce(heavier);
    const e = Math.max(...days.flatMap((d) => d.sets.map((s) => e1rm(s.kg ?? 0, s.reps ?? 0, s.rir))));
    out.push({ name, sessions: days.length, last: top(days.at(-1)!), best, e1rm: Math.round(e * 10) / 10 });
  }
  return out.sort((a, b) => b.last.date.localeCompare(a.last.date) || a.name.localeCompare(b.name));
}

/** Texto das cargas para o Claude montar o próximo bloco com números reais (só o que foi feito nos últimos `days` dias). */
export function loadsForPrompt(list: LoadHistory[], today: string, days = 180): string {
  const cut = addDays(today, -days);
  const rows = list.filter((l) => l.last.date >= cut && (l.best.kg ?? 0) > 0);
  if (!rows.length) return "";
  const fmt = (s: LoadSet) => `${s.kg ?? "PC"}×${s.reps ?? "?"}${s.rir != null ? ` @${s.rir}` : ""} (${s.date})`;
  return [
    `Minhas cargas (para montar o bloco com números reais; não invente progressão além do que fiz):`,
    ...rows.map((l) => `- ${l.name}: último ${fmt(l.last)} · melhor ${fmt(l.best)} · 1RM est. ${l.e1rm} kg`),
  ].join("\n");
}

/** Maior aumento de carga máxima por exercício em relação ao treino anterior (só exercícios feitos nos dois). */
export function bestGain(now: readonly { exercise: string; kg: number | null }[], before: readonly { exercise: string; kg: number | null }[]): { exercise: string; kg: number } | null {
  const top = (list: typeof now) => {
    const m = new Map<string, number>();
    for (const x of list) if (x.kg != null) m.set(x.exercise, Math.max(m.get(x.exercise) ?? 0, x.kg));
    return m;
  };
  const prev = top(before);
  let best: { exercise: string; kg: number } | null = null;
  for (const [exercise, kg] of top(now)) {
    const p = prev.get(exercise);
    if (p != null && kg - p > 0 && (!best || kg - p > best.kg)) best = { exercise, kg: Math.round((kg - p) * 10) / 10 };
  }
  return best;
}

