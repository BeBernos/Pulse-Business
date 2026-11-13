import { loadHistory, loadsForPrompt } from "./analytics";
import { describe, expect, it } from "vitest";
import seed from "../data/seed-plan.json";
import { adherence, doneMuscleVolume, personalRecords, weekStreak, weeklyStats, type ASet } from "./analytics";
import { bmi, bodyFatLabel, bodyFatSeries, change, compositionSeries, estimateBodyFat, ffmi, ffmiLabel, leanMass, movingAverage, navyBodyFat, rfmBodyFat, waistToHeight, waistToHeightLabel, weeklyRate } from "./body";
import { addDay, defaultsFor, linkSuperset, moveItem, newPlan, removeDay, unlinkSuperset, updateDay, validate } from "./builder";
import { dayStatus, monthGrid, nextTrainingDay, plannedPerWeek, scheduledDay } from "./calendar";
import { isGreenish } from "./color";
import { planSchema } from "./plan";
import { buildReminderEvents } from "./reminders";

const plan = planSchema.parse(seed);

describe("rodízio e status do dia", () => {
  const rot = planSchema.parse({ ...seed, rotation: { pattern: ["A", "B", "C", null], start: "2026-10-19" } });
  it("rodízio substitui o dia da semana", () => {
    expect(scheduledDay(rot, "2026-10-19")?.key).toBe("A");
    expect(scheduledDay(rot, "2026-10-21")?.key).toBe("C");
    expect(scheduledDay(rot, "2026-10-22")).toBeNull();
    expect(scheduledDay(rot, "2026-10-23")?.key).toBe("A");
    expect(nextTrainingDay(rot, "2026-10-22")).toMatchObject({ date: "2026-10-23" });
    expect(plannedPerWeek(rot)).toBe(5.3);
    expect(plannedPerWeek(plan)).toBe(5);
  });
  it("rejeita rodízio com dia inexistente ou só descanso", () => {
    expect(planSchema.safeParse({ ...seed, rotation: { pattern: ["A", "Z"] } }).success).toBe(false);
    expect(planSchema.safeParse({ ...seed, rotation: { pattern: [null, null] } }).success).toBe(false);
  });
  it("classifica feito / extra / falta / pulado / descanso / hoje / futuro", () => {
    const trained = new Set(["2026-10-12", "2026-10-14"]);
    const skipped = new Set(["2026-10-13"]);
    const st = (d: string) => dayStatus(plan, d, "2026-10-16", trained, skipped);
    expect(st("2026-10-12")).toBe("done"); // seg A
    expect(st("2026-10-13")).toBe("skipped"); // ter B pulado
    expect(st("2026-10-14")).toBe("extra"); // qua (descanso) treinou
    expect(st("2026-10-15")).toBe("missed"); // qui C não treinou
    expect(st("2026-10-16")).toBe("today");
    expect(st("2026-10-18")).toBe("rest");
    expect(st("2026-10-17")).toBe("planned");
    expect(st("2026-11-02")).toBe("none"); // fora do bloco
  });
  it("grade do mês começa na segunda e fecha semanas inteiras", () => {
    const g = monthGrid(2026, 9); // outubro/2026
    expect(g[0]).toBe("2026-09-28");
    expect(g.length % 7).toBe(0);
    expect(g).toContain("2026-10-31");
  });
});

describe("análises", () => {
  const sessions = [
    { id: "1", date: "2026-10-05", startedAt: 1, endedAt: 1 + 60 * 60000 },
    { id: "2", date: "2026-10-12", startedAt: 2, endedAt: 2 + 90 * 60000 },
    { id: "3", date: "2026-10-14", startedAt: 3, endedAt: 3 + 30 * 60000 },
  ];
  const s = (sessionId: string, exercise: string, kg: number, reps: number, rir: number | null = null): ASet => ({ sessionId, exercise, kind: "work", done: true, kg, reps, rir });
  const sets = [s("1", "Barbell Curl", 30, 8), s("2", "Barbell Curl", 32.5, 8), s("3", "Barbell Curl", 32.5, 6), s("2", "Wide Grip Lat Pulldown", 82, 8)];
  it("totais por semana com semanas vazias", () => {
    const w = weeklyStats(sessions, sets, "2026-09-28", "2026-10-18");
    expect(w.map((x) => x.sessions)).toEqual([0, 1, 2]);
    expect(w[2]).toMatchObject({ sets: 3, minutes: 120, tonnage: 32.5 * 8 + 32.5 * 6 + 82 * 8 });
  });
  it("sequência de semanas batendo a meta", () => {
    const dates = ["2026-10-05", "2026-10-06", "2026-10-12", "2026-10-13", "2026-10-19"];
    expect(weekStreak(dates, "2026-10-20", 2)).toBe(2); // semana atual (1 treino) ainda não conta
    expect(weekStreak([...dates, "2026-10-20"], "2026-10-20", 2)).toBe(3);
  });
  it("adesão ignora descanso e futuro", () => {
    expect(adherence([{ status: "done" }, { status: "missed" }, { status: "rest" }, { status: "planned" }, { status: "skipped" }, { status: "done" }])).toEqual({ done: 2, planned: 4, pct: 50 });
  });
  it("recorde pessoal só quando supera o histórico", () => {
    const prs = personalRecords(sessions, sets);
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ exercise: "Barbell Curl", sessionId: "2", kind: "e1rm" });
  });
  it("volume real por músculo a partir das séries feitas", () => {
    const v = doneMuscleVolume(sets, (n) => (n === "Barbell Curl" ? { primary: ["biceps"], secondary: ["braquial"] } : undefined));
    expect(v.get("biceps")).toBe(3);
    expect(v.get("braquial")).toBe(1.5);
  });
});

