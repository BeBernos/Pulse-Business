// Sincronização: registros { t, k, u, v } por pessoa (modelo do App-Mercado).
// Em cada (pessoa, t, k) vence o maior `u`; empate → o maior JSON. Apagar = v null (lápide).
// `seq` cresce a cada gravação aceita: o aparelho pede "o que mudou desde o seq X".
import { HttpError, json, requireUser } from "./auth.js";
import { agendaOps, burnOps, forward, importWeights, opsFor, personFor, settleWeights, snapshot } from "./ponte.js";
import { database } from "./schema.js";

export const TABLES = ["sessions", "sets", "plans", "measures", "skips", "flags", "settings", "exercises", "analyses"];
export const MAX_CHANGES = 500;
export const MAX_VALUE = 128 * 1024; // um plano grande tem ~25 KB
export const PULL_LIMIT = 1000;
/** Relógio do aparelho adiantado: `u` no futuro é limitado a agora + 1 min. */
export const FUTURE_MS = 60_000;

/** Valida e normaliza o que o aparelho mandou. Erro → 400 (nada é gravado). */
export function cleanChanges(list, now) {
  if (!Array.isArray(list)) throw new HttpError(400, "changes deve ser uma lista.");
  if (list.length > MAX_CHANGES) throw new HttpError(400, `No máximo ${MAX_CHANGES} mudanças por envio.`);
  const out = new Map(); // mesma chave repetida no envio: fica a mais nova
  for (const c of list) {
    if (!c || !TABLES.includes(c.t)) throw new HttpError(400, `Tabela inválida: ${c?.t}`);
    if (typeof c.k !== "string" || !c.k || c.k.length > 200) throw new HttpError(400, "Chave inválida.");
    if (!Number.isSafeInteger(c.u) || c.u <= 0) throw new HttpError(400, "Carimbo de tempo inválido.");
    let v = null;
    if (c.v !== null && c.v !== undefined) {
      if (typeof c.v !== "object") throw new HttpError(400, "Valor inválido.");
      v = JSON.stringify(c.v);
      if (v.length > MAX_VALUE) throw new HttpError(400, `Registro grande demais (${c.t}/${c.k}).`);
    }
    const rec = { t: c.t, k: c.k, u: Math.min(c.u, now + FUTURE_MS), v };
    const id = `${rec.t}\u0000${rec.k}`;
    const prev = out.get(id);
    if (!prev || wins(rec, prev)) out.set(id, rec);
  }
  return [...out.values()];
}

/** a vence b? Mesma regra do aparelho e do SQL abaixo. */
export function wins(a, b) {
  return a.u > b.u || (a.u === b.u && (a.v ?? "") > (b.v ?? ""));
}

const UPSERT = `
INSERT INTO records (user_id, t, k, u, v, seq, device, received_at)
SELECT ?1, json_extract(j.value, '$.t'), json_extract(j.value, '$.k'), json_extract(j.value, '$.u'), json_extract(j.value, '$.v'),
       (SELECT COALESCE(MAX(seq), 0) FROM records) + j.key + 1, ?3, ?4
FROM json_each(?2) AS j WHERE true
ON CONFLICT(user_id, t, k) DO UPDATE SET u = excluded.u, v = excluded.v, seq = excluded.seq, device = excluded.device, received_at = excluded.received_at
WHERE excluded.u > records.u OR (excluded.u = records.u AND COALESCE(excluded.v, '') > COALESCE(records.v, ''))`;

// o que o servidor tem diferente do que acabou de chegar (o aparelho perdeu na disputa): volta como mudança.
// CROSS JOIN fixa a ordem: percorre o envio e busca cada registro pela chave (senão varre a tabela toda)
const LOST = `
SELECT r.t, r.k, r.u, r.v, r.seq FROM json_each(?2) AS j CROSS JOIN records r
  ON r.user_id = ?1 AND r.t = json_extract(j.value, '$.t') AND r.k = json_extract(j.value, '$.k')
WHERE r.user_id = ?1 AND (r.u != json_extract(j.value, '$.u') OR r.v IS NOT json_extract(j.value, '$.v'))`;

