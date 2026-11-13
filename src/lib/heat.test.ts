import { describe, expect, it } from "vitest";
import { doneSetsByExercise, muscleHeat, topMuscles } from "./heat";
import { bestGain } from "./analytics";
import { fmtDuration } from "./metrics";

describe("mapa de calor dos músculos", () => {
  it("principal conta 1, secundário ½, normalizado pelo maior", () => {
    const h = muscleHeat([
      { muscles: { primary: ["peito"], secondary: ["triceps"] }, sets: 4 },
      { muscles: { primary: ["triceps"], secondary: [] }, sets: 2 },
    ]);
    expect(h.get("peito")).toBe(1);
    expect(h.get("triceps")).toBe(1); // 2 + 4×½
    expect(topMuscles(h, 1)).toHaveLength(1);
  });

  it("sem mapa ou sem séries não acende nada", () => {
    expect(muscleHeat([{ sets: 3 }, { muscles: { primary: ["peito"], secondary: [] }, sets: 0 }]).size).toBe(0);
  });

  it("conta só séries de trabalho feitas (sem mobilidade/cardio)", () => {
    const m = doneSetsByExercise([
      { exercise: "A", done: true, kind: "work" },
      { exercise: "A", done: false, kind: "work" },
      { exercise: "A", done: true, kind: "warmup" },
      { exercise: "B", done: true, kind: "work", mode: "mobility" },
    ]);
    expect([...m]).toEqual([["A", 1]]);
  });
});

describe("maior avanço de carga", () => {
  it("compara a carga máxima de cada exercício feito nos dois treinos", () => {
    const now = [{ exercise: "A", kg: 42.5 }, { exercise: "A", kg: 40 }, { exercise: "B", kg: 30 }, { exercise: "C", kg: 50 }];
    const before = [{ exercise: "A", kg: 40 }, { exercise: "B", kg: 25 }];
    expect(bestGain(now, before)).toEqual({ exercise: "B", kg: 5 });
    expect(bestGain([{ exercise: "A", kg: 40 }], before)).toBeNull();
    expect(bestGain(now, [])).toBeNull();
  });
});

describe("duração", () => {
  it("menos de 1 minuto não vira '0 min'", () => {
    expect(fmtDuration(20_000)).toBe("<1 min");
    expect(fmtDuration(65 * 60_000)).toBe("1h05");
    expect(fmtDuration(5 * 60_000)).toBe("5 min");
  });
});

