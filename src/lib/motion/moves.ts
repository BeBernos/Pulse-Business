/**
 * Famílias de movimento (desenho próprio). Cada função monta as poses-chave + cenário + equipamento.
 * Medidas em cm; chão y = 0; banco com 46 cm; de lado o boneco olha para a direita.
 */
import type { Motion, Prop, Shape } from "./draw";
import { add, dir, lerpPose, mul, solve, type Limb, type Pose, type V, type View } from "./rig";

export type Eq = "barbell" | "dumbbell" | "smith" | "machine" | "cable" | "body" | "plate" | "tbar";

const A = (u: number, f: number, fs?: [number, number]): Limb => ({ a: [u, f], fs });
const R = (u: number, f: number): Limb => ({ r: [u, f] });
const T = (p: V, bend?: 1 | -1, fs?: [number, number]): Limb => ({ to: p, bend, fs });
const ANK = 8;
const HANG = A(-90, -90);
const sk = (p: Pose, v: View = "side") => solve(p, v);
const at = (p: Pose, f: (s: ReturnType<typeof solve>) => V, v: View = "side") => f(sk(p, v));

// ---------- cenário ----------
const pad = (a: V, b: V, w = 9): Shape => ({ k: "line", a, b, w, tone: "bench" });
const post = (a: V, b: V, w = 4): Shape => ({ k: "line", a, b, w, tone: "metal" });
const flatBench = (x0: number, x1: number, h = 46): Shape[] => [post([x0 + 10, 0], [x0 + 10, h - 6]), post([x1 - 10, 0], [x1 - 10, h - 6]), pad([x0, h - 4.5], [x1, h - 4.5])];
const tower = (x: number, top = 214): Shape[] => [post([x, 0], [x, top], 6), post([x - 14, 1.5], [x + 14, 1.5], 3)];
const rails = (x: number): Shape[] => [post([x - 6, 0], [x - 6, 222], 3), post([x - 6, 222], [x + 6, 222], 3)];
const seatSide = (hip: V, x0 = -18, x1 = 30): Shape[] => [post([hip[0] + 6, 0], [hip[0] + 6, hip[1] - 16]), pad([hip[0] + x0, hip[1] - 13.5], [hip[0] + x1, hip[1] - 13.5])];
/** encosto ao longo das costas (lado posterior do tronco) */
function backPad(p: Pose, t0 = -6, t1 = 60): Shape[] {
  const s = sk(p);
  const a = add(add(s.pelvis, mul(s.d, t0)), mul(s.n, -14.5));
  const b = add(add(s.pelvis, mul(s.d, t1)), mul(s.n, -14.5));
  const low = a[1] < b[1] ? a : b;
  return [post([low[0], 0], [low[0], low[1]]), pad(a, b)];
}
/** apoio de peito (lado anterior do tronco) */
function chestPad(p: Pose, t0 = -4, t1 = 52): Shape[] {
  const s = sk(p);
  const a = add(add(s.pelvis, mul(s.d, t0)), mul(s.n, 16));
  const b = add(add(s.pelvis, mul(s.d, t1)), mul(s.n, 16));
  return [post([a[0], 0], [a[0], a[1]]), pad(a, b)];
}

// ---------- bases ----------
const stand = (o: Partial<Pose> = {}): Pose => ({ hip: [0, 95], torso: 90, armN: HANG, armF: HANG, legN: T([0, ANK]), legF: T([0, ANK]), ...o });
const seat = (o: Partial<Pose> = {}): Pose => ({ hip: [0, 53], torso: 90, armN: HANG, armF: HANG, legN: T([42, ANK]), legF: T([42, ANK]), ...o });
const lie = (o: Partial<Pose> = {}): Pose => ({ hip: [0, 56], torso: 180, armN: HANG, armF: HANG, legN: T([42, ANK]), legF: T([42, ANK]), ...o });
const fstand = (o: Partial<Pose> = {}): Pose => ({ hip: [0, 94], torso: 90, armN: A(-94, -92), armF: A(-86, -88), legN: T([-12, ANK]), legF: T([12, ANK]), ...o });
const fseat = (o: Partial<Pose> = {}): Pose => ({ hip: [0, 53], torso: 90, armN: A(-94, -92), armF: A(-86, -88), legN: A(-97, -91, [0.12, 1]), legF: A(-83, -89, [0.12, 1]), ...o });
const fseatScene: Shape[] = [pad([-24, 39], [24, 39], 7), post([0, 0], [0, 36], 5)];

/** quadril a partir do ombro (útil quando o ombro/mão é a referência) */
const hipFrom = (shoulder: V, torso: number): V => add(shoulder, mul(dir(torso), -46));

function eqProps(eq: Eq, two = true): Prop[] {
  if (eq === "barbell" || eq === "smith" || eq === "tbar") return [{ k: "barbell", at: "hands" }];
  if (eq === "dumbbell") return two ? [{ k: "dumbbell", at: "handN" }, { k: "dumbbell", at: "handF" }] : [{ k: "dumbbell", at: "handN" }];
  if (eq === "plate") return [{ k: "plate", at: "hands" }];
  return [];
}

// =====================================================================
// PEITO
// =====================================================================

/** Supino deitado/inclinado/declinado. angle: 0 reto, 30/45 inclinado, -15 declinado. */
export function benchPress({ angle = 0, eq = "barbell", single = false }: { angle?: number; eq?: Eq; single?: boolean }): Motion {
  const decline = angle < 0;
  const base = lie({ torso: 180 - angle, hip: decline ? [0, 62] : [0, 56], legN: decline ? T([30, 44]) : T([44, ANK]), legF: decline ? T([30, 44]) : T([44, ANK]) });
  const s = sk(base);
  const S = s.shoulder;
  const top: V = add(S, [angle > 0 ? 3 : 0, 54]);
  // cotovelo abaixo do banco, antebraço vertical: punho sobre o meio do peito
  const low: V = eq === "dumbbell" ? add(add(S, mul(s.n, 2)), mul(s.d, -15)) : add(add(S, mul(s.n, 4)), mul(s.d, angle > 20 ? -14 : -17));
  const restF = A(-100, -60);
  const poses = [low, top].map((w) => ({ ...base, armN: T(w), armF: single ? restF : T(w) }));
  const scene: Shape[] = angle > 0 ? [...backPad(base, -4, 62), pad([-14, 42], [30, 42]), post([24, 0], [24, 38])] : [...flatBench(decline ? -66 : -70, 32, decline ? 50 : 46)];
  if (decline) scene.push(post([30, 50], [30, 36], 3), { k: "circle", c: [36, 50], r: 6, tone: "pad" });
  if (eq === "smith") scene.push(...rails(top[0] - 4));
  return { view: "side", poses, scene, props: eqProps(eq, !single) };
}

/** Supino em máquina sentado. dir: ângulo do empurrão (0 horizontal, 50 inclinado, -15 declinado). lying: deitado. */
export function machinePress({ push = 0, lying = false }: { push?: number; lying?: boolean }): Motion {
  if (lying) {
    const base = lie({ legN: T([44, ANK]), legF: T([44, ANK]) });
    const S = sk(base).shoulder;
    const low = add(S, [17, 4]);
    const top = add(S, [2, 54]);
    return { view: "side", poses: [low, top].map((w) => ({ ...base, armN: T(w), armF: T(w) })), scene: flatBench(-70, 32), props: [{ k: "lever", pivot: [S[0] - 70, 26], at: "hands" }] };
  }
  const base = seat({ torso: 100 });
  const s = sk(base);
  const S = s.shoulder;
  const low = add(add(S, mul(s.n, 6)), mul(s.d, push > 20 ? -4 : -16));
  const top = add(S, mul(dir(push - 2), 53));
  const pivot: V = push > 20 ? [S[0] - 25, S[1] + 70] : push < 0 ? [S[0] - 10, S[1] + 75] : [S[0] - 18, S[1] + 62];
  return {
    view: "side",
    poses: [low, top].map((w) => ({ ...base, armN: T(w), armF: T(w) })),
    scene: [...seatSide(base.hip), ...backPad(base, 0, 62)],
    props: [{ k: "lever", pivot, at: "hands" }],
  };
}

/**
 * Abertura vista de cima (crucifixo deitado, peck deck, crossover). Os braços giram fora do plano da imagem:
 * aberto (comprimento cheio) → à frente (escorço) → fechado no meio.
 */
function swingIn(openN: Limb, forward: Limb, closed: Limb): Limb[] {
  return [openN, forward, closed];
}

export function flyLying({ incline = 0, eq = "dumbbell" }: { incline?: number; eq?: Eq }): Motion {
  const base = fstand({ hip: [0, 95], legN: A(-96, -96, [1, 0.3]), legF: A(-84, -84, [1, 0.3]) });
  const arms = swingIn(A(182, 196), A(180, 190, [0.35, 0.35]), A(-12, 30, [0.42, 0.35]));
  const scene: Shape[] = [{ k: "poly", pts: [[-17, 64], [17, 64], [17, 186], [-17, 186]], tone: "bench" }];
  if (incline) scene.push({ k: "poly", pts: [[-17, 132], [17, 132], [17, 136], [-17, 136]], tone: "dark" });
  return { view: "front", noFloor: true, sym: true, poses: arms.map((a) => ({ ...base, armN: a })), scene, props: eqProps(eq) };
}

export function pecDeck({ single = false }: { single?: boolean }): Motion {
  const base = fseat();
  const arms = swingIn(A(180, 92), A(181, 90, [0.15, 1]), A(0, 92, [0.36, 1]));
  const poses = arms.map((a) => ({ ...base, armN: a, armF: single ? A(-86, -88) : a }));
  return { view: "front", sym: single ? "legs" : true, poses, scene: [...fseatScene, post([0, 36], [0, 132], 5)], props: [{ k: "pad", at: "elbowN", r: 5 }] };
}

/** Crossover / cabo cruzado de pé (vista de frente). from: "high" | "low"; bent: tronco inclinado. */
export function crossover({ from = "high", bent = false }: { from?: "high" | "low"; bent?: boolean }): Motion {
  const base = fstand({ tfs: bent ? 0.82 : 1 });
  const y = from === "high" ? 206 : 18;
  const open = from === "high" ? T([-70, 168]) : T([-66, 98]);
  const shut = from === "high" ? T([-8, bent ? 104 : 108], 1, [0.62, 0.62]) : T([-8, 130], 1, [0.6, 0.6]);
  return {
    view: "front",
    sym: true,
    poses: [open, shut].map((a) => ({ ...base, armN: a })),
    scene: [...tower(-104), ...tower(104)],
    props: [{ k: "cable", from: [-100, y], at: "handN" }, { k: "cable", from: [100, y], at: "handF" }],
  };
}

export function pushUp({ close = false, deep = false }: { close?: boolean; deep?: boolean }): Motion {
  const ankle: V = [0, 17];
  const body = (b: number) => {
    const hip = add(ankle, mul(dir(b), 87));
    return { hip, torso: b, S: add(hip, mul(dir(b), 46)) };
  };
  const top = body(17);
  const bot = body(deep ? 2 : 4);
  const wrist: V = [top.S[0] + (close ? -4 : 0), 7];
  const mk = (b: ReturnType<typeof body>): Pose => ({ hip: b.hip, torso: b.torso, armN: T(wrist), armF: T(wrist), legN: T(ankle), legF: T(ankle), footN: -72, footF: -72 });
  return { view: "side", poses: [mk(top), mk(bot)] };
}

export function dips({ chest = true, machine = false }: { chest?: boolean; machine?: boolean }): Motion {
  if (machine) {
    const base = seat({ torso: 92 });
    const S = sk(base).shoulder;
    const poses = [add(S, [4, -22]), add(S, [2, -52])].map((w) => ({ ...base, armN: T(w), armF: T(w) }));
    return { view: "side", poses, scene: [...seatSide(base.hip), ...backPad(base, 0, 58)], props: [{ k: "lever", pivot: [S[0] - 50, S[1] - 30], at: "hands" }] };
  }
  const wrist: V = [0, 118];
  const mk = (S: V, torso: number): Pose => ({ hip: hipFrom(S, torso), torso, armN: T(wrist), armF: T(wrist), legN: A(-100, -172), legF: A(-96, -166) });
  const poses = chest ? [mk([-3, 170], 74), mk([-6, 141], 60)] : [mk([-2, 171], 86), mk([-5, 142], 80)];
  return { view: "side", poses, scene: [post([-40, 114], [34, 114], 5), post([28, 0], [28, 114], 4)] };
}

/** Pullover deitado (halter ou barra). */
export function pullover({ eq = "dumbbell" }: { eq?: Eq }): Motion {
  const base = lie();
  const poses = [A(88, 92), A(176, 182)].map((a) => ({ ...base, armN: a, armF: a }));
  return { view: "side", poses, scene: flatBench(-70, 32), props: eq === "barbell" ? [{ k: "barbell", at: "hands" }] : [{ k: "dumbbell", at: "hands" }] };
}

/** Elevação frontal deitado no banco inclinado (Front Incline Dumbbell Raise). */
export function inclineFrontRaise(): Motion {
  const base = lie({ torso: 145 });
  const poses = [A(-55, -50), A(84, 88)].map((a) => ({ ...base, armN: a, armF: a }));
  return { view: "side", poses, scene: [...backPad(base, -4, 62), pad([-14, 42], [30, 42]), post([24, 0], [24, 38])], props: eqProps("dumbbell") };
}

