import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index.js";
import { fakeD1 } from "./testing/d1.js";

const ORIGIN = "https://app-treino.example.workers.dev";
let env;
beforeEach(() => {
  env = { DB: fakeD1(), PULSO_SETUP: "codigo", ASSETS: { fetch: () => new Response("") } };
});

function device(name) {
  let cookie = "";
  let since = 0;
  async function call(path, body, method) {
    const res = await worker.fetch(new Request(ORIGIN + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: { "content-type": "application/json", origin: ORIGIN, cookie, "cf-connecting-ip": name }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: await res.json() };
  }
  const sync = async (changes = []) => {
    const r = await call("/api/sync", { since, changes });
    since = r.body.seq;
    return r;
  };
  return { call, sync };
}

describe("lixeira", () => {
  it("treino apagado vai para a lixeira e volta com as séries", async () => {
    const a = device("S25");
    await a.call("/api/auth/setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    const t = Date.now();
    await a.sync([
      { t: "sessions", k: "s1", u: t, v: { id: "s1", date: "2026-11-03", dayKey: "B", dayName: "Pull", status: "done" } },
      { t: "sets", k: "x1", u: t, v: { id: "x1", sessionId: "s1", done: true, kg: 80, reps: 8 } },
      { t: "sets", k: "x2", u: t, v: { id: "x2", sessionId: "s1", done: false, kg: null, reps: null } },
      { t: "measures", k: "m1", u: t, v: { id: "m1", date: "2026-11-03", type: "peso", value: 84.2 } },
    ]);
    // apaga o treino (e as séries) e uma medida
    await a.sync([{ t: "sessions", k: "s1", u: t + 10, v: null }, { t: "sets", k: "x1", u: t + 10, v: null }, { t: "sets", k: "x2", u: t + 10, v: null }, { t: "measures", k: "m1", u: t + 10, v: null }]);
    const list = (await a.call("/api/sync/trash")).body.items;
    expect(list.find((i) => i.k === "s1")).toMatchObject({ t: "sessions", date: "2026-11-03", label: "B · Pull", sets: 2, done: 1 });
    expect(list.find((i) => i.k === "m1")).toMatchObject({ t: "measures", label: "peso", value: 84.2 });
    expect(list.some((i) => i.t === "sets")).toBe(false); // séries vão junto com o treino

    const r = await a.call("/api/sync/restore", { t: "sessions", k: "s1" });
    expect(r.body.restored).toBe(3);
    // outro aparelho recebe o treino de volta
    const b = device("PC");
    await b.call("/api/auth/login", { name: "Rafael", password: "senha-forte-1", device: "PC" });
    const got = (await b.sync()).body.changes;
    expect(got.find((c) => c.k === "s1")?.v).toMatchObject({ dayName: "Pull" });
    expect(got.filter((c) => c.t === "sets" && c.v)).toHaveLength(2);
    expect((await a.call("/api/sync/trash")).body.items.some((i) => i.k === "s1")).toBe(false);
  });

  it("fica só 3 dias", async () => {
    const a = device("S25");
    await a.call("/api/auth/setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    const t = Date.now();
    await a.sync([{ t: "measures", k: "m1", u: t, v: { id: "m1", date: "2026-11-01", type: "peso", value: 84 } }]);
    await a.sync([{ t: "measures", k: "m1", u: t + 10, v: null }]);
    expect((await a.call("/api/sync/trash")).body.items).toHaveLength(1);
    env.DB.raw.exec(`UPDATE trash SET deleted_at = ${t - 3 * 86_400_000 - 1000}`);
    expect((await a.call("/api/sync/trash")).body.items).toHaveLength(0);
  });

  it("só guarda o que a lápide venceu (apagar algo mais velho não joga o atual fora)", async () => {
    const a = device("S25");
    await a.call("/api/auth/setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    const t = Date.now();
    await a.sync([{ t: "measures", k: "m1", u: t, v: { id: "m1", date: "2026-11-03", type: "peso", value: 84 } }]);
    await a.sync([{ t: "measures", k: "m1", u: t - 1000, v: null }]);
    expect((await a.call("/api/sync/trash")).body.items).toEqual([]);
    expect((await a.call("/api/sync/restore", { t: "measures", k: "m1" })).status).toBe(404);
  });

  it("erros do app ficam guardados (os últimos 200)", async () => {
    const a = device("S25");
    await a.call("/api/auth/setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    for (let i = 0; i < 203; i++) await a.call("/api/sync/errors", { message: `erro ${i}`, route: "#/treino", version: "1.6.0" });
    const rows = env.DB.raw.prepare("SELECT message FROM errors ORDER BY at DESC, rowid DESC").all();
    expect(rows).toHaveLength(200);
    expect(rows[0].message).toBe("erro 202");
    expect((await device("x").call("/api/sync/errors", { message: "sem login" })).status).toBe(401);
  });

  it("anotação do feedback chega ao servidor uma vez só", async () => {
    const a = device("S25");
    await a.call("/api/auth/setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    const note = { at: 1793700000000, text: "Superset em telas separadas", route: "#/treino", version: "1.7.0" };
    expect((await a.call("/api/sync/feedback", note)).status).toBe(200);
    expect((await a.call("/api/sync/feedback", note)).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT text FROM feedback").all()).toEqual([{ text: "Superset em telas separadas" }]);
    expect((await a.call("/api/sync/feedback", { at: 1, text: "  " })).status).toBe(400);
  });
});
