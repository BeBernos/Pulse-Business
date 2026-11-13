import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error Worker em JS puro (sem tipos)
import worker from "../worker/index.js";
// @ts-expect-error idem
import { fakeD1 } from "../worker/testing/d1.js";
import { addMeasure, db, deleteSession, saveAnalysis, ensureSeeded, openDb, selectDb, setSetting, startFreestyle, addExerciseToSession, type PulsoDB } from "./db";
import { applyRemote, collect, configureSync, localCounts, pendingCount, remoteWins, serverCounts, syncNow } from "./sync";

const ORIGIN = "https://app-treino.example.workers.dev";
let env: Record<string, unknown>;
let n = 0;

/** Um aparelho = um banco local + um "navegador" com cookie próprio, falando com o Worker de verdade. */
async function device(name: string) {
  const d = openDb(`sync-${name}-${++n}`);
  await ensureSeeded();
  let cookie = "";
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), ORIGIN + "/");
    const res = await worker.fetch(new Request(url, { ...init, headers: { ...(init?.headers as Record<string, string>), origin: ORIGIN, cookie, "cf-connecting-ip": name } }), env as never);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
  const use = () => {
    selectDb(d);
    configureSync({ base: `${ORIGIN}/api/sync`, fetch: fetcher as typeof fetch, device: name });
  };
  const auth = (path: string, body: unknown) => fetcher(`${ORIGIN}/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { db: d as PulsoDB, use, auth };
}

beforeEach(() => {
  env = { DB: fakeD1(), PULSO_SETUP: "codigo", ASSETS: { fetch: () => new Response("") } };
});

describe("sincronização entre aparelhos", () => {
  it("regra do desempate igual à do servidor", () => {
    expect(remoteWins({ u: 2, v: { a: 1 } }, { u: 1, v: { a: 2 } })).toBe(true);
    expect(remoteWins({ u: 1, v: null }, { u: 1, v: { a: 1 } })).toBe(false);
    expect(remoteWins({ u: 1, v: { a: 1 } }, null)).toBe(true);
  });

  it("celular registra treino offline; PC recebe; edição e exclusão convergem", async () => {
    const s25 = await device("S25");
    await s25.auth("setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    const pc = await device("PC");
    await pc.auth("login", { name: "Rafael", password: "senha-forte-1" });

    s25.use();
    const id = await startFreestyle("2026-10-21");
    await addExerciseToSession((await db.sessions.get(id))!, "Barbell Curl", { sets: 2, reps: 10, restSec: 60 });
    await addMeasure({ date: "2026-10-21", type: "peso", value: 81.5 });
    await setSetting("heightCm", 180);
    await setSetting("deviceId", "dev-s25"); // ajuste do aparelho: não vai
    expect(await pendingCount()).toBe(5);
    expect((await collect()).some((c) => c.k === "deviceId")).toBe(false);
    await syncNow();
    expect(await pendingCount()).toBe(0);

    pc.use();
    await syncNow();
    expect(await db.sessions.get(id)).toMatchObject({ dayName: "Treino livre", _d: 0 });
    expect(await db.sets.where({ sessionId: id }).count()).toBe(2);
    expect((await db.settings.get("heightCm"))?.value).toBe(180);
    expect(await db.settings.get("deviceId")).toBeUndefined();
    expect(await pendingCount()).toBe(0); // o que chegou não volta

    // PC edita a nota; celular apaga o treino depois → apagar vence (mais novo)
    await db.sessions.update(id, { notes: "feito no PC" });
    await syncNow();
    s25.use();
    await syncNow();
    expect((await db.sessions.get(id))?.notes).toBe("feito no PC");
    await deleteSession(id);
    await syncNow();
    pc.use();
    await syncNow();
    expect(await db.sessions.get(id)).toBeUndefined();
    expect(await db.sets.where({ sessionId: id }).count()).toBe(0);
    expect(await db.tombs.count()).toBe(0); // apagado vindo de fora não gera lápide aqui

    // conferência: o que o aparelho tem = o que o servidor tem
    expect(await serverCounts()).toEqual(await localCounts());
  });

  it("análise do Claude colada no celular aparece no PC; apagar some nos dois", async () => {
    const s25 = await device("S25");
    await s25.auth("setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    const pc = await device("PC");
    await pc.auth("login", { name: "Rafael", password: "senha-forte-1" });
    s25.use();
    const id = await saveAnalysis({ title: "Semana 12", summary: "Boa adesão.", from: "2026-10-13", to: "2026-10-19", nextSteps: ["Manter"] });
    await syncNow();
    pc.use();
    await syncNow();
    expect(await db.analyses.get(id)).toMatchObject({ title: "Semana 12", nextSteps: ["Manter"] });
    await db.analyses.delete(id);
    await syncNow();
    s25.use();
    await syncNow();
    expect(await db.analyses.get(id)).toBeUndefined();
  });

  it("mudança local mais nova não é atropelada pelo que chega", async () => {
    const a = await device("A");
    a.use();
    await setSetting("goalWeight", 78);
    const local = (await db.settings.get("goalWeight")) as unknown as { u: number };
    const n = await applyRemote([{ t: "settings", k: "goalWeight", u: local.u - 10, v: { key: "goalWeight", value: 70 } }]);
    expect(n).toBe(0);
    expect((await db.settings.get("goalWeight"))?.value).toBe(78);
  });

  it("muitos registros: vai e volta em lotes", { timeout: 30_000 }, async () => {
    const s25 = await device("S25");
    await s25.auth("setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    s25.use();
    await db.measures.bulkAdd(Array.from({ length: 1234 }, (_, i) => ({ id: `x${i}`, date: "2026-01-01", type: "peso" as const, value: 80 })));
    const r = await syncNow();
    expect(r.pushed).toBe(1234);
    const pc = await device("PC");
    await pc.auth("login", { name: "Rafael", password: "senha-forte-1" });
    pc.use();
    await syncNow();
    expect(await db.measures.count()).toBe(1234);
  });

  it("sem login: status 'auth' e nada se perde", async () => {
    const a = await device("A");
    a.use();
    await setSetting("goalWeight", 78);
    await expect(syncNow()).rejects.toThrow();
    expect(await pendingCount()).toBe(1);
  });
});
