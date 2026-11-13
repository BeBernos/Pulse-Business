"""Atribui músculos (principal/secundário) a cada exercício de src/data/library.json.

Mapeamento próprio, por anatomia funcional — não vem de base de terceiros.
Volume: músculo principal conta 1 série; secundário conta 0,5 (séries fracionadas).
Regras em ordem: a primeira que casar com o nome (minúsculo) vence; OVERRIDES vêm antes de tudo.

Uso: python3 scripts/map-muscles.py
"""
import json
import re
from pathlib import Path

LIB = Path(__file__).resolve().parent.parent / "src" / "data" / "library.json"

# nome exato → (principais, secundários)
OVERRIDES = {
    "Seated Dumbbell Hammer Curl + Overhead Dumbbell Press": (["delt_ant", "braquial"], ["triceps", "biceps"]),
    "Barbell Hyperextension": (["lombar"], ["gluteo", "posterior"]),  # "lombar direta" no plano
    "Glutes Hyperextension": (["gluteo"], ["posterior", "lombar"]),
    "Back Extension": (["lombar"], ["gluteo", "posterior"]),
    "Seated Machine Back Extensions": (["lombar"], []),
    "Barbell Good Morning": (["posterior", "lombar"], ["gluteo"]),
    "Hammer Strength Horizontal Calf Extensions": (["soleo"], ["gastrocnemio"]),  # handoff não conta como joelho estendido
    "Kneeling Pulley Row": (["abdomen"], []),  # equivalente ao cable crunch
    "Cable Rope Chest Pull": (["delt_post"], ["costas_media", "manguito"]),  # face pull
    "Standing Rope Pull to the Neck": (["delt_post", "costas_media"], ["trapezio_sup"]),
    "Front Incline Dumbbell Raise": (["delt_ant"], ["peito_sup"]),
    "Close Grip Push-ups": (["triceps"], ["peito", "delt_ant"]),
    "Barbell Pullover": (["dorsal"], ["peito", "triceps"]),
    "Dumbbell Pullover": (["peito", "dorsal"], ["triceps"]),
    "Horizontal Dumbbell Bench Pullover": (["peito", "dorsal"], ["triceps"]),
    "Lateral Lunges": (["adutores", "quadriceps"], ["gluteo"]),
    "Front Barbell Squats": (["quadriceps"], ["gluteo", "abdomen"]),
    "Narrow Stance Leg Press": (["quadriceps"], ["gluteo"]),
    "Wide Stance Leg Press": (["gluteo", "quadriceps"], ["adutores"]),
    "Wide Stance Barbell Squats": (["quadriceps", "gluteo"], ["adutores", "lombar"]),
    "Barbell Deadlift": (["gluteo", "posterior"], ["lombar", "quadriceps", "costas_media"]),
    "Deadlift": (["gluteo", "posterior"], ["lombar", "quadriceps", "costas_media"]),
    "Sumo Deadlift": (["gluteo", "quadriceps", "adutores"], ["posterior", "lombar"]),
    "Dumbbell Deadlift (Glute + Inner Thigh Focus)": (["gluteo", "adutores"], ["posterior"]),
    "Single Leg Dumbbell Deadlift": (["posterior", "gluteo"], ["lombar"]),
    "Standing Shoulder External Rotation with Cable Row": (["manguito"], ["delt_post"]),
    "Standing Shoulder Internal Rotation with Cable Row": (["manguito"], ["delt_ant"]),
}