// =====================================================================
// COSTAS
// =====================================================================

/** Remada curvada em pé (barra, halter, smith, cabo baixo, T-bar). */
export function bentRow({ eq = "barbell", single = false, hinge = 38 }: { eq?: Eq; single?: boolean; hinge?: number }): Motion {
  const base = stand({ hip: [-12, 86], torso: hinge, legN: T([2, ANK]), legF: T([2, ANK]) });
  const s = sk(base);
  const hang = add(s.shoulder, [2, -53]);
  const pulled = add(add(base.hip, mul(s.d, 20)), mul(s.n, 15));
  const poses = [hang, pulled].map((w) => ({ ...base, armN: T(w), armF: single ? A(-60, -20) : T(w) }));
  const props: Prop[] = eqProps(eq, !single);
  const scene: Shape[] = [];
  if (eq === "cable") props.push({ k: "cable", from: [s.shoulder[0] + 95, 16], at: "hands" }, { k: "handle", at: "hands" }), scene.push(...tower(s.shoulder[0] + 100));
  if (eq === "tbar") props.unshift({ k: "lever", pivot: [-118, 5], at: "hands" });
  if (eq === "smith") scene.push(...rails(hang[0] - 6));
  return { view: "side", poses, props, scene };
}

/** Remada unilateral com halter, joelho e mão no banco. */
export function oneArmRow(): Motion {
  const base: Pose = { hip: [-5, 90], torso: 8, armN: HANG, armF: T([52, 52]), legN: T([10, ANK]), legF: T([-48, 56]), footF: 180 };
  const s = sk(base);
  const hang = add(s.shoulder, [2, -52]);
  const pulled = add(add(base.hip, mul(s.d, 18)), mul(s.n, 12));
  return { view: "side", poses: [hang, pulled].map((w) => ({ ...base, armN: T(w) })), scene: flatBench(-62, 62), props: [{ k: "dumbbell", at: "handN" }] };
}

/** Remada com o peito apoiado no banco inclinado. */
export function proneRow({ eq = "dumbbell", fly = false }: { eq?: Eq; fly?: boolean }): Motion {
  const base = stand({ hip: [0, 84], torso: 42, legN: T([-30, ANK]), legF: T([-30, ANK]) });
  const s = sk(base);
  if (fly) {
    // crucifixo invertido apoiado: vista de costas
    const b2 = fstand({ hip: [0, 92], tfs: 0.68 });
    const poses = [A(-92, -92), A(184, 190)].map((a) => ({ ...b2, armN: a }));
    return { view: "back", sym: true, poses, scene: [{ k: "poly", pts: [[-16, 96], [16, 96], [16, 128], [-16, 128]], tone: "bench" }], props: eqProps("dumbbell") };
  }
  const hang = add(s.shoulder, [1, -52]);
  const pulled = add(add(base.hip, mul(s.d, 24)), mul(s.n, 12));
  const props = eqProps(eq);
  if (eq === "tbar") props.unshift({ k: "lever", pivot: [-60, 10], at: "hands" });
  return { view: "side", poses: [hang, pulled].map((w) => ({ ...base, armN: T(w), armF: T(w) })), scene: chestPad(base, -6, 50), props };
}

/** Remada sentada no cabo (pés no apoio). */
export function seatedCableRow({ single = false, kneel = false }: { single?: boolean; kneel?: boolean }): Motion {
  const legs: Partial<Pose> = kneel ? { hip: [0, 52], legN: T([-40, ANK]), legF: T([-40, ANK]), footN: 180, footF: 180 } : { hip: [0, 31], legN: T([70, 25]), legF: T([70, 25]), footN: 80, footF: 80 };
  const mk = (torso: number, pulled: boolean): Pose => {
    const b = stand({ ...legs, torso });
    const s = sk(b);
    const w = pulled ? add(add(b.hip, mul(s.d, 22)), mul(s.n, 14)) : add(s.shoulder, mul(dir(-6), 52));
    return { ...b, armN: T(w), armF: single ? A(-80, -40) : T(w) };
  };
  const scene: Shape[] = kneel ? [] : [pad([-30, 17.5], [36, 17.5]), post([0, 0], [0, 13]), post([78, 0], [78, 40], 5)];
  return { view: "side", poses: [mk(72, false), mk(96, true)], scene: [...scene, ...tower(116)], props: [{ k: "cable", from: [112, kneel ? 60 : 30], at: single ? "handN" : "hands" }, { k: "handle", at: single ? "handN" : "hands" }] };
}

/** Remada na máquina sentado, peito no apoio. */
export function machineRow({ single = false }: { single?: boolean }): Motion {
  const base = seat({ torso: 88, legN: T([40, 18]), legF: T([40, 18]) });
  const s = sk(base);
  const S = s.shoulder;
  const out = add(S, mul(dir(-8), 52));
  const pulled = add(add(base.hip, mul(s.d, 26)), mul(s.n, 15));
  const poses = [out, pulled].map((w) => ({ ...base, armN: T(w), armF: single ? A(-60, -10) : T(w) }));
  return {
    view: "side",
    poses,
    scene: [...seatSide(base.hip, -18, 24), pad(add(S, [17, -38]), add(S, [17, 2])), post(add(S, [21, -38]), [S[0] + 21, 0])],
    props: [{ k: "lever", pivot: [S[0] + 60, 16], at: single ? "handN" : "hands" }],
  };
}

/** Remada em pé no cabo na altura do peito (crossover). */
export function standingCableRow({ single = false }: { single?: boolean }): Motion {
  const base = stand({ torso: 84, hip: [-4, 93], legN: T([6, ANK]), legF: T([-14, ANK]) });
  const s = sk(base);
  const out = add(s.shoulder, mul(dir(-4), 52));
  const pulled = add(add(base.hip, mul(s.d, 30)), mul(s.n, 14));
  const poses = [out, pulled].map((w) => ({ ...base, armN: T(w), armF: single ? A(-90, -80) : T(w) }));
  return { view: "side", poses, scene: tower(s.shoulder[0] + 100), props: [{ k: "cable", from: [s.shoulder[0] + 96, s.shoulder[1] - 22], at: single ? "handN" : "hands" }, { k: "handle", at: single ? "handN" : "hands" }] };
}

/** Puxada na frente sentado. view front = pegada aberta; side = fechada/supinada/triângulo. */
export function pulldown({ view = "front", machine = false, single = false, kneel = false }: { view?: "front" | "side"; machine?: boolean; single?: boolean; kneel?: boolean }): Motion {
  if (view === "front") {
    const base = kneel ? fstand({ hip: [0, 52], legN: A(-96, -90, [0.1, 1]), legF: A(-84, -90, [0.1, 1]) }) : fseat({ tfs: 0.98 });
    const up = T([-44, 150]);
    const down = T([-33, 101]);
    if (single) {
      const b = fstand();
      const poses = [T([-50, 196]), T([-36, 142])].map((a) => ({ ...b, armN: a, armF: A(-60, -80) }));
      return { view: "front", sym: "legs", poses, scene: tower(-88, 236), props: [{ k: "cable", from: [-84, 228], at: "handN" }, { k: "handle", at: "handN" }] };
    }
    const props: Prop[] = machine
      ? [{ k: "lever", pivot: [-56, 176], at: "handN" }, { k: "lever", pivot: [56, 176], at: "handF" }]
      : [{ k: "cable", from: [0, 200], at: "hands" }, { k: "handle", at: "hands" }];
    const scene: Shape[] = kneel ? [] : [...fseatScene, pad([-26, 62], [26, 62], 8)];
    return { view: "front", sym: true, poses: [up, down].map((a) => ({ ...base, armN: a })), scene: [...scene, post([-60, 0], [-60, 204], 5), post([-60, 204], [60, 204], 5), post([60, 0], [60, 204], 5)], props };
  }
  const base = kneel ? stand({ hip: [0, 52], torso: 96, legN: T([-40, ANK]), legF: T([-40, ANK]), footN: 180, footF: 180 }) : seat({ torso: 100 });
  const s = sk(base);
  const S = s.shoulder;
  const up = add(S, mul(dir(82), 53));
  const down = add(add(S, mul(s.n, 9)), mul(s.d, -7));
  return {
    view: "side",
    poses: [up, down].map((w) => ({ ...base, armN: T(w), armF: T(w) })),
    scene: kneel ? tower(S[0] + 40, 226) : [...seatSide(base.hip), { k: "circle", c: [36, 62], r: 6, tone: "pad" }, ...tower(S[0] + 46, 226)],
    props: [{ k: "cable", from: [S[0] + 14, S[1] + 112], at: "hands" }, { k: "handle", at: "hands" }],
  };
}

/** Barra fixa. */
export function pullUp({ view = "front" }: { view?: "front" | "side" }): Motion {
  if (view === "front") {
    const mk = (hipY: number): Pose => ({ hip: [0, hipY], torso: 90, armN: T([-42, 211]), armF: T([42, 211]), legN: A(-93, -100), legF: A(-87, -80) });
    return { view: "front", noFloor: true, poses: [mk(118), mk(150)], scene: [post([-80, 217], [80, 217], 5)] };
  }
  const mk = (hipY: number, torso: number): Pose => ({ hip: [-2, hipY], torso, armN: T([12, 211]), armF: T([12, 211]), legN: A(-100, -125), legF: A(-96, -121) });
  return { view: "side", noFloor: true, poses: [mk(118, 92), mk(150, 80)], scene: [post([-30, 217], [50, 217], 5)] };
}

/** Pulôver em pé no cabo / puxada com braço reto. hinge: inclinação do tronco. */
export function straightArm({ hinge = 74, eq = "cable", start = 56, end = -74 }: { hinge?: number; eq?: Eq; start?: number; end?: number }): Motion {
  const base = stand({ hip: [-6, 93], torso: hinge, legN: T([2, ANK]), legF: T([2, ANK]) });
  const S = sk(base).shoulder;
  const poses = [A(start, start + 3), A(end, end + 3)].map((a) => ({ ...base, armN: a, armF: a }));
  if (eq === "dumbbell") return { view: "side", poses, props: eqProps("dumbbell") };
  return { view: "side", poses, scene: tower(S[0] + 92, 222), props: [{ k: "cable", from: [S[0] + 88, 214], at: "hands" }, { k: "handle", at: "hands" }] };
}

/** Puxada em pé no cabo alto com cotovelos dobrando (Standing Cable Pulldown). */
export function standingPulldown(): Motion {
  const base = stand({ hip: [-6, 93], torso: 80 });
  const s = sk(base);
  const up = add(s.shoulder, mul(dir(70), 52));
  const down = add(add(s.shoulder, mul(s.n, 10)), mul(s.d, -12));
  return { view: "side", poses: [up, down].map((w) => ({ ...base, armN: T(w), armF: T(w) })), scene: tower(s.shoulder[0] + 70, 230), props: [{ k: "cable", from: [s.shoulder[0] + 64, 222], at: "hands" }, { k: "handle", at: "hands" }] };
}

/** Puxada para o rosto / corda no pescoço (cabo na altura do rosto). low: na altura do peito. */
export function facePull({ low = false }: { low?: boolean }): Motion {
  const base = stand({ hip: [-4, 94], torso: 86, legN: T([8, ANK]), legF: T([-12, ANK]) });
  const S = sk(base).shoulder;
  const out = add(S, mul(dir(low ? -6 : 10), 52));
  const pulled = low ? add(S, [12, -4]) : add(S, [6, 19]);
  return { view: "side", poses: [out, pulled].map((w) => ({ ...base, armN: T(w, 1), armF: T(w, 1) })), scene: tower(S[0] + 96), props: [{ k: "cable", from: [S[0] + 92, S[1] + (low ? -8 : 16)], at: "hands" }, { k: "handle", at: "hands" }] };
}

/** Encolhimento (vista de frente; atrás do corpo = vista de costas). */
export function shrug({ eq = "barbell", behind = false }: { eq?: Eq; behind?: boolean }): Motion {
  const base = fstand({ armN: A(-93, -91), armF: A(-87, -89) });
  const props: Prop[] = eq === "dumbbell" ? [{ k: "dumbbell", at: "handN", o: "v" }, { k: "dumbbell", at: "handF", o: "v" }] : [{ k: "barbell", at: "hands" }];
  if (eq === "cable") props.push({ k: "cable", from: [0, 10], at: "hands" });
  return { view: behind ? "back" : "front", sym: true, poses: [{ ...base, shrug: 0 }, { ...base, shrug: 7 }], props: eq === "cable" ? [{ k: "handle", at: "hands" }, ...props.slice(1)] : props };
}

/** Hiperextensão no banco 45° (lombar/glúteo). */
export function backExtension({ eq = "body" }: { eq?: Eq }): Motion {
  const hip: V = [0, 92];
  const legs = { legN: A(-135, -135), legF: A(-135, -135), footN: -45, footF: -45 };
  const arms = eq === "barbell" ? R(-140, 120) : R(-160, 150);
  const mk = (torso: number): Pose => ({ hip, torso, armN: arms, armF: arms, ...legs });
  const thighPad = add(add(hip, mul(dir(-135), 14)), mul(dir(-45), 13));
  const ankle = add(hip, mul(dir(-135), 87));
  const props: Prop[] = eq === "barbell" ? [{ k: "plate", at: "chest", r: 13 }] : [];
  return {
    view: "side",
    poses: [mk(-62), mk(44)],
    scene: [post(thighPad, [thighPad[0] - 30, 0], 5), { k: "circle", c: thighPad, r: 8, tone: "pad" }, post(add(ankle, [4, -4]), [ankle[0] + 6, 0], 4), { k: "circle", c: add(ankle, [2, 9]), r: 5, tone: "pad" }],
    props,
  };
}

