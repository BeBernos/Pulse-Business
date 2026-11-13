import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

/**
 * Conta no aparelho (worker/auth.js). O login fica num cookie que o app não lê; aqui guardamos só
 * quem é a pessoa (para abrir o banco dela offline) e qual banco local é de quem.
 */

export interface Account {
  id: string;
  name: string;
  role: "admin" | "member";
}

const K_ACCOUNT = "pulso.account";
const K_DBS = "pulso.dbs";
const K_ACTIVATED = "pulso.activated";
/** "host" quando o navegador recusou o domínio-pai e a passkey foi cadastrada no endereço exato. */
const K_RP = "pulso.rp";
/** Banco do aparelho antes de ativar o Pulse (dados migrados do app antigo). */
export const LOCAL_DB = "pulso-local";

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

export const currentAccount = (): Account | null => read<Account | null>(K_ACCOUNT, null);
export const wasActivated = (): boolean => read<boolean>(K_ACTIVATED, false);

/** Banco local de cada pessoa neste aparelho. */
export function dbNameFor(userId: string): string | undefined {
  return read<Record<string, string>>(K_DBS, {})[userId];
}

/** Liga a pessoa a um banco local (o "pulso-local" migrado, ou um novo "pulso-<id>"). */
export function bindAccount(account: Account, dbName: string): void {
  write(K_DBS, { ...read<Record<string, string>>(K_DBS, {}), [account.id]: dbName });
  write(K_ACCOUNT, account);
  write(K_ACTIVATED, true);
}

/** O banco "pulso-local" já tem dono? */
export function localDbOwner(): string | null {
  const map = read<Record<string, string>>(K_DBS, {});
  return Object.keys(map).find((id) => map[id] === LOCAL_DB) ?? null;
}

export function forgetAccount(opts: { unbindDb?: boolean } = {}): void {
  const a = currentAccount();
  if (a && opts.unbindDb) {
    const map = read<Record<string, string>>(K_DBS, {});
    delete map[a.id];
    write(K_DBS, map);
  }
  write(K_ACCOUNT, null);
}

/** Nome do aparelho para a lista de "aparelhos conectados". */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Aparelho";
  const model = ua.match(/Android [\d.]+; ([^;)]+)/)?.[1]?.trim();
  const browser = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [model && model !== "K" ? model : os, browser].filter(Boolean).join(" · ");
}

