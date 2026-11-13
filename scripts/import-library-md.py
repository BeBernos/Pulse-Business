"""Converte a exportação Markdown da biblioteca (Notion) em src/data/library.json.

Uso: python3 scripts/import-library-md.py caminho/treino-biblioteca-exercicios.md
"""
import json
import re
import sys
from pathlib import Path

src = Path(sys.argv[1]).read_text(encoding="utf-8")
out = Path(__file__).resolve().parent.parent / "src" / "data" / "library.json"

exercises = []
group = None
for line in src.splitlines():
    m = re.match(r"^## (.+?) \(\d+\)$", line)
    if m:
        group = m.group(1)
        continue
    if not group or not line.startswith("| ") or line.startswith("| Exercício") or line.startswith("|---"):
        continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if len(cells) < 6:
        continue
    name, equipment, pattern, uni, blocks, notes = cells[:6]
    vetoed = name.startswith("⛔")
    if vetoed:
        name = re.sub(r"^⛔\s*", "", name).split(" — ")[0].strip()
    exercises.append({
        "name": name,
        "group": group,
        "equipment": equipment,
        "pattern": pattern,
        "unilateral": uni == "S",
        "blocks": [b.strip() for b in blocks.split(",") if b.strip()],
        "notes": notes,
        "vetoed": vetoed,
    })

names = [e["name"] for e in exercises]
assert len(names) == len(set(names)), "nomes duplicados"
out.write_text(json.dumps(exercises, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{len(exercises)} exercícios → {out}")
