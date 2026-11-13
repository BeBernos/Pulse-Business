/**
 * Boneco 3D (protótipo): poses por ângulos das articulações, desenho próprio do app.
 *
 * Mundo em metros, y para cima, chão em y = 0; o boneco olha para +z (a esquerda dele é +x).
 * Ombro/quadril: `e` = elevação (0 = pendurado, 90 = horizontal, 180 = para cima), `p` = plano
 * (0 = para o lado, 90 = para a frente, > 90 cruza à frente do corpo, < 0 vai para trás), `t` = giro do osso.
 * Cotovelo/joelho: flexão em graus. Coluna: [flexão (+ à frente), inclinação lateral (+ para a esquerda), giro (+ para a esquerda)].
 */
export type Vec3 = readonly [number, number, number];

export interface Arm3 { e: number; p: number; t?: number; el: number }
export interface Leg3 { e: number; p: number; t?: number; kn: number; ank?: number }

export interface Pose3 {
  root: Vec3;
  /** giro do corpo inteiro (graus, ordem XYZ) */
  rot?: Vec3;
  spine?: Vec3;
  head?: number;
  armL: Arm3;
  armR: Arm3;
  legL: Leg3;
  legR: Leg3;
}

export type Equip3 =
  | { k: "box"; pos: Vec3; size: Vec3; tone?: "bench" | "metal" | "pad" }
  | { k: "dumbbell"; hand: "L" | "R" }
  | { k: "plate"; between: "hands" }
  | { k: "cable"; from: Vec3; hand: "L" | "R" }
  | { k: "kneePad"; side: "L" | "R" };

export interface Motion3 {
  poses: Pose3[];
  equip?: Equip3[];
  tempo?: number;
  /** ponto para onde a câmera olha */
  target?: Vec3;
  /** ângulo inicial da câmera em torno do corpo (graus; 0 = de frente, 90 = do lado esquerdo dele) */
  azimuth?: number;
  /** distância da câmera (m) */
  dist?: number;
  /** altura da câmera (graus acima do horizonte; padrão 18) */
  elev?: number;
}

export const DIM = { sho: 0.46, shoW: 0.19, hipW: 0.09, upper: 0.29, fore: 0.26, thigh: 0.44, shin: 0.43, neck: 0.52 } as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v3 = (a: Vec3 | undefined, b: Vec3 | undefined, t: number): Vec3 | undefined =>
  !a && !b ? undefined : [lerp(a?.[0] ?? 0, b?.[0] ?? 0, t), lerp(a?.[1] ?? 0, b?.[1] ?? 0, t), lerp(a?.[2] ?? 0, b?.[2] ?? 0, t)];
const arm = (a: Arm3, b: Arm3, t: number): Arm3 => ({ e: lerp(a.e, b.e, t), p: lerp(a.p, b.p, t), t: lerp(a.t ?? 0, b.t ?? 0, t), el: lerp(a.el, b.el, t) });
const leg = (a: Leg3, b: Leg3, t: number): Leg3 => ({ e: lerp(a.e, b.e, t), p: lerp(a.p, b.p, t), t: lerp(a.t ?? 0, b.t ?? 0, t), kn: lerp(a.kn, b.kn, t), ank: lerp(a.ank ?? 0, b.ank ?? 0, t) });

