// Worker "app-treino" (Pulse): serve o app (dist/) e atende /api/auth/* (contas), /api/sync (dados), /api/photos (fotos) e
// /api/push/* (lembretes por notificação). O cron (a cada minuto) dispara os avisos vencidos.
// A chave VAPID é gerada no 1º uso e fica no KV; contas e dados ficam no D1 (worker/schema.js).
import { handleAuth, HttpError } from "./auth.js";
import { capDevices, cleanRegistration, splitDue } from "./logic.js";
import { database } from "./schema.js";
import { handlePhotos } from "./photos.js";
import { handleSync } from "./sync.js";
import { handleMcp } from "./coach.js";
import { generateVapid, sendPush } from "./webpush.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function getJSON(env, key, fallback) {
  return (await env.KV.get(key, "json")) ?? fallback;
}

async function vapidOf(env) {
  let v = await getJSON(env, "vapid", null);
  if (!v) {
    v = await generateVapid();
    await env.KV.put("vapid", JSON.stringify(v));
  }
  return v;
}

async function push(env, device, payload) {
  const vapid = await vapidOf(env);
  const subject = env.VAPID_SUBJECT || "mailto:treino@example.com";
  try {
    return await sendPush(device.sub, { ...payload, ts: Date.now() }, { vapid, subject, ttl: 3600, urgency: "high", topic: payload.tag });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function handleApi(req, env, url) {
  const path = url.pathname.replace(/^\/api\/push\/?/, "");
  if (req.method === "GET" && path === "key") return json({ publicKey: (await vapidOf(env)).publicKey });

  if (req.method === "POST" && path === "register") {
    const reg = cleanRegistration(await req.json().catch(() => null));
    if (!reg) return json({ error: "Cadastro inválido." }, 400);
    const devices = await getJSON(env, "devices", {});
    devices[reg.id] = reg;
    await env.KV.put("devices", JSON.stringify(capDevices(devices)));
    return json({ ok: true, scheduled: reg.events.length });
  }

  if (req.method === "POST" && path === "test") {
    const { id } = (await req.json().catch(() => ({}))) ?? {};
    const device = (await getJSON(env, "devices", {}))[id];
    if (!device) return json({ error: "Aparelho não cadastrado." }, 404);
    const r = await push(env, device, { title: "Lembretes ativos 💪", body: "É assim que os avisos do Pulse vão aparecer.", tag: "teste", url: "#/inicio" });
    return json(r, r.ok ? 200 : 502);
  }

  if (req.method === "DELETE" && /^[\w-]{8,64}$/.test(path)) {
    const devices = await getJSON(env, "devices", {});
    delete devices[path];
    await env.KV.put("devices", JSON.stringify(devices));
    return json({ ok: true });
  }
  return json({ error: "Rota não encontrada." }, 404);
}

async function tick(env, scheduledTime) {
  const devices = await getJSON(env, "devices", {});
  const list = Object.values(devices);
  if (!list.length) return;
  // janela de 15 min: cobre atraso do cron sem duplicar (aviso enviado sai da lista)
  const from = scheduledTime - 15 * 60_000;
  let changed = false;
  for (const d of list) {
    const { due, rest } = splitDue(d.events ?? [], from, scheduledTime);
    if (!due.length) continue;
    changed = true;
    d.events = rest;
    for (const e of due) {
      const r = await push(env, d, e);
      if (r.gone) {
        delete devices[d.id];
        break;
      }
    }
  }
  if (changed) await env.KV.put("devices", JSON.stringify(devices));
}

async function cleanup(env) {
  const DB = await database(env);
  const now = Date.now();
  await DB.batch([
    DB.prepare(`DELETE FROM logins WHERE expires_at < ?`).bind(now),
    DB.prepare(`DELETE FROM challenges WHERE expires_at < ?`).bind(now),
    DB.prepare(`DELETE FROM invites WHERE expires_at < ?`).bind(now - 30 * 86_400_000),
    DB.prepare(`DELETE FROM attempts WHERE window_start < ?`).bind(now - 86_400_000),
  ]);
}

/** Fase 6: o endereço novo (Worker "pulse") já atendeu alguém → avisa os aparelhos no endereço antigo. */
let movedSeen = false;
function noteNewAddress(env, url, ctx) {
  if (movedSeen || !env.KV || !url.hostname.startsWith("pulse.")) return;
  movedSeen = true;
  ctx?.waitUntil?.(
    env.KV.get("moved")
      .then((v) => (v === url.origin ? null : env.KV.put("moved", url.origin)))
      .catch((e) => console.error("moved", e)),
  );
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    noteNewAddress(env, url, ctx);
    try {
      if (url.pathname.startsWith("/api/push")) return await handleApi(req, env, url);
      // conector do Claude: o token da URL autentica as chamadas do claude.ai; gerar o token exige o login do app
      if (url.pathname.startsWith("/api/mcp/")) {
        const origin = req.headers.get("origin");
        if (url.pathname === "/api/mcp/token" && req.method !== "GET" && origin && origin !== url.origin) return json({ error: "Origem não permitida." }, 403);
        return await handleMcp(req, env, url, await database(env));
      }
      if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/sync") || url.pathname.startsWith("/api/photos")) {
        // escrita só a partir do próprio app (além do cookie SameSite=Strict)
        const origin = req.headers.get("origin");
        if (req.method !== "GET" && origin && origin !== url.origin) return json({ error: "Origem não permitida." }, 403);
        if (url.pathname.startsWith("/api/photos")) return await handlePhotos(req, env, url);
        return url.pathname.startsWith("/api/auth/") ? await handleAuth(req, env, url) : await handleSync(req, env, url, ctx);
      }
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Erro interno: " + e.message }, 500);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(tick(env, controller.scheduledTime));
    // de hora em hora: limpa logins, desafios, convites e travas vencidos
    if (env.DB && new Date(controller.scheduledTime).getUTCMinutes() === 0) ctx.waitUntil(cleanup(env).catch((e) => console.error(e)));
  },
};
