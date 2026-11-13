import type { MuscleId, MuscleMap } from "../muscles";
import { add, angleOf, ccw, cw, dir, mirrorLimb, mix, mul, poseAt, poseLoop, solve, spineAt, spineDir, sub, type LimbJoints, type Pose, type Skeleton, type V, type View } from "./rig";

/** Pontos do corpo onde o equipamento se prende. */
export type Attach =
  | "handN" | "handF" | "hands" | "footN" | "footF" | "feet" | "ankleN" | "kneeN" | "knees"
  | "traps" | "chest" | "hip" | "back" | "shinFront" | "shinBack" | "thighTop" | "elbowN" | "elbows";

export type Prop =
  | { k: "barbell"; at: Attach; r?: number }
  | { k: "dumbbell"; at: Attach; o?: "h" | "v" }
  | { k: "plate"; at: Attach; r?: number }
  | { k: "cable"; from: V; at: Attach }
  | { k: "lever"; pivot: V; at: Attach }
  | { k: "handle"; at: Attach }
  | { k: "pad"; at: Attach; r?: number }
  | { k: "platform"; at: Attach; ang: number }
  | { k: "wheel"; at: Attach }
  /** kettlebell pendurado na mão */
  | { k: "kettlebell"; at: Attach }
  /** bola (medicine ball, bola de parede) */
  | { k: "ball"; at: Attach; r?: number }
  /** carrinho do Reformer: acompanha o ponto `at` no eixo x, sobre os trilhos na altura `y` */
  | { k: "carriage"; at: Attach; y: number; w?: number; dx?: number };

export type Tone = "bench" | "metal" | "dark" | "pad";
export type Shape = { k: "line"; a: V; b: V; w?: number; tone?: Tone } | { k: "poly"; pts: V[]; tone?: Tone } | { k: "circle"; c: V; r: number; tone?: Tone };

export interface Motion {
  view: View;
  poses: Pose[];
  props?: Prop[];
  scene?: Shape[];
  /** membro do lado de lá meio ciclo defasado (alternado) */
  alt?: boolean;
  /** vista de frente: lado F espelha o lado N */
  sym?: boolean | "arms" | "legs";
  tempo?: number;
  /** sem chão (vista de cima, ex.: crucifixo deitado) */
  noFloor?: boolean;
  /** isométrico (prancha): só "respira" */
  hold?: boolean;
  /** vista de frente: pernas na frente do tronco (sentado com joelhos para cima) */
  legsFront?: boolean;
  /** ciclo contínuo (caminhar, pedalar, escada): duração de uma volta completa, em segundos */
  loop?: number;
}

export type Color = "torso" | "near" | "far" | "head" | "m1" | "m2" | "bench" | "metal" | "dark" | "pad" | "plate" | "plateFill" | "cable" | "trail";
export type Prim =
  | { t: "line"; a: V; b: V; w: number; c: Color }
  | { t: "circle"; c: V; r: number; fill?: Color; stroke?: Color; sw?: number }
  | { t: "poly"; pts: V[]; fill: Color }
  /** caminho tracejado (rastro do movimento) */
  | { t: "path"; pts: V[]; w: number; c: Color };

/** Pose do instante `sec`, com alternância e simetria aplicadas. */
export function frame(m: Motion, sec: number, cycle = 3): Pose {
  let p = m.loop ? poseLoop(m.poses, sec, m.loop) : poseAt(m.poses, sec, m.tempo);
  if (m.hold) {
    const k = Math.sin((sec / cycle) * Math.PI * 2) * 0.8;
    p = { ...p, hip: [p.hip[0], p.hip[1] + k] };
  }
  if (m.alt) {
    const q = poseAt(m.poses, sec + cycle / 2, m.tempo);
    p = { ...p, armF: q.armF, wristF: q.wristF };
  }
  if (m.sym) {
    const cx = p.hip[0];
    if (m.sym === true || m.sym === "arms") p = { ...p, armF: mirrorLimb(p.armN, cx), wristF: p.wristN };
    if (m.sym === true || m.sym === "legs") p = { ...p, legF: mirrorLimb(p.legN, cx), footF: p.footN };
  }
  return p;
}

const unit = (v: V): V => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

