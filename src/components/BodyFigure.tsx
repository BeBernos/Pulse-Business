import type { ReactNode } from "react";
import { MUSCLES, type MuscleId } from "../lib/muscles";

import { tr } from "../i18n";
/*
 * Figura do corpo (frente/costas) desenhada à mão em SVG, viewBox 200×380.
 * Cada região é desenhada para o lado esquerdo da tela (x < 100) e espelhada.
 */

type Region = { id: MuscleId; d: string };

const SILHOUETTE =
  "M100 56 L91 56 Q89 63 80 66 Q62 69 54 80 Q48 90 47 104 L44 128 Q42 146 40 162 L36 188 Q35 196 39 200 L45 199 L50 170 L55 140 L58 118 L61 112 Q63 132 64 150 Q65 166 69 176 Q66 200 68 226 L71 262 Q69 274 71 288 L72 336 Q71 348 66 356 Q72 362 84 360 L88 350 L89 330 Q92 300 90 286 Q93 270 92 258 L95 222 Q97 202 100 198 Z";

const FRONT: Region[] = [
  { id: "trapezio_sup", d: "M90 58 Q88 64 78 68 L91 70 Z" },
  { id: "delt_ant", d: "M76 69 Q62 70 56 82 Q55 92 59 99 Q66 92 70 84 Q73 76 78 72 Z" },
  { id: "delt_lat", d: "M56 82 Q49 92 50 106 Q54 104 58 100 Q55 92 56 82 Z" },
  { id: "peito_sup", d: "M98 74 L80 73 Q72 76 69 86 L98 86 Z" },
  { id: "peito", d: "M98 88 L69 88 Q67 100 74 108 Q86 114 98 108 Z" },
  { id: "biceps", d: "M59 102 Q52 112 51 128 Q53 138 59 137 Q64 124 64 108 Z" },
  { id: "braquial", d: "M51 130 Q49 138 50 145 L56 142 Q57 138 58 136 Z" },
  { id: "antebraco", d: "M50 147 Q44 164 41 186 L47 188 Q53 168 57 146 Z" },
  { id: "abdomen", d: "M98 112 L86 113 Q85 140 87 168 Q92 174 98 175 Z" },
  { id: "obliquos", d: "M84 113 Q73 114 70 126 Q70 150 74 166 L85 170 Q83 140 84 113 Z" },
  { id: "gluteo_medio", d: "M74 170 Q69 180 69 194 L77 190 Q76 180 80 172 Z" },
  { id: "quadriceps", d: "M88 184 Q78 178 72 196 Q69 222 74 254 Q82 262 90 256 Q91 230 92 210 Z" },
  { id: "adutores", d: "M99 192 L92 196 Q92 220 93 244 Q97 236 99 226 Z" },
  { id: "gastrocnemio", d: "M74 280 Q70 296 73 316 L78 314 Q77 298 79 282 Z" },
  { id: "soleo", d: "M79 300 Q78 318 80 334 L86 334 Q88 316 87 300 Z" },
];

const BACK: Region[] = [
  { id: "trapezio_sup", d: "M99 58 L91 58 Q87 65 76 69 L99 84 Z" },
  { id: "delt_post", d: "M76 70 Q60 71 54 84 Q54 96 58 101 Q64 92 68 84 Q72 76 80 73 Z" },
  { id: "delt_lat", d: "M54 84 Q48 94 50 106 Q55 104 58 101 Q54 94 54 84 Z" },
  { id: "manguito", d: "M86 80 Q76 82 72 90 Q74 98 82 100 Q86 90 88 84 Z" },
  { id: "costas_media", d: "M99 86 L90 82 Q86 92 84 104 Q90 112 99 114 Z" },
  { id: "dorsal", d: "M82 102 Q72 100 69 110 Q70 136 84 152 L99 150 L99 116 Q90 114 82 102 Z" },
  { id: "lombar", d: "M99 152 L86 154 Q84 164 86 174 L99 176 Z" },
  { id: "triceps", d: "M58 103 Q51 112 50 130 Q53 139 59 138 Q65 124 64 106 Z" },
  { id: "antebraco", d: "M50 147 Q44 164 41 186 L47 188 Q53 168 57 146 Z" },
  { id: "gluteo_medio", d: "M84 176 Q74 176 70 186 L80 190 Q80 182 86 178 Z" },
  { id: "gluteo", d: "M99 180 Q84 180 76 192 Q74 210 86 216 Q96 216 99 210 Z" },
  { id: "posterior", d: "M95 220 Q80 216 74 230 Q72 252 78 262 Q88 266 93 256 Q95 238 95 220 Z" },
  { id: "adutores", d: "M99 218 L96 220 Q96 240 97 256 L99 254 Z" },
  { id: "gastrocnemio", d: "M78 276 Q71 292 75 312 Q84 318 89 308 Q91 290 88 276 Z" },
  { id: "soleo", d: "M77 314 Q78 328 81 338 L88 338 Q90 324 89 310 Q84 318 77 314 Z" },
];

export type BodySide = "front" | "back";

export const REGIONS: Record<BodySide, Region[]> = { front: FRONT, back: BACK };

/**
 * `heat`: intensidade 0–1 por músculo (mapa de calor); `selected`: músculos realçados;
 * `onSelect`: torna as regiões tocáveis; `children`: sobreposição no mesmo sistema de coordenadas.
 */
export function BodyFigure({
  side,
  heat,
  selected,
  onSelect,
  width = 180,
  decorative = false,
  children,
}: {
  side: BodySide;
  heat?: Map<MuscleId, number>;
  selected?: ReadonlySet<MuscleId>;
  onSelect?: (m: MuscleId) => void;
  width?: number;
  /** Miniatura ilustrativa: sem nomes de músculos para leitor de tela/toque longo. */
  decorative?: boolean;
  children?: ReactNode;
}) {
  const fillFor = (id: MuscleId) => {
    if (selected?.has(id)) return "var(--accent)";
    const h = heat?.get(id) ?? 0;
    if (h > 0) return `color-mix(in srgb, var(--accent) ${Math.round(18 + h * 82)}%, var(--surface-3))`;
    return "var(--surface-3)";
  };
  const half = (mirror: boolean) => (
    <g transform={mirror ? "translate(200 0) scale(-1 1)" : undefined}>
      <path d={SILHOUETTE} fill="var(--surface-2)" />
      {REGIONS[side].map((r) => (
        <path
          key={r.id}
          d={r.d}
          fill={fillFor(r.id)}
          stroke="var(--bg)"
          strokeWidth="1"
          style={{ cursor: onSelect ? "pointer" : undefined, transition: "fill .25s" }}
          onClick={onSelect ? () => onSelect(r.id) : undefined}
        >
          {!decorative && <title>{tr(MUSCLES[r.id].label)}</title>}
        </path>
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 200 372" width={width} style={{ display: "block", overflow: "visible" }} {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": side === "front" ? tr("Corpo, frente") : tr("Corpo, costas") })}>
      <ellipse cx="100" cy="32" rx="15" ry="19" fill="var(--surface-2)" />
      <rect x="92" y="46" width="16" height="14" rx="4" fill="var(--surface-2)" />
      {half(false)}
      {half(true)}
      {side === "front" && (
        <g stroke="var(--bg)" strokeWidth="1.6" pointerEvents="none">
          <line x1="86" x2="114" y1="128" y2="128" />
          <line x1="86" x2="114" y1="143" y2="143" />
          <line x1="87" x2="113" y1="157" y2="157" />
        </g>
      )}
      {children}
    </svg>
  );
}
