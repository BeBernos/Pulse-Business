import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addMeasure,
  db,
  deleteSession,
  differsFromLibrary,
  ensureSeeded,
  exportBackup,
  exportLog,
  fromLegacy,
  importBackup,
  newId,
  openDb,
  remoteWrite,
  removeSet,
  setSetting,
  stamp,
  startFreestyle,
  addExerciseToSession,
  removeExerciseFromSession,
  reorderSessionExercises,
  restoreSessionExercise,
  type Exercise,
} from "./db";
import { LIBRARY as libraryJson } from "./lib/library";

let n = 0;
beforeEach(async () => {
  openDb(`teste-${++n}`);
  await ensureSeeded();
});

const dirty = async () => ({
  sessions: await db.sessions.where("_d").equals(1).count(),
  sets: await db.sets.where("_d").equals(1).count(),
  exercises: await db.exercises.where("_d").equals(1).count(),
  tombs: await db.tombs.where("_d").equals(1).count(),
});

describe("treino ativo: mudar a ordem e desfazer remoção", () => {
  it("as séries acompanham o exercício e o desfazer devolve tudo no lugar", async () => {
    const id = await startFreestyle("2026-10-29");
    for (const n of ["Barbell Curl", "Barbell Squat", "Dumbbell Fly"]) await addExerciseToSession((await db.sessions.get(id))!, n, { sets: 2, reps: 10, restSec: 60 });
    const byName = async () => {
      const s = (await db.sessions.get(id))!;
      const sets = await db.sets.where({ sessionId: id }).toArray();
      return s.exercises.map((e, i) => [e.name, sets.filter((x) => x.exOrder === i).every((x) => x.exercise === e.name) && sets.filter((x) => x.exOrder === i).length]);
    };
    await reorderSessionExercises((await db.sessions.get(id))!, [2, 0, 1]);
    expect(await byName()).toEqual([["Dumbbell Fly", 2], ["Barbell Curl", 2], ["Barbell Squat", 2]]);
    const s = (await db.sessions.get(id))!;
    const removed = await db.sets.where({ sessionId: id }).filter((x) => x.exOrder === 1).toArray();
    await db.sets.update(removed[0].id, { done: true, kg: 30, reps: 10 });
    const snap = await db.sets.where({ sessionId: id }).filter((x) => x.exOrder === 1).toArray();
    await removeExerciseFromSession(s, 1);
    expect(await byName()).toEqual([["Dumbbell Fly", 2], ["Barbell Squat", 2]]);
    await restoreSessionExercise(id, 1, s.exercises[1], snap);
    expect(await byName()).toEqual([["Dumbbell Fly", 2], ["Barbell Curl", 2], ["Barbell Squat", 2]]);
    expect((await db.sets.get(removed[0].id))).toMatchObject({ done: true, kg: 30 });
    await expect(reorderSessionExercises((await db.sessions.get(id))!, [0, 0, 1])).rejects.toThrow();
  });
});

