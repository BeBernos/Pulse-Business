import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index.js";
import { opsFor } from "./ponte.js";
import { fakeD1 } from "./testing/d1.js";

const ORIGIN = "https://app-treino.example.workers.dev";

/** Plano da Família de mentira: a mesma tabela "log" (uma linha por tipo/dia/pessoa) e a classe Ponte. */
function fakeFamilia() {
  const log = new Map();
  let clock = Date.now();
  const api = {
    log,
    calls: { pesos: 0, gravar: 0 },
    fail: false,
    /** Peso registrado pelo app da família (outro celular). */
    registrarLa(person, day, kg) {
      log.set(`weight|${day}|${person}`, { kind: "weight", day, person, v: String(kg), deleted: 0, updated: ++clock + 1000 });
    },
    async pesos(person, since) {
      api.calls.pesos++;
      if (api.fail) throw new Error("fora do ar");
      const rows = [...log.values()].filter((r) => r.kind === "weight" && r.person === person && r.updated > since).sort((a, b) => a.updated - b.updated);
      return { now: clock, rows: rows.map((r) => ({ day: r.day, kg: r.v == null ? null : Number(r.v), deleted: !!r.deleted, updated: r.updated })) };
    },
    async gravar(ops) {
      api.calls.gravar++;
      if (api.fail) throw new Error("fora do ar");
      for (const o of ops) log.set(`${o.kind}|${o.day}|${o.person}`, { ...o, v: o.v ?? null, deleted: o.deleted ? 1 : 0, updated: ++clock + 1000 });
      return { written: ops.length };
    },
  };
  return api;
}

let env;
let familia;
beforeEach(() => {
  familia = fakeFamilia();
  env = { DB: fakeD1(), PULSO_SETUP: "codigo", ASSETS: { fetch: () => new Response("") }, FAMILIA: familia };
});

function device(name) {
  let cookie = "";
  async function call(path, body) {
    const res = await worker.fetch(
      new Request(ORIGIN + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", origin: ORIGIN, cookie, "cf-connecting-ip": name }, body: body === undefined ? undefined : JSON.stringify(body) }),
      env,
    );
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: await res.json() };
  }
  let since = 0;
  const sync = async (changes = []) => {
    const r = await call("/api/sync", { since, changes });
    since = r.body.seq;
    return r;
  };
  return { call, sync };
}

/** Libera a próxima consulta de pesos (a ponte pergunta no máximo a cada 2 min). */
const unthrottle = () => env.DB.raw.exec("UPDATE bridge_state SET last_at = 0");
const peso = (id, date, value, u = Date.now()) => ({ t: "measures", k: id, u, v: { id, date, type: "peso", value } });