/** Extensão lombar na máquina sentado. */
export function seatedBackExtension(): Motion {
  const base = seat({ armN: R(-160, 150), armF: R(-160, 150) });
  return { view: "side", poses: [{ ...base, torso: 52 }, { ...base, torso: 100 }], scene: seatSide(base.hip), props: [{ k: "lever", pivot: [-8, 50], at: "back" }, { k: "pad", at: "back", r: 6 }] };
}

/** Bom-dia com barra nas costas. */
export function goodMorning(): Motion {
  const mk = (hipX: number, torso: number): Pose => {
    const b = stand({ hip: [hipX, 93], torso });
    const bar = at(b, (s) => add(add(s.neck, mul(s.n, -7)), mul(s.d, -3)));
    return { ...b, armN: T(bar, 1), armF: T(bar, 1) };
  };
  return { view: "side", poses: [mk(0, 88), mk(-16, 18)], props: [{ k: "barbell", at: "traps" }] };
}

// =====================================================================
// OMBROS
// =====================================================================

/** Desenvolvimento. view front para halteres/Arnold; side para barra, smith e máquina. */
export function overheadPress({ eq = "dumbbell", arnold = false, standing = false }: { eq?: Eq; arnold?: boolean; standing?: boolean }): Motion {
  if (eq === "dumbbell") {
    const base = standing ? fstand() : fseat();
    const dy = base.hip[1] - 53;
    if (arnold) {
      const arms = [A(290, 94, [0.32, 1]), A(200, 94), A(108, 92)];
      return { view: "front", sym: true, poses: arms.map((a) => ({ ...base, armN: a })), scene: standing ? [] : fseatScene, props: eqProps("dumbbell") };
    }
    const poses = [T([-34, 104 + dy]), T([-14, 152 + dy])].map((a) => ({ ...base, armN: a }));
    return { view: "front", sym: true, poses, scene: standing ? [] : [...fseatScene, post([0, 36], [0, 110], 5)], props: eqProps("dumbbell") };
  }
  const base = standing ? stand() : seat({ torso: 94 });
  const S = sk(base).shoulder;
  const low = add(S, [9, 7]);
  const top = add(S, [2, 55]);
  const poses = [low, top].map((w) => ({ ...base, armN: T(w), armF: T(w) }));
  const scene: Shape[] = standing ? [] : [...seatSide(base.hip), ...backPad(base, 0, 56)];
  const props: Prop[] = eq === "machine" ? [{ k: "lever", pivot: [S[0] - 45, S[1] + 6], at: "hands" }] : eqProps(eq);
  if (eq === "smith") scene.push(...rails(low[0] - 8));
  return { view: "side", poses, scene, props };
}

/** Elevação lateral (vista de frente). */
export function lateralRaise({ seated = false, eq = "dumbbell", single = false, incline = false }: { seated?: boolean; eq?: Eq; single?: boolean; incline?: boolean }): Motion {
  if (incline) {
    const base = fstand({ torso: 62, hip: [6, 94] });
    const poses = [A(276, 276), A(150, 158)].map((a) => ({ ...base, armN: a, armF: A(-60, -60) }));
    const s = sk(base, "front");
    const lat = mul(dir(62 - 90), 16);
    return { view: "front", sym: "legs", poses, scene: [pad(add(add(s.pelvis, lat), mul(s.d, -10)), add(add(s.pelvis, lat), mul(s.d, 60))), post(add(add(s.pelvis, lat), mul(s.d, -10)), [s.pelvis[0] + 18, 0])], props: [{ k: "dumbbell", at: "handN" }] };
  }
  const base = seated ? fseat() : fstand();
  const up = A(182, 190);
  const down = A(266, 268);
  if (single || eq === "cable") {
    const rest = eq === "cable" ? A(-30, 10) : A(-60, -100);
    const poses = [down, up].map((a) => ({ ...base, armN: a, armF: rest }));
    const props: Prop[] = eq === "cable" ? [{ k: "cable", from: [52, 14], at: "handN" }, { k: "handle", at: "handN" }] : [{ k: "dumbbell", at: "handN" }];
    return { view: "front", sym: "legs", poses, scene: eq === "cable" ? tower(56) : seated ? fseatScene : [], props };
  }
  return { view: "front", sym: true, poses: [down, up].map((a) => ({ ...base, armN: a })), scene: seated ? fseatScene : [], props: eqProps("dumbbell") };
}

/** Elevação lateral + frontal combinadas (vista de frente). */
export function frontAndLateral({ lateralFirst = false }: { lateralFirst?: boolean }): Motion {
  const base = fstand();
  const down = A(266, 268);
  const front = A(266, 266, [0.18, 0.18]);
  const side = A(182, 190);
  const seq = lateralFirst ? [side, down, front] : [front, down, side];
  return { view: "front", sym: true, poses: seq.map((a) => ({ ...base, armN: a })), props: eqProps("dumbbell") };
}

/** Crucifixo invertido / posterior (vista de costas). kind: bent (curvado), machine (sentado), cable (cabos cruzados). */
export function rearDelt({ kind = "bent" }: { kind?: "bent" | "machine" | "cable" }): Motion {
  if (kind === "machine") {
    const base = fseat();
    const poses = [A(180, 182, [0.2, 0.2]), A(180, 182)].map((a) => ({ ...base, armN: a }));
    return { view: "back", sym: true, poses, scene: [...fseatScene, post([0, 36], [0, 120], 5)] };
  }
  if (kind === "cable") {
    const base = fstand();
    const poses = [A(0, 2, [0.55, 0.55]), A(0, 2, [0.12, 0.12]), A(180, 182, [0.12, 0.12]), A(180, 182)].map((a) => ({ ...base, armN: a }));
    return { view: "back", sym: true, poses, scene: [...tower(-104), ...tower(104)], props: [{ k: "cable", from: [100, 150], at: "handN" }, { k: "cable", from: [-100, 150], at: "handF" }] };
  }
  const base = fstand({ hip: [0, 90], tfs: 0.45, legN: T([-12, ANK]), legF: T([12, ANK]) });
  const poses = [A(-92, -92), A(182, 190)].map((a) => ({ ...base, armN: a }));
  return { view: "back", sym: true, poses, props: eqProps("dumbbell") };
}

/** Elevação frontal (de lado). */
export function frontRaise({ eq = "dumbbell", alt = false, seated = false, single = false }: { eq?: Eq; alt?: boolean; seated?: boolean; single?: boolean }): Motion {
  const base = seated ? seat() : stand();
  const poses = [A(-84, -82), A(4, 8)].map((a) => ({ ...base, armN: a, armF: single ? HANG : a }));
  const props: Prop[] = eq === "cable" ? [{ k: "cable", from: [-14, 12], at: single ? "handN" : "hands" }, { k: "handle", at: single ? "handN" : "hands" }] : eqProps(eq, !single);
  return { view: "side", alt, poses, props, scene: seated ? seatSide(base.hip) : eq === "cable" ? tower(-20, 40) : [] };
}

/** Elevação frontal deitado de bruços no banco inclinado. */
export function proneFrontRaise(): Motion {
  const base = stand({ hip: [0, 84], torso: 42, legN: T([-30, ANK]), legF: T([-30, ANK]) });
  return { view: "side", poses: [A(-90, -88), A(40, 44)].map((a) => ({ ...base, armN: a, armF: a })), scene: chestPad(base, -6, 50), props: eqProps("dumbbell") };
}

/** Remada alta (vista de frente). */
export function uprightRow({ eq = "barbell", pull = false }: { eq?: Eq; pull?: boolean }): Motion {
  const base = fstand();
  const poses: Pose[] = [
    { ...base, torso: pull ? 84 : 90, armN: A(265, -85) },
    { ...base, armN: A(158, -16, [0.95, 0.95]) },
  ];
  const props: Prop[] = eq === "dumbbell" ? eqProps("dumbbell") : [{ k: "barbell", at: "hands", r: eq === "cable" ? 0 : 21 }];
  if (eq === "cable") return { view: "front", sym: "arms", poses, props: [{ k: "handle", at: "hands" }, { k: "cable", from: [0, 10], at: "hands" }] };
  return { view: "front", sym: "arms", poses, props };
}

/** Rotação externa/interna do ombro no cabo (vista de frente). */
export function shoulderRotation({ external = true }: { external?: boolean }): Motion {
  const base = fstand();
  const inn = A(268, 2, [1, 0.9]);
  const fwdIn = A(268, 2, [1, 0.12]);
  const fwdOut = A(268, 178, [1, 0.12]);
  const out = A(268, 178, [1, 0.9]);
  const seq = external ? [inn, fwdIn, fwdOut, out] : [out, fwdOut, fwdIn, inn];
  return { view: "front", sym: "legs", poses: seq.map((a) => ({ ...base, armN: a, armF: A(-86, -88) })), scene: tower(external ? 70 : -110), props: [{ k: "cable", from: external ? [66, 108] : [-106, 108], at: "handN" }, { k: "handle", at: "handN" }] };
}

// =====================================================================
// BRAÇOS
// =====================================================================

export type CurlKind = "standing" | "seated" | "incline" | "preacher" | "concentration" | "prone" | "squat" | "machine";

export function curl({ kind = "standing", eq = "dumbbell", alt = false, single = false }: { kind?: CurlKind; eq?: Eq; alt?: boolean; single?: boolean }): Motion {
  let base: Pose;
  let arm0: Limb;
  let arm1: Limb;
  const scene: Shape[] = [];
  const props: Prop[] = [];
  switch (kind) {
    case "incline":
      base = lie({ torso: 118, legN: T([46, ANK]), legF: T([46, ANK]) });
      arm0 = A(-96, -95);
      arm1 = A(-94, 78);
      scene.push(...backPad(base, -4, 64), pad([-14, 42], [30, 42]), post([24, 0], [24, 38]));
      break;
    case "preacher":
    case "machine": {
      base = seat({ torso: 86 });
      arm0 = A(-42, -34);
      arm1 = A(-40, 92);
      const s = sk({ ...base, armN: arm0 });
      const u = dir(-42);
      const back = mul(dir(-132), 11);
      const p0 = add(add(s.armN.root, mul(u, 6)), back);
      const p1 = add(add(s.armN.mid, mul(u, 5)), back);
      scene.push(...seatSide(base.hip), post(p1, [p1[0] - 4, 0]), pad(p0, p1, 9));
      if (kind === "machine") props.push({ k: "lever", pivot: s.armN.mid, at: "hands" });
      break;
    }
    case "concentration":
      base = seat({ torso: 56, legN: T([46, ANK]), legF: T([40, ANK]) });
      arm0 = A(-82, -80);
      arm1 = A(-80, 96);
      scene.push(...seatSide(base.hip));
      single = true;
      break;
    case "prone":
      base = stand({ hip: [0, 84], torso: 42, legN: T([-30, ANK]), legF: T([-30, ANK]) });
      arm0 = A(-92, -92);
      arm1 = A(-92, 58);
      scene.push(...chestPad(base, -6, 50));
      break;
    case "squat":
      base = stand({ hip: [-24, 40], torso: 62, legN: T([0, ANK]), legF: T([0, ANK]) });
      arm0 = A(-70, -50);
      arm1 = A(-70, 100);
      break;
    case "seated":
      base = seat();
      arm0 = A(-88, -84);
      arm1 = A(-76, 100);
      scene.push(...seatSide(base.hip));
      break;
    default:
      base = stand();
      arm0 = A(-88, -84);
      arm1 = A(-74, 102);
  }
  const rest = kind === "concentration" ? A(-60, -30) : HANG;
  const poses = [arm0, arm1].map((a) => ({ ...base, armN: a, armF: single ? rest : a }));
  if (eq === "cable") {
    const S = sk(base).shoulder;
    const from: V = kind === "squat" ? [S[0] + 70, 10] : [S[0] + 50, 12];
    props.push({ k: "cable", from, at: single ? "handN" : "hands" }, { k: "handle", at: single ? "handN" : "hands" });
    scene.push(...tower(from[0] + 4, 40));
  } else if (kind !== "machine") props.push(...(eq === "barbell" ? [{ k: "barbell", at: "hands", r: 15 } as Prop] : eqProps(eq, !single)));
  return { view: "side", alt, poses, scene, props };
}

/** Rosca no cabo alto, braços abertos (vista de frente). */
export function highPulleyCurl(): Motion {
  const base = fstand();
  return { view: "front", sym: true, poses: [A(180, 182), A(178, 78)].map((a) => ({ ...base, armN: a })), scene: [...tower(-118), ...tower(118)], props: [{ k: "cable", from: [-114, 146], at: "handN" }, { k: "cable", from: [114, 146], at: "handF" }] };
}

/** Rosca + desenvolvimento sentado (3 fases). */
export function curlPress(): Motion {
  const base = seat();
  const arms = [A(-88, -84), A(-74, 100), A(90, 94)];
  return { view: "side", poses: arms.map((a) => ({ ...base, armN: a, armF: a })), scene: [...seatSide(base.hip), ...backPad(base, 0, 56)], props: eqProps("dumbbell") };
}

