export const DEFAULT_BAR_KG = 20;
export const DEFAULT_PLATES = [20, 10, 5, 2.5];

export interface PlateLoad {
  /** Anilhas por lado, da mais pesada para a mais leve. */
  perSide: number[];
  /** Sobra que não fecha com as anilhas disponíveis (por lado). */
  remainder: number;
  barOnly: boolean;
}

/** Montagem gulosa da barra (20 → 10 → 5 → 2,5), igual ao dashboard antigo. */
export function plateLoad(total: number, bar = DEFAULT_BAR_KG, plates: readonly number[] = DEFAULT_PLATES): PlateLoad {
  if (total <= bar) return { perSide: [], remainder: 0, barOnly: true };
  let side = (total - bar) / 2;
  const perSide: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    const q = Math.floor((side + 1e-9) / p);
    for (let i = 0; i < q; i++) perSide.push(p);
    side = +(side - q * p).toFixed(3);
  }
  return { perSide, remainder: side > 0.01 ? side : 0, barOnly: false };
}

export const PLATE_COLORS: Record<string, string> = {
  "25": "#D64541",
  "20": "#2E86DE",
  "15": "#FF8A3D",
  "10": "#F5B942",
  "5": "#E4E2DD",
  "2.5": "#D64541",
  "1.25": "#8E8CA3",
};
