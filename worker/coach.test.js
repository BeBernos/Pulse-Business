import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index.js";
import { fakeD1 } from "./testing/d1.js";
import seed from "../src/data/seed-plan.json";

const ORIGIN = "https://app-treino.example.workers.dev";
let env;
beforeEach(() => {
  env = { DB: fakeD1(), PULSO_SETUP: "codigo", ASSETS: { fetch: () => new Response("") } };
});

function device(name) {
  let cookie = "";
  async function call(path, body, method) {
    const res = await worker.fetch(new Request(ORIGIN + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: { "content-type": "application/json", origin: ORIGIN, cookie, "cf-connecting-ip": name }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  return { call };
}

/** O claude.ai chamando o conector (sem cookie nem origin do app). */
async function mcp(url, method, params = {}, id = 1) {
  const res = await worker.fetch(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }), env);
  return { status: res.status, body: await res.json().catch(() => null) };
}
const tool = async (url, name, args = {}) => {
  const r = await mcp(url, "tools/call", { name, arguments: args });
  return { error: r.body.result.isError, text: r.body.result.content[0].text };
};

describe("conector do Claude", () => {
  it("endereço secreto por pessoa: lê o treino, confere e só publica quando pedido", async () => {
    const a = device("S25");
    await a.call("/api/auth/setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    const t = Date.now();
    await a.call("/api/sync", { since: 0, changes: [
      { t: "sessions", k: "s1", u: t, v: { id: "s1", date: "2026-11-03", dayKey: "B", dayName: "Pull", status: "done", startedAt: t - 3600_000, endedAt: t } },
      { t: "sets", k: "x1", u: t, v: { id: "x1", sessionId: "s1", exercise: "Wide Grip Lat Pulldown", exOrder: 0, setIndex: 0, kind: "work", done: true, kg: 82.5, reps: 8, rir: 2 } },
      { t: "measures", k: "m1", u: t, v: { id: "m1", date: "2026-11-03", type: "peso", value: 84.2 } },
    ] });
    const { body } = await a.call("/api/mcp/token", {});
    expect(body.url).toMatch(/\/api\/mcp\/[\w-]{20,}$/);

    const init = await mcp(body.url, "initialize", { protocolVersion: "2025-06-18" });
    expect(init.body.result.serverInfo.name).toBe("pulse");
    const list = await mcp(body.url, "tools/list");
    expect(list.body.result.tools.map((x) => x.name)).toEqual(["contexto_de_treino", "plano_atual", "formato_do_plano", "feedback_do_app", "publicar_plano"]);
    await a.call("/api/sync/feedback", { at: 1793700000000, text: "Descanso some com a tela apagada", route: "#/treino", version: "1.7.0" });
    expect(JSON.parse((await tool(body.url, "feedback_do_app")).text).anotacoes[0].texto).toBe("Descanso some com a tela apagada");

    const ctx = JSON.parse((await tool(body.url, "contexto_de_treino", { semanas: 26 })).text);
    expect(ctx.treinos[0].exercicios[0]).toMatchObject({ nome: "Wide Grip Lat Pulldown", series: "82.5x8@2" });
    expect(ctx.peso.at(-1)).toEqual(["2026-11-03", 84.2]);
    expect((await tool(body.url, "formato_do_plano")).text).toContain("Wide Grip Lat Pulldown");

    const bad = await tool(body.url, "publicar_plano", { plano: { format: "app-treino/plan@1" }, so_validar: true });
    expect(bad.error).toBe(true);
    const check = await tool(body.url, "publicar_plano", { plano: seed, so_validar: true });
    expect(check.text).toContain("NÃO publicado");
    expect(env.DB.raw.prepare("SELECT COUNT(*) n FROM records WHERE t = 'plans'").get().n).toBe(0);
    const pub = await tool(body.url, "publicar_plano", { plano: seed, so_validar: false });
    expect(pub.text).toContain("Publicado e ativado");
    // o celular recebe o plano ativo na sincronização
    const got = (await a.call("/api/sync", { since: 0, changes: [] })).body.changes;
    expect(got.find((c) => c.t === "plans")?.v.plan.block.id).toBe(seed.block.id);
    expect(got.find((c) => c.t === "settings" && c.k === "activePlanId")?.v.value).toBe(seed.block.id);
  });

  it("endereço inválido ou trocado não abre nada", async () => {
    const a = device("S25");
    await a.call("/api/auth/setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    const first = (await a.call("/api/mcp/token", {})).body.url;
    const second = (await a.call("/api/mcp/token", {})).body.url;
    expect((await mcp(first, "tools/list")).status).toBe(404);
    expect((await mcp(second, "tools/list")).status).toBe(200);
    expect((await mcp(`${ORIGIN}/api/mcp/xxxxxxxxxxxxxxxxxxxxxxxx`, "tools/list")).status).toBe(404);
    await a.call("/api/mcp/token", undefined, "DELETE");
    expect((await mcp(second, "tools/list")).status).toBe(404);
    expect((await device("x").call("/api/mcp/token", {})).status).toBe(401);
  });
});
