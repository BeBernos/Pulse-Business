/**
 * Cena 3D (three.js, carregado só quando a pessoa abre o 3D). Desenho próprio do app:
 * boneco com volumes anatômicos (cada músculo é uma peça — fica vermelho quando trabalha), equipamento,
 * sombra no chão, rastro do movimento e câmera que gira com o dedo.
 *
 * Duas fontes de movimento:
 * - poses feitas à mão (`Motion3`, ângulos das articulações) para os exercícios em que o 3D muda tudo (giros, aberturas);
 * - qualquer outro exercício: o próprio movimento 2D convertido quadro a quadro (`from2d.ts`).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildBody, type LimbG } from "./body";
import type { Attach, Prop } from "../motion/draw";
import { dir as dir2 } from "../motion/rig";
import type { MuscleMap } from "../muscles";
import { source3, staticShapes, type Frame3, type Limb3, type Source3, type Static3 } from "./from2d";
import { DIM, pose3At, type Arm3, type Equip3, type Leg3, type Motion3, type Pose3, type Vec3 } from "./poses";

const RAD = Math.PI / 180;
const C = {
  skin: 0xa7aec0,
  skin2: 0x949bae,
  joint: 0x8a90a2,
  m1: 0xff3b5c,
  m2: 0xd0687c,
  bench: 0x2b2c38,
  benchTop: 0x3b3d4e,
  metal: 0x6b7184,
  dark: 0x1b1c24,
  pad: 0x454859,
  plate: 0x2f323d,
  plateRim: 0x8f96a8,
  floor: 0x14141b,
  cable: 0xd5d9e3,
  trail: 0xf5b942,
};

export type Input3 = { kind: "angles"; motion: Motion3 } | { kind: "from2d"; motion: Parameters<typeof source3>[0] };

export interface View3D {
  dispose(): void;
  setView(v: "front" | "side" | "back" | "top" | "oblique"): void;
  setPlaying(on: boolean): void;
  /** pula para o instante `sec` do ciclo (pausa) */
  seek(sec: number): void;
  /** conferência: posições (m) de mãos, pés e pelve agora */
  probe(): Record<string, number[]>;
}

type Mat = THREE.MeshStandardMaterial;
const std = (color: number, rough = 0.62, metal = 0.04): Mat => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

const V = (v: Vec3 | readonly number[]) => new THREE.Vector3(v[0], v[1], v[2]);
const UP = new THREE.Vector3(0, 1, 0);

/** Quaternion de uma base com o eixo y em `y` e o z o mais perto possível de `zHint`. */
function basis(y: THREE.Vector3, zHint: THREE.Vector3, fallback: THREE.Vector3 = UP): THREE.Quaternion {
  const yy = y.clone().normalize();
  let z = zHint.clone().addScaledVector(yy, -zHint.dot(yy));
  if (z.lengthSq() < 0.02) {
    z = fallback.clone().addScaledVector(yy, -fallback.dot(yy));
    if (z.lengthSq() < 0.02) z = new THREE.Vector3(0, 0, 1).addScaledVector(yy, -yy.z);
  }
  z.normalize();
  const x = new THREE.Vector3().crossVectors(yy, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, yy, z));
}

/** Rotação local de `child` para ter orientação de mundo `world`, dado o pai. */
function setWorldQuat(obj: THREE.Object3D, world: THREE.Quaternion) {
  const parentQ = obj.parent ? obj.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  obj.quaternion.copy(parentQ.invert().multiply(world));
  obj.updateMatrixWorld(true);
}

