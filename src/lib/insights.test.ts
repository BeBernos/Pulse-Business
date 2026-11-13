import { describe, expect, it } from "vitest";
import seedJson from "../data/seed-plan.json";
import { blockSummary, compareBest, exerciseTimes, missedDays, painAlerts, planDiff, weekReview } from "./insights";
import { scheduledDay } from "./calendar";
import { parsePlan, type Plan } from "./plan";

const seed = (() => {
  const r = parsePlan(JSON.stringify(seedJson));
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.plan;
})();
const set = (sessionId: string, exercise: string, kg: number, reps: number, completedAt = 0) => ({ sessionId, exercise, kind: "work", done: true, kg, reps, rir: 0, completedAt });

describe("insights", () => {
  it("resumo da semana: treinos, séries, peso médio e metas de volume", () => {
    const plan: Plan = { ...seed, volumeTargets: { delt_lat: 16 } };
    const from = seed.block.startDate.slice(0, 10);
    const sessions = [{ id: "s1", date: from, startedAt: 1, status: "done" }];
    const sets = [set("s1", "Seated Dumbbell Lateral Raise", 10, 12), set("s1", "Seated Dumbbell Lateral Raise", 10, 12)];
    const r = weekReview({ from, today: "2099-01-01", plan, sessions, sets, skipped: new Set(), weights: [{ date: from, value: 84 }, { date: from, value: 85 }], musclesOf: () => ({ primary: ["delt_lat"], secondary: [] }) });
    expect(r.sets).toBe(2);
    expect(r.weight).toBe(84.5);
    expect(r.muscles).toEqual([{ id: "delt_lat", target: 16, done: 2 }]);
  });

  it("dor repetida: 2+ dos últimos 4 treinos", () => {
    const s = (i: number, pains: { area: string; intensity: number }[]) => ({ id: `s${i}`, date: "2026-11-0" + i, startedAt: i, status: "done", pains });
    const out = painAlerts([s(1, [{ area: "Joelho", intensity: 3 }]), s(2, []), s(3, [{ area: "Joelho", intensity: 5 }, { area: "Ombro", intensity: 2 }]), s(4, [])]);
    expect(out).toEqual([{ area: "Joelho", times: 2, of: 4, max: 5 }]);
  });

  it("tempo por exercício: intervalo desde a série anterior", () => {
    const t = exerciseTimes({ id: "s", date: "", startedAt: 0 }, [set("s", "A", 1, 1, 60_000), set("s", "A", 1, 1, 180_000), set("s", "B", 1, 1, 200_000)]);
    expect(t).toEqual([{ exercise: "A", ms: 180_000, sets: 2 }, { exercise: "B", ms: 20_000, sets: 1 }]);
  });

  it("comparar blocos: 1RM estimado antes × depois", () => {
    const a = blockSummary({ id: "a", plan: seed, today: "2099-01-01", sessions: [{ id: "1", date: seed.block.startDate, startedAt: 1 }], sets: [set("1", "X", 100, 1)], skipped: new Set(), weights: [] });
    const b = { ...a, best: new Map([["X", 110]]) };
    expect(compareBest(a, b)).toEqual([{ exercise: "X", before: 100, after: 110, pct: 10 }]);
  });

  it("o que muda no plano: exercício que entra, sai e muda", () => {
    const next = structuredClone(seed);
    const d = next.days[0];
    const out = d.exercises[0].name;
    d.exercises = d.exercises.slice(1);
    d.exercises[0] = { ...d.exercises[0], sets: d.exercises[0].sets + 1, byWeek: undefined };
    d.exercises.push({ ...d.exercises[1], name: "Floor Slides" });
    const r = planDiff(seed, next);
    expect(r.days[0].removed).toContain(out);
    expect(r.days[0].added).toContain("Floor Slides");
    expect(r.days[0].changed[0].name).toBe(d.exercises[0].name);
    expect(planDiff(seed, seed).days).toEqual([]);
  });
});

describe("dias sem registro (Treinou?)", () => {
  it("só dias de treino passados, sem sessão nem motivo, mais antigo primeiro", () => {
    const start = seed.block.startDate;
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(start + "T12:00"); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
    const today = days[13];
    const training = days.slice(6, 13).filter((d) => scheduledDay(seed, d));
    expect(training.length).toBeGreaterThan(1);
    const [a, b, ...rest] = training;
    const got = missedDays(seed, today, new Set([a]), new Set([b]));
    expect(got).toEqual(rest);
    expect(missedDays(undefined, today, new Set(), new Set())).toEqual([]);
  });
});
