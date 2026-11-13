import { describe, expect, it } from "vitest";
import { fillSet, focusOf, liveSteps, nextAfter, nextSetOf, type LEx, type LSet } from "./liveNext";

const set = (id: string, exOrder: number, setIndex: number, done = false, extra: Partial<LSet> = {}): LSet => ({ id, exOrder, setIndex, kind: "work", done, kg: null, reps: null, targetKg: null, targetReps: 10, ...extra });
const ex = (name: string, restSec = 90, superset?: string): LEx => ({ name, restSec, superset });

describe("o que vem depois da série (notificação)", () => {
  const exercises = [ex("Lat Pulldown", 150), ex("A1 Lateral", 0, "S1"), ex("A2 Rear Delt", 75, "S1"), ex("Curl", 75)];
  const sets = [set("a1", 0, 0, true), set("a2", 0, 1), set("b1", 1, 0), set("b2", 1, 1), set("c1", 2, 0), set("c2", 2, 1), set("d1", 3, 0)];

  it("série no meio do exercício: descansa e fica nele", () => {
    expect(nextAfter(exercises, sets, 0, "a2")).toEqual({ next: 1, rest: 150 }); // última do exercício → próximo
    expect(nextAfter(exercises, [...sets, set("a3", 0, 2)], 0, "a2")).toEqual({ next: 0, rest: 150 });
  });
  it("superset: A1 → A2 sem descanso; A2 → volta ao A1 com descanso", () => {
    expect(nextAfter(exercises, sets, 1, "b1")).toEqual({ next: 2, rest: 0 });
    expect(nextAfter(exercises, sets, 2, "c1")).toEqual({ next: 1, rest: 75 });
  });
  it("exercício da vez e próxima série", () => {
    expect(focusOf(exercises, sets)).toBe(0);
    expect(focusOf(exercises, sets, 2)).toBe(2);
    expect(nextSetOf(sets, 0)).toMatchObject({ n: 2, total: 2, done: 1, set: { id: "a2" } });
  });
  it("carga: digitada, meta ou a da série anterior", () => {
    const s = [set("x1", 0, 0, true, { kg: 80, reps: 8 }), set("x2", 0, 1)];
    expect(fillSet(s, s[1])).toEqual({ kg: 80, reps: 10 });
    expect(fillSet(s, { ...s[1], targetKg: 85 })).toEqual({ kg: 85, reps: 10 });
    expect(fillSet(s, { ...s[1], targetReps: "45 s" })).toEqual({ kg: 80, reps: 45 });
  });
  it("sequência de toques: superset alterna e o fim para", () => {
    const steps = liveSteps(exercises, sets);
    expect(steps.map((x) => [x.setId, x.rest])).toEqual([["a2", 150], ["b1", 0], ["c1", 75], ["b2", 0], ["c2", 75], ["d1", 75]]);
    expect(steps.at(-1)!.sets.every((x) => x.done)).toBe(true);
  });
});