export function attachPoint(s: Skeleton, at: Attach): V {
  const front = s.view !== "side";
  const sole = (l: LimbJoints) => mix(l.heel ?? l.end, l.tip, 0.5);
  const shinPt = (k: number) => {
    const l = s.legN;
    const sd = unit(sub(l.end, l.mid));
    return add(mix(l.mid, l.end, 0.82), mul(ccw(sd), k));
  };
  switch (at) {
    case "handN": return s.armN.tip;
    case "handF": return s.armF.tip;
    case "hands": return mix(s.armN.tip, s.armF.tip, 0.5);
    case "footN": return sole(s.legN);
    case "footF": return sole(s.legF);
    case "feet": return mix(sole(s.legN), sole(s.legF), 0.5);
    case "ankleN": return s.legN.end;
    case "kneeN": return s.legN.mid;
    case "knees": return mix(s.legN.mid, s.legF.mid, 0.5);
    case "elbowN": return s.armN.mid;
    case "elbows": return mix(s.armN.mid, s.armF.mid, 0.5);
    case "traps": return front ? add(s.shoulder, mul(s.d, 3)) : add(add(s.neck, mul(s.n, -7)), mul(s.d, -3));
    case "chest": return front ? add(s.shoulder, mul(s.d, -10 * s.tfs)) : add(add(s.shoulder, mul(s.n, 14)), mul(s.d, -8));
    case "hip": return front ? s.pelvis : add(s.pelvis, mul(s.n, 12));
    case "back": return add(add(s.shoulder, mul(s.n, -13)), mul(s.d, -8));
    case "shinFront": return shinPt(8);
    case "shinBack": return shinPt(-8);
    case "thighTop": {
      const l = s.legN;
      return add(mix(l.root, l.mid, 0.72), mul(ccw(unit(sub(l.mid, l.root))), 11));
    }
  }
}

// ---------- músculos ----------

type Seg = "torso" | "upperN" | "foreN" | "thighN" | "shinN" | "upperF" | "foreF" | "thighF" | "shinF" | "pelvis";
/** [segmento, início, fim, deslocamento (+ = anterior), largura]; deslocamento lateral na vista de frente/costas */
type MSpec = [Seg, number, number, number, number, number?];

const SIDE: Partial<Record<MuscleId, MSpec[]>> = {
  peito: [["torso", 0.66, 0.84, 8, 9]],
  peito_sup: [["torso", 0.8, 0.92, 7, 8]],
  delt_ant: [["upperN", 0.02, 0.3, 3, 9]],
  delt_lat: [["upperN", 0, 0.28, 0, 10]],
  delt_post: [["upperN", 0.02, 0.3, -3, 9]],
  manguito: [["torso", 0.78, 0.9, -5, 7]],
  dorsal: [["torso", 0.42, 0.78, -6, 10]],
  costas_media: [["torso", 0.74, 0.9, -7, 8]],
  trapezio_sup: [["torso", 0.9, 1.04, -3, 7]],
  lombar: [["torso", 0.1, 0.4, -6, 8]],
  biceps: [["upperN", 0.32, 0.86, 2.5, 7]],
  braquial: [["upperN", 0.6, 0.92, 2, 5], ["foreN", 0.05, 0.4, 2, 6]],
  triceps: [["upperN", 0.18, 0.84, -2.5, 7]],
  antebraco: [["foreN", 0.08, 0.72, 0, 6.5]],
  abdomen: [["torso", 0.18, 0.6, 6.5, 8]],
  obliquos: [["torso", 0.22, 0.55, 1, 7]],
  gluteo: [["pelvis", 0, 0, -6, 15]],
  gluteo_medio: [["pelvis", 0.15, 0.15, -2, 9]],
  quadriceps: [["thighN", 0.14, 0.86, 3.5, 10]],
  posterior: [["thighN", 0.16, 0.86, -3.5, 9]],
  adutores: [["thighN", 0.12, 0.5, 0, 7]],
  gastrocnemio: [["shinN", 0.08, 0.48, -2.5, 9]],
  soleo: [["shinN", 0.45, 0.8, -2, 6]],
};

