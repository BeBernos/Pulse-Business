// Contas do Pulse: senha no 1º acesso de cada aparelho → passkey (digital/rosto) dali em diante.
// - 1ª conta (Rafael, admin): exige o código de instalação (segredo PULSO_SETUP no Cloudflare).
// - Demais (Marina): convite de uso único gerado pelo admin (48 h).
// - Login fica num cookie HttpOnly; o servidor guarda só o hash do token. Vale 90 dias e se renova com o uso.
// - A senha não chega aqui: chega a chave derivada no aparelho (PBKDF2 600 mil rodadas), que ganha mais
//   um hash com sal por pessoa antes de ir para o banco.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { b64url, fromB64url, hashPassword, inviteCode, newId, randomToken, sameString, sha256 } from "./crypto.js";
import { database } from "./schema.js";

export const COOKIE = "pulso_s";
const DAY = 86_400_000;
export const LOGIN_DAYS = 90;
const RENEW_BELOW_DAYS = 60;
const INVITE_HOURS = 48;
/** Código para entrar num aparelho novo a partir de um já conectado ("Entrar com o celular"). */
const DEVICE_CODE_MS = 10 * 60_000;
const CHALLENGE_MS = 5 * 60_000;
const MAX_USERS = 6;
export const MIN_PASSWORD = 8;

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** "Marina " → "marina": é o que se digita no login (sem acento, sem espaço, minúsculas). */
export function loginOf(name) {
  return String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanName(name) {
  const n = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!loginOf(n)) throw new HttpError(400, "Digite seu nome.");
  return n;
}

function checkPassword(p) {
  if (typeof p !== "string" || p.length < MIN_PASSWORD) throw new HttpError(400, `A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.`);
  if (p.length > 200) throw new HttpError(400, "Senha longa demais.");
  return p;
}

const cleanDevice = (d) => String(d ?? "").trim().slice(0, 60) || "Aparelho";

const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role });

export function cookieHeader(token, maxAgeSec) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Strict`;
}

function readCookie(req) {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]+)`));
  return m?.[1] ?? null;
}

const clientIp = (req) => req.headers.get("cf-connecting-ip") ?? "local";

/* ---------------- trava de tentativas ---------------- */

const WINDOW = 15 * 60_000;

async function assertNotLocked(DB, key, max) {
  const row = await DB.prepare(`SELECT count, window_start FROM attempts WHERE key = ?`).bind(key).first();
  if (row && Date.now() - row.window_start < WINDOW && row.count >= max) {
    const min = Math.ceil((row.window_start + WINDOW - Date.now()) / 60_000);
    throw new HttpError(429, `Muitas tentativas. Espere ${min} min e tente de novo.`);
  }
}

async function fail(DB, key) {
  const now = Date.now();
  await DB.prepare(
    `INSERT INTO attempts (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET count = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END`,
  ).bind(key, now, WINDOW).run();
}

const clearAttempts = (DB, key) => DB.prepare(`DELETE FROM attempts WHERE key = ?`).bind(key).run();

/* ---------------- sessão (login no aparelho) ---------------- */

