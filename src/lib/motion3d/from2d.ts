/**
 * 3D automático a partir do 2D: cada quadro do boneco 2D (já validado pelos testes) vira direções de ossos em 3D.
 *
 * Vista lateral: o plano da tela é o plano sagital (x da tela = frente do corpo, +z no 3D); os membros "de cá" (N)
 * são o lado direito do corpo (-x no 3D), os "de lá" (F) o esquerdo (+x). Osso encurtado (`fs`) ganha profundidade
 * para fora do corpo. Vista de frente/costas (coordenadas antes do espelho das costas): x da tela cresce para a esquerda
 * do corpo (+x no 3D, a pessoa olha para a câmera); osso encurtado aponta para a frente.
 * Unidades: cm no 2D → m no 3D.
 */
import { frame, type Motion, type Prop, type Shape } from "../motion/draw";
import { attachPoint } from "../motion/draw";
import { DEPTH, SEG, cw, solve, spineDir, sub, angleOf, type Skeleton, type V, type View } from "../motion/rig";

export type Vec3 = [number, number, number];

export interface Limb3 {
  /** direção do osso de cima (ombro→cotovelo / quadril→joelho) e do de baixo (cotovelo→punho / joelho→tornozelo) */
  u: Vec3;
  f: Vec3;
  /** mão: direção dos dedos; pé: calcanhar → ponta */
  end: Vec3;
}

export interface Frame3 {
  pelvis: Vec3;
  /** direções da lombar, do tórax e do pescoço→cabeça */
  lumbar: Vec3;
  thorax: Vec3;
  head: Vec3;
  /** frente do tronco (peito) */
  front: Vec3;
  armL: Limb3;
  armR: Limb3;
  legL: Limb3;
  legR: Limb3;
  /** pontos do corpo usados pelo equipamento que não são mão/pé (já em 3D) */
  attach: Record<string, Vec3>;
}

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const norm = (v: Vec3): Vec3 => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export interface Mapper {
  view: View;
  /** centro horizontal (x da tela do quadril no 1º quadro) */
  cx: number;
  /** ponto 2D (cm) → 3D (m); `lateral` (m) desloca no eixo esquerda/direita do corpo */
  point(p: V, lateral?: number): Vec3;
  /** vetor 2D (cm) com comprimento real `L` (cm) → direção 3D; `out` = para onde vai a parte que falta (encurtado) */
  dir(v: V, L: number, out: Vec3): Vec3;
}

export function mapper(view: View, cx: number): Mapper {
  const side = view === "side";
  return {
    view,
    cx,
    point: ([x, y], lateral = 0) => (side ? [lateral, y / 100, (x - cx) / 100] : [(x - cx) / 100 + lateral, y / 100, 0]),
    dir: ([x, y], L, out) => {
      const base: Vec3 = side ? [0, y, x] : [x, y, 0];
      const miss = Math.sqrt(Math.max(0, L * L - (x * x + y * y)));
      const v: Vec3 = [base[0] + out[0] * miss, base[1] + out[1] * miss, base[2] + out[2] * miss];
      return len(v) < 1e-6 ? [0, 0, 1] : norm(v);
    },
  };
}

const OUT_N: Vec3 = [-1, 0, 0];
const OUT_F: Vec3 = [1, 0, 0];
const FWD: Vec3 = [0, 0, 1];
const NONE: Vec3 = [0, 0, 0];

function limb(m: Mapper, root: V, mid: V, end: V, tip: V, l1: number, l2: number, out: Vec3, foot = false, heel?: V): Limb3 {
  return {
    u: m.dir(sub(mid, root), l1, out),
    f: m.dir(sub(end, mid), l2, out),
    // pé de frente (sem comprimento na tela): aponta para a frente
    end: foot && heel ? m.dir(sub(tip, heel), 22, m.view === "side" ? NONE : FWD) : m.dir(sub(tip, end), SEG.grip, out),
  };
}

