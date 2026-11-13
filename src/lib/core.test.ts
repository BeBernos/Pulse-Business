import { describe, expect, it } from "vitest";
import seed from "../data/seed-plan.json";
import { LIBRARY as library } from "./library";
import { blockStatus, mondayOf, nextTrainingDay, scheduledDay, weekLabel, weekOf } from "./calendar";
import { avgRestSec, e1rm } from "./metrics";
import { parsePlan, planSchema } from "./plan";
import { PLATE_COLORS, plateLoad } from "./plates";
import { isGreenish } from "./color";
import { MUSCLES, muscleVolume, type MuscleMap } from "./muscles";
import { cardioMinutes, estimateMinutes, fmtMinutes, prescribe, restrictionFor, summarize, supersetGroups } from "./prescription";

const plan = planSchema.parse(seed);
const day = (k: string) => plan.days.find((d) => d.key === k)!;
const squat = day("C").exercises[0];
const deadlift = day("E").exercises[0];

describe("calendário (regressões do dashboard antigo)", () => {
  it("semana 1 começa na segunda 27/07, mesmo com o bloco iniciando na terça 28/07", () => {
    expect(mondayOf("2026-07-28")).toBe("2026-07-27");
    expect(weekOf(plan, "2026-07-27")).toBe(1);
    expect(weekOf(plan, "2026-08-02")).toBe(1);
  });
  it("vira a semana na segunda, não na terça", () => {
    expect(weekOf(plan, "2026-08-03")).toBe(2);
    expect(weekOf(plan, "2026-10-12")).toBe(12);
    expect(weekOf(plan, "2026-10-18")).toBe(12);
    expect(weekOf(plan, "2026-10-19")).toBe(13);
  });
  it("status do bloco", () => {
    expect(blockStatus(plan, "2026-07-26")).toBe("before");
    expect(blockStatus(plan, "2026-10-25")).toBe("live");
    expect(blockStatus(plan, "2026-10-26")).toBe("after");
  });
  it("split: qua e dom são descanso; em dia de descanso abre o próximo treino", () => {
    expect(scheduledDay(plan, "2026-10-19")?.key).toBe("A");
    expect(scheduledDay(plan, "2026-10-21")).toBeNull();
    expect(scheduledDay(plan, "2026-10-22")?.key).toBe("C");
    expect(nextTrainingDay(plan, "2026-10-18")).toMatchObject({ date: "2026-10-19", day: { key: "A" } });
    expect(nextTrainingDay(plan, "2026-10-21")).toMatchObject({ date: "2026-10-22", day: { key: "C" } });
  });
  it("rótulos de semana", () => {
    expect(weekLabel(plan, 7)).toBe("Deload");
    expect(weekLabel(plan, 13)).toContain("Tipo 3");
  });
});

