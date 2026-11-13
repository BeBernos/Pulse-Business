/** Cardio com métricas: o que se registra em cada aparelho (esteira, bicicleta, escada). */

export type CardioMachine = "treadmill" | "bike" | "stairs";

export type CardioMetric = "min" | "km" | "kmh" | "incline" | "rpm" | "level" | "floors" | "bpm" | "kcal";

/** Valores de uma sessão de cardio (meta no plano ou o que foi feito). */
export type CardioValues = Partial<Record<CardioMetric, number>>;

export const METRICS: Record<CardioMetric, { label: string; unit: string; decimal?: boolean }> = {
  min: { label: "Tempo", unit: "min", decimal: true },
  km: { label: "Distância", unit: "km", decimal: true },
  kmh: { label: "Velocidade", unit: "km/h", decimal: true },
  incline: { label: "Inclinação", unit: "%", decimal: true },
  rpm: { label: "Cadência", unit: "rpm" },
  level: { label: "Nível", unit: "" },
  floors: { label: "Andares", unit: "" },
  bpm: { label: "FC média", unit: "bpm" },
  kcal: { label: "Calorias", unit: "kcal" },
};

export const MACHINE_METRICS: Record<CardioMachine, CardioMetric[]> = {
  treadmill: ["min", "km", "kmh", "incline", "bpm", "kcal"],
  bike: ["min", "km", "rpm", "level", "bpm", "kcal"],
  stairs: ["min", "floors", "level", "bpm", "kcal"],
};

export const MACHINE_LABEL: Record<CardioMachine, string> = { treadmill: "Esteira", bike: "Bicicleta", stairs: "Escada" };

/** Aparelho pelo nome, quando o exercício não diz (exercício novo vindo de plano). */
export function guessMachine(name: string): CardioMachine {
  if (/bike|cycle|bicicleta|spinning/i.test(name)) return "bike";
  if (/stair|climb|escada|step/i.test(name)) return "stairs";
  return "treadmill";
}

const num = (v: number, decimal?: boolean) => (decimal && !Number.isInteger(v) ? v.toFixed(1).replace(".", ",") : String(Math.round(v)));

/** "25 min · 2,4 km · 6,5 km/h · 120 bpm" (só o que tem valor, na ordem do aparelho). */
export function fmtCardio(v: CardioValues | undefined, machine: CardioMachine = "treadmill", zone?: string): string {
  if (!v && !zone) return "";
  const order = [...MACHINE_METRICS[machine], ...(Object.keys(METRICS) as CardioMetric[])];
  const seen = new Set<CardioMetric>();
  const parts: string[] = [];
  for (const k of order) {
    if (seen.has(k)) continue;
    seen.add(k);
    const x = v?.[k];
    if (x == null) continue;
    const m = METRICS[k];
    parts.push(k === "level" ? `nível ${num(x)}` : k === "floors" ? `${num(x)} andares` : `${num(x, m.decimal)} ${m.unit}`.trim());
  }
  if (zone) parts.push(zone);
  return parts.join(" · ");
}

/** Velocidade média (km/h) a partir de distância e tempo, quando não foi digitada. */
export function avgSpeed(v: CardioValues): number | null {
  return v.km && v.min ? Math.round((v.km / (v.min / 60)) * 10) / 10 : null;
}

/** Só os campos numéricos válidos (≥ 0) das métricas conhecidas. */
export function cleanCardio(v: Record<string, unknown> | undefined): CardioValues {
  const out: CardioValues = {};
  for (const k of Object.keys(METRICS) as CardioMetric[]) {
    const x = v?.[k];
    if (typeof x === "number" && Number.isFinite(x) && x >= 0) out[k] = x;
  }
  return out;
}
