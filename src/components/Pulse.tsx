import type { CSSProperties } from "react";

/** Linha de batimento (marca do Pulse): reta com um "pico" em cada posição de `beats` (0–1 da largura). */
export function ecgPath(w: number, h: number, beats: readonly number[], amp = 1): string {
  const mid = h * 0.62;
  let d = `M0 ${mid}`;
  for (const b of [...beats].sort((a, c) => a - c)) {
    const x = b * w;
    d += ` L${x - 16} ${mid} L${x - 12} ${mid - h * 0.1 * amp} L${x - 8} ${mid} L${x - 4} ${mid} L${x - 1} ${mid - h * 0.58 * amp} L${x + 3} ${mid + h * 0.32 * amp} L${x + 6} ${mid} L${x + 11} ${mid} L${x + 16} ${mid - h * 0.14 * amp} L${x + 22} ${mid}`;
  }
  return `${d} L${w} ${mid}`;
}

export function PulseLine({ width = 340, height = 40, beats = [0.5], color = "var(--accent)", amp = 1, strokeWidth = 2, style, draw = false }: { width?: number; height?: number; beats?: readonly number[]; color?: string; amp?: number; strokeWidth?: number; style?: CSSProperties; draw?: boolean }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block", overflow: "visible", ...style }} aria-hidden>
      <path d={ecgPath(width, height, beats, amp)} className={draw ? "pulse-draw" : undefined} pathLength={draw ? 1 : undefined} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Selo do Pulse: círculo com o batimento dentro. */
export function PulseMark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ display: "block", flex: "none" }}>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M5 17h5.5l2.2-4.5 3.8 9 3-7.5 1.6 3H27" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