describe("prescrição", () => {
  it("cargas do ciclo 1 não são chumbadas: ciclo 2 soma +5 kg", () => {
    const w1 = prescribe(plan, squat, 1).sets.filter((s) => s.kind === "work").map((s) => s.kg);
    const w4 = prescribe(plan, squat, 4).sets.filter((s) => s.kind === "work").map((s) => s.kg);
    expect(w1).toEqual([100, 105, 110, 120]);
    expect(w4).toEqual([105, 110, 115, 125]);
  });
  it("deload do agachamento/terra usa o topo do último ciclo concluído (140), não um valor fixo", () => {
    const p = prescribe(plan, deadlift, 7);
    expect(p.deload).toBe(true);
    expect(p.sets.filter((s) => s.kind === "work")).toEqual([
      { kind: "work", kg: 105, reps: 5 },
      { kind: "work", kg: 140, reps: 2 },
    ]);
  });
  it("deload corta pela metade (arredondando para cima) os exercícios sem prescrição explícita", () => {
    const lateral = day("A").exercises.find((e) => e.name === "Seated Dumbbell Lateral Raise")!;
    expect(prescribe(plan, lateral, 6).sets).toHaveLength(4);
    expect(prescribe(plan, lateral, 7).sets).toHaveLength(2);
    const crossover = day("A").exercises.find((e) => e.name === "Bent Over Cable Crossover")!;
    expect(prescribe(plan, crossover, 7).sets).toHaveLength(2);
  });
  it("rampas enxutas batem com a tabela do handoff (§5.3)", () => {
    const ramp = (ex: typeof squat, w: number) => prescribe(plan, ex, w).sets.filter((s) => s.kind === "warmup").map((s) => s.kg);
    expect(ramp(squat, 1)).toEqual([20, 55, 80]);
    expect(ramp(squat, 11)).toEqual([20, 65, 90]);
    expect(ramp(deadlift, 4)).toEqual([60, 85]);
    expect(ramp(deadlift, 13)).toEqual([60, 90]);
  });
  it("resumo legível", () => {
    const pulldown = day("B").exercises[0];
    expect(summarize(prescribe(plan, pulldown, 12), pulldown)).toBe("4×8 @ 82 kg");
    expect(summarize(prescribe(plan, squat, 13), squat)).toBe("6·4·3·2 · topo 150 kg");
  });
  it("agachamento suspenso até 31/10 inclusive; veto é permanente", () => {
    expect(restrictionFor(plan.restrictions, squat.name, "2026-10-31")?.kind).toBe("suspended");
    expect(restrictionFor(plan.restrictions, squat.name, "2026-11-01")).toBeNull();
    expect(restrictionFor(plan.restrictions, "Lying Triceps Extension with a Barbell", "2030-01-01")?.kind).toBe("vetoed");
  });
});

describe("anilhas", () => {
  it("barra vazia não vira 25/30 kg", () => {
    expect(plateLoad(20)).toEqual({ perSide: [], remainder: 0, barOnly: true });
  });
  it("monta guloso 20 → 10 → 5 → 2,5", () => {
    expect(plateLoad(145).perSide).toEqual([20, 20, 20, 2.5]);
    expect(plateLoad(85).perSide).toEqual([20, 10, 2.5]);
  });
  it("reporta sobra impossível", () => {
    expect(plateLoad(83).remainder).toBeCloseTo(1.5);
  });
});

describe("importação de plano", () => {
  const names = new Set(library.map((e) => e.name));
  it("o plano semente é válido e só usa nomes da biblioteca", () => {
    const r = parsePlan(JSON.stringify(seed), names);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });
  it("aceita bloco de código markdown colado do chat", () => {
    expect(parsePlan("Segue o plano:\n```json\n" + JSON.stringify(seed) + "\n```\nBom treino!", names).ok).toBe(true);
  });

  it("guarda as explicações do Claude (rationale do bloco, focus do dia, why do exercício)", () => {
    const withWhy = structuredClone(seed) as typeof seed & Record<string, unknown>;
    withWhy.rationale = { summary: "Ombro lateral é o ponto fraco.", priorities: [{ area: "Deltoide lateral", why: "11 séries/sem" }], method: "6–8 reps, RIR 1–3" };
    (withWhy.days[0] as Record<string, unknown>).focus = "peito superior";
    (withWhy.days[0].exercises[0] as Record<string, unknown>).why = "prioridade do bloco";
    const r = parsePlan(JSON.stringify(withWhy), names);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.plan.rationale?.priorities?.[0].area).toBe("Deltoide lateral");
    expect(r.plan.days[0].focus).toBe("peito superior");
    expect(r.plan.days[0].exercises[0].why).toBe("prioridade do bloco");
  });
  it("metas de volume por músculo: aceita ids conhecidos, recusa músculo inventado", () => {
    const ok = { ...structuredClone(seed), volumeTargets: { delt_lat: 16, peito_sup: 10 } };
    const r = parsePlan(JSON.stringify(ok), names);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.plan.volumeTargets).toEqual({ delt_lat: 16, peito_sup: 10 });
    expect(parsePlan(JSON.stringify({ ...structuredClone(seed), volumeTargets: { ombro: 12 } }), names).ok).toBe(false);
  });
  it("aponta exercício vetado e nome desconhecido", () => {
    const bad = structuredClone(seed) as typeof seed;
    bad.days[0].exercises[5].name = "Lying Triceps Extension with a Barbell";
    bad.days[0].exercises[6].name = "Exercicio Inventado";
    const r = parsePlan(JSON.stringify(bad), names);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings.some((w) => w.includes("VETADO"))).toBe(true);
      expect(r.warnings.some((w) => w.includes("Exercicio Inventado"))).toBe(true);
    }
  });
  it("rejeita schedule apontando para dia inexistente", () => {
    const bad = structuredClone(seed);
    (bad.schedule as Record<string, string | null>).wed = "Z";
    const r = parsePlan(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain('"Z"');
  });
  it("rejeita JSON quebrado com mensagem clara", () => {
    const r = parsePlan("{ nope");
    expect(r.ok).toBe(false);
  });
});

