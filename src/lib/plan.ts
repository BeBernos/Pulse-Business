import { z } from "zod";
import { isGreenish } from "./color";
import { MUSCLES, type MuscleId } from "./muscles";

/** Formato que os chats do Claude geram e o app importa. Ver docs/FORMATO-PLANO.md. */
export const PLAN_FORMAT = "app-treino/plan@1";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD");
const loadRep = z.object({ kg: z.number().nonnegative(), reps: z.union([z.number().int().positive(), z.string()]) });

const weekPrescription = z.object({
  sets: z.array(loadRep).min(1),
  ramp: z.array(loadRep).optional(),
  note: z.string().optional(),
});

const metric = z.number().nonnegative().optional();
/** Cardio: metas da sessão (todas opcionais). `machine` sai da biblioteca quando omitido. */
const cardioTarget = z.object({
  machine: z.enum(["treadmill", "bike", "stairs"]).optional(),
  min: metric,
  km: metric,
  kmh: metric,
  incline: metric,
  rpm: metric,
  level: metric,
  floors: metric,
  bpm: metric,
  kcal: metric,
  /** Zona/intensidade em texto (ex.: "Z2", "110–128 bpm"). */
  zone: z.string().optional(),
});

const planExercise = z.object({
  name: z.string().min(1),
  /** Bloco do dia: aquecimento, principal (padrão) ou volta à calma. */
  block: z.enum(["warmup", "main", "cooldown"]).optional(),
  /** Exercício de cardio com métricas (1 sessão em vez de séries). */
  cardio: cardioTarget.optional(),
  sets: z.number().int().positive().default(3),
  reps: z.union([z.number().int().positive(), z.string()]).default(10),
  kg: z.number().nonnegative().nullable().optional(),
  restSec: z.number().int().nonnegative().default(90),
  rir: z.string().optional(),
  perSide: z.boolean().optional(),
  priority: z.boolean().optional(),
  main: z.boolean().optional(),
  sub: z.string().nullable().optional(),
  handle: z.string().nullable().optional(),
  notes: z.string().optional(),
  /** Por que este exercício e essa prescrição (explicação do Claude, mostrada no app). */
  why: z.string().max(800).optional(),
  /** Rótulo do superset (ex.: "S1"). Exercícios consecutivos com o mesmo rótulo formam um superset. */
  superset: z.string().min(1).max(4).optional(),
  byWeek: z.record(z.string().regex(/^\d+$/), weekPrescription).optional(),
});

const dayKey = z.string().min(1).max(3);

const planDay = z.object({
  key: dayKey,
  name: z.string().min(1),
  /** Foco do dia (ex.: "peito superior e ombro lateral"). */
  focus: z.string().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  warmup: z.array(z.string()).optional(),
  cooldown: z.array(z.string()).optional(),
  cardio: z.string().nullable().optional(),
  exercises: z.array(planExercise).default([]),
});

const restriction = z.object({
  exercise: z.string().min(1),
  type: z.enum(["vetoed", "suspended"]),
  until: isoDate.optional(),
  reason: z.string().optional(),
});

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export { WEEKDAYS };

