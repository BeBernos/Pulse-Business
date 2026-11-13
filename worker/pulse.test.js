import { describe, expect, it } from "vitest";
import worker from "./index.js";
import pulse from "./pulse.js";
import { fakeD1 } from "./testing/d1.js";

const OLD = "https://app-treino.example.workers.dev";
const NEW = "https://pulse.example.workers.dev";

function fakeKV() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), m };
}

describe("Fase 6: endereço novo (Worker pulse)", () => {
  it("o pulse serve o app e repassa /api/* ao app-treino, com o mesmo endereço e cookie", async () => {
    const seen = [];
    const env = {
      ASSETS: { fetch: async (r) => new Response("app:" + new URL(r.url).pathname) },
      TREINO: { fetch: async (r) => (seen.push({ url: r.url, cookie: r.headers.get("cookie"), origin: r.headers.get("origin") }), Response.json({ ok: true })) },
    };
    expect(await (await pulse.fetch(new Request(NEW + "/index.html"), env)).text()).toBe("app:/index.html");
    const r = await pulse.fetch(new Request(NEW + "/api/sync", { method: "POST", headers: { cookie: "pulso_s=x", origin: NEW }, body: "{}" }), env);
    expect(r.status).toBe(200);
    expect(seen).toEqual([{ url: NEW + "/api/sync", cookie: "pulso_s=x", origin: NEW }]);
  });

  it("sem a ligação, /api responde 503 (não quebra o app)", async () => {
    const r = await pulse.fetch(new Request(NEW + "/api/auth/me"), { ASSETS: { fetch: async () => new Response("") } });
    expect(r.status).toBe(503);
  });

  it("depois que o endereço novo é usado, quem abre o antigo recebe o aviso (newOrigin); o novo não", async () => {
    const env = { DB: fakeD1(), PULSO_SETUP: "codigo", KV: fakeKV(), ASSETS: { fetch: () => new Response("") } };
    const waits = [];
    const ctx = { waitUntil: (p) => waits.push(p) };
    const me = async (base) => (await worker.fetch(new Request(base + "/api/auth/me"), env, ctx)).json();
    expect((await me(OLD)).newOrigin).toBeUndefined();
    await me(NEW); // primeiro uso do endereço novo (vem pelo pulse com o host dele)
    await Promise.all(waits);
    expect(env.KV.m.get("moved")).toBe(NEW);
    expect((await me(OLD)).newOrigin).toBe(NEW);
    expect((await me(NEW)).newOrigin).toBeUndefined();
  });

  it("login pelo endereço novo: cookie e checagem de origem valem lá", async () => {
    const env = { DB: fakeD1(), PULSO_SETUP: "codigo", ASSETS: { fetch: () => new Response("") } };
    const r = await worker.fetch(new Request(NEW + "/api/auth/setup", { method: "POST", headers: { origin: NEW, "content-type": "application/json" }, body: JSON.stringify({ code: "codigo", name: "Rafael", password: "senha-forte-1" }) }), env);
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("pulso_s=");
    // de outra origem (o antigo tentando escrever no novo): recusado
    const bad = await worker.fetch(new Request(NEW + "/api/auth/login", { method: "POST", headers: { origin: OLD }, body: "{}" }), env);
    expect(bad.status).toBe(403);
  });
});