/** Tríceps no pulley (de pé, cabo alto). */
export function pushdown({ single = false, rope = false }: { single?: boolean; rope?: boolean }): Motion {
  const base = stand({ hip: [-3, 95], torso: 84 });
  const S = sk(base).shoulder;
  const poses = [A(-93, 64), A(-92, -88)].map((a) => ({ ...base, armN: a, armF: single ? HANG : a }));
  void rope;
  return { view: "side", poses, scene: tower(S[0] + 34, 222), props: [{ k: "cable", from: [S[0] + 30, 214], at: single ? "handN" : "hands" }, { k: "handle", at: single ? "handN" : "hands" }] };
}

/** Tríceps acima da cabeça. kind: cable (de costas para a polia), seated (halter sentado), bent (inclinado, corda), kickback. */
export function overheadExt({ kind = "cable", single = false }: { kind?: "cable" | "seated" | "bent" | "kickback"; single?: boolean }): Motion {
  if (kind === "seated") {
    const base = seat({ torso: 92 });
    const poses = [A(96, 262), A(95, 96)].map((a) => ({ ...base, armN: a, armF: single ? A(-60, -20) : a }));
    return { view: "side", poses, scene: [...seatSide(base.hip), ...backPad(base, 0, 52)], props: single ? eqProps("dumbbell", false) : [{ k: "dumbbell", at: "hands" }] };
  }
  if (kind === "kickback") {
    const base = stand({ hip: [-10, 88], torso: 28, legN: T([4, ANK]), legF: T([-6, ANK]) });
    const S = sk(base).shoulder;
    const poses = [A(208, 272), A(206, 208)].map((a) => ({ ...base, armN: a, armF: single ? A(-60, -20) : a }));
    return { view: "side", poses, scene: tower(S[0] + 70, 40), props: [{ k: "cable", from: [S[0] + 66, 14], at: single ? "handN" : "hands" }, { k: "handle", at: single ? "handN" : "hands" }] };
  }
  const bent = kind === "bent";
  const base = stand({ hip: [-6, 92], torso: bent ? 30 : 62, legN: T([24, ANK]), legF: T([-30, ANK]) });
  const S = sk(base).shoulder;
  const u = bent ? 32 : 52;
  const poses = [A(u, u + 158), A(u, u + 2)].map((a) => ({ ...base, armN: a, armF: a }));
  const from: V = bent ? [S[0] - 70, 172] : [S[0] - 74, 36];
  return { view: "side", poses, scene: tower(from[0] - 4, bent ? 180 : 60), props: [{ k: "cable", from, at: "hands" }, { k: "handle", at: "hands" }] };
}

/** Tríceps deitado (halter, cabo ou barra inclinada). */
export function lyingExt({ eq = "dumbbell", single = false, incline = 0 }: { eq?: Eq; single?: boolean; incline?: number }): Motion {
  const base = lie({ torso: 180 - incline });
  const S = sk(base).shoulder;
  const u = 104 - incline * 0.3;
  const poses = [A(u, u + 92), A(u, u + 2)].map((a) => ({ ...base, armN: a, armF: single ? A(-100, -60) : a }));
  const scene: Shape[] = incline ? [...backPad(base, -4, 62), pad([-14, 42], [30, 42]), post([24, 0], [24, 38])] : flatBench(-70, 32);
  if (eq === "cable") return { view: "side", poses, scene: [...scene, ...tower(S[0] - 100, 40)], props: [{ k: "cable", from: [S[0] - 96, 30], at: "hands" }, { k: "handle", at: "hands" }] };
  return { view: "side", poses, scene, props: eqProps(eq, !single) };
}

/** Rosca de punho. kind: seated (antebraço na coxa/banco), behind (barra atrás), cable (cotovelo 90°). */
export function wristCurl({ kind = "seated", reverse = false, eq = "barbell", single = false }: { kind?: "seated" | "behind" | "cable"; reverse?: boolean; eq?: Eq; single?: boolean }): Motion {
  if (kind === "behind") {
    const base = stand({ armN: A(-96, -98), armF: A(-96, -98) });
    return { view: "side", poses: [{ ...base, wristN: 0, wristF: 0 }, { ...base, wristN: -55, wristF: -55 }], props: [{ k: "barbell", at: "hands", r: 13 }] };
  }
  if (kind === "cable") {
    const base = stand();
    const arms = A(-92, -2);
    const w0 = reverse ? 50 : -50;
    const w1 = reverse ? -40 : 55;
    const S = sk(base).shoulder;
    const pose = (w: number): Pose => ({ ...base, armN: arms, armF: single ? HANG : arms, wristN: w, wristF: w });
    return { view: "side", poses: [pose(w0), pose(w1)], scene: tower(S[0] + 60, reverse ? 40 : 200), props: [{ k: "cable", from: [S[0] + 56, reverse ? 14 : 190], at: single ? "handN" : "hands" }, { k: "handle", at: single ? "handN" : "hands" }] };
  }
  const base = seat({ torso: 60, legN: T([46, ANK]), legF: T([46, ANK]) });
  const fore = A(-62, -4);
  const w0 = reverse ? 45 : -55;
  const w1 = reverse ? -35 : 45;
  const pose = (w: number): Pose => ({ ...base, armN: fore, armF: single ? A(-70, -10) : fore, wristN: w, wristF: w });
  return { view: "side", poses: [pose(w0), pose(w1)], scene: seatSide(base.hip), props: eq === "barbell" ? [{ k: "barbell", at: "hands", r: 13 }] : eqProps(eq, !single) };
}

// =====================================================================
// PERNAS
// =====================================================================

/** Agachamento de lado. bar: back (costas), front (frontal), goblet, dumbbell, smith. */
export function squat({ bar = "back" }: { bar?: "back" | "front" | "goblet" | "dumbbell" | "smith" }): Motion {
  const [bx, by, bt] = bar === "front" || bar === "goblet" ? [-14, 49, 70] : bar === "dumbbell" ? [-20, 50, 60] : [-22, 51, 52];
  const mk = (hip: V, torso: number): Pose => {
    const b = stand({ hip, torso, legN: T([0, ANK]), legF: T([0, ANK]) });
    const s = sk(b);
    if (bar === "dumbbell") return b;
    if (bar === "goblet") {
      const w = add(add(s.shoulder, mul(s.n, 15)), mul(s.d, -14));
      return { ...b, armN: T(w, -1), armF: T(w, -1) };
    }
    if (bar === "front") {
      const w = add(add(s.shoulder, mul(s.n, 11)), mul(s.d, 3));
      return { ...b, armN: T(w, 1), armF: T(w, 1) };
    }
    const w = add(add(s.neck, mul(s.n, -7)), mul(s.d, -3));
    return { ...b, armN: T(w, 1), armF: T(w, 1) };
  };
  const poses = [mk([0, 95], 88), mk([bx, by], bt)];
  const props: Prop[] = bar === "dumbbell" ? eqProps("dumbbell") : bar === "goblet" ? [{ k: "dumbbell", at: "hands" }] : bar === "front" ? [{ k: "barbell", at: "hands" }] : [{ k: "barbell", at: "traps" }];
  return { view: "side", poses, props, scene: bar === "smith" ? rails(-14) : [] };
}

/** Agachamento de frente com base aberta (sumô, plié, base larga). load: back (barra nas costas), dumbbell (halter entre as pernas), smith. */
export function wideSquat({ load = "back" }: { load?: "back" | "dumbbell" | "smith" }): Motion {
  const mk = (hipY: number, fs: number, tfs: number): Pose => {
    const b = fstand({ hip: [0, hipY], tfs, legN: T([-31, ANK], -1, [fs, 1]), legF: T([31, ANK], 1, [fs, 1]), footN: 0 });
    const s = sk(b, "front");
    if (load === "dumbbell") return { ...b, armN: T([-3, s.shoulder[1] - 50]) };
    return { ...b, armN: T([-44, s.shoulder[1] + 1]) };
  };
  const poses = [mk(91, 1, 1), mk(54, 0.8, 0.94)];
  const props: Prop[] = load === "dumbbell" ? [{ k: "dumbbell", at: "hands", o: "v" }] : [{ k: "barbell", at: "traps" }];
  return { view: "front", sym: true, poses, props, scene: load === "smith" ? [...rails(-70), ...rails(82)] : [] };
}

/** Levantamento terra. kind: conv (barra), dumbbell, sumo (vista de frente), sumoDb, stiff. */
export function deadlift({ kind = "conv" }: { kind?: "conv" | "dumbbell" | "sumo" | "sumoDb" }): Motion {
  if (kind === "sumo" || kind === "sumoDb") {
    const mk = (hipY: number, tfs: number, fs: number, handY: number): Pose => ({ ...fstand({ hip: [0, hipY], tfs, legN: T([-31, ANK], -1, [fs, 1]), legF: T([31, ANK], 1, [fs, 1]) }), armN: T([kind === "sumo" ? -13 : -3, handY]) });
    const poses = kind === "sumo" ? [mk(60, 0.72, 0.84, 27), mk(91, 1, 1, 87)] : [mk(58, 0.75, 0.82, 22), mk(91, 1, 1, 82)];
    return { view: "front", sym: true, poses, props: kind === "sumo" ? [{ k: "barbell", at: "hands" }] : [{ k: "dumbbell", at: "hands", o: "v" }] };
  }
  const db = kind === "dumbbell";
  const handY = db ? 16 : 27;
  const mk = (hip: V, torso: number, wrist: V): Pose => ({ ...stand({ hip, torso, legN: T([0, ANK]), legF: T([0, ANK]) }), armN: T(wrist), armF: T(wrist) });
  const poses = [mk([-24, 62], 22, [8, handY]), mk([-18, 76], 48, [7, 56]), mk([-4, 93], 88, [0, 86])];
  return { view: "side", poses, props: db ? eqProps("dumbbell") : [{ k: "barbell", at: "hands" }] };
}

/** Terra unilateral (stiff em uma perna). */
export function singleLegDeadlift(): Motion {
  const up = stand({ legF: A(270, 270) });
  const down: Pose = { ...stand({ hip: [-6, 92], torso: 6, legN: T([0, ANK]) }), legF: A(194, 196), footF: 100 };
  return { view: "side", poses: [up, down], props: eqProps("dumbbell", false) };
}

/** Avanço / afundo. kind: forward (passada), static (smith), bulgarian (pé de trás no banco), lateral (vista de frente). */
export function lunge({ kind = "forward" }: { kind?: "forward" | "static" | "bulgarian" | "lateral" }): Motion {
  if (kind === "lateral") {
    const top = fstand({ hip: [0, 90], legN: T([-34, ANK]), legF: T([34, ANK]) });
    const bot = fstand({ hip: [-22, 58], legN: T([-34, ANK], -1, [0.78, 1]), legF: T([34, ANK]) });
    return { view: "front", poses: [top, bot].map((p) => ({ ...p, armN: A(-92, -92), armF: A(-88, -88) })), props: eqProps("dumbbell") };
  }
  if (kind === "bulgarian") {
    const mk = (hip: V, torso: number): Pose => stand({ hip, torso, legN: T([30, ANK]), legF: T([-58, 52]), footF: 170 });
    return { view: "side", poses: [mk([-8, 88], 86), mk([-14, 52], 74)], scene: flatBench(-88, -40), props: eqProps("dumbbell") };
  }
  if (kind === "static") {
    const mk = (hip: V): Pose => {
      const b = stand({ hip, torso: 88, legN: T([34, ANK]), legF: T([-40, 12]), footF: -38 });
      const w = at(b, (s) => add(add(s.neck, mul(s.n, -7)), mul(s.d, -3)));
      return { ...b, armN: T(w, 1), armF: T(w, 1) };
    };
    return { view: "side", poses: [mk([-3, 88]), mk([-4, 50])], props: [{ k: "barbell", at: "traps" }], scene: rails(-16) };
  }
  const stand0 = stand();
  const mid = stand({ hip: [8, 90], torso: 88, legN: T([32, 22]), legF: T([0, ANK]) });
  const bot = stand({ hip: [14, 50], torso: 86, legN: T([56, ANK]), legF: T([-34, 12]), footF: -38 });
  return { view: "side", poses: [stand0, mid, bot], props: eqProps("dumbbell") };
}

/** Leg press 45°. single: uma perna; toe: panturrilha no leg press. */
export function legPress({ single = false, toe = false, horizontal = false }: { single?: boolean; toe?: boolean; horizontal?: boolean }): Motion {
  const rail = horizontal ? 4 : 42;
  const hip: V = [0, horizontal ? 50 : 40];
  const torso = horizontal ? 104 : 132;
  const foot = rail + 90;
  const mk = (reach: number, footAng = foot): Pose => {
    const ankle = add(hip, mul(dir(rail + (reach < 60 ? 6 : 0)), reach));
    return { hip, torso, armN: A(-60, -20), armF: A(-60, -20), legN: T(ankle), legF: single ? A(55, -40) : T(ankle), footN: footAng, footF: footAng };
  };
  const poses = toe ? [mk(84, foot), mk(84, foot - 32)] : [mk(48), mk(83)];
  const base = poses[0];
  const s = sk(base);
  const seatA = add(s.pelvis, mul(s.n, -14.5));
  const scene: Shape[] = [
    pad(add(seatA, mul(s.d, -8)), add(seatA, mul(s.d, 62))),
    pad([hip[0] - 18, hip[1] - 13], [hip[0] + 22, hip[1] - 13]),
    post([hip[0], 0], [hip[0], hip[1] - 16], 5),
    post(add(hip, mul(dir(rail), 30)), add(hip, mul(dir(rail), 150)), 4),
  ];
  return { view: "side", poses, scene, props: [{ k: "platform", at: single ? "footN" : "feet", ang: rail }] };
}

