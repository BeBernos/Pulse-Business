/**
 * Boneco 2D articulado (desenho próprio do app) para animar os exercícios.
 *
 * Coordenadas do "mundo" em cm, y para cima, chão em y = 0. De lado, o boneco olha para a direita (+x).
 * Ângulos em graus no sentido matemático: 0 = frente (direita), 90 = cima, -90 = baixo.
 *
 * Cada membro é dado por ângulos absolutos (`a`), ângulos relativos ao tronco (`r`) ou por um alvo para a mão/tornozelo
 * (`to`, resolvido por cinemática inversa de 2 ossos). `fs` encurta o osso (escorço: osso apontando para a câmera).
 */
export type V = readonly [number, number];
export type View = "side" | "front" | "back";

export type Limb = ({ a: readonly [number, number] } | { r: readonly [number, number] } | { to: V; bend?: 1 | -1 }) & { fs?: readonly [number, number] };

export interface Pose {
  hip: V;
  torso: number;
  /** escorço do tronco (vista de frente com o tronco inclinado) */
  tfs?: number;
  /** curvatura da coluna (vista lateral), graus: + = costas arredondadas (gato, enrolar), - = costas arqueadas (vaca, cobra) */
  arch?: number;
  /** inclinação da cabeça em relação ao tronco */
  head?: number;
  /** elevação dos ombros (encolhimento), cm */
  shrug?: number;
  armN: Limb;
  armF: Limb;
  legN: Limb;
  legF: Limb;
  /** direção do pé (calcanhar → ponta), graus absolutos; padrão 0 (pé no chão) */
  footN?: number;
  footF?: number;
  /** flexão do punho em relação ao antebraço */
  wristN?: number;
  wristF?: number;
}

export const SEG = { torso: 50, sho: 46, upper: 29, fore: 26, hand: 7, grip: 5, thigh: 44, shin: 43, head: 11, neck: 8, sw: 18, hw: 9 } as const;
/** deslocamento dos membros do lado de lá (vista lateral), dá profundidade */
export const DEPTH: V = [2.5, 2];

const RAD = Math.PI / 180;
export const dir = (deg: number): V => [Math.cos(deg * RAD), Math.sin(deg * RAD)];
export const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: V, k: number): V => [a[0] * k, a[1] * k];
export const mix = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const angleOf = (v: V) => Math.atan2(v[1], v[0]) / RAD;
/** normal "anterior" do tronco: girar a direção 90° no sentido horário (de pé, aponta para a frente) */
export const cw = (v: V): V => [v[1], -v[0]];
export const ccw = (v: V): V => [-v[1], v[0]];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface LimbJoints {
  root: V;
  mid: V;
  end: V;
  /** mão: ponto de pegada; pé: ponta */
  tip: V;
  /** pé: calcanhar */
  heel?: V;
}

export interface Skeleton {
  view: View;
  /** curvatura da coluna (graus); 0 = reta */
  arch: number;
  pelvis: V;
  neck: V;
  head: V;
  /** direção do tronco (unitária) e normal anterior (peito) */
  d: V;
  n: V;
  tfs: number;
  shoulder: V;
  armN: LimbJoints;
  armF: LimbJoints;
  legN: LimbJoints;
  legF: LimbJoints;
}