const both = (s: MSpec): MSpec[] => [s, [s[0].replace("N", "F") as Seg, s[1], s[2], -s[3], s[4]]];
const FRONT: Partial<Record<MuscleId, MSpec[]>> = {
  peito: [["torso", 0.73, 0.77, 4, 10, 12], ["torso", 0.73, 0.77, -4, 10, -12]],
  peito_sup: [["torso", 0.83, 0.86, 4, 7, 13], ["torso", 0.83, 0.86, -4, 7, -13]],
  delt_ant: both(["upperN", 0, 0.24, 0, 10]),
  delt_lat: both(["upperN", 0, 0.26, 0, 11]),
  trapezio_sup: [["torso", 0.93, 1.0, 9, 5], ["torso", 0.93, 1.0, -9, 5]],
  biceps: both(["upperN", 0.32, 0.84, 0, 7]),
  braquial: both(["foreN", 0.05, 0.4, 0, 6]),
  antebraco: both(["foreN", 0.08, 0.7, 0, 6.5]),
  abdomen: [["torso", 0.2, 0.62, 0, 10]],
  obliquos: [["torso", 0.28, 0.55, 10, 5], ["torso", 0.28, 0.55, -10, 5]],
  gluteo_medio: [["torso", -0.02, 0.06, 12, 6], ["torso", -0.02, 0.06, -12, 6]],
  quadriceps: both(["thighN", 0.14, 0.82, 0, 11]),
  adutores: both(["thighN", 0.1, 0.48, 3.5, 6]),
};
const BACK: Partial<Record<MuscleId, MSpec[]>> = {
  delt_post: both(["upperN", 0, 0.24, 0, 10]),
  delt_lat: both(["upperN", 0, 0.26, 0, 11]),
  manguito: [["torso", 0.8, 0.86, 9, 6], ["torso", 0.8, 0.86, -9, 6]],
  trapezio_sup: [["torso", 0.9, 1.0, 8, 6], ["torso", 0.9, 1.0, -8, 6]],
  costas_media: [["torso", 0.68, 0.92, 0, 11]],
  dorsal: [["torso", 0.42, 0.78, 8, 8, 13], ["torso", 0.42, 0.78, -8, 8, -13]],
  lombar: [["torso", 0.08, 0.36, 0, 9]],
  triceps: both(["upperN", 0.2, 0.84, 0, 7]),
  antebraco: both(["foreN", 0.08, 0.7, 0, 6.5]),
  gluteo: [["torso", -0.12, 0.02, 6, 13], ["torso", -0.12, 0.02, -6, 13]],
  gluteo_medio: [["torso", 0.0, 0.08, 12, 6], ["torso", 0.0, 0.08, -12, 6]],
  posterior: both(["thighN", 0.16, 0.84, 0, 10]),
  adutores: both(["thighN", 0.1, 0.45, 3.5, 6]),
  gastrocnemio: both(["shinN", 0.06, 0.48, 0, 10]),
  soleo: both(["shinN", 0.45, 0.8, 0, 7]),
};

function segment(s: Skeleton, seg: Seg): [V, V] {
  const neckTop = add(s.pelvis, mul(s.d, 50 * s.tfs));
  switch (seg) {
    case "torso": return [s.pelvis, neckTop];
    case "pelvis": return [s.pelvis, add(s.pelvis, mul(s.d, 10))];
    case "upperN": return [s.armN.root, s.armN.mid];
    case "foreN": return [s.armN.mid, s.armN.end];
    case "thighN": return [s.legN.root, s.legN.mid];
    case "shinN": return [s.legN.mid, s.legN.end];
    case "upperF": return [s.armF.root, s.armF.mid];
    case "foreF": return [s.armF.mid, s.armF.end];
    case "thighF": return [s.legF.root, s.legF.mid];
    case "shinF": return [s.legF.mid, s.legF.end];
  }
}

/** Ponto do tronco na fração `t` da coluna, deslocado `off` para o peito (+) ou para as costas (-). Segue a curvatura. */
function torsoPt(s: Skeleton, t: number, off: number): V {
  const ang = angleOf(s.d);
  return add(spineAt(s.pelvis, ang, s.arch, t, 50 * s.tfs), mul(cw(spineDir(ang, s.arch, t)), off));
}