describe("corpo", () => {
  const pts = [
    { date: "2026-10-01", value: 82 },
    { date: "2026-10-03", value: 83 },
    { date: "2026-10-08", value: 81 },
    { date: "2026-10-15", value: 80.5 },
  ];
  it("média móvel de 7 dias", () => {
    expect(movingAverage(pts).map((p) => p.value)).toEqual([82, 82.5, 82, 80.5]); // 15/10: janela 09–15/10 só tem 80,5
  });
  it("variação e ritmo semanal", () => {
    expect(change(pts, 7)).toBe(-0.5);
    expect(weeklyRate(pts)).toBe(-0.75);
    expect(change([pts[0]], 7)).toBeNull();
  });
  it("IMC", () => {
    expect(bmi(82.2, 178)).toBe(25.9);
    expect(bmi(80, 0)).toBeNull();
  });
});

describe("construtor de treinos", () => {
  it("programa novo é válido, sem verde e com 3 dias", () => {
    const p = newPlan("Meu treino", "2026-10-26", 8);
    expect(p.days.map((d) => d.key)).toEqual(["A", "B", "C"]);
    for (const d of p.days) expect(isGreenish(d.color!)).toBe(false);
    expect(validate(p).ok).toBe(true);
  });
  it("adiciona, renomeia e remove dia (tirando da agenda)", () => {
    let p = addDay(newPlan("x"));
    expect(p.days.at(-1)!.key).toBe("D");
    p = updateDay(p, "D", { name: "Braços" });
    expect(p.days.at(-1)!.name).toBe("Braços");
    p = removeDay(p, "A");
    expect(p.schedule.mon).toBeNull();
    expect(validate(p).ok).toBe(true);
  });
  it("sugere prescrição por padrão de movimento", () => {
    expect(defaultsFor("Isolador")).toMatchObject({ reps: 12, restSec: 90 });
    expect(defaultsFor("Press Horizontal")).toMatchObject({ reps: 8, restSec: 150 });
    expect(defaultsFor("Isolador", true).perSide).toBe(true);
  });
  it("reordena e liga/desliga superset", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    const ex = [{ name: "a" }, { name: "b" }, { name: "c" }].map((e) => ({ ...e, sets: 3, reps: 10, restSec: 60 }));
    const linked = linkSuperset(ex, 0);
    expect(linked.map((e) => e.superset)).toEqual(["S1", "S1", undefined]);
    expect(linkSuperset(linked, 1).map((e) => e.superset)).toEqual(["S1", "S1", "S1"]);
    expect(unlinkSuperset(linked, 0).map((e) => e.superset)).toEqual([undefined, undefined, undefined]);
  });
});

