import { describe, expect, it } from "vitest";
import { LIBRARY as library } from "./library";
import { hasOwnMotion, motionFor } from "./motion";
import { bounds, frame, render } from "./motion/draw";
import { SEG, solve } from "./motion/rig";
import type { MuscleMap } from "./muscles";

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("animações dos exercícios", () => {
  it("todo exercício da biblioteca tem animação própria", () => {
    expect(library.filter((e) => !hasOwnMotion(e.name)).map((e) => e.name)).toEqual([]);
  });

  it("exercício desconhecido cai numa regra por palavra-chave ou no grupo", () => {
    expect(motionFor("Pendlay Row").view).toBe("side");
    expect(motionFor("Algo Novo", "Ombros").view).toBe("front");
  });

  for (const e of library) {
    it(`${e.name}: poses válidas, ossos inteiros e nada abaixo do chão`, () => {
      const m = motionFor(e.name, e.group);
      expect(m.poses.length).toBeGreaterThan(0);
      // quadros densos: pega também as posições entre as poses-chave
      for (let i = 0; i < 48; i++) {
        const pose = frame(m, i * 0.0625);
        const s = solve(pose, m.view);
        for (const limb of [s.armN, s.armF, s.legN, s.legF]) {
          for (const v of [limb.root, limb.mid, limb.end, limb.tip]) expect(Number.isFinite(v[0]) && Number.isFinite(v[1])).toBe(true);
        }
        // braço sem escorço mantém o comprimento (cinemática inversa não estica osso)
        if (!("fs" in pose.armN) || !pose.armN.fs) expect(dist(s.armN.root, s.armN.mid)).toBeCloseTo(SEG.upper, 3);
        if (!m.noFloor) {
          const low = Math.min(...render(m, pose, e.muscles as MuscleMap).map((p) => (p.t === "line" ? Math.min(p.a[1], p.b[1]) - p.w / 2 : p.t === "circle" ? p.c[1] - p.r : Math.min(...p.pts.map((v) => v[1])))));
          expect(low).toBeGreaterThan(-9);
        }
      }
      const b = bounds(m);
      expect(b.w).toBeGreaterThan(40);
      expect(b.w).toBeLessThan(420);
    });
  }
});
