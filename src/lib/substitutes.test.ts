import { describe, expect, it } from "vitest";
import { LIBRARY } from "./library";
import { suggestSubstitutes } from "./substitutes";

describe("substitutos", () => {
  it("sugere do mesmo grupo e músculo, sem vetados nem o próprio", () => {
    const name = "Seated Dumbbell Lateral Raise";
    const me = LIBRARY.find((e) => e.name === name)!;
    const out = suggestSubstitutes(name, LIBRARY);
    expect(out.length).toBeGreaterThan(2);
    expect(out).not.toContain(name);
    expect(out).not.toContain("Lying Triceps Extension with a Barbell");
    for (const n of out) {
      const e = LIBRARY.find((x) => x.name === n)!;
      expect(e.group).toBe(me.group);
      expect(e.muscles!.primary.some((m) => me.muscles!.primary.includes(m))).toBe(true);
    }
  });
  it("tira os que já estão no treino", () => {
    const all = suggestSubstitutes("Seated Dumbbell Lateral Raise", LIBRARY);
    expect(suggestSubstitutes("Seated Dumbbell Lateral Raise", LIBRARY, new Set([all[0]]))).not.toContain(all[0]);
  });
});
