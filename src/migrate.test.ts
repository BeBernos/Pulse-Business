import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import libraryJson from "./data/library.json";
import { LIBRARY } from "./lib/library";
import seed from "./data/seed-plan.json";
import { db, ensureSeeded, openDb } from "./db";
import { exportLegacyBackup, LEGACY_DB, mergeBackupFile, mergeLegacy, MigrationError, migrateLegacy, migrationReport, probeDevice } from "./migrate";
import { collect } from "./sync";

/** Cria o banco do app antigo exatamente como ele era (Dexie v4, ids automáticos). */
async function makeLegacy() {
  const old = new Dexie(LEGACY_DB);
  old.version(1).stores({ exercises: "&name, group", plans: "&id, importedAt", sessions: "++id, date, status, planId, [planId+week]", sets: "++id, sessionId, exercise, [exercise+completedAt]", flags: "&exercise", settings: "&key" });
  old.version(2).stores({ measures: "++id, date, type, [type+date]" });
  old.version(3).stores({ skips: "&date" });
  old.version(4).stores({ photos: "++id, date, pose" });
  await old.open();
  const lib = libraryJson.map((e) => ({ ...e }));
  lib[0] = { ...lib[0], video: "https://meu-video" } as never; // editado pela pessoa
  await old.table("exercises").bulkAdd([...lib, { name: "Meu Exercício", group: "Outros", equipment: "", pattern: "", unilateral: false, blocks: [], notes: "", vetoed: false, custom: true }]);
  await old.table("plans").add({ id: seed.block.id, plan: seed, importedAt: 1 });
  for (let i = 0; i < 12; i++) {
    const sid = await old.table("sessions").add({ planId: seed.block.id, week: 1, dayKey: "A", dayName: "A", color: "#FF3B5C", date: `2026-08-${String(i + 1).padStart(2, "0")}`, startedAt: i, endedAt: i + 1, status: i === 11 ? "active" : "done", deload: false, exercises: [] });
    for (let j = 0; j < 5; j++) await old.table("sets").add({ sessionId: sid, exOrder: 0, exercise: "Barbell Curl", setIndex: j, kind: "work", targetKg: 20, targetReps: 10, kg: 20 + j, reps: 10, rir: null, done: j < 4 });
  }
  await old.table("settings").bulkAdd([{ key: "activePlanId", value: seed.block.id }, { key: "deviceId", value: "dev-velho" }, { key: "name", value: "Rafael" }]);
  await old.table("measures").bulkAdd([{ date: "2026-07-27", type: "peso", value: 82.2 }, { date: "2026-08-10", type: "cintura", value: 88 }]);
  await old.table("skips").add({ date: "2026-08-20", reason: "Viagem" });
  await old.table("flags").add({ exercise: "Barbell Curl", type: "suspended", until: "2026-12-01" });
  await old.table("photos").add({ date: "2026-08-01", pose: "frente", blob: new Blob(["x"]), thumb: new Blob(["y"]) });
  old.close();
}

let n = 0;
beforeEach(async () => {
  if (await Dexie.exists(LEGACY_DB)) await Dexie.delete(LEGACY_DB);
  openDb(`mig-${++n}`);
  await ensureSeeded();
});