/** Lado do segmento em que o músculo fica; tronco: anterior = peito. Membros: anterior = giro anti-horário. */
function muscleLine(s: Skeleton, [seg, t0, t1, off, w, off2 = off]: MSpec): Prim {
  if (s.view === "side" && s.arch && seg === "torso") return { t: "line", a: torsoPt(s, t0, off), b: torsoPt(s, t1, off2), w, c: "m1" };
  const [a, b] = segment(s, seg);
  const along = unit(sub(b, a));
  let normal: V;
  if (s.view === "side") normal = seg === "torso" || seg === "pelvis" ? s.n : ccw(along);
  // vista de frente/costas: deslocamento lateral (+ = lado N/tela esquerda), perpendicular ao osso
  else normal = seg === "torso" || seg === "pelvis" ? ccw(s.d) : ccw(along);
  const p0 = add(mix(a, b, t0), mul(normal, off));
  const p1 = add(mix(a, b, t1), mul(normal, off2));
  return { t: "line", a: p0, b: p1, w, c: "m1" };
}

const SEGS = {
  torso: ["torso", "pelvis"],
  armN: ["upperN", "foreN"],
  armF: ["upperF", "foreF"],
  legN: ["thighN", "shinN"],
  legF: ["thighF", "shinF"],
} as const satisfies Record<string, readonly Seg[]>;

function muscles(s: Skeleton, map: MuscleMap | undefined, ...groups: (keyof typeof SEGS)[]): Prim[] {
  if (!map) return [];
  const table = s.view === "side" ? SIDE : s.view === "front" ? FRONT : BACK;
  const segs = new Set<Seg>(groups.flatMap((g) => SEGS[g]));
  const out: Prim[] = [];
  const add2 = (ids: MuscleId[], c: Color) => {
    for (const id of ids) {
      for (const spec of table[id] ?? []) {
        if (!segs.has(spec[0])) continue;
        const pr = muscleLine(s, spec);
        if (pr.t === "line") out.push({ ...pr, c });
      }
    }
  };
  add2(map.secondary, "m2");
  add2(map.primary, "m1");
  return out;
}

// ---------- corpo ----------

function torsoPoly(s: Skeleton): V[] {
  const L = 50 * s.tfs;
  const P = s.pelvis;
  const at = (t: number, off: number, lateral: V): V => add(add(P, mul(s.d, t * L)), mul(lateral, off));
  if (s.view === "side") {
    const back: [number, number][] = [[-0.06, -9], [0.25, -8], [0.55, -8.5], [0.8, -10], [0.96, -7], [1.02, -3]];
    const front: [number, number][] = [[1.02, 4], [0.92, 9], [0.8, 12], [0.64, 11], [0.45, 9], [0.25, 10], [0.06, 10.5], [-0.08, 6]];
    if (s.arch) return [...back, ...front].map(([t, o]) => torsoPt(s, t, o));
    return [...back.map(([t, o]) => at(t, o, s.n)), ...front.map(([t, o]) => at(t, o, s.n))];
  }
  const lat = ccw(s.d);
  const prof: [number, number][] = [[-0.1, 12.5], [0.05, 14], [0.25, 12.5], [0.45, 12], [0.68, 15], [0.86, 18.5], [0.96, 16], [1.02, 7]];
  return [...prof.map(([t, o]) => at(t, o, lat)), ...[...prof].reverse().map(([t, o]) => at(t, -o, lat))];
}

function limbPrims(l: LimbJoints, kind: "arm" | "leg", c: Color): Prim[] {
  if (kind === "arm") {
    return [
      { t: "line", a: l.root, b: l.mid, w: 10.5, c },
      { t: "line", a: l.mid, b: l.end, w: 8.5, c },
      { t: "line", a: l.end, b: mix(l.end, l.tip, 1.2), w: 7, c },
    ];
  }
  return [
    { t: "line", a: l.root, b: l.mid, w: 16, c },
    { t: "line", a: l.mid, b: l.end, w: 11.5, c },
    { t: "line", a: l.heel ?? l.end, b: l.tip, w: 6.5, c },
  ];
}

// ---------- equipamento ----------