/* ---------------- chamadas ao servidor ---------------- */

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function api<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`./api/auth/${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthError("Sem conexão com o servidor. Confira a internet e tente de novo.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError(data.error || `Servidor respondeu ${res.status}.`, res.status);
  return data as T;
}

export interface ServerState {
  user: Account | null;
  hasUsers: boolean;
  setupConfigured: boolean;
  /** Fase 6: o Pulse mudou de endereço (o novo já está em uso) */
  newOrigin?: string;
}

const K_NEW_ORIGIN = "pulso.newOrigin";
/** Endereço novo do Pulse, se este aparelho está no antigo (vem do servidor em /me). */
export const newOrigin = (): string | null => {
  try {
    const v = localStorage.getItem(K_NEW_ORIGIN);
    return v && v !== location.origin ? v : null;
  } catch {
    return null;
  }
};
export function rememberNewOrigin(v: string | undefined) {
  try {
    if (v) localStorage.setItem(K_NEW_ORIGIN, v);
    else localStorage.removeItem(K_NEW_ORIGIN);
  } catch {
    /* sem armazenamento: o aviso só não aparece */
  }
}

export const fetchMe = () => api<ServerState>("me");

type LoggedIn = { user: Account };
const device = () => deviceLabel();

export const MIN_PASSWORD = 8;
/** Recomendação atual da OWASP para PBKDF2-SHA256. */
export const PREHASH_ITER = 600_000;

/**
 * A senha nunca sai do aparelho: vai a chave derivada dela (PBKDF2, 600 mil rodadas, feito aqui).
 * O servidor ainda aplica o próprio hash com sal por pessoa (worker/auth.js). O trabalho pesado fica
 * no celular, porque o plano grátis do Cloudflare dá ~10 ms de processamento por pedido.
 */
export async function prehash(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("pulso/senha/v1"), iterations: PREHASH_ITER }, key, 256);
  let s = "";
  for (const b of new Uint8Array(bits)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Senha nova: confere o tamanho aqui (o servidor só vê a chave derivada). */
async function newPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD) throw new AuthError(`A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.`, 400);
  return prehash(password);
}

export const setupAccount = async (code: string, name: string, password: string) => api<LoggedIn>("setup", { code, name, password: await newPassword(password), device: device() });
export const loginWithPassword = async (name: string, password: string) => api<LoggedIn>("login", { name, password: await prehash(password), device: device() });
export const joinWithInvite = async (code: string, name: string, password: string) => api<LoggedIn>("join", { code, name, password: await newPassword(password), device: device() });
export const resetPassword = async (code: string, password: string, name?: string) => api<LoggedIn>("reset", { code, name, password: await newPassword(password), device: device() });
export const logoutServer = () => api<{ ok: true }>("logout", {});
export const changePassword = async (current: string, password: string) => api<{ ok: true }>("password", { current: await prehash(current), password: await newPassword(password) });
/** "Entrar com o celular": o aparelho conectado gera o código; o novo entra com ele (sem senha, 10 min, uso único). */
export const createDeviceCode = () => api<{ code: string; expiresAt: number }>("device-code", {});
export const loginWithDeviceCode = (code: string) => api<LoggedIn>("device-login", { code, device: device() });
export const createInvite = (kind: "join" | "reset", userId?: string) => api<{ code: string; expiresAt: number; name?: string }>("invite", { kind, userId });
export const familyList = () => api<{ users: (Account & { createdAt: number })[] }>("family");

export interface Devices {
  logins: { id: string; device: string; method: string; createdAt: number; lastSeen: number; current: boolean }[];
  passkeys: { id: string; label: string; createdAt: number; lastUsedAt: number | null }[];
}
export const listDevices = () => api<Devices>("devices");
export const revokeLogin = (id: string) => api<{ ok: true }>(`logins/${encodeURIComponent(id)}`, undefined, "DELETE");
export const removePasskey = (id: string) => api<{ ok: true }>(`passkeys/${encodeURIComponent(id)}`, undefined, "DELETE");

/* ---------------- passkey (digital/rosto) ---------------- */

/** Este aparelho já tem a digital cadastrada para a pessoa atual? (entrar com ela também conta) */
export function hasLocalPasskey(): boolean {
  const a = currentAccount();
  return !!a && localStorage.getItem(`pulso.passkey.${a.id}`) === "1";
}

export function passkeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

const cancelled = (e: unknown) => (e as Error)?.name === "NotAllowedError" || (e as Error)?.name === "AbortError";

/** Erro do navegador → frase para a pessoa. */
function passkeyMessage(e: unknown): string {
  const name = (e as Error)?.name;
  if (cancelled(e)) return "Cancelado (ou o tempo acabou). Tente de novo.";
  if (name === "InvalidStateError") return "Este aparelho já tem uma passkey cadastrada para você.";
  return (e as Error)?.message || "Não consegui usar a digital neste aparelho.";
}

/**
 * Cadastra a passkey deste aparelho. Tenta primeiro no domínio-pai (vale também no endereço novo,
 * quando mudar); se o navegador recusar (SecurityError), cadastra no endereço exato.
 */
export async function registerPasskey(label = deviceLabel()): Promise<void> {
  for (const mode of ["parent", "host"] as const) {
    write(K_RP, mode);
    const { cid, options } = await api<{ cid: string; options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("passkey/register/options", { mode });
    try {
      const response = await startRegistration({ optionsJSON: options });
      await api("passkey/register/verify", { cid, response, label });
      const a = currentAccount();
      if (a) localStorage.setItem(`pulso.passkey.${a.id}`, "1");
      return;
    } catch (e) {
      if ((e as Error)?.name === "SecurityError" && mode === "parent") continue;
      if (e instanceof AuthError) throw e;
      throw new AuthError(passkeyMessage(e), 0);
    }
  }
}

/** Entra com a digital (sem digitar nada: o aparelho mostra as contas salvas). */
export async function loginWithPasskey(): Promise<LoggedIn> {
  const modes = read<string>(K_RP, "parent") === "host" ? (["host", "parent"] as const) : (["parent", "host"] as const);
  for (const [i, mode] of modes.entries()) {
    const last = i === modes.length - 1;
    const { cid, options } = await api<{ cid: string; options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("passkey/login/options", { mode });
    try {
      const response = await startAuthentication({ optionsJSON: options });
      const r = await api<LoggedIn>("passkey/login/verify", { cid, response, device: device() });
      localStorage.setItem(`pulso.passkey.${r.user.id}`, "1");
      return r;
    } catch (e) {
      if ((e as Error)?.name === "SecurityError" && !last) continue;
      // passkey cadastrada no outro endereço (plano B): tenta lá
      if (e instanceof AuthError && e.status === 401 && !last) continue;
      if (e instanceof AuthError) throw e;
      throw new AuthError(passkeyMessage(e), 0);
    }
  }
  throw new AuthError("Não achei passkey para este endereço. Entre com a senha.", 401);
}