describe("migração do app antigo", () => {
  it("sem app antigo: nada a fazer", async () => {
    expect(await migrateLegacy()).toBeNull();
  });

  it("copia tudo, confere e não toca no banco antigo", async () => {
    await makeLegacy();
    const r = await migrateLegacy();
    expect(r?.ok).toBe(true);
    expect(r?.diffs).toEqual([]);
    expect(r?.before).toMatchObject({ sessions: 12, sessionsDone: 11, sets: 60, setsDone: 48, measures: 2, skips: 1, flags: 1, photos: 1, plans: 1, customExercises: 2, lastSession: "2026-08-12" });
    expect(r?.after).toEqual(r?.before);

    // ids fixos e séries ligadas à sessão certa
    const first = await db.sessions.get("m00000001");
    expect(first?.date).toBe("2026-08-01");
    expect(await db.sets.where({ sessionId: "m00000001" }).count()).toBe(5);
    expect((await db.sessions.where("status").equals("active").first())?.id).toBe("m00000012");
    expect((await db.settings.get("deviceId"))?.value).toBe("dev-velho"); // mesmo aparelho: lembretes seguem
    expect((await db.exercises.get(libraryJson[0].name))?.video).toBe("https://meu-video");
    expect(await db.exercises.count()).toBe(LIBRARY.length + 1);

    // tudo pronto para subir (menos ajustes do aparelho e a biblioteca intocada)
    const pending = await collect(10_000);
    expect(pending.filter((c) => c.t === "sessions")).toHaveLength(12);
    expect(pending.filter((c) => c.t === "exercises").map((c) => c.k).sort()).toEqual([libraryJson[0].name, "Meu Exercício"].sort());
    expect(pending.some((c) => c.k === "deviceId")).toBe(false);

    // banco antigo intacto (mesma versão, mesmos dados)
    const old = new Dexie(LEGACY_DB);
    await old.open();
    expect(old.verno).toBe(4);
    expect(await old.table("sessions").count()).toBe(12);
    expect(await old.table("sets").count()).toBe(60);
    old.close();

    // rodar de novo não duplica
    expect((await migrateLegacy())?.at).toBe(r?.at);
    expect(await db.sessions.count()).toBe(12);
    expect(await migrationReport()).toMatchObject({ ok: true });
  });

  it("já migrado neste aparelho (banco novo apagado): não copia de novo", async () => {
    await makeLegacy();
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    try {
      expect((await migrateLegacy())?.ok).toBe(true);
      openDb(`mig-apagado-${++n}`); // "Sair e apagar": banco novo vazio
      await ensureSeeded();
      expect(await migrateLegacy()).toBeNull();
      expect(await db.sessions.count()).toBe(0);
    } finally {
      delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    }
  });

  it("resgate: diagnóstico conta o app antigo e 'copiar de novo' passa por cima da marca", async () => {
    await makeLegacy();
    const store = new Map<string, string>([["pulso.legacyMigrated", "1"]]);
    (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    try {
      const p = await probeDevice();
      expect(p.legacy?.counts).toMatchObject({ sessions: 12, sets: 60 });
      expect(await migrateLegacy()).toBeNull(); // marca de "já copiado"
      expect(JSON.parse(store.get("pulso.migrationLog")!).result).toMatch(/já copiado/);
      expect((await migrateLegacy({ force: true }))?.ok).toBe(true);
      expect(await db.sessions.count()).toBe(12);
      expect(JSON.parse(store.get("pulso.migrationLog")!).result).toMatch(/copiado: 12/);
    } finally {
      delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    }
  });

  it("resgate na conta com dados: só acrescenta (plano importado e medidas ficam), e a faixa some", async () => {
    await makeLegacy();
    // estado do Rafael: conta com um plano importado agora e uma medida nova; nenhum treino
    await db.plans.put({ id: "plano-novo", plan: { ...seed, block: { ...seed.block, id: "plano-novo" } } as never, importedAt: 2 });
    await db.settings.put({ key: "activePlanId", value: "plano-novo" });
    await db.measures.put({ id: "nova", date: "2026-10-21", type: "peso", value: 80 });
    expect((await probeDevice()).missingSessions).toBe(12);
    const n = await mergeLegacy();
    expect(n).toBeGreaterThan(70);
    expect(await db.plans.get("plano-novo")).toBeTruthy();
    expect((await db.settings.get("activePlanId"))?.value).toBe("plano-novo"); // não trocou o plano ativo
    expect(await db.measures.get("nova")).toBeTruthy();
    expect(await db.sessions.count()).toBe(12);
    expect(await db.tombs.count()).toBe(0); // nada apagado (nada some nos outros aparelhos)
    expect((await probeDevice()).missingSessions).toBe(0);
    expect(await mergeLegacy()).toBe(0); // de novo: nada a fazer
  });

  it("resgate por arquivo de backup também só acrescenta", async () => {
    await db.measures.put({ id: "nova", date: "2026-10-21", type: "peso", value: 80 });
    const file = { format: "app-treino/backup@1", exercises: [], plans: [], sessions: [{ id: 3, planId: "p", week: 1, dayKey: "A", dayName: "A", color: "#FF3B5C", date: "2026-09-01", startedAt: 1, status: "done", deload: false, exercises: [] }], sets: [], flags: [], settings: [], measures: [{ id: 1, date: "2026-07-27", type: "peso", value: 82.2 }] };
    expect(await mergeBackupFile(JSON.stringify(file))).toBe(2);
    expect(await db.measures.count()).toBe(2);
    await expect(mergeBackupFile('{"format":"outro"}')).rejects.toThrow(/backup/);
  });

  it("interrompida no meio: rodar de novo termina sem duplicar", async () => {
    await makeLegacy();
    await db.sessions.put({ id: "m00000001", planId: "x", week: 1, dayKey: "A", dayName: "parcial", color: "#fff", date: "2026-08-01", startedAt: 0, status: "done", deload: false, exercises: [] });
    const r = await migrateLegacy();
    expect(r?.ok).toBe(true);
    expect(await db.sessions.count()).toBe(12);
    expect((await db.sessions.get("m00000001"))?.dayName).toBe("A");
  });

  it("conferência que não bate: desfaz e avisa; antigo continua lá", async () => {
    await makeLegacy();
    // simula perda durante a cópia: o banco novo "esquece" séries feitas
    const origToArray = db.sets.toArray.bind(db.sets);
    db.sets.toArray = (async () => (await origToArray()).slice(1)) as never;
    await expect(migrateLegacy()).rejects.toBeInstanceOf(MigrationError);
    db.sets.toArray = origToArray as never;
    expect(await db.sessions.count()).toBe(0);
    expect(await migrationReport()).toBeNull();
    const backup = JSON.parse((await exportLegacyBackup())!);
    expect(backup.format).toBe("app-treino/backup@1");
    expect(backup.sessions).toHaveLength(12);
  });
});