const PULL = `SELECT t, k, u, v, seq FROM records WHERE user_id = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3`;

/** Dias que um registro apagado fica na lixeira. */
export const TRASH_DAYS = 3;
// antes de gravar as lápides: o valor atual de cada registro que vai ser apagado (e que a lápide vence) vai para a lixeira
const TO_TRASH = `
INSERT INTO trash (user_id, t, k, v, deleted_at, device)
SELECT r.user_id, r.t, r.k, r.v, ?3, ?4 FROM json_each(?2) AS j CROSS JOIN records r
  ON r.user_id = ?1 AND r.t = json_extract(j.value, '$.t') AND r.k = json_extract(j.value, '$.k')
WHERE json_extract(j.value, '$.v') IS NULL AND r.v IS NOT NULL AND json_extract(j.value, '$.u') > r.u
ON CONFLICT(user_id, t, k) DO UPDATE SET v = excluded.v, deleted_at = excluded.deleted_at, device = excluded.device`;

const decode = (r) => ({ t: r.t, k: r.k, u: r.u, v: r.v == null ? null : JSON.parse(r.v) });

export async function handleSync(req, env, url, ctx) {
  const { user, setCookie } = await requireUser(req, env);
  const DB = await database(env);
  const headers = setCookie ? { "set-cookie": setCookie } : {};

  // contagem por tabela (sem lápides): conferência da migração
  if (req.method === "GET" && url.pathname === "/api/sync/stats") {
    const rows = (await DB.prepare(`SELECT t, COUNT(*) AS n FROM records WHERE user_id = ? AND v IS NOT NULL GROUP BY t`).bind(user.id).all()).results;
    return json({ counts: Object.fromEntries(rows.map((r) => [r.t, r.n])) }, 200, headers);
  }

  if (url.pathname === "/api/sync/trash" || url.pathname === "/api/sync/restore") return json(await trash(req, DB, user, url), 200, headers);
  if (req.method === "POST" && url.pathname === "/api/sync/feedback") {
    const b = await req.json().catch(() => null);
    const text = typeof b?.text === "string" ? b.text.trim().slice(0, 4000) : "";
    if (!text || !Number.isSafeInteger(b.at)) throw new HttpError(400, "Pedido inválido.");
    const str = (x, n) => (typeof x === "string" ? x.slice(0, n) : null);
    // a mesma anotação (mesma hora) chegando de novo não duplica
    await DB.prepare(`INSERT OR IGNORE INTO feedback (user_id, at, text, route, version, received_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(user.id, b.at, text, str(b.route, 120), str(b.version, 20), Date.now()).run();
    return json({ ok: true }, 200, headers);
  }
  if (req.method === "POST" && url.pathname === "/api/sync/errors") {
    const b = await req.json().catch(() => null);
    const str = (x, n) => (typeof x === "string" ? x.slice(0, n) : null);
    if (!b || !str(b.message, 1)) throw new HttpError(400, "Pedido inválido.");
    await DB.batch([
      DB.prepare(`INSERT INTO errors (user_id, at, message, route, stack, version, device) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(user.id, Date.now(), str(b.message, 500), str(b.route, 120), str(b.stack, 1500), str(b.version, 20), str(req.headers.get("user-agent"), 160)),
      DB.prepare(`DELETE FROM errors WHERE user_id = ?1 AND rowid NOT IN (SELECT rowid FROM errors WHERE user_id = ?1 ORDER BY at DESC LIMIT 200)`).bind(user.id),
    ]);
    return json({ ok: true }, 200, headers);
  }

  if (req.method !== "POST" || url.pathname !== "/api/sync") throw new HttpError(404, "Rota não encontrada.");
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") throw new HttpError(400, "Pedido inválido.");
  // banco de uma pessoa, login de outra (ex.: entrou com a conta errada): não mistura os dados
  if (b.owner && b.owner !== user.id) throw new HttpError(409, "Este aparelho está com os dados de outra pessoa. Entre com a conta dona destes dados.");
  const now = Date.now();
  const since = Number.isSafeInteger(b.since) && b.since > 0 ? b.since : 0;
  const changes = cleanChanges(b.changes ?? [], now);
  const device = String(b.device ?? "").slice(0, 60) || null;

  // ponte: pesos novos do Plano da Família entram antes do "puxar" (chegam nesta mesma resposta)
  // mudou "Você na Mesa": a próxima conferência relê tudo e manda o histórico para a pessoa nova
  if (env.FAMILIA && changes.some((c) => c.t === "settings" && c.k === "familyPerson")) await DB.prepare(`DELETE FROM bridge_state WHERE user_id = ?`).bind(user.id).run();
  const fp = changes.find((c) => c.t === "settings" && c.k === "familyPerson" && c.v);
  const person = !env.FAMILIA ? null : fp && /^[a-z0-9_-]{1,24}$/.test(JSON.parse(fp.v).value ?? "") ? JSON.parse(fp.v).value : await personFor(DB, user);
  await importWeights(env, DB, { ...user, person }, (recs) => DB.prepare(UPSERT).bind(user.id, JSON.stringify(recs), "ponte", now).run(), now);
  const before = env.FAMILIA ? await snapshot(DB, user.id, changes) : new Map();

  const stmts = [];
  const payload = JSON.stringify(changes);
  const deleting = changes.some((c) => c.v === null);
  if (deleting) {
    stmts.push(DB.prepare(TO_TRASH).bind(user.id, payload, now, device));
    stmts.push(DB.prepare(`DELETE FROM trash WHERE user_id = ? AND deleted_at < ?`).bind(user.id, now - TRASH_DAYS * 86_400_000));
  }
  let lostAt = -1;
  if (changes.length) {
    stmts.push(DB.prepare(UPSERT).bind(user.id, payload, device, now));
    lostAt = stmts.push(DB.prepare(LOST).bind(user.id, payload)) - 1;
  }
  stmts.push(DB.prepare(PULL).bind(user.id, since, PULL_LIMIT));
  const results = await DB.batch(stmts);
  const pulled = results.at(-1).results;
  const lost = lostAt >= 0 ? results[lostAt].results : [];

  const seen = new Set(pulled.map((r) => `${r.t}\u0000${r.k}`));
  const out = [...pulled, ...lost.filter((r) => !seen.has(`${r.t}\u0000${r.k}`))].map(decode);
  const seq = pulled.length ? pulled.at(-1).seq : since;

  // ponte: peso e treino aceitos vão para o Plano da Família (sem segurar a resposta)
  if (env.FAMILIA && changes.length) {
    const lostKeys = new Set(lost.map((r) => `${r.t}\u0000${r.k}`));
    const ops = opsFor(person, changes.filter((c) => !lostKeys.has(`${c.t}\u0000${c.k}`)), before);
    const job = settleWeights(DB, user.id, person, ops).then((o) => burnOps(DB, user.id, person, o)).then((o) => forward(env, person, o)).catch((e) => console.error("ponte: conferir pesos falhou", e));
    if (ctx?.waitUntil) ctx.waitUntil(job);
    else await job;
  }
  // ponte: agenda de treino para a Mesa (quando o plano muda, e uma vez por dia)
  if (env.FAMILIA) {
    const job = agendaOps(env, DB, user.id, person, changes, now).then((o) => forward(env, person, o)).catch((e) => console.error("ponte: agenda de treino falhou", e));
    if (ctx?.waitUntil) ctx.waitUntil(job);
    else await job;
  }
  return json({ seq, now, more: pulled.length === PULL_LIMIT, changes: out, accepted: changes.length - lost.length }, 200, headers);
}

