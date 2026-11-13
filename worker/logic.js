// Regras puras do servidor de lembretes (testadas em worker/logic.test.js).

export const MAX_DEVICES = 8;
export const MAX_EVENTS = 80;

/**
 * Valida o cadastro de um aparelho. O app manda a inscrição de push e a lista de avisos já calculada
 * (o servidor não conhece o plano de treino — só agenda o que recebe).
 * Retorna null se inválido.
 */
export function cleanRegistration(body, now = Date.now()) {
  if (!body || typeof body !== "object") return null;
  const id = typeof body.id === "string" && /^[\w-]{8,64}$/.test(body.id) ? body.id : null;
  const sub = body.sub;
  const validSub = sub && typeof sub.endpoint === "string" && /^https:\/\//.test(sub.endpoint) && sub.keys && typeof sub.keys.p256dh === "string" && typeof sub.keys.auth === "string";
  if (!id || !validSub) return null;
  const events = (Array.isArray(body.events) ? body.events : [])
    .filter((e) => e && Number.isFinite(e.at) && e.at > now - 60_000 && e.at < now + 31 * 86_400_000 && typeof e.title === "string")
    .map((e) => ({
      at: Math.round(e.at),
      title: String(e.title).slice(0, 80),
      body: String(e.body ?? "").slice(0, 160),
      tag: String(e.tag ?? "").replace(/[^\w-]/g, "").slice(0, 40) || undefined,
      url: typeof e.url === "string" && e.url.startsWith("#/") ? e.url.slice(0, 80) : "#/inicio",
    }))
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_EVENTS);
  return { id, sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, events, updated: now };
}

/** Avisos vencidos na janela (from, to] e os que sobram para depois. */
export function splitDue(events, from, to) {
  const due = [];
  const rest = [];
  for (const e of events) (e.at > from && e.at <= to ? due : e.at > to ? rest : []).push(e);
  return { due, rest };
}

/** Mantém no máximo MAX_DEVICES aparelhos (descarta os atualizados há mais tempo). */
export function capDevices(devices) {
  const list = Object.values(devices).sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0)).slice(0, MAX_DEVICES);
  return Object.fromEntries(list.map((d) => [d.id, d]));
}
