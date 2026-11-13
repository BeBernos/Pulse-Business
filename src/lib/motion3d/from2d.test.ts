import { describe, expect, it } from "vitest";
import { LIBRARY } from "../library";
import { motionFor } from "../motion";
import { source3, staticShapes } from "./from2d";

const unit = (v: number[]) => Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) < 1e-6;

describe("3D automático a partir do 2D", () => {
  it("todo exercício da biblioteca vira quadros 3D válidos (direções unitárias, nada infinito)", () => {
    for (const e of LIBRARY) {
      const m = motionFor(e.name, e.group);
      const src = source3(m);
      for (let t = 0; t < 3; t += 0.37) {
        const f = src.at(t);
        for (const v of [f.lumbar, f.thorax, f.head, f.front, f.armL.u, f.armL.f, f.armR.u, f.armR.f, f.legL.u, f.legL.f, f.legR.u, f.legR.f, f.legL.end, f.legR.end])
          expect(unit(v), `${e.name} t=${t}`).toBe(true);
        expect(f.pelvis.every(Number.isFinite), e.name).toBe(true);
      }
      expect(staticShapes(m.scene, src.map).every((s) => JSON.stringify(s).indexOf("null") < 0), e.name).toBe(true);
    }
  });

  it("de lado: o membro de cá é o lado direito do corpo e a frente é +z", () => {
    const src = source3(motionFor("Barbell Curl"));
    const f = src.at(1.05); // topo da rosca: antebraço para cima; braço pendurado
    expect(f.armR.f[1]).toBeGreaterThan(0.5);
    expect(f.armR.u[1]).toBeLessThan(-0.8);
    expect(f.armR.u[0]).toBe(0);
    expect(f.front[2]).toBeGreaterThan(0.9);
  });

  it("de frente: braço da esquerda da tela é o direito do corpo (vai para -x)", () => {
    const f = source3(motionFor("Standing Dumbbell Lateral Raises")).at(1.05);
    expect(f.armR.u[0]).toBeLessThan(-0.8);
    expect(f.armL.u[0]).toBeGreaterThan(0.8);
  });
});