describe("sem verde", () => {
  it("detecta tons de verde e ignora as cores do app", () => {
    for (const g of ["#22C55E", "#3FA34D", "#0E9F8F", "#00FF00", "#84CC16"]) expect(isGreenish(g)).toBe(true);
    for (const c of ["#FF3B5C", "#3B9BFF", "#F5B942", "#8B7BFF", "#C7CBD6", "#4DA3FF", "#E4E2DD", "#FF8A3D"]) expect(isGreenish(c)).toBe(false);
  });
  it("nenhuma cor verde no plano semente nem nas anilhas", () => {
    for (const d of plan.days) expect(isGreenish(d.color ?? "")).toBe(false);
    for (const c of Object.values(PLATE_COLORS)) expect(isGreenish(c)).toBe(false);
  });
  it("plano importado com verde gera aviso", () => {
    const bad = structuredClone(seed);
    bad.days[3].color = "#22C55E";
    const r = parsePlan(JSON.stringify(bad));
    expect(r.ok && r.warnings.some((w) => w.includes("verde"))).toBe(true);
  });
});

describe("métricas", () => {
  it("descanso médio real ignora aquecimento, séries não feitas e pausas longas", () => {
    const at = (min: number) => min * 60_000;
    const sets = [
      { kind: "warmup", done: true, completedAt: at(0) },
      { kind: "work", done: true, completedAt: at(2) },
      { kind: "work", done: true, completedAt: at(5) },
      { kind: "work", done: true, completedAt: at(8) },
      { kind: "work", done: false },
      { kind: "work", done: true, completedAt: at(30) }, // pausa de 22 min: fora
    ];
    expect(avgRestSec(sets)).toBe(180);
    expect(avgRestSec(sets.slice(0, 2))).toBeNull();
  });
  it("e1RM com RIR", () => {
    expect(e1rm(100, 5, 0)).toBeCloseTo(116.67, 1);
    expect(e1rm(100, 5, 2)).toBeCloseTo(123.33, 1);
    expect(e1rm(140, 1, 0)).toBe(140);
  });
});

describe("duração estimada", () => {
  it("lê minutos de cardio do texto", () => {
    expect(cardioMinutes("ClimbMill Z2 · 20–25 min · ~120 bpm (110–128)")).toBe(22.5);
    expect(cardioMinutes("Sem cardio")).toBe(0);
    expect(cardioMinutes("Sem cardio (opcional: 15 min de caminhada inclinada)")).toBe(0);
  });
  it("estima todos os dias da semana 12 e deixa o agachamento suspenso de fora", () => {
    const est = Object.fromEntries(plan.days.map((d) => [d.key, estimateMinutes(plan, d, 12)]));
    const cSemSquat = estimateMinutes(plan, day("C"), 12, (n) => n === squat.name);
    expect(cSemSquat).toBeLessThan(est.C);
    for (const m of Object.values(est)) expect(m).toBeGreaterThan(40);
    expect(fmtMinutes(125)).toBe("2h05");
    expect(fmtMinutes(45)).toBe("45 min");
  });
});