export function mount(host: HTMLElement, input: Input3, muscles?: MuscleMap): View3D {
  const W = () => host.clientWidth || 300;
  const H = () => host.clientHeight || 260;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe4ff, 0x141419, 0.55));
  const key = new THREE.DirectionalLight(0xfff6ee, 1.9);
  key.position.set(1.6, 3.6, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.8;
  key.shadow.camera.bottom = -2.2;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 9;
  key.shadow.bias = -0.0008;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9d8fff, 1.1);
  rim.position.set(-2.5, 2, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffd9c4, 0.35);
  fill.position.set(-2, 1, 2.5);
  scene.add(fill);

  const cast = (o: THREE.Object3D) => {
    o.traverse((x) => {
      if ((x as THREE.Mesh).isMesh) x.castShadow = true;
    });
    return o;
  };

  // ---------- ambiente (reflexos suaves de estúdio) ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.32;

  // ---------- corpo (superfícies lisas; músculos pintados na pele) ----------
  const materials: THREE.Material[] = [];
  const body = buildBody(muscles, null, (m) => materials.push(m));
  const { root, pelvis, lumbar, chest, headG, armL, armR, legL, legR, LUMBAR } = body;
  scene.add(root);
  void LUMBAR;

  // ---------- poses por ângulo (feitas à mão) ----------
  const axis = new THREE.Vector3();
  function swing(l: LimbG, e: number, p: number, t: number) {
    const s = l.left ? 1 : -1;
    axis.set(-Math.sin(p * RAD), 0, s * Math.cos(p * RAD));
    l.plane.quaternion.setFromAxisAngle(axis, e * RAD);
    l.twist.rotation.set(0, s * t * RAD, 0);
  }
  function applyAngles(p: Pose3) {
    root.position.set(...p.root);
    pelvis.rotation.set((p.rot?.[0] ?? 0) * RAD, (p.rot?.[1] ?? 0) * RAD, (p.rot?.[2] ?? 0) * RAD);
    const [fl, lat, tw] = p.spine ?? [0, 0, 0];
    lumbar.rotation.set((fl / 2) * RAD, (tw / 2) * RAD, (lat / 2) * RAD);
    chest.rotation.set((fl / 2) * RAD, (tw / 2) * RAD, (lat / 2) * RAD);
    headG.rotation.set((p.head ?? 0) * RAD, 0, 0);
    const arm = (l: LimbG, a: Arm3) => {
      swing(l, a.e, a.p, a.t ?? 0);
      l.joint.rotation.set(-a.el * RAD, 0, 0);
      l.end.rotation.set(0, 0, 0);
    };
    const leg = (l: LimbG, g: Leg3) => {
      swing(l, g.e, g.p, g.t ?? 0);
      l.joint.rotation.set(g.kn * RAD, 0, 0);
      l.end.rotation.set(-(g.ank ?? 0) * RAD, 0, 0);
    };
    arm(armL, p.armL);
    arm(armR, p.armR);
    leg(legL, p.legL);
    leg(legR, p.legR);
    scene.updateMatrixWorld(true);
  }

  // ---------- quadros vindos do 2D ----------
  function aimLimb(l: LimbG, d: Limb3, bodyFront: THREE.Vector3) {
    const u = V(d.u);
    const f = V(d.f);
    // de que lado está a "frente" do osso: o joelho dobra para trás, o cotovelo para a frente
    const bend = f.clone().addScaledVector(u, -f.dot(u));
    const w = Math.min(1, bend.length() / 0.35);
    const fromBend = bend.normalize().multiplyScalar(l.leg ? -1 : 1);
    const hint = fromBend.multiplyScalar(w).addScaledVector(bodyFront, 1 - w);
    const qU = basis(u.clone().negate(), hint, l.leg ? UP : bodyFront);
    l.twist.quaternion.identity();
    setWorldQuat(l.plane, qU);
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(qU);
    const yL = f.clone().negate().normalize();
    const zL = new THREE.Vector3().crossVectors(x, yL).normalize();
    const xL = new THREE.Vector3().crossVectors(yL, zL).normalize();
    const qL = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xL, yL, zL));
    setWorldQuat(l.joint, qL);
    const e = V(d.end);
    // mão: segue os dedos; pé: ponta para `end`, sola para baixo
    let qE: THREE.Quaternion;
    if (l.leg) {
      const zf = e.clone().normalize();
      const yf = UP.clone().addScaledVector(zf, -zf.dot(UP));
      if (yf.lengthSq() < 0.02) yf.copy(zL);
      yf.normalize();
      const xf = new THREE.Vector3().crossVectors(yf, zf).normalize();
      qE = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xf, yf, zf));
    } else qE = basis(e.clone().negate(), zL);
    setWorldQuat(l.end, qE);
  }
  function applyFrame(fr: Frame3) {
    root.position.set(...fr.pelvis);
    pelvis.quaternion.identity();
    lumbar.quaternion.identity();
    chest.quaternion.identity();
    headG.quaternion.identity();
    root.updateMatrixWorld(true);
    const front = V(fr.front);
    setWorldQuat(pelvis, basis(V(fr.lumbar), front));
    setWorldQuat(chest, basis(V(fr.thorax), front));
    setWorldQuat(headG, basis(V(fr.head), front));
    const chestFront = new THREE.Vector3(0, 0, 1).applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion()));
    const pelvisFront = new THREE.Vector3(0, 0, 1).applyQuaternion(pelvis.getWorldQuaternion(new THREE.Quaternion()));
    aimLimb(armL, fr.armL, chestFront);
    aimLimb(armR, fr.armR, chestFront);
    aimLimb(legL, fr.legL, pelvisFront);
    aimLimb(legR, fr.legR, pelvisFront);
    scene.updateMatrixWorld(true);
  }

  // ---------- pontos do corpo (mundo) ----------
  const wp = (o: THREE.Object3D, local: Vec3 = [0, 0, 0]) => o.localToWorld(new THREE.Vector3(...local));
  const hand = (l: LimbG) => wp(l.end, [0, -0.045, 0]);
  const sole = (l: LimbG) => wp(l.end, [0, -0.06, 0.06]);
  let lastFrame: Frame3 | null = null;
  function attachPos(at: Attach): THREE.Vector3 {
    switch (at) {
      case "handN": return hand(armR);
      case "handF": return hand(armL);
      case "hands": return hand(armR).add(hand(armL)).multiplyScalar(0.5);
      case "footN": return sole(legR);
      case "footF": return sole(legL);
      case "feet": return sole(legR).add(sole(legL)).multiplyScalar(0.5);
      case "ankleN": return wp(legR.end);
      case "kneeN": return wp(legR.joint);
      case "knees": return wp(legR.joint).add(wp(legL.joint)).multiplyScalar(0.5);
      case "elbowN": return wp(armR.joint);
      case "elbows": return wp(armR.joint).add(wp(armL.joint)).multiplyScalar(0.5);
      default: {
        const p = lastFrame?.attach[at];
        return p ? V(p) : wp(pelvis);
      }
    }
  }
  const lateral = () => new THREE.Vector3(1, 0, 0).applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion())).normalize();

  // ---------- equipamento ----------
  const tones: Record<string, Mat> = { bench: std(C.bench, 0.8), metal: std(C.metal, 0.35, 0.6), dark: std(C.dark, 0.8), pad: std(C.pad, 0.7), benchTop: std(C.benchTop, 0.75) };
  const plateM = std(C.plate, 0.5, 0.3);
  const rimM = std(C.plateRim, 0.35, 0.6);
  const metalM = tones.metal;
  const dynamic: (() => void)[] = [];
  const statics: THREE.Object3D[] = [];
  const addStatic = (o: THREE.Object3D) => {
    o.traverse((x) => {
      if ((x as THREE.Mesh).isMesh) {
        x.castShadow = true;
        x.receiveShadow = true;
      }
    });
    scene.add(o);
    statics.push(o);
  };
  const barBetween = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => {
    const l = a.distanceTo(b) || 0.001;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    return mesh;
  };
  function disc(r: number, thick: number) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thick, 28), plateM);
    g.add(p);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.97, thick * 0.32, 6, 28), rimM);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, thick * 1.2, 12), metalM);
    g.add(hub);
    return g;
  }
  /** halter: pegador no eixo x local, anilhas nas pontas */
  function dumbbell() {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 10), metalM);
    bar.rotation.z = Math.PI / 2;
    g.add(bar);
    for (const s of [-1, 1]) {
      const d = disc(0.065, 0.045);
      d.rotation.z = Math.PI / 2;
      d.position.x = s * 0.095;
      g.add(d);
    }
    return cast(g);
  }
  function barbell(r: number) {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.0, 12), metalM);
    bar.rotation.z = Math.PI / 2;
    g.add(bar);
    if (r > 0.02) {
      for (const s of [-1, 1]) {
        for (const k of [0, 1]) {
          const d = disc(r * (k ? 0.85 : 1), 0.04);
          d.rotation.z = Math.PI / 2;
          d.position.x = s * (0.72 + k * 0.045);
          g.add(d);
        }
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), metalM);
        collar.rotation.z = Math.PI / 2;
        collar.position.x = s * 0.66;
        g.add(collar);
      }
    }
    return cast(g);
  }
  /** orienta um grupo cujo eixo x deve seguir o lado do corpo */
  const alongLateral = (g: THREE.Object3D) => g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), lateral());

  // peças fixas e dinâmicas a partir do 2D
  function addStatics(list: Static3[]) {
    for (const s of list) {
      const m = tones[s.tone] ?? tones.bench;
      if (s.k === "bar") addStatic(barBetween(V(s.a), V(s.b), s.r, m));
      else if (s.k === "slab") {
        const a = V(s.a);
        const b = V(s.b);
        const l = a.distanceTo(b) || 0.01;
        const along = b.clone().sub(a).normalize();
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(s.width, l, Math.max(0.03, s.thick)), s.tone === "bench" ? tones.benchTop : m);
        g.add(body);
        g.position.copy(a).add(b).multiplyScalar(0.5);
        // eixo y local ao longo do segmento; x = lateral do mundo
        const side = new THREE.Vector3(1, 0, 0);
        const zz = new THREE.Vector3().crossVectors(side, along).normalize();
        const xx = new THREE.Vector3().crossVectors(along, zz).normalize();
        g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx.lengthSq() > 0.5 ? xx : side, along, zz.lengthSq() > 0.5 ? zz : new THREE.Vector3(0, 0, 1)));
        addStatic(g);
      } else if (s.k === "block") {
        const shape = new THREE.Shape(s.pts.map(([a, b]) => new THREE.Vector2(a, b)));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: s.width, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
        const mesh = new THREE.Mesh(geo, m);
        if (s.plane === "yz") {
          // forma no plano (z, y), extrudada em x
          mesh.rotation.y = -Math.PI / 2;
          mesh.position.x = s.width / 2;
        } else mesh.position.z = -s.width / 2;
        addStatic(mesh);
      } else {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, s.width, 18), m);
        c.rotation.z = Math.PI / 2;
        c.position.copy(V(s.c));
        addStatic(c);
      }
    }
  }

  function addProp2D(p: Prop, src: Source3) {
    const side = src.map.view === "side";
    switch (p.k) {
      case "barbell": {
        const g = barbell(((p.r ?? 21) / 100) * 1.0);
        scene.add(g);
        dynamic.push(() => {
          g.position.copy(attachPos(p.at));
          alongLateral(g);
        });
        break;
      }
      case "dumbbell": {
        const ends = p.at === "handN" ? [armR] : p.at === "handF" ? [armL] : [armR, armL];
        for (const l of ends) {
          const g = dumbbell();
          // pegada neutra (de lado) ou pronada (de frente, halter na horizontal)
          g.position.set(0, -0.05, 0.004);
          if (!side && p.o !== "v") g.rotation.y = 0;
          l.end.add(g);
        }
        break;
      }
      case "plate":
      case "wheel": {
        const r = p.k === "wheel" ? 0.09 : (p.r ?? 15) / 100;
        const g = cast(disc(r, p.k === "wheel" ? 0.05 : 0.035));
        scene.add(g);
        dynamic.push(() => {
          g.position.copy(attachPos(p.at));
          // de lado a anilha fica de frente para a câmera lateral (eixo = lado do corpo)
          g.quaternion.setFromUnitVectors(UP, side ? lateral() : new THREE.Vector3(0, 0, 1));
        });
        break;
      }
      case "ball": {
        const g = new THREE.Mesh(new THREE.SphereGeometry((p.r ?? 11) / 100, 24, 18), std(0x5a4a8a, 0.6));
        g.castShadow = true;
        scene.add(g);
        dynamic.push(() => g.position.copy(attachPos(p.at)));
        break;
      }
      case "kettlebell": {
        const g = new THREE.Group();
        const bell = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 16), plateM);
        bell.position.y = -0.11;
        g.add(bell);
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20), metalM);
        handle.position.y = -0.02;
        g.add(handle);
        cast(g);
        scene.add(g);
        dynamic.push(() => {
          g.position.copy(attachPos(p.at));
          alongLateral(g);
        });
        break;
      }
      case "cable": {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: C.cable }));
        scene.add(line);
        const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), metalM);
        pulley.rotation.z = Math.PI / 2;
        scene.add(pulley);
        dynamic.push(() => {
          const h = attachPos(p.at);
          const from = V(src.map.point(p.from));
          if (side) from.x = h.x;
          pulley.position.copy(from);
          const pos = geo.attributes.position as THREE.BufferAttribute;
          pos.setXYZ(0, from.x, from.y, from.z);
          pos.setXYZ(1, h.x, h.y, h.z);
          pos.needsUpdate = true;
        });
        break;
      }
      case "lever": {
        // braço da máquina: de lado, um para cada mão (por fora do corpo); barra T (presa no chão) e
        // alavancas no tronco ficam no meio; de frente, a do ponto indicado
        const handLike = ["hands", "handN", "handF", "elbowN", "elbows"].includes(p.at);
        const central = !handLike || p.pivot[1] < 20;
        const which: (LimbG | null)[] = central ? [null] : side ? [armR, armL] : [p.at === "handF" ? armL : armR];
        for (const l of which) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 12), metalM);
          bar.castShadow = true;
          scene.add(bar);
          const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 14), tones.dark);
          pivot.rotation.z = Math.PI / 2;
          scene.add(pivot);
          const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10), tones.pad);
          scene.add(grip);
          dynamic.push(() => {
            const elbow = p.at === "elbowN" || p.at === "elbows";
            const h = l && side ? (elbow ? wp(l.joint) : hand(l)) : attachPos(p.at);
            const out = l && side ? Math.sign(h.x || (l.left ? 1 : -1)) * 0.07 : 0;
            const pv = V(src.map.point(p.pivot));
            if (side) pv.x = l ? h.x + out : 0;
            const tip = l && side ? h.clone().setX(h.x + out) : h;
            pivot.position.copy(pv);
            bar.position.copy(pv).add(tip).multiplyScalar(0.5);
            bar.scale.y = Math.max(0.01, pv.distanceTo(tip));
            bar.quaternion.setFromUnitVectors(UP, tip.clone().sub(pv).normalize());
            grip.position.copy(h);
            grip.visible = handLike;
            grip.quaternion.setFromUnitVectors(UP, lateral());
          });
        }
        break;
      }
      case "handle": {
        // puxador: de uma mão à outra (com sobra), ou curto numa mão só
        const g = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1, 10), metalM);
        g.castShadow = true;
        scene.add(g);
        const both = p.at === "hands" || p.at === "elbows";
        dynamic.push(() => {
          g.position.copy(attachPos(p.at));
          if (both) {
            const a = hand(armR);
            const b = hand(armL);
            g.scale.y = Math.max(0.2, a.distanceTo(b) + 0.22);
            g.quaternion.setFromUnitVectors(UP, b.sub(a).normalize());
          } else {
            g.scale.y = 0.14;
            g.quaternion.setFromUnitVectors(UP, lateral());
          }
        });
        break;
      }
      case "pad": {
        const r = (p.r ?? 6) / 100;
        const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, side ? 0.34 : 0.14, 16), tones.pad);
        g.castShadow = true;
        scene.add(g);
        dynamic.push(() => {
          g.position.copy(attachPos(p.at));
          g.quaternion.setFromUnitVectors(UP, side ? lateral() : new THREE.Vector3(0, 0, 1));
        });
        break;
      }
      case "platform": {
        const g = new THREE.Group();
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.6, 0.05), tones.bench);
        g.add(plate);
        cast(g);
        scene.add(g);
        dynamic.push(() => {
          const d2 = dir2(p.ang);
          const n = V(src.map.dir(d2, 1, [0, 0, 0]));
          g.position.copy(attachPos(p.at)).addScaledVector(n, 0.06);
          g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        });
        break;
      }
      case "carriage": {
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, (p.w ?? 56) / 100), tones.pad);
        g.castShadow = true;
        scene.add(g);
        dynamic.push(() => {
          const a = attachPos(p.at);
          const pt = V(src.map.point([0, p.y]));
          g.position.set(0, pt.y, a.z + (p.dx ?? 0) / 100);
        });
        break;
      }
    }
  }

  function addEquip3(e: Equip3) {
    if (e.k === "box") {
      const b = new THREE.Mesh(new THREE.BoxGeometry(...e.size), e.tone === "metal" ? tones.metal : e.tone === "pad" ? tones.pad : tones.bench);
      b.position.set(...e.pos);
      addStatic(b);
    } else if (e.k === "dumbbell") {
      const g = dumbbell();
      g.position.set(0, -0.05, 0.004);
      g.rotation.y = Math.PI / 2;
      (e.hand === "L" ? armL : armR).end.add(g);
    } else if (e.k === "plate") {
      const p = cast(disc(0.12, 0.03));
      scene.add(p);
      dynamic.push(() => {
        p.position.copy(attachPos("hands"));
        p.quaternion.copy(chest.getWorldQuaternion(new THREE.Quaternion()));
        p.rotateX(Math.PI / 2);
      });
    } else if (e.k === "cable") {
      const geo = new THREE.BufferGeometry().setFromPoints([V(e.from), new THREE.Vector3()]);
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: C.cable })));
      const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), metalM);
      pulley.position.set(...e.from);
      scene.add(pulley);
      dynamic.push(() => {
        const h = hand(e.hand === "L" ? armL : armR);
        const pos = geo.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(1, h.x, h.y, h.z);
        pos.needsUpdate = true;
      });
    } else if (e.k === "kneePad") {
      const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.12, 4, 10), tones.pad);
      pad.position.set(e.side === "L" ? 0.1 : -0.1, -DIM.thigh + 0.06, 0);
      pad.castShadow = true;
      (e.side === "L" ? legL : legR).twist.add(pad);
    }
  }

  // ---------- fonte do movimento ----------
  let poseAt: (sec: number) => void;
  let tempoUp: number;
  let viewHint: "side" | "front" | "back" = "side";
  if (input.kind === "angles") {
    const m = input.motion;
    poseAt = (sec) => applyAngles(pose3At(m.poses, sec, m.tempo));
    tempoUp = 0.95 * (m.tempo ?? 1);
    for (const e of m.equip ?? []) addEquip3(e);
    viewHint = "front";
  } else {
    const src = source3(input.motion);
    poseAt = (sec) => {
      lastFrame = src.at(sec);
      applyFrame(lastFrame);
    };
    tempoUp = input.motion.loop ? input.motion.loop : src.up;
    addStatics(staticShapes(input.motion.scene, src.map));
    viewHint = input.motion.view;
    poseAt(0);
    for (const p of input.motion.props ?? []) addProp2D(p, src);
  }
  // movimento fluido: cada articulação segue a pose-alvo com amortecimento (sem trancos nem viradas bruscas)
  const joints: THREE.Object3D[] = [pelvis, lumbar, chest, headG, ...[armL, armR, legL, legR].flatMap((l) => [l.plane, l.twist, l.joint, l.end])];
  const prevQ = joints.map((o) => o.quaternion.clone());
  const prevRoot = new THREE.Vector3();
  let hasPrev = false;
  const apply = (sec: number, dt = 0) => {
    poseAt(sec);
    if (dt > 0 && hasPrev) {
      const k = 1 - Math.exp(-dt * 15);
      joints.forEach((o, i) => {
        prevQ[i].slerp(o.quaternion, k);
        o.quaternion.copy(prevQ[i]);
      });
      prevRoot.lerp(root.position, k);
      root.position.copy(prevRoot);
      // respiração bem leve
      chest.scale.y = 1 + Math.sin(sec * 2.1) * 0.006;
      scene.updateMatrixWorld(true);
    } else {
      joints.forEach((o, i) => prevQ[i].copy(o.quaternion));
      prevRoot.copy(root.position);
    }
    hasPrev = true;
    for (const f of dynamic) f();
  };

  // ---------- rastro + enquadramento (amostra o movimento) ----------
  const box = new THREE.Box3();
  const ends = [() => hand(armR), () => hand(armL), () => sole(legR), () => sole(legL), () => wp(armR.joint), () => wp(legR.joint), () => wp(pelvis)];
  const paths: THREE.Vector3[][] = ends.map(() => []);
  const N = 24;
  const loopLike = input.kind === "from2d" && (input.motion.loop || input.motion.hold);
  const sampleSpan = input.kind === "from2d" && input.motion.loop ? input.motion.loop : 3;
  for (let i = 0; i <= N; i++) {
    apply(loopLike ? (i / N) * sampleSpan : (i / N) * tempoUp);
    ends.forEach((f, j) => paths[j].push(f()));
    box.expandByPoint(wp(headG, [0, 0.27, 0]));
    for (const f of ends) box.expandByPoint(f());
  }
  for (let i = 0; i < 8; i++) {
    apply((i / 8) * 3);
    for (const f of ends) box.expandByPoint(f());
  }
  // a câmera enquadra o corpo (e o que ele carrega); o chão cobre também o aparelho
  box.expandByPoint(new THREE.Vector3(box.min.x, 0, box.min.z));
  const all = box.clone();
  for (const s of statics) all.expandByObject(s);
  const pathLen = (pts: THREE.Vector3[]) => pts.slice(1).reduce((a, v, i) => a + v.distanceTo(pts[i]), 0);
  if (!loopLike) {
    const lens = paths.map(pathLen).map((l, j) => (j >= 2 ? l * 0.8 : l) * (j === 6 ? 0.9 : 1));
    const max = Math.max(...lens);
    if (max > 0.1) {
      const pick = lens.map((l, j) => ({ l, j })).filter((x) => x.l >= max * 0.75 && x.j < 4).slice(0, 2);
      if (!pick.length) pick.push({ l: max, j: lens.indexOf(max) });
      for (const { j } of pick) {
        const pts = paths[j];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: C.trail, dashSize: 0.035, gapSize: 0.028, transparent: true, opacity: 0.9 }));
        line.computeLineDistances();
        scene.add(line);
        const end = pts[pts.length - 1];
        let k = pts.length - 2;
        while (k > 0 && pts[k].distanceTo(end) < 0.05) k--;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 12), new THREE.MeshBasicMaterial({ color: C.trail }));
        cone.position.copy(end);
        cone.quaternion.setFromUnitVectors(UP, end.clone().sub(pts[k]).normalize());
        scene.add(cone);
      }
    }
  }

  // chão: disco que recebe a sombra
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const allSize = all.getSize(new THREE.Vector3());
  const R = Math.max(1.1, Math.min(2.4, Math.hypot(allSize.x, allSize.z) * 0.6 + 0.35));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 64), std(C.floor, 0.95));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, 0, center.z);
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.025, R, 72), new THREE.MeshBasicMaterial({ color: 0x2a2b37 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(center.x, 0.002, center.z);
  scene.add(ring);
  key.target.position.copy(center);
  scene.add(key.target);

  // ---------- câmera ----------
  const FOV = 32;
  const camera = new THREE.PerspectiveCamera(FOV, W() / H(), 0.05, 40);
  const target = center.clone();
  const radius = Math.max(0.75, size.length() / 2) * 1.08;
  const baseDist = () => (radius / Math.sin((FOV / 2) * RAD)) * 0.95 * Math.max(1, 1.0 / (W() / H()));
  const fixedDist = input.kind === "angles" && input.motion.dist ? input.motion.dist : 0;
  const az0 = input.kind === "angles" ? input.motion.azimuth ?? 35 : viewHint === "side" ? -55 : 28;
  const place = (az: number, el: number) => {
    const d = fixedDist ? fixedDist * Math.max(1, 1.15 / (W() / H())) : baseDist();
    camera.position.set(target.x + d * Math.sin(az * RAD) * Math.cos(el * RAD), target.y + d * Math.sin(el * RAD), target.z + d * Math.cos(az * RAD) * Math.cos(el * RAD));
    camera.lookAt(target);
  };
  if (input.kind === "angles" && input.motion.target) target.set(...input.motion.target);
  const el0 = input.kind === "angles" ? input.motion.elev ?? 18 : 18;
  place(az0, el0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 0.8;
  controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI * 0.6;
  controls.update();

  // ---------- laço ----------
  let playing = !matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let visible = true;
  let sec = tempoUp + 0.1;
  let last = performance.now();
  let raf = 0;
  apply(sec);
  const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => (visible = e.isIntersecting)) : null;
  io?.observe(host);
  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          renderer.setSize(W(), H());
          camera.aspect = W() / H();
          camera.updateProjectionMatrix();
        })
      : null;
  ro?.observe(host);
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (visible && !document.hidden) {
      if (playing) {
        sec += dt;
        apply(sec, dt);
      }
      controls.update();
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      io?.disconnect();
      ro?.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mm = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
        else mm?.dispose();
      });
      materials.forEach((m) => m.dispose());
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    setView(v) {
      const map = { front: [0, 8], side: [-90, 6], back: [180, 8], top: [0, 78], oblique: [az0, el0] } as const;
      const [az, el] = map[v];
      place(az, el);
      controls.update();
    },
    setPlaying(on) {
      playing = on;
    },
    seek(t) {
      playing = false;
      sec = t;
      apply(sec);
    },
    probe() {
      const r = (v: THREE.Vector3) => v.toArray().map((x) => Math.round(x * 1000) / 1000);
      return { camera: r(camera.position), target: r(target), size: r(size), handR: r(hand(armR)), handL: r(hand(armL)), hands: r(attachPos("hands")), footR: r(sole(legR)), footL: r(sole(legL)), pelvis: r(wp(pelvis)), head: r(wp(headG, [0, 0.15, 0])), kneeR: r(wp(legR.joint)), kneeL: r(wp(legL.joint)), ankleL: r(wp(legL.end)), shoulderR: r(wp(armR.plane)), elbowR: r(wp(armR.joint)), wristR: r(wp(armR.end)) };
    },
  };
}
