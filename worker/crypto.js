// Utilitários de criptografia do Worker (WebCrypto, sem dependências).

const enc = new TextEncoder();

export function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export const randomToken = (n = 32) => b64url(randomBytes(n));

/** Id curto, ordenável pelo tempo. */
export const newId = () => Date.now().toString(36) + b64url(randomBytes(6)).replace(/[-_]/g, "x");

export async function sha256(text) {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

/**
 * Rodadas no servidor. Poucas de propósito: o que chega já é a chave derivada no aparelho
 * (PBKDF2 600 mil rodadas, src/account.ts) e o plano grátis dá ~10 ms de processamento por pedido.
 * Aqui entra o sal próprio de cada pessoa (um vazamento do banco não serve para outra conta/app).
 */
export const PBKDF2_ITER = 1_000;

export async function hashPassword(password, saltB64 = b64url(randomBytes(16)), iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64url(saltB64), iterations: iter }, key, 256);
  return { hash: b64url(bits), salt: saltB64, iter };
}

/** Comparação em tempo constante (não vaza, pelo tempo de resposta, quantos caracteres batem). */
export function sameString(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Código de convite fácil de ditar: 8 letras/dígitos sem os confusos (0/O, 1/I/L). */
export function inviteCode(len = 8) {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(len), (b) => abc[b % abc.length]).join("");
}
