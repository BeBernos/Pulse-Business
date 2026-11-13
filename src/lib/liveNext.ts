import { supersetGroups, timedSeconds } from "./prescription";

/** O mínimo de uma série e de um exercício da sessão para decidir "o que vem agora" (igual ao `toggleSet` do treino). */
export interface LSet { id: string; exOrder: number; setIndex: number; kind: string; done: boolean; mode?: string; kg: number | null; reps: number | null; targetKg?: number | null; targetReps?: number | string | null }
export interface LEx { name: string; skipped?: boolean; restSec: number; superset?: string }

const pendingWork = (sets: readonly LSet[], i: number, except?: string) => sets.some((x) => x.exOrder === i && x.id !== except && !x.done && (x.kind === "work" || !!x.mode));

/** Exercício da vez: o que a tela do treino mostrava (se ainda tem série) ou o primeiro com série por fazer. */
export function focusOf(exercises: readonly LEx[], sets: readonly LSet[], preferred?: number | null): number {
  if (preferred != null && exercises[preferred] && !exercises[preferred].skipped && pendingWork(sets, preferred)) return preferred;
  return exercises.findIndex((e, i) => !e.skipped && pendingWork(sets, i));
}

/** Próxima série por fazer de um exercício, com a posição entre as séries de trabalho ("2 de 3"). */
export function nextSetOf(sets: readonly LSet[], exOrder: number): { set: LSet; n: number; total: number; done: number } | null {
  const list = sets.filter((x) => x.exOrder === exOrder).sort((a, b) => a.setIndex - b.setIndex);
  const work = list.filter((x) => x.kind === "work");
  const set = list.find((x) => !x.done);
  if (!set) return null;
  return { set, n: set.kind === "work" ? work.indexOf(set) + 1 : 0, total: work.length, done: work.filter((x) => x.done).length };
}

/** Carga e reps de uma série ainda não feita: o digitado, senão a meta, senão a última feita do mesmo exercício. */
export function fillSet(sets: readonly LSet[], s: LSet): { kg: number | null; reps: number | null } {
  const before = sets.filter((x) => x.exOrder === s.exOrder && x.kind === s.kind && x.done && x.setIndex < s.setIndex && x.kg != null).sort((a, b) => b.setIndex - a.setIndex)[0];
  const kg = s.kg ?? s.targetKg ?? before?.kg ?? null;
  const reps = s.reps ?? (typeof s.targetReps === "number" ? s.targetReps : timedSeconds(s.targetReps ?? "") ?? null);
  return { kg, reps };
}

/**
 * Depois de concluir a série `setId` do exercício `exOrder`: qual exercício vem e quanto descansar.
 * Superset: vai para o próximo da rodada sem descanso; fechou a rodada, descansa e volta ao primeiro.
 */
export function nextAfter(exercises: readonly LEx[], sets: readonly LSet[], exOrder: number, setId: string): { next: number; rest: number } {
  const ex = exercises[exOrder];
  const s = sets.find((x) => x.id === setId);
  const g = supersetGroups(exercises)[exOrder];
  if (g && s?.kind === "work") {
    const pos = g.members.indexOf(exOrder);
    const next = [...g.members.slice(pos + 1), ...g.members.slice(0, pos + 1)].find((i) => !exercises[i].skipped && sets.some((x) => x.exOrder === i && x.kind === "work" && !x.done && x.id !== setId));
    if (next !== undefined) return { next, rest: next > exOrder ? 0 : ex.restSec };
  }
  const remaining = sets.filter((x) => x.exOrder === exOrder && !x.done && x.id !== setId && (x.kind === "work" || s?.kind !== "work"));
  if (remaining.length) return { next: exOrder, rest: s?.kind === "warmup" ? 60 : ex.restSec };
  const idx = exercises.map((_, i) => i);
  const next = [...idx.slice(exOrder + 1), ...idx.slice(0, exOrder)].find((i) => !exercises[i].skipped && pendingWork(sets, i, setId)) ?? -1;
  return { next, rest: ex.restSec };
}

/**
 * As próximas séries em sequência, como se cada "Série feita" fosse tocada (app Android: a notificação avança sozinha
 * com a tela apagada). Cada passo traz o descanso, o exercício seguinte e as séries depois do toque.
 */
export function liveSteps<S extends LSet>(exercises: readonly LEx[], sets: readonly S[], preferred?: number | null, max = 40): { exOrder: number; setId: string; rest: number; next: number; sets: S[] }[] {
  const out: { exOrder: number; setId: string; rest: number; next: number; sets: S[] }[] = [];
  let cur = [...sets];
  let p = preferred ?? null;
  while (out.length < max) {
    const i = focusOf(exercises, cur, p);
    const ns = i >= 0 ? nextSetOf(cur, i) : null;
    if (!ns) break;
    const r = nextAfter(exercises, cur, i, ns.set.id);
    cur = cur.map((x) => (x.id === ns.set.id ? { ...x, done: true } : x));
    p = r.next >= 0 ? r.next : null;
    out.push({ exOrder: i, setId: ns.set.id, rest: r.rest, next: r.next, sets: cur });
  }
  return out;
}