export function legExtension({ single = false }: { single?: boolean }): Motion {
  const base = seat({ torso: 100, hip: [0, 56] });
  const poses = [A(2, -84), A(4, -4)].map((l) => ({ ...base, legN: l, legF: single ? A(2, -84) : l }));
  const knee = sk(poses[0]).legN.mid;
  return { view: "side", poses, scene: [...seatSide(base.hip, -20, 34), ...backPad(base, 0, 50)], props: [{ k: "lever", pivot: knee, at: "shinFront" }, { k: "pad", at: "shinFront", r: 5.5 }] };
}

/** Flexora. kind: seated, lying, standing. */
export function legCurl({ kind = "seated", single = false }: { kind?: "seated" | "lying" | "standing"; single?: boolean }): Motion {
  if (kind === "lying") {
    const base: Pose = { hip: [0, 62], torso: 4, armN: A(-92, 0), armF: A(-92, 0), legN: A(180, 180), legF: A(180, 180), footN: 270, footF: 270 };
    const poses = [A(180, 180), A(178, 74)].map((l) => ({ ...base, legN: l, legF: single ? A(180, 180) : l }));
    const knee = sk(poses[0]).legN.mid;
    return { view: "side", poses, scene: flatBench(-60, 72, 52), props: [{ k: "lever", pivot: knee, at: "shinBack" }, { k: "pad", at: "shinBack", r: 5.5 }] };
  }
  if (kind === "standing") {
    const base = stand({ torso: 84, hip: [-2, 95], armN: A(-40, 10), armF: A(-40, 10) });
    const poses = [A(-92, -90), A(-80, 172)].map((l) => ({ ...base, legN: l }));
    const knee = sk(poses[0]).legN.mid;
    return { view: "side", poses, scene: [pad([20, 120], [20, 150]), post([24, 0], [24, 150])], props: [{ k: "lever", pivot: knee, at: "shinBack" }, { k: "pad", at: "shinBack", r: 5.5 }] };
  }
  const base = seat({ torso: 100, hip: [0, 56] });
  const poses = [A(2, -6), A(2, -96)].map((l) => ({ ...base, legN: l, legF: single ? A(2, -6) : l }));
  const knee = sk(poses[0]).legN.mid;
  return { view: "side", poses, scene: [...seatSide(base.hip, -20, 34), ...backPad(base, 0, 50)], props: [{ k: "pad", at: "thighTop", r: 6 }, { k: "lever", pivot: knee, at: "shinBack" }, { k: "pad", at: "shinBack", r: 5.5 }] };
}

/** Panturrilha. kind: standing (barra/smith), seated. */
export function calfRaise({ kind = "standing", eq = "smith" }: { kind?: "standing" | "seated"; eq?: Eq }): Motion {
  if (kind === "seated") {
    const mk = (up: number): Pose => ({ ...seat({ legN: T([40, ANK + up]), legF: T([40, ANK + up]) }), armN: A(-60, -30), armF: A(-60, -30), footN: up ? -32 : 0, footF: up ? -32 : 0 });
    return { view: "side", poses: [mk(0), mk(9)], scene: seatSide([0, 53]), props: [{ k: "pad", at: "kneeN", r: 7 }] };
  }
  const mk = (up: number): Pose => {
    const b = stand({ hip: [up * 0.6, 95 + up], legN: T([up * 0.6, ANK + up]), legF: T([up * 0.6, ANK + up]), footN: up ? -30 : 0, footF: up ? -30 : 0 });
    if (eq === "machine") return b;
    const w = at(b, (s) => add(add(s.neck, mul(s.n, -7)), mul(s.d, -3)));
    return { ...b, armN: T(w, 1), armF: T(w, 1) };
  };
  return { view: "side", poses: [mk(0), mk(9)], props: eq === "machine" ? [] : [{ k: "barbell", at: "traps" }], scene: eq === "smith" ? rails(-14) : [] };
}

/** Elevação de quadril com barra (ombros no banco) ou na máquina. */
export function hipThrust({ machine = false }: { machine?: boolean }): Motion {
  const S0: V = [-44, 52];
  const mk = (th: number): Pose => {
    const hip = add(S0, mul(dir(th), 46));
    const b: Pose = { hip, torso: th + 180, armN: HANG, armF: HANG, legN: T([42, ANK]), legF: T([42, ANK]) };
    const bar = at(b, (s) => add(s.pelvis, mul(s.n, 12)));
    return { ...b, armN: T(add(bar, [-4, -2])), armF: T(add(bar, [-4, -2])) };
  };
  return { view: "side", poses: [mk(-36), mk(-2)], scene: flatBench(-96, -38), props: machine ? [{ k: "lever", pivot: [-12, 12], at: "hip" }, { k: "pad", at: "hip", r: 7 }] : [{ k: "barbell", at: "hip" }] };
}

/** Cadeira abdutora/adutora (vista de frente). */
export function abduction({ adduct = false, lean = false }: { adduct?: boolean; lean?: boolean }): Motion {
  const base = fseat({ tfs: lean ? 0.75 : 1 });
  const shut = A(-97, -91, [0.12, 1]);
  const open: Limb = { to: [-30, ANK], bend: -1, fs: [0.4, 1] };
  const openA = A(204, -98, [0.42, 1]);
  void open;
  const seq = adduct ? [openA, shut] : [shut, openA];
  return { view: "front", sym: "legs", poses: seq.map((l) => ({ ...base, legN: l })), scene: fseatScene, props: [{ k: "pad", at: "kneeN", r: 6 }] };
}

// =====================================================================
// CORE
// =====================================================================

const HANDS_HEAD = R(-28, 128);
const CROSSED = R(-160, 150);

/** Abdominal. kind: floor, half, toes (mãos aos pés), decline, machine. */
export function crunch({ kind = "floor" }: { kind?: "floor" | "half" | "toes" | "decline" | "machine" | "situp" | "situpDecline" | "legsUp" }): Motion {
  if (kind === "machine") {
    const base = seat({ armN: R(150, 40), armF: R(150, 40) });
    return { view: "side", poses: [{ ...base, torso: 96 }, { ...base, torso: 58, arch: 36, head: -14 }], scene: seatSide(base.hip), props: [{ k: "lever", pivot: [-10, 128], at: "elbowN" }] };
  }
  if (kind === "decline" || kind === "situpDecline") {
    const hip: V = [0, 70];
    const base: Pose = { hip, torso: 200, armN: HANDS_HEAD, armF: HANDS_HEAD, legN: T([40, 46]), legF: T([40, 46]) };
    const end = kind === "decline" ? 158 : 108;
    return {
      view: "side",
      poses: [base, { ...base, torso: end, arch: kind === "decline" ? 40 : 22, head: -16 }],
      scene: [pad(add(hip, mul(dir(200), 62)), add(hip, [40, 14])), post([-30, 0], [-30, 56]), post([42, 0], [42, 82]), { k: "circle", c: [46, 50], r: 6, tone: "pad" }],
    };
  }
  const hip: V = [0, 15];
  const legsUp = kind === "toes" || kind === "legsUp";
  const legs: Pick<Pose, "legN" | "legF"> & Partial<Pose> = legsUp ? { legN: A(86, 86), legF: A(86, 86), footN: 0, footF: 0 } : { legN: T([42, ANK]), legF: T([42, ANK]) };
  const arms = kind === "toes" ? A(70, 72) : kind === "half" ? A(2, 2) : HANDS_HEAD;
  const base: Pose = { hip, torso: 180, armN: arms, armF: arms, ...legs };
  const end = kind === "situp" || kind === "legsUp" ? 112 : kind === "half" ? 160 : 146;
  const topArms = kind === "toes" ? A(76, 78) : kind === "half" ? A(-12, -12) : arms;
  // abdominal enrola a coluna (lombar no chão, escápulas sobem); sit-up sobe o tronco inteiro
  const curl = kind === "situp" || kind === "legsUp" ? 24 : 40;
  const top: Pose = { ...base, torso: end, arch: curl, head: -18, armN: topArms, armF: topArms };
  return { view: "side", poses: [base, top] };
}

/** Elevação de pernas. kind: hanging, full (até a barra), lying, incline (banco inclinado), tuck (sentado no banco). */
export function legRaise({ kind = "hanging", knees = false }: { kind?: "hanging" | "full" | "lying" | "incline" | "tuck"; knees?: boolean }): Motion {
  if (kind === "hanging" || kind === "full") {
    const base: Pose = { hip: [0, 118], torso: 90, armN: T([2, 211]), armF: T([2, 211]), legN: A(-92, -92), legF: A(-90, -90) };
    const top = kind === "full" ? { ...base, torso: 112, legN: A(78, 80), legF: A(80, 82) } : knees ? { ...base, legN: A(20, -70), legF: A(22, -68) } : { ...base, torso: 96, legN: A(6, 6), legF: A(8, 8) };
    return { view: "side", noFloor: true, poses: [base, top], scene: [post([-30, 217], [40, 217], 5)] };
  }
  if (kind === "tuck") {
    const base = seat({ torso: 120, armN: A(-120, -100), armF: A(-120, -100) });
    return { view: "side", poses: [{ ...base, legN: A(-6, -14), legF: A(-6, -14) }, { ...base, torso: 104, legN: A(50, -80), legF: A(50, -80) }], scene: seatSide(base.hip) };
  }
  if (kind === "incline") {
    const hip: V = [0, 60];
    const base: Pose = { hip, torso: 160, armN: A(150, 168), armF: A(150, 168), legN: A(-10, -60), legF: A(-10, -60) };
    return { view: "side", poses: [base, { ...base, hip: [-4, 66], legN: A(120, -10), legF: A(120, -10) }], scene: [pad(add(hip, [-74, 30]), add(hip, [30, -11])), post([-60, 0], [-60, 84]), post([24, 0], [24, 44])] };
  }
  const base: Pose = { hip: [0, 12], torso: 180, armN: A(-170, -175), armF: A(-170, -175), legN: A(2, 2), legF: A(2, 2), footN: 80, footF: 80 };
  return { view: "side", poses: [base, { ...base, legN: knees ? A(70, -10) : A(86, 86), legF: knees ? A(70, -10) : A(86, 86) }] };
}

export function plank({ elbow = false }: { elbow?: boolean }): Motion {
  const ankle: V = [0, 17];
  const b = elbow ? 6 : 16;
  const hip = add(ankle, mul(dir(b), 87));
  const S = add(hip, mul(dir(b), 46));
  const arms = elbow ? T([S[0] + 2, 6], -1) : T([S[0], 7]);
  const pose: Pose = { hip, torso: b, armN: arms, armF: arms, legN: T(ankle), legF: T(ankle), footN: -72, footF: -72 };
  return { view: "side", hold: true, poses: [pose] };
}

export function abWheel(): Motion {
  // joelhos fixos no chão; a coxa gira em torno do joelho
  const knee: V = [0, 6];
  const mk = (thigh: number, torso: number, wheelX: number): Pose => {
    const hip = add(knee, mul(dir(thigh + 180), 44));
    return { hip, torso, armN: T([wheelX, 18]), armF: T([wheelX, 18]), legN: A(thigh, 180), legF: A(thigh, 180), footN: 180, footF: 180 };
  };
  return { view: "side", poses: [mk(-92, 64, 30), mk(-140, 12, 116)], props: [{ k: "wheel", at: "hands" }] };
}

export function russianTwist({ feetUp = false }: { feetUp?: boolean }): Motion {
  const legs = feetUp
    ? { legN: A(112, -96, [0.6, 0.3]), legF: A(68, -84, [0.6, 0.3]) }
    : { legN: A(112, -98, [0.6, 0.62]), legF: A(68, -82, [0.6, 0.62]) };
  const base = fseat({ hip: [0, 14], tfs: 0.84, ...legs });
  // o tronco gira levando a anilha de um lado do quadril ao outro (de frente: ombros inclinam junto)
  const mk = (x: number): Pose => ({ ...base, torso: 90 - x * 0.22, armN: T([x, 30]), armF: T([x * 1.04, 30]) });
  return { view: "front", legsFront: true, tempo: 1.1, poses: [mk(-40), mk(0), mk(40)], props: [{ k: "plate", at: "hands", r: 10 }] };
}

// =====================================================================
// CARDIO (ciclo contínuo)
// =====================================================================

/** Braços balançando ao caminhar/correr: `k` = 1 (braço à frente) … -1 (atrás). */
const swing = (k: number, run: boolean): Limb => (run ? A(-90 + 34 * k, 2 + 40 * k) : A(-90 + 22 * k, -78 + 30 * k));

