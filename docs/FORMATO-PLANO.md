# Formato `app-treino/plan@1`

Contrato entre os chats do Claude (onde os treinos são montados) e o app. O Claude gera **um arquivo `.json`** (ou, se não der, um bloco ```json) neste formato; o usuário escolhe o arquivo (ou cola o texto) em **Treinos → Importar do Claude**. As instruções para o Claude ficam em **Ajustes → Copiar instruções para o Claude** (formato + biblioteca + suas cargas). O app valida, mostra uma pré-visualização com avisos e só então importa.

O schema executável fica em [`src/lib/plan.ts`](../src/lib/plan.ts). Um exemplo completo e real é [`src/data/seed-plan.json`](../src/data/seed-plan.json) (bloco Ago–Out 2026).

## Princípio: cargas explícitas

O app **não extrapola cargas**. Toda carga que muda de semana para semana (agachamento/terra ondulados, por exemplo) vem escrita em `byWeek`, semana a semana. O app antigo mostrava projeções automáticas não validadas (ciclos 3–4) como prescrição; isso acabou.

## Estrutura

```jsonc
{
  "format": "app-treino/plan@1",            // obrigatório, literal
  "block": {
    "id": "2026-nov-jan",                    // único; reimportar o mesmo id substitui o plano
    "name": "Nov–Jan 2026 · Upper/Lower",
    "startDate": "2026-10-26",               // AAAA-MM-DD. A semana 1 é a semana seg–dom que contém esta data
    "weeks": 8,
    "deloadWeeks": [8],                      // semanas de deload (opcional)
    "weekLabels": { "1": "C1 · Tipo 1" },    // rótulo por semana (opcional)
    "goal": "texto livre",                   // opcional
    "notes": "texto livre"                   // opcional
  },
  "schedule": {                              // dia da semana → key do treino, ou null (descanso)
    "mon": "A", "tue": "B", "wed": null, "thu": "C", "fri": "D", "sat": "E", "sun": null
  },
  "rotation": { "pattern": ["A", "B", "C", null], "start": "2026-10-26" }, // opcional: ciclo que substitui o schedule (null = descanso; start padrão = block.startDate)
  "deload": { "setsFactor": 0.5 },           // em deload, exercícios sem byWeek fazem ceil(séries × fator)
  "days": [
    {
      "key": "A",                            // 1–3 caracteres, único
      "name": "Push",
      "focus": "peito superior e ombro lateral", // opcional: o foco do dia (aparece em Treinos)
      "color": "#FF3B5C",                    // opcional; NUNCA verde (o app troca e avisa)
      "warmup": ["Running in place 2 min"],  // opcional, texto livre (prefira exercícios com "block", abaixo)
      "cooldown": ["..."],                   // opcional, texto livre
      "cardio": "ClimbMill Z2 20–25 min",    // opcional, texto livre (prefira um exercício com "cardio")
      "exercises": [ /* ver abaixo — pode ficar vazio enquanto o dia é montado no app */ ]
    }
  ],
  "restrictions": [                          // opcional
    { "exercise": "Wide Stance Barbell Squats", "type": "suspended", "until": "2026-10-31", "reason": "joelho esq." },
    { "exercise": "Lying Triceps Extension with a Barbell", "type": "vetoed", "reason": "cotovelo dir." }
  ],
  "notes": ["Descanso: compostos 2–3 min"], // opcional
  "volumeTargets": { "delt_lat": 16, "peito_sup": 10 }, // opcional: meta de séries/semana por músculo (ids abaixo)
  "rationale": {                             // opcional: a análise por trás do bloco (Treinos → Por que este plano)
    "summary": "a lógica do bloco",
    "priorities": [ { "area": "Deltoide lateral", "why": "11 séries/sem no bloco anterior; ponto fraco" } ],
    "method": "séries, repetições, RIR, descanso e progressão — e por quê"
  }
}
```

### Exercício

| Campo | Tipo | Padrão | Uso |
|---|---|---|---|
| `name` | string | — | **Nome exato da biblioteca** (nome do app da academia, em inglês). Nome desconhecido gera aviso e vira exercício novo. |
| `sets` | inteiro | 3 | Séries de trabalho (ignorado se houver `byWeek` para a semana). |
| `reps` | inteiro ou texto | 10 | Fixo (`6`) ou texto (`"45 s"`). O usuário prefere números fixos a faixas. |
| `kg` | número ou null | — | Carga fixa (ex.: puxada 82 kg). |
| `restSec` | inteiro | 90 | Descanso em segundos; dispara o cronômetro. |
| `rir` | texto | — | Ex.: `"1–3"`. Em deload o app mostra `3–4`. |
| `perSide` | bool | false | Unilateral, reps por lado. |
| `priority` | bool | false | Destaque visual (grupos prioritários). |
| `main` | bool | false | Exercício-chave do dia (vai para o destaque da tela Hoje). |
| `sub` | texto | — | Substituto único (troca com 1 toque no treino). |
| `handle` | texto | — | Qual puxador do kit anatômico usar. **Obrigatório em cabo/puxada.** |
| `notes` | texto | — | Observação curta. |
| `why` | texto | — | Por que este exercício e essa prescrição (séries/reps/RIR). Aparece no treino ("Por que este exercício") e no editor do dia. |
| `block` | `"warmup"` \| `"main"` \| `"cooldown"` | `"main"` | Parte do dia: aquecimento, treino ou volta à calma. No treino aparecem com título. Use exercícios do grupo **Mobilidade** (ex.: `Cat-Cow`, `World's Greatest Stretch`, `Doorway Chest Stretch`). Ficam fora do volume por músculo e dos recordes. |
| `cardio` | objeto | — | Exercício de cardio com métricas (grupo **Cardio**: `Treadmill`, `Treadmill Incline Walk`, `Stationary Bike`, `ClimbMill`, `StairMaster`). Vira **uma sessão** (não séries) e, no treino, campos para o que foi feito. Ver abaixo. |
| `superset` | texto (até 4) | — | Rótulo do superset (ex.: `"S1"`). Exercícios **em sequência** com o mesmo rótulo formam o grupo: no treino o app pula para o próximo do grupo sem descanso e só descansa (`restSec` do último) ao fim da rodada. Mínimo 2 exercícios. |
| `byWeek` | objeto | — | Prescrição explícita por semana (chaves `"1"`, `"2"`…). |

`byWeek["N"]`:

```json
{ "ramp": [{"kg": 60, "reps": 5}, {"kg": 90, "reps": 2}],
  "sets": [{"kg": 115, "reps": 6}, {"kg": 130, "reps": 4}, {"kg": 140, "reps": 3}, {"kg": 150, "reps": 2}],
  "note": "texto opcional mostrado no treino" }
```

A rampa vira séries de aquecimento (A1, A2…) com montagem de anilhas. Semanas sem entrada em `byWeek` caem no `sets`/`reps`/`kg` padrão.

### Cardio com métricas

```json
{ "name": "Treadmill Incline Walk", "cardio": { "min": 25, "kmh": 5.5, "incline": 10, "bpm": 125, "zone": "Z2" } }
```

Todos os campos são opcionais (metas): `machine` (`treadmill` | `bike` | `stairs`; padrão: o da biblioteca), `min`, `km`, `kmh`, `incline` (%), `rpm`, `level`, `floors`, `bpm`, `kcal`, `zone` (texto). No treino o app pede as métricas do aparelho:

| Aparelho | Registra |
|---|---|
| Esteira | tempo, distância, velocidade, inclinação, FC média, kcal |
| Bicicleta | tempo, distância, rpm, nível, FC média, kcal |
| Escada (ClimbMill/StairMaster) | tempo, andares, nível, FC média, kcal |

Planos antigos (sem `block`/`cardio`) continuam válidos.

## Validação no app

Erros (bloqueiam a importação): JSON inválido, campo obrigatório ausente, `schedule` apontando para dia inexistente, `key` duplicada, deload fora do bloco, superset fora de sequência ou com 1 exercício só.

Avisos (não bloqueiam): exercício ou substituto fora da biblioteca, exercício **vetado** programado, `byWeek` fora do intervalo do bloco.

## Relatório de volta (`app-treino/log@1`)

Em **Histórico → Relatório** o app copia um resumo das sessões para colar no chat:

```json
{ "format": "app-treino/log@1", "from": "2026-10-19", "to": "2026-10-25",
  "sessions": [ { "date": "2026-10-19", "week": 13, "day": "A — Push", "durationMin": 74, "fatigue": 3,
                  "pains": [{"area": "Joelho esq.", "intensity": 3, "note": "..."}],
                  "exercises": [ { "name": "45° Incline Dumbbell Bench Press", "sets": ["30×6 @2RIR", "30×6"] } ] } ] }
```

`estimatedMin` é a duração prevista pelo plano e `avgRestSec` o descanso médio real (intervalo entre séries marcadas). `measures` traz as medidas corporais registradas no período (peso, cintura…). `composition` traz, nas datas com medida, `{date, weight, bodyFat, method, leanKg, fatKg, ffmi}` — `method` = `medido` (bioimpedância/dobras), `marinha` (fita: pescoço + cintura [+ quadril] + altura) ou `rfm` (cintura + altura); estimativas têm erro de ±3–4 pontos, valem pela tendência.

`sets` traz só séries de trabalho concluídas: `kg×reps @RIR` (`PC` = peso corporal); em alongamento por tempo, `"30 s"`. Cardio vem como `"cardio": { "min": 25, "km": 2.4, "bpm": 124, … }`. `block` aparece em aquecimento/volta à calma. `planned` aparece quando o exercício foi trocado pelo substituto; `skipped` quando não foi feito.

### Metas de volume (`volumeTargets`)

Opcional. Séries por semana que o bloco quer em cada músculo (principal = 1 série, secundário = ½ — a mesma conta do app). O Progresso mostra a meta na barra de cada músculo e o resumo da semana diz se bateu.
Ids: `peito_sup`, `peito`, `delt_ant`, `delt_lat`, `delt_post`, `manguito`, `dorsal`, `costas_media`, `trapezio_sup`, `lombar`, `biceps`, `braquial`, `triceps`, `antebraco`, `abdomen`, `obliquos`, `gluteo`, `gluteo_medio`, `quadriceps`, `posterior`, `adutores`, `gastrocnemio`, `soleo`.