describe("volume por músculo", () => {
  const lib = new Map(library.map((e) => [e.name, e.muscles as MuscleMap | undefined]));
  it("todo exercício da biblioteca tem músculo principal válido", () => {
    for (const e of library) {
      expect(e.muscles?.primary.length, e.name).toBeGreaterThan(0);
      for (const m of [...e.muscles!.primary, ...e.muscles!.secondary]) expect(MUSCLES, `${e.name}: ${m}`).toHaveProperty(m);
    }
  });
  it("marcas de aparelho não viram curl martelo; flexora não vira bíceps", () => {
    expect(lib.get("Hammer Strength Chest Bench Press")?.primary).toEqual(["peito"]);
    expect(lib.get("Seated Leg Curls")?.primary).toEqual(["posterior"]);
    expect(lib.get("Upright Cable Row")?.primary).toEqual(["delt_lat"]);
  });
  it("conta secundário como meia série e separa deltoides", () => {
    const entries = day("A").exercises.map((ex) => ({ name: ex.name, muscles: lib.get(ex.name), sets: prescribe(plan, ex, 12).sets.filter((s) => s.kind === "work").length }));
    const { volume, unmapped } = muscleVolume(entries);
    expect(unmapped).toEqual([]);
    expect(volume.get("delt_lat")).toBe(4 + 3 * 0.5); // lateral 4 séries + ½ do desenvolvimento (3)
    expect(volume.get("triceps")).toBe(3 + 3 + 0.5 * (4 + 3 + 3)); // 2 isoladores + ½ dos 3 presses
  });
  it("exercício sem mapa vai para unmapped", () => {
    expect(muscleVolume([{ name: "X", sets: 3 }]).unmapped).toEqual(["X"]);
  });
});

describe("supersets", () => {
  const withSuperset = () => {
    const p = structuredClone(seed) as typeof seed & { days: { exercises: { superset?: string }[] }[] };
    // A: tríceps corda + V handle viram superset S1
    p.days[0].exercises[5].superset = "S1";
    p.days[0].exercises[6].superset = "S1";
    return p;
  };
  it("agrupa exercícios consecutivos com o mesmo rótulo", () => {
    const g = supersetGroups([{}, { superset: "S1" }, { superset: "S1" }, {}]);
    expect(g[0]).toBeNull();
    expect(g[1]).toMatchObject({ label: "S1", members: [1, 2], isFirst: true, isLast: false });
    expect(g[2]).toMatchObject({ isFirst: false, isLast: true });
  });
  it("dá letras aos supersets na ordem do dia", () => {
    const g = supersetGroups([{ superset: "S2" }, { superset: "S2" }, {}, { superset: "S1" }, { superset: "S1" }]);
    expect([g[0]?.letter, g[3]?.letter]).toEqual(["A", "B"]);
  });
  it("importa plano com superset e encurta a duração estimada", () => {
    const r = parsePlan(JSON.stringify(withSuperset()), new Set(library.map((e) => e.name)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(estimateMinutes(r.plan, r.plan.days[0], 12)).toBeLessThan(estimateMinutes(plan, day("A"), 12));
  });
  it("rejeita superset fora de sequência ou com 1 exercício só", () => {
    const gap = withSuperset();
    gap.days[0].exercises[6].superset = undefined;
    gap.days[0].exercises[7].superset = "S1";
    const r1 = parsePlan(JSON.stringify(gap));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.errors.join(" ")).toContain("em sequência");
    const lone = structuredClone(seed) as typeof seed & { days: { exercises: { superset?: string }[] }[] };
    lone.days[0].exercises[0].superset = "S9";
    const r2 = parsePlan(JSON.stringify(lone));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors.join(" ")).toContain("só 1 exercício");
  });
});