/** Esteira (ou correr parado, `belt: false`). incline: graus da esteira. */
export function walk({ run = false, incline = 0, belt = true }: { run?: boolean; incline?: number; belt?: boolean }): Motion {
  const slope = Math.tan((incline * Math.PI) / 180);
  // esteira inclinada: o fundo da esteira fica acima do chão
  const h = belt ? 12 + 62 * slope : 0;
  const ground = (x: number) => h + x * slope;
  const hipY = run ? 90 : 94;
  const stride = run ? 30 : 24;
  const lift = run ? 34 : 12;
  const torso = run ? 82 : 88 - incline * 0.4;
  const foot = (x: number, up = 0): Limb => T([x, ground(x) + ANK + up]);
  // contato (N à frente) → passagem (F no ar) → contato (F à frente) → passagem (N no ar)
  const poses: Pose[] = [
    stand({ hip: [0, hipY], torso, legN: foot(stride), legF: foot(-stride, 4), footF: -30, armN: swing(-1, run), armF: swing(1, run) }),
    stand({ hip: [0, hipY + 2], torso, legN: foot(2), legF: foot(-4, lift), footF: -20, armN: swing(0, run), armF: swing(0, run) }),
    stand({ hip: [0, hipY], torso, legN: foot(-stride, 4), legF: foot(stride), footN: -30, armN: swing(1, run), armF: swing(-1, run) }),
    stand({ hip: [0, hipY + 2], torso, legN: foot(-4, lift), legF: foot(2), footN: -20, armN: swing(0, run), armF: swing(0, run) }),
  ];
  const scene: Shape[] = belt
    ? [
        { k: "line", a: [-62, ground(-62) - 6], b: [62, ground(62) - 6], w: 12, tone: "bench" },
        post([56, ground(56)], [66, 112], 5),
        post([66, 112], [40, 110], 4),
      ]
    : [];
  return { view: "side", loop: run ? 0.75 : 1.1, poses, scene };
}

/** Bicicleta ergométrica: pedal girando (pé do lado de lá meia volta defasado). */
export function bike(): Motion {
  const crank: V = [24, 30];
  const r = 17;
  const pedal = (deg: number): V => add(crank, mul(dir(deg), r));
  const bar: V = [52, 104];
  const mk = (deg: number): Pose => ({
    hip: [0, 92],
    torso: 66,
    head: 14,
    armN: T(bar, -1),
    armF: T(bar, -1),
    legN: T(add(pedal(deg), [0, 4]), 1),
    legF: T(add(pedal(deg + 180), [0, 4]), 1),
    footN: -10,
    footF: -10,
  });
  const scene: Shape[] = [
    post([-24, 2], [70, 2], 5),
    post([4, 80], [crank[0], crank[1]], 5),
    pad([-10, 84], [14, 84], 7),
    post([crank[0], crank[1]], [54, 4], 5),
    post([46, 30], [56, 98], 5),
    post([56, 98], [bar[0], bar[1]], 4),
    { k: "circle", c: crank, r: r + 2, tone: "metal" },
  ];
  return { view: "side", loop: 1, poses: [0, 90, 180, 270].map((d) => mk(-d)), scene };
}

/** Escada (ClimbMill / StairMaster): um degrau por passada. */
export function stairs(): Motion {
  const rise = 20;
  const step = (i: number): V => [i * 24 - 8, i * rise];
  const foot = (i: number, up = 0): Limb => T(add(step(i), [6, ANK + up]));
  const poses: Pose[] = [
    stand({ hip: [4, 98 + rise], torso: 80, legN: foot(1), legF: foot(0), armN: A(-40, -10), armF: A(-40, -10) }),
    stand({ hip: [10, 104 + rise], torso: 80, legN: foot(1), legF: foot(1, 22), armN: A(-40, -10), armF: A(-40, -10) }),
    stand({ hip: [4, 98 + rise], torso: 80, legN: foot(0), legF: foot(1), armN: A(-40, -10), armF: A(-40, -10) }),
    stand({ hip: [10, 104 + rise], torso: 80, legN: foot(1, 22), legF: foot(1), armN: A(-40, -10), armF: A(-40, -10) }),
  ];
  const stairsPoly: Shape = { k: "poly", pts: [[-30, 0], [-30, 0], [-8, 0], [-8, rise], [16, rise], [16, 2 * rise], [40, 2 * rise], [40, 0]], tone: "bench" };
  return { view: "side", loop: 1.3, poses, scene: [stairsPoly, post([52, 0], [52, 132], 5), post([52, 132], [30, 130], 4)] };
}

// =====================================================================
// MOBILIDADE / ALONGAMENTO (devagar ou parado, respirando)
// =====================================================================

const quad = (o: Partial<Pose> = {}): Pose => {
  // quatro apoios: joelhos sob o quadril, mãos sob os ombros
  const hip: V = [0, 50];
  const p: Pose = { hip, torso: 0, armN: HANG, armF: HANG, legN: A(-90, 180), legF: A(-90, 180), footN: 180, footF: 180, ...o };
  const S = at(p, (s) => s.shoulder);
  return { ...p, armN: T([S[0], 6]), armF: T([S[0], 6]), ...o };
};

export function catCow(): Motion {
  // gato: costas arredondadas para cima, cabeça para baixo; vaca: barriga desce, peito e olhar para a frente
  return { view: "side", tempo: 1.6, poses: [quad({ torso: 12, arch: 84, head: -44 }), quad({ torso: 12, arch: -62, head: 36 })] };
}

export function threadNeedle(): Motion {
  const base = quad({ torso: 4 });
  // braço passa por baixo do corpo (aponta para trás, baixo) e abre para cima
  return { view: "side", tempo: 1.5, poses: [{ ...base, armN: A(190, 192), head: -20 }, { ...base, armN: A(100, 96), head: 30 }] };
}

export function childPose(): Motion {
  const hip: V = [0, 24];
  const S = add(hip, mul(dir(12), 46));
  const pose: Pose = { hip, torso: 12, head: -12, armN: T([S[0] + 48, 7]), armF: T([S[0] + 48, 7]), legN: T([-4, ANK], 1), legF: T([-4, ANK], 1), footN: 180, footF: 180 };
  return { view: "side", hold: true, poses: [pose] };
}

export function cobra(): Motion {
  const hip: V = [0, 11];
  const mk = (t: number): Pose => {
    const S = add(hip, mul(dir(t), 46));
    return { hip, torso: t, arch: t > 20 ? -30 : 0, head: t > 20 ? 14 : 0, armN: T([S[0] - 2, 6]), armF: T([S[0] - 2, 6]), legN: A(180, 180), legF: A(180, 180), footN: 180, footF: 180 };
  };
  return { view: "side", tempo: 1.6, poses: [mk(8), mk(36)] };
}

/** Afundo ajoelhado (flexor do quadril): `reach` = braços para cima; `forward` = joelho da frente avança (tornozelo). */
export function kneelingLunge({ reach = false, forward = false }: { reach?: boolean; forward?: boolean }): Motion {
  const mk = (dx: number): Pose => ({
    hip: [dx, 50],
    torso: 92,
    armN: reach ? A(98, 96) : A(-80, -20),
    armF: reach ? A(98, 96) : A(-80, -20),
    legN: T([40, ANK], 1),
    legF: A(-120 + dx * 0.8, 180),
    footF: 180,
  });
  // tornozelo: o joelho da frente avança até encostar na parede, calcanhar no chão
  const scene: Shape[] = forward ? [post([74, 0], [74, 150], 8)] : [];
  return { view: "side", tempo: 1.6, poses: [mk(0), mk(forward ? 16 : 8)], scene };
}

export function worldsGreatest(): Motion {
  const base: Pose = { hip: [0, 46], torso: 38, armN: T([48, 7]), armF: T([48, 7]), legN: T([46, ANK], 1), legF: A(-150, 180), footF: 180 };
  return { view: "side", tempo: 1.6, poses: [base, { ...base, torso: 44, armN: A(100, 100), head: 30 }] };
}

export function deepSquatHold(): Motion {
  const p = stand({ hip: [-14, 40], torso: 74, legN: T([8, ANK]), legF: T([8, ANK]) });
  const w = at(p, (s) => add(add(s.shoulder, mul(s.n, 16)), mul(s.d, -14)));
  return { view: "side", hold: true, poses: [{ ...p, armN: T(w, -1), armF: T(w, -1) }] };
}

export function hamstringStretch({ seated = false }: { seated?: boolean }): Motion {
  if (seated) {
    const pose: Pose = { hip: [0, 12], torso: 34, head: -10, armN: T([78, 14]), armF: T([78, 14]), legN: A(0, 0), legF: A(0, 0), footN: 90, footF: 90 };
    return { view: "side", hold: true, poses: [pose] };
  }
  const pose: Pose = { ...stand({ hip: [-10, 94], torso: 28, head: -10 }), armN: T([6, 38]), armF: T([6, 38]) };
  return { view: "side", hold: true, poses: [pose] };
}

export function quadStretch(): Motion {
  // perna de perto dobrada para trás, calcanhar no glúteo, a mão do mesmo lado segura o tornozelo; joelhos juntos
  const p = stand({ legN: A(-112, 82), footN: 100, armF: A(-60, -10) });
  const ankle = at(p, (s) => s.legN.end);
  return { view: "side", tempo: 2, poses: [{ ...p, armN: T(add(ankle, [-2, 1]), -1) }, { ...p, legN: A(-120, 76), armN: T(add(at({ ...p, legN: A(-120, 76) }, (s) => s.legN.end), [-2, 1]), -1) }] };
}

export function calfStretch(): Motion {
  const pose: Pose = { hip: [0, 88], torso: 72, armN: T([62, 128]), armF: T([62, 128]), legN: T([28, ANK], 1), legF: T([-48, ANK]), footF: 0 };
  return { view: "side", hold: true, poses: [pose], scene: [post([70, 0], [70, 190], 8)] };
}

export function chestStretch(): Motion {
  const pose = stand({ torso: 84, armN: A(176, 98), armF: A(-90, -90) });
  return { view: "side", hold: true, poses: [pose], scene: [post([-34, 0], [-34, 200], 8)] };
}

export function crossBodyStretch(): Motion {
  const base = fstand();
  const s = sk(base, "front");
  const y = s.shoulder[1] - 6;
  return { view: "front", hold: true, poses: [{ ...base, armN: T([30, y]), armF: T([4, y - 2], -1) }] };
}

export function tricepsStretch(): Motion {
  const base = fstand();
  const p: Pose = { ...base, armN: A(100, -82) };
  const elbow = at(p, (s) => s.armN.mid, "front");
  return { view: "front", hold: true, poses: [{ ...p, head: -8, armF: T(add(elbow, [4, 2]), -1) }] };
}

/** Braços de baixo para cima (bastão/elástico, ou deslizando na parede). */
export function armsOverhead({ kind = "dislocate" }: { kind?: "dislocate" | "wall" | "circles" | "floor" | "dumbbells" }): Motion {
  const base = fstand();
  if (kind === "floor") {
    // Floor Slides: o Wall Slides deitado de barriga para cima, visto de cima (cabeça no alto), sobre o colchonete
    const mat: Shape = { k: "poly", pts: [[-60, -6], [-60, 196], [60, 196], [60, -6]], tone: "pad" };
    return { view: "front", sym: "arms", noFloor: true, tempo: 1.4, scene: [mat], poses: [{ ...base, armN: A(196, 100) }, { ...base, armN: A(118, 108) }] };
  }
  if (kind === "dumbbells") {
    // aquecimento de ombros com halteres leves: dos lados do corpo até acima da cabeça e de volta
    const down = A(266, 268);
    const side = A(182, 190);
    const up = A(116, 112);
    return { view: "front", sym: true, tempo: 1.2, poses: [down, side, up, side].map((a) => ({ ...base, armN: a })), props: eqProps("dumbbell") };
  }
  if (kind === "circles") {
    // braços abertos na altura dos ombros desenhando círculos pequenos (de frente: sobe, vem para perto, desce, vai para trás)
    const c = (a: number, fs: number): Pose => ({ ...base, armN: A(a, a, [fs, fs]) });
    return { view: "front", sym: "arms", loop: 1.2, poses: [c(166, 1), c(180, 0.9), c(194, 1), c(180, 1)] };
  }
  if (kind === "wall") return { view: "front", sym: "arms", tempo: 1.4, poses: [{ ...base, armN: A(196, 100) }, { ...base, armN: A(118, 108) }] };
  return { view: "front", sym: "arms", tempo: 1.4, poses: [{ ...base, armN: A(-112, -112) }, { ...base, armN: A(124, 124) }] };
}

export function jumpingJacks(): Motion {
  const closed = fstand();
  const open: Pose = { ...fstand({ hip: [0, 96], legN: T([-30, ANK]) }), armN: A(124, 112) };
  return { view: "front", sym: true, tempo: 0.45, poses: [closed, open] };
}

export function deadHang(): Motion {
  const pose: Pose = { hip: [0, 118], torso: 90, armN: T([2, 211]), armF: T([2, 211]), legN: A(-92, -92), legF: A(-90, -90) };
  return { view: "side", noFloor: true, hold: true, poses: [pose], scene: [post([-30, 217], [40, 217], 5)] };
}