describe("banco local com sincronização", () => {
  it("biblioteca entra sem 'falta enviar'", async () => {
    expect(await db.exercises.count()).toBe(libraryJson.length);
    expect((await dirty()).exercises).toBe(0);
  });

  it("toda gravação ganha u crescente e _d = 1", async () => {
    const id = await startFreestyle("2026-10-21");
    const s = await db.sessions.get(id);
    expect(s).toMatchObject({ _d: 1 });
    const u1 = (s as unknown as { u: number }).u;
    await db.sessions.update(id, { notes: "x" });
    const u2 = ((await db.sessions.get(id)) as unknown as { u: number }).u;
    expect(u2).toBeGreaterThan(u1);
    expect(stamp()).toBeGreaterThan(u2);
  });

  it("apagar deixa lápide (delete, where().delete, bulkDelete)", async () => {
    const id = await startFreestyle("2026-10-21");
    const session = (await db.sessions.get(id))!;
    await addExerciseToSession(session, "Barbell Curl", { sets: 3, reps: 10, restSec: 60 });
    const sets = await db.sets.where({ sessionId: id }).toArray();
    expect(sets).toHaveLength(3);
    await removeSet(sets[0].id);
    expect(await db.tombs.get(`sets|${sets[0].id}`)).toMatchObject({ t: "sets", k: sets[0].id, _d: 1 });
    await deleteSession(id);
    const tombs = await db.tombs.toArray();
    expect(tombs.map((t) => t.key).sort()).toEqual([`sessions|${id}`, ...sets.map((s) => `sets|${s.id}`)].sort());
    await db.flags.put({ exercise: "Barbell Curl", type: "suspended" });
    await db.flags.clear();
    expect(await db.tombs.get("flags|Barbell Curl")).toBeTruthy();
  });

  it("gravação vinda do servidor não marca nem deixa lápide", async () => {
    await remoteWrite(db, ["sessions"], async () => {
      await db.sessions.put({ id: "r1", planId: "p", week: 1, dayKey: "A", dayName: "A", color: "#fff", date: "2026-10-01", startedAt: 1, status: "done", deload: false, exercises: [], u: 5, _d: 0 } as never);
      await db.sessions.delete("r1");
    });
    expect(await db.tombs.count()).toBe(0);
    expect((await dirty()).sessions).toBe(0);
  });

  it("ids de texto únicos e ordenáveis pelo tempo", () => {
    const ids = Array.from({ length: 200 }, newId);
    expect(new Set(ids).size).toBe(200);
    // ordenável pelo tempo (prefixo de 9 caracteres = milissegundo); no mesmo milissegundo a ordem é a do sorteio
    const time = (id: string) => id.slice(0, 9);
    for (let i = 1; i < ids.length; i++) expect(time(ids[i - 1]) <= time(ids[i])).toBe(true);
    expect(newId().slice(0, 9) > "000000000").toBe(true);
  });

  it("exercício igual à biblioteca não sobe; editado sobe", () => {
    const lib = libraryJson[0] as Exercise;
    expect(differsFromLibrary({ ...lib })).toBe(false);
    expect(differsFromLibrary({ ...lib, u: 3, _d: 1 } as Exercise)).toBe(false);
    expect(differsFromLibrary({ ...lib, video: "https://x" })).toBe(true);
    expect(differsFromLibrary({ ...lib, name: "Meu exercício" })).toBe(true);
  });

  it("dados antigos: ids fixos (m00000057) e séries apontando para a sessão certa", () => {
    const d = fromLegacy({ sessions: [{ id: 57, date: "2026-10-01" }], sets: [{ id: 812, sessionId: 57 }], measures: [{ id: 3 }], photos: [{ id: 9 }] });
    expect(d.sessions[0].id).toBe("m00000057");
    expect(d.sets[0]).toMatchObject({ id: "m00000812", sessionId: "m00000057" });
    expect(d.measures[0].id).toBe("m00000003");
    expect(d.photos?.[0].id).toBe("m00000009");
    // rodar de novo dá os mesmos ids
    expect(fromLegacy({ sessions: [{ id: 57 }] }).sessions[0].id).toBe("m00000057");
  });

  it("backup: exporta, restaura (antigo e novo), apaga o que sobrou e preserva ajustes do aparelho", async () => {
    await setSetting("deviceId", "dev-aqui");
    await setSetting("heightCm", 180);
    await addMeasure({ date: "2026-10-01", type: "peso", value: 80 });
    const text = await exportBackup();
    expect(JSON.parse(text).format).toBe("pulso/backup@2");
    expect(text).not.toContain('"_d"');
    // algo novo depois do backup some ao restaurar (com lápide)
    await addMeasure({ date: "2026-10-02", type: "peso", value: 79 });
    const extra = (await db.measures.toArray()).find((m) => m.value === 79)!;
    await setSetting("deviceId", "dev-outro");
    await importBackup(text);
    expect((await db.measures.toArray()).map((m) => m.value)).toEqual([80]);
    expect(await db.tombs.get(`measures|${extra.id}`)).toBeTruthy(); // apagado também nos outros aparelhos
    expect((await db.settings.get("deviceId"))?.value).toBe("dev-outro"); // ajuste do aparelho não volta
    expect((await db.settings.get("heightCm"))?.value).toBe(180);
    expect(await db.exercises.count()).toBe(libraryJson.length);
  });

  it("backup antigo (app-treino/backup@1, ids numéricos) restaura convertido", async () => {
    const legacy = {
      format: "app-treino/backup@1",
      exercises: libraryJson,
      plans: [],
      sessions: [{ id: 1, planId: "p", week: 1, dayKey: "A", dayName: "A", color: "#FF3B5C", date: "2026-09-01", startedAt: 1, status: "done", deload: false, exercises: [] }],
      sets: [{ id: 1, sessionId: 1, exOrder: 0, exercise: "Barbell Curl", setIndex: 0, kind: "work", targetKg: 20, targetReps: 10, kg: 20, reps: 10, rir: null, done: true }],
      flags: [],
      settings: [{ key: "name", value: "Rafael" }],
      measures: [{ id: 1, date: "2026-07-27", type: "peso", value: 82.2 }],
    };
    await importBackup(JSON.stringify(legacy));
    expect(await db.sets.get("m00000001")).toMatchObject({ sessionId: "m00000001", kg: 20 });
    expect((await dirty()).exercises).toBe(0); // biblioteca igual não sobe
    expect((await dirty()).sets).toBe(1);
  });
});

void Dexie;

describe("relatório para o Claude", () => {
  it("leva a composição corporal estimada pelas medidas", async () => {
    await setSetting("heightCm", 180);
    await addMeasure({ type: "peso", date: "2026-10-22", value: 87.8 });
    await addMeasure({ type: "cintura", date: "2026-10-22", value: 91.5 });
    await addMeasure({ type: "pescoco", date: "2026-09-30", value: 41.5 }); // de antes do período, ainda vale (≤ 30 dias)
    const log = JSON.parse(await exportLog("2026-10-19", "2026-10-25"));
    expect(log.composition).toEqual([{ date: "2026-10-22", weight: 87.8, bodyFat: 18.4, method: "marinha", leanKg: 71.6, fatKg: 16.2, ffmi: 22.1 }]);
  });
});
