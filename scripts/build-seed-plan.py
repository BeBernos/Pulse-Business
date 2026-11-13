"""Gera src/data/seed-plan.json: o bloco Ago–Out 2026 no formato app-treino/plan@1.

Reproduz a lógica do dashboard antigo (treino-ago-out-2026-app.html): ondulação de 3 semanas,
+5 kg por ciclo, deload na semana 7 e rampas calculadas a partir da 1ª série de trabalho.
As cargas ficam explícitas por semana no JSON; o app não extrapola nada sozinho.
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "seed-plan.json"

TOTAL, DELOAD = 13, 7
LIFT_BASE = {
    "sq": {1: [100, 105, 110, 120], 2: [100, 110, 120, 130], 3: [100, 115, 125, 135]},
    "dl": {1: [100, 105, 110, 115], 2: [100, 110, 120, 130], 3: [100, 115, 125, 135]},
}
REPS = {1: [6, 6, 5, 5], 2: [6, 5, 4, 3], 3: [6, 4, 3, 2]}
TYPE_LABEL = {1: "6·6·5·5", 2: "6·5·4·3", 3: "6·4·3·2"}


def js_round(v):
    # Math.round do JavaScript: .5 sobe
    import math
    return math.floor(v + 0.5)


def r5(v):
    return js_round(v / 5) * 5


def type_of(w):
    if w == DELOAD:
        return 0
    a = w - 1 if w > DELOAD else w
    return (a - 1) % 3 + 1


def cycle_of(w):
    if w == DELOAD:
        return None
    a = w - 1 if w > DELOAD else w
    return -(-a // 3)


def ramp_for(key, w1):
    if key == "sq":
        return [{"kg": 20, "reps": 8}, {"kg": r5(w1 * 0.55), "reps": 3}, {"kg": r5(w1 * 0.78), "reps": 2}]
    return [{"kg": 60, "reps": 5}, {"kg": r5(w1 * 0.8), "reps": 2}]


def lift_of(key, t, cycle):
    off = 5 * (cycle - 1)
    return [v + off for v in LIFT_BASE[key][t]]


def by_week(key):
    weeks = {}
    for w in range(1, TOTAL + 1):
        t = type_of(w)
        if t == 0:
            ref = cycle_of(w - 1)
            work = lift_of(key, 3, ref)
            weeks[str(w)] = {
                "ramp": ramp_for(key, work[0]),
                "sets": [{"kg": work[0], "reps": 5}, {"kg": work[3], "reps": 2}],
                "note": "Deload: ajuste ×5 + topo único ×2, longe da falha.",
            }
            continue
        c = cycle_of(w)
        work = lift_of(key, t, c)
        entry = {
            "ramp": ramp_for(key, work[0]),
            "sets": [{"kg": kg, "reps": r} for kg, r in zip(work, REPS[t])],
        }
        if c >= 3:
            entry["note"] = "Ciclo 3+: extrapolação de +5 kg/ciclo, não validada com dado real."
        weeks[str(w)] = entry
    return weeks


def week_labels():
    labels = {}
    for w in range(1, TOTAL + 1):
        t = type_of(w)
        labels[str(w)] = "Deload" if t == 0 else f"C{cycle_of(w)} · Tipo {t} ({TYPE_LABEL[t]})"
    return labels


C, I = "1–3", "0–2"  # RIR compostos / isoladores


def ex(name, sets, reps, rest, rir, **kw):
    e = {"name": name, "sets": sets, "reps": reps, "restSec": rest, "rir": rir}
    e.update({k: v for k, v in kw.items() if v is not None})
    return e


plan = {
    "format": "app-treino/plan@1",
    "block": {
        "id": "2026-ago-out",
        "name": "Ago–Out 2026 · PPL + Upper/Lower",
        "startDate": "2026-07-27",
        "weeks": TOTAL,
        "deloadWeeks": [DELOAD],
        "weekLabels": week_labels(),
        "goal": "Powerbuilding: hipertrofia primária, força secundária.",
        "notes": "Prioridades: deltoide lateral > glúteos/posterior > largura de dorsais > gastrocnêmio > peito alto.",
    },
    "schedule": {"mon": "A", "tue": "B", "wed": None, "thu": "C", "fri": "D", "sat": "E", "sun": None},
    "deload": {"setsFactor": 0.5},
    "days": [
        {
            "key": "A", "name": "Push", "color": "#FF3B5C",
            "warmup": [
                "Running in place 2 min",
                "Shoulder joints warmup with dumbbells 2×15",
                "Plank push-up 2×8",
                "Rampa do supino inclinado: leve ×12 → 50% ×8 → 70% ×5 → 85% ×3",
            ],
            "cardio": "ClimbMill Z2 · 20–25 min · ~120 bpm (110–128)",
            "exercises": [
                ex("45° Incline Dumbbell Bench Press", 4, 6, 180, C, main=True),
                ex("Hammer Strength Chest Bench Press", 3, 8, 150, C, sub="Decline Machine Chest Press"),
                ex("Bent Over Cable Crossover", 3, 12, 90, I, sub="Standing Cable Crossover"),
                ex("Seated Barbell Shoulder Press", 3, 6, 150, C),
                ex("Seated Dumbbell Lateral Raise", 4, 12, 90, I, priority=True),
                ex("Lying Cable Rope Triceps Extension", 3, 10, 90, I, sub="Machine Triceps Dips"),
                ex("V Handle Triceps Pushdown", 3, 12, 90, I, sub="Triceps Pushdown (Rope Attachment)"),
                ex("Smith Machine Standing Calf Raise", 4, 12, 90, I, sub="Toe Press on the Leg Press"),
            ],
        },
        {
            "key": "B", "name": "Pull", "color": "#3B9BFF",
            "warmup": [
                "Running in place 2 min",
                "Shoulder joints warmup with dumbbells 2×15",
                "Superman 2×12",
                "Rampa da puxada: 35 ×12 → 50 ×8 → 60 ×5",
            ],
            "cardio": "ClimbMill Z2 · 20–25 min · ~120 bpm (110–128)",
            "exercises": [
                ex("Wide Grip Lat Pulldown", 4, 8, 150, C, kg=82, priority=True, main=True,
                   sub="Hammer Machine Lat Pulldown", handle="Puxador maior/largo do kit anatômico"),
                ex("Bent Over Regular Grip Barbell Row", 3, 8, 150, C),
                ex("Side-On Single Arm Lat Pulldown", 3, 12, 90, I, perSide=True, sub="Standing Cable Pulldown"),
                ex("Crossed Cable Rear Delt Fly", 3, 15, 90, I, sub="Lever Seated Reverse Fly (Reverse Grip)"),
                ex("Barbell Curl", 3, 8, 90, I),
                ex("Machine Bicep Curl", 3, 12, 90, I, sub="Standing Cable Curl"),
                ex("Seated Calf Raises", 4, 15, 90, I, sub="Hammer Strength Horizontal Calf Extensions"),
            ],
        },
        {
            "key": "C", "name": "Legs · agachamento", "color": "#F5B942",
            "warmup": [
                "Leg swings",
                "Alternating side lunge touch",
                "Low lunge with one arm raised",
                "Aproximação do agachamento (rampa no exercício)",
            ],
            "cardio": "Sem cardio (opcional: 15 min de caminhada inclinada)",
            "exercises": [
                ex("Wide Stance Barbell Squats", 4, 6, 180, C, main=True, byWeek=by_week("sq")),
                ex("Narrow Stance Leg Press", 3, 8, 150, C, sub="Seated Leg Press"),
                ex("Seated Leg Extensions", 3, 12, 90, I, sub="Seated Single Leg Extensions"),
                ex("Seated Leg Curls", 3, 12, 90, I, sub="Single Leg Lying Curl"),
                ex("Barbell Hyperextension", 3, 12, 90, I,
                   notes="Lombar direta: manter 48–72 h de distância do terra."),
                ex("Toe Press on the Leg Press", 4, 12, 90, I, sub="Smith Machine Standing Calf Raise"),
                ex("Hanging Leg Raises", 3, 12, 90, I),
            ],
        },
        {
            "key": "D", "name": "Upper", "color": "#8B7BFF",
            "warmup": [
                "Running in place 2 min",
                "Shoulder joints warmup with dumbbells 2×15",
                "Pallof press 2×12 por lado",
                "Rampa de dips 2×6",
            ],
            "cardio": "ClimbMill Z2 · 20–25 min · ~120 bpm (110–128)",
            "exercises": [
                ex("Chest Dips", 3, 10, 150, C, main=True),
                ex("Lat Machine Pull-Down (Reverse Grip)", 3, 10, 150, C, sub="Reverse Grip Lat Pulldown"),
                ex("Seated Dumbbell Press", 3, 8, 150, C),
                ex("Standing Hammer Dumbbell Curl", 3, 10, 90, I),
                ex("Dumbbell Seated Overhead Triceps Extension", 3, 10, 90, I),
                ex("Single Arm Standing Dumbbell Lateral Raise", 4, 15, 60, I, perSide=True, priority=True),
                ex("Straight Arm Pulldown", 3, 12, 90, I, priority=True, sub="Standing Cable Pullover"),
                ex("Smith Machine Standing Calf Raise", 4, 12, 90, I),
            ],
        },
        {
            "key": "E", "name": "Lower · terra", "color": "#C7CBD6",
            "warmup": [
                "Running in place 60 s",
                "Leg swings",
                "Low lunge",
                "Dobradiça com barra vazia 1×8",
                "Aproximação do terra (rampa no exercício)",
            ],
            "cardio": "Sem cardio",
            "exercises": [
                ex("Barbell Deadlift", 4, 6, 180, C, main=True, byWeek=by_week("dl")),
                ex("Single Leg Lying Curl", 3, 12, 90, I, perSide=True, sub="Standing Leg Curls"),
                ex("Bulgarian Split Squat", 3, 10, 120, C, perSide=True),
                ex("Smith Machine Plie Squats", 3, 10, 120, C),
                ex("Leaning Forward Leg Abduction (Machine)", 3, 20, 60, I, sub="Leg Abduction (Machine)"),
                ex("Hammer Strength Horizontal Calf Extensions", 4, 15, 90, I, sub="Seated Calf Raises"),
                ex("Decline Crunch", 3, 15, 60, I),
            ],
        },
    ],
    "restrictions": [
        {"exercise": "Wide Stance Barbell Squats", "type": "suspended", "until": "2026-10-31",
         "reason": "Dor no joelho esquerdo (parte central). Avaliação com ortopedista/fisio recomendada."},
        {"exercise": "Lying Triceps Extension with a Barbell", "type": "vetoed",
         "reason": "Machuca o cotovelo direito. Nunca programar."},
    ],
    "notes": [
        "Descanso: compostos 2–3 min (grandes lifts 3 min). Isoladores: 60–90 s [assumido].",
        "Intensidade: compostos 1–3 RIR, isoladores 0–2 RIR.",
        "Deload (semana 7): metade das séries, mesma carga, parando 3–4 reps antes da falha.",
    ],
}

OUT.write_text(json.dumps(plan, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"plano → {OUT}")