async function rafaelEMarina() {
  const rafael = device("S25");
  await rafael.call("/api/auth/setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
  const inv = await rafael.call("/api/auth/invite", { kind: "join" });
  const marina = device("S26");
  await marina.call("/api/auth/join", { code: inv.body.code, name: "Marina", password: "senha-dela-9" });
  return { rafael, marina };
}

describe("ponte com o Plano da Família", () => {
  it("peso do Pulse vai para lá; apagar apaga; mudar a data apaga o dia antigo", async () => {
    const { rafael } = await rafaelEMarina();
    await rafael.sync([peso("p1", "2026-10-21", 81.4)]);
    expect(familia.log.get("weight|2026-10-21|rafael")).toMatchObject({ v: "81.4", deleted: 0 });
    await rafael.sync([peso("p1", "2026-10-22", 81.2, Date.now() + 5)]);
    expect(familia.log.get("weight|2026-10-21|rafael").deleted).toBe(1);
    expect(familia.log.get("weight|2026-10-22|rafael").v).toBe("81.2");
    await rafael.sync([{ t: "measures", k: "p1", u: Date.now() + 10, v: null }]);
    expect(familia.log.get("weight|2026-10-22|rafael").deleted).toBe(1);
    // medida que não é peso não passa
    await rafael.sync([{ t: "measures", k: "c1", u: Date.now(), v: { id: "c1", date: "2026-10-21", type: "cintura", value: 88 } }]);
    expect([...familia.log.keys()].some((k) => k.includes("cintura"))).toBe(false);
  });

  it("treino finalizado responde 'treinou'; pular responde 'não'; desfazer o pulo apaga", async () => {
    const { marina } = await rafaelEMarina();
    await marina.sync([{ t: "sessions", k: "s1", u: Date.now(), v: { id: "s1", date: "2026-10-21", status: "active" } }]);
    expect(familia.log.has("trained|2026-10-21|marina")).toBe(false); // ainda em andamento
    await marina.sync([{ t: "sessions", k: "s1", u: Date.now() + 1, v: { id: "s1", date: "2026-10-21", status: "done" } }]);
    expect(familia.log.get("trained|2026-10-21|marina").v).toBe("1");
    await marina.sync([{ t: "skips", k: "2026-10-22", u: Date.now(), v: { date: "2026-10-22", reason: "Viagem" } }]);
    expect(familia.log.get("trained|2026-10-22|marina").v).toBe("0");
    await marina.sync([{ t: "skips", k: "2026-10-22", u: Date.now() + 5, v: null }]);
    expect(familia.log.get("trained|2026-10-22|marina").deleted).toBe(1);
  });

  it("peso registrado lá chega só para a pessoa certa; editar lá (mais novo) atualiza aqui", async () => {
    const { rafael, marina } = await rafaelEMarina();
    await rafael.sync();
    await marina.sync();
    familia.registrarLa("marina", "2026-10-20", 61.2);
    await unthrottle();
    const r = await marina.sync();
    expect(r.body.changes.find((c) => c.k === "pf-2026-10-20")?.v).toMatchObject({ type: "peso", date: "2026-10-20", value: 61.2, note: "Plano da Família" });
    await unthrottle();
    expect((await rafael.sync()).body.changes.some((c) => c.k.startsWith("pf-"))).toBe(false);
    // editou lá de novo
    familia.registrarLa("marina", "2026-10-20", 61.0);
    await unthrottle();
    expect((await marina.sync()).body.changes.find((c) => c.k === "pf-2026-10-20")?.v.value).toBe(61.0);
  });

  it("1ª vez: histórico de peso do Pulse sobe para lá; o que já existe lá não duplica aqui", async () => {
    const rafael = device("S25");
    await rafael.call("/api/auth/setup", { code: "codigo", name: "Rafael", password: "senha-forte-1" });
    familia.fail = true; // ponte fora do ar no começo: nada quebra
    const r0 = await rafael.sync([peso("m1", "2026-07-27", 82.2, 1_000), peso("m2", "2026-09-01", 81.4, 2_000)]);
    expect(r0.status).toBe(200);
    familia.fail = false;
    familia.registrarLa("rafael", "2026-09-01", 81.4);
    env.DB.raw.exec("DELETE FROM bridge_state");
    const r = await rafael.sync();
    expect(familia.log.get("weight|2026-07-27|rafael").v).toBe("82.2"); // só existia no Pulse: subiu
    expect(r.body.changes.some((c) => c.k === "pf-2026-09-01")).toBe(false); // mesmo valor no mesmo dia: não duplica
  });

  it("dois pesos no mesmo dia: lá fica o mais novo; apagar um deixa o outro", async () => {
    const { rafael } = await rafaelEMarina();
    const t = Date.now();
    await rafael.sync([peso("a", "2026-10-25", 84.6, t), peso("b", "2026-10-25", 84.1, t + 5)]);
    expect(familia.log.get("weight|2026-10-25|rafael")).toMatchObject({ v: "84.1", deleted: 0 });
    await rafael.sync([{ t: "measures", k: "b", u: t + 10, v: null }]);
    expect(familia.log.get("weight|2026-10-25|rafael")).toMatchObject({ v: "84.6", deleted: 0 });
  });

  it("o Pulse é o oficial: lá diferente (e o Pulse mais novo) é corrigido na conferência completa", async () => {
    const { rafael } = await rafaelEMarina();
    const futuro = Date.now() + 1e9; // o registro do Pulse é mais novo que qualquer coisa lá
    await rafael.sync([peso("a", "2026-10-26", 84.3, futuro), peso("b", "2026-10-27", 84.0, futuro)]);
    // lá alguém deixou outro valor (antigo) e apagou um dia
    familia.log.set("weight|2026-10-26|rafael", { kind: "weight", day: "2026-10-26", person: "rafael", v: "86", deleted: 0, updated: 5 });
    familia.log.set("weight|2026-10-27|rafael", { kind: "weight", day: "2026-10-27", person: "rafael", v: null, deleted: 1, updated: 6 });
    env.DB.raw.exec("DELETE FROM bridge_state");
    const r = await rafael.sync();
    expect(familia.log.get("weight|2026-10-26|rafael")).toMatchObject({ v: "84.3", deleted: 0 });
    expect(familia.log.get("weight|2026-10-27|rafael")).toMatchObject({ v: "84", deleted: 0 });
    expect(r.body.changes.some((c) => c.k.startsWith("pf-"))).toBe(false); // nada de lá virou peso no Pulse
  });

  it("conta \"rafa\" é a pessoa \"rafael\" lá (peso e treino)", async () => {
    const rafa = device("S25");
    await rafa.call("/api/auth/setup", { code: "codigo", name: "Rafa", password: "senha-forte-1" });
    await rafa.sync([peso("p1", "2026-10-29", 84.8), { t: "sessions", k: "s1", u: Date.now(), v: { id: "s1", date: "2026-10-29", status: "done" } }]);
    expect(familia.log.get("weight|2026-10-29|rafael")?.v).toBe("84.8");
    expect(familia.log.get("trained|2026-10-29|rafael")?.v).toBe("1");
    expect([...familia.log.keys()].some((k) => k.endsWith("|rafa"))).toBe(false);
    // conferência completa (o passo novo do schema zera o estado): o histórico vai para "rafael"
    familia.log.clear();
    env.DB.raw.exec("DELETE FROM bridge_state");
    await rafa.sync();
    expect(familia.log.get("weight|2026-10-29|rafael")?.v).toBe("84.8");
    familia.registrarLa("rafael", "2026-10-30", 84.5);
    await unthrottle();
    expect((await rafa.sync()).body.changes.find((c) => c.k === "pf-2026-10-30")?.v.value).toBe(84.5);
  });

  it("ajuste \"Você na Mesa\" escolhe a pessoa lá", async () => {
    const joao = device("S25");
    await joao.call("/api/auth/setup", { code: "codigo", name: "Joao", password: "senha-forte-1" });
    await joao.sync([{ t: "settings", k: "familyPerson", u: Date.now(), v: { key: "familyPerson", value: "theo" } }, peso("p1", "2026-11-04", 40.5)]);
    expect(familia.log.get("weight|2026-11-04|theo")?.v).toBe("40.5");
    expect([...familia.log.keys()].some((k) => k.endsWith("|joao"))).toBe(false);
  });

  it("treino finalizado com cardio manda o gasto (kcal) do dia", async () => {
    const { rafael } = await rafaelEMarina();
    const t = Date.now();
    await rafael.sync([
      { t: "sets", k: "c1", u: t, v: { id: "c1", sessionId: "s9", mode: "cardio", done: true, cardio: { min: 20, kcal: 180 } } },
      { t: "sets", k: "c2", u: t, v: { id: "c2", sessionId: "s9", mode: "cardio", done: true, cardio: { min: 5, kcal: 32.4 } } },
      { t: "sessions", k: "s9", u: t, v: { id: "s9", date: "2026-11-05", status: "done" } },
    ]);
    expect(familia.log.get("burn|2026-11-05|rafael")?.v).toBe("212");
    expect(familia.log.get("trained|2026-11-05|rafael")?.v).toBe("1");
  });

  it("pergunta no máximo a cada 2 min", async () => {
    const { rafael } = await rafaelEMarina();
    await rafael.sync();
    const n = familia.calls.pesos;
    await rafael.sync();
    await rafael.sync();
    expect(familia.calls.pesos).toBe(n);
  });

  it("sem a ligação (FAMILIA ausente) tudo segue normal", async () => {
    delete env.FAMILIA;
    const { rafael } = await rafaelEMarina();
    expect((await rafael.sync([peso("p1", "2026-10-21", 81)])).body.accepted).toBe(1);
  });

  it("opsFor: só peso, treino feito e pulos", () => {
    const ch = (t, k, v) => ({ t, k, u: 1, v: v == null ? null : JSON.stringify(v) });
    const ops = opsFor("rafael", [ch("sets", "x", { kg: 1 }), ch("plans", "p", {}), ch("sessions", "s", { date: "2026-10-01", status: "done" })], new Map());
    expect(ops).toEqual([{ kind: "trained", person: "rafael", day: "2026-10-01", v: "1" }]);
  });
});

describe("agenda de treino para a Mesa", () => {
  it("21 dias do plano: treino com horário e nome, descanso como 0", async () => {
    const { agendaDoPlano } = await import("./ponte.js");
    const { parsePlan } = await import("../src/lib/plan.ts");
    const seed = await import("../src/data/seed-plan.json");
    const { plan } = parsePlan(JSON.stringify(seed.default));
    const ops = agendaDoPlano(plan, "2026-10-05", "06:00"); // segunda (semana 11 de 13)
    expect(ops).toHaveLength(21);
    expect(ops[0].v).toMatch(/^1\|06:00\|/);
    expect(ops[2]).toEqual({ kind: "pulse", day: "2026-10-07", v: "0" }); // quarta = descanso
    expect(agendaDoPlano(plan, "2026-10-12", "").length).toBe(14);
    expect(agendaDoPlano(plan, "2026-12-01", "06:00")).toEqual([]); // bloco já acabou
  });

  it("vai pela ponte quando o plano ativo muda, e no máximo uma vez por dia", async () => {
    const kv = new Map();
    env.KV = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) };
    const { parsePlan } = await import("../src/lib/plan.ts");
    const seed = await import("../src/data/seed-plan.json");
    const { plan } = parsePlan(JSON.stringify(seed.default));
    const { mondayOf } = await import("../src/lib/calendar.ts");
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    plan.block.startDate = mondayOf(hoje); // bloco começando nesta semana
    const { rafael } = await rafaelEMarina();
    const u = Date.now();
    await rafael.sync([
      { t: "plans", k: plan.block.id, u, v: { id: plan.block.id, plan, importedAt: u } },
      { t: "settings", k: "activePlanId", u, v: { key: "activePlanId", value: plan.block.id } },
      { t: "settings", k: "remindTime", u, v: { key: "remindTime", value: "18:00" } },
    ]);
    const agenda = [...familia.log.values()].filter((r) => r.kind === "pulse" && r.person === "rafael");
    expect(agenda).toHaveLength(21);
    expect(agenda.every((r) => r.day >= hoje && /^(0|1\|18:00\|.+)$/.test(r.v))).toBe(true);
    const chamadas = familia.calls.gravar;
    await rafael.sync([]);
    expect(familia.calls.gravar).toBe(chamadas); // mesmo dia, nada mudou: não manda de novo
  });
});