/** Cinemática inversa de 2 ossos. `bend` escolhe o lado do cotovelo/joelho (+1 anti-horário, -1 horário). */
export function ik(root: V, target: V, a: number, b: number, bend: number): { mid: V; end: V } {
  const v = sub(target, root);
  const base = angleOf(v);
  const d = clamp(Math.hypot(v[0], v[1]), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const A = Math.acos(cosA) / RAD;
  const mid = add(root, mul(dir(base + bend * A), a));
  return { mid, end: add(root, mul(dir(base), d)) };
}

function chain(root: V, limb: Limb, l1: number, l2: number, torso: number, defBend: number): { mid: V; end: V; foreAng: number } {
  const fs = limb.fs ?? [1, 1];
  const a = l1 * fs[0];
  const b = l2 * fs[1];
  if ("to" in limb) {
    const { mid, end } = ik(root, limb.to, a, b, limb.bend ?? defBend);
    return { mid, end, foreAng: angleOf(sub(end, mid)) };
  }
  const [u, f] = "a" in limb ? limb.a : [torso + limb.r[0], torso + limb.r[0] + limb.r[1]];
  const mid = add(root, mul(dir(u), a));
  return { mid, end: add(mid, mul(dir(f), b)), foreAng: f };
}

/** Espelha um membro em torno do eixo vertical x = cx (vista de frente: lado esquerdo a partir do direito). */
export function mirrorLimb(l: Limb, cx: number): Limb {
  if ("to" in l) return { to: [2 * cx - l.to[0], l.to[1]], bend: (l.bend ? -l.bend : undefined) as 1 | -1 | undefined, fs: l.fs };
  if ("a" in l) return { a: [180 - l.a[0], 180 - l.a[1]], fs: l.fs };
  return { r: [-l.r[0], -l.r[1]], fs: l.fs };
}

/**
 * Coluna curva: a direção vai de `torso + arch/2` (embaixo) a `torso - arch/2` (em cima), de modo que a corda
 * (quadril → pescoço) continua apontando para `torso`. Com arch = 0 é a reta de sempre.
 */
export function spineDir(torso: number, arch: number, t: number): V {
  return dir(torso + arch * (0.5 - t));
}

/** Ponto da coluna na fração `t` (0 = quadril, 1 = pescoço) de um tronco de comprimento `len`. */
export function spineAt(pelvis: V, torso: number, arch: number, t: number, len: number): V {
  if (Math.abs(arch) < 0.5) return add(pelvis, mul(dir(torso), t * len));
  const steps = Math.max(2, Math.ceil(Math.abs(t) * 12));
  let pt = pelvis;
  for (let i = 0; i < steps; i++) pt = add(pt, mul(spineDir(torso, arch, ((i + 0.5) / steps) * t), (t * len) / steps));
  return pt;
}

/** Resolve a pose em posições de articulação. */
export function solve(p: Pose, view: View): Skeleton {
  const tfs = p.tfs ?? 1;
  const d = dir(p.torso);
  const n = cw(d);
  const pelvis = p.hip;
  const arch = view === "side" ? p.arch ?? 0 : 0;
  const shoulder = add(spineAt(pelvis, p.torso, arch, SEG.sho * tfs / SEG.torso, SEG.torso), mul(spineDir(p.torso, arch, SEG.sho / SEG.torso), p.shrug ?? 0));
  const neck = add(spineAt(pelvis, p.torso, arch, tfs, SEG.torso), mul(spineDir(p.torso, arch, 1), (p.shrug ?? 0) * 0.4));
  const hd = dir(p.torso - arch / 2 + (p.head ?? 0));
  // de frente/costas com o tronco inclinado, a cabeça também fica em escorço (some atrás dos ombros)
  const head = add(add(neck, mul(hd, (SEG.neck + SEG.head * 0.85) * (view === "side" ? 1 : tfs))), view === "side" ? mul(cw(hd), 2.5) : [0, 0]);
  const front = view !== "side";
  // vista de frente: membro N fica à esquerda da tela (lado direito do corpo), F à direita
  const side = front ? ccw(d) : ([0, 0] as V);
  const hipSide = front ? ([1, 0] as V) : ([0, 0] as V);
  const shN = front ? add(shoulder, mul(side, SEG.sw)) : shoulder;
  const shF = front ? add(shoulder, mul(side, -SEG.sw)) : add(shoulder, DEPTH);
  const hpN = front ? add(pelvis, mul(hipSide, -SEG.hw)) : pelvis;
  const hpF = front ? add(pelvis, mul(hipSide, SEG.hw)) : add(pelvis, DEPTH);
  // cotovelo: de lado dobra "para trás/baixo" (-1); de frente, para fora (N: +1, F: -1). Joelho: de lado para a frente (+1); de frente para fora (N: -1, F: +1).
  const arm = (root: V, limb: Limb, wrist: number | undefined, defBend: number): LimbJoints => {
    const { mid, end, foreAng } = chain(root, limb, SEG.upper, SEG.fore, p.torso, defBend);
    const hand = foreAng + (wrist ?? 0);
    return { root, mid, end, tip: add(end, mul(dir(hand), SEG.grip)) };
  };
  const leg = (root: V, limb: Limb, foot: number | undefined, defBend: number): LimbJoints => {
    const { mid, end } = chain(root, limb, SEG.thigh, SEG.shin, p.torso, defBend);
    if (front) return { root, mid, end, tip: add(end, [0, -6]), heel: add(end, [0, -6]) };
    const fd = foot ?? 0;
    const rot = (x: number, y: number): V => {
      const [c, s] = dir(fd);
      return [x * c - y * s, x * s + y * c];
    };
    return { root, mid, end, tip: add(end, rot(17, -6)), heel: add(end, rot(-5, -6)) };
  };
  return {
    view,
    arch,
    pelvis,
    neck,
    head,
    d,
    n,
    tfs,
    shoulder,
    armN: arm(shN, p.armN, p.wristN, front ? 1 : -1),
    armF: arm(shF, p.armF, p.wristF, front ? -1 : -1),
    legN: leg(hpN, p.legN, p.footN, front ? -1 : 1),
    legF: leg(hpF, p.legF, p.footF, front ? 1 : 1),
  };
}

function lerpLimb(a: Limb, b: Limb, t: number): Limb {
  const fs: readonly [number, number] | undefined = a.fs || b.fs ? [lerp(a.fs?.[0] ?? 1, b.fs?.[0] ?? 1, t), lerp(a.fs?.[1] ?? 1, b.fs?.[1] ?? 1, t)] : undefined;
  if ("to" in a && "to" in b) return { to: mix(a.to, b.to, t), bend: a.bend ?? b.bend, fs };
  if ("a" in a && "a" in b) return { a: [lerp(a.a[0], b.a[0], t), lerp(a.a[1], b.a[1], t)], fs };
  if ("r" in a && "r" in b) return { r: [lerp(a.r[0], b.r[0], t), lerp(a.r[1], b.r[1], t)], fs };
  return t < 0.5 ? a : b;
}

const opt = (a: number | undefined, b: number | undefined, t: number) => (a === undefined && b === undefined ? undefined : lerp(a ?? 0, b ?? 0, t));

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    hip: mix(a.hip, b.hip, t),
    torso: lerp(a.torso, b.torso, t),
    tfs: opt(a.tfs ?? 1, b.tfs ?? 1, t),
    arch: opt(a.arch, b.arch, t),
    head: opt(a.head, b.head, t),
    shrug: opt(a.shrug, b.shrug, t),
    armN: lerpLimb(a.armN, b.armN, t),
    armF: lerpLimb(a.armF, b.armF, t),
    legN: lerpLimb(a.legN, b.legN, t),
    legF: lerpLimb(a.legF, b.legF, t),
    footN: opt(a.footN, b.footN, t),
    footF: opt(a.footF, b.footF, t),
    wristN: opt(a.wristN, b.wristN, t),
    wristF: opt(a.wristF, b.wristF, t),
  };
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** Ciclo contínuo (caminhar, pedalar): passa pelas poses em ordem e volta à primeira, sem pausa. */
export function poseLoop(poses: readonly Pose[], sec: number, period: number): Pose {
  const n = poses.length;
  if (n === 1) return poses[0];
  const t = ((((sec % period) + period) % period) / period) * n;
  const i = Math.floor(t) % n;
  return lerpPose(poses[i], poses[(i + 1) % n], t - Math.floor(t));
}

