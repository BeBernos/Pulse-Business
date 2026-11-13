/** Músculos usados na contagem de volume (mapeamento em scripts/map-muscles.py). */
export const MUSCLES = {
  peito_sup: { label: "Peitoral superior", region: "Peito" },
  peito: { label: "Peitoral médio/inferior", region: "Peito" },
  delt_ant: { label: "Deltoide anterior", region: "Ombros" },
  delt_lat: { label: "Deltoide lateral", region: "Ombros" },
  delt_post: { label: "Deltoide posterior", region: "Ombros" },
  manguito: { label: "Manguito rotador", region: "Ombros" },
  dorsal: { label: "Dorsal (largura)", region: "Costas" },
  costas_media: { label: "Trapézio médio/romboides", region: "Costas" },
  trapezio_sup: { label: "Trapézio superior", region: "Costas" },
  lombar: { label: "Lombar", region: "Costas" },
  biceps: { label: "Bíceps", region: "Braços" },
  braquial: { label: "Braquial/braquiorradial", region: "Braços" },
  triceps: { label: "Tríceps", region: "Braços" },
  antebraco: { label: "Antebraço", region: "Braços" },
  abdomen: { label: "Abdômen", region: "Core" },
  obliquos: { label: "Oblíquos", region: "Core" },
  gluteo: { label: "Glúteo máximo", region: "Pernas" },
  gluteo_medio: { label: "Glúteo médio (abdutores)", region: "Pernas" },
  quadriceps: { label: "Quadríceps", region: "Pernas" },
  posterior: { label: "Posterior de coxa", region: "Pernas" },
  adutores: { label: "Adutores", region: "Pernas" },
  gastrocnemio: { label: "Gastrocnêmio", region: "Pernas" },
  soleo: { label: "Sóleo", region: "Pernas" },
} as const;

export type MuscleId = keyof typeof MUSCLES;

export interface MuscleMap {
  primary: MuscleId[];
  secondary: MuscleId[];
}

/** Peso de cada série: músculo principal conta 1, secundário 0,5 (séries fracionadas). */
export const SECONDARY_WEIGHT = 0.5;

/**
 * Soma séries por músculo. `entries` = [mapa de músculos do exercício, nº de séries de trabalho].
 * Exercícios sem mapa (criados na importação) entram em `unmapped`.
 */
export function muscleVolume(entries: { muscles?: MuscleMap; sets: number; name: string }[]): {
  volume: Map<MuscleId, number>;
  unmapped: string[];
} {
  const volume = new Map<MuscleId, number>();
  const unmapped: string[] = [];
  for (const { muscles, sets, name } of entries) {
    if (!muscles) {
      if (sets > 0) unmapped.push(name);
      continue;
    }
    for (const m of muscles.primary) volume.set(m, (volume.get(m) ?? 0) + sets);
    for (const m of muscles.secondary) volume.set(m, (volume.get(m) ?? 0) + sets * SECONDARY_WEIGHT);
  }
  return { volume, unmapped: [...new Set(unmapped)] };
}

/** Faixa de volume semanal recomendada (séries efetivas/semana por músculo). */
export const VOLUME_ZONE = { min: 10, max: 20 };
