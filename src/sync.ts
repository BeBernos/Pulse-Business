import { lang, setLang, type Lang } from "./i18n";
import { db, differsFromLibrary, LOCAL_SETTINGS, onLocalChange, plain, remoteWrite, SYNCED_TABLES, type Exercise, type SyncedTable } from "./db";

/**
 * Sincronização com o servidor (worker/sync.js): manda o que está marcado "falta enviar" (`_d = 1`)
 * e as lápides, recebe o que mudou nos outros aparelhos desde o último `seq`.
 * Em cada registro vence o maior `u` (empate → maior JSON), a mesma regra do servidor.
 */

export interface Change {
  t: SyncedTable;
  k: string;
  u: number;
  v: Record<string, unknown> | null;
}

export type SyncStatus = "off" | "idle" | "syncing" | "offline" | "error" | "auth";

export interface SyncInfo {
  status: SyncStatus;
  lastAt: number | null;
  error?: string;
  /** Diferença do relógio do aparelho para o do servidor (ms), quando grande. */
  skewMs?: number;
}

const BATCH = 500;
const DEBOUNCE_MS = 3000;
const EVERY_MS = 5 * 60_000;

/** `owner`: de quem é o banco aberto — o servidor recusa se o login for de outra pessoa. */
const cfg = { base: "./api/sync", fetch: (...a: Parameters<typeof fetch>) => fetch(...a), device: "Aparelho", owner: undefined as string | undefined };

/** Testes e o app ajustam endereço/fetch/nome do aparelho. */
export function configureSync(c: Partial<typeof cfg>): void {
  Object.assign(cfg, c);
}

/* ---------------- estado (para a tela) ---------------- */

let info: SyncInfo = { status: "off", lastAt: null };
const listeners = new Set<() => void>();

export function syncInfo(): SyncInfo {
  return info;
}

