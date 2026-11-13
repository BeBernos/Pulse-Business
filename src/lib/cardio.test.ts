import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import seed from "../data/seed-plan.json";
import { db, ensureSeeded, exportLog, finishSession, openDb, startSession } from "../db";
import { avgSpeed, cleanCardio, fmtCardio, guessMachine } from "./cardio";
import { LIBRARY } from "./library";
import { parsePlan, planSchema, type Plan } from "./plan";
import { estimateMinutes, prescribe, summarize, timedSeconds } from "./prescription";

const plan = (exercises: unknown[]): Plan =>
  planSchema.parse({ ...seed, block: { ...seed.block, id: "teste-cardio" }, days: [{ key: "A", name: "Push", exercises }], schedule: { mon: "A", tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }, rotation: undefined });

describe("cardio e mobilidade", () => {
  it("biblioteca: grupos novos com tipo e aparelho", () => {
    const mob = LIBRARY.filter((e) => e.group === "Mobilidade");
    const car = LIBRARY.filter((e) => e.group === "Cardio");
    expect(mob.length).toBeGreaterThanOrEqual(20);
    expect(mob.every((e) => e.kind === "mobility")).toBe(true);
    expect(car.map((e) => e.machine)).toEqual(["treadmill", "treadmill", "bike", "stairs", "stairs"]);
    expect(new Set(LIBRARY.map((e) => e.name)).size).toBe(LIBRARY.length); // sem nome repetido
    // Fase 3b (Marina): Pilates solo + aparelhos e Funcional
    const pil = LIBRARY.filter((e) => e.group === "Pilates");
    expect(pil.filter((e) => e.equipment === "Colchonete")).toHaveLength(16);
    expect(new Set(pil.map((e) => e.equipment))).toEqual(new Set(["Colchonete", "Reformer", "Cadillac", "Chair"]));
    expect(LIBRARY.filter((e) => e.group === "Funcional")).toHaveLength(14);
  });

  it("plano: block e cardio opcionais; planos antigos seguem válidos", () => {
    expect(parsePlan(JSON.stringify(seed)).ok).toBe(true);
    const p = plan([{ name: "Cat-Cow", block: "warmup", sets: 2, reps: 10 }, { name: "ClimbMill", cardio: { min: 22, level: 7, zone: "Z2" } }]);
    expect(p.days[0].exercises[0].block).toBe("warmup");
    expect(p.days[0].exercises[1].cardio).toMatchObject({ min: 22, level: 7 });
    expect(() => plan([{ name: "X", block: "durante" }])).toThrow();
    expect(() => plan([{ name: "X", cardio: { min: -1 } }])).toThrow();
  });

  it("prescrição: cardio é uma sessão; tempo entra na duração estimada", () => {
    const p = plan([{ name: "ClimbMill", cardio: { min: 22, level: 7 } }, { name: "Doorway Chest Stretch", sets: 2, reps: "30 s", perSide: true, restSec: 15 }]);
    const pc = prescribe(p, p.days[0].exercises[0], 1);
    expect(pc.sets).toEqual([{ kind: "work", kg: null, reps: "22 min" }]);
    expect(summarize(pc, p.days[0].exercises[0])).toBe("22 min · nível 7");
    // 22 min + transição (1,5) + alongamento 2×(30 s × 2 lados) + 1 descanso de 15 s + transição
    expect(estimateMinutes(p, p.days[0], 1)).toBe(Math.round(22 + 1.5 + (2 * 60 + 15 + 90) / 60));
    expect(timedSeconds("2 min")).toBe(120);
    expect(timedSeconds("1,5 min")).toBe(90);
    expect(timedSeconds(10)).toBeNull();
  });

  it("formatação e conta de velocidade", () => {
    expect(fmtCardio({ min: 25, km: 2.4, bpm: 124 }, "treadmill")).toBe("25 min · 2,4 km · 124 bpm");
    expect(fmtCardio({ floors: 80, level: 8 }, "stairs", "Z2")).toBe("80 andares · nível 8 · Z2");
    expect(avgSpeed({ km: 3, min: 30 })).toBe(6);
    expect(guessMachine("Spinning Bike")).toBe("bike");
    expect(cleanCardio({ min: 20, km: -1, foo: 3, bpm: "x" })).toEqual({ min: 20 });
  });
});

describe("treino com mobilidade e cardio", () => {
  beforeEach(async () => {
    openDb(`cardio-${Math.random()}`);
    await ensureSeeded();
  });

  it("sessão: tipo vem da biblioteca, cardio vira 1 sessão, relatório leva as métricas", async () => {
    const p = plan([
      { name: "Cat-Cow", block: "warmup", sets: 2, reps: 10, restSec: 15 },
      { name: "45° Incline Dumbbell Bench Press", sets: 3, reps: 8 },
      { name: "Treadmill" }, // cardio sem metas no plano: a biblioteca diz que é cardio
      { name: "Wall Calf Stretch", block: "cooldown", sets: 1, reps: "30 s", perSide: true },
    ]);
    await db.plans.put({ id: p.block.id, plan: p, importedAt: 1 });
    const id = await startSession({ id: p.block.id, plan: p, importedAt: 1 }, p.days[0], 1, "2026-10-19", []);
    const s = (await db.sessions.get(id))!;
    expect(s.exercises.map((e) => [e.kind, e.block, e.machine])).toEqual([
      ["mobility", "warmup", undefined],
      [undefined, undefined, undefined],
      ["cardio", undefined, "treadmill"],
      ["mobility", "cooldown", undefined],
    ]);
    const sets = await db.sets.where({ sessionId: id }).sortBy("exOrder");
    expect(sets.filter((x) => x.exOrder === 2)).toHaveLength(1);
    expect(sets.filter((x) => x.mode === "mobility")).toHaveLength(3);
    // faz tudo
    for (const x of sets) await db.sets.update(x.id, { done: true, kg: x.mode ? null : 30, reps: x.mode === "mobility" ? 30 : 8, ...(x.mode === "cardio" ? { cardio: { min: 25, km: 2.4, bpm: 124 } } : {}) });
    await finishSession(id, { fatigue: 3 });
    const log = JSON.parse(await exportLog("2026-10-19", "2026-10-19"));
    const ex = log.sessions[0].exercises;
    expect(ex[0]).toMatchObject({ name: "Cat-Cow", block: "warmup" });
    expect(ex[2]).toEqual({ name: "Treadmill", cardio: { min: 25, km: 2.4, bpm: 124 } });
    expect(ex[3]).toMatchObject({ block: "cooldown", sets: ["30 s"] });
  });
});