/** Sentado no chão, de frente: borboleta (solas juntas) ou 90/90 (joelhos tombando de um lado para o outro). */
export function floorHips({ kind = "butterfly" }: { kind?: "butterfly" | "ninety" }): Motion {
  const base = fseat({ hip: [0, 16] });
  if (kind === "butterfly") {
    const mk = (k: number): Pose => ({ ...base, legN: A(184 + k, 4 - k / 2), armN: T([-4, 16]), armF: T([4, 16]) });
    return { view: "front", sym: "legs", tempo: 1.2, poses: [mk(0), mk(8)] };
  }
  // 90/90: perna da frente com a canela deitada à frente do corpo, perna de trás aberta com a canela para trás;
  // os joelhos sobem juntos (pelo meio) e tombam para o outro lado, como limpador de para-brisa
  const b = { ...base, hip: [0, 22] as V, armN: A(-120, -100), armF: A(-60, -80) };
  const left: Pose = { ...b, legN: A(210, 0, [0.6, 0.9]), legF: A(-18, -30, [0.9, 0.4]) };
  const right: Pose = { ...b, legF: A(-30, -180, [0.6, 0.9]), legN: A(198, -150, [0.9, 0.4]) };
  const mid: Pose = { ...b, legN: A(118, -80, [0.6, 0.6]), legF: A(62, -100, [0.6, 0.6]) };
  return { view: "front", legsFront: true, tempo: 2.2, poses: [left, mid, right] };
}

/**
 * Deitado de costas, visto de cima (cabeça no alto da tela): o tornozelo de uma perna apoia no joelho da outra
 * (forma de "4"); as mãos puxam a perna de apoio em direção ao peito.
 */
export function figureFour(): Motion {
  const mk = (support: Limb, crossed: Limb): Pose => {
    const p: Pose = { hip: [0, 80], torso: 90, armN: HANG, armF: HANG, legN: crossed, legF: support };
    const knee = at(p, (s) => s.legF.mid, "front");
    return { ...p, armN: T(add(knee, [-4, 4]), 1), armF: T(add(knee, [4, 4]), -1) };
  };
  const mat: Shape = { k: "poly", pts: [[-46, -10], [-46, 160], [46, 160], [46, -10]], tone: "pad" };
  return {
    view: "front",
    noFloor: true,
    tempo: 1.8,
    scene: [mat],
    poses: [mk(A(-88, -92, [0.55, 0.5]), A(-150, 4, [0.85, 1])), mk(A(-90, -90, [0.14, 1]), A(-158, -8, [0.8, 1]))],
  };
}

// =====================================================================
// PILATES — SOLO (colchonete). Deitado de costas: cabeça à esquerda (tronco 180).
// =====================================================================

const MAT: Shape[] = [{ k: "line", a: [-100, 1.5], b: [110, 1.5], w: 3, tone: "pad" }];
const sup = (o: Partial<Pose> = {}): Pose => ({ hip: [0, 12], torso: 180, armN: A(-178, -178), armF: A(-178, -178), legN: A(0, 0), legF: A(0, 0), footN: 80, footF: 80, ...o });
const prone = (o: Partial<Pose> = {}): Pose => ({ hip: [0, 11], torso: 4, armN: A(2, 2), armF: A(2, 2), legN: A(180, 180), legF: A(180, 180), footN: 180, footF: 180, ...o });

export function hundred(): Motion {
  const base = sup({ torso: 158, arch: 30, head: -22, legN: A(40, 40), legF: A(40, 40), footN: 40, footF: 40 });
  return { view: "side", tempo: 0.35, scene: MAT, poses: [{ ...base, armN: A(-4, -4), armF: A(-4, -4) }, { ...base, armN: A(8, 8), armF: A(8, 8) }] };
}

export function rollUp(): Motion {
  return {
    view: "side",
    tempo: 1.8,
    scene: MAT,
    // sobe vértebra por vértebra (coluna enrolada) e alcança os pés
    poses: [sup({ armN: A(178, 178), armF: A(178, 178) }), sup({ torso: 136, arch: 46, head: -26, armN: A(70, 64), armF: A(70, 64) }), sup({ torso: 56, arch: 58, head: -20, armN: A(4, 4), armF: A(4, 4) })],
  };
}

export function legCircles(): Motion {
  const base = sup({ armN: A(-176, -176), armF: A(-176, -176) });
  return { view: "side", loop: 2.4, scene: MAT, poses: [80, 60, 80, 104].map((a) => ({ ...base, legN: A(a, a), footN: a })) };
}

export function rollingBall(): Motion {
  // bola: coluna enrolada, mãos nas canelas; rola para trás até as escápulas e volta a equilibrar sentado
  const tuck = (hip: V, torso: number): Pose => ({ hip, torso, arch: 50, head: -24, legN: A(torso - 62, torso - 214), legF: A(torso - 62, torso - 214), armN: A(torso - 104, torso - 50), armF: A(torso - 104, torso - 50), footN: torso - 120, footF: torso - 120 });
  return { view: "side", tempo: 0.9, scene: MAT, poses: [tuck([0, 16], 112), tuck([-6, 26], 150), tuck([-14, 42], 186)] };
}

export function singleLegStretch(): Motion {
  const base = sup({ torso: 158, arch: 30, head: -22, armN: A(30, 10), armF: A(30, 10) });
  const a: Pose = { ...base, legN: A(108, -10), legF: A(24, 24), footN: 0, footF: 24 };
  const b: Pose = { ...base, legN: A(24, 24), legF: A(108, -10), footN: 24, footF: 0 };
  return { view: "side", loop: 1.4, scene: MAT, poses: [a, b] };
}

export function doubleLegStretch(): Motion {
  const tuckP = sup({ torso: 156, arch: 32, head: -22, legN: A(108, -10), legF: A(108, -10), armN: A(30, 10), armF: A(30, 10), footN: 0, footF: 0 });
  const open = sup({ torso: 160, arch: 24, head: -20, legN: A(32, 32), legF: A(32, 32), armN: A(168, 168), armF: A(168, 168), footN: 32, footF: 32 });
  return { view: "side", tempo: 1.2, scene: MAT, poses: [tuckP, open] };
}

export function teaser(): Motion {
  const v: Pose = { hip: [0, 12], torso: 56, head: -6, legN: A(42, 42), legF: A(42, 42), armN: A(40, 40), armF: A(40, 40), footN: 42, footF: 42 };
  return { view: "side", tempo: 1.6, scene: MAT, poses: [sup({ armN: A(178, 178), armF: A(178, 178) }), v] };
}

export function shoulderBridge(): Motion {
  const bridge: Pose = { hip: [0, 40], torso: 212, armN: A(-170, -176), armF: A(-170, -176), legN: T([40, ANK], 1), legF: T([40, ANK], 1) };
  return { view: "side", tempo: 1.3, scene: MAT, poses: [bridge, { ...bridge, legF: A(78, 78), footF: 78 }] };
}

export function swan(): Motion {
  const mk = (t: number): Pose => {
    const S = add([0, 11], mul(dir(t), 46));
    return prone({ torso: t, arch: t > 20 ? -30 : 0, head: t > 20 ? 16 : 0, armN: T([S[0] + 6, 6], 1), armF: T([S[0] + 6, 6], 1) });
  };
  return { view: "side", tempo: 1.4, scene: MAT, poses: [mk(6), mk(46)] };
}

export function singleLegKick(): Motion {
  const base = prone({ hip: [0, 12], torso: 22, head: 6, armN: A(-80, 4), armF: A(-80, 4) });
  return { view: "side", loop: 1.6, scene: MAT, poses: [{ ...base, legN: A(180, 62), footN: 62 }, base, { ...base, legF: A(180, 62), footF: 62 }, base] };
}

export function swimming(): Motion {
  // de bruços, peito e pernas fora do chão: braço e perna opostos sobem e descem rápido
  const base = prone({ hip: [0, 13], torso: 8, arch: -14, head: 14, armN: A(10, 10), armF: A(10, 10), legN: A(174, 174), legF: A(174, 174) });
  return { view: "side", loop: 0.9, scene: MAT, poses: [{ ...base, armN: A(28, 28), armF: A(0, 0), legF: A(162, 162), legN: A(182, 182) }, { ...base, armF: A(28, 28), armN: A(0, 0), legN: A(162, 162), legF: A(182, 182) }] };
}

/** Deitado de lado, visto de cima: a perna de cima vai à frente e atrás. */
export function sideKick(): Motion {
  // visto de cima: corpo deitado de lado sobre o colchonete, cabeça apoiada na mão; a perna de cima chuta à frente e vai atrás
  const base: Pose = { hip: [0, 40], torso: 182, head: 0, armN: A(120, 10), armF: A(150, 60), legN: A(-4, -4), legF: A(-6, -6), footN: 80, footF: 80 };
  const mat: Shape = { k: "poly", pts: [[-90, 12], [-90, 68], [110, 68], [110, 12]], tone: "pad" };
  return { view: "side", noFloor: true, tempo: 0.9, scene: [mat], poses: [{ ...base, legN: A(-26, -26), footN: 60 }, { ...base, legN: A(44, 44), footN: 120 }] };
}

export function legPullFront(): Motion {
  const p = plank({}).poses[0];
  return { view: "side", tempo: 1.1, scene: MAT, poses: [p, { ...p, legF: A(178, 178), footF: 178 }] };
}

export function spineStretch({ saw = false }: { saw?: boolean }): Motion {
  const sit: Pose = { hip: [0, 12], torso: 88, armN: A(4, 4), armF: A(4, 4), legN: A(0, 0), legF: A(0, 0), footN: 90, footF: 90 };
  const fold: Pose = saw ? { ...sit, torso: 50, arch: 40, head: -14, armN: A(-6, -8), armF: A(150, 150) } : { ...sit, torso: 50, arch: 52, head: -18, armN: A(-6, -8), armF: A(-6, -8) };
  return { view: "side", tempo: 1.6, scene: MAT, poses: [sit, fold] };
}

/** Sereia: sentado de lado, inclinação lateral com o braço por cima (vista de frente). */
export function mermaid(): Motion {
  // sentado de lado (pernas dobradas para a esquerda da tela): o braço do lado das pernas sobe e passa por cima da cabeça,
  // o tronco inclina para o outro lado; a outra mão desliza no chão
  const base = fseat({ hip: [0, 16], legN: A(196, -10, [0.8, 0.8]), legF: A(200, -6, [0.6, 0.6]) });
  const up: Pose = { ...base, armN: A(94, 92), armF: A(-76, -84) };
  const over: Pose = { ...base, torso: 62, hip: [2, 16], head: -10, armN: A(36, 22), armF: T([46, 8], -1) };
  return { view: "front", legsFront: true, tempo: 1.8, poses: [{ ...base, armN: A(-110, -100), armF: A(-76, -84) }, up, over] };
}

// =====================================================================
// PILATES — APARELHOS (desenho próprio: Reformer, Cadillac, Chair)
// =====================================================================

const RAIL = 26;
const BAR: V = [96, 62];
/** Reformer: trilhos, molas, barra dos pés e as polias das alças (lado da cabeça). */
const reformer: Shape[] = [
  post([-100, RAIL - 6], [116, RAIL - 6], 6),
  post([-100, 0], [-100, RAIL], 5),
  post([116, 0], [116, RAIL], 5),
  post([108, RAIL], [BAR[0], BAR[1]], 4),
  { k: "circle", c: BAR, r: 3.5, tone: "metal" },
  post([-104, RAIL], [-104, 74], 4),
  { k: "circle", c: [-104, 74], r: 4, tone: "dark" },
];
const PULLEY: V = [-104, 74];
/** carrinho sob o tronco (deitado de costas, cabeça à esquerda) */
const ON_CARRIAGE: Prop = { k: "carriage", at: "hip", y: RAIL + 4, w: 64, dx: -22 };

export function reformerFootwork(): Motion {
  const mk = (x: number): Pose => ({ hip: [x, RAIL + 12], torso: 180, armN: A(-6, -6), armF: A(-6, -6), legN: T([BAR[0] - 6, BAR[1] + 2], 1), legF: T([BAR[0] - 6, BAR[1] + 2], 1), footN: 70, footF: 70 });
  return { view: "side", tempo: 1.2, poses: [mk(40), mk(12)], scene: reformer, props: [ON_CARRIAGE] };
}

export function reformerHundred(): Motion {
  const base: Pose = { hip: [10, RAIL + 12], torso: 158, head: -22, legN: A(40, 40), legF: A(40, 40), footN: 40, footF: 40, armN: A(-4, -4), armF: A(-4, -4) };
  return { view: "side", tempo: 0.35, poses: [base, { ...base, armN: A(8, 8), armF: A(8, 8) }], scene: reformer, props: [ON_CARRIAGE, { k: "cable", from: PULLEY, at: "hands" }] };
}

export function feetInStraps(): Motion {
  const base: Pose = { hip: [10, RAIL + 12], torso: 180, armN: A(-6, -6), armF: A(-6, -6), legN: A(60, 60), legF: A(60, 60), footN: 60, footF: 60 };
  const frog: Pose = { ...base, legN: A(96, -20), legF: A(96, -20), footN: -20, footF: -20 };
  return { view: "side", tempo: 1.3, poses: [frog, { ...base, legN: A(38, 38), legF: A(38, 38), footN: 38, footF: 38 }], scene: reformer, props: [ON_CARRIAGE, { k: "cable", from: [116, 110], at: "feet" }] };
}

/** Prancha com as mãos na barra; o carrinho (pés) vai para trás e volta. */
export function longStretch(): Motion {
  const mk = (ax: number, b: number): Pose => {
    const ankle: V = [ax, RAIL + 12];
    const hip = add(ankle, mul(dir(b), 87));
    return { hip, torso: b, armN: T(BAR), armF: T(BAR), legN: T(ankle), legF: T(ankle), footN: -60, footF: -60 };
  };
  return { view: "side", tempo: 1.4, poses: [mk(-42, 13), mk(-62, 10)], scene: reformer, props: [{ k: "carriage", at: "feet", y: RAIL + 4, w: 64, dx: 10 }] };
}