export function subscribeSync(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setInfo(patch: Partial<SyncInfo>): void {
  info = { ...info, ...patch };
  listeners.forEach((fn) => fn());
}

/* ---------------- montar o envio / aplicar o que chegou ---------------- */

const keyOf = (t: SyncedTable, row: Record<string, unknown>): string => {
  const pk = db.table(t).schema.primKey.keyPath as string;
  return String(row[pk]);
};

/** Até `limit` mudanças pendentes (registros marcados + lápides). */
export async function collect(limit = BATCH): Promise<Change[]> {
  const out: Change[] = [];
  for (const t of SYNCED_TABLES) {
    if (out.length >= limit) break;
    const rows = (await db.table(t).where("_d").equals(1).limit(limit - out.length).toArray()) as Record<string, unknown>[];
    for (const r of rows) {
      if (t === "settings" && LOCAL_SETTINGS.has(String(r.key))) continue;
      out.push({ t, k: keyOf(t, r), u: Number(r.u), v: plain(r) });
    }
  }
  if (out.length < limit) {
    const tombs = await db.tombs.where("_d").equals(1).limit(limit - out.length).toArray();
    for (const tb of tombs) out.push({ t: tb.t, k: tb.k, u: tb.u, v: null });
  }
  return out;
}

/** Quantas mudanças deste aparelho ainda não chegaram ao servidor. */
export async function pendingCount(): Promise<number> {
  let n = await db.tombs.where("_d").equals(1).count();
  for (const t of SYNCED_TABLES) {
    n += t === "settings"
      ? (await db.settings.where("_d").equals(1).toArray()).filter((r) => !LOCAL_SETTINGS.has(r.key)).length
      : await db.table(t).where("_d").equals(1).count();
  }
  return n;
}

const json = (v: unknown) => (v == null ? "" : JSON.stringify(v));

/** a vence b? (mesma regra de worker/sync.js) */
export function remoteWins(remote: { u: number; v: unknown }, local: { u: number; v: unknown } | null): boolean {
  if (!local) return true;
  return remote.u > local.u || (remote.u === local.u && json(remote.v) > json(local.v));
}

/** Grava o que veio do servidor quando é mais novo que o que está aqui. Devolve quantos mudaram. */
export async function applyRemote(changes: Change[]): Promise<number> {
  const valid = changes.filter((c) => (SYNCED_TABLES as readonly string[]).includes(c.t) && !(c.t === "settings" && LOCAL_SETTINGS.has(c.k)));
  if (!valid.length) return 0;
  let applied = 0;
  await remoteWrite(db, [...SYNCED_TABLES, "tombs"], async () => {
    const tombs = await db.tombs.bulkGet(valid.map((c) => `${c.t}|${c.k}`));
    const byTable = new Map<SyncedTable, number[]>();
    valid.forEach((c, i) => byTable.set(c.t, [...(byTable.get(c.t) ?? []), i]));
    const rows: (Record<string, unknown> | undefined)[] = [];
    for (const [t, idx] of byTable) {
      const got = await db.table(t).bulkGet(idx.map((i) => valid[i].k));
      idx.forEach((i, j) => (rows[i] = got[j]));
    }
    const puts = new Map<SyncedTable, Record<string, unknown>[]>();
    const dels = new Map<SyncedTable, string[]>();
    const tombDels: string[] = [];
    valid.forEach((c, i) => {
      const row = rows[i];
      const tomb = tombs[i];
      const local = row ? { u: Number(row.u ?? 0), v: plain(row) } : tomb ? { u: tomb.u, v: null } : null;
      if (!remoteWins(c, local)) return;
      if (c.v === null) {
        if (row) dels.set(c.t, [...(dels.get(c.t) ?? []), c.k]);
      } else puts.set(c.t, [...(puts.get(c.t) ?? []), { ...c.v, u: c.u, _d: 0 }]);
      if (tomb) tombDels.push(tomb.key);
      applied++;
    });
    for (const [t, list] of dels) await db.table(t).bulkDelete(list);
    for (const [t, list] of puts) await db.table(t).bulkPut(list);
    if (tombDels.length) await db.tombs.bulkDelete(tombDels);
  });
  // idioma escolhido em outro aparelho (ex.: primeira sincronização de um aparelho novo): troca a interface
  const l = (await db.settings.get("lang"))?.value;
  if ((l === "pt" || l === "en") && l !== lang()) applyLang(l);
  return applied;
}

/** Grava o idioma no aparelho (vale já na tela de entrar) e recarrega para as telas trocarem de língua. */
export function applyLang(l: Lang): void {
  setLang(l);
  try {
    localStorage.setItem("pulso.lang", l);
  } catch {
    /* sem armazenamento */
  }
  if (typeof location !== "undefined" && typeof document !== "undefined") location.reload();
}

/** Depois do envio aceito: tira a marca "falta enviar" do que não mudou de novo nesse meio-tempo. */
async function markSent(sent: Change[]): Promise<void> {
  if (!sent.length) return;
  await remoteWrite(db, [...SYNCED_TABLES, "tombs"], async () => {
    const gone = sent.filter((c) => c.v === null);
    const tombs = await db.tombs.bulkGet(gone.map((c) => `${c.t}|${c.k}`));
    await db.tombs.bulkDelete(tombs.filter((tb, i) => tb && tb.u === gone[i].u).map((tb) => tb!.key));
    for (const t of SYNCED_TABLES) {
      const list = sent.filter((c) => c.t === t && c.v !== null);
      if (!list.length) continue;
      const rows = (await db.table(t).bulkGet(list.map((c) => c.k))) as (Record<string, unknown> | undefined)[];
      const done = rows.filter((r, i) => r && r.u === list[i].u && r._d === 1).map((r) => ({ ...r, _d: 0 }));
      if (done.length) await db.table(t).bulkPut(done);
    }
  });
}

/* ---------------- conversa com o servidor ---------------- */

export class SyncError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function post(body: unknown): Promise<{ seq: number; now: number; more: boolean; changes: Change[] }> {
  const res = await cfg.fetch(cfg.base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SyncError(data.error || `Servidor respondeu ${res.status}.`, res.status);
  return data;
}

async function getMeta<T>(key: string, fallback: T): Promise<T> {
  return ((await db.meta.get(key))?.value as T) ?? fallback;
}

let running: Promise<{ pushed: number; pulled: number }> | null = null;
let again = false;

/** Sincroniza agora (envia tudo e puxa tudo, em lotes). Chamadas simultâneas esperam a mesma rodada. */
export function syncNow(): Promise<{ pushed: number; pulled: number }> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let pushed = 0;
    let pulled = 0;
    setInfo({ status: "syncing", error: undefined });
    try {
      let since = await getMeta<number>("syncSeq", 0);
      for (let round = 0; round < 1000; round++) {
        const changes = await collect();
        const r = await post({ since, device: cfg.device, owner: cfg.owner, changes });
        pulled += await applyRemote(r.changes);
        await markSent(changes);
        pushed += changes.length;
        since = r.seq;
        await db.meta.put({ key: "syncSeq", value: since });
        const skew = Math.abs(Date.now() - r.now);
        setInfo({ skewMs: skew > 2 * 60_000 ? Date.now() - r.now : undefined });
        if (!r.more && changes.length < BATCH) break;
      }
      const lastAt = Date.now();
      await db.meta.put({ key: "syncLastAt", value: lastAt });
      setInfo({ status: "idle", lastAt });
      if (pulled) afterRemoteChanges();
      return { pushed, pulled };
    } catch (e) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const status: SyncStatus = e instanceof SyncError && (e.status === 401 || e.status === 409) ? "auth" : offline || !(e instanceof SyncError) ? "offline" : "error";
      setInfo({ status, error: (e as Error).message });
      throw e;
    } finally {
      running = null;
      if (again) {
        again = false;
        schedule(500);
      }
    }
  })();
  return running;
}