RULES = [
    # antebraço
    (r"wrist curl", ["antebraco"], []),
    # flexores de perna antes do curl de bíceps ("Leg Curls", "Single Leg Lying Curl")
    (r"leg curl|lying curl", ["posterior"], []),
    # bíceps / braquial ("Hammer Strength"/"Hammer Machine" são marcas de aparelho, não curl martelo)
    (r"hammer.*curl|reverse.*curl|zottman|overhand barbell curl", ["braquial"], ["biceps", "antebraco"]),
    (r"curl", ["biceps"], ["braquial"]),
    # tríceps
    (r"close grip bench|narrow grip barbell bench", ["triceps"], ["peito", "delt_ant"]),
    (r"triceps dips|tricep dips", ["triceps"], ["peito", "delt_ant"]),
    (r"tricep|pushdown", ["triceps"], []),
    # core
    (r"russian twist|diagonal", ["obliquos"], ["abdomen"]),
    (r"crunch|sit up|leg raise|knee tuck|rollout|plank|toe touch", ["abdomen"], []),
    # trapézio superior
    (r"shrug", ["trapezio_sup"], []),
    # ombro posterior
    (r"rear delt|reverse fly|bent over.*lateral raise|bent over one arm lateral raise", ["delt_post"], ["costas_media"]),
    # ombro lateral
    (r"front and lateral|lateral and front", ["delt_lat", "delt_ant"], []),
    (r"lateral raise", ["delt_lat"], []),
    (r"upright.*row|high pull", ["delt_lat"], ["trapezio_sup"]),
    # ombro anterior
    (r"front raise|front dumbbell raise", ["delt_ant"], []),
    (r"shoulder press|arnold press|seated dumbbell press|overhead dumbbell press", ["delt_ant"], ["triceps", "delt_lat"]),
    # dorsal
    # braço estendido: quem ajuda é a cabeça longa do tríceps, não o bíceps
    (r"straight arm|pullover", ["dorsal"], ["triceps"]),
    (r"pulldown|pull-down|pull down|pull up", ["dorsal"], ["biceps", "costas_media"]),
    # remadas
    (r"row|bench pull|arm cable pull", ["costas_media", "dorsal"], ["biceps", "delt_post"]),
    # peito superior
    (r"incline.*fly|low cable crossover", ["peito_sup"], ["delt_ant"]),
    (r"incline.*press|30°|45°", ["peito_sup"], ["delt_ant", "triceps"]),
    # peito
    (r"chest dips", ["peito"], ["triceps", "delt_ant"]),
    (r"push-up", ["peito"], ["triceps", "delt_ant"]),
    (r"bench press|chest press|chest bench press", ["peito"], ["triceps", "delt_ant"]),
    (r"fly|crossover|svend", ["peito"], []),
    # glúteo / abdutores
    (r"abduction", ["gluteo_medio"], []),
    (r"glute bridge|bridge", ["gluteo"], ["posterior"]),
    (r"plie|sumo squat", ["gluteo", "adutores"], ["quadriceps"]),
    (r"bulgarian|lunge", ["quadriceps", "gluteo"], ["adutores"]),
    # pernas
    (r"adductor", ["adutores"], []),
    (r"leg extension", ["quadriceps"], []),
    (r"seated calf", ["soleo"], []),
    (r"calf|toe press", ["gastrocnemio"], ["soleo"]),
    (r"squat|leg press", ["quadriceps", "gluteo"], ["adutores"]),
]

MUSCLES = {
    "peito_sup", "peito", "delt_ant", "delt_lat", "delt_post", "manguito", "dorsal", "costas_media",
    "trapezio_sup", "lombar", "biceps", "braquial", "triceps", "antebraco", "abdomen", "obliquos",
    "gluteo", "gluteo_medio", "quadriceps", "posterior", "adutores", "gastrocnemio", "soleo",
}


def classify(name: str):
    if name in OVERRIDES:
        return OVERRIDES[name]
    low = name.lower()
    for pattern, primary, secondary in RULES:
        if re.search(pattern, low):
            return primary, secondary
    return None


lib = json.loads(LIB.read_text(encoding="utf-8"))
missing = []
for e in lib:
    res = classify(e["name"])
    if not res:
        missing.append(e["name"])
        continue
    primary, secondary = res
    assert set(primary + secondary) <= MUSCLES, (e["name"], primary, secondary)
    e["muscles"] = {"primary": primary, "secondary": [m for m in secondary if m not in primary]}

if missing:
    raise SystemExit("sem regra: " + "; ".join(missing))
LIB.write_text(json.dumps(lib, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{len(lib)} exercícios mapeados → {LIB}")
