import { describe, expect, it } from "vitest";
import { LIBRARY } from "../library";
import { HAS_3D, motion3For, pose3At } from "./poses";

describe("3D (protótipo)", () => {
  it("só exercícios que existem na biblioteca, com poses válidas", () => {
    const names = new Set(LIBRARY.map((e) => e.name));
    for (const n of HAS_3D) {
      expect(names.has(n), n).toBe(true);
      const m = motion3For(n)!;
      expect(m.poses.length, n).toBeGreaterThanOrEqual(2);
      for (let t = 0; t < 4; t += 0.25) {
        const p = pose3At(m.poses, t, m.tempo);
        const nums = [...p.root, p.armL.e, p.armL.p, p.armR.e, p.legL.e, p.legL.kn, p.legR.kn, ...(p.spine ?? [])];
        expect(nums.every(Number.isFinite), n).toBe(true);
        expect(p.root[1], n).toBeGreaterThan(0);
      }
    }
  });

  it("exercício sem 3D não quebra", () => {
    expect(motion3For("Barbell Curl")).toBeNull();
  });
});
