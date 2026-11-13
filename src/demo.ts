// Demonstração pública (build com VITE_DEMO=1, publicada no GitHub Pages): sem conta e sem servidor, o app abre com
// um atleta fictício (Rafael): um bloco de treino que começou há 3 semanas, as sessões feitas com cargas subindo,
// pesagens e medidas. Tudo é gerado no aparelho; um dia novo recomeça a demonstração.
import { db, importPlan, newId, setSetting, type SetEntry } from "./db";
import { parsePlan } from "./lib/plan";
import seedPlan from "./data/seed-plan.json";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DIAS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export async function seedDemo(): Promise<void> {
  const hoje = new Date(Date.now() - 3 * 3600e3); // dia em São Paulo
  const hojeIso = iso(hoje);
  if ((await db.sessions.count()) > 0 && localStorage.getItem("pulse.demoDay") === hojeIso) return;
  await Promise.all([db.sessions.clear(), db.sets.clear(), db.measures.clear(), db.skips.clear(), db.plans.clear()]);
  localStorage.setItem("pulse.demoDay", hojeIso);

  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - ((hoje.getUTCDay() + 6) % 7) - 21));
  const raw = structuredClone(seedPlan) as typeof seedPlan & { block: { startDate: string; name: string } };
  raw.block.startDate = iso(inicio);
  raw.block.name = "Powerbuilding · 13 semanas";
  const r = parsePlan(JSON.stringify(raw));
  if (!r.ok) return;
  const plan = r.plan;
  await importPlan(plan, true);
  await setSetting("name", "Rafael");
  await setSetting("heightCm", 180);
  await setSetting("sex", "m");

  const base = (nome: string) => 20 + ([...nome].reduce((a, c) => a + c.charCodeAt(0), 0) % 11) * 5;
  for (let n = 0; ; n++) {
    const d = new Date(inicio.getTime() + n * 864e5);
    const data = iso(d);
    if (data >= hojeIso) break;
    const key = (plan.schedule as Record<string, string | null>)[DIAS[d.getUTCDay()]];
    if (!key) continue;
    if (n === 10) { await db.skips.put({ date: data, reason: "Viagem" }); continue; }
    const day = plan.days.find((x) => x.key === key)!;
    const semana = Math.floor(n / 7) + 1;
    const t0 = Date.parse(data) + 9.5 * 3600e3; // 06:30 em São Paulo
    const sid = newId();
    await db.sessions.put({ id: sid, planId: plan.block.id, week: semana, dayKey: day.key, dayName: day.name, color: day.color ?? "#FF3B5C", date: data,
      startedAt: t0, endedAt: t0 + 62 * 60e3, status: "done", deload: false, fatigue: 3,
      exercises: day.exercises.map((e) => ({ name: e.name, plannedName: e.name, restSec: e.restSec ?? 90 })) });
    const sets: SetEntry[] = [];
    day.exercises.forEach((e, exOrder) => {
      const reps = parseInt(String(e.reps), 10) || 10;
      const total = Number(e.sets) || 3;
      for (let j = 0; j < total; j++) {
        const kg = base(e.name) + (semana - 1) * 2.5;
        sets.push({ id: newId(), sessionId: sid, exOrder, exercise: e.name, setIndex: j, kind: "work", targetKg: kg, targetReps: reps, kg,
          reps: reps - (j === total - 1 ? 1 : 0), rir: 2, done: true, completedAt: t0 + (exOrder * 4 + j) * 150e3 });
      }
    });
    await db.sets.bulkPut(sets);
  }
  const pesos = [84.3, 84.0, 83.6, 83.5, 83.1, 82.8, 82.7];
  await db.measures.bulkPut(pesos.map((value, i) => ({ id: newId(), date: iso(new Date(inicio.getTime() + i * 3.5 * 864e5)), type: "peso" as const, value })));
  await db.measures.bulkPut([
    { id: newId(), date: iso(inicio), type: "cintura", value: 90 },
    { id: newId(), date: hojeIso, type: "cintura", value: 88 },
    { id: newId(), date: hojeIso, type: "pescoco", value: 39 },
    { id: newId(), date: hojeIso, type: "braco", value: 37.5 },
  ]);
}

/** Selo fixo no topo: tudo é fictício. */
export function seloDemo(): void {
  const s = document.createElement("div");
  s.textContent = "Demonstração · dados fictícios";
  s.style.cssText = "position:fixed;top:calc(env(safe-area-inset-top,0px) + 4px);left:50%;transform:translateX(-50%);z-index:9999;padding:3px 12px;border-radius:99px;background:#E8590C;color:#fff;font:600 11px/1.6 Inter,system-ui,sans-serif;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.25)";
  document.body.append(s);
}