export function lerpPose3(a: Pose3, b: Pose3, t: number): Pose3 {
  return {
    root: v3(a.root, b.root, t)!,
    rot: v3(a.rot, b.rot, t),
    spine: v3(a.spine, b.spine, t),
    head: lerp(a.head ?? 0, b.head ?? 0, t),
    armL: arm(a.armL, b.armL, t),
    armR: arm(a.armR, b.armR, t),
    legL: leg(a.legL, b.legL, t),
    legR: leg(a.legR, b.legR, t),
  };
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** Mesmo ritmo do 2D: vai pelas poses (concêntrica), segura, volta mais devagar e segura. */
export function pose3At(poses: readonly Pose3[], sec: number, tempo = 1): Pose3 {
  const n = poses.length;
  if (n === 1) return poses[0];
  const up = (0.95 * tempo) / (n - 1);
  const down = (1.25 * tempo) / (n - 1);
  const total = up * (n - 1) + 0.35 * tempo + down * (n - 1) + 0.45 * tempo;
  let t = ((sec % total) + total) % total;
  const through = (k: number, reverse: boolean) => {
    const g = ease(Math.min(1, Math.max(0, k))) * (n - 1);
    const i = Math.min(n - 2, Math.floor(g));
    const f = g - i;
    return reverse ? lerpPose3(poses[n - 1 - i], poses[n - 2 - i], f) : lerpPose3(poses[i], poses[i + 1], f);
  };
  if (t < up * (n - 1)) return through(t / (up * (n - 1)), false);
  t -= up * (n - 1);
  if (t < 0.35 * tempo) return poses[n - 1];
  t -= 0.35 * tempo;
  if (t < down * (n - 1)) return through(t / (down * (n - 1)), true);
  return poses[0];
}

// ---------- bases ----------
const STAND_Y = 0.94;
const straight: Leg3 = { e: 0, p: 90, kn: 0 };
const seatLeg: Leg3 = { e: 90, p: 90, kn: 90 };
const sym = (a: Arm3) => ({ armL: a, armR: a });
const symL = (l: Leg3) => ({ legL: l, legR: l });
const SEAT_Y = 0.52;
const bench = (z = -0.05): Equip3 => ({ k: "box", pos: [0, 0.22, z], size: [0.36, 0.44, 0.42], tone: "bench" });

// ---------- exercícios ----------
const TABLE3: Record<string, () => Motion3> = {
  "Seated Dumbbell Lateral Raise": () => {
    const base = { root: [0, SEAT_Y, 0] as Vec3, ...symL(seatLeg) };
    return {
      poses: [{ ...base, ...sym({ e: 10, p: 18, el: 12 }) }, { ...base, ...sym({ e: 88, p: 22, el: 16 }) }],
      equip: [bench(), { k: "dumbbell", hand: "L" }, { k: "dumbbell", hand: "R" }],
      target: [0, 0.95, 0],
    };
  },
  "Standing Dumbbell Lateral Raises": () => {
    const base = { root: [0, STAND_Y, 0] as Vec3, ...symL(straight) };
    return {
      poses: [{ ...base, ...sym({ e: 10, p: 18, el: 12 }) }, { ...base, ...sym({ e: 88, p: 22, el: 16 }) }],
      equip: [{ k: "dumbbell", hand: "L" }, { k: "dumbbell", hand: "R" }],
    };
  },
  "Crossed Cable Rear Delt Fly": () => {
    const base = { root: [0, STAND_Y - 0.02, 0] as Vec3, ...symL({ e: 4, p: 90, kn: 8 }) };
    return {
      poses: [{ ...base, ...sym({ e: 88, p: 118, el: 10 }) }, { ...base, ...sym({ e: 88, p: -8, el: 8 }) }],
      equip: [
        { k: "box", pos: [1.05, 0.95, 0.35], size: [0.08, 1.9, 0.08], tone: "metal" },
        { k: "box", pos: [-1.05, 0.95, 0.35], size: [0.08, 1.9, 0.08], tone: "metal" },
        // cruzado: a mão esquerda segura o cabo da torre da direita e vice-versa
        { k: "cable", from: [-1.0, 1.42, 0.35], hand: "L" },
        { k: "cable", from: [1.0, 1.42, 0.35], hand: "R" },
      ],
      target: [0, 1.15, 0],
      azimuth: -150,
    };
  },
  "Russian Twists": () => {
    const legs = { legL: { e: 132, p: 86, kn: 104 }, legR: { e: 132, p: 94, kn: 104 } };
    const mk = (tw: number): Pose3 => ({ root: [0, 0.12, 0], spine: [-38, 0, tw], head: 22, ...legs, ...sym({ e: 26, p: 104, el: 88 }) });
    return { poses: [mk(-42), mk(0), mk(42)], equip: [{ k: "plate", between: "hands" }], target: [0, 0.38, 0.12], tempo: 1.1, dist: 2.7, azimuth: 55 };
  },
  "Feet Raised Russian Twist": () => {
    // igual ao Russian Twists, com os pés fora do chão (equilíbrio no glúteo)
    const legs = { legL: { e: 118, p: 86, kn: 48 }, legR: { e: 118, p: 94, kn: 48 } };
    const mk = (tw: number): Pose3 => ({ root: [0, 0.12, 0], spine: [-42, 0, tw], head: 24, ...legs, ...sym({ e: 26, p: 104, el: 88 }) });
    return { poses: [mk(-40), mk(0), mk(40)], equip: [{ k: "plate", between: "hands" }], target: [0, 0.4, 0.12], tempo: 1.1, dist: 2.7, azimuth: 55 };
  },
  "Leg Abduction (Machine)": () => {
    const base = { root: [0, SEAT_Y, 0] as Vec3, spine: [-10, 0, 0] as Vec3, ...sym({ e: 16, p: 40, el: 50 }) };
    const legs = (open: number) => ({ legL: { e: 90, p: 90 - open, kn: 90 }, legR: { e: 90, p: 90 - open, kn: 90 } });
    return {
      poses: [{ ...base, ...legs(0) }, { ...base, ...legs(34) }],
      equip: [bench(-0.04), { k: "box", pos: [0, 0.82, -0.27], size: [0.4, 0.62, 0.08], tone: "bench" }, { k: "kneePad", side: "L" }, { k: "kneePad", side: "R" }],
      target: [0, 0.6, 0.15],
      azimuth: 25,
    };
  },
  "90/90 Hip Switch": () => {
    const sit = { root: [0, 0.12, 0] as Vec3, spine: [4, 0, 0] as Vec3, ...sym({ e: 28, p: -50, el: 0 }) };
    // joelhos à direita: perna direita na frente (giro externo: canela cruzando à frente), esquerda de lado (canela para trás)
    const right: Pose3 = { ...sit, legR: { e: 90, p: 80, t: 90, kn: 90 }, legL: { e: 90, p: 10, kn: 90 } };
    const left: Pose3 = { ...sit, legL: { e: 90, p: 80, t: 90, kn: 90 }, legR: { e: 90, p: 10, kn: 90 } };
    const mid: Pose3 = { ...sit, legL: { e: 138, p: 70, kn: 110 }, legR: { e: 138, p: 70, kn: 110 } };
    return { poses: [right, mid, left], target: [0, 0.3, 0.15], tempo: 2.2, azimuth: 20 };
  },
};

// ---------- deitados (o 2D desses é visto de cima: no 3D o corpo deita de verdade) ----------
const fly = (incline: number): (() => Motion3) => () => {
  // rot x = -90: deitado de costas, cabeça para -z; no corpo, "frente" (plano 90) = para cima
  const lean = -90 + incline;
  const legs = symL({ e: 12 + incline, p: 90, kn: 92 + incline * 0.3 });
  const y = 0.56 + incline * 0.004;
  const base = { root: [0, y, 0.15] as Vec3, rot: [lean, 0, 0] as Vec3, head: -6, ...legs };
  const benchTop: Equip3[] = incline
    ? [
        { k: "box", pos: [0, 0.22, 0.12], size: [0.3, 0.44, 0.4], tone: "bench" },
        { k: "box", pos: [0, 0.58 + incline * 0.004, -0.12 - incline * 0.004], size: [0.3, 0.08, 0.7], tone: "bench" },
      ]
    : [{ k: "box", pos: [0, 0.24, -0.25], size: [0.3, 0.46, 1.2], tone: "bench" }];
  return {
    poses: [{ ...base, ...sym({ e: 98, p: -6, el: 28 }) }, { ...base, ...sym({ e: 90, p: 40, el: 22 }) }, { ...base, ...sym({ e: 90, p: 86, el: 14 }) }],
    equip: [...benchTop, { k: "dumbbell", hand: "L" }, { k: "dumbbell", hand: "R" }],
    target: [0, 0.75, -0.1],
    azimuth: -35,
  };
};
const MAT3: Equip3 = { k: "box", pos: [0, 0.006, -0.1], size: [0.7, 0.012, 1.9], tone: "pad" };
TABLE3["Flat Bench Dumbbell Fly"] = fly(0);
TABLE3["30° Incline Dumbbell Fly"] = fly(30);
TABLE3["45° Incline Dumbbell Fly"] = fly(45);
TABLE3["Butterfly Stretch"] = () => {
  // sentado no chão, solas dos pés juntas à frente, joelhos abertos; os joelhos descem devagar
  const mk = (knee: number): Pose3 => ({
    root: [0, 0.12, 0],
    spine: [8, 0, 0],
    head: 8,
    legR: { e: knee, p: 32, t: 140, kn: 128 },
    legL: { e: knee, p: 32, t: 140, kn: 128 },
    ...sym({ e: 30, p: 96, el: 22 }),
  });
  return { poses: [mk(80), mk(70)], target: [0, 0.32, 0.15], azimuth: 25, elev: 30, tempo: 1.4 };
};
TABLE3["Side Kick"] = () => {
  // deitado sobre o lado direito (rot z = 90), cabeça apoiada na mão de baixo; a perna de cima vai à frente e atrás
  const base = {
    root: [0.25, 0.16, 0] as Vec3,
    rot: [0, 0, 90] as Vec3,
    head: 0,
    armR: { e: 168, p: 0, el: 130 },
    armL: { e: 60, p: 90, el: 70 },
    legR: { e: 12, p: 90, kn: 4 },
  };
  return {
    poses: [{ ...base, legL: { e: 30, p: -90, kn: 2 } }, { ...base, legL: { e: 8, p: 90, kn: 2 } }, { ...base, legL: { e: 62, p: 90, kn: 4 } }],
    equip: [{ k: "box", pos: [0, 0.006, 0], size: [1.9, 0.012, 0.7], tone: "pad" }],
    target: [0, 0.25, 0],
    azimuth: 10,
    tempo: 0.9,
  };
};
TABLE3["Lying Glute Stretch (Figure Four)"] = () => {
  // de costas no chão; tornozelo esquerdo sobre o joelho direito; as mãos puxam a coxa direita para o peito
  const base = { root: [0, 0.12, 0.2] as Vec3, rot: [-90, 0, 0] as Vec3, head: -10 };
  const mk = (support: number, knee: number): Pose3 => ({
    ...base,
    legR: { e: support, p: 90, kn: knee },
    legL: { e: support + 4, p: 40, t: 120, kn: 100 },
    ...sym({ e: 24 + (support - 52) * 0.35, p: 92, el: 6 }),
  });
  return { poses: [mk(52, 104), mk(96, 88)], equip: [MAT3], target: [0, 0.3, 0.1], azimuth: 75, elev: 38, tempo: 1.8 };
};

TABLE3["Floor Slides"] = () => {
  // o Wall Slides deitado de costas no chão: braços em W encostados no chão deslizam até o Y
  const base = { root: [0, 0.12, 0.2] as Vec3, rot: [-90, 0, 0] as Vec3, head: 0, ...symL(straight) };
  const w: Pose3 = { ...base, ...sym({ e: 84, p: 0, t: 90, el: 96 }) };
  const y: Pose3 = { ...base, ...sym({ e: 140, p: 0, t: 90, el: 8 }) };
  return { poses: [w, y], equip: [MAT3], target: [0, 0.15, -0.2], azimuth: 0, elev: 62, dist: 2.6, tempo: 1.4 };
};

export const HAS_3D = new Set(Object.keys(TABLE3));
export const has3D = (name: string) => HAS_3D.has(name);
export function motion3For(name: string): Motion3 | null {
  return TABLE3[name]?.() ?? null;
}