describe("composição corporal", () => {
  it("% de gordura pela Marinha bate com a calculadora de referência", () => {
    // homem 178 cm, cintura 84, pescoço 39: 495 / (1,0324 − 0,19077·log10(45) + 0,15456·log10(178)) − 450 = 14,86
    expect(navyBodyFat(178, 84, 39)).toBe(14.9);
    expect(navyBodyFat(178, 39, 40)).toBeNull();
  });
  it("massa magra, FFMI e o caso do IMC enganoso", () => {
    // 82,2 kg, 178 cm: IMC 25,9 (“sobrepeso”), mas com ~14 % de gordura o FFMI é alto
    expect(bmi(82.2, 178)).toBe(25.9);
    const lean = leanMass(82.2, 14);
    expect(lean).toBe(70.7);
    const f = ffmi(lean, 178)!;
    expect(f.raw).toBe(22.3);
    expect(f.normalized).toBe(22.4);
    expect(ffmiLabel(f.normalized)).toBe("excelente");
    expect(bodyFatLabel(14)).toBe("boa forma");
  });
  it("cintura/altura", () => {
    expect(waistToHeight(84, 178)).toBe(0.47);
    expect(waistToHeightLabel(0.47)).toBe("saudável");
    expect(waistToHeightLabel(0.55)).toBe("risco aumentado");
  });
  it("série de composição prefere % medido e cai para a Marinha, só nos dias com medida", () => {
    const s = compositionSeries(
      [{ date: "2026-10-01", value: 82 }, { date: "2026-10-08", value: 81.8 }, { date: "2026-10-15", value: 81.5 }],
      178,
      { waist: [{ date: "2026-09-28", value: 84 }], neck: [{ date: "2026-09-28", value: 39 }], bodyFat: [{ date: "2026-10-14", value: 12 }] },
    );
    // 28/09 (fita, peso de 01/10), 14/10 (medido, peso de 15/10) e o "agora" em 15/10; 08/10 (só peso) não vira ponto
    expect(s.map((c) => [c.date, c.source])).toEqual([["2026-09-28", "marinha"], ["2026-10-14", "medido"], ["2026-10-15", "medido"]]);
    expect(s[1]).toMatchObject({ bodyFat: 12, lean: 71.7, weight: 81.5 });
    expect(compositionSeries([{ date: "2026-10-01", value: 82 }], null, {})).toEqual([]);
  });
  it("mulheres: Marinha com quadril, faixas próprias", () => {
    // 165 cm, cintura 75, quadril 100, pescoço 33 → 29,4 %
    expect(navyBodyFat(165, 75, 33, "f", 100)).toBe(29.4);
    expect(navyBodyFat(165, 75, 33, "f")).toBeNull(); // sem quadril não dá
    expect(bodyFatLabel(29.4, "f")).toBe("média");
    expect(bodyFatLabel(22, "f")).toBe("boa forma");
    expect(bodyFatLabel(22, "m")).toBe("média");
  });
  it("RFM só com cintura e altura, usada quando falta o pescoço", () => {
    expect(rfmBodyFat(180, 91.5)).toBe(24.7);
    expect(rfmBodyFat(165, 75, "f")).toBe(32);
    expect(estimateBodyFat(180, "m", { waist: 91.5, neck: 41.5 })).toEqual({ value: 18.4, method: "marinha" });
    expect(estimateBodyFat(180, "m", { waist: 91.5 })).toEqual({ value: 24.7, method: "rfm" });
    expect(estimateBodyFat(180, "m", { neck: 41 })).toBeNull();
  });
  it("série do % de gordura sem nenhum % medido", () => {
    const s = bodyFatSeries(180, "m", { waist: [{ date: "2026-09-25", value: 93 }, { date: "2026-10-22", value: 91.5 }], neck: [{ date: "2026-09-25", value: 41 }, { date: "2026-10-22", value: 41.5 }] });
    expect(s.map((p) => p.source)).toEqual(["marinha", "marinha"]);
    expect(s[1].value).toBe(18.4);
    expect(bodyFatSeries(null, "m", { waist: [{ date: "2026-10-22", value: 91.5 }] })).toEqual([]);
  });
});

