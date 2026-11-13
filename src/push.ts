import { db, getSettings, setSetting } from "./db";
import { isoDay } from "./lib/calendar";
import { buildReminderEvents } from "./lib/reminders";

/** Lembretes por Web Push: inscreve o aparelho e envia ao Worker a lista de avisos calculada aqui. */

function urlB64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`./api/push/${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Servidor respondeu ${res.status}. Os lembretes só funcionam no app publicado.`);
  return body as T;
}

async function subscription(create: boolean): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  const current = await reg.pushManager.getSubscription();
  if (current || !create) return current;
  const { publicKey } = await api<{ publicKey: string }>("key");
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(publicKey) });
}

/** Liga os lembretes: pede permissão, inscreve e sincroniza. */
export async function enableReminders(): Promise<number> {
  if (!pushSupported()) throw new Error("Este navegador não suporta notificações. Use o Chrome com o app instalado.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permissão de notificação negada. Libere nas configurações do Android → Apps → Chrome/Pulse → Notificações.");
  let s = await getSettings();
  if (!s.deviceId) {
    await setSetting("deviceId", `dev-${crypto.randomUUID()}`);
    s = await getSettings();
  }
  await setSetting("remindOn", true);
  return syncReminders(true);
}

export async function disableReminders(): Promise<void> {
  const s = await getSettings();
  await setSetting("remindOn", false);
  const sub = pushSupported() ? await subscription(false) : null;
  await sub?.unsubscribe().catch(() => undefined);
  if (s.deviceId) await api(s.deviceId, { method: "DELETE" }).catch(() => undefined);
}

/** Recalcula os avisos dos próximos 14 dias e envia ao servidor. Silencioso quando desligado. */
export async function syncReminders(create = false): Promise<number> {
  const s = await getSettings();
  if (!s.remindOn || !s.deviceId || !pushSupported() || Notification.permission !== "granted") return 0;
  const sub = await subscription(create);
  if (!sub) return 0;
  const plan = s.activePlanId ? (await db.plans.get(s.activePlanId))?.plan : undefined;
  const sessions = await db.sessions.where("status").equals("done").toArray();
  const skips = await db.skips.toArray();
  const weighed = new Set((await db.measures.where("type").equals("peso").toArray()).map((m) => m.date));
  const events = buildReminderEvents({
    plan,
    today: isoDay(),
    now: Date.now(),
    trained: new Set(sessions.map((x) => x.date)),
    skipped: new Set(skips.map((x) => x.date)),
    opts: { workout: s.remindWorkout, workoutTime: s.remindTime, forgot: s.remindForgot, forgotTime: s.remindForgotTime, backup: s.remindBackup, weigh: s.remindWeigh, weighDays: s.weighDays, weighTime: s.weighTime },
    weighed,
    lastBackupAt: s.lastBackupAt,
  });
  const r = await api<{ scheduled: number }>("register", { method: "POST", body: JSON.stringify({ id: s.deviceId, sub: sub.toJSON(), events }) });
  return r.scheduled;
}

export async function testReminder(): Promise<void> {
  const s = await getSettings();
  if (!s.deviceId) throw new Error("Ative os lembretes primeiro.");
  await api("test", { method: "POST", body: JSON.stringify({ id: s.deviceId }) });
}