function propPrims(s: Skeleton, p: Prop): { prims: Prim[]; layer: "back" | "mid" | "front" } {
  const front = s.view !== "side";
  switch (p.k) {
    case "barbell": {
      const c = attachPoint(s, p.at);
      if (!front) return { layer: "front", prims: [{ t: "circle", c, r: p.r ?? 21, fill: "plateFill", stroke: "plate", sw: 3.5 }, { t: "circle", c, r: 3, fill: "metal" }] };
      const prims: Prim[] = [{ t: "line", a: [c[0] - 108, c[1]], b: [c[0] + 108, c[1]], w: 3, c: "metal" }];
      for (const sgn of [-1, 1]) prims.push({ t: "line", a: [c[0] + sgn * 84, c[1] - (p.r ?? 21)], b: [c[0] + sgn * 84, c[1] + (p.r ?? 21)], w: 9, c: "plate" });
      return { layer: "front", prims };
    }
    case "dumbbell": {
      const c = attachPoint(s, p.at);
      if (!front) return { layer: "front", prims: [{ t: "circle", c, r: 7.5, fill: "plateFill", stroke: "plate", sw: 3 }, { t: "circle", c, r: 2.5, fill: "metal" }] };
      const v = p.o === "v";
      const ax: V = v ? [0, 1] : [1, 0];
      const px: V = v ? [1, 0] : [0, 1];
      const prims: Prim[] = [{ t: "line", a: add(c, mul(ax, -9)), b: add(c, mul(ax, 9)), w: 2.5, c: "metal" }];
      for (const sgn of [-1, 1]) prims.push({ t: "line", a: add(add(c, mul(ax, sgn * 9)), mul(px, -7.5)), b: add(add(c, mul(ax, sgn * 9)), mul(px, 7.5)), w: 5, c: "plate" });
      return { layer: "front", prims };
    }
    case "plate": {
      const c = attachPoint(s, p.at);
      return { layer: "front", prims: [{ t: "circle", c, r: p.r ?? 15, fill: "plateFill", stroke: "plate", sw: 3 }, { t: "circle", c, r: 3, fill: "metal" }] };
    }
    case "cable": {
      const c = attachPoint(s, p.at);
      return { layer: "mid", prims: [{ t: "line", a: p.from, b: c, w: 1.4, c: "cable" }, { t: "circle", c: p.from, r: 4.5, fill: "dark", stroke: "metal", sw: 2 }] };
    }
    case "lever": {
      const c = attachPoint(s, p.at);
      return { layer: "back", prims: [{ t: "line", a: p.pivot, b: c, w: 5.5, c: "metal" }, { t: "circle", c: p.pivot, r: 4.5, fill: "dark", stroke: "metal", sw: 2 }, { t: "circle", c, r: 4, fill: "metal" }] };
    }
    case "handle": {
      if (front && (p.at === "hands" || p.at === "elbows")) {
        const a = s.armN.tip;
        const b = s.armF.tip;
        const u = unit(sub(b, a));
        return { layer: "front", prims: [{ t: "line", a: add(a, mul(u, -13)), b: add(b, mul(u, 13)), w: 3, c: "metal" }] };
      }
      return { layer: "front", prims: [{ t: "circle", c: attachPoint(s, p.at), r: 3.2, fill: "metal" }] };
    }
    case "pad": return { layer: "mid", prims: [{ t: "circle", c: attachPoint(s, p.at), r: p.r ?? 6, fill: "pad" }] };
    case "platform": {
      const c = add(attachPoint(s, p.at), mul(dir(p.ang), 4));
      const u = dir(p.ang + 90);
      const back = add(c, mul(dir(p.ang), 10));
      return {
        layer: "mid",
        prims: [
          { t: "poly", pts: [add(c, mul(u, 30)), add(c, mul(u, -30)), add(back, mul(u, -24)), add(back, mul(u, 24))], fill: "bench" },
          { t: "line", a: add(c, mul(u, 30)), b: add(c, mul(u, -30)), w: 5, c: "metal" },
        ],
      };
    }
    case "wheel": {
      const c = attachPoint(s, p.at);
      return { layer: "front", prims: [{ t: "circle", c, r: 9, fill: "plateFill", stroke: "metal", sw: 3 }, { t: "circle", c, r: 2.5, fill: "metal" }] };
    }
    case "kettlebell": {
      const h = attachPoint(s, p.at);
      const body: V = [h[0], h[1] - 10];
      return { layer: "front", prims: [{ t: "circle", c: [h[0], h[1] - 2], r: 5, stroke: "metal", sw: 2.5 }, { t: "circle", c: body, r: 8.5, fill: "plate" }] };
    }
    case "ball": {
      const c = attachPoint(s, p.at);
      return { layer: "front", prims: [{ t: "circle", c, r: p.r ?? 11, fill: "plateFill", stroke: "plate", sw: 3 }] };
    }
    case "carriage": {
      const x = attachPoint(s, p.at)[0] + (p.dx ?? 0);
      const w = p.w ?? 56;
      return { layer: "back", prims: [{ t: "line", a: [x - w / 2, p.y], b: [x + w / 2, p.y], w: 9, c: "bench" }] };
    }
  }
}

