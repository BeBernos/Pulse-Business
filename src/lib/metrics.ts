/**
 * 1RM estimado (Epley ajustado por RIR): carga × (1 + (reps + RIR) / 30).
 * Sem RIR, assume série até a falha.
 */
export function e1rm(kg: number, reps: number, rir?: number | null): number {
  if (kg <= 0 || reps <= 0) return 0;
  const eff = reps + (rir ?? 0);
  return eff <= 1 ? kg : kg * (1 + eff / 30);
}

export function volume(sets: { kg: number | null; reps: number | null }[]): number {
  return sets.reduce((acc, s) => acc + (s.kg ?? 0) * (s.reps ?? 0), 0);
}

export function fmtVolume(kg: number): string {
  if (kg < 1000) return `${Math.round(kg)} kg`;
  return `${(kg / 1000).toFixed(1).replace(".", ",")} t`;
}

export function fmtDuration(ms: number): string {
  if (ms < 60_000) return "<1 min";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Pausas acima disto (ex.: troca longa, conversa, banheiro) não entram na média de descanso. */
const MAX_REST_GAP_MS = 10 * 60_000;

/**
 * Descanso médio real em segundos: intervalo entre séries de trabalho concluídas consecutivas
 * (pelo horário em que cada uma foi marcada). Inclui trocas de exercício. Null com menos de 2 intervalos.
 */
export function avgRestSec(sets: { kind: string; done: boolean; completedAt?: number }[]): number | null {
  const t = sets
    .filter((s) => s.kind === "work" && s.done && s.completedAt)
    .map((s) => s.completedAt!)
    .sort((a, b) => a - b);
  const gaps = t.slice(1).map((v, i) => v - t[i]).filter((g) => g > 0 && g <= MAX_REST_GAP_MS);
  if (gaps.length < 2) return null;
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length / 1000);
}