/** Dados de outro aparelho mudaram o calendário: reagenda os lembretes. */
function afterRemoteChanges(): void {
  import("./push").then((m) => m.syncReminders()).catch(() => undefined);
}

/* ---------------- quando sincronizar ---------------- */

let timer: ReturnType<typeof setTimeout> | null = null;
let interval: ReturnType<typeof setInterval> | null = null;

function schedule(ms = DEBOUNCE_MS): void {
  if (info.status === "off" || info.status === "auth") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncNow().catch(() => undefined);
  }, ms);
}

const onOnline = () => schedule(500);
const onVisibility = () => {
  // ao sair do app manda logo o que falta; ao voltar, puxa as novidades
  schedule(document.visibilityState === "hidden" ? 0 : 500);
};

/** Liga a sincronização automática: ao abrir, ao voltar a internet, 3 s depois de mudar algo, a cada 5 min. */
export async function startSync(device: string, owner: string): Promise<void> {
  cfg.device = device;
  cfg.owner = owner;
  setInfo({ status: "idle", lastAt: await getMeta<number | null>("syncLastAt", null) });
  onLocalChange(() => schedule());
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  interval = setInterval(() => document.visibilityState === "visible" && schedule(0), EVERY_MS);
  schedule(0);
}

export function stopSync(): void {
  onLocalChange(null);
  if (timer) clearTimeout(timer);
  if (interval) clearInterval(interval);
  window.removeEventListener("online", onOnline);
  document.removeEventListener("visibilitychange", onVisibility);
  setInfo({ status: "off" });
}

/** O servidor não reconhece mais este login: para de tentar até a pessoa entrar de novo. */
export function markAuthNeeded(): void {
  setInfo({ status: "auth" });
}

/** Depois de entrar de novo (sessão tinha vencido): volta a sincronizar. */
export function resumeSync(): void {
  setInfo({ status: "idle", error: undefined });
  schedule(0);
}

/* ---------------- conferência (migração) ---------------- */

/** Quantos registros de cada tabela este aparelho tem para o servidor (mesma conta do /api/sync/stats). */
export async function localCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of SYNCED_TABLES) {
    let n: number;
    if (t === "exercises") n = (await db.exercises.toArray()).filter((e: Exercise) => differsFromLibrary(e) || (e as Exercise & { u?: number }).u).length;
    else if (t === "settings") n = (await db.settings.toArray()).filter((s) => !LOCAL_SETTINGS.has(s.key)).length;
    else n = await db.table(t).count();
    if (n) out[t] = n;
  }
  return out;
}

export async function serverCounts(): Promise<Record<string, number>> {
  const res = await cfg.fetch(`${cfg.base}/stats`, { credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SyncError(data.error || `Servidor respondeu ${res.status}.`, res.status);
  return data.counts;
}
