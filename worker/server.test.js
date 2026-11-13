import { beforeEach, describe, expect, it } from "vitest";
import { loginOf, rpIdFor } from "./auth.js";
import worker from "./index.js";
import { cleanChanges, MAX_CHANGES, wins } from "./sync.js";
import { fakeD1 } from "./testing/d1.js";

const ORIGIN = "https://app-treino.example.workers.dev";
let env;

beforeEach(() => {
  env = { DB: fakeD1(), PULSO_SETUP: "codigo-secreto", ASSETS: { fetch: () => new Response("app") } };
});

/** Um "aparelho": guarda o cookie entre as chamadas, como o navegador. */
function device(name = "S25") {
  let cookie = "";
  async function call(path, body, method = body === undefined ? "GET" : "POST") {
    const res = await worker.fetch(
      new Request(ORIGIN + path, {
        method,
        headers: { "content-type": "application/json", origin: ORIGIN, cookie, "cf-connecting-ip": `ip-${name}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: await res.json(), setCookie: set };
  }
  return { call, get cookie() { return cookie; } };
}

async function setupRafael(d = device()) {
  const r = await d.call("/api/auth/setup", { code: "codigo-secreto", name: "Rafael", password: "senha-forte-1", device: "S25" });
  expect(r.status).toBe(200);
  return d;
}

describe("contas", () => {
  it("1ª conta exige o código de instalação", async () => {
    const d = device();
    expect((await d.call("/api/auth/me")).body).toMatchObject({ user: null, hasUsers: false, setupConfigured: true });
    const bad = await d.call("/api/auth/setup", { code: "errado", name: "Rafael", password: "senha-forte-1" });
    expect(bad.status).toBe(403);
    await setupRafael(d);
    const me = await d.call("/api/auth/me");
    expect(me.body.user).toMatchObject({ name: "Rafael", role: "admin" });
    // segunda conta principal: recusada
    expect((await device("x").call("/api/auth/setup", { code: "codigo-secreto", name: "Outro", password: "senha-forte-1" })).status).toBe(409);
  });

  it("sem PULSO_SETUP no Cloudflare: erro claro", async () => {
    delete env.PULSO_SETUP;
    const r = await device().call("/api/auth/setup", { code: "x", name: "Rafael", password: "senha-forte-1" });
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/PULSO_SETUP/);
  });

  it("cookie seguro e só o hash do token no banco", async () => {
    const d = device();
    const r = await d.call("/api/auth/setup", { code: "codigo-secreto", name: "Rafael", password: "senha-forte-1" });
    expect(r.setCookie).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    const token = d.cookie.split("=")[1];
    const rows = env.DB.raw.prepare("SELECT token_hash FROM logins").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    const u = env.DB.raw.prepare("SELECT pass_hash FROM users").get();
    expect(u.pass_hash).not.toContain("senha-forte-1");
  });

  it("login pelo nome sem acento e trava após 5 erros", async () => {
    await setupRafael();
    const pc = device("PC");
    expect((await pc.call("/api/auth/login", { name: " rafael ", password: "senha-forte-1", device: "PC" })).status).toBe(200);
    const other = device("outro");
    for (let i = 0; i < 5; i++) expect((await other.call("/api/auth/login", { name: "Rafael", password: "errada-123" })).status).toBe(401);
    // mesmo com a senha certa, espera a janela
    expect((await other.call("/api/auth/login", { name: "Rafael", password: "senha-forte-1" })).status).toBe(429);
  });

  it("senha curta é recusada", async () => {
    const r = await device().call("/api/auth/setup", { code: "codigo-secreto", name: "Rafael", password: "123" });
    expect(r.status).toBe(400);
  });

  it("convite da Marina: uso único, só o admin gera", async () => {
    const rafael = await setupRafael();
    const inv = await rafael.call("/api/auth/invite", { kind: "join" });
    expect(inv.body.code).toMatch(/^[A-Z2-9]{8}$/);
    const marina = device("S26");
    const j = await marina.call("/api/auth/join", { code: inv.body.code.toLowerCase(), name: "Marina", password: "senha-dela-9" });
    expect(j.status).toBe(200);
    expect(j.body.user).toMatchObject({ name: "Marina", role: "member" });
    // reuso do código
    expect((await device("z").call("/api/auth/join", { code: inv.body.code, name: "Intrusa", password: "senha-dela-9" })).status).toBe(403);
    // Marina não gera convite
    expect((await marina.call("/api/auth/invite", { kind: "join" })).status).toBe(403);
    // login dela: "marina"
    expect((await device("y").call("/api/auth/login", { name: "marina", password: "senha-dela-9" })).status).toBe(200);
    const fam = await rafael.call("/api/auth/family");
    expect(fam.body.users.map((u) => u.name)).toEqual(["Rafael", "Marina"]);
  });

  it("redefinir senha: código do admin ou chave mestra; desconecta os outros aparelhos", async () => {
    const rafael = await setupRafael();
    const inv = await rafael.call("/api/auth/invite", { kind: "join" });
    const marina = device("S26");
    await marina.call("/api/auth/join", { code: inv.body.code, name: "Marina", password: "senha-dela-9" });
    const fam = await rafael.call("/api/auth/family");
    const lid = fam.body.users.find((u) => u.name === "Marina").id;
    const reset = await rafael.call("/api/auth/invite", { kind: "reset", userId: lid });
    const novo = device("S26-novo");
    expect((await novo.call("/api/auth/reset", { code: reset.body.code, password: "senha-nova-77" })).body.user.name).toBe("Marina");
    expect((await marina.call("/api/auth/me")).body.user).toBeNull(); // sessão antiga caiu
    // chave mestra (código de instalação) para o próprio Rafael
    const r = await device("w").call("/api/auth/reset", { code: "codigo-secreto", name: "Rafael", password: "outra-senha-1" });
    expect(r.body.user.name).toBe("Rafael");
    expect((await device("q").call("/api/auth/login", { name: "Rafael", password: "outra-senha-1" })).status).toBe(200);
  });

  it("aparelhos conectados: lista e desconecta", async () => {
    const s25 = await setupRafael();
    const pc = device("PC");
    await pc.call("/api/auth/login", { name: "Rafael", password: "senha-forte-1", device: "PC" });
    const list = await s25.call("/api/auth/devices");
    expect(list.body.logins).toHaveLength(2);
    const pcLogin = list.body.logins.find((l) => !l.current);
    await s25.call(`/api/auth/logins/${pcLogin.id}`, undefined, "DELETE");
    expect((await pc.call("/api/auth/me")).body.user).toBeNull();
  });

  it("logout apaga a sessão", async () => {
    const d = await setupRafael();
    await d.call("/api/auth/logout", {});
    expect((await d.call("/api/sync", { since: 0, changes: [] })).status).toBe(401);
  });

  it("pedido de outra origem é recusado", async () => {
    const res = await worker.fetch(new Request(ORIGIN + "/api/auth/login", { method: "POST", headers: { origin: "https://malicioso.example" }, body: "{}" }), env);
    expect(res.status).toBe(403);
  });

  it("opções de passkey: domínio-pai em workers.dev; desafio guardado", async () => {
    const d = await setupRafael();
    const r = await d.call("/api/auth/passkey/register/options", {});
    expect(r.body.options.rp.id).toBe("example.workers.dev");
    expect(r.body.options.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "required" });
    const host = await d.call("/api/auth/passkey/register/options", { mode: "host" });
    expect(host.body.options.rp.id).toBe("app-treino.example.workers.dev");
    const login = await device("x").call("/api/auth/passkey/login/options", {});
    expect(login.body.options.rpId).toBe("example.workers.dev");
    // passkey desconhecida
    const v = await device("x").call("/api/auth/passkey/login/verify", { cid: login.body.cid, response: { id: "nada" } });
    expect(v.status).toBe(401);
  });

  it("helpers", () => {
    expect(loginOf("Marina Rafa")).toBe("marinarafa");
    expect(rpIdFor(new URL("http://localhost:8787/"), {}, undefined)).toBe("localhost");
    expect(rpIdFor(new URL("https://pulso.example.workers.dev/"), {}, undefined)).toBe("example.workers.dev");
  });
});

describe("sincronização", () => {
  const rec = (k, u, v, t = "sessions") => ({ t, k, u, v });

  it("vence o maior u; empate pelo JSON", () => {
    expect(wins({ u: 2, v: "a" }, { u: 1, v: "z" })).toBe(true);
    expect(wins({ u: 1, v: "b" }, { u: 1, v: "a" })).toBe(true);
    expect(wins({ u: 1, v: null }, { u: 1, v: "a" })).toBe(false);
  });

  it("valida o envio", () => {
    const now = 1_000_000;
    expect(() => cleanChanges([rec("a", 1, {}, "photos")], now)).toThrow(/Tabela/);
    expect(() => cleanChanges([rec("", 1, {})], now)).toThrow(/Chave/);
    expect(() => cleanChanges([rec("a", 1.5, {})], now)).toThrow(/Carimbo/);
    expect(() => cleanChanges(Array.from({ length: MAX_CHANGES + 1 }, (_, i) => rec(`k${i}`, 1, {})), now)).toThrow(/máximo/);
    // relógio adiantado: limitado
    expect(cleanChanges([rec("a", now * 10, {})], now)[0].u).toBe(now + 60_000);
    // chave repetida: fica a mais nova
    expect(cleanChanges([rec("a", 2, { n: 2 }), rec("a", 1, { n: 1 })], now)).toEqual([{ t: "sessions", k: "a", u: 2, v: '{"n":2}' }]);
  });

  it("dois aparelhos convergem; lápide apaga; dono separado", async () => {
    const s25 = await setupRafael();
    const pc = device("PC");
    await pc.call("/api/auth/login", { name: "Rafael", password: "senha-forte-1" });
    const now = Date.now();

    const a = await s25.call("/api/sync", { since: 0, device: "S25", changes: [rec("s1", now, { date: "2026-10-20" }), rec("x1", now, { kg: 40 }, "sets")] });
    expect(a.status).toBe(200);
    expect(a.body.accepted).toBe(2);
    expect(a.body.changes).toHaveLength(2); // eco do que entrou

    // PC puxa tudo
    const b = await pc.call("/api/sync", { since: 0, changes: [] });
    expect(b.body.changes.map((c) => c.k).sort()).toEqual(["s1", "x1"]);
    expect(b.body.changes.find((c) => c.k === "s1").v).toEqual({ date: "2026-10-20" });

    // PC edita (mais novo) e o S25 manda uma versão velha: a do PC vence e volta para o S25
    await pc.call("/api/sync", { since: b.body.seq, changes: [rec("s1", now + 10, { date: "2026-10-21" })] });
    const c = await s25.call("/api/sync", { since: a.body.seq, changes: [rec("s1", now + 5, { date: "velha" })] });
    expect(c.body.accepted).toBe(0);
    expect(c.body.changes.find((x) => x.k === "s1")).toMatchObject({ u: now + 10, v: { date: "2026-10-21" } });

    // lápide
    const d = await s25.call("/api/sync", { since: c.body.seq, changes: [rec("x1", now + 20, null, "sets")] });
    expect(d.body.accepted).toBe(1);
    const e = await pc.call("/api/sync", { since: b.body.seq, changes: [] });
    expect(e.body.changes.find((x) => x.k === "x1").v).toBeNull();

    // estatística sem lápides
    expect((await s25.call("/api/sync/stats")).body.counts).toEqual({ sessions: 1 });

    // Marina não vê nada do Rafael, e a mesma chave dela não colide
    const inv = await s25.call("/api/auth/invite", { kind: "join" });
    const marina = device("S26");
    await marina.call("/api/auth/join", { code: inv.body.code, name: "Marina", password: "senha-dela-9" });
    expect((await marina.call("/api/sync", { since: 0, changes: [] })).body.changes).toEqual([]);
    await marina.call("/api/sync", { since: 0, changes: [rec("s1", now, { dela: true })] });
    const rafaelView = await pc.call("/api/sync", { since: 0, changes: [] });
    expect(rafaelView.body.changes.find((x) => x.k === "s1").v).toEqual({ date: "2026-10-21" });
  });

  it("paginação: seq crescente sem repetição", async () => {
    const d = await setupRafael();
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const batch = Array.from({ length: 500 }, (_, j) => rec(`k${i * 500 + j}`, now, { i, j }, "sets"));
      expect((await d.call("/api/sync", { since: 0, changes: batch })).body.accepted).toBe(500);
    }
    const pc = device("PC");
    await pc.call("/api/auth/login", { name: "Rafael", password: "senha-forte-1" });
    let since = 0;
    const keys = new Set();
    let pages = 0;
    for (;;) {
      const r = await pc.call("/api/sync", { since, changes: [] });
      r.body.changes.forEach((c) => keys.add(c.k));
      since = r.body.seq;
      pages++;
      if (!r.body.more) break;
    }
    expect(keys.size).toBe(1500);
    expect(pages).toBe(2);
  });

  it("banco de outra pessoa: recusa sem gravar", async () => {
    const rafael = await setupRafael();
    const me = (await rafael.call("/api/auth/me")).body.user;
    const inv = await rafael.call("/api/auth/invite", { kind: "join" });
    const marina = device("S26");
    await marina.call("/api/auth/join", { code: inv.body.code, name: "Marina", password: "senha-dela-9" });
    const r = await marina.call("/api/sync", { since: 0, owner: me.id, changes: [rec("s1", Date.now(), { do: "rafael" })] });
    expect(r.status).toBe(409);
    expect((await marina.call("/api/sync", { since: 0, changes: [] })).body.changes).toEqual([]);
  });

  it("sem login: 401", async () => {
    expect((await device().call("/api/sync", { since: 0, changes: [] })).status).toBe(401);
  });
});

describe("entrar com o celular (código de aparelho)", () => {
  it("o aparelho conectado gera um código; o novo entra com ele, uma vez só", async () => {
    const s25 = await setupRafael();
    const r = await s25.call("/api/auth/device-code", {});
    expect(r.status).toBe(200);
    expect(r.body.code).toMatch(/^[A-Z2-9]{6}$/);
    const pc = device("PC");
    const ok = await pc.call("/api/auth/device-login", { code: r.body.code.toLowerCase(), device: "PC" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.name).toBe("Rafael");
    expect((await pc.call("/api/auth/me")).body.user.name).toBe("Rafael");
    // a senha não mudou e o celular continua conectado
    expect((await s25.call("/api/auth/me")).body.user.name).toBe("Rafael");
    // uso único
    const again = await device("PC2").call("/api/auth/device-login", { code: r.body.code, device: "PC2" });
    expect(again.status).toBe(403);
  });
  it("pedir código exige estar conectado; código novo invalida o anterior", async () => {
    expect((await device("X").call("/api/auth/device-code", {})).status).toBe(401);
    const s25 = await setupRafael();
    const first = (await s25.call("/api/auth/device-code", {})).body.code;
    const second = (await s25.call("/api/auth/device-code", {})).body.code;
    expect((await device("A").call("/api/auth/device-login", { code: first, device: "A" })).status).toBe(403);
    expect((await device("B").call("/api/auth/device-login", { code: second, device: "B" })).status).toBe(200);
  });
  it("código vencido não entra e tentativas erradas bloqueiam", async () => {
    const s25 = await setupRafael();
    const { code } = (await s25.call("/api/auth/device-code", {})).body;
    await env.DB.prepare("UPDATE invites SET expires_at = 1 WHERE kind = 'link'").run();
    const pc = device("PC");
    expect((await pc.call("/api/auth/device-login", { code, device: "PC" })).status).toBe(403);
    for (let i = 0; i < 5; i++) await pc.call("/api/auth/device-login", { code: "ZZZZZZ", device: "PC" });
    expect((await pc.call("/api/auth/device-login", { code: "ZZZZZZ", device: "PC" })).status).toBe(429);
  });
});