async function createLogin(DB, user, device, method) {
  const token = randomToken();
  const now = Date.now();
  await DB.prepare(`INSERT INTO logins (id, token_hash, user_id, device, method, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(newId(), await sha256(token), user.id, cleanDevice(device), method, now, now + LOGIN_DAYS * DAY, now)
    .run();
  return cookieHeader(token, LOGIN_DAYS * 86_400);
}

/**
 * Quem está chamando (pelo cookie). Devolve { user, login, setCookie? } ou null.
 * Renova o prazo quando faltam menos de 60 dias (o cookie volta com Max-Age novo).
 */
export async function authenticate(req, env) {
  const token = readCookie(req);
  if (!token) return null;
  const DB = await database(env);
  const hash = await sha256(token);
  const row = await DB.prepare(
    `SELECT l.id AS login_id, l.expires_at, l.last_seen, u.* FROM logins l JOIN users u ON u.id = l.user_id WHERE l.token_hash = ?`,
  ).bind(hash).first();
  const now = Date.now();
  if (!row || row.expires_at < now) return null;
  let setCookie;
  if (row.expires_at - now < RENEW_BELOW_DAYS * DAY) {
    await DB.prepare(`UPDATE logins SET expires_at = ?, last_seen = ? WHERE id = ?`).bind(now + LOGIN_DAYS * DAY, now, row.login_id).run();
    setCookie = cookieHeader(token, LOGIN_DAYS * 86_400);
  } else if (now - row.last_seen > 3600_000) {
    await DB.prepare(`UPDATE logins SET last_seen = ? WHERE id = ?`).bind(now, row.login_id).run();
  }
  return { user: row, loginId: row.login_id, setCookie };
}

async function requireUser(req, env) {
  const a = await authenticate(req, env);
  if (!a) throw new HttpError(401, "Entre de novo para continuar.");
  return a;
}

/* ---------------- passkeys (WebAuthn) ---------------- */

/**
 * RP ID das passkeys: o domínio-pai em *.workers.dev (example.workers.dev), para a passkey continuar
 * valendo quando o endereço do app mudar (app-treino → pulso). `mode = "host"` usa o endereço exato
 * (plano B, se o navegador recusar o domínio-pai).
 */
export function rpIdFor(url, env, mode) {
  if (env.RP_ID) return env.RP_ID;
  const host = url.hostname;
  const parts = host.split(".");
  if (mode !== "host" && host.endsWith(".workers.dev") && parts.length >= 4) return parts.slice(1).join(".");
  return host;
}

async function saveChallenge(DB, kind, challenge, rpId, userId = null) {
  const id = newId();
  const now = Date.now();
  await DB.batch([
    DB.prepare(`DELETE FROM challenges WHERE expires_at < ?`).bind(now),
    DB.prepare(`INSERT INTO challenges (id, user_id, kind, challenge, rp_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, userId, kind, challenge, rpId, now + CHALLENGE_MS),
  ]);
  return id;
}

async function takeChallenge(DB, id, kind) {
  const row = await DB.prepare(`SELECT * FROM challenges WHERE id = ? AND kind = ?`).bind(String(id ?? ""), kind).first();
  if (!row) throw new HttpError(400, "Pedido expirado. Tente de novo.");
  await DB.prepare(`DELETE FROM challenges WHERE id = ?`).bind(row.id).run();
  if (row.expires_at < Date.now()) throw new HttpError(400, "Pedido expirado. Tente de novo.");
  return row;
}

/* ---------------- rotas ---------------- */

async function body(req) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") throw new HttpError(400, "Pedido inválido.");
  return b;
}

async function userCount(DB) {
  return (await DB.prepare(`SELECT COUNT(*) AS n FROM users`).first()).n;
}

