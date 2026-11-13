/**
 * Boneco 3D (desenho próprio do app): superfícies lisas feitas por "loft" — anéis elípticos ao longo de cada osso,
 * com perfil anatômico (coxa larga em cima, panturrilha, antebraço, tórax) e pontas arredondadas.
 *
 * Músculos: pintados na própria pele por um shader. Cada pedaço do corpo conhece, em cada ponto, a posição ao longo
 * do osso (`t`, 0 = articulação de cima) e o ângulo em volta dele (`a`, 0 = frente, 90 = para fora do corpo,
 * 180 = trás, -90 = para dentro). Uma região = faixa de `t` × setor de ângulo; acende em vermelho com borda suave.
 */
import * as THREE from "three";
import type { MuscleId, MuscleMap } from "../muscles";
import { DIM, type Vec3 } from "./poses";

const RAD = Math.PI / 180;

/** Estação do perfil: fração `t` ao longo do osso, meia-largura `rx` (lado), meia-espessura `rz` (frente/trás), deslocamento `dz` para a frente. */
type Station = [t: number, rx: number, rz: number, dz?: number];

/** Catmull-Rom nos perfis (curva suave entre as estações). */
function profileAt(st: Station[], t: number): [number, number, number] {
  if (t <= st[0][0]) return [st[0][1], st[0][2], st[0][3] ?? 0];
  const last = st[st.length - 1];
  if (t >= last[0]) return [last[1], last[2], last[3] ?? 0];
  let i = 0;
  while (i < st.length - 2 && t > st[i + 1][0]) i++;
  const p0 = st[Math.max(0, i - 1)];
  const p1 = st[i];
  const p2 = st[i + 1];
  const p3 = st[Math.min(st.length - 1, i + 2)];
  const u = (t - p1[0]) / (p2[0] - p1[0] || 1);
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return [1, 2, 3].map((k) => Math.max(0.001, cr(p0[k] ?? 0, p1[k] ?? 0, p2[k] ?? 0, p3[k] ?? 0))) as [number, number, number];
}

/**
 * Tubo liso ao longo do eixo y (de 0 até `dir * len`), com tampas em cúpula.
 * `mirror` = membro direito (o lado de fora é -x): o atributo de ângulo continua "90 = para fora".
 */