function shapePrims(sh: Shape): Prim {
  const c = (sh.tone ?? "bench") as Color;
  if (sh.k === "line") return { t: "line", a: sh.a, b: sh.b, w: sh.w ?? 8, c };
  if (sh.k === "poly") return { t: "poly", pts: sh.pts, fill: c };
  return { t: "circle", c: sh.c, r: sh.r, fill: c };
}

/** Lista ordenada de formas para desenhar a pose (de trás para a frente). */
export function render(m: Motion, pose: Pose, map?: MuscleMap): Prim[] {
  const s = solve(pose, m.view);
  const props = (m.props ?? []).map((p) => propPrims(s, p));
  const layer = (l: "back" | "mid" | "front") => props.filter((p) => p.layer === l).flatMap((p) => p.prims);
  const out: Prim[] = (m.scene ?? []).map(shapePrims);
  const neckBase = s.arch ? torsoPt(s, 0.92, 0) : add(s.pelvis, mul(s.d, 46 * s.tfs));
  const head: Prim[] = [
    { t: "line", a: neckBase, b: mix(neckBase, s.head, 0.7), w: 8, c: "torso" },
    { t: "circle", c: s.head, r: 11, fill: "head" },
  ];
  const torso: Prim[] = [{ t: "poly", pts: torsoPoly(s), fill: "torso" }, ...muscles(s, map, "torso")];
  out.push(...layer("back"));
  if (m.view === "side") {
    out.push(...limbPrims(s.legF, "leg", "far"), ...limbPrims(s.armF, "arm", "far"));
    out.push(...torso, ...head);
    out.push(...limbPrims(s.legN, "leg", "near"), ...muscles(s, map, "legN"));
    out.push(...layer("mid"));
    out.push(...limbPrims(s.armN, "arm", "near"), ...muscles(s, map, "armN"));
    out.push(...layer("front"));
    return out;
  }
  const headBehind = s.tfs < 0.75 && m.view === "back";
  if (headBehind) out.push(...head);
  const legs = [...limbPrims(s.legN, "leg", "near"), ...limbPrims(s.legF, "leg", "near"), ...muscles(s, map, "legN", "legF")];
  if (!m.legsFront) out.push(...legs);
  out.push(...torso);
  if (m.legsFront) out.push(...legs);
  if (!headBehind) out.push(...head);
  out.push(...layer("mid"));
  out.push(...limbPrims(s.armN, "arm", "near"), ...limbPrims(s.armF, "arm", "near"));
  out.push(...muscles(s, map, "armN", "armF"));
  out.push(...layer("front"));
  return m.view === "back" ? out.map((p) => mirrorPrim(p, s.pelvis[0])) : out;
}

function mirrorPrim(p: Prim, cx: number): Prim {
  const m = (v: V): V => [2 * cx - v[0], v[1]];
  if (p.t === "line") return { ...p, a: m(p.a), b: m(p.b) };
  if (p.t === "circle") return { ...p, c: m(p.c) };
  return { ...p, pts: p.pts.map(m) };
}

// ---------- rastro do movimento ----------

