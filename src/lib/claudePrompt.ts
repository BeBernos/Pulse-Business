/** Lista da biblioteca que vai junto das instruções para o Claude: só nomes válidos, por grupo, sem vetados. */
export function libraryForPrompt(exercises: { name: string; group: string; vetoed?: boolean }[], vetoed: ReadonlySet<string> = new Set()): string {
  const byGroup = new Map<string, string[]>();
  for (const e of exercises) {
    if (e.vetoed || vetoed.has(e.name)) continue;
    byGroup.set(e.group, [...(byGroup.get(e.group) ?? []), e.name]);
  }
  const groups = [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  const lines = groups.map(([g, names]) => `${g}: ${names.sort((a, b) => a.localeCompare(b)).join(" | ")}`);
  return `Minha biblioteca (use SOMENTE estes nomes, copiados exatamente; nomes separados por " | "):\n${lines.join("\n")}`;
}

/** Instruções do formato do plano para o Claude (copiadas em Ajustes e entregues pelo conector do Claude). Sempre em português. */
export const PROMPT_FOR_CLAUDE = `Quando eu pedir um plano de treino para o meu app, gere UM ARQUIVO para baixar chamado plano-<id>.json (sem nada fora do JSON), no formato abaixo (app-treino/plan@1). Se não conseguir criar arquivo, mande UM bloco \`\`\`json completo. Regras:
- Use exatamente os nomes de exercício da minha biblioteca (nomes do app da academia, em inglês).
- Nada de exercício vetado. Restrições ativas vão em "restrictions".
- "byWeek" só para exercícios com carga que muda por semana (ex.: agachamento/terra ondulado): informe rampa e séries de trabalho explícitas em kg. O app NÃO extrapola cargas.
- Sem "byWeek", use sets/reps/kg fixos; em semanas de deload o app corta as séries pelo "deload.setsFactor".
- reps pode ser número ou texto ("45 s"). restSec em segundos. perSide=true para unilaterais por lado.
- "handle" = qual puxador do kit anatômico usar (obrigatório em cabo/puxada).
- Cores dos dias: nunca verde.
- Supersets: mesmo "superset" (ex.: "S1") em exercícios consecutivos; o descanso do último vale para a rodada.
- Divisão: "schedule" por dia da semana, OU "rotation": { "pattern": ["A","B","C",null] } para ciclo (null = descanso).
- startDate em AAAA-MM-DD; a semana 1 é a semana (seg–dom) que contém essa data.
- Metas de volume do bloco em "volumeTargets": séries por semana por músculo (principal 1, secundário ½), com os ids: peito_sup, peito, delt_ant, delt_lat, delt_post, manguito, dorsal, costas_media, trapezio_sup, lombar, biceps, braquial, triceps, antebraco, abdomen, obliquos, gluteo, gluteo_medio, quadriceps, posterior, adutores, gastrocnemio, soleo. Ex.: { "delt_lat": 16, "peito_sup": 10 }.
- Explique as escolhas DENTRO do JSON (o app mostra): "rationale" do bloco (summary = a lógica do bloco; priorities = músculos/áreas a melhorar e por quê; method = séries, repetições, RIR, descanso e progressão e por quê), "focus" em cada dia e "why" em cada exercício principal (por que ele, por que essas séries/reps).
- Aquecimento/volta à calma com exercícios da biblioteca (grupo Mobilidade): "block": "warmup" ou "cooldown", em ordem no início/fim do dia. Alongamento por tempo: reps "30 s" (perSide=true se for por lado).
- Pilates (grupo Pilates: colchonete, Reformer, Cadillac, Chair) e Funcional (grupo Funcional): nomes exatos da biblioteca; reps ou tempo ("45 s"), descanso curto.
- Cardio com métricas (grupo Cardio: Treadmill, Treadmill Incline Walk, Stationary Bike, ClimbMill, StairMaster): um exercício com "cardio": { "min": 20, "kmh": 6, "incline": 8, "level": 7, "bpm": 120, "zone": "Z2" } (só as metas que importam). No treino eu registro tempo, distância, FC, kcal etc.

{
  "format": "app-treino/plan@1",
  "block": { "id": "2026-nov-jan", "name": "Nov–Jan 2026", "startDate": "2026-10-26", "weeks": 8, "deloadWeeks": [8],
             "weekLabels": { "1": "C1 · Tipo 1" }, "goal": "...", "notes": "..." },
  "schedule": { "mon": "A", "tue": "B", "wed": null, "thu": "C", "fri": "D", "sat": "E", "sun": null },
  "deload": { "setsFactor": 0.5 },
  "days": [
    { "key": "A", "name": "Push", "color": "#FF3B5C", "focus": "peito superior e ombro lateral",
      "exercises": [
        { "name": "Running in place", "block": "warmup", "sets": 1, "reps": "2 min", "restSec": 0 },
        { "name": "Band Shoulder Dislocates", "block": "warmup", "sets": 2, "reps": 10, "restSec": 15 },
        { "name": "45° Incline Dumbbell Bench Press", "sets": 4, "reps": 6, "restSec": 180, "rir": "1–3", "main": true,
          "why": "prioridade do bloco: peitoral superior; 4×6 pesado para força com volume moderado" },
        { "name": "Wide Grip Lat Pulldown", "sets": 4, "reps": 8, "kg": 82, "restSec": 150, "rir": "1–3",
          "sub": "Hammer Machine Lat Pulldown", "handle": "Puxador largo", "priority": true },
        { "name": "Barbell Deadlift", "restSec": 180, "main": true,
          "byWeek": { "1": { "ramp": [{"kg":60,"reps":5},{"kg":80,"reps":2}],
                             "sets": [{"kg":100,"reps":6},{"kg":105,"reps":6},{"kg":110,"reps":5},{"kg":115,"reps":5}] } } },
        { "name": "ClimbMill", "cardio": { "min": 22, "level": 7, "bpm": 120, "zone": "Z2 (110–128 bpm)" } },
        { "name": "Doorway Chest Stretch", "block": "cooldown", "sets": 1, "reps": "30 s", "perSide": true, "restSec": 0 }
      ] }
  ],
  "restrictions": [ { "exercise": "Lying Triceps Extension with a Barbell", "type": "vetoed", "reason": "cotovelo direito" } ],
  "rationale": { "summary": "...", "priorities": [ { "area": "Deltoide lateral", "why": "..." } ], "method": "..." },
  "volumeTargets": { "delt_lat": 16, "peito_sup": 10 },
  "notes": ["..."]
}`;