export function loft(len: number, st: Station[], opts: { dir?: 1 | -1; mirror?: boolean; seg?: number; rings?: number; caps?: boolean } = {}): THREE.BufferGeometry {
  const dir = opts.dir ?? -1;
  const SEG = opts.seg ?? 28;
  const RINGS = opts.rings ?? 22;
  const caps = opts.caps ?? true;
  const pos: number[] = [];
  const seg: number[] = [];
  const idx: number[] = [];
  const ring = (t: number, scale: number, yOff: number) => {
    const [rx, rz, dz] = profileAt(st, t);
    const y = dir * (t * len + yOff);
    for (let j = 0; j <= SEG; j++) {
      const a = Math.PI + (j / SEG) * Math.PI * 2; // costura atrás (0 = frente)
      const sx = Math.sin(a) * (opts.mirror ? -1 : 1);
      pos.push(sx * rx * scale, y, dz + Math.cos(a) * rz * scale);
      // ângulo guardado como cosseno/seno: interpola certo em volta (sem salto de 180 para -180)
      seg.push(Math.min(1, Math.max(0, t)), Math.cos(a), Math.sin(a));
    }
  };
  // cúpula de cima (t < 0), corpo, cúpula de baixo (t > 1)
  const CAP = caps ? 5 : 0;
  const r0 = profileAt(st, 0);
  const r1 = profileAt(st, 1);
  const rows: [number, number, number][] = [];
  for (let k = CAP; k >= 1; k--) {
    const phi = (k / CAP) * (Math.PI / 2) * 0.96;
    rows.push([0, Math.cos(phi), -Math.sin(phi) * Math.min(r0[0], r0[1]) * 0.9]);
  }
  for (let i = 0; i <= RINGS; i++) rows.push([i / RINGS, 1, 0]);
  for (let k = 1; k <= CAP; k++) {
    const phi = (k / CAP) * (Math.PI / 2) * 0.96;
    rows.push([1, Math.cos(phi), Math.sin(phi) * Math.min(r1[0], r1[1]) * 0.9]);
  }
  for (const [t, sc, off] of rows) ring(t, sc, off);
  const W = SEG + 1;
  for (let r = 0; r < rows.length - 1; r++)
    for (let j = 0; j < SEG; j++) {
      const a = r * W + j;
      const b = a + W;
      // ordem dos triângulos com normal para fora (depende do sentido e do espelho)
      if ((dir < 0) !== !!opts.mirror) idx.push(a, b, a + 1, a + 1, b, b + 1);
      else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSeg", new THREE.Float32BufferAttribute(seg, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // costura: a primeira e a última coluna de cada anel são o mesmo ponto — média das normais (sem risco visível)
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let r = 0; r < rows.length; r++) {
    const a = r * W;
    const b = a + SEG;
    const x = (n.getX(a) + n.getX(b)) / 2, y = (n.getY(a) + n.getY(b)) / 2, z = (n.getZ(a) + n.getZ(b)) / 2;
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

// ---------- músculos pintados na pele ----------

/** Região: músculo(s), faixa ao longo do osso [t0, t1], centro do setor (graus) e meia-abertura (graus). */
export type Region = [ids: MuscleId[], t0: number, t1: number, center: number, half: number];

const MAX_R = 10;
const BASE = new THREE.Color(0xa9b0bf);
const M1 = new THREE.Color(0xff2448);
const M2 = new THREE.Color(0xf0708a);

/** Material da pele com as regiões do exercício acesas (primário forte, secundário mais claro). */
export function skinMaterial(regions: Region[], muscles: MuscleMap | undefined, env?: THREE.Texture | null): THREE.MeshStandardMaterial {
  const prim = new Set(muscles?.primary ?? []);
  const sec = new Set(muscles?.secondary ?? []);
  const active = regions
    .map(([ids, t0, t1, c, h]) => ({ ids, t0, t1, c, h, lvl: ids.some((i) => prim.has(i)) ? 2 : ids.some((i) => sec.has(i)) ? 1 : 0 }))
    .filter((r) => r.lvl > 0)
    .slice(0, MAX_R);
  const m = new THREE.MeshStandardMaterial({ color: BASE, roughness: 0.6, metalness: 0.0, envMap: env ?? null, envMapIntensity: 0.5 });
  if (!active.length) return m;
  const uR = active.map((r) => new THREE.Vector4(r.t0, r.t1, r.c, r.h));
  while (uR.length < MAX_R) uR.push(new THREE.Vector4(2, 2, 0, 0));
  const uL = active.map((r) => r.lvl);
  while (uL.length < MAX_R) uL.push(0);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uR = { value: uR };
    sh.uniforms.uL = { value: uL };
    sh.uniforms.uM1 = { value: M1 };
    sh.uniforms.uM2 = { value: M2 };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aSeg;\nvarying vec3 vSeg;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSeg = aSeg;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vSeg;
uniform vec4 uR[${MAX_R}];
uniform float uL[${MAX_R}];
uniform vec3 uM1;
uniform vec3 uM2;
float pulseMask(out float lvl) {
  float best = 0.0; lvl = 0.0;
  for (int i = 0; i < ${MAX_R}; i++) {
    vec4 r = uR[i];
    if (uL[i] < 0.5) continue;
    // elipse (formato de ventre muscular) no mapa "ao longo do osso × em volta dele", borda suave
    float ang = degrees(atan(vSeg.z, vSeg.y));
    float da = (mod(ang - r.z + 540.0, 360.0) - 180.0) / max(r.w, 1.0);
    float dt = (vSeg.x - 0.5 * (r.x + r.y)) / max(0.5 * (r.y - r.x), 0.02);
    float k = 1.0 - smoothstep(0.45, 1.05, length(vec2(da, dt)));
    if (k > best) { best = k; lvl = uL[i]; }
  }
  return best;
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float pLvl; float pK = pulseMask(pLvl);
vec3 pCol = pLvl > 1.5 ? uM1 : uM2;
diffuseColor.rgb = mix(diffuseColor.rgb, pCol, pK * (pLvl > 1.5 ? 0.9 : 0.6));`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += pCol * pK * pK * (pLvl > 1.5 ? 0.32 : 0.1);`,
      );
  };
  m.customProgramCacheKey = () => `pulse-skin-${active.length}`;
  return m;
}

// ---------- o boneco ----------

export interface LimbG {
  plane: THREE.Group;
  twist: THREE.Group;
  joint: THREE.Group;
  end: THREE.Group;
  leg: boolean;
  left: boolean;
}

export interface Body {
  root: THREE.Group;
  pelvis: THREE.Group;
  lumbar: THREE.Group;
  chest: THREE.Group;
  headG: THREE.Group;
  armL: LimbG;
  armR: LimbG;
  legL: LimbG;
  legR: LimbG;
  /** comprimento da lombar (o tórax começa aqui) */
  LUMBAR: number;
}

// perfis anatômicos (metros)
const PELVIS: Station[] = [[0, 0.135, 0.092, -0.008], [0.35, 0.165, 0.108, -0.014], [0.7, 0.16, 0.1, -0.006], [1, 0.145, 0.092, 0]];
const LUMB: Station[] = [[0, 0.145, 0.094, 0], [0.45, 0.13, 0.086, 0.004], [1, 0.152, 0.097, 0.006]];
const THORAX: Station[] = [[0, 0.152, 0.097, 0.006], [0.3, 0.168, 0.106, 0.01], [0.58, 0.178, 0.112, 0.014], [0.82, 0.172, 0.104, 0.006], [1, 0.13, 0.08, -0.008]];
const NECK: Station[] = [[0, 0.05, 0.05, -0.005], [0.5, 0.042, 0.044, 0], [1, 0.044, 0.046, 0.004]];
const UPPER: Station[] = [[0, 0.056, 0.052, 0], [0.18, 0.054, 0.05, 0.002], [0.45, 0.046, 0.046, 0.004], [0.8, 0.039, 0.037, 0], [1, 0.037, 0.035, 0]];
const FORE: Station[] = [[0, 0.038, 0.036, 0], [0.22, 0.042, 0.037, 0.002], [0.6, 0.033, 0.027, 0], [1, 0.025, 0.019, 0]];
const HAND: Station[] = [[0, 0.024, 0.016, 0], [0.4, 0.031, 0.015, 0.002], [0.8, 0.029, 0.013, 0.002], [1, 0.018, 0.01, 0]];
const THIGH: Station[] = [[0, 0.09, 0.088, -0.006], [0.22, 0.084, 0.08, 0], [0.6, 0.068, 0.066, 0.006], [0.9, 0.054, 0.052, 0.004], [1, 0.051, 0.05, 0]];
const SHIN: Station[] = [[0, 0.05, 0.048, 0], [0.16, 0.053, 0.056, -0.012], [0.36, 0.048, 0.05, -0.01], [0.72, 0.033, 0.032, -0.002], [1, 0.029, 0.028, 0]];
const FOOT: Station[] = [[0, 0.034, 0.03, 0], [0.35, 0.042, 0.032, 0], [0.75, 0.046, 0.024, 0], [1, 0.036, 0.016, 0]];

// regiões dos músculos em cada pedaço (ângulo: 0 frente, 90 para fora, 180 trás, -90 para dentro)
const R_PELVIS: Region[] = [[["gluteo"], 0.0, 0.7, 150, 42], [["gluteo"], 0.0, 0.7, -150, 42], [["gluteo_medio"], 0.35, 0.95, 100, 34], [["gluteo_medio"], 0.35, 0.95, -100, 34]];
const R_LUMB: Region[] = [[["abdomen"], -0.15, 1.15, 0, 34], [["obliquos"], 0.0, 1.0, 68, 26], [["obliquos"], 0.0, 1.0, -68, 26], [["lombar"], -0.1, 0.9, 162, 22], [["lombar"], -0.1, 0.9, -162, 22]];
const R_THORAX: Region[] = [
  [["peito"], 0.4, 0.88, 32, 34],
  [["peito"], 0.4, 0.88, -32, 34],
  [["peito_sup"], 0.68, 1.0, 30, 30],
  [["peito_sup"], 0.68, 1.0, -30, 30],
  [["abdomen"], -0.1, 0.4, 0, 30],
  [["dorsal"], 0.0, 0.78, 122, 36],
  [["dorsal"], 0.0, 0.78, -122, 36],
  [["costas_media"], 0.45, 1.0, 180, 34],
];
// na cintura escapular (deitada de um ombro ao outro) o ângulo -90 aponta para cima: trapézio = alto e atrás
const R_TRAPS: Region[] = [[["trapezio_sup"], 0.08, 0.92, -135, 60], [["manguito"], 0.1, 0.3, 180, 30], [["manguito"], 0.7, 0.9, 180, 30]];
const R_UPPER: Region[] = [
  [["delt_ant"], -0.12, 0.36, 22, 52],
  [["delt_lat"], -0.12, 0.38, 92, 48],
  [["delt_post"], -0.12, 0.36, 160, 52],
  [["biceps"], 0.28, 0.9, 0, 52],
  [["triceps"], 0.16, 0.92, 180, 62],
  [["braquial"], 0.5, 0.95, 66, 30],
];
const R_FORE: Region[] = [[["antebraco"], -0.05, 0.72, 0, 120], [["antebraco"], -0.05, 0.72, 180, 120]];
const R_THIGH: Region[] = [[["quadriceps"], 0.05, 0.97, 10, 70], [["posterior"], 0.1, 0.95, 180, 58], [["adutores"], -0.05, 0.62, -92, 40]];
const R_SHIN: Region[] = [[["gastrocnemio"], 0.0, 0.55, 180, 66], [["soleo"], 0.42, 0.86, 180, 56]];

/** Monta o boneco. `env`: reflexo de ambiente (deixa a pele com volume). */
export function buildBody(muscles: MuscleMap | undefined, env: THREE.Texture | null, track: (m: THREE.Material) => void): Body {
  const mk = (regions: Region[]) => {
    const m = skinMaterial(regions, muscles, env);
    track(m);
    return m;
  };
  const plain = mk([]);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const x = new THREE.Mesh(g, m);
    x.castShadow = true;
    x.receiveShadow = true;
    return x;
  };

  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  root.add(pelvis);
  // bacia: de 9 cm abaixo do quadril até 10 cm acima
  const pel = mesh(loft(0.19, PELVIS, { dir: 1 }), mk(R_PELVIS));
  pel.position.y = -0.09;
  pelvis.add(pel);

  const LUMBAR = 0.225;
  const lumbar = new THREE.Group();
  lumbar.rotation.order = "YXZ";
  lumbar.position.y = 0.0;
  pelvis.add(lumbar);
  const lum = mesh(loft(LUMBAR + 0.03, LUMB, { dir: 1 }), mk(R_LUMB));
  lum.position.y = 0.0;
  lumbar.add(lum);

  const chest = new THREE.Group();
  chest.rotation.order = "YXZ";
  chest.position.y = LUMBAR;
  lumbar.add(chest);
  const thoraxLen = DIM.sho - LUMBAR + 0.06;
  const tho = mesh(loft(thoraxLen, THORAX, { dir: 1 }), mk(R_THORAX));
  tho.position.y = -0.02;
  chest.add(tho);
  // ombros: cintura escapular lisa de um ombro ao outro (com o trapézio em cima)
  const girdle = mesh(loft(2 * DIM.shoW, [[0, 0.05, 0.052, -0.006], [0.25, 0.058, 0.06, -0.012], [0.5, 0.05, 0.062, -0.016], [0.75, 0.058, 0.06, -0.012], [1, 0.05, 0.052, -0.006]], { dir: 1 }), mk(R_TRAPS));
  girdle.rotation.z = -Math.PI / 2;
  girdle.position.set(-DIM.shoW, DIM.sho - LUMBAR - 0.012, 0);
  chest.add(girdle);

  const headG = new THREE.Group();
  headG.position.y = DIM.neck - LUMBAR;
  chest.add(headG);
  const neck = mesh(loft(0.1, NECK, { dir: 1 }), plain);
  neck.position.y = -0.03;
  headG.add(neck);
  const skull = mesh(new THREE.SphereGeometry(1, 32, 24), plain);
  skull.scale.set(0.088, 0.108, 0.098);
  skull.position.set(0, 0.155, 0.004);
  headG.add(skull);
  const jaw = mesh(new THREE.SphereGeometry(1, 24, 18), plain);
  jaw.scale.set(0.068, 0.05, 0.07);
  jaw.position.set(0, 0.098, 0.03);
  headG.add(jaw);
  // nariz discreto: mostra para onde o rosto aponta
  const nose = mesh(new THREE.SphereGeometry(1, 12, 10), plain);
  nose.scale.set(0.014, 0.02, 0.016);
  nose.position.set(0, 0.145, 0.1);
  headG.add(nose);

  function limb(parent: THREE.Object3D, at: Vec3, leg: boolean, left: boolean): LimbG {
    const mirror = !left;
    const plane = new THREE.Group();
    plane.position.set(...at);
    parent.add(plane);
    const twist = new THREE.Group();
    plane.add(twist);
    const joint = new THREE.Group();
    const end = new THREE.Group();
    if (!leg) {
      twist.add(mesh(loft(DIM.upper, UPPER, { mirror }), mk(R_UPPER)));
      joint.position.y = -DIM.upper;
      twist.add(joint);
      joint.add(mesh(loft(DIM.fore, FORE, { mirror }), mk(R_FORE)));
      end.position.y = -DIM.fore;
      joint.add(end);
      const hand = mesh(loft(0.095, HAND, { mirror }), plain);
      hand.position.y = 0.006;
      end.add(hand);
      const thumb = mesh(loft(0.05, [[0, 0.012, 0.011], [0.6, 0.011, 0.01], [1, 0.008, 0.008]]), plain);
      thumb.position.set(left ? -0.012 : 0.012, -0.012, 0.016);
      thumb.rotation.set(-0.7, 0, left ? -0.35 : 0.35);
      end.add(thumb);
    } else {
      twist.add(mesh(loft(DIM.thigh, THIGH, { mirror }), mk(R_THIGH)));
      joint.position.y = -DIM.thigh;
      twist.add(joint);
      joint.add(mesh(loft(DIM.shin, SHIN, { mirror }), mk(R_SHIN)));
      const cap = mesh(new THREE.SphereGeometry(1, 16, 12), plain);
      cap.scale.set(0.03, 0.034, 0.02);
      cap.position.set(0, -0.004, 0.044);
      joint.add(cap);
      end.position.y = -DIM.shin;
      joint.add(end);
      // pé: do calcanhar à ponta (+z), sola um pouco abaixo do tornozelo
      const foot = mesh(loft(0.25, FOOT, { dir: 1 }), new THREE.MeshStandardMaterial({ color: 0x8d93a5, roughness: 0.6, envMap: env ?? null, envMapIntensity: 0.4 }));
      track(foot.material as THREE.Material);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(0, -0.04, -0.06);
      foot.scale.set(1, 1, 1.15);
      end.add(foot);
    }
    return { plane, twist, joint, end, leg, left };
  }
  const armL = limb(chest, [DIM.shoW, DIM.sho - LUMBAR, 0], false, true);
  const armR = limb(chest, [-DIM.shoW, DIM.sho - LUMBAR, 0], false, false);
  const legL = limb(pelvis, [DIM.hipW, 0, 0], true, true);
  const legR = limb(pelvis, [-DIM.hipW, 0, 0], true, false);
  return { root, pelvis, lumbar, chest, headG, armL, armR, legL, legR, LUMBAR };
}

export { RAD };