export function elephant(): Motion {
  const mk = (fx: number, hip: V): Pose => ({ hip, torso: -46, head: -30, armN: T(BAR), armF: T(BAR), legN: T([fx, RAIL + 12]), legF: T([fx, RAIL + 12]) });
  return { view: "side", tempo: 1.4, poses: [mk(12, [40, 118]), mk(-10, [30, 112])], scene: reformer, props: [{ k: "carriage", at: "feet", y: RAIL + 4, w: 64, dx: 0 }] };
}

export function kneeStretch(): Motion {
  const mk = (hx: number, thigh: number): Pose => ({ hip: [hx, 66], torso: 12, head: -20, armN: T(BAR), armF: T(BAR), legN: A(thigh, 180), legF: A(thigh, 180), footN: 150, footF: 150 });
  return { view: "side", tempo: 1, poses: [mk(32, -96), mk(22, -122)], scene: reformer, props: [{ k: "carriage", at: "kneeN", y: RAIL + 4, w: 64, dx: -14 }] };
}

const TABLE_Y = 58;
/** Cadillac: mesa alta com estrutura de barras em cima. */
const cadillac: Shape[] = [
  { k: "line", a: [-100, TABLE_Y - 4], b: [112, TABLE_Y - 4], w: 8, tone: "bench" },
  post([-100, 0], [-100, 212], 4),
  post([112, 0], [112, 212], 4),
  post([-100, 212], [112, 212], 4),
];

export function rollDownBar(): Motion {
  const sit: Pose = { hip: [0, TABLE_Y + 10], torso: 88, armN: A(4, 4), armF: A(4, 4), legN: A(0, 0), legF: A(0, 0), footN: 90, footF: 90 };
  return {
    view: "side",
    tempo: 1.6,
    poses: [sit, { ...sit, torso: 138, head: -22, armN: A(16, 16), armF: A(16, 16) }],
    scene: cadillac,
    props: [{ k: "cable", from: [112, 150], at: "hands" }, { k: "handle", at: "hands" }],
  };
}

export function pushThrough(): Motion {
  const sit: Pose = { hip: [0, TABLE_Y + 10], torso: 92, armN: A(86, 86), armF: A(86, 86), legN: A(0, 0), legF: A(0, 0), footN: 90, footF: 90 };
  return {
    view: "side",
    tempo: 1.6,
    poses: [sit, { ...sit, torso: 42, head: -16, armN: A(30, 30), armF: A(30, 30) }],
    scene: cadillac,
    props: [{ k: "lever", pivot: [112, 212], at: "hands" }],
  };
}

export function legSprings(): Motion {
  const base: Pose = { hip: [0, TABLE_Y + 8], torso: 180, armN: A(-176, -176), armF: A(-176, -176), legN: A(84, 84), legF: A(84, 84), footN: 84, footF: 84 };
  return { view: "side", tempo: 1.3, poses: [base, { ...base, legN: A(14, 14), legF: A(14, 14), footN: 14, footF: 14 }], scene: cadillac, props: [{ k: "cable", from: [112, 200], at: "feet" }] };
}

const CHAIR_Y = 62;
const PEDAL_PIVOT: V = [26, 16];
/** Chair (Wunda): caixa com pedal na frente. */
const chair: Shape[] = [{ k: "poly", pts: [[-26, 0], [-26, CHAIR_Y], [26, CHAIR_Y], [26, 0]], tone: "bench" }];

export function chairFootwork(): Motion {
  const mk = (foot: V): Pose => ({ hip: [-4, CHAIR_Y + 10], torso: 92, armN: A(-100, -80), armF: A(-100, -80), legN: T(foot, 1), legF: T(foot, 1), footN: -20, footF: -20 });
  return { view: "side", tempo: 1.1, poses: [mk([52, 46]), mk([58, 22])], scene: chair, props: [{ k: "lever", pivot: PEDAL_PIVOT, at: "feet" }] };
}

/** Em pé de frente para a chair (pedal do lado de cá), um pé no pedal. */
export function chairStandingPump(): Motion {
  const pivot: V = [62, 16];
  const scene: Shape[] = [{ k: "poly", pts: [[62, 0], [62, CHAIR_Y], [114, CHAIR_Y], [114, 0]], tone: "bench" }];
  const mk = (foot: V): Pose => stand({ hip: [0, 95], torso: 84, legF: T([0, ANK]), legN: T(foot, 1), footN: -10, armN: A(-60, -10), armF: A(-60, -10) });
  return { view: "side", tempo: 1.1, poses: [mk([34, 46]), mk([30, 24])], scene, props: [{ k: "lever", pivot, at: "footN" }] };
}

/** Subida no banco/chair: um pé em cima, sobe até ficar em pé e desce. */
export function stepUp({ h = CHAIR_Y, scene = chair }: { h?: number; scene?: Shape[] } = {}): Motion {
  const low = stand({ hip: [-14, 92], torso: 80, legN: T([6, h + ANK], 1), legF: T([-30, ANK]), armN: A(-60, -30), armF: A(-110, -90) });
  const high = stand({ hip: [2, h + 92], torso: 88, legN: T([6, h + ANK]), legF: A(-80, -100), footF: -40, armN: A(-110, -90), armF: A(-60, -30) });
  return { view: "side", tempo: 1.2, poses: [low, high], scene };
}

// =====================================================================
// FUNCIONAL
// =====================================================================

export function kettlebellSwing(): Motion {
  const hinge: Pose = { ...stand({ hip: [-22, 80], torso: 40, head: 10 }), armN: T([4, 44]), armF: T([4, 44]) };
  const top: Pose = { ...stand({ torso: 90 }), armN: A(-4, -4), armF: A(-4, -4) };
  return { view: "side", tempo: 0.8, poses: [hinge, top], props: [{ k: "kettlebell", at: "hands" }] };
}

export function burpee(): Motion {
  const up = stand();
  const crouch: Pose = { ...stand({ hip: [-12, 42], torso: 60, legN: T([6, ANK]), legF: T([6, ANK]) }), armN: T([38, 6]), armF: T([38, 6]) };
  const pl = plank({}).poses[0];
  const plankP: Pose = { ...pl, hip: add(pl.hip, [-40, 0]), armN: T([pl.hip[0] + 4, 7]), armF: T([pl.hip[0] + 4, 7]), legN: T([-40, 17]), legF: T([-40, 17]) };
  // no meio do pulo para a prancha o quadril sobe um pouco (os joelhos não raspam o chão)
  const mid = lerpPose(crouch, plankP, 0.5);
  const kick: Pose = { ...mid, hip: [mid.hip[0], mid.hip[1] + 14] };
  return { view: "side", tempo: 1.2, poses: [up, crouch, kick, plankP] };
}

export function mountainClimbers(): Motion {
  // quadril um pouco alto (como no exercício de verdade): o joelho passa por baixo do corpo sem tocar o chão
  const b = 36;
  const hip = add([0, 17] as V, mul(dir(b), 87));
  const hand: V = [add(hip, mul(dir(b), 46))[0], 7];
  const drive = A(322, 196);
  const back = A(216, 216);
  const base: Pose = { hip, torso: b, armN: T(hand), armF: T(hand), legN: back, legF: back, footN: -72, footF: -72 };
  const mid = A(270, 190);
  const cross: Pose = { ...base, legN: mid, legF: mid, footN: -40, footF: -40 };
  return { view: "side", loop: 0.9, poses: [{ ...base, legN: drive, footN: 10 }, cross, { ...base, legF: drive, footF: 10 }, cross] };
}

export function jumpSquat(): Motion {
  const bottom = stand({ hip: [-20, 52], torso: 56, legN: T([0, ANK]), legF: T([0, ANK]), armN: A(-120, -110), armF: A(-120, -110) });
  const air = stand({ hip: [0, 114], torso: 90, legN: T([2, ANK + 18]), legF: T([2, ANK + 18]), footN: -40, footF: -40, armN: A(110, 100), armF: A(110, 100) });
  return { view: "side", tempo: 0.7, poses: [bottom, air] };
}

export function boxJump(): Motion {
  const box: Shape[] = [{ k: "poly", pts: [[44, 0], [44, 50], [96, 50], [96, 0]], tone: "bench" }];
  const squatP = stand({ hip: [-20, 54], torso: 58, legN: T([0, ANK]), legF: T([0, ANK]), armN: A(-130, -120), armF: A(-130, -120) });
  const air = stand({ hip: [40, 128], torso: 80, legN: A(-20, -120), legF: A(-20, -120), armN: A(60, 60), armF: A(60, 60) });
  const land = stand({ hip: [58, 50 + 70], torso: 66, legN: T([70, 50 + ANK]), legF: T([70, 50 + ANK]), armN: A(-30, -10), armF: A(-30, -10) });
  return { view: "side", tempo: 1.1, poses: [squatP, air, land], scene: box };
}

export function farmersWalk(): Motion {
  const w = walk({ belt: false });
  return { ...w, poses: w.poses.map((p) => ({ ...p, armN: HANG, armF: HANG })), props: eqProps("dumbbell") };
}

export function battleRope(): Motion {
  const base = stand({ hip: [-6, 78], torso: 82, legN: T([16, ANK]), legF: T([-10, ANK]) });
  const up = A(-20, 10);
  const down = A(-60, -40);
  return { view: "side", alt: true, tempo: 0.3, poses: [{ ...base, armN: up, armF: up }, { ...base, armN: down, armF: down }], props: [{ k: "cable", from: [180, 6], at: "handN" }, { k: "cable", from: [180, 6], at: "handF" }] };
}

export function medBallSlam(): Motion {
  const top = stand({ armN: A(96, 96), armF: A(96, 96), shrug: 3 });
  const slam: Pose = { ...stand({ hip: [-20, 70], torso: 40, head: 10, legN: T([4, ANK]), legF: T([4, ANK]) }), armN: T([32, 22]), armF: T([32, 22]) };
  return { view: "side", tempo: 0.7, poses: [top, slam], props: [{ k: "ball", at: "hands", r: 11 }] };
}

export function wallBall(): Motion {
  const bottom: Pose = { ...stand({ hip: [-20, 52], torso: 64, legN: T([2, ANK]), legF: T([2, ANK]) }) };
  const chest = at(bottom, (s) => add(add(s.shoulder, mul(s.n, 14)), mul(s.d, -8)));
  const throwP = stand({ armN: A(80, 84), armF: A(80, 84) });
  return { view: "side", tempo: 0.9, poses: [{ ...bottom, armN: T(chest, -1), armF: T(chest, -1) }, throwP], props: [{ k: "ball", at: "hands", r: 11 }], scene: [post([64, 0], [64, 300], 8)] };
}

export function bearCrawl(): Motion {
  // mãos sob os ombros, joelhos suspensos sob o quadril, pés atrás
  const mk = (a: number, b: number): Pose => ({ hip: [0, 52], torso: 4, head: 10, armN: T([46 + a, 6]), armF: T([46 - a, 6]), legN: T([-34 + b, ANK + 4], 1), legF: T([-34 - b, ANK + 4], 1), footN: -30, footF: -30 });
  return { view: "side", loop: 1, poses: [mk(8, -8), mk(-8, 8)] };
}

export function skaters(): Motion {
  // aterrissa numa perna (a outra cruza por trás, encolhida); braços vão para o lado da aterrissagem
  const left: Pose = { ...fstand({ hip: [-26, 78], legN: T([-34, ANK], -1, [0.9, 1]), legF: A(-120, -160, [0.8, 0.6]) }), armN: A(-150, -150), armF: A(-80, -70) };
  const right: Pose = { ...fstand({ hip: [26, 78], legF: T([34, ANK], 1, [0.9, 1]), legN: A(-60, -20, [0.8, 0.6]) }), armN: A(-100, -110), armF: A(-30, -30) };
  return { view: "front", tempo: 0.8, poses: [left, right] };
}

export function trxRow(): Motion {
  const anchor: V = [110, 222];
  const mk = (b: number, pull: boolean): Pose => {
    const ankle: V = [0, ANK];
    const hip = add(ankle, mul(dir(b), 87));
    const p: Pose = { hip, torso: b, head: -6, armN: HANG, armF: HANG, legN: T(ankle), legF: T(ankle) };
    const sh = at(p, (s) => s.shoulder);
    const toward = mul(dir(Math.atan2(anchor[1] - sh[1], anchor[0] - sh[0]) * (180 / Math.PI)), pull ? 18 : 56);
    const hand = add(sh, toward);
    return { ...p, armN: T(hand, -1), armF: T(hand, -1) };
  };
  return { view: "side", tempo: 1.1, poses: [mk(116, false), mk(104, true)], props: [{ k: "cable", from: anchor, at: "hands" }, { k: "handle", at: "hands" }] };
}

export function shoulderTaps(): Motion {
  const p = plank({}).poses[0];
  const sh = at(p, (s) => s.shoulder);
  return { view: "side", tempo: 0.6, poses: [p, { ...p, armN: T(add(sh, [-2, 10]), -1) }] };
}

// =====================================================================
// MAPEAMENTO
// =====================================================================

export { A, R, T, CROSSED };