/**
 * Ciclo de uma repetição: vai pelas poses-chave (fase concêntrica), segura, volta (excêntrica, mais lenta) e segura.
 * Retorna a pose interpolada no instante `sec`.
 */
export function poseAt(poses: readonly Pose[], sec: number, tempo = 1): Pose {
  const n = poses.length;
  if (n === 1) return poses[0];
  const up = (0.95 * tempo) / (n - 1);
  const down = (1.25 * tempo) / (n - 1);
  const holdTop = 0.35 * tempo;
  const holdBottom = 0.45 * tempo;
  const total = up * (n - 1) + holdTop + down * (n - 1) + holdBottom;
  let t = ((sec % total) + total) % total;
  // a suavização vale para a fase inteira (sem parar nas poses do meio): acelera, passa reto pelas intermediárias, freia no fim
  const through = (k: number, reverse: boolean) => {
    const g = ease(Math.min(1, Math.max(0, k))) * (n - 1);
    const i = Math.min(n - 2, Math.floor(g));
    const f = g - i;
    return reverse ? lerpPose(poses[n - 1 - i], poses[n - 2 - i], f) : lerpPose(poses[i], poses[i + 1], f);
  };
  if (t < up * (n - 1)) return through(t / (up * (n - 1)), false);
  t -= up * (n - 1);
  if (t < holdTop) return poses[n - 1];
  t -= holdTop;
  if (t < down * (n - 1)) return through(t / (down * (n - 1)), true);
  return poses[0];
}

export function cycleSeconds(n: number, tempo = 1): number {
  return n <= 1 ? 2 : 0.95 * tempo + 0.35 * tempo + 1.25 * tempo + 0.45 * tempo;
}