async function insertUser(DB, name, role, password) {
  const login = loginOf(name);
  if (await DB.prepare(`SELECT 1 FROM users WHERE login = ?`).bind(login).first()) throw new HttpError(409, "Já existe uma conta com esse nome.");
  if ((await userCount(DB)) >= MAX_USERS) throw new HttpError(400, "Limite de contas atingido.");
  const p = await hashPassword(checkPassword(password));
  const now = Date.now();
  const user = { id: newId(), name, login, role };
  await DB.prepare(`INSERT INTO users (id, name, login, role, pass_hash, pass_salt, pass_iter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(user.id, name, login, role, p.hash, p.salt, p.iter, now, now)
    .run();
  return user;
}

async function setPassword(DB, userId, password, keepLoginId = null) {
  const p = await hashPassword(checkPassword(password));
  await DB.batch([
    DB.prepare(`UPDATE users SET pass_hash = ?, pass_salt = ?, pass_iter = ?, updated_at = ? WHERE id = ?`).bind(p.hash, p.salt, p.iter, Date.now(), userId),
    // trocou a senha → desconecta os outros aparelhos (as passkeys continuam valendo)
    DB.prepare(`DELETE FROM logins WHERE user_id = ? AND id IS NOT ?`).bind(userId, keepLoginId),
  ]);
}

function setupCodeOk(env, code) {
  return !!env.PULSO_SETUP && typeof code === "string" && sameString(code.trim(), env.PULSO_SETUP);
}

const loggedIn = (user, cookie, extra = {}) => json({ user: publicUser(user), ...extra }, 200, { "set-cookie": cookie });

export async function handleAuth(req, env, url) {
  const DB = await database(env);
  const path = url.pathname.replace(/^\/api\/auth\/?/, "");
  const method = req.method;
  const ip = clientIp(req);

  if (method === "GET" && path === "me") {
    const a = await authenticate(req, env);
    const hasUsers = (await userCount(DB)) > 0;
    // Fase 6: endereço novo já em uso → quem está no antigo recebe o aviso de mudança
    const moved = env.KV ? await env.KV.get("moved").catch(() => null) : null;
    const newOrigin = moved && moved !== url.origin ? moved : undefined;
    const res = json({ user: a ? publicUser(a.user) : null, hasUsers, setupConfigured: !!env.PULSO_SETUP, newOrigin }, 200, a?.setCookie ? { "set-cookie": a.setCookie } : {});
    return res;
  }

  // 1ª conta: só com o código de instalação
  if (method === "POST" && path === "setup") {
    const b = await body(req);
    if (!env.PULSO_SETUP) throw new HttpError(500, "O código de instalação (PULSO_SETUP) ainda não foi criado no Cloudflare. Veja docs/PASSO-A-PASSO.md.");
    await assertNotLocked(DB, `code:${ip}`, 5);
    if ((await userCount(DB)) > 0) throw new HttpError(409, "A conta principal já existe. Use Entrar.");
    if (!setupCodeOk(env, b.code)) {
      await fail(DB, `code:${ip}`);
      throw new HttpError(403, "Código de instalação incorreto.");
    }
    const user = await insertUser(DB, cleanName(b.name), "admin", b.password);
    return loggedIn(user, await createLogin(DB, user, b.device, "password"));
  }

  if (method === "POST" && path === "login") {
    const b = await body(req);
    const login = loginOf(b.name);
    await assertNotLocked(DB, `ip:${ip}`, 20);
    await assertNotLocked(DB, `pw:${login}`, 5);
    const user = login ? await DB.prepare(`SELECT * FROM users WHERE login = ?`).bind(login).first() : null;
    // calcula o hash mesmo sem usuário: o tempo de resposta não revela quais nomes existem
    const p = await hashPassword(String(b.password ?? ""), user?.pass_salt, user?.pass_iter);
    if (!user || !sameString(p.hash, user.pass_hash)) {
      await Promise.all([fail(DB, `ip:${ip}`), fail(DB, `pw:${login}`)]);
      throw new HttpError(401, "Nome ou senha incorretos.");
    }
    await clearAttempts(DB, `pw:${login}`);
    return loggedIn(user, await createLogin(DB, user, b.device, "password"));
  }

  if (method === "POST" && path === "logout") {
    const a = await authenticate(req, env);
    if (a) await DB.prepare(`DELETE FROM logins WHERE id = ?`).bind(a.loginId).run();
    return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0) });
  }

  // convite (Marina) ou redefinição de senha — só o admin gera
  if (method === "POST" && path === "invite") {
    const { user } = await requireUser(req, env);
    if (user.role !== "admin") throw new HttpError(403, "Só a conta principal gera convites.");
    const b = await body(req);
    const kind = b.kind === "reset" ? "reset" : "join";
    let target = null;
    if (kind === "reset") {
      target = await DB.prepare(`SELECT id, name FROM users WHERE id = ?`).bind(String(b.userId ?? "")).first();
      if (!target) throw new HttpError(404, "Conta não encontrada.");
    }
    const code = inviteCode();
    const now = Date.now();
    await DB.batch([
      DB.prepare(`DELETE FROM invites WHERE expires_at < ?`).bind(now),
      DB.prepare(`INSERT INTO invites (code_hash, kind, user_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(await sha256(code), kind, target?.id ?? null, user.id, now, now + INVITE_HOURS * 3600_000),
    ]);
    return json({ code, kind, name: target?.name, expiresAt: now + INVITE_HOURS * 3600_000 });
  }

  // "Entrar com o celular": o aparelho conectado gera um código curto (10 min, uso único) para a mesma pessoa
  if (method === "POST" && path === "device-code") {
    const { user } = await requireUser(req, env);
    const code = inviteCode(6);
    const now = Date.now();
    await DB.batch([
      DB.prepare(`DELETE FROM invites WHERE expires_at < ? OR (kind = 'link' AND user_id = ? AND used_at IS NULL)`).bind(now, user.id),
      DB.prepare(`INSERT INTO invites (code_hash, kind, user_id, created_by, created_at, expires_at) VALUES (?, 'link', ?, ?, ?, ?)`)
        .bind(await sha256(code), user.id, user.id, now, now + DEVICE_CODE_MS),
    ]);
    return json({ code, expiresAt: now + DEVICE_CODE_MS });
  }

  if (method === "POST" && path === "device-login") {
    const b = await body(req);
    await assertNotLocked(DB, `code:${ip}`, 5);
    const code = String(b.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const inv = code ? await DB.prepare(`SELECT * FROM invites WHERE code_hash = ? AND kind = 'link' AND used_at IS NULL AND expires_at > ?`).bind(await sha256(code), Date.now()).first() : null;
    const user = inv ? await DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(inv.user_id).first() : null;
    if (!inv || !user) {
      await fail(DB, `code:${ip}`);
      throw new HttpError(403, "Código inválido ou vencido. Gere outro no aparelho conectado.");
    }
    await DB.prepare(`UPDATE invites SET used_at = ? WHERE code_hash = ?`).bind(Date.now(), inv.code_hash).run();
    await clearAttempts(DB, `code:${ip}`);
    return loggedIn(user, await createLogin(DB, user, b.device, "code"));
  }

  if (method === "POST" && (path === "join" || path === "reset")) {
    const b = await body(req);
    await assertNotLocked(DB, `code:${ip}`, 5);
    const code = String(b.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const inv = code ? await DB.prepare(`SELECT * FROM invites WHERE code_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?`).bind(await sha256(code), path === "join" ? "join" : "reset", Date.now()).first() : null;
    let user;
    if (inv && path === "join") {
      user = await insertUser(DB, cleanName(b.name), "member", b.password);
    } else if (inv) {
      user = await DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(inv.user_id).first();
      if (!user) throw new HttpError(404, "Conta não encontrada.");
      await setPassword(DB, user.id, b.password);
    } else if (path === "reset" && setupCodeOk(env, b.code)) {
      // chave mestra: o código de instalação redefine a senha de qualquer conta (pelo nome)
      user = await DB.prepare(`SELECT * FROM users WHERE login = ?`).bind(loginOf(b.name)).first();
      if (!user) throw new HttpError(404, "Não achei conta com esse nome.");
      await setPassword(DB, user.id, b.password);
    } else {
      await fail(DB, `code:${ip}`);
      throw new HttpError(403, "Código inválido ou vencido.");
    }
    if (inv) await DB.prepare(`UPDATE invites SET used_at = ? WHERE code_hash = ?`).bind(Date.now(), inv.code_hash).run();
    await clearAttempts(DB, `code:${ip}`);
    return loggedIn(user, await createLogin(DB, user, b.device, "password"));
  }

  if (method === "POST" && path === "password") {
    const { user, loginId } = await requireUser(req, env);
    const b = await body(req);
    await assertNotLocked(DB, `pw:${user.login}`, 5);
    const p = await hashPassword(String(b.current ?? ""), user.pass_salt, user.pass_iter);
    if (!sameString(p.hash, user.pass_hash)) {
      await fail(DB, `pw:${user.login}`);
      throw new HttpError(401, "Senha atual incorreta.");
    }
    await setPassword(DB, user.id, b.password, loginId);
    return json({ ok: true });
  }

  if (method === "GET" && path === "devices") {
    const { user, loginId } = await requireUser(req, env);
    const logins = (await DB.prepare(`SELECT id, device, method, created_at, last_seen FROM logins WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC`).bind(user.id, Date.now()).all()).results;
    const passkeys = (await DB.prepare(`SELECT cred_id, label, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at`).bind(user.id).all()).results;
    return json({
      logins: logins.map((l) => ({ id: l.id, device: l.device, method: l.method, createdAt: l.created_at, lastSeen: l.last_seen, current: l.id === loginId })),
      passkeys: passkeys.map((p) => ({ id: p.cred_id, label: p.label, createdAt: p.created_at, lastUsedAt: p.last_used_at })),
    });
  }

  const del = path.match(/^(logins|passkeys)\/([\w-]{1,512})$/);
  if (method === "DELETE" && del) {
    const { user } = await requireUser(req, env);
    const sql = del[1] === "logins" ? `DELETE FROM logins WHERE id = ? AND user_id = ?` : `DELETE FROM passkeys WHERE cred_id = ? AND user_id = ?`;
    await DB.prepare(sql).bind(del[2], user.id).run();
    return json({ ok: true });
  }

  if (method === "GET" && path === "family") {
    const { user } = await requireUser(req, env);
    if (user.role !== "admin") throw new HttpError(403, "Só a conta principal vê a família.");
    const rows = (await DB.prepare(`SELECT id, name, role, created_at FROM users ORDER BY created_at`).all()).results;
    return json({ users: rows.map((r) => ({ id: r.id, name: r.name, role: r.role, createdAt: r.created_at })) });
  }

  /* ---- passkey: cadastrar (já logado) ---- */
  if (method === "POST" && path === "passkey/register/options") {
    const { user } = await requireUser(req, env);
    const b = await req.json().catch(() => ({}));
    const rpID = rpIdFor(url, env, b?.mode);
    const existing = (await DB.prepare(`SELECT cred_id, transports FROM passkeys WHERE user_id = ? AND rp_id = ?`).bind(user.id, rpID).all()).results;
    const options = await generateRegistrationOptions({
      rpName: "Pulse",
      rpID,
      userName: user.login,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({ id: c.cred_id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    const cid = await saveChallenge(DB, "reg", options.challenge, rpID, user.id);
    return json({ cid, options });
  }

  if (method === "POST" && path === "passkey/register/verify") {
    const { user } = await requireUser(req, env);
    const b = await body(req);
    const ch = await takeChallenge(DB, b.cid, "reg");
    if (ch.user_id !== user.id) throw new HttpError(403, "Pedido de outra conta.");
    let v;
    try {
      v = await verifyRegistrationResponse({ response: b.response, expectedChallenge: ch.challenge, expectedOrigin: url.origin, expectedRPID: ch.rp_id, requireUserVerification: true });
    } catch (e) {
      throw new HttpError(400, `Não consegui confirmar a passkey: ${e.message}`);
    }
    if (!v.verified || !v.registrationInfo) throw new HttpError(400, "Passkey não confirmada.");
    const c = v.registrationInfo.credential;
    await DB.prepare(`INSERT OR REPLACE INTO passkeys (cred_id, user_id, public_key, counter, transports, rp_id, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(c.id, user.id, b64url(c.publicKey), c.counter, JSON.stringify(c.transports ?? b.response?.response?.transports ?? []), ch.rp_id, cleanDevice(b.label), Date.now())
      .run();
    return json({ ok: true });
  }

  /* ---- passkey: entrar (sem nome nem senha: o aparelho mostra as contas salvas) ---- */
  if (method === "POST" && path === "passkey/login/options") {
    const b = await req.json().catch(() => ({}));
    const rpID = rpIdFor(url, env, b?.mode);
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: [] });
    const cid = await saveChallenge(DB, "auth", options.challenge, rpID);
    return json({ cid, options });
  }

  if (method === "POST" && path === "passkey/login/verify") {
    const b = await body(req);
    await assertNotLocked(DB, `ip:${ip}`, 20);
    const ch = await takeChallenge(DB, b.cid, "auth");
    const pk = await DB.prepare(`SELECT * FROM passkeys WHERE cred_id = ?`).bind(String(b.response?.id ?? "")).first();
    if (!pk || pk.rp_id !== ch.rp_id) {
      await fail(DB, `ip:${ip}`);
      throw new HttpError(401, "Esta passkey não está cadastrada (ou foi removida). Entre com a senha.");
    }
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response: b.response,
        expectedChallenge: ch.challenge,
        expectedOrigin: url.origin,
        expectedRPID: pk.rp_id,
        requireUserVerification: true,
        credential: { id: pk.cred_id, publicKey: fromB64url(pk.public_key), counter: pk.counter, transports: pk.transports ? JSON.parse(pk.transports) : undefined },
      });
    } catch (e) {
      await fail(DB, `ip:${ip}`);
      throw new HttpError(401, `Não consegui confirmar a digital: ${e.message}`);
    }
    if (!v.verified) throw new HttpError(401, "Digital não confirmada.");
    await DB.prepare(`UPDATE passkeys SET counter = ?, last_used_at = ? WHERE cred_id = ?`).bind(v.authenticationInfo.newCounter, Date.now(), pk.cred_id).run();
    const user = await DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(pk.user_id).first();
    if (!user) throw new HttpError(404, "Conta não encontrada.");
    return loggedIn(user, await createLogin(DB, user, b.device, "passkey"));
  }

  throw new HttpError(404, "Rota não encontrada.");
}

export { requireUser };