/* ---------------- lixeira ---------------- */

const TRASH_TABLES = ["sessions", "measures", "analyses", "plans"];

/** Resumo do que dá para mostrar de cada item apagado (sem mandar o registro inteiro). */
function trashItem(r, setsBySession) {
  const v = JSON.parse(r.v);
  const base = { t: r.t, k: r.k, deletedAt: r.deleted_at };
  if (r.t === "sessions") return { ...base, date: v.date, label: [v.dayKey, v.dayName].filter(Boolean).join(" · ") || "Treino", sets: setsBySession.get(r.k) ?? 0, done: (setsBySession.get(r.k + ":done") ?? 0) };
  if (r.t === "measures") return { ...base, date: v.date, label: v.type, value: v.value };
  if (r.t === "plans") return { ...base, label: v.plan?.block?.name ?? r.k };
  return { ...base, date: v.date ?? null, label: v.title ?? v.summary?.slice?.(0, 60) ?? r.k };
}

/**
 * GET /api/sync/trash: o que foi apagado nos últimos 3 dias (treinos, medidas, análises, planos).
 * POST /api/sync/restore { t, k }: devolve o registro (um treino volta com as séries dele) com carimbo de agora.
 */
async function trash(req, DB, user, url) {
  const now = Date.now();
  const from = now - TRASH_DAYS * 86_400_000;
  if (req.method === "GET" && url.pathname === "/api/sync/trash") {
    const { results } = await DB.prepare(`SELECT t, k, v, deleted_at FROM trash WHERE user_id = ? AND deleted_at >= ? ORDER BY deleted_at DESC LIMIT 500`).bind(user.id, from).all();
    const sets = new Map();
    for (const r of results) {
      if (r.t !== "sets") continue;
      const v = JSON.parse(r.v);
      sets.set(v.sessionId, (sets.get(v.sessionId) ?? 0) + 1);
      if (v.done) sets.set(v.sessionId + ":done", (sets.get(v.sessionId + ":done") ?? 0) + 1);
    }
    return { items: results.filter((r) => TRASH_TABLES.includes(r.t)).map((r) => trashItem(r, sets)) };
  }
  if (req.method !== "POST" || url.pathname !== "/api/sync/restore") throw new HttpError(404, "Rota não encontrada.");
  const b = await req.json().catch(() => null);
  if (!b || !TRASH_TABLES.includes(b.t) || typeof b.k !== "string") throw new HttpError(400, "Pedido inválido.");
  const main = await DB.prepare(`SELECT t, k, v FROM trash WHERE user_id = ? AND t = ? AND k = ?`).bind(user.id, b.t, b.k).first();
  if (!main) throw new HttpError(404, "Não está mais na lixeira.");
  const rows = [main];
  if (b.t === "sessions") {
    const { results } = await DB.prepare(`SELECT t, k, v FROM trash WHERE user_id = ? AND t = 'sets' AND json_extract(v, '$.sessionId') = ?`).bind(user.id, b.k).all();
    rows.push(...results);
  }
  const keys = JSON.stringify(rows.map((r) => ({ t: r.t, k: r.k })));
  // a lápide pode ter carimbo à frente (relógio do aparelho adiantado): a volta precisa vencer
  const top = await DB.prepare(`SELECT MAX(r.u) AS u FROM json_each(?2) AS j CROSS JOIN records r ON r.user_id = ?1 AND r.t = json_extract(j.value, '$.t') AND r.k = json_extract(j.value, '$.k')`).bind(user.id, keys).first();
  const u = Math.max(now, (top?.u ?? 0) + 1);
  const recs = rows.map((r) => ({ t: r.t, k: r.k, u, v: r.v }));
  await DB.batch([
    DB.prepare(UPSERT).bind(user.id, JSON.stringify(recs), "lixeira", now),
    DB.prepare(`DELETE FROM trash WHERE user_id = ?1 AND (t, k) IN (SELECT json_extract(value, '$.t'), json_extract(value, '$.k') FROM json_each(?2))`).bind(user.id, keys),
  ]);
  return { restored: rows.length };
}