/**
 * Perna vista de frente sem escorço: o desenho 2D só consegue dobrar o joelho para o lado. No corpo, ele dobra
 * sobretudo para a frente — gira a "barriga" do joelho em torno da linha quadril→tornozelo (60% para a frente).
 */
function frontLeg(m: Mapper, root: V, mid: V, end: V, tip: V, heel: V | undefined): Limb3 | null {
  const l1 = Math.hypot(mid[0] - root[0], mid[1] - root[1]);
  const l2 = Math.hypot(end[0] - mid[0], end[1] - mid[1]);
  if (Math.abs(l1 - SEG.thigh) > 1.5 || Math.abs(l2 - SEG.shin) > 1.5) return null; // já tem escorço
  const re: V = sub(end, root);
  const L = Math.hypot(re[0], re[1]) || 1;
  // só pernas "de pé" (quadril acima do tornozelo); sentado no chão (borboleta, 90/90) fica como no desenho
  if (-re[1] < 0.7 * L || L < 45) return null;
  const t = ((mid[0] - root[0]) * re[0] + (mid[1] - root[1]) * re[1]) / (L * L);
  const proj: V = [root[0] + re[0] * t, root[1] + re[1] * t];
  const dv: V = sub(mid, proj);
  const d = Math.hypot(dv[0], dv[1]);
  if (d < 1) return null;
  const lat: Vec3 = [dv[0] / d, dv[1] / d, 0];
  const bulge: Vec3 = norm([lat[0] * 0.4, lat[1] * 0.4, 0.92]);
  const knee: Vec3 = [proj[0] + bulge[0] * d, proj[1] + bulge[1] * d, bulge[2] * d];
  const hip: Vec3 = [root[0], root[1], 0];
  const ank: Vec3 = [end[0], end[1], 0];
  const toVec = (a: Vec3, b: Vec3): Vec3 => norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  // coordenadas da tela → 3D de frente: x igual, y igual, z = para a frente
  return { u: toVec(hip, knee), f: toVec(knee, ank), end: heel ? m.dir(sub(tip, heel), 22, FWD) : FWD };
}

/** Quadro 3D a partir do esqueleto 2D. */
export function frameFrom(s: Skeleton, m: Mapper): Frame3 {
  const side = s.view === "side";
  const outN = side ? OUT_N : FWD;
  const outF = side ? OUT_F : FWD;
  const ang = angleOf(s.d);
  // tronco: de lado, direções das duas metades da coluna (com a curvatura); de frente, inclinação + escorço
  let lumbar: Vec3, thorax: Vec3, front: Vec3;
  if (side) {
    const lo = spineDir(ang, s.arch, 0.22);
    const hi = spineDir(ang, s.arch, 0.69);
    lumbar = norm([0, lo[1], lo[0]]);
    thorax = norm([0, hi[1], hi[0]]);
    const n = cw(spineDir(ang, s.arch, 0.5));
    front = norm([0, n[1], n[0]]);
  } else {
    const t = Math.min(1, s.tfs);
    lumbar = norm([s.d[0] * t, s.d[1] * t, Math.sqrt(Math.max(0, 1 - t * t))]);
    thorax = lumbar;
    // frente do peito: o +z da câmera, tirado o componente ao longo da coluna
    const dot = lumbar[2];
    front = norm([-lumbar[0] * dot, -lumbar[1] * dot, 1 - lumbar[2] * dot]);
  }
  const unF = (p: V): V => (side ? [p[0] - DEPTH[0], p[1] - DEPTH[1]] : p);
  const fL = (l: Skeleton["armF"]) => ({ root: unF(l.root), mid: unF(l.mid), end: unF(l.end), tip: unF(l.tip), heel: l.heel ? unF(l.heel) : undefined });
  const aN = s.armN;
  const aF = fL(s.armF);
  const lN = s.legN;
  const lF = fL(s.legF);
  const headDir = m.dir(sub(s.head, s.neck), side ? SEG.neck + SEG.head * 0.85 : (SEG.neck + SEG.head * 0.85), FWD);
  const attach: Record<string, Vec3> = {};
  for (const at of ["traps", "chest", "hip", "back", "shinFront", "shinBack", "thighTop"] as const) attach[at] = m.point(attachPoint(s, at));
  return {
    pelvis: m.point(s.pelvis),
    lumbar,
    thorax,
    head: headDir,
    front,
    // N = lado direito do corpo, F = esquerdo
    armR: limb(m, aN.root, aN.mid, aN.end, aN.tip, SEG.upper, SEG.fore, outN),
    armL: limb(m, aF.root, aF.mid, aF.end, aF.tip, SEG.upper, SEG.fore, outF),
    legR: (!side && frontLeg(m, lN.root, lN.mid, lN.end, lN.tip, lN.heel)) || limb(m, lN.root, lN.mid, lN.end, lN.tip, SEG.thigh, SEG.shin, outN, true, lN.heel),
    legL: (!side && frontLeg(m, lF.root, lF.mid, lF.end, lF.tip, lF.heel)) || limb(m, lF.root, lF.mid, lF.end, lF.tip, SEG.thigh, SEG.shin, outF, true, lF.heel),
    attach,
  };
}