export const planSchema = z
  .object({
    format: z.literal(PLAN_FORMAT),
    block: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      startDate: isoDate,
      weeks: z.number().int().min(1).max(52),
      deloadWeeks: z.array(z.number().int().positive()).default([]),
      weekLabels: z.record(z.string(), z.string()).optional(),
      goal: z.string().optional(),
      notes: z.string().optional(),
    }),
    schedule: z.object(Object.fromEntries(WEEKDAYS.map((d) => [d, dayKey.nullable()])) as Record<Weekday, z.ZodNullable<typeof dayKey>>),
    /**
     * Rodízio opcional: sequência de dias (null = descanso) que se repete a partir de `start`
     * (padrão: block.startDate). Quando existe, substitui o `schedule` por dia da semana.
     */
    rotation: z.object({ pattern: z.array(dayKey.nullable()).min(2).max(28), start: isoDate.optional() }).optional(),
    deload: z.object({ setsFactor: z.number().min(0.1).max(1) }).default({ setsFactor: 0.5 }),
    days: z.array(planDay).min(1),
    restrictions: z.array(restriction).default([]),
    notes: z.array(z.string()).default([]),
    /** Meta de séries por semana por músculo (ids de `lib/muscles.ts`); Progresso e o resumo da semana comparam com o feito. */
    volumeTargets: z.partialRecord(z.enum(Object.keys(MUSCLES) as [MuscleId, ...MuscleId[]]), z.number().min(0).max(40)).optional(),
    /** A análise por trás do bloco (o que melhorar e por quê, método), mostrada em Treinos. */
    rationale: z
      .object({
        summary: z.string().max(3000).optional(),
        priorities: z.array(z.object({ area: z.string().min(1).max(120), why: z.string().max(800) })).max(20).optional(),
        method: z.string().max(3000).optional(),
      })
      .optional(),
  })
  .superRefine((plan, ctx) => {
    const keys = new Set<string>();
    for (const d of plan.days) {
      if (keys.has(d.key)) ctx.addIssue({ code: "custom", message: `dia "${d.key}" duplicado`, path: ["days"] });
      keys.add(d.key);
    }
    for (const wd of WEEKDAYS) {
      const k = plan.schedule[wd];
      if (k && !keys.has(k)) ctx.addIssue({ code: "custom", message: `schedule.${wd} aponta para o dia "${k}", que não existe`, path: ["schedule", wd] });
    }
    plan.rotation?.pattern.forEach((k, i) => {
      if (k && !keys.has(k)) ctx.addIssue({ code: "custom", message: `rotation.pattern[${i}] aponta para o dia "${k}", que não existe`, path: ["rotation", "pattern", i] });
    });
    if (plan.rotation && plan.rotation.pattern.every((k) => !k))
      ctx.addIssue({ code: "custom", message: "rotation.pattern só tem descanso", path: ["rotation", "pattern"] });
    plan.days.forEach((d, di) => {
      const seen = new Set<string>();
      d.exercises.forEach((ex, i) => {
        if (!ex.superset) return;
        if (seen.has(ex.superset) && d.exercises[i - 1]?.superset !== ex.superset)
          ctx.addIssue({ code: "custom", message: `dia ${d.key}: superset "${ex.superset}" precisa de exercícios em sequência`, path: ["days", di, "exercises", i, "superset"] });
        seen.add(ex.superset);
      });
      for (const label of seen)
        if (d.exercises.filter((e) => e.superset === label).length < 2)
          ctx.addIssue({ code: "custom", message: `dia ${d.key}: superset "${label}" tem só 1 exercício`, path: ["days", di] });
    });
    for (const w of plan.block.deloadWeeks)
      if (w > plan.block.weeks) ctx.addIssue({ code: "custom", message: `deload na semana ${w}, mas o bloco tem ${plan.block.weeks}`, path: ["block", "deloadWeeks"] });
  });

export type Plan = z.infer<typeof planSchema>;
export type PlanDay = Plan["days"][number];
export type PlanExercise = PlanDay["exercises"][number];
export type Restriction = Plan["restrictions"][number];
export type LoadRep = z.infer<typeof loadRep>;
export type CardioTarget = z.infer<typeof cardioTarget>;
export type DayBlock = "warmup" | "main" | "cooldown";

export type ParseResult =
  | { ok: true; plan: Plan; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * Aceita o JSON puro ou um bloco de código Markdown colado do chat
 * (```json ... ```), e valida contra o schema.
 */
export function parsePlan(text: string, knownExercises: ReadonlySet<string> = new Set()): ParseResult {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, errors: [`JSON inválido: ${(e as Error).message}`] };
  }
  const res = planSchema.safeParse(data);
  if (!res.success)
    return { ok: false, errors: res.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`) };

  const plan = res.data;
  const warnings: string[] = [];
  const vetoed = new Set(plan.restrictions.filter((r) => r.type === "vetoed").map((r) => r.exercise));
  for (const day of plan.days) {
    if (!day.exercises.length) warnings.push(`${day.key}: dia sem exercícios.`);
    if (day.color && isGreenish(day.color))
      warnings.push(`${day.key}: cor ${day.color} é verde (proibido) e será trocada por uma cor padrão.`);
    for (const ex of day.exercises) {
      if (knownExercises.size && !knownExercises.has(ex.name))
        warnings.push(`${day.key}: "${ex.name}" não está na biblioteca (será criado como exercício novo).`);
      if (ex.sub && knownExercises.size && !knownExercises.has(ex.sub))
        warnings.push(`${day.key}: substituto "${ex.sub}" não está na biblioteca.`);
      if (vetoed.has(ex.name)) warnings.push(`${day.key}: "${ex.name}" está VETADO e foi programado.`);
      for (const w of Object.keys(ex.byWeek ?? {}))
        if (+w < 1 || +w > plan.block.weeks) warnings.push(`${day.key}: "${ex.name}" tem prescrição para a semana ${w}, fora do bloco.`);
    }
  }
  return { ok: true, plan, warnings };
}