describe("lembretes", () => {
  const opts = { workout: true, workoutTime: "05:30", forgot: true, forgotTime: "21:00", backup: true };
  const now = new Date(2026, 9, 18, 12).getTime(); // dom 18/10 12h
  const ev = buildReminderEvents({ plan, today: "2026-10-18", now, trained: new Set(["2026-10-19"]), skipped: new Set(["2026-10-20"]), opts, lastBackupAt: null });
  it("não avisa em dia de descanso, dia já treinado ou pulado", () => {
    const tags = ev.map((e) => e.tag);
    expect(tags).not.toContain("treino-2026-10-19"); // treinou
    expect(tags).not.toContain("treino-2026-10-20"); // pulou
    expect(tags).not.toContain("treino-2026-10-21"); // quarta = descanso
    expect(tags).toContain("treino-2026-10-22"); // quinta C
    expect(tags).toContain("esqueci-2026-10-22");
  });
  it("pesagem: só nos dias escolhidos e se ainda não pesou", () => {
    const w = buildReminderEvents({ plan, today: "2026-10-18", now, trained: new Set(), skipped: new Set(), opts: { ...opts, weigh: true, weighDays: [1, 4], weighTime: "07:00" }, lastBackupAt: null, weighed: new Set(["2026-10-19"]) });
    const tags = w.filter((e) => e.tag.startsWith("peso-")).map((e) => e.tag);
    expect(tags).not.toContain("peso-2026-10-19"); // segunda, já pesou
    expect(tags).toContain("peso-2026-10-22"); // quinta
    expect(tags).not.toContain("peso-2026-10-21"); // quarta não foi escolhida
    expect(new Date(w.find((e) => e.tag === "peso-2026-10-22")!.at).getHours()).toBe(7);
  });
  it("respeita o horário escolhido e o fim do bloco", () => {
    const e = ev.find((x) => x.tag === "treino-2026-10-22")!;
    expect(new Date(e.at).getHours()).toBe(5);
    expect(new Date(e.at).getMinutes()).toBe(30);
    expect(ev.some((x) => x.tag === "treino-2026-10-26")).toBe(false); // bloco acaba em 25/10
  });
  it("backup: domingo 20h se o último tem mais de 7 dias; hoje 12h ainda dá tempo", () => {
    expect(ev.filter((x) => x.tag === "backup").map((x) => new Date(x.at).getDate())).toEqual([18]);
    const recent = buildReminderEvents({ plan, today: "2026-10-18", now, trained: new Set(), skipped: new Set(), opts, lastBackupAt: now - 86_400_000 });
    expect(recent.filter((x) => x.tag === "backup").map((x) => new Date(x.at).getDate())).toEqual([25]);
  });
  it("tudo desligado → nenhum aviso", () => {
    expect(buildReminderEvents({ plan, today: "2026-10-18", now, trained: new Set(), skipped: new Set(), opts: { ...opts, workout: false, forgot: false, backup: false }, lastBackupAt: null })).toEqual([]);
  });
});

import { libraryForPrompt } from "./claudePrompt";

describe("instruções para o Claude", () => {
  it("lista a biblioteca por grupo e tira os vetados", () => {
    const txt = libraryForPrompt(
      [
        { name: "Barbell Curl", group: "Bíceps" },
        { name: "Lying Triceps Extension with a Barbell", group: "Tríceps", vetoed: true },
        { name: "Triceps Pushdown", group: "Tríceps" },
        { name: "Wide Stance Barbell Squats", group: "Pernas" },
      ],
      new Set(["Wide Stance Barbell Squats"]),
    );
    expect(txt).toContain("Bíceps: Barbell Curl");
    expect(txt).toContain("Tríceps: Triceps Pushdown");
    expect(txt).not.toContain("Lying Triceps Extension");
    expect(txt).not.toContain("Wide Stance");
  });
});

describe("histórico de cargas", () => {
  const sessions = [
    { id: "s1", date: "2026-09-01", startedAt: 1 },
    { id: "s2", date: "2026-10-20", startedAt: 2 },
  ];
  const sets = [
    { sessionId: "s1", exercise: "Barbell Deadlift", kg: 140, reps: 3, rir: 1 },
    { sessionId: "s1", exercise: "Barbell Deadlift", kg: 130, reps: 5 },
    { sessionId: "s2", exercise: "Barbell Deadlift", kg: 120, reps: 6, rir: 2 },
    { sessionId: "s2", exercise: "Barbell Deadlift", kg: 120, reps: 5 },
    { sessionId: "s2", exercise: "Wide Grip Lat Pulldown", kg: 82, reps: 8 },
  ];
  it("guarda o último treino e a melhor marca de cada exercício", () => {
    const h = loadHistory(sessions, sets);
    const dl = h.find((l) => l.name === "Barbell Deadlift")!;
    expect(dl.sessions).toBe(2);
    expect(dl.last).toMatchObject({ date: "2026-10-20", kg: 120, reps: 6 });
    expect(dl.best).toMatchObject({ date: "2026-09-01", kg: 140, reps: 3 });
    expect(dl.e1rm).toBe(158.7); // 140 × (1 + 4/30)
  });
  it("vira texto para o Claude, só com o que é recente", () => {
    const txt = loadsForPrompt(loadHistory(sessions, sets), "2026-10-28", 30);
    expect(txt).toContain("Wide Grip Lat Pulldown: último 82×8");
    expect(txt).toContain("Barbell Deadlift: último 120×6 @2");
    expect(loadsForPrompt([], "2026-10-28")).toBe("");
  });
});