/** Movimento 2D → fonte de quadros 3D (mesmo ritmo e as mesmas regras de alternância/simetria). */
export interface Source3 {
  motion: Motion;
  map: Mapper;
  at(sec: number): Frame3;
  /** duração da fase de força (para o rastro) */
  up: number;
}

export function source3(motion: Motion): Source3 {
  const cx = solve(motion.poses[0], motion.view).pelvis[0];
  const map = mapper(motion.view, cx);
  return {
    motion,
    map,
    at: (sec) => frameFrom(solve(frame(motion, sec), motion.view), map),
    up: 0.95 * (motion.tempo ?? 1),
  };
}

/** Peças fixas do cenário 2D em 3D: segmentos viram barras/placas com largura, polígonos viram blocos. */
export type Static3 =
  | { k: "bar"; a: Vec3; b: Vec3; r: number; tone: string }
  | { k: "slab"; a: Vec3; b: Vec3; thick: number; width: number; tone: string }
  | { k: "block"; pts: [number, number][]; plane: "yz" | "xy"; width: number; tone: string }
  | { k: "roller"; c: Vec3; r: number; width: number; tone: string };

export function staticShapes(shapes: Shape[] | undefined, m: Mapper): Static3[] {
  const out: Static3[] = [];
  const side = m.view === "side";
  for (const sh of shapes ?? []) {
    const tone = sh.tone ?? "bench";
    if (sh.k === "line") {
      const w = (sh.w ?? 8) / 100;
      if (tone === "metal") {
        // estrutura: de lado, um par de barras (uma de cada lado do corpo); de frente, uma barra
        if (side) for (const x of [-0.2, 0.2]) out.push({ k: "bar", a: m.point(sh.a, x), b: m.point(sh.b, x), r: Math.max(0.012, w / 2), tone });
        else out.push({ k: "bar", a: m.point(sh.a), b: m.point(sh.b), r: Math.max(0.012, w / 2), tone });
      } else out.push({ k: "slab", a: m.point(sh.a), b: m.point(sh.b), thick: w, width: side ? 0.34 : 0.3, tone });
    } else if (sh.k === "poly") {
      const pts = sh.pts.map(([x, y]) => [(x - m.cx) / 100, y / 100] as [number, number]);
      out.push({ k: "block", pts, plane: side ? "yz" : "xy", width: 0.42, tone });
    } else {
      out.push({ k: "roller", c: m.point(sh.c), r: sh.r / 100, width: side ? 0.3 : 0.12, tone });
    }
  }
  return out;
}

export type { Prop };
