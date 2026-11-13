import { useEffect, useMemo, useRef, useState } from "react";
import { motionFor } from "../lib/motion";
import { bounds, frame, render, trail, type Box, type Color, type Prim } from "../lib/motion/draw";
import type { MuscleMap } from "../lib/muscles";

const COLORS: Record<Color, string> = {
  torso: "#9aa1b3",
  near: "#bcc1cd",
  far: "#5c6273",
  head: "#a9afbe",
  m1: "#ff3b5c",
  m2: "rgba(255, 59, 92, 0.42)",
  bench: "#2d2e3b",
  metal: "#545a6c",
  dark: "#16161e",
  pad: "#3d3f50",
  plate: "#868c9e",
  plateFill: "rgba(134, 140, 158, 0.14)",
  cable: "#8f96a8",
  trail: "rgba(245, 185, 66, 0.75)",
};

function Shape({ p }: { p: Prim }) {
  if (p.t === "line") return <line x1={p.a[0]} y1={p.a[1]} x2={p.b[0]} y2={p.b[1]} stroke={COLORS[p.c]} strokeWidth={p.w} strokeLinecap="round" />;
  if (p.t === "path") return <polyline points={p.pts.map((v) => `${v[0]},${v[1]}`).join(" ")} fill="none" stroke={COLORS[p.c]} strokeWidth={p.w} strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" />;
  if (p.t === "circle") return <circle cx={p.c[0]} cy={p.c[1]} r={p.r} fill={p.fill ? COLORS[p.fill] : "none"} stroke={p.stroke ? COLORS[p.stroke] : undefined} strokeWidth={p.sw} />;
  return <polygon points={p.pts.map((v) => `${v[0]},${v[1]}`).join(" ")} fill={COLORS[p.fill]} stroke={COLORS[p.fill]} strokeWidth={3} strokeLinejoin="round" />;
}

const BOXES = new Map<string, Box>();

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Animação do exercício desenhada pelo app (boneco próprio, músculos trabalhados em destaque).
 * `animate=false` mostra a posição de contração; `keyframe` fixa uma pose-chave (galeria).
 */
export function MotionFigure({ name, group, muscles, animate = true, keyframe, height, aspect = 1.25, className, label }: { name: string; group?: string; muscles?: MuscleMap; animate?: boolean; keyframe?: number; height?: number | string; aspect?: number; className?: string; label?: string }) {
  const m = useMemo(() => motionFor(name, group), [name, group]);
  const box = useMemo(() => {
    const key = `${name}|${aspect}`;
    let b = BOXES.get(key);
    if (!b) BOXES.set(key, (b = bounds(m, aspect)));
    return b;
  }, [m, name, aspect]);
  const ref = useRef<SVGSVGElement>(null);
  const [sec, setSec] = useState(0);
  const [paused, setPaused] = useState(() => reducedMotion());
  const playing = animate && keyframe === undefined && !paused;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let acc = 0;
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => (visible = e.isIntersecting)) : null;
    if (ref.current) io?.observe(ref.current);
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (visible && !document.hidden) {
        acc += dt;
        setSec(acc);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [playing]);

  const tempo = m.tempo ?? 1;
  const staticSec = keyframe === undefined ? 0.95 * tempo + 0.15 : keyframe === 0 ? 0 : (0.95 * tempo * keyframe) / Math.max(1, m.poses.length - 1);
  const pose = frame(m, playing || (animate && keyframe === undefined && paused && sec > 0) ? sec : staticSec);
  const prims = render(m, pose, muscles);
  const path = useMemo(() => (animate && keyframe === undefined ? trail(m) : []), [m, animate, keyframe]);
  const vb = `${box.x} ${-box.y - box.h} ${box.w} ${box.h}`;

  return (
    <svg
      ref={ref}
      className={className}
      viewBox={vb}
      style={{ width: "100%", height: height ?? "auto", display: "block", cursor: animate ? "pointer" : undefined }}
      role={label === "" ? undefined : "img"}
      aria-hidden={label === "" ? true : undefined}
      aria-label={label === "" ? undefined : label ?? `Movimento: ${name}`}
      onClick={animate ? () => setPaused((p) => !p) : undefined}
    >
      <g transform="scale(1,-1)">
        {!m.noFloor && <line x1={box.x} y1={0} x2={box.x + box.w} y2={0} stroke="#262733" strokeWidth={2} />}
        {prims.map((p, i) => <Shape key={i} p={p} />)}
        {path.map((p, i) => <Shape key={`t${i}`} p={p} />)}
      </g>
    </svg>
  );
}
