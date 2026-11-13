import { describe, expect, it } from "vitest";
import { loft } from "./body";

/** Normal média dos vértices da frente (+z) de um tubo: tem que apontar para fora. */
function frontNormal(g: ReturnType<typeof loft>) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  let z = 0;
  let c = 0;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0.04) { z += n.getZ(i); c++; }
  return z / c;
}

describe("boneco 3D (loft)", () => {
  const st: [number, number, number][] = [[0, 0.05, 0.05], [1, 0.04, 0.04]];
  it("normais para fora em todos os sentidos (para baixo, para cima, espelhado)", () => {
    expect(frontNormal(loft(0.3, st))).toBeGreaterThan(0.5);
    expect(frontNormal(loft(0.3, st, { dir: 1 }))).toBeGreaterThan(0.5);
    expect(frontNormal(loft(0.3, st, { mirror: true }))).toBeGreaterThan(0.5);
    expect(frontNormal(loft(0.3, st, { dir: 1, mirror: true }))).toBeGreaterThan(0.5);
  });

  it("cada vértice sabe onde está no osso (t de 0 a 1) e o ângulo em volta (cos, sen)", () => {
    const g = loft(0.3, st);
    const a = g.attributes.aSeg;
    expect(a.itemSize).toBe(3);
    for (let i = 0; i < a.count; i++) {
      expect(a.getX(i)).toBeGreaterThanOrEqual(0);
      expect(a.getX(i)).toBeLessThanOrEqual(1);
      expect(Math.hypot(a.getY(i), a.getZ(i))).toBeCloseTo(1, 5);
    }
  });

  it("ângulo 90 = para fora do corpo nos dois lados", () => {
    // ponto com sen(a) = 1 (para fora): x > 0 no esquerdo, x < 0 no direito (espelhado)
    for (const mirror of [false, true]) {
      const g = loft(0.3, st, { mirror });
      const a = g.attributes.aSeg;
      const p = g.attributes.position;
      for (let i = 0; i < a.count; i++) if (a.getZ(i) > 0.99 && a.getX(i) > 0.3 && a.getX(i) < 0.7) expect(Math.sign(p.getX(i))).toBe(mirror ? -1 : 1);
    }
  });
});