/** pontos candidatos ao rastro, aos pares (de cá, de lá) */
const TRAIL_AT: ((s: Skeleton) => V)[] = [
  (s) => s.armN.tip, (s) => s.armF.tip,
  (s) => mix(s.legN.heel ?? s.legN.end, s.legN.tip, 0.5), (s) => mix(s.legF.heel ?? s.legF.end, s.legF.tip, 0.5),
  (s) => s.legN.mid, (s) => s.legF.mid,
  (s) => s.pelvis, (s) => s.pelvis,
  (s) => s.head, (s) => s.head,
];

/**
 * Rastro da fase de força (posição inicial → final): o caminho tracejado da mão/pé que mais se move, com uma seta
 * na ponta indicando o sentido. Mostra de relance "o que vai para onde". Ciclos contínuos e isométricos não têm rastro.
 */
export function trail(m: Motion): Prim[] {
  if (m.loop || m.hold || m.poses.length < 2) return [];
  const tempo = m.tempo ?? 1;
  const up = 0.95 * tempo;
  const N = 24;
  const paths: V[][] = TRAIL_AT.map(() => []);
  for (let i = 0; i <= N; i++) {
    const s = solve(frame(m, (i / N) * up), m.view);
    TRAIL_AT.forEach((f, j) => paths[j].push(f(s)));
  }
  const len = (pts: V[]) => pts.slice(1).reduce((acc, v, i) => acc + Math.hypot(v[0] - pts[i][0], v[1] - pts[i][1]), 0);
  // pernas/quadril só quando mexem bem mais que as mãos (as mãos dizem mais na maioria dos exercícios)
  const lens = paths.map(len).map((l, j) => (j >= 2 ? l * 0.8 : l)).map((l, j) => (j === 7 || j === 9 ? 0 : j === 8 ? l * 0.9 : l));
  const max = Math.max(...lens);
  if (max < 10) return [];
  // as duas mãos (ou os dois pés) quando se movem juntas; de lado, o membro de lá fica escondido atrás do de cá
  const picked = lens
    .map((l, j) => ({ l, j }))
    .filter(({ l, j }) => l >= max * 0.75 && (m.view !== "side" || j % 2 === 0 || lens[j - 1] < max * 0.75))
    .sort((a, b) => b.l - a.l)
    .slice(0, 2);
  const cx = solve(m.poses[0], m.view).pelvis[0];
  const flip = (v: V): V => (m.view === "back" ? [2 * cx - v[0], v[1]] : v);
  const out: Prim[] = [];
  for (const { j } of picked) {
    const pts = paths[j].map(flip);
    out.push({ t: "path", pts, w: 2.2, c: "trail" });
    // seta: dois traços na ponta, contra a direção do último trecho
    const end = pts[pts.length - 1];
    let k = pts.length - 2;
    while (k > 0 && Math.hypot(end[0] - pts[k][0], end[1] - pts[k][1]) < 6) k--;
    const d = unit(sub(end, pts[k]));
    const back = mul(d, -7);
    for (const sg of [1, -1]) out.push({ t: "line", a: end, b: add(end, add(back, mul(ccw(d), 4.5 * sg))), w: 2.6, c: "trail" });
  }
  return out;
}

export interface Box { x: number; y: number; w: number; h: number }

/** Caixa que contém o movimento inteiro (amostrado), com folga e proporção mínima. */
export function bounds(m: Motion, aspect = 1.25): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (v: V, r: number) => {
    x0 = Math.min(x0, v[0] - r); x1 = Math.max(x1, v[0] + r);
    y0 = Math.min(y0, v[1] - r); y1 = Math.max(y1, v[1] + r);
  };
  const cyc = 3;
  for (let i = 0; i < 16; i++) {
    for (const p of render(m, frame(m, (i / 16) * cyc, cyc))) {
      if (p.t === "line") { grow(p.a, p.w / 2); grow(p.b, p.w / 2); }
      else if (p.t === "circle") grow(p.c, p.r + (p.sw ?? 0));
      else p.pts.forEach((v) => grow(v, 0));
    }
  }
  if (!m.noFloor) y0 = Math.min(y0, -2);
  const pad = 8;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  let w = x1 - x0, h = y1 - y0;
  if (w / h < aspect) { const nw = h * aspect; x0 -= (nw - w) / 2; w = nw; }
  else { const nh = w / aspect; y0 -= (nh - h) / 2; h = nh; }
  return { x: x0, y: y0, w, h };
}

