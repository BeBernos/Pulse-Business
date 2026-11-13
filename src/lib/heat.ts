import { MUSCLES, SECONDARY_WEIGHT, type MuscleId, type MuscleMap } from "./muscles";

/** Mapa de calor 0–1 por músculo (principal = 1 série, secundário = ½), normalizado pelo mais trabalhado. */
export function muscleHeat(entries: readonly { muscles?: MuscleMap; sets: number }[]): Map<MuscleId, number> {
  const v = new Map<MuscleId, number>();
  for (const e of entries) {
    if (!e.muscles || e.sets <= 0) continue;
    for (const m of e.muscles.primary) v.set(m, (v.get(m) ?? 0) + e.sets);
    for (const m of e.muscles.secondary) v.set(m, (v.get(m) ?? 0) + e.sets * SECONDARY_WEIGHT);
  }
  const max = Math.max(0, ...v.values());
  return max ? new Map([...v].map(([k, x]) => [k, x / max])) : v;
}

/** Os `n` músculos mais trabalhados (rótulos em português; traduzir ao mostrar). */
export function topMuscles(heat: ReadonlyMap<MuscleId, number>, n = 4): string[] {
  return [...heat].sort((a, b) => b[1] - a[1]).slice(0, n).map(([m]) => MUSCLES[m].label);
}

/** Séries de trabalho feitas por exercício → entradas para `muscleHeat`. */
export function doneSetsByExercise(sets: readonly { exercise: string; done: boolean; kind: string; mode?: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sets) if (s.done && s.kind === "work" && !s.mode) out.set(s.exercise, (out.get(s.exercise) ?? 0) + 1);
  return out;
}
